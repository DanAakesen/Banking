import test from 'node:test';import assert from 'node:assert/strict';
import {upcomingStockEvents,stockIllustration} from '../../src/Banking.Api/wwwroot/employee-stock-ui.js';
test('upcoming uses explicit inclusive cutoff, matching source delivery and conditional quantity, never current holdings',()=>{
 const report={schedules:[{date:'2025-11-30',shares:15,matchedPastVesting:15},{date:'2026-10-16',shares:12.5,matchedPastVesting:0},{date:'2029-11-30',shares:15,matchedPastVesting:0}]};
 assert.deepEqual(upcomingStockEvents(report,'2026-10-16').map(s=>[s.date,s.conditionalShares]),[['2026-10-16',12.5],['2029-11-30',15]]);
 assert.equal(upcomingStockEvents(report,'2025-01-01').length,2);assert.deepEqual(upcomingStockEvents(report,''),[]);assert.deepEqual(upcomingStockEvents(report,'2026-02-31'),[]);
 assert.equal(report.schedules[1].matchedPastVesting,0); // clock/cutoff never mutates source to vested
});
test('illustrative price and explicit DKK per USD are separate, missing inputs remain unknown',()=>{
 assert.deepEqual(stockIllustration(12.5,200,6.25),{usd:2500,dkk:15625});
 assert.deepEqual(stockIllustration(12.5,200,NaN),{usd:2500,dkk:null});
 for(const price of [null,undefined,0,-1,NaN])assert.deepEqual(stockIllustration(12.5,price,6.25),{usd:null,dkk:null});
 assert.deepEqual(stockIllustration(0,200,6.25),{usd:0,dkk:0});
});

test('invalid bounded assumptions and overflowing products stay unknown',()=>{
 for(const price of [1000001,Number.MAX_VALUE,Infinity])assert.deepEqual(stockIllustration(12,price,6),{usd:null,dkk:null});
 for(const rate of [10001,Number.MAX_VALUE,Infinity,-1])assert.deepEqual(stockIllustration(12,200,rate),{usd:2400,dkk:null});
 assert.deepEqual(stockIllustration(Number.MAX_VALUE,200,6),{usd:null,dkk:null});
 assert.deepEqual(stockIllustration(1e302,1e6,10000),{usd:1e308,dkk:null});
});
