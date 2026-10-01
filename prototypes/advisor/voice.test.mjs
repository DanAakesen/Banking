import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateScenario, createVoiceClient, voiceSessions } from './voice.mjs';
import { demo, startPrototype } from './server.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('research routing exposes Saxo precheck but never submission',async()=>{
 const client=createVoiceClient({apiKey:'test',fetchImpl:async(url,options)=>{
  const tools=JSON.parse(options.body).tools.map(x=>x.name);
  assert.ok(tools.includes('prepare_saxo_order'));assert.ok(!tools.includes('confirm_proposal'));
  return Response.json({output:[{type:'function_call',name:'prepare_saxo_order',arguments:'{"orderJson":"{}"}'}]});
 }});
 const tool=await client.route({transcript:[{role:'user',text:'Prepare only'}],context:{readOnlyResearch:true,stageRequestedEdit:false}});assert.equal(tool.name,'prepare_saxo_order');
});

test('scenario money and dates reconcile, with boundary rejection', () => {
  for (const [extra, months, date, available] of [[0,44,'2030-05',12000],[2000,32,'2029-05',10000],[2500,30,'2029-03',9500],[4000,25,'2028-10',8000],[12000,13,'2027-10',0]]) {
    const s = calculateScenario(demo,extra); assert.equal(s.months,months);assert.equal(s.targetDate,date);assert.equal(s.available,available);
    assert.equal(demo.income-demo.expenses-demo.savings-extra,s.available);assert.equal(s.monthsEarlier,44-months);
  }
  for (const value of [-1,12001,NaN,Infinity,'4000',null]) assert.throws(()=>calculateScenario(demo,value));
});
test('voice uses Live WebRTC and strict function routing without sending the key to the browser',async()=>{
  const calls=[]; const client=createVoiceClient({apiKey:'test-key',fetchImpl:async(url,options)=>{
    calls.push({url,body:JSON.parse(options.body)});
    return Response.json(url.endsWith('/live/sessions')?{session:{id:'live_test'},transport:{sdp:'answer'}}:{output:[{type:'function_call',name:'calculate_scenario',arguments:'{"extra":4000}',call_id:'c1'}]});
  }});
  const result=await client.connect('v=0\r\n');assert.equal(result.transport.sdp,'answer');
  assert.equal(calls[0].body.session.model,'gpt-live-1');assert.equal(calls[0].body.session.delegation.type,'client');assert.equal(calls[0].body.transport.type,'webrtc');
  assert.equal(JSON.stringify(result).includes('test-key'),false);
  const tool=await client.route({transcript:[{role:'user',text:'Make it four thousand'}],context:{}});assert.equal(tool.args.extra,4000);assert.equal(calls[1].body.store,false);
  assert.equal(calls[1].body.parallel_tool_calls,false);
});
test('voice sessions isolate workspaces and reserve creation before an awaited provider call',async()=>{
  let resolve;const sessions=voiceSessions({connect:()=>new Promise(r=>{resolve=r;})});
  const pending=sessions.start('a','offer');await assert.rejects(sessions.start('b','offer'),/already open/);
  resolve({session:{id:'live_test'},transport:{sdp:'answer'}});const result=await pending;
  assert.throws(()=>sessions.get('b',result.id),/expired/);sessions.end('b',result.id);assert.ok(sessions.get('a',result.id));sessions.end('a',result.id);assert.throws(()=>sessions.get('a',result.id));
});
test('provider failures and unsupported tool calls never become successful actions',async()=>{
  let attempts=0;
  const failure=createVoiceClient({apiKey:'test',fetchImpl:async()=>{attempts++;return Response.json({error:{code:'rate_limit_exceeded'}},{status:429});}});
  await assert.rejects(failure.connect('v=0\r\n'),/429/);assert.equal(attempts,1);
  const unsafe=createVoiceClient({apiKey:'test',fetchImpl:async()=>Response.json({output:[{type:'function_call',name:'transfer_money',arguments:'{}'}]})});
  await assert.rejects(unsafe.route({transcript:[],context:{}}),/supported tool/);
});

