import assert from 'node:assert/strict';
import test from 'node:test';
import {beginSaxoSignIn,finishSaxoSignIn,saxoEnvironment} from '../../src/Banking.Api/wwwroot/saxo-session.js';

test('LIVE market-data authorization preserves SIM trading selection and posts only completion proof',async()=>{
 const storage=new Map([['banking.saxo.environment','SIM']]);
 globalThis.sessionStorage={setItem:(k,v)=>storage.set(k,v),getItem:k=>storage.get(k),removeItem:k=>storage.delete(k)};
 globalThis.location={href:'https://localhost:5444/#/markets',assign:url=>{globalThis.location.href=url;}};
 globalThis.history={replaceState:(_,__,url)=>{globalThis.location.href=url;}};
 beginSaxoSignIn({environment:'LIVE',authorizationUrl:'https://live.logonvalidation.net/authorize?state=synthetic-state',completionProof:'synthetic-proof'},{purpose:'market-data',tradingEnvironment:'SIM'});
 assert.equal(saxoEnvironment('Live'),'SIM');
 globalThis.location.href='https://localhost:5444/?saxoComplete=synthetic-state#/markets';
 const completed=await finishSaxoSignIn(async(path,options)=>{assert.equal(path,'investments/saxo/connect/complete');assert.deepEqual(JSON.parse(options.body),{state:'synthetic-state',proof:'synthetic-proof'});return {environment:'LIVE'};});
 assert.equal(completed.environment,'LIVE');assert.equal(completed.tradingEnvironment,'SIM');assert.equal(completed.purpose,'market-data');
 assert.equal(storage.has('banking.saxo.oauth'),false);assert.equal(saxoEnvironment('Demo'),'SIM');
});
