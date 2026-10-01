import { dayScene } from './overview.js';
// Landing, Demo entry and owner sign-in. The scenic stage stays mounted; only the title and card content change per view.
const paths={
 demo:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M15.6 8.4l-2.1 5.1-5.1 2.1 2.1-5.1z',
 owner:'M6 11h12v10H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3M12 15v2',
 arrow:'M5 12h14M13 6l6 6-6 6',
 back:'M19 12H5M11 6l-6 6 6 6',
 lock:'M7 11h10v9H7zM9 11V8.5a3 3 0 0 1 6 0V11',
 eye:'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12M12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6',
 eyeOff:'M3 3l18 18M10.6 5.6A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3 3.9M6.4 6.9C3.9 8.6 2.5 12 2.5 12S6 18.5 12 18.5a9.4 9.4 0 0 0 4.6-1.2M9.9 9.9a2.8 2.8 0 0 0 4 4',
 caps:'M12 4 4 12h4.5v4h7v-4H20zM8.5 20h7'
};
const svg=(name,cls='')=>`<svg class="access-icon ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]}"/></svg>`;
export function createAccessUI({app,t,e,onEnter}) {
 let generation=0,clock=0;
 async function request(path,body) {
  const response=await fetch('/api/browser/'+path,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:{'X-Banking-Client':'web',...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw {status:response.status,code:data?.error};
  return data;
 }
 function message(error) {
  if(error.code==='SIGN_IN_RATE_LIMIT')return t('Too many attempts. Try again in 15 minutes.');
  if(error.code==='SIGN_IN_FAILED')return t('That password did not match. Try again.');
  if(error.code==='PASSWORD_ALREADY_CONFIGURED')return t('A password is already set. Return to sign in.');
  if(error.status===401||error.status===403)return t('Your owner session expired. Reopen your local owner session to finish setup.');
  return t('Could not connect. Check that Banking is running and try again.');
 }
 const scene=()=>dayScene();
 const greeting=()=>t({morning:'Good morning',afternoon:'Good afternoon',evening:'Good evening'}[scene()]);
 const time=()=>new Intl.DateTimeFormat(document.documentElement.lang==='da'?'da-DK':'en-GB',{timeZone:'Europe/Copenhagen',hour:'2-digit',minute:'2-digit'}).format(new Date());
 function stage() {
  let root=app.querySelector('.access');
  if(root)return root;
  clearInterval(clock);
  app.innerHTML=`<main id="main" class="access" data-scene="${scene()}">
   <div class="access-backdrop" aria-hidden="true"><div class="access-photo"></div><div class="access-shade"></div><div class="access-glow"></div></div>
   <header class="access-top"><div class="access-brand">Banking<span aria-hidden="true">.</span></div><p class="access-time"><span class="access-dot" aria-hidden="true"></span><span data-access-greeting>${e(greeting())}</span><span aria-hidden="true">·</span><time data-access-time>${e(time())}</time></p></header>
   <div class="access-center">
    <section class="access-hero"><h1 id="access-title"></h1><ul class="access-topics" aria-label="${e(t('Inside Banking'))}">${['Accounts','Budgets','Goals','Advisor'].map(x=>`<li>${e(t(x))}</li>`).join('')}</ul></section>
    <section class="access-panel" aria-labelledby="access-title"><div class="access-view"></div></section>
   </div>
  </main>`;
  root=app.querySelector('.access');
  // Keep scenery and greeting in step with Copenhagen time while the page stays open.
  clock=setInterval(()=>{if(!root.isConnected){clearInterval(clock);return;}root.dataset.scene=scene();root.querySelector('[data-access-greeting]').textContent=greeting();root.querySelector('[data-access-time]').textContent=time();},30000);
  return root;
 }
 function frame(title,content) {
  const root=stage(),heading=root.querySelector('#access-title'),view=root.querySelector('.access-view');
  root.dataset.view=title==='Welcome to Banking'?'welcome':'sign-in';
  heading.innerHTML=t(title).split(' ').map((word,i)=>`<span>${e(word)}</span>`).join(' ');
  heading.setAttribute('aria-label',t(title));
  view.innerHTML=content;
  for(const el of [heading,view]){el.classList.remove('entering');void el.offsetWidth;el.classList.add('entering');}
 }
 const choice=(id,kind,title,text)=>`<button type="button" class="access-choice" id="${id}" data-kind="${kind}"><span class="access-choice-icon">${svg(kind)}</span><span class="access-choice-text"><strong>${e(t(title))}</strong><small>${e(t(text))}</small></span><span class="access-choice-go">${svg('arrow')}</span></button>`;
 const back=`<button type="button" class="access-back" id="access-back">${svg('back')}<span>${e(t('Back'))}</span></button>`;
 async function enterDemo(button) {
  const error=app.querySelector('.access-alert');button.disabled=true;button.setAttribute('aria-busy','true');
  try{await request('demo',{});await onEnter('Demo');}
  catch(err){button.disabled=false;button.removeAttribute('aria-busy');if(error)error.textContent=message(err);}
 }
 async function show(view='welcome',focus=null) {
  const current=++generation;
  frame('Welcome to Banking',`<div class="access-choices" aria-hidden="true"><span class="access-skeleton"></span><span class="access-skeleton"></span></div><p class="sr-only" role="status">${e(t('Loading…'))}</p>`);
  let state;
  try {state=await request('status');}
  catch(error){if(current!==generation)return;frame('Welcome to Banking',`<p class="access-alert" role="alert">${e(message(error))}</p><button type="button" class="primary access-wide" id="access-retry">${e(t('Retry'))}</button>`);app.querySelector('#access-retry').onclick=()=>show(view);return;}
  if(current!==generation)return;
  const setup=state.role==='Owner'&&!state.passwordConfigured,ownerReady=state.role==='Owner'&&!setup;
  if(view==='welcome') {
   frame('Welcome to Banking',`<div class="access-choices">${choice('access-owner','owner','Sign in as Dan',ownerReady?'Continue to your accounts.':'Your own accounts, privately.')}${choice('access-demo','demo','Try Demo','Fictional data, no login needed.')}</div><p class="access-alert" role="alert"></p>`);
   app.querySelector('#access-demo').onclick=event=>{event.stopPropagation();enterDemo(event.currentTarget);};
   app.querySelector('#access-owner').onclick=()=>ownerReady?onEnter('Live'):show('sign-in');
   if(focus)app.querySelector('#'+focus)?.focus();
   return;
  }
  if(!state.passwordConfigured&&!setup) {
   frame('Sign in as Dan',`<p class="access-note">${e(t('Dan’s password needs a one-time setup from his authenticated local session.'))}</p><p class="access-muted">${e(t('Demo is ready to explore while sign-in is being set up.'))}</p><button type="button" class="primary access-wide" id="access-demo">${e(t('Try Demo'))}</button><p class="access-alert" role="alert"></p>${back}`);
   app.querySelector('#access-demo').onclick=event=>{event.stopPropagation();enterDemo(event.currentTarget);};
  } else {
   const reveal=`<button type="button" class="access-reveal" aria-label="${e(t('Show password'))}" aria-pressed="false">${svg('eye')}</button>`;
   frame(setup?'Set your local password':'Sign in as Dan',`<form id="access-form" class="access-form">
    <div class="access-field"><label for="owner-password">${e(t('Password'))}</label><div class="access-input">${svg('lock','access-input-icon')}<input id="owner-password" name="password" type="password" autocomplete="${setup?'new-password':'current-password'}" autocapitalize="off" spellcheck="false" required ${setup?'minlength="8" aria-describedby="owner-password-hint"':''} maxlength="128">${reveal}</div>${setup?`<small id="owner-password-hint">${e(t('Set this once, then sign in directly from any browser on this computer.'))} ${e(t('Use 8–128 characters. A long passphrase works well.'))}</small>`:''}</div>
    ${setup?`<div class="access-field"><label for="owner-confirm">${e(t('Confirm password'))}</label><div class="access-input">${svg('lock','access-input-icon')}<input id="owner-confirm" type="password" autocomplete="new-password" autocapitalize="off" spellcheck="false" required minlength="8" maxlength="128"></div></div>`:''}
    <p class="access-caps" hidden>${svg('caps')}<span>${e(t('Caps Lock is on'))}</span></p>
    <p class="access-alert" role="alert"></p>
    <button type="submit" class="primary access-wide">${e(t(setup?'Save password and continue':'Sign in'))}</button></form>${back}`);
   const form=app.querySelector('#access-form'),submit=form.querySelector('[type=submit]'),label=submit.textContent,caps=form.querySelector('.access-caps'),toggle=form.querySelector('.access-reveal');
   form.addEventListener('input',()=>form.querySelector('#owner-confirm')?.setCustomValidity(''));
   const capsCheck=event=>{if(typeof event.getModifierState==='function')caps.hidden=!event.getModifierState('CapsLock');};
   form.addEventListener('keydown',capsCheck);form.addEventListener('keyup',capsCheck);
   toggle.addEventListener('mousedown',event=>event.preventDefault());toggle.onclick=()=>{const shown=toggle.getAttribute('aria-pressed')!=='true';form.querySelectorAll('input[type=password],input[data-revealed]').forEach(input=>{input.type=shown?'text':'password';input.toggleAttribute('data-revealed',shown);});toggle.setAttribute('aria-pressed',String(shown));toggle.setAttribute('aria-label',t(shown?'Hide password':'Show password'));toggle.querySelector('path').setAttribute('d',paths[shown?'eyeOff':'eye']);form.querySelector('#owner-password').focus();};
   form.addEventListener('submit',async event=>{
    event.preventDefault();event.stopPropagation();
    const password=form.querySelector('#owner-password').value,confirm=form.querySelector('#owner-confirm');
    if(confirm&&password!==confirm.value){confirm.setCustomValidity(t('Passwords must match.'));confirm.reportValidity();return;}
    const controls=[...form.querySelectorAll('input,button')];controls.forEach(x=>x.disabled=true);
    submit.textContent=t(setup?'Saving…':'Signing in…');submit.setAttribute('aria-busy','true');form.querySelector('.access-alert').textContent='';
    try{await request(setup?'password':'sign-in',{password});form.reset();await onEnter('Live');}
    catch(error){form.querySelector('.access-alert').textContent=message(error);controls.forEach(x=>x.disabled=false);submit.textContent=label;submit.removeAttribute('aria-busy');form.querySelector('#owner-password').select();}
   });
   app.querySelector('#owner-password').focus();
  }
  app.querySelector('#access-back').onclick=()=>show('welcome','access-owner');
 }
 return {show,status:()=>request('status')};
}