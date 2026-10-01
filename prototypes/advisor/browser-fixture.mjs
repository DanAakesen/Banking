// Disposable browser QA host. No product database, bank adapter or AI provider.
import http from 'node:http';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startPrototype } from './server.mjs';
const storageRoot=await mkdtemp(path.join(os.tmpdir(),'banking-advisor-browser-'));
const app=await startPrototype({port:5770,renderPort:5771,storageRoot});
let hits=0;
const trap=http.createServer((req,res)=>{if(req.url==='/count'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({hits}));}else{hits++;res.end('Unexpected request reached the test receiver.');}});
await new Promise(r=>trap.listen(5772,'127.0.0.1',r));
// Print no cookie or session token. The browser imports the probe through the regular UI.
console.log('Disposable browser QA: '+app.origin);
