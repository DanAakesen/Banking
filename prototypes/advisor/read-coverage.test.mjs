import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {startPrototype} from './server.mjs';
import {createVoiceClient,voiceTools} from './voice.mjs';
import {readAppData,resources} from './app-tools.mjs';

const id='00000000-0000-0000-0000-000000000001';
const period={from:'2026-09-01',to:'2026-09-30',currency:'DKK'};
const portfolio={status:'Partial',environment:'SIM',portfolio:{currency:'EUR',reliability:'Ok',cash:80,totalValue:110,hasMore:false,
 accounts:[{currency:'EUR',reliability:'Ok',invested:30,unbooked:0,available:75}],positions:[{quantity:2,price:null,openCosts:{commission:1.25},currency:'EUR'}]},
 orders:null,activity:[{status:'Filled',subStatus:'Confirmed',filled:2}],ordersError:'SAXO_READ_TIMEOUT',activityError:null,activityWindowDays:7,activityHasMore:true,ordersObservedAt:null};

test('registered model schema, text and voice hosts reach real read adapters without writes or LIVE leakage',async()=>{
 assert.deepEqual(voiceTools.find(t=>t.name==='read_app_data').parameters.properties.queries.items.properties.resource.enum,resources);
 const storageRoot=await mkdtemp(path.join(tmpdir(),'banking-coverage-'));
 const requests=[],schemas=[];
 const request=async(session,mode,url,body,method)=>{
  assert.equal(body,undefined);assert.ok(!method||method==='GET');
  requests.push({session,mode,url});
  if(url.includes('/advisor-context?'))return {source:'Banking',mode,accounts:[{currency:'DKK',availableBalance:{amount:100,currency:'DKK',observedAt:'2026-09-01'}}],statements:[{kind:'Pension',currency:'DKK',value:0}]};
  if(url.includes('/saxo/portfolio'))return {...portfolio,environment:mode==='Live'?'LIVE':'SIM'};
  if(url.includes('/saxo/status'))return {environment:'SIM',configured:false,reason:'ACCESS_REQUIRED'};
  if(url.includes('/saxo/orders'))return {orders:[],history:[],historyHasMore:false};
  if(url.includes('/markets/chart'))return {source:'Saxo LIVE',currency:'USD',chartDelayMinutes:null,quoteDelayMinutes:0,historyStatus:'stale',quoteStatus:'available',price:0,historyRetrievedAt:'2026-09-01T10:00:00Z',retrievedAt:'2026-09-01T10:00:02Z',bars:[]};
  if(url.includes('/journey'))return {currency:'DKK',fresh:false,transactions:[],shortfall:null,coverage:{complete:false}};
  if(url.includes('/budget-plans/'))return {...period,monthlyPlan:{expenses:300},actualExpenses:70,sufficientHistory:false};
  if(url.includes('/cash-flow'))return {points:[],currency:'DKK'};
  if(url.includes('/transactions?'))return {items:[],total:140,offset:100};
  if(url.includes('/wealth/overview'))return {records:[],visuals:null};
  return {source:'isolated-fixture',currency:'DKK',amount:null};
 };
 // Exercise createVoiceClient's actual registered tools and schema validation.
 // Only the provider HTTP response and authenticated API transport are fixtures.
 const voiceClient=createVoiceClient({apiKey:'isolated-fixture-only',fetchImpl:async(url,options)=>{
  const input=JSON.parse(options.body);
  if(url.endsWith('/live/sessions'))return Response.json({session:{id:'fixture'},transport:{sdp:'fixture-answer'}});
  if(!input.tools)return Response.json({output:[{content:[{type:'output_text',text:'Read completed.'}]}]});
  schemas.push(input.tools);
  const {transcript,context}=JSON.parse(input.input);
  const tool=context.readOnlyResearch?{name:'clarify',args:{question:''}}:{name:'read_app_data',args:{stageRequestedEdit:false,queries:JSON.parse(transcript.at(-1).text)}};
  return Response.json({output:[{type:'function_call',name:tool.name,arguments:JSON.stringify(tool.args)}]});
 }});
 const server=await startPrototype({port:15940,renderPort:15941,storageRoot,aiConfigured:true,voiceClient,
  goalReader:async(_session,mode)=>({source:'Banking',mode,...period,goalContext:{goals:[]}}),
  appReader:(session,mode,query,context)=>readAppData(session,mode,query,context,request),
  appWriter:()=>assert.fail('Read routed to a write'),orderSubmitter:()=>assert.fail('Read submitted an order')});
 try{
  const boot=await fetch(server.origin+'/api/workspace'),cookie=boot.headers.get('set-cookie').split(';')[0];
  const post=(route,body,mode='Demo')=>fetch(server.origin+'/api/'+route,{method:'POST',headers:{Cookie:cookie,Origin:server.origin,'Content-Type':'application/json','X-Banking-Session':mode==='Demo'?'demo-session':'owner-session','X-Banking-Mode':mode},body:JSON.stringify(body)});
  const voice=await(await post('voice/session',{sdp:'v=0\r\n'})).json();
  const cases=[
   ['saxo_portfolio',{environment:'SIM'},'/api/investments/saxo/portfolio?environment=SIM'],
   ['saxo_status',{},'/api/investments/saxo/status?environment=SIM'],
   ['saxo_orders',{},'/api/investments/saxo/orders?environment=SIM'],
   ['goal_journey',{id},`/api/goals/${id}/journey`],
   ['budget_progress',{id,month:'2026-08-01'},`/api/budget-plans/${id}/progress?month=2026-08-01`],
   ['budget_forecast',{id,month:'2026-08-01'},`/api/budget-plans/${id}/progress?month=2026-08-01`],
   ['transactions',{...period,offset:100,limit:100,status:'PDNG'},'/api/transactions?from=2026-09-01&to=2026-09-30&currency=DKK&offset=100&limit=100&status=PDNG'],
   ['balance_history',{accountId:id,...period},`/api/accounts/${id}/balance-history?from=2026-09-01&to=2026-09-30&currency=DKK&accountId=${id}`],
   ['account_insights',period,'/api/account-insights?from=2026-09-01&to=2026-09-30&currency=DKK'],
   ['overview_wealth',period,'/api/advisor-context?from=2026-09-01&to=2026-09-30&currency=DKK'],
   ['wealth',{},'/api/wealth'],['wealth_history',period,'/api/wealth/overview?currency=DKK'],
   ['categories',{},'/api/categories'],['rules',{},'/api/rules'],
   ['market_chart',{symbol:'MSFT:xnas',range:'1d'},'/api/markets/chart?symbol=MSFT%3Axnas&range=1d']
  ];
  for(const channel of ['text','voice'])for(const [resource,parameters,expected] of cases){
   const queries=[{resource,parametersJson:JSON.stringify(parameters)}],prompt=JSON.stringify(queries),before=requests.length;
   const res=await post(channel==='text'?'advisor':'voice/delegate',channel==='text'?{prompt,requestId:randomUUID()}:{id:voice.id,delegationId:randomUUID(),transcript:[{role:'user',text:prompt}]});
   const result=await res.json();assert.equal(res.status,200,JSON.stringify(result));
   assert.equal(requests[before].url,expected);assert.equal(requests[before].session,'demo-session');assert.equal(requests[before].mode,'Demo');
   const data=result.result.researchResults[0].data;
   if(resource==='saxo_portfolio'){assert.equal(data.summary.reconciled,true);assert.equal(data.summary.pnl,null);assert.equal(data.portfolio.positions[0].openCosts.commission,1.25);assert.equal(data.orders,null);assert.equal(data.activityHasMore,true);}
   if(resource==='overview_wealth'){assert.equal(data.model.total,100);assert.deepEqual(data.model.values,[100,null,0]);assert.equal(data.model.partial,true);}
   if(resource==='market_chart'){assert.equal(data.chartDelayMinutes,null);assert.equal(data.quoteDelayMinutes,0);assert.equal(data.historyStatus,'stale');assert.notEqual(data.retrievedAt,data.historyRetrievedAt);}
  }
  for(const resource of ['saxo','saxo_portfolio','saxo_orders','saxo_status']){
   const before=requests.length;
   const prompt=JSON.stringify([{resource,parametersJson:'{"environment":"LIVE"}'}]);
   const res=await post('advisor',{prompt,requestId:randomUUID(),screen:{mode:'Live',owner:true,sections:{markets:{environment:'LIVE'}}}});
   const result=await res.json();assert.equal(res.status,200);assert.match(result.result.researchResults[0].error,/owner workspace/);assert.equal(requests.length,before);
  }
  const prompt=JSON.stringify([{resource:'saxo_portfolio',parametersJson:'{"environment":"LIVE"}'}]);
  const owner=await(await post('advisor',{prompt,requestId:randomUUID()},'Live')).json();
  assert.equal(owner.result.researchResults[0].data.environment,'LIVE');assert.equal(requests.at(-1).session,'owner-session');
  assert.ok(schemas.length>cases.length);
 }finally{await server.close();await rm(storageRoot,{recursive:true,force:true});}
});

test('read adapter rejects path injection, unbounded pages and unsupported status before API calls',async()=>{
 const request=()=>assert.fail('Invalid input reached the transport');
 for(const [resource,parameters] of [['goal_journey',{id:'../owner'}],['transactions',{...period,offset:-1}],['transactions',{...period,limit:201}],['transactions',{...period,status:'ALL'}],['saxo_portfolio',{environment:'live'}]])
  await assert.rejects(readAppData('session','Demo',{resource,parameters},{},request));
});
