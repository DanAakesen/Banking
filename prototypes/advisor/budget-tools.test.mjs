import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { startPrototype } from './server.mjs';

test('text and voice share budget creation; replay, foreign IDs and reads cannot create extra entries', async () => {
 const storageRoot=await mkdtemp(path.join(os.tmpdir(),'banking-budget-tools-'));
 const budgetId=randomUUID(),categoryId=randomUUID();let writes=0,lastEntry;
 const args={budgetId,name:'Internet',type:'Expense',amount:1200,intervalMonths:3,categoryId,savingsAccountId:null};
 const server=await startPrototype({port:15524,renderPort:15525,storageRoot,aiConfigured:true,
  goalReader:async()=>({source:'Banking',mode:'Demo',budgets:{plans:[{id:budgetId,name:'Family',currency:'DKK',version:'v1',entries:[{name:'Salary',amount:30000}]}]},categories:[{id:categoryId,name:'Utilities'}],accounts:[],goalContext:{goals:[]}}),
  voiceClient:{connect:async()=>({session:{},transport:{}}),route:async({transcript})=>transcript.at(-1).text.startsWith('Read')?{name:'read_banking_data',args:{}}:{name:'create_budget_entry',args:transcript.at(-1).text==='Invalid'?{...args,categoryId:randomUUID()}:args},summarizeGoals:async()=> 'Income is planned, not actual.'},
  budgetWriter:async(session,mode,id,entry)=>{writes++;lastEntry=entry;assert.equal(mode,'Demo');assert.equal(id,budgetId);return {status:'created',entryId:entry.requestId};}
 });
 try{
  const boot=await fetch(server.origin+'/api/workspace');const cookie=boot.headers.get('set-cookie').split(';')[0];
  const headers={Cookie:cookie,Origin:server.origin,'Content-Type':'application/json','X-Banking-Session':'test-session','X-Banking-Mode':'Demo'};
  const post=(route,data)=>fetch(server.origin+'/api/'+route,{method:'POST',headers,body:JSON.stringify(data)});
  const request={prompt:'Add Internet 1200 quarterly',requestId:randomUUID()};
  assert.equal((await(await post('advisor',request)).json()).result.status,'created');
  assert.equal(lastEntry.requestId,request.requestId);assert.equal(lastEntry.version,'v1');assert.equal(lastEntry.intervalMonths,3);
  await post('advisor',request);assert.equal(writes,1);
  assert.equal((await post('advisor',{prompt:'Invalid',requestId:randomUUID()})).status,400);assert.equal(writes,1);
  assert.equal((await(await post('advisor',{prompt:'Read my budget',requestId:randomUUID()})).json()).tool,'read_banking_data');assert.equal(writes,1);
  const voice=await(await post('voice/session',{sdp:'offer'})).json();
  const call={id:voice.id,delegationId:'add',transcript:[{role:'user',text:'Add Internet'}]};
  assert.equal((await(await post('voice/delegate',call)).json()).action.type,'budget-created');
  await post('voice/delegate',call);assert.equal(writes,2);
 }finally{await server.close();await rm(storageRoot,{recursive:true,force:true});}
});
