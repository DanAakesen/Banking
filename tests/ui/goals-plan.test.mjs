import assert from 'node:assert/strict';
import test from 'node:test';
import {dueCount,planPreview,goalPath,valueAt} from '../../src/Banking.Api/wwwroot/goals-ui.js';

const car={target:225000,currency:'DKK',planStart:'2026-07-01',startingBalance:75000,monthlyContribution:2500,contributionDay:2,deadline:'2031-06-02'};
const carJourney={from:'2026-07-01',to:'2026-09-27',hasPlan:true,fresh:true,historyComplete:true,closingBalance:80000,months:[]};
const tx=(bookingDate,amount,description='Transfer')=>({bookingDate,amount,description,currency:'DKK'});
const carTransactions=[tx('2026-09-02',2500),tx('2026-08-12',-2500,'Returned'),tx('2026-08-02',2500),tx('2026-07-02',2500)];

test('goal path rebuilds the booked balance and marks a withdrawal as behind plan until today',()=>{
 const m=goalPath({goal:car,journey:carJourney,transactions:carTransactions});
 assert.equal(m.actual[0].value,75000);assert.equal(valueAt(m.actual,'2026-08-11'),80000);assert.equal(valueAt(m.actual,'2026-08-12'),77500);assert.equal(m.actual.at(-1).value,80000);
 assert.deepEqual(m.runs.map(r=>[r.state,r.from,r.to]),[['on','2026-07-01','2026-08-11'],['behind','2026-08-12','2026-09-27']]);
 assert.equal(m.diff,-2500);assert.equal(m.state,'behind');
 assert.equal(m.planArrival,'2031-06-02');assert.equal(m.forecast,'2031-07-02');assert.equal(m.planAt('2026-09-27'),82500);
 assert.equal(m.events.length,4);assert.ok(m.end>m.forecast);
});

test('goal path treats a deposit booked a few days late as on plan, and extra deposits as ahead',()=>{
 const late=goalPath({goal:car,journey:{...carJourney,closingBalance:82500},transactions:[tx('2026-09-05',2500),tx('2026-08-02',2500),tx('2026-07-02',2500)]});
 assert.deepEqual(late.runs.map(r=>r.state),['on']);assert.equal(late.state,'on');assert.equal(late.forecast,late.planArrival);
 const extra=goalPath({goal:car,journey:{...carJourney,closingBalance:92500},transactions:[tx('2026-09-10',10000,'Bonus'),tx('2026-09-02',2500),tx('2026-08-02',2500),tx('2026-07-02',2500)]});
 assert.equal(extra.runs.at(-1).state,'ahead');assert.equal(extra.diff,10000);assert.ok(extra.forecast<extra.planArrival);
});

test('goal path never invents a balance line without a fresh balance, history or plan',()=>{
 const stale=goalPath({goal:car,journey:{...carJourney,fresh:false},transactions:carTransactions});
 assert.equal(stale.actual.length,0);assert.equal(stale.projection.length,0);assert.equal(stale.state,null);assert.ok(stale.plan.length>1);
 const missing=goalPath({goal:car,journey:carJourney,transactions:carTransactions,historyAvailable:false});
 assert.equal(missing.actual.length,0);assert.equal(missing.runs.length,0);
 const partial=goalPath({goal:car,journey:carJourney,transactions:carTransactions,historyFrom:'2026-08-01'});
 assert.equal(partial.actualFrom,'2026-08-01');assert.equal(partial.actual[0].value,77500);
 const noPlan=goalPath({goal:{...car,monthlyContribution:null},journey:{...carJourney,hasPlan:false},transactions:carTransactions});
 assert.equal(noPlan.plan.length,0);assert.equal(noPlan.projection.length,0);assert.equal(noPlan.runs.length,0);assert.equal(noPlan.actual.at(-1).value,80000);
});

test('due count matches the backend contribution-day rule',()=>{
 assert.equal(dueCount('2026-07-01','2031-06-02',2),60);
 assert.equal(dueCount('2026-07-05','2026-08-01',2),0);
 assert.equal(dueCount('2026-07-05','2026-08-02',2),1);
 assert.equal(dueCount('2026-07-02','2026-07-02',2),1);
});

test('plan preview estimates the completion month and the pace needed for the deadline',()=>{
 const car=planPreview({target:225000,startingBalance:75000,monthly:2500,planStart:'2026-07-01',deadline:'2031-06-02',day:2});
 assert.equal(car.payments,60);assert.equal(car.reachDate,'2031-06-02');assert.equal(car.needed,2500);assert.equal(car.onPace,true);
 const slow=planPreview({target:225000,startingBalance:75000,monthly:2000,planStart:'2026-07-01',deadline:'2031-06-02',day:2});
 assert.equal(slow.onPace,false);assert.equal(slow.reachDate,'2032-09-02');
});

test('plan preview stays empty without the values it needs and never divides by zero',()=>{
 assert.equal(planPreview({target:NaN,startingBalance:0,monthly:100,planStart:'2026-01-01'}).reachDate,null);
 assert.equal(planPreview({target:1000,startingBalance:NaN,monthly:100,planStart:'2026-01-01'}).reachDate,null);
 assert.equal(planPreview({target:1000,startingBalance:0,monthly:NaN,planStart:'2026-01-01',deadline:'2026-12-31'}).reachDate,null);
 assert.equal(planPreview({target:1000,startingBalance:0,monthly:100,planStart:'2026-06-10',deadline:'2026-06-20',day:1}).needed,null);
 const reached=planPreview({target:1000,startingBalance:1200,monthly:100,planStart:'2026-01-01',deadline:'2026-12-31'});
 assert.equal(reached.payments,0);assert.equal(reached.needed,0);assert.equal(reached.onPace,true);
 assert.equal(planPreview({target:1e9,startingBalance:0,monthly:1,planStart:'2026-01-01'}).reachDate,null);
});
