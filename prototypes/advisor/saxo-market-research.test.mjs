import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {readAppData} from './app-tools.mjs';
import {createVoiceClient} from './voice.mjs';
import {startPrototype} from './server.mjs';
import {diagnosticSummary} from './banking-context.mjs';

test('market failure diagnostics reach the advisor sanitized and without provider messages',()=>{
 assert.deepEqual(diagnosticSummary({source:'Saxo LIVE',diagnostics:[{operation:'history',status:403,providerCode:'NoAccess',message:'Account 123'},{operation:'quote',status:null,providerCode:null},{operation:'x y<script>',status:'1;2',providerCode:'A B'},{operation:'extra'}]}),
  ['history:403:NoAccess','quote:-:-','xyscript:12:AB']);
 assert.deepEqual(diagnosticSummary(undefined),[]);assert.deepEqual(diagnosticSummary({diagnostics:'bad'}),[]);
});

const snapshot={source:'Saxo LIVE',symbol:'MSFT:xnas',currency:'USD',range:'1mo',price:420,previousClose:418,
 quoteTime:'2026-09-28T14:00:00Z',retrievedAt:'2026-09-28T14:15:00Z',chartDelayMinutes:15,quoteDelayMinutes:15,
 stale:false,warning:null,bars:[{time:1790604000,open:418,high:422,low:416,close:419,volume:100}]};

test('market research ignores trading environment and carries Saxo evidence unchanged in both workspaces',async()=>{
 for(const mode of ['Demo','Live'])for(const environment of ['SIM','LIVE']){
  const calls=[];const request=async(s,m,p,b)=>{calls.push({s,m,p,b});return snapshot;};
  const result=await readAppData('session',mode,{resource:'market_chart',parameters:{symbol:'MSFT:xnas',range:'1m',environment}},
   {screen:{sections:{markets:{environment}}}},request);
  assert.deepEqual(result,snapshot);assert.deepEqual(calls,[{s:'session',m:mode,p:'/api/markets/chart?symbol=MSFT%3Axnas&range=1mo',b:undefined}]);
 }
});

test('no alternative feed, invalid lookup or private LIVE query can become a Demo market answer',async()=>{
 let calls=0;const request=async()=>{calls++;return {...snapshot,source:'Yahoo'};};
 await assert.rejects(readAppData('s','Demo',{resource:'market_chart',parameters:{symbol:'MSFT'}},{},request),/No alternative price source/);
 assert.equal(calls,1);
 for(const resource of ['saxo','saxo_orders','saxo_instruments','saxo_ticket','saxo_order_status'])
  await assert.rejects(readAppData('s','Demo',{resource,parameters:{environment:'LIVE',uic:123,q:'MSFT',ticketId:randomUUID()}},{},request));
 for(const q of ['', ' ', 'x'.repeat(81)])await assert.rejects(readAppData('s','Demo',{resource:'market_search',parameters:{q}},{},request));
 for(const symbol of ['',undefined,'../port/accounts','MSFT&AccountKey=private'])
  await assert.rejects(readAppData('s','Demo',{resource:'market_chart',parameters:{symbol}},{},request));
 assert.equal(calls,1);
});

test('routing, summary and speech contracts distinguish shared research from SIM order preparation',async()=>{
 const bodies=[];const client=createVoiceClient({apiKey:'synthetic',fetchImpl:async(url,options)=>{
  const body=JSON.parse(options.body);bodies.push(body);
  if(url.endsWith('/live/sessions'))return Response.json({session:{id:'test'},transport:{sdp:'answer'}});
  return Response.json(body.tools?{output:[{type:'function_call',name:'read_app_data',arguments:JSON.stringify({stageRequestedEdit:false,queries:[{resource:'market_chart',parametersJson:'{"symbol":"MSFT:xnas"}'}]})}]}:{output:[{content:[{type:'output_text',text:'Saxo data is delayed.'}]}]});
 }});
 await client.route({transcript:[{role:'user',text:'What is the price?'}],context:{demo:{mode:'Demo',screen:{sections:{markets:{environment:'SIM'}}}}}});
 assert.match(bodies[0].instructions,/market_search then market_chart/);
 assert.match(bodies[0].instructions,/never assume a LIVE research UIC is valid in SIM/);
 assert.match(bodies[0].instructions,/Only the card submits/);
 await client.summarizeGoals({transcript:[],context:{researchResults:[{resource:'market_chart',data:snapshot}]}});
 assert.deepEqual(JSON.parse(bodies[1].input).context.researchResults[0].data,snapshot);
 assert.match(bodies[1].instructions,/chartDelayMinutes and quoteDelayMinutes separately/);
 assert.match(bodies[1].instructions,/historyStatus and quoteStatus are independent/);
 assert.match(bodies[1].instructions,/do not claim a subscription is missing/);
 assert.match(bodies[1].instructions,/no private LIVE account, holding or order information/);
 await client.connect('v=0\r\n');assert.match(bodies[2].session.instructions,/never spoken approval alone/);
});

