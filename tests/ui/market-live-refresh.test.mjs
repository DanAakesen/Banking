import assert from 'node:assert/strict';
import test from 'node:test';
import {saxoFeed,saxoClock,saxoGapNote,saxoLivePoll,SAXO_SHORT_RANGES,SAXO_LIVE_REFRESH_MS} from '../../src/Banking.Api/wwwroot/saxo-session.js';
import {investmentMarketData} from '../../src/Banking.Api/wwwroot/wealth-ui.js';

test('Saxo delay: delayed for positive minutes, "no reported delay" for zero, unknown otherwise; never real-time',()=>{
 assert.deepEqual(saxoFeed(15),{kind:'delayed',minutes:15});
 assert.deepEqual(saxoFeed(0),{kind:'none-reported',minutes:0});
 for(const missing of [null,undefined,'',' ','0','15',-1,NaN,Infinity,{}])assert.deepEqual(saxoFeed(missing),{kind:'unknown',minutes:null},String(missing));
 for(const m of [0,1,15,null])assert.notEqual(saxoFeed(m).kind,'real-time');
});

test('Short ranges poll every 15–30 s only while visible and not blocked',()=>{
 assert.deepEqual(SAXO_SHORT_RANGES,['1h','1d']);
 assert.ok(SAXO_LIVE_REFRESH_MS>=15000&&SAXO_LIVE_REFRESH_MS<=30000);
 assert.equal(saxoLivePoll({range:'1h',visible:true,blocked:false}),SAXO_LIVE_REFRESH_MS);
 assert.equal(saxoLivePoll({range:'1d',visible:true,blocked:false}),SAXO_LIVE_REFRESH_MS);
 assert.equal(saxoLivePoll({range:'5d',visible:true,blocked:false}),null);
 assert.equal(saxoLivePoll({range:'1mo',visible:true,blocked:false}),null);
 assert.equal(saxoLivePoll({range:'1h',visible:false,blocked:false}),null,'hidden tab pauses');
 assert.equal(saxoLivePoll({range:'1d',visible:true,blocked:true}),null,'sign-in required or access denied stops');
});

test('Updated time shows seconds and never invents a time',()=>{
 assert.match(saxoClock('2026-09-29T10:15:07Z','en-GB'),/\d{2}:\d{2}:07/);
 assert.equal(saxoClock(null,'en-GB'),'—');assert.equal(saxoClock('not a time','en-GB'),'—');
});

test('Investments keeps the interval and Saxo missing-interval count, and nothing else from the sample summary',()=>{
 const base={source:'Saxo LIVE',symbol:'VWS:xcse',currency:'DKK',price:195,historyStatus:'available',quoteStatus:'available',bars:[{time:1,open:1,high:1,low:1,close:1}]};
 const m=investmentMarketData({...base,interval:'1m',historySamples:{received:600,kept:420,outsidePeriod:180,missingIntervals:10,dropped:{total:0}}});
 assert.equal(m.interval,'1m');assert.equal(m.missingIntervals,10);assert.equal('historySamples' in m,false);
 const old=investmentMarketData(base);assert.equal(old.interval,null);assert.equal(old.missingIntervals,null);
 assert.equal(investmentMarketData({...base,interval:'<b>',historySamples:{missingIntervals:-1}}).missingIntervals,null);
 assert.equal(investmentMarketData({...base,interval:'<b>'}).interval,null);
});

test('Missing Saxo intervals become one honest line, and nothing is shown when none or unknown',()=>{
 const en=(a)=>a,da=(a,b)=>b;
 assert.equal(saxoGapNote({missing:10,interval:'15m'},en),'Saxo sent no data for some 15-minute intervals (10 missing).');
 assert.equal(saxoGapNote({missing:3,interval:'1m'},da),'Saxo sendte ingen data for nogle 1-minutters intervaller (3 mangler).');
 for(const x of [{missing:0,interval:'1m'},{missing:null,interval:'1m'},{missing:-2,interval:'1m'},{missing:2.5,interval:'1m'},{missing:4,interval:'1d'},{missing:4,interval:null},{missing:'4',interval:'1m'}])assert.equal(saxoGapNote(x,en),'',JSON.stringify(x));
});
