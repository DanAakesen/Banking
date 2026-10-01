import assert from 'node:assert/strict';
import test from 'node:test';

// markets-ui.js imports browser-only modules; minimal inert globals let the pure helper load in Node.
Object.assign(globalThis,{window:globalThis,addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){}}),
 document:{addEventListener(){},documentElement:{},querySelector(){return null}},localStorage:{getItem(){return null},setItem(){}},
 MutationObserver:class{observe(){}disconnect(){}}});
globalThis.sessionStorage=globalThis.localStorage;
const {pairLiveQuote}=await import('../../src/Banking.Api/wwwroot/markets-ui.js');

// A SIM holding as grouped by the desk: SIM quantity/open price, unreliable broker valuation.
const holding={saxoSymbol:'GMAB:xcse',currency:'DKK',assetType:'Stock',quantity:2,avg:2280,price:null};
const quote={source:'Saxo LIVE',symbol:'GMAB:xcse',currency:'DKK',assetType:'Stock',price:2300,previousClose:2250,
 quoteTime:'2026-09-28T14:00:00Z',quoteDelayMinutes:15,quoteStatus:'available',historyStatus:'denied',bars:[]};

test('SIM holdings pair with a LIVE research quote only for the exact listing, asset type and currency',()=>{
 const live=pairLiveQuote(holding,quote);
 assert.equal(live.price,2300);assert.equal(live.currency,'DKK');assert.equal(live.value,4600);assert.equal(live.pnl,40);
 assert.equal(live.quoteTime,quote.quoteTime);assert.equal(live.delayMinutes,15);
 assert.ok(Math.abs(live.pnlPct-(2300/2280-1)*100)<1e-9);assert.ok(Math.abs(live.dayPct-(2300/2250-1)*100)<1e-9);
 for(const other of [{symbol:'GMAB:xsto'},{symbol:'GMAB'},{currency:'EUR'},{assetType:'Etf'},{source:'Yahoo'}])
  assert.equal(pairLiveQuote(holding,{...quote,...other}),null,JSON.stringify(other));
});

test('unavailable, denied, stale, unstamped or zero quotes never become a current price',()=>{
 for(const other of [{quoteStatus:'denied',price:null},{quoteStatus:'unavailable',price:null},{quoteStatus:'stale'},{quoteStatus:'mismatch'},
  {quoteTime:null},{price:0},{price:null,quoteStatus:undefined},{price:-1}])
  assert.equal(pairLiveQuote(holding,{...quote,...other}),null,JSON.stringify(other));
 assert.equal(pairLiveQuote(null,quote),null);assert.equal(pairLiveQuote(holding,null),null);
});

test('missing open price, quantity or previous close keeps the dependent estimates unknown',()=>{
 const noCost=pairLiveQuote({...holding,avg:null},quote);assert.equal(noCost.pnl,null);assert.equal(noCost.pnlPct,null);assert.equal(noCost.value,4600);
 const noQty=pairLiveQuote({...holding,quantity:null},quote);assert.equal(noQty.value,null);assert.equal(noQty.pnl,null);
 assert.equal(pairLiveQuote(holding,{...quote,quoteDelayMinutes:'15'}).delayMinutes,null,'string delay is unknown');
 const noPrev=pairLiveQuote(holding,{...quote,previousClose:null,quoteDelayMinutes:null});assert.equal(noPrev.dayPct,null);assert.equal(noPrev.delayMinutes,null);
});

test('older API responses without status fields are inferred conservatively',()=>{
 const {quoteStatus,historyStatus,...old}=quote;
 assert.equal(pairLiveQuote(holding,old).price,2300);
 assert.equal(pairLiveQuote(holding,{...old,price:null}),null);
});

test('estimates stay in the instrument currency: a USD holding in a EUR account gets no converted value',()=>{
 const usd=pairLiveQuote({saxoSymbol:'MSFT:xnas',currency:'USD',assetType:'Stock',quantity:1,avg:505.57},{...quote,symbol:'MSFT:xnas',currency:'USD',price:510});
 assert.equal(usd.currency,'USD');assert.equal(usd.value,510);assert.ok(Math.abs(usd.pnl-4.43)<1e-9);
 assert.equal(Object.keys(usd).some(k=>/eur|base|fx/i.test(k)),false);
});
