import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { startPrototype } from './server.mjs';
import { bankingScope } from './banking-context.mjs';

test('Text and voice use all financial domains for owner, Demo and a new Demo visitor', async () => {
  const storageRoot = await mkdtemp(path.join(os.tmpdir(), 'banking-all-workspaces-'));
  const calls = [];
  const server = await startPrototype({ port: 15522, renderPort: 15523, storageRoot, aiConfigured: true,
    goalReader: async (session, mode) => ({ source:'Banking', mode, goalContext:{goals:[]},
      statements:[{name:session+' portfolio',kind:'Investment',value:80},{name:session+' pension',kind:'Pension',value:510}],
      loans:[{name:session+' loan',principal:60,isScenario:false}], watchlist:[{symbol:'MSFT',notes:session+' interest'}],
      budgets:{plans:[]}, accounts:[], categories:[] }),
    voiceClient: { connect:async()=>({session:{},transport:{}}),
      route:async({context})=>{calls.push(context.demo);return {name:'read_banking_data',args:{}};},
      summarizeGoals:async({context})=>context.statements[0].name }
  });
  try {
    const cookie = (await fetch(server.origin+'/api/workspace')).headers.get('set-cookie').split(';')[0];
    for (const [identity, mode] of [['owner','Live'],['demo-existing','Demo'],['demo-new','Demo']]) {
      const headers = { Cookie:cookie, Origin:server.origin, 'Content-Type':'application/json',
        'X-Banking-Session':identity, 'X-Banking-Mode':mode };
      const post = async (route,data) => {
        const response = await fetch(server.origin+'/api/'+route,{method:'POST',headers,body:JSON.stringify(data)});
        assert.equal(response.ok,true); return response.json();
      };
      await post('advisor',{prompt:'What are my loans, investments, pension and watchlist?',requestId:randomUUID()});
      const voice = await post('voice/session',{sdp:'offer'});
      await post('voice/delegate',{id:voice.id,delegationId:randomUUID(),transcript:[{role:'user',text:'Read my financial data'}]});
      await post('voice/end',{id:voice.id});
      assert.equal(calls.length,2);
      for (const context of calls.splice(0)) {
        assert.equal(context.mode,mode);
        assert.equal(context.statements[0].name,identity+' portfolio');
        assert.equal(context.statements[1].kind,'Pension');
        assert.equal(context.loans[0].name,identity+' loan');
        assert.equal(context.watchlist[0].notes,identity+' interest');
        assert.equal(context.goal,undefined);
      }
    }
  } finally { await server.close(); await rm(storageRoot,{recursive:true,force:true}); }
});

test('Banking goal context stays fresh, scoped and never falls back to fixture goals', async () => {
  const storageRoot = await mkdtemp(path.join(os.tmpdir(), 'banking-goal-context-'));
  let goalName = 'Car', fail = false, routed, generated;
  const server = await startPrototype({ port: 15520, renderPort: 15521, storageRoot, aiConfigured: true,
    goalReader: async (session, mode) => {
      if (fail) throw Object.assign(new Error('Goals unavailable'), { status: 503 });
      return { source: 'Banking', mode, goalContext: { goals: [{ goal: { name: goalName, notes: 'Family car', references: [{ url: 'https://example.com/car' }] }, progress: { status: 'BehindPlan' }, journey: { shortfall: 1200 } }] } };
    },
    voiceClient: { connect: async () => ({ session: {}, transport: {} }), route: async ({context}) => { routed = context; return { name: 'read_goals', args: {} }; }, summarizeGoals: async ({context}) => 'Saved goal: '+context.goalContext.goals[0].goal.name },
    agentRunner: async input => { generated = input.demo; return { output: { title: 'Goals', format: 'markdown', content: 'Saved goals', fallback: 'Car', state: {} } }; }
  });
  try {
    const bootstrap = await fetch(server.origin + '/api/workspace');
    const cookie = bootstrap.headers.get('set-cookie').split(';')[0];
    const headers = { Cookie: cookie, Origin: server.origin, 'Content-Type': 'application/json', 'X-Banking-Session': 'test-owner-session', 'X-Banking-Mode': 'Live' };
    const post = (route, data, extra = {}) => fetch(server.origin + '/api/' + route, { method: 'POST', headers: {...headers, ...extra}, body: JSON.stringify(data) });
    const session = await (await post('voice/session', {sdp:'offer'})).json();
    const read = id => post('voice/delegate', {id:session.id, delegationId:id, transcript:[{role:'user',text:'What are my goals?'}]});
    const first = await (await read('one')).json();
    assert.equal(first.tool, 'read_goals');
    assert.equal(first.result.goals[0].goal.name, 'Car');
    assert.equal(first.result.goals[0].journey.shortfall, 1200);
    assert.equal(first.result.spokenAnswer, 'Saved goal: Car');
    assert.equal(routed.demo.goal, undefined);
    assert.equal(JSON.stringify(routed).includes('test-owner-session'), false);
    goalName = 'Updated car';
    assert.equal((await (await read('two')).json()).result.goals[0].goal.name, 'Updated car');
    assert.equal((await post('voice/delegate', {id:session.id,delegationId:'foreign',transcript:[]}, {'X-Banking-Mode':'Demo'})).status, 401);
    await post('advisor', { prompt:'Show my saved goals', requestId:randomUUID(), visual:true });
    for(let i=0;i<20&&!generated;i++) await new Promise(r=>setTimeout(r,10));
    assert.equal(generated.goalContext.goals[0].goal.name, 'Updated car');
    assert.equal(generated.goal, undefined);
    fail = true;
    assert.equal((await read('failed')).status, 503);
    assert.equal((await post('advisor', {prompt:'My goals',requestId:randomUUID()})).status, 503);
    assert.notEqual(bankingScope('owner','Live'),bankingScope('owner','Demo'));
    assert.notEqual(bankingScope('owner','Live'),bankingScope('other-owner','Live'));
  } finally { await server.close(); await rm(storageRoot,{recursive:true,force:true}); }
});

