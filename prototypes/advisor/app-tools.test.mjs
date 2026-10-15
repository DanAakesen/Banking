import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readAppData,proposeAppChange,applyAppChange,editable} from './app-tools.mjs';
import {startPrototype} from './server.mjs';
import {copyFile,mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import path from 'node:path';
const id=randomUUID();
test('app tools load frontend assets from an isolated deployed asset root',async()=>{
 const releaseRoot=await mkdtemp(path.join(tmpdir(),'banking-deployed-assets-'));
 const packageRoot=path.join(releaseRoot,'prototypes','advisor'),assetRoot=path.join(releaseRoot,'assets','wwwroot');
 const sourceRoot=path.dirname(fileURLToPath(import.meta.url));
 try{
  await Promise.all([mkdir(packageRoot,{recursive:true}),mkdir(assetRoot,{recursive:true})]);
  await Promise.all(['app-tools.mjs','saxo-tools.mjs','banking-context.mjs'].map(name=>copyFile(path.join(sourceRoot,name),path.join(packageRoot,name))));
  await Promise.all(['overview.js','budget-ui.js','wealth-ui.js','pension-import-ui.js','saxo-session.js'].map(name=>copyFile(path.join(sourceRoot,'../../src/Banking.Api/wwwroot',name),path.join(assetRoot,name))));
  await writeFile(path.join(releaseRoot,'package.json'),'{"type":"module"}');
  const script=[
   "import assert from 'node:assert/strict';",
   "import {pathToFileURL} from 'node:url';",
   "const {readAppData}=await import(pathToFileURL(process.argv[1]));",
   "const calls=[];",
   "const request=async(_session,_mode,path)=>{calls.push(path);if(path.startsWith('/api/wealth/overview?'))return {visuals:{investment:{history:[{date:'2026-09-01',value:100},{date:'2026-09-30',value:200}]}},records:[]};if(path.startsWith('/api/budget-plans/'))return {from:'2026-09-01',to:'2026-09-07',currency:'DKK',monthlyPlan:{expenses:1000},actualExpenses:700,sufficientHistory:true,oldestSync:null};if(path.startsWith('/api/cash-flow?'))return {points:Array.from({length:7},()=>({spending:100}))};throw new Error('Unexpected API path: '+path);};",
   "const wealth=await readAppData('session','Demo',{resource:'wealth_history',parameters:{}},{from:'2026-09-01',to:'2026-09-30'},request);",
   "const budget=await readAppData('session','Demo',{resource:'budget_forecast',parameters:{id:'00000000-0000-0000-0000-000000000001',month:'2026-09'}},{},request);",
   "assert.deepEqual(wealth.selectedPeriod.investment,[{date:'2026-09-01',value:100},{date:'2026-09-30',value:200}]);",
   "assert.equal(budget.forecast.projection,3000);",
   "assert.deepEqual(calls,['/api/wealth/overview?currency=DKK','/api/budget-plans/00000000-0000-0000-0000-000000000001/progress?month=2026-09','/api/cash-flow?from=2026-09-01&to=2026-09-07&currency=DKK']);"
  ].join('\n');
  execFileSync(process.execPath,['--input-type=module','-e',script,path.join(packageRoot,'app-tools.mjs')],{cwd:releaseRoot,env:{...process.env,BANKING_ASSET_ROOT:assetRoot},stdio:'pipe'});
 }finally{await rm(releaseRoot,{recursive:true,force:true});}
});
test('read tools fix routes and protect Saxo LIVE while preserving section dates',async()=>{
 const calls=[],request=async(...args)=>{calls.push(args);return {ok:true};};
 await assert.rejects(readAppData('s','Demo',{resource:'saxo',parameters:{environment:'LIVE'}},{},request));
 await readAppData('s','Demo',{resource:'cash_flow',parameters:{}},{from:'2026-08-01',to:'2026-08-31',screen:{sections:{cashFlow:{from:'2026-09-01',to:'2026-09-18'}}}},request);
 assert.match(calls[0][2],/from=2026-09-01/);assert.equal(calls[0][1],'Demo');
 await assert.rejects(readAppData('s','Live',{resource:'https://evil',parameters:{}},{},request));
 await readAppData('s','Demo',{resource:'market_search',parameters:{q:'A&B'}},{},request);assert.match(calls[1][2],/q=A%26B/);
});
test('all edit resources preserve existing fields and trusted versions without writing during staging',async()=>{
 for(const resource of Object.keys(editable)){
 const original={id,version:'v1',customName:'Original',isSavings:true,name:'Original',description:'Goal',target:100,currency:'DKK',scope:'Account',accountId:id,principal:100,annualRate:2,months:12,balanceDate:'2026-09-01',provider:'Provider',kind:'Pension',value:100,asOf:'2026-09-01',sourceNote:'Saved',symbol:'ABC',notes:'Keep',contains:'Shop',categoryId:id};
 const calls=[],request=async(...args)=>{calls.push(args);return [original];};
 const field=resource==='rules'?'contains':resource==='accounts'?'customName':'name';
 const p=await proposeAppChange('s','Demo',{resource,operation:'update',id,fields:{[field]:'Updated'}},randomUUID(),request);
 assert.equal(calls.length,1);assert.equal(calls[0][3],undefined);assert.equal(p.after[field],'Updated');assert.equal(p.payload.version,'v1');
 await applyAppChange('s','Demo',p.payload,async(...args)=>{assert.equal(args[4],'PUT');assert.equal(args[3].version,'v1');if(resource==='accounts'){assert.equal(args[2],'/api/accounts/'+id+'/preferences');assert.equal(args[3].isSavings,true);assert.equal(args[3].customName,'Updated');}return {id};});
 }
});
test('foreign IDs, unknown fields and incomplete creations cannot produce proposals',async()=>{
 await assert.rejects(proposeAppChange('s','Demo',{resource:'accounts',operation:'delete',id,fields:{}},'r'));
 await assert.rejects(proposeAppChange('s','Demo',{resource:'accounts',operation:'update',id,fields:{isSavings:false}},'r'));
 await assert.rejects(proposeAppChange('s','Demo',{resource:'goals',operation:'update',id,fields:{name:'x'}},'r',async()=>[]));
 await assert.rejects(proposeAppChange('s','Demo',{resource:'watchlist',operation:'create',fields:{url:'https://x'}},'r'));
 await assert.rejects(proposeAppChange('s','Demo',{resource:'rules',operation:'create',fields:{admin:true}},'r'));
});
test('research can follow up with a second read and cannot execute an unexpected write',async()=>{
 const storageRoot=await mkdtemp(path.join(tmpdir(),'banking-app-tools-'));let routes=0,reads=0,writes=0;
 const server=await startPrototype({port:15572,renderPort:15573,storageRoot,aiConfigured:true,goalReader:async()=>({source:'Banking',mode:'Demo',goalContext:{goals:[]}}),appReader:async()=>({value:++reads}),appWriter:async()=>{writes++;},voiceClient:{route:async()=>++routes<3?{name:'read_app_data',args:{queries:[{resource:routes===1?'saxo':'saxo_orders',parametersJson:'{}'}]}}:{name:'propose_app_change',args:{}},summarizeGoals:async({context})=>String(context.researchResults.length)}});
 try{const boot=await fetch(server.origin+'/api/workspace');const cookie=boot.headers.get('set-cookie').split(';')[0];const res=await fetch(server.origin+'/api/advisor',{method:'POST',headers:{Cookie:cookie,Origin:server.origin,'Content-Type':'application/json','X-Banking-Session':'test-session','X-Banking-Mode':'Demo'},body:JSON.stringify({prompt:'Read portfolio and orders',requestId:randomUUID()})});const data=await res.json();assert.equal(res.status,200);assert.equal(data.answer,'2');assert.equal(reads,2);assert.equal(writes,0);}finally{await server.close();await rm(storageRoot,{recursive:true,force:true});}
});

test('app proposals require confirmation, stay scoped and never replay an uncertain write',async()=>{
 const storageRoot=await mkdtemp(path.join(tmpdir(),'banking-app-proposal-'));let writes=0;
 const server=await startPrototype({port:15574,renderPort:15575,storageRoot,aiConfigured:true,goalReader:async()=>({source:'Banking',mode:'Demo',goalContext:{goals:[]}}),appProposer:async(_s,_m,args,requestId)=>({id:randomUUID(),requestId,kind:'app',resource:'watchlist',status:'pending',before:null,after:args.fields,payload:args}),appWriter:async()=>{writes++;throw Object.assign(new Error('Connection lost'),{status:503});},voiceClient:{route:async()=>({name:'propose_app_change',args:{resource:'watchlist',operation:'create',id:null,fieldsJson:'{"name":"ABC","symbol":"ABC","notes":"Test"}'}})}});
 try{const boot=await fetch(server.origin+'/api/workspace');const cookie=boot.headers.get('set-cookie').split(';')[0];const headers={Cookie:cookie,Origin:server.origin,'Content-Type':'application/json','X-Banking-Session':'proposal','X-Banking-Mode':'Demo'};const post=(p,b,h={})=>fetch(server.origin+'/api/'+p,{method:'POST',headers:{...headers,...h},body:JSON.stringify(b)});
 const r=await(await post('advisor',{prompt:'Propose a watchlist item',requestId:randomUUID()})).json();assert.equal(r.proposal.kind,'app');assert.equal(writes,0);
 assert.equal((await post('proposals/apply',{id:r.proposal.id})).status,400);
 assert.equal((await post('proposals/apply',{id:r.proposal.id,confirm:true},{'X-Banking-Mode':'Live'})).status,404);
 assert.equal((await post('proposals/apply',{id:r.proposal.id,confirm:true})).status,503);
 assert.equal((await post('proposals/apply',{id:r.proposal.id,confirm:true})).status,409);assert.equal(writes,1);
 }finally{await server.close();await rm(storageRoot,{recursive:true,force:true});}
});

test('explicit edit lookup produces a review card without applying it',async()=>{
 const storageRoot=await mkdtemp(path.join(tmpdir(),'banking-edit-lookup-'));let routes=0,writes=0;
 const server=await startPrototype({port:15576,renderPort:15577,storageRoot,aiConfigured:true,goalReader:async()=>({source:'Banking',mode:'Demo',goalContext:{goals:[]}}),appReader:async()=>[{id,name:'Rule'}],appProposer:async(_s,_m,args,requestId)=>({id:randomUUID(),requestId,kind:'app',status:'pending',resource:args.resource,after:args.fields}),appWriter:async()=>{writes++;},voiceClient:{route:async({context})=>{if(++routes===1)return {name:'read_app_data',args:{stageRequestedEdit:true,queries:[{resource:'rules',parametersJson:'{}'}]}};assert.equal(context.stageRequestedEdit,true);return {name:'propose_app_change',args:{resource:'rules',operation:'update',id,fieldsJson:'{"contains":"Updated"}'}};}}});
 try{const boot=await fetch(server.origin+'/api/workspace');const cookie=boot.headers.get('set-cookie').split(';')[0];const res=await fetch(server.origin+'/api/advisor',{method:'POST',headers:{Cookie:cookie,Origin:server.origin,'Content-Type':'application/json','X-Banking-Session':'lookup-test','X-Banking-Mode':'Demo'},body:JSON.stringify({prompt:'Update the rule',requestId:randomUUID()})});const data=await res.json();assert.equal(res.status,200);assert.equal(data.proposal.after.contains,'Updated');assert.equal(data.proposal.status,'pending');assert.equal(writes,0);}finally{await server.close();await rm(storageRoot,{recursive:true,force:true});}
});

 test('Saxo LIVE activity is read-only and denied to Demo before requesting data',async()=>{
  let calls=[];const request=async(...args)=>{calls.push(args);return {environment:'LIVE',orders:[]};};
  await assert.rejects(readAppData('s','Demo',{resource:'saxo_orders',parameters:{environment:'LIVE'}},{},request));
  assert.equal(calls.length,0);
  await readAppData('s','Live',{resource:'saxo_orders',parameters:{environment:'LIVE'}},{},request);
  assert.equal(calls.length,1);assert.match(calls[0][2],/orders\?environment=LIVE$/);
 });
