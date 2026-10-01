import test from 'node:test';
import assert from 'node:assert/strict';
import {memoryScope,savePreference,deletePreference} from './memory.mjs';
import {startPrototype} from './server.mjs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
test('Preference storage is explicit, editable, removable and bounded',()=>{
 const state={};const p=savePreference(state,{text:'Keep a cash buffer'});savePreference(state,{text:'Keep a cash buffer'});assert.equal(state.preferences.length,1);
 savePreference(state,{id:p.id,text:'Keep a 50000 DKK cash buffer'});assert.equal(state.preferences[0].source,'User-confirmed preference');
 assert.throws(()=>savePreference(state,{id:'foreign',text:'change'}),/not found/);deletePreference(state,p.id);assert.equal(state.preferences.length,0);
 assert.notEqual(memoryScope('Demo'),memoryScope('Live'));assert.throws(()=>savePreference(state,{text:' '.repeat(500)}),/characters/);
});
test('Stable local preferences require Banking authorization and remain isolated by mode',async()=>{
 const storageRoot=await mkdtemp(path.join(tmpdir(),'banking-memory-'));
 const server=await startPrototype({port:15536,renderPort:15537,storageRoot,goalReader:async(session,mode)=>{if(session==='denied')throw Object.assign(new Error('Not authorized'),{status:401});return {source:'Banking',mode};}});
 try{
  const boot=await fetch(server.origin+'/api/workspace');const cookie=boot.headers.get('set-cookie').split(';')[0];
  const headers={Cookie:cookie,Origin:server.origin,'Content-Type':'application/json','X-Banking-Session':'authorized','X-Banking-Mode':'Demo'};
  const request=(route,value,extra={})=>fetch(server.origin+'/api/'+route,{method:value?'POST':'GET',headers:{...headers,...extra},body:value?JSON.stringify(value):undefined});
  await request('memory/save',{text:'QA priority'});
  assert.equal((await(await request('memory',null,{'X-Banking-Session':'new-authorized-session'})).json()).preferences.length,1);
  assert.equal((await(await request('memory',null,{'X-Banking-Mode':'Live'})).json()).preferences.length,0);
  assert.equal((await request('memory',null,{'X-Banking-Session':'denied'})).status,401);
  assert.equal((await request('memory/save',{text:'Unauthorized'},{'X-Banking-Session':'denied'})).status,401);
 }finally{await server.close();await rm(storageRoot,{recursive:true,force:true});}
});
