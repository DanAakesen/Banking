import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {startPrototype} from './server.mjs';
import {dataSnapshot,mergeLibrary,librarySummary,libraryScope} from './library.mjs';
import {savePreference,positionMemory,deletePreference} from './memory.mjs';

test('Memory provenance, relationships, stale edits and positions stay trustworthy',()=>{
 const state={};const a=savePreference(state,{title:'Home',text:'Plan a home',origin:'AI'});
 assert.equal(a.origin,'User');
 const repeated=savePreference(state,{title:'AI thought',text:a.text},{origin:'AI',status:'suggested',source:'Test inference'});assert.notEqual(a.id,repeated.id);assert.equal(state.preferences.find(x=>x.id===a.id).title,'Home');deletePreference(state,repeated.id);
 const b=savePreference(state,{title:'Buffer',text:'Consider retaining a buffer',links:[{id:a.id,label:'supports'}]},{origin:'AI',status:'suggested',source:'Test inference'});
 assert.equal(b.status,'suggested');const updated=savePreference(state,{...b,text:'Keep a buffer',origin:'User',confirm:true});assert.equal(updated.origin,'AI');assert.equal(updated.status,'confirmed');
 assert.throws(()=>savePreference(state,{...b,text:'stale'}),/changed/);
 assert.throws(()=>savePreference(state,{...a,links:[{id:a.id,label:'self'}]}),/linked/);
 positionMemory(state,{id:a.id,x:400,y:250});assert.deepEqual(state.preferences[0].position,{x:400,y:250});
 assert.throws(()=>positionMemory(state,{id:a.id,x:Infinity,y:250}),/position/);
 deletePreference(state,a.id,a.version);assert.deepEqual(state.preferences[0].links,[]);assert.equal(state.preferences[0].version,updated.version+1);
 const legacy={preferences:[{id:'old',text:'Legacy',createdAt:'2026-01-01'}]};assert.equal(savePreference(legacy,{id:'old',version:1,text:'Updated'}).version,2);
});
test('Library merges immutable inputs and state revisions without exposing full context in cards',()=>{
 const context={source:'Banking',mode:'Demo',actuals:{income:5000},accounts:[{name:'Private example'}]};
 const state={};const revision={content:'<p>Result</p>',createdAt:'2026-09-01',title:'Result',prompt:'Same question',state:{x:1},snapshot:dataSnapshot(context)};
 mergeLibrary(state,[{id:'one',revisions:[revision]}]);context.actuals.income=9000;assert.equal(state.artifacts[0].revisions[0].snapshot.context.actuals.income,5000);
 mergeLibrary(state,[{id:'one',revisions:[revision]}]);assert.equal(state.artifacts[0].revisions.length,1);
 mergeLibrary(state,[{id:'one',revisions:[{...revision,state:{x:2}}]}]);assert.equal(state.artifacts[0].revisions.length,2);
 assert.equal(librarySummary(state.artifacts[0]).snapshot.context,undefined);assert.equal(state.artifacts[0].question,'Same question');assert.notEqual(libraryScope('Demo'),libraryScope('Live'));
});
test('Authenticated analysis refresh preserves earlier results across login and handles failures',async()=>{
 const storageRoot=await mkdtemp(path.join(tmpdir(),'banking-library-'));let income=1000,fail=false,received=[];
 const server=await startPrototype({port:15550,renderPort:15551,storageRoot,aiConfigured:true,
 goalReader:async(session,mode,range)=>{if(session==='denied')throw Object.assign(Error('Unauthorized'),{status:401});return {source:'Banking',mode,generatedAt:new Date().toISOString(),...range,actuals:{income,spending:200,disposableAmount:income-200}};},
 agentRunner:async x=>{received.push(x);if(fail)throw Error('Provider unavailable');return {output:{title:'Cash over time',format:'markdown',content:'Income '+x.demo.actuals.income,fallback:'Income '+x.demo.actuals.income,state:{}}};}});
 try{
  const boot=await fetch(server.origin+'/api/workspace');const cookie=boot.headers.get('set-cookie').split(';')[0];
  let session='owner-one';const request=(route,value,extra={})=>fetch(server.origin+'/api/'+route,{method:value?'POST':'GET',headers:{Cookie:cookie,Origin:server.origin,'Content-Type':'application/json','X-Banking-Session':session,'X-Banking-Mode':'Demo','X-Banking-From':'2026-08-15','X-Banking-To':'2026-09-13','X-Banking-Currency':'DKK',...extra},body:value?JSON.stringify(value):undefined});
  const json=async(route,data)=>{const r=await request(route,data);assert.ok(r.ok,await r.clone().text());return r.json();};
  async function finish(id){for(let i=0;i<80;i++){const run=(await json('workspace')).runs.find(x=>x.id===id);if(run.status!=='running')return run;await new Promise(r=>setTimeout(r,15));}throw Error('Timed out');}
  const first=await json('advisor',{prompt:'Compare my money',visual:true,requestId:randomUUID()});const run=await finish(first.id);assert.equal(run.status,'completed');
  session='owner-two';const library=await json('library');assert.equal(library.items.length,1);assert.equal(library.items[0].snapshot.context,undefined);
  const original=await json('library/open',{id:run.artifactId,prepare:true});income=2500;
  const next=await json('advisor',{prompt:original.question,visual:true,requestId:randomUUID(),artifactId:original.id,revision:1});assert.equal((await finish(next.id)).status,'completed');
  const updated=await json('library/open',{id:original.id});assert.equal(updated.revisions.length,2);assert.equal(updated.revisions[0].snapshot.financials.income,1000);assert.equal(updated.revisions[1].snapshot.financials.income,2500);assert.equal(received[1].prompt,received[0].prompt);
  fail=true;const broken=await json('advisor',{prompt:original.question,visual:true,requestId:randomUUID(),artifactId:original.id,revision:2});assert.equal((await finish(broken.id)).status,'failed');assert.equal((await json('library/open',{id:original.id})).revisions.length,2);
  assert.equal((await request('library',null,{'X-Banking-Session':'denied'})).status,401);
  assert.equal((await (await request('library',null,{'X-Banking-Mode':'Live'})).json()).items.length,0);
 }finally{await server.close();await rm(storageRoot,{recursive:true,force:true});}
});
test('AI memory suggestions are reviewable and simultaneous retries share one provider call',async()=>{
 const storageRoot=await mkdtemp(path.join(tmpdir(),'banking-memory-ai-'));let calls=0,context;
 const server=await startPrototype({port:15552,renderPort:15553,storageRoot,aiConfigured:true,goalReader:async(session,mode)=>({source:'Banking',mode,goalContext:{goals:[{name:'Home'}]}}),voiceClient:{route:async input=>{context=input.context.demo;return {name:'clarify',args:{question:'What next?'}};},summarizeGoals:async()=>{calls++;await new Promise(r=>setTimeout(r,40));return 'You may want to consider a home buffer.';}}});
 try{const boot=await fetch(server.origin+'/api/workspace'),cookie=boot.headers.get('set-cookie').split(';')[0];const headers={Cookie:cookie,Origin:server.origin,'Content-Type':'application/json','X-Banking-Session':'owner','X-Banking-Mode':'Demo'};const requestId=randomUUID();const post=()=>fetch(server.origin+'/api/memory/suggest',{method:'POST',headers,body:JSON.stringify({requestId})});const results=await Promise.all([post(),post()]);const a=await results[0].json(),b=await results[1].json();assert.equal(calls,1);assert.equal(a.id,b.id);assert.equal(a.origin,'AI');assert.equal(a.status,'suggested');
  const call=(route,data)=>fetch(server.origin+'/api/'+route,{method:'POST',headers,body:JSON.stringify(data)});
  const ask=()=>call('advisor',{prompt:'What do you remember?',requestId:randomUUID()});await ask();assert.equal(context.rememberedPreferences.length,0);
  const confirmed=await(await call('memory/save',{...a,text:'Keep a flexible buffer',confirm:true})).json();await ask();assert.equal(context.rememberedPreferences[0].text,'Keep a flexible buffer');assert.equal(context.rememberedPreferences[0].origin,'AI');
  await call('memory/delete',{id:a.id,version:confirmed.version});await ask();assert.equal(context.rememberedPreferences.length,0);
 }
 finally{await server.close();await rm(storageRoot,{recursive:true,force:true});}
});
