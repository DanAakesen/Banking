import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {prepareSaxoOrder,submitSaxoOrder,verifySaxoOrder} from './saxo-tools.mjs';
import {readAppData} from './app-tools.mjs';
import {startPrototype} from './server.mjs';
const ticketId=randomUUID();
const order={environment:'SIM',uic:42,accountId:'123',side:'Buy',quantity:2,limitPrice:100,currency:'DKK',duration:'DayOrder',stopLoss:90,takeProfit:120};
test('precheck uses the owned Saxo listing, account and currency and never submits',async()=>{
 const calls=[];const request=async(s,m,p,b)=>{calls.push({p,b});return p.includes('/ticket?')?{name:'Stock',symbol:'ABC:xcse',currency:'DKK',accounts:[{key:'owned',name:'123',currency:'EUR'}]}:{ticketId,state:'Reviewed',precheck:{PreCheckResult:'Ok'},expiresAt:new Date(Date.now()+120000).toISOString()};};
 const p=await prepareSaxoOrder('s','Demo',order,'r',request);assert.equal(p.kind,'saxo');assert.equal(p.order.accountName,'123');assert.equal(p.payload.ticketId,ticketId);assert.equal(calls.length,2);assert.match(calls[1].p,/precheck/);assert.equal(calls[1].b.stopLoss,90);
 for(const patch of [{environment:'LIVE'},{quantity:0},{quantity:1.5},{accountId:'foreign'},{currency:'USD'},{stopLoss:101},{side:'Sell'},{takeProfit:undefined},{trailingStop:2}])await assert.rejects(prepareSaxoOrder('s','Demo',{...order,...patch},'r',request));
});
test('submission verifies broker status and never infers a fill from an acknowledgement',async()=>{
 let writes=0;const request=async(s,m,p,b)=>{if(b){assert.deepEqual(b,{ticketId,confirm:true});writes++;return {state:'Accepted',orderId:'1'};}if(p.includes(ticketId))return {state:'Accepted',orderId:'1',relatedOrderIds:['2'],input:{stopLoss:90}};return {orders:[{orderId:'2',status:'Working'}],history:[{orderId:'1',status:'FinalFill',filled:2}],observedAt:'now'};};
 const r=await submitSaxoOrder('s','Demo',{ticketId},request);assert.equal(writes,1);assert.equal(r.status,'FinalFill');assert.equal(r.verified,true);assert.equal(r.relatedOrdersVerified,true);
 const noEvidence=await verifySaxoOrder('s','Demo',ticketId,async(s,m,p)=>p.includes(ticketId)?{state:'Accepted',orderId:'1'}:{orders:[],history:[]});assert.equal(noEvidence.status,'Accepted');assert.equal(noEvidence.verified,false);
 const outage=await verifySaxoOrder('s','Demo',ticketId,async(s,m,p)=>{if(p.includes(ticketId))return {state:'Unknown'};throw Error();});assert.equal(outage.status,'Unconfirmed');assert.equal(outage.verified,false);
});
test('new Saxo reads reject LIVE and invalid identifiers before calling an API',async()=>{
 let reads=0;const request=async()=>{reads++;return {};};
 for(const resource of ['saxo_instruments','saxo_ticket','saxo_order_status'])await assert.rejects(readAppData('s','Live',{resource,parameters:{environment:'LIVE'}},{},request));
 await assert.rejects(readAppData('s','Demo',{resource:'saxo_ticket',parameters:{uic:'42'}},{},request));assert.equal(reads,0);
 await readAppData('s','Demo',{resource:'saxo_instruments',parameters:{q:'ABC'}},{},request);await readAppData('s','Demo',{resource:'saxo_ticket',parameters:{uic:42}},{},request);assert.equal(reads,2);
});
test('only explicit card confirmation can submit; scope and repeated confirmation are safe',async()=>{
 const storageRoot=await mkdtemp(path.join(tmpdir(),'banking-saxo-proposal-'));let writes=0,proposalId;
 const server=await startPrototype({port:15582,renderPort:15583,storageRoot,aiConfigured:true,goalReader:async()=>({source:'Banking',mode:'Demo',goalContext:{goals:[]}}),orderPreparer:async(s,m,a,r)=>({id:randomUUID(),kind:'saxo',requestId:r,status:'pending',order:a,payload:{ticketId}}),orderSubmitter:async()=>{writes++;return {kind:'saxo',status:'Accepted',verified:true};},voiceClient:{route:async({transcript})=>transcript.at(-1).text==='confirm'?{name:'confirm_proposal',args:{proposalId}}:{name:'prepare_saxo_order',args:{orderJson:JSON.stringify(order)}}}});
 try{const boot=await fetch(server.origin+'/api/workspace');const headers={Cookie:boot.headers.get('set-cookie').split(';')[0],Origin:server.origin,'Content-Type':'application/json','X-Banking-Session':'saxo-test','X-Banking-Mode':'Demo'};const post=(p,b,h={})=>fetch(server.origin+'/api/'+p,{method:'POST',headers:{...headers,...h},body:JSON.stringify(b)});
 const draft=await(await post('advisor',{prompt:'Prepare order',requestId:randomUUID()})).json();proposalId=draft.proposal.id;assert.equal(writes,0);
 assert.equal((await post('proposals/apply',{id:proposalId,confirm:true})).status,400);
 assert.equal((await post('advisor',{prompt:'confirm',requestId:randomUUID()})).status,400);assert.equal(writes,0);
 assert.equal((await post('proposals/apply',{id:proposalId,confirm:true,confirmOrder:true},{'X-Banking-Mode':'Live'})).status,404);
 assert.equal((await post('proposals/apply',{id:proposalId,confirm:true,confirmOrder:true})).status,200);
 assert.equal((await post('proposals/apply',{id:proposalId,confirm:true,confirmOrder:true})).status,200);assert.equal(writes,1);
 }finally{await server.close();await rm(storageRoot,{recursive:true,force:true});}
});
test('an explicit prepare-only request can progress from read-only lookup to a card',async()=>{
 const storageRoot=await mkdtemp(path.join(tmpdir(),'banking-saxo-lookup-'));let routes=0,prepared=0;
 const server=await startPrototype({port:15584,renderPort:15585,storageRoot,aiConfigured:true,goalReader:async()=>({source:'Banking',mode:'Demo',goalContext:{goals:[]}}),appReader:async()=>({uic:42,accounts:[{name:'123'}]}),orderPreparer:async(s,m,a,r)=>{prepared++;return {id:randomUUID(),kind:'saxo',requestId:r,status:'pending',order:a,payload:{ticketId}};},voiceClient:{route:async()=>++routes===1?{name:'read_app_data',args:{stageRequestedEdit:false,queries:[{resource:'saxo_ticket',parametersJson:'{"uic":42}'}]}}:{name:'prepare_saxo_order',args:{orderJson:JSON.stringify(order)}}}});
 try{const boot=await fetch(server.origin+'/api/workspace');const r=await fetch(server.origin+'/api/advisor',{method:'POST',headers:{Cookie:boot.headers.get('set-cookie').split(';')[0],Origin:server.origin,'Content-Type':'application/json','X-Banking-Session':'lookup-only','X-Banking-Mode':'Demo'},body:JSON.stringify({prompt:'Prepare only, do not submit',requestId:randomUUID()})});const result=await r.json();assert.equal(r.status,200);assert.equal(prepared,1);assert.equal(result.proposal.kind,'saxo');assert.equal(result.proposal.status,'pending');}
 finally{await server.close();await rm(storageRoot,{recursive:true,force:true});}
});
