import test from 'node:test';import assert from 'node:assert/strict';
import {upcomingStockEvents,stockIllustration,employeeStockQuote,stockTimeline,stockHoldingIllustration,renderEmployeeStockReport} from '../../src/Banking.Api/wwwroot/employee-stock-ui.js';
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

test('optional MSFT research quote validates exact listing/currency/time while history failure is independent',()=>{
 const now=Date.parse('2026-10-16T12:00:00Z'),q={source:'Saxo LIVE',symbol:'MSFT:xnas',currency:'USD',assetType:'Stock',price:241,quoteStatus:'available',quoteTime:'2026-10-16T11:45:00Z',retrievedAt:'2026-10-16T11:59:00Z',quoteDelayMinutes:15,historyStatus:'unavailable'};
 assert.deepEqual(employeeStockQuote(q,now),{price:241,observedAt:'2026-10-16T11:45:00.000Z',retrievedAt:'2026-10-16T11:59:00.000Z',delayMinutes:15});
 assert.equal(employeeStockQuote({...q,quoteDelayMinutes:null},now).delayMinutes,null);
 for(const change of [{symbol:'MSFT:other'},{currency:'DKK'},{source:'Other'},{assetType:'FxSpot'},{price:0},{price:Infinity},{quoteStatus:'stale'},{quoteStatus:'denied'},{quoteTime:null},{retrievedAt:'2026-10-16T11:00:00Z'},{quoteTime:'2026-10-01T12:00:00Z'},{quoteTime:'2026-10-17T12:00:00Z'},{quoteDelayMinutes:-1}])assert.equal(employeeStockQuote({...q,...change},now),null);
});

for(const lang of ['en','da'])test(`historical money cells render currency markup, preserve unknowns and escape source text (${lang})`,()=>{
 const payload='<img src=x onerror=alert(1)>',source={sheet:payload,row:2};
 const report={parserVersion:'synthetic',warnings:[],schedules:[],
  grants:[0,null,payload].map((grantPrice,i)=>({key:'g'+i,type:payload,awardDate:'2024-03-01',awarded:10,vested:1,unvested:9,grantPrice,source})),
  transactions:[1234.5,null,payload].map((historicalFairMarketValue,i)=>({grantKey:'g'+i,date:'2025-03-03',quantity:1,netShares:1,historicalFairMarketValue,source}))};
 const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const format=n=>new Intl.NumberFormat(lang==='da'?'da-DK':'en-GB',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
 // Same markup-producing formatter contract as app.js, rather than a plain-text test double.
 const money=(n,c)=>n==null?'—':`<span class="money">${format(n)}<span class="money-currency"> ${e(c)}</span></span>`;
 const field={value:'',valueAsNumber:NaN,validity:{valid:true}},chart={innerHTML:'',querySelectorAll:()=>[],querySelector:()=>({innerHTML:''})};
 const root={innerHTML:'',querySelector:id=>id==='#stock-live-quote'?null:id==='#stock-cutoff'?{...field,value:'2026-10-16'}:id==='#stock-chart'?chart:field,querySelectorAll:()=>[]};
 renderEmployeeStockReport(root,report,{S:{seq:1,mode:'Demo',owner:false,lang},e,money,date:x=>x,today:()=>'2026-10-16'});
 assert.ok(root.innerHTML.includes(`<td>${money(1234.5,'USD')}</td>`));
 assert.ok(root.innerHTML.includes(`<td>${money(0,'USD')}</td>`)); // Known zero grant price is not an unknown/current quote.
 assert.ok((root.innerHTML.match(/<td>—<\/td>/g)||[]).length>=4); // Missing and nonnumeric money never becomes NaN or markup.
 assert.doesNotMatch(root.innerHTML,/&lt;span class=&quot;money|<img|onerror="|NaN|Infinity/);
 assert.ok(root.innerHTML.includes(e(payload))); // Text columns retain escaping, including sheet/type labels.
});

test('calendar timeline keeps empty months, inclusive dates, fractions and actual weekend delivery dates',()=>{
 const report={schedules:[{date:'2026-11-30',shares:10.125,matchedPastVesting:0},{date:'2027-02-28',shares:8,matchedPastVesting:0},{date:'2026-09-01',shares:9,matchedPastVesting:0},{date:'2025-11-30',shares:12,matchedPastVesting:12}],transactions:[{type:'StockAwardVest',date:'2025-12-01',quantity:12}]};
 const monthly=stockTimeline(report,'2026-11-30',{range:'12'});assert.equal(monthly.bins.length,12);assert.equal(monthly.bins[0].key,'2026-11');assert.equal(monthly.bins[0].conditional,10.125);assert.equal(monthly.bins[1].conditional,0);assert.equal(monthly.events.reduce((s,x)=>s+x.shares,0),18.125);
 const yearly=stockTimeline(report,'2026-11-30',{range:'all',period:'year'});assert.deepEqual(yearly.bins.map(b=>[b.key,b.conditional]),[['2026',10.125],['2027',8]]);
 const history=stockTimeline(report,'2026-11-30',{range:'all',history:true});assert.deepEqual(history.events.map(x=>[x.date,x.kind,x.shares]),[['2025-12-01','history',12],['2026-11-30','conditional',10.125],['2027-02-28','conditional',8]]);assert.equal(history.bins[0].key,'2025-12');assert.equal(report.schedules[2].matchedPastVesting,0);
 assert.equal(stockTimeline(report,'2026-12-01',{range:'all',period:'year'}).events.reduce((s,x)=>s+x.shares,0),8);
});

test('held illustration is independent of 360 inclusion, with known zero distinct from missing assumptions',()=>{
 const unmapped={currentHeldShares:12.5,includeInWealth:false};assert.deepEqual(stockHoldingIllustration(unmapped,200,6.25),{usd:2500,dkk:15625});
 assert.deepEqual(stockHoldingIllustration({...unmapped,includeInWealth:true},200,6.25),{usd:2500,dkk:15625});
 assert.deepEqual(stockHoldingIllustration(unmapped,NaN,NaN),{usd:null,dkk:null});assert.deepEqual(stockHoldingIllustration({...unmapped,currentHeldShares:null},200,6.25),{usd:null,dkk:null});
 assert.deepEqual(stockHoldingIllustration({...unmapped,currentHeldShares:0},NaN,NaN),{usd:0,dkk:0});
});
