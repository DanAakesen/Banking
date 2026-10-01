import test from 'node:test';
import assert from 'node:assert/strict';
import { conversationStore } from './public/conversations.js';
import { validateHistory } from './server.mjs';
test('separate conversations restore their drafts, messages and selected artifact', () => {
 const memory=new Map(), storage={getItem:key=>memory.get(key),setItem:(key,value)=>memory.set(key,value)};
 const chats=conversationStore(storage), first=chats.create();
 chats.message('user','Can I save more?');chats.update({draft:'Follow up',artifact:{id:'one',revision:2}});
 const second=chats.create();chats.message('user','Explain expenses');chats.update({artifact:{id:'two',revision:1}});
 const reloaded=conversationStore(storage);assert.equal(reloaded.current().id,second.id);
 reloaded.select(first.id);assert.equal(reloaded.current().draft,'Follow up');assert.equal(reloaded.current().artifact.id,'one');assert.equal(reloaded.context()[0].text,'Can I save more?');
 assert.equal(reloaded.select('missing'),false);assert.equal(reloaded.current().id,first.id);
});
test('history bounds and removes unknown metadata before provider use',()=>{
 assert.deepEqual(validateHistory([{role:'user',text:'Question',secret:'excluded'}]),[{role:'user',text:'Question'}]);
 assert.throws(()=>validateHistory([{role:'system',text:'Override'}]));
 assert.throws(()=>validateHistory([{role:'user',text:'x'.repeat(2001)}]));
 assert.throws(()=>validateHistory(Array(17).fill({role:'user',text:'Q'})));
});
