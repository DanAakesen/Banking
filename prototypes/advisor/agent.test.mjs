import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createAgentClient } from './agent.mjs';
import { startPrototype, demo } from './server.mjs';

const artifact = { title: 'Generated comparison', format: 'html', content: '<h1>A computed scenario</h1>', fallback: '12,000 DKK available before extra savings.', state: { extra: 2000 } };
test('restart recovery retrieves the original turn and checkpoints before cleanup without resubmission',async()=>{
 const calls=[],progress=[];
 const client=createAgentClient({apiKey:'test-secret',fetchImpl:async(url,options)=>{
  calls.push(options.method||'GET');
  if(options.method==='DELETE'){assert.deepEqual(progress[0].downloadedOutput,artifact);return Response.json({});}
  assert.notEqual(options.method,'POST');
  if(url.includes('/turns?'))return Response.json({data:[{id:'old',status:'completed'},{id:'wanted',status:'completed'}]});
  if(url.includes('/artifacts?'))return Response.json({data:[{id:'wrong',turn_id:'old',path:'/workspace/outputs/analysis.json'},{id:'right',turn_id:'wanted',path:'/workspace/outputs/analysis.json'}]});
  assert.ok(url.endsWith('/artifacts/right/content'));return Response.json(artifact);
 }});
 const result=await client.recover({sessionId:'sess_restart',turnId:'wanted',createdAt:new Date().toISOString(),onProgress:async x=>progress.push(x)});
 assert.deepEqual(result.output,artifact);assert.equal(calls.filter(x=>x==='DELETE').length,1);
 await assert.rejects(client.recover({sessionId:'../other',onProgress:async()=>{}}),/no saved provider identity/);
});

test('persisted interrupted run is recovered exactly once into its existing workspace',async()=>{
 const storageRoot=await mkdtemp(path.join(os.tmpdir(),'banking-recovery-test-'));let recoveries=0;
 const server=await startPrototype({port:5768,renderPort:5769,storageRoot,agentRunner:async()=>{throw Error('Must not submit');},agentRecovery:async run=>{recoveries++;return {output:artifact,sessionId:run.sessionId,turnId:run.turnId};}});
 try{
  const boot=await fetch(server.origin+'/api/workspace'),cookie=boot.headers.get('set-cookie').split(';')[0],sid=cookie.split('=')[1];
  await writeFile(path.join(storageRoot,sid+'.json'),JSON.stringify({artifacts:[],runs:[{id:'recoverable',status:'running',sessionId:'sess_saved',turnId:'turn_saved',prompt:'Compare',createdAt:new Date().toISOString()}]}));
  const read=async()=> (await fetch(server.origin+'/api/workspace',{headers:{Cookie:cookie}})).json();
  const ws=await read();await read();assert.equal(recoveries,1);assert.equal(ws.runs[0].status,'completed');assert.equal(ws.artifacts[0].revisions.length,1);
 }finally{await server.close();await rm(storageRoot,{recursive:true,force:true});}
});
test('hosted transport checks root completion, exact turn artifact, disabled network and cleanup', async () => {
 const calls = [];
 const fetchImpl = async (url, options) => {
  calls.push({url,options});
  if (options.method === 'POST') {
   const payload=JSON.parse(options.body);
   assert.equal(payload.environment.type,'openai_hosted');assert.equal(payload.environment.network.access,'disabled');
   assert.equal(payload.environment.files.length,2);assert.ok(!options.body.includes('test-secret'));
   const events=[{type:'agent.session.created',session:{id:'sess_demo'}},{type:'agent.session.turn.started',turn:{id:'turn_demo',subagent_id:null}},
    {type:'agent.session.idle'}, {type:'agent.session.turn.completed',turn:{id:'child',subagent_id:'child'}},
    {type:'agent.session.turn.completed',turn:{id:'turn_demo',subagent_id:null}}];
   return new Response(events.map(x=>'data: '+JSON.stringify(x)+'\n\n').join(''));
  }
  if(options.method==='DELETE') return new Response('{}');
  if(url.includes('/artifacts?'))return Response.json({data:[{id:'wrong',turn_id:'old',path:'/workspace/outputs/analysis.json'},{id:'right',turn_id:'turn_demo',path:'/workspace/outputs/analysis.json',size_bytes:300}],has_more:false});
  assert.ok(url.endsWith('/artifacts/right/content'));return Response.json(artifact);
 };
 const progress=[];
 const result=await createAgentClient({apiKey:'test-secret',fetchImpl}).run({prompt:'Compare',demo,previous:artifact,onProgress:async x=>progress.push(x)});
 assert.deepEqual(result.output,artifact);assert.equal(result.turnId,'turn_demo');
 assert.equal(calls.filter(x=>x.options.method==='POST').length,1);
 assert.ok(progress.some(x=>x.cleanupDone===true));
});

test('provider failures are visible and never simulated or blindly retried', async()=>{
 let calls=0;
 const client=createAgentClient({apiKey:'test-secret',fetchImpl:async()=>{calls++;return Response.json({error:{code:'insufficient_quota',message:'should not log raw request'}},{status:429});}});
 await assert.rejects(client.run({prompt:'Compare',demo,onProgress:async()=>{}}),/429.*insufficient_quota/);
 assert.equal(calls,1);
});

