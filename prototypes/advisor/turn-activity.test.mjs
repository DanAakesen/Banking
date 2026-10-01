import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const app=await readFile(new URL('./public/app.js',import.meta.url),'utf8');
const source=app.slice(app.indexOf('let handlingPrompt=false'),app.indexOf('function toolActivity'));
function harness(){
 const chat={messages:[]};
 const ctx={chats:{current:()=>chat},activeRun:null,persistChat(){},drawMessages(){}};
 vm.runInNewContext(source+'\nrenderActivity=()=>{};this.activity=activity;this.finish=finishActivity;this.update=updateActivity;this.setVoice=value=>voiceToolBusy=value;',ctx);
 return {...ctx,chat,prompt(id){const msg={id,role:'user'};chat.messages.push(msg);return msg;}};
}
test('each prompt retains its own completed steps when another question starts',()=>{
 const h=harness(),first=h.prompt('first');h.activity('Read accounts');assert.equal(first.activityBusy,true);
 h.finish();const second=h.prompt('second');h.activity('Read budget');
 assert.equal(first.activityBusy,false);assert.equal(first.activities[0].state,'done');
 assert.equal(second.activityBusy,true);assert.equal(second.activities.length,1);
 assert.equal(first.activities[0].label,'Read accounts');
});
test('a response closes activity even while a voice tool callback is unwinding',()=>{
 const h=harness(),msg=h.prompt('voice');h.setVoice(true);h.activity('Read savings');h.finish();h.update(true);
 assert.equal(msg.activityBusy,false);assert.equal(msg.activities[0].state,'done');
 h.activity('Read another source');assert.equal(msg.activityBusy,true);
});
test('failed tools keep their failure state after the response closes the list',()=>{
 const h=harness(),msg=h.prompt('failure');h.activity('Read accounts');h.activity('Connection failed','failed');h.finish();
 assert.equal(msg.activityBusy,false);assert.equal(msg.activities.at(-1).state,'failed');
});
