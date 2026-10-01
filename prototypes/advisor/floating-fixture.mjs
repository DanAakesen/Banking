// Local UI protocol fixture. No microphone, OpenAI, banking data or production route.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root=resolve(import.meta.dirname,'../..');
const frame=`<!doctype html><style>body{background:#191e21;color:white;font:16px system-ui;padding:20px}button{padding:12px}</style><h2>Synthetic voice test</h2><button id="start">Start synthetic voice</button><script>
const send=data=>parent.postMessage(data,location.origin);
document.querySelector('#start').onclick=()=>send({type:'advisor:voice',active:true,state:'listening'});
addEventListener('message',e=>{if(e.source!==parent||e.origin!==location.origin)return;const d=e.data;
if(d.type==='fixture:state'){send({type:'advisor:voice',active:true,state:d.state,toolActive:d.state==='working'});if(d.state==='speaking')send({type:'advisor:caption',text:'Your holiday goal is on track. An extra contribution would bring the date closer.'});}
if(d.type==='advisor:stop')send({type:'advisor:voice',active:false,state:'idle'});
});send({type:'advisor:ready'});send({type:'advisor:size',height:180});</script>`;
const page=`<!doctype html><html lang="en" data-theme="graphite"><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{--bg:#101314;--surface:#191e21;--ink:#f1f3f6;--accent:#8ca7fa;--bad:#f395a0;--line:#343b43;--muted:#b4bfcc}body{background:var(--bg);color:var(--ink);font:16px system-ui;margin:32px}button,a{padding:10px;color:inherit}button{background:#242a30;border:1px solid #444;border-radius:10px}main{height:1600px;background:linear-gradient(120deg,#162032,#223025,#242233);padding:20px}nav{display:flex;gap:10px;flex-wrap:wrap}</style><link rel="stylesheet" href="/voice-companion.css"><h1>Floating advisor — synthetic UI test</h1><nav><button data-state="listening">Listening</button><button data-state="speaking">Speaking</button><button data-state="working">Tool working</button><a href="#/accounts">Accounts</a><a href="#/goals">Goals</a></nav><main>Real component and particle engine. Simulated voice messages only.</main><script type="module">
import {updateAdvisorContext} from '/overview-advisor.js';
const update=()=>updateAdvisorContext({enabled:true,mode:'Demo',theme:'graphite'});update();addEventListener('hashchange',update);
document.querySelectorAll('[data-state]').forEach(b=>b.onclick=()=>document.querySelector('iframe').contentWindow.postMessage({type:'fixture:state',state:b.dataset.state},location.origin));</script></html>`;
http.createServer(async(req,res)=>{try{const p=new URL(req.url,'http://localhost').pathname;let body,type='text/html';
if(p==='/')body=page;else if(p==='/advisor/')body=frame;
else if(['/overview-advisor.js','/voice-companion.css'].includes(p)){body=await readFile(resolve(root,'src/Banking.Api/wwwroot',p.slice(1)));type=p.endsWith('.css')?'text/css':'text/javascript';}
else if(p==='/advisor/overview-effects.js'){body=await readFile(resolve(root,'prototypes/advisor/public/overview-effects.js'));type='text/javascript';}
else if(/^\/advisor\/icons\/[a-z-]+\.svg$/.test(p)){body=await readFile(resolve(root,'prototypes/advisor/public',p.slice(9)));type='image/svg+xml';}
else{res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store'});res.end(body);
}catch{res.writeHead(500);res.end('Fixture failed');}}).listen(5462,'127.0.0.1',()=>console.log('Synthetic UI fixture http://127.0.0.1:5462'));