test('session creation 500 retains safe diagnostics and is never replayed', async()=>{
 let calls=0;
 const client=createAgentClient({apiKey:'test-secret',fetchImpl:async()=>{
  calls++;return Response.json({error:{code:'internal_error',message:'private provider details'}},{status:500,headers:{'x-request-id':'req_test_500'}});
 }});
 await assert.rejects(client.run({prompt:'Compare',demo,onProgress:async()=>{}}),error=>{
  assert.equal(error.httpStatus,500);assert.equal(error.operation,'create_session');
  assert.equal(error.requestId,'req_test_500');assert.equal(error.providerCode,'internal_error');
  assert.match(error.message,/conversation is still available/);assert.ok(!error.message.includes('private provider details'));return true;
 });
 assert.equal(calls,1);
});

test('transient artifact reads recover without creating another paid session', async()=>{
 let starts=0,reads=0;const waits=[];
 const client=createAgentClient({apiKey:'test-secret',wait:async ms=>waits.push(ms),fetchImpl:async(url,options)=>{
  if(options.method==='POST'){
   starts++;return new Response('data: '+JSON.stringify({type:'agent.session.created',session:{id:'sess_recover'}})+'\n\ndata: '+JSON.stringify({type:'agent.session.turn.completed',turn:{id:'turn_recover'}})+'\n\n');
  }
  if(options.method==='DELETE')return Response.json({});
  if(url.includes('/artifacts?'))return Response.json({data:[{id:'file',turn_id:'turn_recover',path:'/workspace/outputs/analysis.json'}],has_more:false});
  if(++reads<3)return Response.json({error:{code:'internal_error'}},{status:500});
  return Response.json(artifact);
 }});
 const result=await client.run({prompt:'Compare',demo,onProgress:async()=>{}});
 assert.deepEqual(result.output,artifact);assert.equal(starts,1);assert.equal(reads,3);assert.deepEqual(waits,[1000,2000]);
});

test('persistent artifact read errors stop after two retries and clean up the session',async()=>{
 let reads=0,cleaned=false;
 const client=createAgentClient({apiKey:'test-secret',wait:async()=>{},fetchImpl:async(url,options)=>{
  if(options.method==='POST')return new Response('data: '+JSON.stringify({type:'agent.session.created',session:{id:'sess_failed'}})+'\n\ndata: '+JSON.stringify({type:'agent.session.turn.completed',turn:{id:'turn_failed'}})+'\n\n');
  if(options.method==='DELETE'){cleaned=true;return Response.json({});}
  reads++;return Response.json({error:{code:'internal_error'}},{status:500});
 }});
 await assert.rejects(client.run({prompt:'Compare',demo,onProgress:async()=>{}}),error=>error.httpStatus===500&&error.operation==='read_session');
 assert.equal(reads,3);assert.equal(cleaned,true);
});

test('prompt flow is isolated, idempotent, carries selected state and saves a generated revision',async()=>{
 const storageRoot=await mkdtemp(path.join(os.tmpdir(),'banking-agent-test-'));
 let count=0,release,received;
 const blocked=new Promise(resolve=>release=resolve);
 const server=await startPrototype({port:5760,renderPort:5761,storageRoot,aiConfigured:true,agentRunner:async args=>{
  count++;received=args;await blocked;await args.onProgress({sessionId:'sess_test',turnId:'turn_test',cleanupDone:true});
  return {output:artifact,sessionId:'sess_test',turnId:'turn_test'};
 }});
 try {
  const boot=await fetch(server.origin+'/api/workspace');const cookie=boot.headers.get('set-cookie').split(';')[0];
  const req=(p,data,customCookie=cookie)=>fetch(server.origin+'/api/'+p,{method:data?'POST':'GET',headers:{Cookie:customCookie,Origin:server.origin,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});
  const payload={prompt:'What if?',requestId:randomUUID()};
  assert.equal((await req('advisor',payload,'')).status,401);
  assert.equal((await req('advisor',{...payload,artifactId:'foreign'})).status,404);
  assert.equal((await req('advisor',payload)).status,202);
  assert.equal((await req('advisor',payload)).status,200);
  assert.equal((await req('advisor',{...payload,requestId:randomUUID()})).status,409);
  release();let ws;
  for(let n=0;n<40;n++){ws=await(await req('workspace')).json();if(ws.runs[0].status==='completed')break;await delay(10);}
  assert.equal(count,1);assert.deepEqual(received.demo,demo);assert.equal(ws.runs[0].status,'completed');assert.equal(ws.artifacts.length,1);
  const saved=ws.artifacts[0];assert.equal(saved.revisions[0].source,'openai-agents');
  assert.equal((await req('advisor',{prompt:'Refine it',requestId:randomUUID(),artifactId:saved.id,revision:1})).status,202);
  for(let n=0;n<40;n++){ws=await(await req('workspace')).json();if(ws.runs.at(-1).status==='completed')break;await delay(10);}
  assert.equal(count,2);assert.equal(received.previous.state.extra,2000);assert.equal(ws.artifacts.length,1);assert.equal(ws.artifacts[0].revisions.length,2);
  const manual=await(await req('artifacts',{...artifact,id:saved.id,state:{extra:2500}})).json();
  assert.equal(manual.revisions.at(-1).source,'openai-agents');assert.equal(manual.revisions.at(-1).turnId,'turn_test');
  assert.equal((await req('advisor',{prompt:' ',requestId:randomUUID()})).status,400);
 }finally{await server.close();await rm(storageRoot,{recursive:true,force:true});}
});
