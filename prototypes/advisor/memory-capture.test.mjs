import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {queueCapture,claimCapture,completeCapture,configureCapture,captureView,failCapture,retryCapture} from './memory-capture.mjs';
import {deletePreference} from './memory.mjs';
import {startPrototype} from './server.mjs';
import {createVoiceClient} from './voice.mjs';
const input=()=>({chatId:randomUUID(),title:'Home plans',reason:'activity',busy:false,messages:[{id:randomUUID(),role:'user',text:'I prefer broad ETFs.'}]});
const candidate=(i,kind='explicit')=>({kind,title:'Investment preference',text:kind==='explicit'?i.messages[0].text:'Broad diversification could be a priority.',messageId:i.messages[0].id,quote:i.messages[0].text,links:[]});
test('Ordinary preference statements cannot invoke immediate remember; extraction uses a bounded structured response',async()=>{
 let sent;const client=createVoiceClient({apiKey:'test-only',fetchImpl:async(url,options)=>{sent=JSON.parse(options.body);return {ok:true,json:async()=>sent.text?{status:'completed',output:[{content:[{type:'output_text',text:'{"candidates":[]}'}]}]}:{output:[{type:'function_call',name:'clarify',arguments:'{"question":"Understood."}'}]}};}});
 await client.route({transcript:[{role:'user',text:'I prefer broad ETFs.'}],context:{demo:{automaticMemoryEnabled:true}}});assert.ok(!sent.tools.some(t=>t.name==='remember_preference'));
 await client.route({transcript:[{role:'user',text:'Remember that I prefer broad ETFs.'}],context:{}});assert.ok(sent.tools.some(t=>t.name==='remember_preference'));
 assert.deepEqual(await client.extractMemories({messages:input().messages,existing:[]}),[]);assert.equal(sent.store,false);assert.equal(sent.text.format.strict,true);assert.equal(sent.max_output_tokens,2000);
});
test('Text settles only after inactivity; busy conversation waits, explicit end is immediate',()=>{
 const s={},i=input();queueCapture(s,i,0,100);assert.equal(claimCapture(s,99),null);
 queueCapture(s,{...i,busy:true},90,100);assert.equal(claimCapture(s,150),null);
 queueCapture(s,{...i,reason:'new-chat'},160,100);assert.equal(claimCapture(s,160).chatId,i.chatId);
});
test('Only new user messages are accepted; concurrent flushes and resumed chats deduplicate',()=>{
 const s={},i=input();assert.throws(()=>queueCapture(s,{...i,messages:[{...i.messages[0],role:'assistant'}]}),/source/);
 queueCapture(s,i,0,1);const j=claimCapture(s,1);assert.equal(queueCapture(s,i,2).status,'unchanged');
 completeCapture(s,j,[candidate(i)],3);assert.equal(queueCapture(s,i,4).status,'unchanged');
 const next={...i,messages:[...i.messages,{id:randomUUID(),role:'user',text:'I also want to buy a home.'}]};
 queueCapture(s,next,5,1);assert.equal(claimCapture(s,6).messages.length,1);
});
test('Explicit quotes become confirmed AI-origin memories; interpretations need review',()=>{
 const s={},i=input();queueCapture(s,i,0,1);const j=claimCapture(s,1);
 const saved=completeCapture(s,j,[candidate(i)],2);assert.equal(saved[0].origin,'AI');assert.equal(saved[0].status,'confirmed');assert.equal(saved[0].evidence.quote,i.messages[0].text);
 const k=input();queueCapture(s,k,3,1);const inference=completeCapture(s,claimCapture(s,4),[candidate(k,'inferred')],5);assert.equal(inference[0].status,'suggested');
});
test('Fabricated evidence and paraphrased explicit claims are rejected',()=>{
 const s={},i=input();queueCapture(s,i,0,1);const j=claimCapture(s,1);
 assert.throws(()=>completeCapture(s,j,[{...candidate(i),quote:'invented'}]),/evidence/);
 assert.throws(()=>completeCapture(s,j,[{...candidate(i),text:'An interpretation'}]),/exact/);
 assert.equal(s.preferences,undefined);
});
test('Deletion prevents repeated capture; disabling discards in-flight results and pending text',()=>{
 const s={},i=input();queueCapture(s,i,0,1);completeCapture(s,claimCapture(s,1),[candidate(i)],2);
 deletePreference(s,s.preferences[0].id);const next=input();queueCapture(s,next,3,1);assert.equal(completeCapture(s,claimCapture(s,4),[candidate(next)],5).length,0);
 const n=input();queueCapture(s,n,6,1);const j=claimCapture(s,7);configureCapture(s,false);
 assert.equal(completeCapture(s,j,[candidate(n)],8).length,0);assert.ok(s.memoryCapture.jobs.every(j=>!j.messages.length));assert.equal(captureView(s).enabled,false);
});
test('Failures wait for explicit retry and empty output is a completed no-op',()=>{
 const s={},i=input();queueCapture(s,i,0,1);const j=claimCapture(s,1);failCapture(s,j.id,'Provider failed');assert.equal(claimCapture(s,100),null);
 assert.equal(queueCapture(s,i,110).status,'unchanged');retryCapture(s,j.id);const retry=claimCapture(s,120);assert.notEqual(retry.id,j.id);
 completeCapture(s,retry,[],121);assert.equal(captureView(s).failed.length,0);assert.equal(queueCapture(s,i,122).status,'unchanged');
});
test('Re-enabling never harvests paused messages and a late activity request cannot postpone an ended segment',()=>{
 const s={},i=input();configureCapture(s,false);queueCapture(s,i,0);configureCapture(s,true);assert.equal(queueCapture(s,i,1).status,'unchanged');
 const n=input();queueCapture(s,{...n,reason:'new-chat'},2,100);queueCapture(s,n,3,100);assert.ok(claimCapture(s,3));
});
test('Authenticated automatic capture persists, isolates Demo/Live, reports failure and retries',async()=>{
 const storageRoot=await mkdtemp(path.join(tmpdir(),'banking-capture-'));let calls=0,shouldFail=false;
 const config={port:15620,renderPort:15621,storageRoot,aiConfigured:true,captureIdleMs:20,capturePollMs:10,
  goalReader:async(session,mode)=>{if(session==='denied')throw Object.assign(Error('Unauthorized'),{status:401});return {source:'Banking',mode};},
  voiceClient:{extractMemories:async({messages})=>{calls++;if(shouldFail)throw Error('Failure');return [candidate({messages})];}}};
 let server=await startPrototype(config);const boot=await fetch(server.origin+'/api/workspace');const cookie=boot.headers.get('set-cookie').split(';')[0];
 const req=async(route,body,mode='Demo',session='owner')=>{const r=await fetch(server.origin+'/api/'+route,{method:body?'POST':'GET',headers:{Cookie:cookie,Origin:server.origin,'Content-Type':'application/json','X-Banking-Session':session,'X-Banking-Mode':mode},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
 const until=async(fn)=>{for(let n=0;n<100;n++){const result=await fn();if(result)return result;await new Promise(r=>setTimeout(r,20));}throw Error('Capture did not settle');};
 try{
  await req('workspace');const i=input();assert.equal((await req('memory/capture',i,'Demo','denied')).status,401);
  assert.equal((await req('memory/capture',i)).status,202);
  const ready=await until(async()=>{const r=await req('memory');return r.data.preferences.length&&r.data;});assert.equal(ready.preferences[0].evidence.chatId,i.chatId);assert.equal(ready.usage.memory,1);
  assert.equal((await req('memory',null,'Live')).data.preferences.length,0);
  await req('memory/capture',i);assert.equal(calls,1);
  await server.close();server=await startPrototype(config);assert.equal((await req('memory')).data.preferences.length,1);
  shouldFail=true;const next=input();next.messages[0].text='I plan to keep a house buffer.';await req('memory/capture',{...next,reason:'new-chat'});
  const failed=await until(async()=>{const r=await req('memory');return r.data.capture.failed[0];});shouldFail=false;
  await req('memory/retry',{id:failed.id});await until(async()=>(await req('memory')).data.preferences.length===2);
  await req('memory/settings',{enabled:false});assert.equal((await req('memory/capture',input())).data.status,'disabled');
 }finally{await server.close();await rm(storageRoot,{recursive:true,force:true});}
});
