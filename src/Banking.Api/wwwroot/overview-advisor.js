import { createAdvisorGlass } from './advisor-glass.js';
// One authenticated advisor frame for the entire app; navigation never recreates a voice session.
const minimumChatWidth=280;
let resizeCleanup,glass,host,frame,pill,caption,orb,context={},presentation='panel',active=false,ready=false,pendingPrompt;
let ticket=0,raf,chatHeight=210,position,dragging=false,captionsOn=true,chatWidth=readWidth(),resizeAnchor=null;
let chatWorking=false,unreadReply=false,replyFailed=false;
const label=(en,da)=>document.documentElement.lang==='da'?da:en;
const companionLabels={"AI Bank Advisor": "AI-bankrådgiver", "Move chat. Arrow keys move; Home resets.": "Flyt chatten. Brug piletasterne; Home nulstiller.", "Drag to move chat": "Træk for at flytte chatten", "Resize chat width": "Tilpas chattens bredde", "Drag to resize chat · Left/Right arrows resize": "Træk for at tilpasse bredden · Brug venstre/højre pil", "Floating voice companion": "Flydende taleassistent", "Voice controls. Drag to move; arrow keys move; Home resets.": "Talestyring. Træk for at flytte; brug piletasterne; Home nulstiller.", "Stop voice": "Stop talesamtale", "Show chat": "Vis chat", "Hide captions": "Skjul undertekster", "Show captions": "Vis undertekster", "Voice controls": "Talestyring", "Listening": "Lytter", "Working": "Arbejder", "Check chat": "Se chatten", "Reply ready": "Svar klar", "Ready": "Klar", "Speaking": "Taler", "Thinking": "Tænker", "Searching": "Søger"};
const localLabel=value=>label(value,companionLabels[value]||value);
function localizeControls(){for(const root of [host,pill]){if(!root)continue;for(const el of [root,...root.querySelectorAll('[aria-label],[title]')])for(const attr of ['aria-label','title']){const key='original'+attr.replace('-','');const source=el.dataset[key]||el.getAttribute(attr);if(companionLabels[source]){el.dataset[key]=source;el.setAttribute(attr,localLabel(source));}}}}
const send=value=>frame?.contentWindow?.postMessage(value,location.origin);
const icon=name=>`<span class="companion-icon companion-icon-${name}" aria-hidden="true"></span>`;
// One bottom-right anchor shared by chat, minimized launcher and voice.
const positionKey='banking.floating-position.v3';
const viewport=()=>{const v=visualViewport;return {x:v?.offsetLeft||0,y:v?.offsetTop||0,w:v?.width||innerWidth,h:v?.height||innerHeight};};
function readWidth(){try{const n=Number(localStorage.getItem('banking.chat-width.v1'));if(Number.isFinite(n)&&n>=minimumChatWidth&&n<=10000)return n;}catch{}return 600;}
function readPosition(){try{const p=JSON.parse(localStorage.getItem(positionKey));if(Number.isFinite(p?.x)&&Number.isFinite(p?.y))return p;}catch{}}
function savePosition(p){try{if(p)localStorage.setItem(positionKey,JSON.stringify(p));else localStorage.removeItem(positionKey);}catch{}}
// Only an explicit idle-chat choice is remembered; voice minimizing is temporary.
const presentationKey='banking.floating-presentation.v1';
function readPresentation(){try{return localStorage.getItem(presentationKey)==='mini'?'mini':'panel';}catch{return 'panel';}}
function savePresentation(value){try{localStorage.setItem(presentationKey,value==='mini'?'mini':'panel');}catch{}}
function chatBottom(v){
 let bottom=v.y+v.h-12;
 if(matchMedia('(max-width:900px)').matches){
  const nav=document.querySelector('.bottom-nav'),r=nav?.getBoundingClientRect();
  if(r?.height&&r.width&&r.top>=v.y&&r.top<v.y+v.h)bottom=Math.min(bottom,r.top-12);
 }
 return bottom;
}
function clamp(p,w,h){const v=viewport();return {x:Math.max(v.x+12,Math.min(p.x,v.x+v.w-w-12)),y:Math.max(v.y+12,Math.min(p.y,chatBottom(v)-h))};}
function place(){
 if(!host)return;const v=viewport();
 const w=Math.min(chatWidth,v.w-24),h=Math.min(chatHeight,v.h-36,Math.max(0,chatBottom(v)-v.y-12));
 const def={x:v.x+(v.w-w)/2,y:v.y+v.h-h-(v.w<=700?84:24)};
 const anchor=resizeAnchor||(position?{right:position.x,bottom:position.y}:null);
 const p=clamp(anchor?{x:anchor.right-w,y:anchor.bottom-h}:def,w,h);
 Object.assign(host.style,{left:p.x+'px',top:p.y+'px',width:w+'px',height:h+'px'});
 const edge=host.querySelector('.advisor-resize');if(edge){edge.hidden=v.w<=minimumChatWidth+24;edge.setAttribute('aria-valuenow',String(Math.round(w)));edge.setAttribute('aria-valuemin',String(Math.min(minimumChatWidth,v.w-24)));edge.setAttribute('aria-valuemax',String(Math.floor(p.x+w-v.x-12)));}
 const miniWidth=active?164:84,miniHeight=active?184:112;
 const q=clamp(position?{x:position.x-miniWidth,y:position.y-miniHeight}:{x:p.x+w-miniWidth,y:p.y+h-miniHeight},miniWidth,miniHeight);
 if(active)q.y=Math.max(v.y+40,q.y);
 Object.assign(pill.style,{left:q.x+'px',top:q.y+'px',width:miniWidth+'px',height:miniHeight+'px'});
 pill.classList.toggle('caption-below',q.y-v.y<130);
 const cw=Math.min(280,v.w-24);caption.style.width=cw+'px';caption.style.left=(Math.max(v.x+12,Math.min(q.x+56-cw/2,v.x+v.w-cw-12))-q.x)+'px';
}
function layout(){cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>{if(!host)return;host.hidden=presentation==='mini';host.dataset.presentation=presentation;pill.hidden=presentation!=='mini';pill.dataset.active=String(active);pill.classList.toggle('is-idle',!active);pill.querySelector('.companion-stop').hidden=!active;place();});}
function updateCompanion(){
 if(!pill)return;localizeControls();const captionToggle=pill.querySelector('.companion-captions');captionToggle.title=localLabel(captionsOn?'Hide captions':'Show captions');captionToggle.setAttribute('aria-label',captionToggle.title);
 const selection=orb?.setVoice(active?lastVoice:{active:true,state:chatWorking?'working':'listening'});
 const text=active?(selection?.label||lastVoice.state||'Listening'):chatWorking?'Working':unreadReply?(replyFailed?'Check chat':'Reply ready'):'Ready';
 pill.dataset.state=active?lastVoice.state:chatWorking?'working':unreadReply?'unread':'ready';
 pill.querySelector('.companion-state').textContent=localLabel(text);
 const badge=pill.querySelector('.companion-unread');badge.hidden=active||!unreadReply;badge.dataset.error=String(replyFailed);
 badge.textContent=replyFailed?'!':'';
 const handle=pill.querySelector('.companion-orb');
 handle.setAttribute('aria-label',active?localLabel('Voice controls. Drag to move; arrow keys move; Home resets.'):`${localLabel(text)}. ${label('Open chat. Drag to move; arrow keys move; Home resets.','Åbn chatten. Træk for at flytte; brug piletasterne; Home nulstiller.')}`);
 handle.title=active?localLabel('Voice controls'):localLabel(text)+' · '+label('Open chat','Åbn chatten');
}
function present(value){if(value!==presentation){const current=presentation==='mini'?pill:host;if(current&&!current.hidden){const r=current.getBoundingClientRect();position={x:r.right,y:r.bottom};savePosition(position);}}presentation=value;if(!active)savePresentation(value);if(value==='panel'){unreadReply=replyFailed=false;}updateCompanion();layout();send({type:'advisor:presentation',value});}
function draggable(handle,target){
 let drag,suppress=false;
 handle.onpointerdown=e=>{if(e.button!==0)return;const r=target.getBoundingClientRect();drag={x:e.clientX,y:e.clientY,right:r.right,bottom:r.bottom};suppress=false;handle.setPointerCapture(e.pointerId);};
 handle.onpointermove=e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(dx,dy)>4)suppress=true;if(!suppress)return;dragging=true;position={x:drag.right+dx,y:drag.bottom+dy};place();};
 const end=()=>{if(!drag)return;drag=null;dragging=false;if(suppress){const r=target.getBoundingClientRect();position={x:r.right,y:r.bottom};savePosition(position);}};
 handle.onpointerup=end;handle.onpointercancel=end;
 handle.addEventListener('click',e=>{if(suppress){e.preventDefault();e.stopImmediatePropagation();suppress=false;}},true);
 handle.ondblclick=()=>{position=null;savePosition(null);place();};
 handle.onkeydown=e=>{if(e.key==='Home'){e.preventDefault();handle.ondblclick();return;}const d={ArrowLeft:[-16,0],ArrowRight:[16,0],ArrowUp:[0,-16],ArrowDown:[0,16]}[e.key];if(!d)return;e.preventDefault();const r=target.getBoundingClientRect(),p={x:r.right+d[0],y:r.bottom+d[1]};position=p;place();const placed=target.getBoundingClientRect();position={x:placed.right,y:placed.bottom};savePosition(position);};
}
function resizable(edge){
 let start;
 const limits=right=>{const v=viewport();return {min:Math.min(minimumChatWidth,v.w-24),max:Math.max(Math.min(minimumChatWidth,v.w-24),right-v.x-12)};};
 const apply=(width,right,bottom)=>{const range=limits(right);chatWidth=Math.max(range.min,Math.min(width,range.max));resizeAnchor={right,bottom};place();};
 const finish=()=>{if(!start)return;start=null;const r=host.getBoundingClientRect();position={x:r.right,y:r.bottom};resizeAnchor=null;delete host.dataset.resizing;savePosition(position);try{localStorage.setItem('banking.chat-width.v1',String(chatWidth));}catch{}layout();};
 edge.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();const r=host.getBoundingClientRect();start={x:e.clientX,width:r.width,right:r.right,bottom:r.bottom};resizeAnchor={right:r.right,bottom:r.bottom};host.dataset.resizing='true';edge.setPointerCapture(e.pointerId);};
 edge.onpointermove=e=>{if(start)apply(start.width+start.x-e.clientX,start.right,start.bottom);};
 edge.onpointerup=finish;edge.onpointercancel=finish;edge.onlostpointercapture=finish;
 // Pointer capture owns the gesture; the iframe stays interactive after release.
 const controller=new AbortController();
 window.addEventListener('pointerup',finish,{signal:controller.signal});window.addEventListener('blur',finish,{signal:controller.signal});
 resizeCleanup=()=>controller.abort();
 edge.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const r=host.getBoundingClientRect(),range=limits(r.right);start={};const step=e.shiftKey?40:16;apply(e.key==='Home'?range.min:e.key==='End'?range.max:r.width+(e.key==='ArrowLeft'?step:-step),r.right,r.bottom);finish();};
}
export function resetAdvisor(){resizeCleanup?.();resizeCleanup=null;resizeAnchor=null;ticket++;send({type:'advisor:stop'});orb?.dispose();glass?.destroy();glass=null;host?.remove();pill?.remove();host=frame=pill=caption=orb=null;active=ready=chatWorking=unreadReply=replyFailed=false;lastVoice={};presentation='panel';chatHeight=210;pendingPrompt=null;}
export function updateAdvisorContext(next){
 if(frame&&context.mode!==next.mode)resetAdvisor();context={...context,...next,sections:context.page===location.hash?context.sections:{},page:location.hash};
 if(next.enabled===false){resetAdvisor();return;}
 if(!frame&&context.enabled)create();
 send({type:'advisor:context',context});if(next.theme)send({type:'advisor:theme',theme:next.theme});layout();
}
export async function openAdvisor(prompt){
 if(!frame){const n=++ticket;const response=await fetch('/api/browser/status',{headers:{'X-Banking-Client':'web'}});if(n!==ticket||!response.ok||!(await response.json()).localAdvisor)return;if(!frame)create();}
 present('panel');if(typeof prompt==='string'&&prompt.trim()){pendingPrompt=prompt.slice(0,3500);if(ready){send({type:'advisor:prompt',prompt:pendingPrompt});pendingPrompt=null;}}
}
function create(){
 ready=false;host=document.createElement('section');host.id='banking-advisor-host';host.setAttribute('aria-label','AI Bank Advisor');
 const grip=document.createElement('button');grip.className='advisor-drag';grip.setAttribute('aria-label','Move chat. Arrow keys move; Home resets.');grip.title='Drag to move chat';grip.innerHTML='<span class="advisor-grip-icon" aria-hidden="true"></span>';host.append(grip);
 const edge=document.createElement('div');edge.className='advisor-resize';edge.tabIndex=0;edge.setAttribute('role','separator');edge.setAttribute('aria-orientation','vertical');edge.setAttribute('aria-label','Resize chat width');edge.title='Drag to resize chat · Left/Right arrows resize';host.append(edge);resizable(edge);
 frame=document.createElement('iframe');frame.title='AI Bank Advisor';frame.allow='microphone';
 const params=new URLSearchParams({embedded:'1',floating:'1',lang:document.documentElement.lang||'en',theme:context.theme||'graphite',mode:context.mode||'Demo',from:context.from||'',to:context.to||'',currency:context.currency||'DKK',font:parseFloat(getComputedStyle(document.querySelector('.nav a')||document.body).fontSize)});
 if(new URLSearchParams(location.search).get('voiceTest')==='1')params.set('voiceTest','1');
 frame.src='/advisor/?'+params;host.append(frame);document.body.append(host);glass=createAdvisorGlass(host,frame);
 pill=document.createElement('aside');pill.id='banking-voice-companion';pill.hidden=true;pill.setAttribute('aria-label','Floating voice companion');
 pill.innerHTML=`<div class="companion-caption" hidden><span></span></div><button class="companion-orb" aria-label="Voice controls. Drag to move; arrow keys move; Home resets." aria-expanded="false"><canvas aria-hidden="true"></canvas></button><span class="companion-state" role="status"></span><div class="companion-actions"><button class="companion-stop" aria-label="Stop voice" title="Stop voice"><span></span></button><button data-companion="panel" aria-label="Show chat" title="Show chat">${icon('message-circle')}</button><button class="companion-captions" aria-label="Hide captions" aria-pressed="true" title="Hide captions">${icon('captions')}</button></div>`;
 document.body.append(pill);caption=pill.querySelector('.companion-caption');
 const badge=document.createElement('span');badge.className='companion-unread';badge.hidden=true;badge.setAttribute('aria-hidden','true');pill.querySelector('.companion-orb').append(badge);
 position=readPosition();presentation=readPresentation();draggable(grip,host);
 const handle=pill.querySelector('.companion-orb');draggable(handle,pill);handle.onclick=()=>{if(!active){present('panel');return;}const show=pill.classList.toggle('controls-open');handle.setAttribute('aria-expanded',String(show));};
 pill.onkeydown=e=>{if(e.key==='Escape'){pill.classList.remove('controls-open');handle.setAttribute('aria-expanded','false');handle.blur();}};
 pill.querySelectorAll('[data-companion]').forEach(b=>b.onclick=()=>present(b.dataset.companion));
 pill.querySelector('.companion-stop').onclick=()=>send({type:'advisor:stop'});
 pill.querySelector('.companion-captions').onclick=e=>{captionsOn=!captionsOn;e.currentTarget.setAttribute('aria-pressed',String(captionsOn));e.currentTarget.setAttribute('aria-label',localLabel(captionsOn?'Hide captions':'Show captions'));e.currentTarget.title=localLabel(captionsOn?'Hide captions':'Show captions');caption.hidden=!captionsOn||!caption.textContent;};
 const canvas=handle.querySelector('canvas'),instance=pill;
 updateCompanion();
 import('/advisor/overview-effects.js').then(({setupCompanionOrb})=>{if(pill!==instance)return;orb=setupCompanionOrb(canvas);updateCompanion();}).catch(()=>{if(pill===instance)pill.classList.add('orb-unavailable');});
 layout();
}
export async function mountOverviewAdvisor(root,next){
 updateAdvisorContext(next);root.querySelector('.ov-advisor')?.remove();root.querySelector('.ov-main-grid')?.classList.add('has-floating-advisor');
 for(const [selector,en,da] of [
  ['.ov-motion','Explain my income, expenses, savings and available money for the selected period. Use saved Banking figures and flag incomplete data.','Forklar min indkomst, mine udgifter, min opsparing og mit rådighedsbeløb for den valgte periode. Brug gemte banktal og gør opmærksom på manglende data.'],
  ['.ov-mix','Explain the main categories behind my spending in the selected period and suggest what to examine first.','Forklar de vigtigste kategorier i mit forbrug i den valgte periode, og foreslå hvad jeg bør se nærmere på først.'],
  ['.ov-journeys','Which of my saved goals are behind plan, why, and what contribution would help? Use their actual account balances and contribution history.','Hvilke af mine gemte mål er bagud, hvorfor, og hvilken indbetaling kan hjælpe? Brug deres faktiske kontosaldi og indbetalingshistorik.']
 ]){
  const panel=root.querySelector(selector);if(next.contextActions===false||!panel||panel.querySelector('.ov-context-action'))continue;
  const button=document.createElement('button');button.type='button';button.className='ov-context-action';button.textContent=label('Ask AI about this','Spørg AI om dette');
  button.onclick=()=>openAdvisor(label(en,da));panel.append(button);
 }
}
let lastVoice={};
window.addEventListener('message',event=>{
 if(!frame||event.source!==frame.contentWindow||event.origin!==location.origin)return;const data=event.data;
 if(data?.type==='advisor:ready'){ready=true;send({type:'advisor:language',lang:document.documentElement.lang});send({type:'advisor:theme',theme:document.documentElement.dataset.theme});send({type:'advisor:context',context});send({type:'advisor:presentation',value:presentation});if(pendingPrompt){send({type:'advisor:prompt',prompt:pendingPrompt});pendingPrompt=null;}}
 if(data?.type==='advisor:size'&&!dragging){const h=Number(data.height);if(Number.isFinite(h)&&h>=120&&h<=2000){chatHeight=h;host.style.setProperty('--resize-left',Math.max(0,Math.min(60,Number(data.resizeLeft)||12))+'px');host.style.setProperty('--resize-bottom',Math.max(0,Math.min(400,Number(data.resizeBottom)||8))+'px');host.style.setProperty('--resize-height',Math.max(38,Math.min(350,Number(data.resizeHeight)||58))+'px');host.dataset.drawer=String(data.drawerOpen===true);host.style.setProperty('--drag-bottom',Math.max(40,Math.min(350,Number(data.dragBottom)||66))+'px');const right=Number(data.dragRight);if(Number.isFinite(right))host.style.setProperty('--drag-right',Math.max(0,Math.min(host.clientWidth-30,right))+'px');layout();}}
 if(data?.type==='advisor:minimize')present('mini');
 if(data?.type==='advisor:working'){chatWorking=Boolean(data.working);updateCompanion();}
 if(data?.type==='advisor:reply'&&!active&&presentation==='mini'){unreadReply=true;replyFailed=Boolean(data.error);updateCompanion();}
 if(data?.type==='advisor:voice'){
  const wasActive=active;active=Boolean(data.active);lastVoice=data;updateCompanion();
  host.dataset.voice=String(active);
  if(active&&!wasActive){caption.hidden=true;caption.firstElementChild.textContent='';pill.classList.remove('controls-open');pill.querySelector('.companion-orb').setAttribute('aria-expanded','false');present('mini');}
  if(!active&&wasActive){caption.hidden=true;caption.firstElementChild.textContent='';present('panel');}
  layout();
 }
 if(data?.type==='advisor:caption'&&active){caption.firstElementChild.textContent=String(data.text||'').slice(-220);caption.hidden=!captionsOn||!caption.textContent;}
 if(data?.type==='advisor:level')pill.style.setProperty('--voice-level',Math.max(0,Math.min(1,Number(data.level)||0)));
 if(data?.type==='advisor:data-changed')window.dispatchEvent(new CustomEvent('banking:advisor-change',{detail:{mode:context.mode,result:data.result}}));
 if(data?.type==='advisor:transactions')window.dispatchEvent(new CustomEvent('banking:advisor-transactions',{detail:{mode:context.mode,filters:data.filters}}));
});
window.addEventListener('resize',layout);window.visualViewport?.addEventListener('resize',layout);window.visualViewport?.addEventListener('scroll',layout);
new MutationObserver(()=>{send({type:'advisor:language',lang:document.documentElement.lang});updateCompanion();send({type:'advisor:theme',theme:document.documentElement.dataset.theme});layout();}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','lang']});


window.addEventListener('banking:section-context',event=>{const {section,...selection}=event.detail||{};if(!section)return;context.sections={...(context.sections||{}),[section]:selection};send({type:'advisor:context',context});});