test('empty router clarification produces a grounded answer for text and voice, never blank facts',async()=>{
 const storageRoot=await mkdtemp(path.join(os.tmpdir(),'banking-grounding-'));
 let balance=75563,empty=false;
 const server=await startPrototype({port:15528,renderPort:15529,storageRoot,aiConfigured:true,
  goalReader:async()=>({source:'Banking',accounts:[{name:'Lønkonto',balance}],savingsBalance:326400}),
  voiceClient:{connect:async()=>({session:{},transport:{}}),route:async()=>({name:'clarify',args:{question:' '}}),
   summarizeGoals:async({context})=>empty?'':`Lønkonto: ${context.accounts[0].balance} DKK. Opsparing: ${context.savingsBalance} DKK.`}});
 try{
  const cookie=(await fetch(server.origin+'/api/workspace')).headers.get('set-cookie').split(';')[0];
  const headers={Cookie:cookie,Origin:server.origin,'Content-Type':'application/json','X-Banking-Session':'grounding-demo','X-Banking-Mode':'Demo'};
  const post=(route,data)=>fetch(server.origin+'/api/'+route,{method:'POST',headers,body:JSON.stringify(data)});
  const text=await (await post('advisor',{prompt:'Read savings and salary balance',requestId:randomUUID()})).json();
  assert.match(text.answer,/75563/);assert.match(text.answer,/326400/);assert.equal(text.tool,'read_banking_data');
  const voice=await(await post('voice/session',{sdp:'offer'})).json();balance=76000;
  const result=await(await post('voice/delegate',{id:voice.id,delegationId:randomUUID(),transcript:[{role:'assistant',text:'Your balance is 32500'},{role:'user',text:'Read my salary balance'}]})).json();
  assert.match(result.result.spokenAnswer,/76000/);assert.doesNotMatch(result.result.spokenAnswer,/32500/);
  empty=true;assert.equal((await post('advisor',{prompt:'Read savings',requestId:randomUUID()})).status,502);
 }finally{await server.close();await rm(storageRoot,{recursive:true,force:true});}
});

test('answer figures are checked against records: one corrective retry, then unmatched figures are disclosed',async()=>{
 const storageRoot=await mkdtemp(path.join(os.tmpdir(),'banking-figures-'));
 const drafts=[];let mode='fixes';
 const server=await startPrototype({port:15538,renderPort:15539,storageRoot,aiConfigured:true,
  goalReader:async()=>({source:'Banking',accounts:[{name:'Lønkonto',balance:75388}],savingsBalance:326400}),
  voiceClient:{connect:async()=>({session:{},transport:{}}),route:async()=>({name:'clarify',args:{question:''}}),
   summarizeGoals:async({context})=>{drafts.push(context.figureCheck||null);return mode==='fixes'&&context.figureCheck?`Opsparing: ${context.savingsBalance} DKK.`:'Opsparing: 184.000 kr.';}}});
 try{
  const cookie=(await fetch(server.origin+'/api/workspace')).headers.get('set-cookie').split(';')[0];
  const headers={Cookie:cookie,Origin:server.origin,'Content-Type':'application/json','X-Banking-Session':'figures-demo','X-Banking-Mode':'Demo'};
  const post=(route,data)=>fetch(server.origin+'/api/'+route,{method:'POST',headers,body:JSON.stringify(data)});
  const fixed=await(await post('advisor',{prompt:'How much have I saved?',requestId:randomUUID()})).json();
  assert.match(fixed.answer,/326400/);assert.deepEqual(fixed.unverifiedFigures,[]);
  assert.equal(drafts.length,2);assert.match(drafts[1],/184\.000 kr\./);
  mode='stuck';
  const voice=await(await post('voice/session',{sdp:'offer'})).json();
  const result=await(await post('voice/delegate',{id:voice.id,delegationId:randomUUID(),transcript:[{role:'user',text:'How much have I saved?'}]})).json();
  assert.deepEqual(result.result.unverifiedFigures,['184.000 kr.']);
  const user=await(await post('advisor',{prompt:'Is 184000 DKK enough?',requestId:randomUUID()})).json();
  assert.deepEqual(user.unverifiedFigures,[]);
 }finally{await server.close();await rm(storageRoot,{recursive:true,force:true});}
});