test('provider connection and timeout failures remain visible without automatic replay',async()=>{
 for(const name of ['TypeError','TimeoutError']){
  let calls=0;
  const client=createVoiceClient({apiKey:'test',fetchImpl:async()=>{calls++;throw Object.assign(new Error('private transport diagnostics'),{name});}});
  await assert.rejects(client.route({transcript:[],context:{}}),e=>e.status===502 && !e.message.includes('private') && /try again/.test(e.message));
  assert.equal(calls,1);
 }
});
test('voice API requires origin and workspace, deduplicates delegation, validates tool amounts',async()=>{
  const storageRoot=await mkdtemp(path.join(os.tmpdir(),'banking-voice-'));let routed=0;
  const server=await startPrototype({port:15490,renderPort:15491,storageRoot,aiConfigured:true,voiceClient:{connect:async()=>({session:{id:'live_test'},transport:{sdp:'answer'}}),route:async({transcript})=>{routed++;if(transcript[0].text==='baseline')return {name:'read_demo_context',args:{},callId:'baseline'};return {name:'calculate_scenario',args:{extra:transcript[0].text==='invalid'?13000:4000},callId:'c1'};}}});
  try {
    const bootstrap=await fetch(server.origin+'/api/workspace');const cookie=bootstrap.headers.get('set-cookie').split(';')[0];
    const post=(route,data,withCookie=true,origin=server.origin)=>fetch(server.origin+'/api/'+route,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(withCookie?{Cookie:cookie}:{})},body:JSON.stringify(data)});
    assert.equal((await post('voice/session',{sdp:'offer'},false)).status,401);
    assert.equal((await post('voice/session',{sdp:'offer'},true,'https://evil.example')).status,403);
    const session=await(await post('voice/session',{sdp:'offer'})).json();
    const baseline=await(await post('voice/delegate',{id:session.id,delegationId:'baseline',transcript:[{role:'user',text:'baseline'}]})).json();
    assert.equal(baseline.result.scenario,null);assert.equal(baseline.result.baselineScenario.targetDate,'2030-05');assert.equal(baseline.result.baselineScenario.months,44);assert.equal(baseline.result.available,12000);
    const request={id:session.id,delegationId:'d1',transcript:[{role:'user',text:'four thousand'}]};
    const result=await(await post('voice/delegate',request)).json();assert.equal(result.result.available,8000);assert.equal(result.action.scenario.targetDate,'2028-10');
    await post('voice/delegate',request);assert.equal(routed,2);
    assert.equal((await post('voice/delegate',{...request,delegationId:'d2',transcript:[{role:'user',text:'invalid'}]})).status,400);
    assert.equal((await post('voice/delegate',{...request,artifactId:'other'})).status,200); // Existing id replays the original result, never reroutes.
    assert.equal((await post('voice/delegate',{...request,delegationId:'d3',artifactId:'other'})).status,404);
    await post('voice/end',{id:session.id});assert.equal((await post('voice/delegate',request)).status,401);
  } finally { await server.close();await rm(storageRoot,{recursive:true,force:true}); }
});
test('cancelled background analysis cannot publish a late artifact',async()=>{
  const storageRoot=await mkdtemp(path.join(os.tmpdir(),'banking-voice-cancel-'));let finish, signal;
  const server=await startPrototype({port:15492,renderPort:15493,storageRoot,aiConfigured:true,
    voiceClient:{connect:async()=>({session:{id:'live_test'},transport:{sdp:'answer'}}),route:async()=>({name:'cancel_analysis',args:{},callId:'cancel'})},
    agentRunner:async input=>{signal=input.signal;return new Promise(r=>{finish=r;});}});
  try {
    const cookie=(await fetch(server.origin+'/api/workspace')).headers.get('set-cookie').split(';')[0];
    const post=async(route,data)=>(await fetch(server.origin+'/api/'+route,{method:'POST',headers:{Origin:server.origin,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(data)})).json();
    const run=await post('advisor',{requestId:crypto.randomUUID(),prompt:'Create a chart'});
    const session=await post('voice/session',{sdp:'offer'});
    const cancelled=await post('voice/delegate',{id:session.id,delegationId:'cancel-1',transcript:[{role:'user',text:'Cancel that analysis'}]});
    assert.equal(cancelled.result.status,'cancelled');assert.equal(signal.aborted,true);
    finish({output:{title:'Late artifact',format:'markdown',content:'Should not be published',fallback:'late',state:{}},sessionId:'s',turnId:'t'});
    await new Promise(r=>setTimeout(r,25));
    const ws=await(await fetch(server.origin+'/api/workspace',{headers:{Cookie:cookie}})).json();
    assert.equal(ws.runs.find(x=>x.id===run.id).status,'cancelled');assert.equal(ws.artifacts.length,0);
  }finally{await server.close();await rm(storageRoot,{recursive:true,force:true});}
});
