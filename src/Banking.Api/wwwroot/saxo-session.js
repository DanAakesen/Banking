// One tab's short-lived completion proof is not a Saxo token or credential.
export function beginSaxoSignIn(result,context={}) {
 const url=new URL(result.authorizationUrl);
 const market=result.environment||'SIM';
 if(!['SIM','LIVE'].includes(market)||url.origin!==(market==='SIM'?'https://sim.logonvalidation.net':'https://live.logonvalidation.net')||url.pathname!=='/authorize')throw {code:'INVALID_AUTHORIZATION_URL'};
 const state=url.searchParams.get('state');
 if(result.completionProof)sessionStorage.setItem('banking.saxo.oauth',JSON.stringify({state,proof:result.completionProof,market,purpose:context.purpose==='market-data'?'market-data':null,tradingEnvironment:context.tradingEnvironment==='LIVE'?'LIVE':'SIM',expires:Date.now()+600000}));
 location.assign(url.href);
}
export async function finishSaxoSignIn(api) {
 const url=new URL(location.href),state=url.searchParams.get('saxoComplete');
 if(url.searchParams.has('saxoError')){url.searchParams.delete('saxoError');history.replaceState(null,'',url.href);sessionStorage.removeItem('banking.saxo.oauth');throw {code:'SAXO_SIGN_IN_CANCELLED'};}
 if(!state)return null;
 url.searchParams.delete('saxoComplete');history.replaceState(null,'',url.href);
 const raw=sessionStorage.getItem('banking.saxo.oauth');sessionStorage.removeItem('banking.saxo.oauth');
 const entry=raw?JSON.parse(raw):null;
 if(!entry||entry.state!==state||entry.expires<Date.now())throw {code:'SAXO_AUTH_SESSION_MISMATCH'};
 const completed=await api('investments/saxo/connect/complete',{method:'POST',body:JSON.stringify({state,proof:entry.proof})});
 return entry.purpose==='market-data'?{...completed,purpose:entry.purpose,tradingEnvironment:entry.tradingEnvironment==='LIVE'?'LIVE':'SIM'}:completed;
}
export function saxoEnvironment(mode) {
 if(mode!=='Live')return 'SIM';
 try{return sessionStorage.getItem('banking.saxo.environment')==='LIVE'?'LIVE':'SIM';}catch{return 'SIM';}
}
export function rememberSaxoEnvironment(market) {
 if(!['SIM','LIVE'].includes(market))return;
 try{sessionStorage.setItem('banking.saxo.environment',market);}catch{}
}

// Which codes mean "sign in": a missing or rejected token is a sign-in state; permission, rate-limit and outage codes are not.
const authKinds={SAXO_SIGN_IN_REQUIRED:'expired',SAXO_MARKET_SIGN_IN_REQUIRED:'expired',SAXO_ACCESS_REQUIRED:'required',SAXO_AUTH_SESSION_MISMATCH:'required'};
export const saxoAuthKind=code=>typeof code==='string'&&Object.hasOwn(authKinds,code)?authKinds[code]:null;
export const saxoAuthStatus=(kind,L)=>kind==='expired'?L('Session expired','Session udløbet'):L('Not signed in','Ikke logget ind');
const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// One Saxo connection in a page header. Signed-out states ('required', 'expired') say so in text, not colour alone, and carry
// the connection's single sign-in action. `status` is the page's own text for the other states; `compact` drops the name from the label.
export function saxoAuthView({name,state,status='',compact=false,canSignIn=true,busy=false,visible=true,actionNote='',L}){
 const signedOut=state==='required'||state==='expired',text=signedOut?saxoAuthStatus(state,L):status;
 return {state,signedOut,visible,busy,text:compact||!text?text||name:`${name} · ${text}`,groupLabel:text?`${name}: ${text}`:name,
  showAction:signedOut&&canSignIn,actionText:busy?L('Connecting…','Forbinder…'):L('Sign in','Log ind'),actionLabel:L(`Sign in to ${name}`,`Log ind på ${name}`),actionNote};
}
export function saxoAuthMarkup(view,ids={}) {
 const id=(name,value)=>value?` id="${esc(value)}"`:'';
 return `<span class="saxo-auth"${id('id',ids.group)} role="group" aria-label="${esc(view.groupLabel)}" data-state="${esc(view.state)}"${view.visible?'':' hidden'}><span class="saxo-auth-dot" aria-hidden="true"></span><span class="saxo-auth-label"${id('id',ids.label)} role="status">${esc(view.text)}</span><button type="button" class="saxo-auth-action"${id('id',ids.action)} aria-label="${esc(view.actionLabel)}"${view.actionNote?` title="${esc(view.actionNote)}"`:''}${view.showAction?'':' hidden'}${view.busy?' disabled':''}>${esc(view.actionText)}</button></span>`;
}
// In-place update, so a focused sign-in button and the live status text are not replaced on every redraw.
export function saxoAuthApply(host,view) {
 if(!host)return;
 host.hidden=!view.visible;host.dataset.state=view.state;host.setAttribute('aria-label',view.groupLabel);
 const label=host.querySelector('.saxo-auth-label');if(label&&label.textContent!==view.text)label.textContent=view.text;
 const action=host.querySelector('.saxo-auth-action');if(!action)return;
 action.hidden=!view.showAction;action.disabled=view.busy;action.setAttribute('aria-label',view.actionLabel);
 if(action.textContent!==view.actionText)action.textContent=view.actionText;
 if(view.actionNote)action.title=view.actionNote;else action.removeAttribute('title');
}

// Market-data freshness shared by Markets and Investments. Short ranges are polled while the page is visible.
export const SAXO_SHORT_RANGES=['1h','1d'];
export const SAXO_LIVE_REFRESH_MS=20000;
// Milliseconds until the next automatic short-range refresh, or null when it must not poll: long range, hidden tab,
// or a stop condition (sign-in required, access denied and similar) that polling cannot fix.
export function saxoLivePoll({range,visible,blocked}){return SAXO_SHORT_RANGES.includes(range)&&visible&&!blocked?SAXO_LIVE_REFRESH_MS:null;}
// Saxo's reported delay. Zero is only "no reported delay", never real-time: Saxo real-time needs a paid exchange
// subscription and an upgraded API session (docs/saxo-market-data.md). Missing, invalid or negative stays unknown.
export function saxoFeed(minutes){
 return typeof minutes!=='number'||!Number.isFinite(minutes)||minutes<0?{kind:'unknown',minutes:null}:minutes===0?{kind:'none-reported',minutes:0}:{kind:'delayed',minutes};
}
export const saxoClock=(value,locale)=>{const d=value==null||value===''?null:new Date(value);return !d||Number.isNaN(d.getTime())?'—':d.toLocaleTimeString(locale,{hour:'2-digit',minute:'2-digit',second:'2-digit'});};
// Saxo's missing intraday intervals (historySamples.missingIntervals) as one honest line; empty when none or unknown.
export function saxoGapNote({missing,interval},L){
 const step=parseInt(interval,10);
 return Number.isInteger(missing)&&missing>0&&/^\d+m$/.test(interval||'')&&step>0?L(`Saxo sent no data for some ${step}-minute intervals (${missing} missing).`,`Saxo sendte ingen data for nogle ${step}-minutters intervaller (${missing} mangler).`):'';
}
