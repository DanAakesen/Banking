import test from 'node:test';
import assert from 'node:assert/strict';
import {reserveUsage,usageView} from './usage.mjs';
test('Persistent daily quotas deduplicate retries, enforce caps and reset only on the next UTC day',()=>{
 const state={},today=new Date('2026-09-13T10:00:00Z');
 for(let i=0;i<10;i++)reserveUsage(state,'analyses',String(i),today);
 reserveUsage(state,'analyses','0',today);
 assert.equal(usageView(state,today).analyses,10);
 assert.throws(()=>reserveUsage(JSON.parse(JSON.stringify(state)),'analyses','new',today),e=>e.status===429);
 reserveUsage(state,'questions','new',today);assert.equal(usageView(state,today).questions,1);
 reserveUsage(state,'analyses','new',new Date('2026-09-14T00:00:00Z'));
 assert.equal(state.usage.analyses,1);assert.equal(state.usage.questions,0);
});
