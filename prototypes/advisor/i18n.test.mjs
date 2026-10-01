import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
const load=async path=>import('data:text/javascript;base64,'+Buffer.from(await readFile(new URL(path,import.meta.url),'utf8')).toString('base64'));
const advisor=await load('./public/i18n.js');
const banking=await load('../../src/Banking.Api/wwwroot/i18n.js');
test('interface translation keys have Danish entries in both shells',async()=>{
 for(const [dir,dict] of [['./public/',advisor.da],['../../src/Banking.Api/wwwroot/',banking.da]]){
  const missing=[];for(const file of await readdir(new URL(dir,import.meta.url))){if(!file.endsWith('.js')||file==='i18n.js')continue;const source=await readFile(new URL(dir+file,import.meta.url),'utf8');for(const match of source.matchAll(/\bt\('([^']*)'\)/g))if(match[1]&&!Object.hasOwn(dict,match[1]))missing.push(`${file}: ${match[1]}`);}
  assert.deepEqual(missing,[]);
 }
});
test('advisor language switches in both directions without translating user content',()=>{
 globalThis.document={documentElement:{lang:'da'}};
 assert.equal(advisor.t('Ask your advisor…'),'Spørg din rådgiver…');
 assert.equal(advisor.t('My own saved title'),'My own saved title');
 assert.equal(advisor.locale(),'da-DK');
 document.documentElement.lang='en';
 assert.equal(advisor.t('Ask your advisor…'),'Ask your advisor…');
 assert.equal(advisor.locale(),'en-GB');
 delete globalThis.document;
});
