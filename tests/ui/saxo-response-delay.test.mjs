import assert from 'node:assert/strict';
import test from 'node:test';
import {saxoDelayLabel,saxoResponseMeta,saxoRetainedSnapshot} from '../../src/Banking.Api/wwwroot/saxo-session.js';
import {investmentMarketData} from '../../src/Banking.Api/wwwroot/wealth-ui.js';
const en=(a,b)=>a,da=(a,b)=>b;
const response=(over={})=>({source:'Saxo LIVE',symbol:'MSFT:xnas',currency:'USD',range:'1mo',price:14,quoteStatus:'available',historyStatus:'available',
 bars:[{time:1,close:12},{time:2,close:13}],chartDelayMinutes:15,quoteDelayMinutes:0,historyRetrievedAt:'2026-10-01T10:00:01Z',retrievedAt:'2026-10-01T10:00:02Z',...over});
const meta=d=>saxoResponseMeta(d,{L:en,locale:'en-GB'}).join(' | ');
test('chart and price labels use positive, zero and unknown response delays in both languages',()=>{
 assert.equal(saxoDelayLabel('history',15,en),'Chart · 15 min delayed');
 assert.equal(saxoDelayLabel('quote',15,en),'Price · 15 min delayed');
 assert.equal(saxoDelayLabel('quote',0,en),'Price · No reported delay');
 assert.equal(saxoDelayLabel('history',0,da),'Graf · Ingen oplyst forsinkelse');
 assert.equal(saxoDelayLabel('quote',15,da),'Kurs · 15 min forsinket');
 assert.equal(saxoDelayLabel('quote',0.5,da),'Kurs · 0,5 min forsinket');
 for(const value of [null,undefined,-1,NaN,'15']){
  assert.equal(saxoDelayLabel('quote',value,en),'Price · Delay unknown');
  assert.equal(saxoDelayLabel('history',value,da),'Graf · Forsinkelse ukendt');
 }
});
test('differing part delays and retrieval timestamps never borrow from legacy text or retrieval age',()=>{
 const d=response({delay:'Chart: delayed 99 min; quote: delayed 99 min',quoteTime:'2020-01-01T00:00:00Z'});
 assert.match(meta(d),/Chart · 15 min delayed/);assert.match(meta(d),/Price · No reported delay/);
 assert.match(meta(d),/Chart retrieved · .*:01/);assert.match(meta(d),/Price retrieved · .*:02/);
 assert.doesNotMatch(meta(d),/99 min|real.time/i);
 assert.match(meta(response({chartDelayMinutes:null,quoteDelayMinutes:null})),/Chart · Delay unknown.*Price · Delay unknown/);
});
test('transient retained snapshots keep exact matching metadata; a subsequent response replaces it atomically',()=>{
 const fresh=response(),retained=saxoRetainedSnapshot(fresh);
 assert.equal(retained.bars,fresh.bars);assert.equal(retained.price,fresh.price);
 for(const k of ['chartDelayMinutes','quoteDelayMinutes','historyRetrievedAt','retrievedAt'])assert.equal(retained[k],fresh[k]);
 assert.equal(fresh.historyStatus,'available');assert.equal(retained.historyStatus,'stale');assert.equal(retained.quoteStatus,'stale');
 assert.equal((meta(retained).match(/Update failed · showing previous data/g)||[]).length,2);
 const next=response({chartDelayMinutes:0,quoteDelayMinutes:25,historyRetrievedAt:'2026-10-01T10:01:03Z',retrievedAt:'2026-10-01T10:01:04Z'});
 assert.match(meta(next),/Chart · No reported delay.*Price · 25 min delayed/);assert.doesNotMatch(meta(next),/Update failed/);
});
test('partial failures label only the failed part and never date retained history with a fresh price',()=>{
 const chartStale=response({historyStatus:'stale',stale:true,retrievedAt:'2026-10-01T10:02:05Z'});
 assert.match(meta(chartStale),/Chart · Update failed/);assert.doesNotMatch(meta(chartStale),/Price · Update failed/);
 assert.match(meta(chartStale),/Chart retrieved · .*:01.*Price retrieved · .*:05/);
 const denied=response({quoteStatus:'denied',price:null,quoteDelayMinutes:15});
 assert.match(meta(denied),/Chart · 15 min delayed/);assert.doesNotMatch(meta(denied),/Price ·/);
 const onlyPrice=response({historyStatus:'denied',bars:[]});assert.doesNotMatch(meta(onlyPrice),/Chart ·/);assert.match(meta(onlyPrice),/Price · No reported delay/);
});
test('missing history retrieval timestamp stays unknown; normalized stale quote stays unusable',()=>{
 assert.match(meta(response({historyRetrievedAt:null})),/Chart retrieved · —/);
 const normalized=investmentMarketData(saxoRetainedSnapshot(response()));
 assert.equal(normalized.quoteStatus,'stale');assert.equal(normalized.chartDelayMinutes,15);assert.equal(normalized.quoteDelayMinutes,0);
});