test('chat and delegated voice carry delayed, stale and unavailable market evidence without brokerage reads or writes',async()=>{
 const storageRoot=await mkdtemp(path.join(tmpdir(),'banking-market-research-'));
 let current=snapshot,readPaths=[],summaries=0;
 const request=async(s,m,p,b)=>{
  assert.equal(b,undefined);assert.ok(p.startsWith('/api/markets/'));readPaths.push(p);
  if(p.includes('/search?'))return [{symbol:'MSFT:xnas',name:'Microsoft',uic:123}];
  if(current instanceof Error)throw current;return current;
 };
 const query=(resource,parameters)=>({name:'read_app_data',args:{stageRequestedEdit:false,queries:[{resource,parametersJson:JSON.stringify(parameters)}]}});
 const server=await startPrototype({port:15642,renderPort:15643,storageRoot,aiConfigured:true,
  goalReader:async(s,mode)=>({source:'Banking',mode,goalContext:{goals:[]}}),
  appReader:(s,m,q,c)=>readAppData(s,m,q,c,request),
  orderPreparer:async()=>assert.fail('Research must not prepare orders'),orderSubmitter:async()=>assert.fail('Research must not submit orders'),
  voiceClient:{connect:async()=>({session:{id:'test'},transport:{sdp:'answer'}}),
   route:async({context})=>!context.researchResults?query('market_search',{q:'Microsoft'}):context.researchResults.length===1?
    query('market_chart',{symbol:'MSFT:xnas',range:'1mo'}):{name:'clarify',args:{question:''}},
   summarizeGoals:async({context})=>{summaries++;const result=context.researchResults.at(-1);
    if(current instanceof Error){assert.match(result.error,/SAXO_MARKET_SIGN_IN_REQUIRED/);assert.equal(result.data,undefined);}
    else assert.deepEqual(result.data,current);
    return current instanceof Error?'Saxo market data is unavailable.':current.stale?'Previously retrieved Saxo data is delayed.':current.price===null?'The Saxo quote is unavailable.':'Saxo market data is delayed.';
   }}
 });
 try{
  for(const mode of ['Demo','Live']){
   const bootstrap=await fetch(server.origin+'/api/workspace');
   const headers={Cookie:bootstrap.headers.get('set-cookie').split(';')[0],Origin:server.origin,'Content-Type':'application/json','X-Banking-Session':'market-'+mode,'X-Banking-Mode':mode};
   const post=(p,b)=>fetch(server.origin+'/api/'+p,{method:'POST',headers,body:JSON.stringify(b)});
   const voiceResponse=await post('voice/session',{sdp:'v=0\r\n'});assert.equal(voiceResponse.status,201);const voice=await voiceResponse.json();
   for(const data of [snapshot,{...snapshot,stale:true,warning:'Refresh failed.'},{...snapshot,price:null,quoteTime:null,warning:'SAXO_MARKET_DATA_NO_ACCESS'},
    {...snapshot,bars:[],historyStatus:'denied',quoteStatus:'available',historyRetrievedAt:null,warning:'SAXO_MARKET_HISTORY_NO_ACCESS',diagnostics:[{operation:'history',code:'SAXO_MARKET_DATA_NO_ACCESS',status:403,providerCode:'NoAccess',cooldown:false}]},
    {...snapshot,price:null,quoteTime:null,quoteStatus:'unavailable',historyStatus:'available',warning:'SAXO_MARKET_QUOTE_UNAVAILABLE',diagnostics:[{operation:'quote',code:'SAXO_MARKET_DATA_UNAVAILABLE',status:503,providerCode:null,cooldown:false}]},
    Object.assign(new Error('SAXO_MARKET_SIGN_IN_REQUIRED'),{status:503})]){
    current=data;
    for(const channel of ['chat','voice']){
     readPaths=[];const before=summaries;const prompt='How is Microsoft doing?';
     const response=await post(channel==='chat'?'advisor':'voice/delegate',channel==='chat'?{prompt,requestId:randomUUID(),screen:{sections:{markets:{environment:'SIM'}}}}:
      {id:voice.id,delegationId:randomUUID(),transcript:[{role:'user',text:prompt}],screen:{sections:{markets:{environment:'SIM'}}}});
     const reply=await response.json();assert.equal(response.status,200,JSON.stringify(reply));assert.equal(summaries,before+1);
     assert.equal(readPaths.length,2);assert.ok((channel==='chat'?reply.answer:reply.result.spokenAnswer).includes('Saxo'));
     assert.equal(channel==='chat'?reply.proposal:reply.action,channel==='chat'?undefined:null);
    }
   }
   await post('voice/end',{id:voice.id});
  }
 }finally{await server.close();await rm(storageRoot,{recursive:true,force:true});}
});
