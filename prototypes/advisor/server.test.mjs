import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startPrototype, validateArtifact, markdown, demo } from './server.mjs';

test('artifact input boundaries and non-executing Markdown', () => {
 const valid={title:'Example',format:'html',content:'<h1>Hello</h1>',fallback:'Hello',state:{extra:2000}};
 assert.deepEqual(validateArtifact(valid),valid);
 assert.throws(()=>validateArtifact({...valid,format:'javascript'}));
 assert.throws(()=>validateArtifact({...valid,content:'a'.repeat(100001)}));
 assert.throws(()=>validateArtifact({...valid,state:[]}));
 assert.throws(()=>validateArtifact({...valid,state:{large:'a'.repeat(8001)}}));
 const output=markdown('# Hello\n<script>alert(1)</script>\n**Clear**\n```html\n<img src=x onerror=alert(1)>');
 assert.match(output,/<h1>Hello<\/h1>/);assert.match(output,/<strong>Clear<\/strong>/);
 assert.ok(!output.includes('<script>'));assert.ok(!output.includes('<img'));assert.ok(output.endsWith('</code></pre></article>'));
});
test('synthetic examples reconcile', () => {
 assert.equal(demo.income-demo.expenses-demo.savings,demo.available);
 assert.equal(demo.categories.reduce((n,c)=>n+c.amount,0),demo.expenses);
 assert.equal(Math.ceil((demo.goal.target-demo.goal.balance)/demo.goal.monthly),44);
 assert.equal(Math.ceil((demo.goal.target-demo.goal.balance)/(demo.goal.monthly+2000)),32);
 assert.equal(demo.available-2000,10000);
});
test('local API persistence, isolation and render boundaries', async t => {
 const storageRoot=await mkdtemp(path.join(os.tmpdir(),'banking-advisor-test-'));
 let server=await startPrototype({port:5750,renderPort:5751,storageRoot});
 t.after(()=>server.close());
 const origin=server.origin;
 const bootstrap=async()=>{const response=await fetch(origin+'/api/workspace');return {cookie:response.headers.get('set-cookie').split(';')[0],data:await response.json(),header:response.headers.get('set-cookie')};};
 const first=await bootstrap(), second=await bootstrap();
 const request=(endpoint,data,cookie=first.cookie,extra={})=>fetch(origin+endpoint,{method:data===undefined?'GET':'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json',...extra},body:data===undefined?undefined:JSON.stringify(data)});
 const artifact={title:'A new layout – æøå',format:'html',content:'<style>h1{color:var(--accent)}</style><h1>Independent layout</h1><script>window.custom=true;</script>',fallback:'An independent synthetic layout.',state:{extra:2000}};
 let saved;
 await t.test('cookie is HttpOnly, Strict and API-path scoped',()=>{assert.match(first.header,/HttpOnly/);assert.match(first.header,/SameSite=Strict/);assert.match(first.header,/Path=\/api/);assert.notEqual(first.cookie,second.cookie);});
 await t.test('creates complete arbitrary artifact and rejects foreign workspace updates',async()=>{
  let r=await request('/api/artifacts',artifact);assert.equal(r.status,200);saved=await r.json();assert.equal(saved.revisions[0].title,artifact.title);
  assert.equal((await request('/api/artifacts',{...artifact,id:saved.id},second.cookie)).status,404);
  const other=await (await request('/api/workspace',undefined,second.cookie)).json();assert.equal(other.artifacts.length,0);
 });
 await t.test('saves a second revision without overwriting the first',async()=>{
  const r=await request('/api/artifacts',{...artifact,id:saved.id,content:'<h2>A completely revised layout</h2>',state:{extra:3500}});assert.equal(r.status,200);
  const updated=await r.json();assert.equal(updated.revisions.length,2);assert.equal(updated.revisions[0].state.extra,2000);assert.equal(updated.revisions[1].state.extra,3500);
  assert.equal(updated.revisions[0].content,artifact.content);assert.match(updated.revisions[1].content,/completely revised/);
 });
 await t.test('rejects cross-origin writes, missing session, bad format and size',async()=>{
  assert.equal((await request('/api/artifacts',artifact,first.cookie,{Origin:'https://untrusted.example'})).status,403);
  assert.equal((await request('/api/artifacts',artifact,'')).status,401);
  assert.equal((await request('/api/artifacts',{...artifact,format:'unknown'})).status,400);
  assert.equal((await request('/api/artifacts',{...artifact,content:'x'.repeat(170000)})).status,413);
  const r=await fetch(origin+'/api/artifacts',{method:'POST',headers:{Cookie:first.cookie,'Content-Type':'application/json'},body:JSON.stringify(artifact)});assert.equal(r.status,403);
 });
 await t.test('renderer has opaque sandbox, restrictive CSP and no cookies',async()=>{
  const rendered=await (await request('/api/render',artifact)).json();const r=await fetch(rendered.url);
  assert.equal(r.status,200);assert.equal(r.headers.get('set-cookie'),null);
  const csp=r.headers.get('content-security-policy');
  for(const directive of ["connect-src 'none'","frame-src 'none'","form-action 'none'","base-uri 'none'",'sandbox allow-scripts'])assert.ok(csp.includes(directive));
  assert.ok(!csp.includes('allow-same-origin'));assert.ok(!csp.includes('allow-popups'));assert.ok(!csp.includes('allow-top-navigation'));
  assert.match(await r.text(),/Independent layout/);
  assert.equal((await fetch(server.renderer+'/artifact/not-a-token')).status,404);
  assert.equal((await fetch(server.renderer+'/api/workspace')).status,404);
 });
 await t.test('examples are complete and formatted, host cannot frame external sites',async()=>{
  const samples=await (await request('/api/examples')).json();assert.equal(samples.length,3);
  for(const sample of samples)assert.doesNotThrow(()=>validateArtifact(sample));
  const r=await fetch(origin+'/');assert.ok(r.headers.get('content-security-policy').includes(`frame-src ${server.renderer}`));
  assert.equal(r.headers.get('content-security-policy').split('frame-ancestors ')[1], "'self' http://127.0.0.1:5750 https://localhost:5443");
  assert.equal((await fetch(origin+'/server.mjs')).status,404);
 });
 await t.test('saved previews use a small scoped reference instead of reposting a large visual',async()=>{
  const large={...artifact,id:saved.id,content:'<h1>Large saved visual</h1><!--'+'x'.repeat(70000)+'-->'};
  assert.equal((await request('/api/artifacts',large)).status,200);
  const reference={artifactId:saved.id,revision:3,state:{extra:4000}};
  assert.ok(JSON.stringify(reference).length<1000);
  const r=await request('/api/render',reference);assert.equal(r.status,200);
  assert.match(await (await fetch((await r.json()).url)).text(),/Large saved visual/);
  assert.equal((await request('/api/render',reference,second.cookie)).status,404);
  assert.equal((await request('/api/render',{...reference,revision:99})).status,404);
  assert.equal((await request('/api/render',{...reference,state:[]})).status,400);
  assert.equal((await request('/api/render',{...reference,revision:0})).status,400);
  const patch={id:saved.id,baseRevision:3,state:{extra:4500}};
  assert.equal((await request('/api/artifacts',patch,second.cookie)).status,404);
  assert.equal((await request('/api/artifacts',{...patch,baseRevision:99})).status,404);
  assert.equal((await request('/api/artifacts',{...patch,state:[]})).status,400);
  const updated=await (await request('/api/artifacts',patch)).json();
  assert.equal(updated.revisions.length,4);assert.equal(updated.revisions[3].content,large.content);assert.equal(updated.revisions[3].state.extra,4500);assert.equal(updated.revisions[2].state.extra,2000);
 });
 await t.test('workspace and theme survive server restart',async()=>{
  await request('/api/theme',{theme:'sand'});await server.close();
  server=await startPrototype({port:5750,renderPort:5751,storageRoot});
  const ws=await (await request('/api/workspace')).json();assert.equal(ws.theme,'sand');assert.equal(ws.artifacts[0].revisions.length,4);assert.equal(ws.artifacts[0].revisions[1].state.extra,3500);
  const stored=JSON.parse(await readFile(path.join(storageRoot,first.cookie.split('=')[1]+'.json'),'utf8'));assert.equal(stored.artifacts.length,1);
 });
});
