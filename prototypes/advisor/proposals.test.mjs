import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {proposeBudget,proposeReview} from './proposals.mjs';
import {startPrototype} from './server.mjs';
const entry={id:'internet',name:'Internet',type:'Expense',isSavings:false,amount:1200,intervalMonths:3,source:'Manual',categoryId:null,savingsAccountId:null};
const context={source:'Banking',mode:'Demo',budgets:{plans:[{id:'budget',name:'Family',currency:'DKK',version:'v1',entries:[entry,{...entry,id:'salary',name:'Salary',type:'Income',amount:30000,intervalMonths:1}]}]},goalContext:{goals:[]},accounts:[],categories:[]};
const args={budgetId:'budget',name:'Family',currency:'DKK',entries:[{...entry,amount:900}]};
test('Budget proposal retains every untouched entry and source, monthly totals, version and original records',()=>{
 const original=JSON.stringify(context),p=proposeBudget(context,args,'request');
 assert.equal(p.status,'pending');assert.equal(p.payload.version,'v1');assert.equal(p.payload.entries.length,2);
 assert.equal(p.before.expenses,400);assert.equal(p.after.expenses,300);assert.equal(p.after.available,29700);
 assert.deepEqual(p.payload.entries[1],context.budgets.plans[0].entries[1]);assert.equal(JSON.stringify(context),original);
 assert.throws(()=>proposeBudget(context,{...args,entries:[{...entry,id:'foreign'}]},'request'),/existing entry/);
 assert.throws(()=>proposeBudget(context,{...args,entries:[{...entry,amount:-1}]},'request'),/invalid/);
});
test('Staging cannot write; confirmation is workspace scoped and repeat confirmations reuse the committed result',async()=>{
 const storageRoot=await mkdtemp(path.join(tmpdir(),'banking-proposals-'));let writes=0;
 const server=await startPrototype({port:15532,renderPort:15533,storageRoot,aiConfigured:true,goalReader:async()=>structuredClone(context),voiceClient:{route:async()=>({name:'propose_budget_entries',args})},budgetSaver:async(session,mode,payload)=>{assert.equal(mode,'Demo');assert.equal(payload.version,'v1');writes++;return {id:payload.id};}});
 try{
  const boot=await fetch(server.origin+'/api/workspace');const cookie=boot.headers.get('set-cookie').split(';')[0];
  const headers={Cookie:cookie,Origin:server.origin,'Content-Type':'application/json','X-Banking-Session':'proposal-test','X-Banking-Mode':'Demo'};
  const post=(route,data,extra={})=>fetch(server.origin+'/api/'+route,{method:'POST',headers:{...headers,...extra},body:JSON.stringify(data)});
  const r=await(await post('advisor',{prompt:'Propose internet 900 quarterly',requestId:randomUUID()})).json();assert.equal(r.proposal.status,'pending');assert.equal(writes,0);
  assert.equal((await post('proposals/apply',{id:r.proposal.id})).status,400);
  assert.equal((await post('proposals/apply',{id:r.proposal.id,confirm:true},{'X-Banking-Mode':'Live'})).status,404);assert.equal(writes,0);
  const committed=await(await post('proposals/apply',{id:r.proposal.id,confirm:true})).json();assert.equal(committed.status,'updated');assert.equal(writes,1);
  await post('proposals/apply',{id:r.proposal.id,confirm:true});assert.equal(writes,1);
 }finally{await server.close();await rm(storageRoot,{recursive:true,force:true});}
});
test('Review proposals preserve signed evidence and cannot target items outside the supplied queue',()=>{
 const reviewContext={categories:[{id:'food',name:'Food'}],reviewQueue:{items:[{key:'category:1',signature:'signed',kind:'Category',transaction:{description:'Market shop',amount:-100,currency:'DKK'}}]}};
 const p=proposeReview(reviewContext,{itemKey:'category:1',categoryId:'food',ruleContains:'Market'},'r');
 assert.deepEqual(p.payload.items,[{key:'category:1',signature:'signed'}]);assert.equal(p.payload.kind,'Categorize');assert.equal(p.payload.ruleContains,'Market');
 assert.throws(()=>proposeReview(reviewContext,{itemKey:'other',categoryId:'food'},'r'),/queue/);
 assert.throws(()=>proposeReview(reviewContext,{itemKey:'category:1',categoryId:'food',ruleContains:'unrelated'},'r'),/match/);
});
test('Uncertain Review writes cannot be blindly replayed',async()=>{
 const storageRoot=await mkdtemp(path.join(tmpdir(),'banking-review-proposal-'));let writes=0;
 const item={key:'category:1',signature:'signature',kind:'Category',transaction:{description:'Market shop',amount:-100,currency:'DKK'}};
 const server=await startPrototype({port:15534,renderPort:15535,storageRoot,aiConfigured:true,goalReader:async()=>({...context,categories:[{id:'food',name:'Food'}]}),reviewReader:async()=>({items:[item],total:1}),voiceClient:{route:async({transcript})=>transcript.at(-1).text==='Read'?{name:'read_review',args:{kind:'All',offset:0}}:{name:'propose_review',args:{itemKey:item.key,categoryId:'food',ruleContains:null}},summarizeGoals:async()=> 'A category is missing.'},reviewWriter:async()=>{writes++;throw Object.assign(new Error('Uncertain result'),{status:503});}});
 try{
  const boot=await fetch(server.origin+'/api/workspace');const cookie=boot.headers.get('set-cookie').split(';')[0];
  const headers={Cookie:cookie,Origin:server.origin,'Content-Type':'application/json','X-Banking-Session':'review-test','X-Banking-Mode':'Demo'};
  const post=(route,data)=>fetch(server.origin+'/api/'+route,{method:'POST',headers,body:JSON.stringify(data)});
  await post('advisor',{prompt:'Read',requestId:randomUUID()});
  const r=await(await post('advisor',{prompt:'Propose food',requestId:randomUUID()})).json();assert.equal(writes,0);
  assert.equal((await post('proposals/apply',{id:r.proposal.id,confirm:true})).status,503);assert.equal(writes,1);
  assert.equal((await post('proposals/apply',{id:r.proposal.id,confirm:true})).status,409);assert.equal(writes,1);
 }finally{await server.close();await rm(storageRoot,{recursive:true,force:true});}
});

test('Name-only budget edits preserve every entry and total',()=>{
 const p=proposeBudget(context,{budgetId:'budget',name:'Family renamed',currency:'DKK',entries:[]},'rename');
 assert.equal(p.previousName,'Family');assert.equal(p.payload.name,'Family renamed');assert.deepEqual(p.payload.entries,context.budgets.plans[0].entries);assert.deepEqual(p.before,p.after);
 assert.throws(()=>proposeBudget(context,{budgetId:null,name:'Empty',currency:'DKK',entries:[]},'empty'));
});
