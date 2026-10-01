import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const app=await readFile(new URL('./public/app.js',import.meta.url),'utf8');
const source=app.slice(app.indexOf('let messageScrollFrame;'),app.indexOf('function drawMessages()'));
function harness(){
 let frameId=0,bottom=1100;const frames=new Map(),calls=[];
 const scroll={addEventListener(){},querySelector(){return {addEventListener(){}};},scrollTop:0,scrollHeight:1400,getBoundingClientRect:()=>({bottom:600}),scrollTo(value){calls.push(value);this.scrollTop=value.top;}};
 const messages={lastElementChild:{getBoundingClientRect:()=>({bottom})}};
 const context={$:id=>id==='messages'?messages:scroll,requestAnimationFrame:fn=>{frames.set(++frameId,fn);return frameId;},cancelAnimationFrame:id=>frames.delete(id)};
 vm.runInNewContext(source+'\nthis.follow=followLatestMessage;this.reopen=scrollReopenedChat;',context);
 return {scroll,calls,messages,follow:context.follow,reopen:context.reopen,setBottom:value=>bottom=value,flush:()=>{const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn());},get pending(){return frames.size;}};
}
test('new messages and growing voice text keep the latest message bottom visible',()=>{
 const h=harness();h.follow();h.flush();assert.equal(h.scroll.scrollTop,516);
 h.setBottom(660);h.follow();h.flush();assert.equal(h.scroll.scrollTop,592);
 assert.equal(h.calls.at(-1).behavior,'instant');
});
test('rapid transcript deltas coalesce and use the latest layout',()=>{
 const h=harness();for(let i=0;i<20;i++){h.setBottom(900+i);h.follow();}
 assert.equal(h.pending,1);h.flush();assert.equal(h.calls.length,1);assert.equal(h.scroll.scrollTop,335);
});
test('empty and short chats do not produce invalid scroll positions',()=>{
 const h=harness();h.setBottom(100);h.follow();h.flush();assert.equal(h.scroll.scrollTop,0);
 h.messages.lastElementChild=null;h.follow();h.flush();assert.equal(h.calls.length,1);
});
test('reopening waits for layout and scrolls through activity to the actual bottom',()=>{
 const h=harness();h.reopen();h.flush();assert.equal(h.calls.length,0);
 h.scroll.scrollHeight=1800;h.flush();assert.equal(h.scroll.scrollTop,1800);
 assert.equal(h.calls[0].behavior,'instant');
});
