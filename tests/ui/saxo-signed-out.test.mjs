import assert from 'node:assert/strict';
import test from 'node:test';
import {saxoAuthKind,saxoAuthStatus,saxoAuthView,saxoAuthMarkup,saxoAuthApply} from '../../src/Banking.Api/wwwroot/saxo-session.js';
import {investmentAuthState,investmentNotice,investmentNoticeMarkup,investmentUnavailableMarkup,investmentChartActions,investmentMarketIssue} from '../../src/Banking.Api/wwwroot/wealth-ui.js';

// markets-ui.js imports browser-only modules; minimal inert globals let its pure helpers load in Node.
Object.assign(globalThis,{window:globalThis,addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){}}),
 document:{addEventListener(){},documentElement:{},querySelector(){return null}},localStorage:{getItem(){return null},setItem(){}},
 MutationObserver:class{observe(){}disconnect(){}}});
globalThis.sessionStorage=globalThis.localStorage;
const {marketsSignedOutMarkup,marketsChartStatusMarkup}=await import('../../src/Banking.Api/wwwroot/markets-ui.js');

const en=(a)=>a,da=(a,b)=>b;
const e=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const buttons=html=>[...html.matchAll(/<button\b[^>]*>/g)].map(m=>m[0]);
const visibleButtons=html=>buttons(html).filter(b=>!/\shidden(\s|>|=)/.test(b));
// Wording that would offer or demand a sign-in inside page content.
const promptsSignIn=html=>/sign in|log ind|connect saxo/i.test(html);

test('only a missing or rejected session is a sign-in state; permission, rate limit and outages are not',()=>{
 assert.equal(saxoAuthKind('SAXO_SIGN_IN_REQUIRED'),'expired');
 assert.equal(saxoAuthKind('SAXO_MARKET_SIGN_IN_REQUIRED'),'expired');
 assert.equal(saxoAuthKind('SAXO_ACCESS_REQUIRED'),'required');
 assert.equal(saxoAuthKind('SAXO_AUTH_SESSION_MISMATCH'),'required');
 for(const code of ['SAXO_PERMISSION_REQUIRED','SAXO_MARKET_DATA_NO_ACCESS','SAXO_RATE_LIMITED','SAXO_READ_UNAVAILABLE','SAXO_MARKET_REQUEST_REJECTED','SAXO_SIGN_IN_CANCELLED','toString','constructor','',null,undefined,42])
  assert.equal(saxoAuthKind(code),null,String(code));
 assert.equal(saxoAuthStatus('expired',en),'Session expired');assert.equal(saxoAuthStatus('required',en),'Not signed in');
 assert.equal(saxoAuthStatus('expired',da),'Session udløbet');assert.equal(saxoAuthStatus('required',da),'Ikke logget ind');
});

test('a signed-out connection renders one sign-in action, a text state and an accessible name',()=>{
 for(const [state,text] of [['required','Not signed in'],['expired','Session expired']]){
  const html=saxoAuthMarkup(saxoAuthView({name:'Saxo SIM',state,L:en}),{group:'inv-connection',label:'inv-connection-label',action:'inv-connect'});
  assert.match(html,new RegExp(`data-state="${state}"`));assert.match(html,/class="saxo-auth"/);assert.match(html,/role="group"/);
  assert.match(html,new RegExp(`aria-label="Saxo SIM: ${text}"`));
  assert.match(html,new RegExp(`role="status">Saxo SIM · ${text}<`),'the state is written out, not only coloured');
  assert.equal(buttons(html).length,1);assert.equal(visibleButtons(html).length,1);
  assert.match(visibleButtons(html)[0],/aria-label="Sign in to Saxo SIM"/);assert.match(html,/>Sign in<\/button>/);
  assert.doesNotMatch(html,/\shidden(\s|>|=)/);
 }
});

test('the signed-out control is the same in Danish and escapes its text',()=>{
 const html=saxoAuthMarkup(saxoAuthView({name:'Saxo SIM',state:'expired',L:da}));
 assert.match(html,/Saxo SIM · Session udløbet/);assert.match(html,/aria-label="Log ind på Saxo SIM"/);assert.match(html,/>Log ind<\/button>/);
 const hostile=saxoAuthMarkup(saxoAuthView({name:'<img src=x onerror=alert(1)>',state:'required',L:en}));
 assert.doesNotMatch(hostile,/<img/);
});

test('a signed-in connection has no danger state and no visible sign-in action',()=>{
 for(const [state,status] of [['connected','Connected'],['checking','Checking…'],['attention','Check connection']]){
  const html=saxoAuthMarkup(saxoAuthView({name:'Saxo SIM',state,status,L:en}),{action:'inv-connect'});
  assert.match(html,new RegExp(`data-state="${state}"`));assert.doesNotMatch(html,/data-state="(required|expired)"/);
  assert.match(html,new RegExp(`>Saxo SIM · ${status}<`));assert.equal(visibleButtons(html).length,0);
 }
});

test('LIVE market data offers sign-in to the owner only; Demo sees the state without an action',()=>{
 const market=canSignIn=>saxoAuthMarkup(saxoAuthView({name:'Saxo LIVE market data',state:'expired',canSignIn,L:en}),{group:'inv-market-auth',action:'inv-market-connect'});
 const owner=market(true),demo=market(false);
 assert.equal(visibleButtons(owner).length,1);assert.match(owner,/aria-label="Sign in to Saxo LIVE market data"/);
 assert.equal(visibleButtons(demo).length,0);assert.match(demo,/data-state="expired"/);assert.match(demo,/Saxo LIVE market data · Session expired/);
 assert.match(saxoAuthMarkup(saxoAuthView({name:'Saxo LIVE market data',state:'expired',visible:false,L:en})),/^<span class="saxo-auth"[^>]* hidden>/);
});

test('a compact control keeps the connection name in its accessible name',()=>{
 const html=saxoAuthMarkup(saxoAuthView({name:'Saxo SIM',state:'required',compact:true,L:en}));
 assert.match(html,/role="status">Not signed in</);assert.match(html,/aria-label="Saxo SIM: Not signed in"/);
});

function fakeHost(){
 const label={textContent:'',writes:0},action={hidden:true,disabled:false,textContent:'',attrs:{},setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];}};
 Object.defineProperty(label,'text',{set(v){this.textContent=v;this.writes++;}});
 return {hidden:false,dataset:{},attrs:{},setAttribute(k,v){this.attrs[k]=v;},label,action,querySelector(s){return s==='.saxo-auth-label'?label:s==='.saxo-auth-action'?action:null;}};
}
test('updating in place keeps one action and does not rewrite an unchanged live status',()=>{
 const host=fakeHost();
 saxoAuthApply(host,saxoAuthView({name:'Saxo SIM',state:'expired',L:en}));
 assert.equal(host.dataset.state,'expired');assert.equal(host.attrs['aria-label'],'Saxo SIM: Session expired');assert.equal(host.hidden,false);
 assert.equal(host.label.textContent,'Saxo SIM · Session expired');assert.equal(host.action.hidden,false);assert.equal(host.action.attrs['aria-label'],'Sign in to Saxo SIM');
 host.label.textContent='Saxo SIM · Session expired';host.label.marker=1;
 saxoAuthApply(host,saxoAuthView({name:'Saxo SIM',state:'expired',L:en}));assert.equal(host.label.marker,1);
 saxoAuthApply(host,saxoAuthView({name:'Saxo SIM',state:'expired',busy:true,L:en}));assert.equal(host.action.disabled,true);assert.equal(host.action.textContent,'Connecting…');
 saxoAuthApply(host,saxoAuthView({name:'Saxo SIM',state:'connected',status:'Connected',L:en}));
 assert.equal(host.dataset.state,'connected');assert.equal(host.action.hidden,true);assert.equal(host.label.textContent,'Saxo SIM · Connected');
 saxoAuthApply(host,saxoAuthView({name:'Saxo LIVE market data',state:'required',visible:false,L:en}));assert.equal(host.hidden,true);
 assert.doesNotThrow(()=>saxoAuthApply(null,saxoAuthView({name:'x',state:'required',L:en})));
});

test('Investments derives the sign-in state from provider codes only',()=>{
 assert.equal(investmentAuthState({portfolioCode:'SAXO_ACCESS_REQUIRED'}),'required');
 assert.equal(investmentAuthState({portfolioCode:'SAXO_SIGN_IN_REQUIRED',orderCode:'SAXO_ACCESS_REQUIRED'}),'expired');
 assert.equal(investmentAuthState({connectCode:'SAXO_AUTH_SESSION_MISMATCH'}),'required');
 for(const code of ['SAXO_PERMISSION_REQUIRED','SAXO_RATE_LIMITED','SAXO_READ_DISABLED','SAXO_READ_UNAVAILABLE','SAXO_SIGN_IN_CANCELLED','SAXO_CALLBACK_REGISTRATION_REQUIRED'])
  assert.equal(investmentAuthState({portfolioCode:code,orderCode:code,connectCode:code}),null,code);
 assert.equal(investmentAuthState(),null);
});

test('no banner, sign-in button or Retry is rendered for a signed-out or expired session',()=>{
 const text={SAXO_ACCESS_REQUIRED:'Not signed in to Saxo.',SAXO_SIGN_IN_REQUIRED:'Your Saxo session has expired.',SAXO_AUTH_SESSION_MISMATCH:'The sign-in could not be completed in this browser tab.'};
 for(const code of Object.keys(text)){
  for(const portfolio of [null,{positions:[]}]){
   const notice=investmentNotice({portfolio,orders:null,portfolioIssue:text[code],portfolioCode:code,orderIssue:text[code],orderCode:code});
   assert.equal(notice,null,code);assert.equal(investmentNoticeMarkup(notice,{L:en,e}),'');
  }
 }
 const mismatch=investmentNotice({portfolioIssue:text.SAXO_ACCESS_REQUIRED,portfolioCode:'SAXO_ACCESS_REQUIRED',connectIssue:text.SAXO_AUTH_SESSION_MISMATCH,connectCode:'SAXO_AUTH_SESSION_MISMATCH'});
 assert.equal(mismatch,null);
});

test('non-sign-in problems keep their banner, with Retry and without a sign-in button',()=>{
 const cases=[['SAXO_PERMISSION_REQUIRED','Saxo has not granted access to this data. Check your account permissions.'],['SAXO_RATE_LIMITED','Saxo is busy. Automatic refresh is paused; try again later.'],['SAXO_READ_UNAVAILABLE','Saxo data could not be read.']];
 for(const [code,message] of cases){
  const html=investmentNoticeMarkup(investmentNotice({portfolio:null,orders:null,portfolioIssue:message,portfolioCode:code}),{L:en,e});
  assert.match(html,/class="inv-notice"/);assert.ok(html.includes(e(message)),code);
  assert.equal(visibleButtons(html).length,1);assert.match(html,/data-inv-retry/);assert.doesNotMatch(html,/data-inv-connect/);assert.equal(promptsSignIn(html),false,html);
 }
 const stale=investmentNoticeMarkup(investmentNotice({portfolio:{positions:[]},portfolioIssue:'Saxo is busy.',portfolioCode:'SAXO_RATE_LIMITED'}),{L:en,e});
 assert.match(stale,/Previously read data is shown with its original timestamp\./);
});

test('sign-in problems mixed with other problems only show the other problems',()=>{
 const notice=investmentNotice({portfolio:null,orders:null,portfolioIssue:'Your Saxo session has expired.',portfolioCode:'SAXO_SIGN_IN_REQUIRED',orderIssue:'Saxo is busy.',orderCode:'SAXO_RATE_LIMITED'});
 assert.equal(notice.text,'Saxo is busy.');assert.equal(notice.retry,true);
});

test('a failed or cancelled sign-in attempt is still reported, without Retry or a second sign-in button',()=>{
 for(const [code,message] of [['SAXO_SIGN_IN_CANCELLED','Saxo sign-in was cancelled.'],['SAXO_CALLBACK_REGISTRATION_REQUIRED','Saxo sign-in is not configured yet.']]){
  const notice=investmentNotice({portfolioIssue:'Not signed in to Saxo.',portfolioCode:'SAXO_ACCESS_REQUIRED',connectIssue:message,connectCode:code});
  assert.equal(notice.text,message);assert.equal(notice.retry,false);
  const html=investmentNoticeMarkup(notice,{L:en,e});assert.ok(html.includes(e(message)));assert.equal(buttons(html).length,0);
 }
});

test('holdings and orders panels state a signed-out session briefly, with no action',()=>{
 for(const [auth,title] of [['required','Not signed in'],['expired','Session expired']])
  for(const subject of ['holdings','orders']){
   const html=investmentUnavailableMarkup({auth,subject,message:'ignored',icon:'<svg></svg>'},{L:en,e});
   assert.match(html,new RegExp(`<strong>${title}</strong>`));assert.match(html,subject==='orders'?/Working orders are unavailable\./:/Holdings are unavailable\./);
   assert.equal(buttons(html).length,0);assert.equal(promptsSignIn(html),false);assert.doesNotMatch(html,/ignored/);
  }
 const failed=investmentUnavailableMarkup({auth:null,subject:'holdings',message:'Saxo is busy.',icon:''},{L:en,e});
 assert.match(failed,/Data unavailable/);assert.match(failed,/Saxo is busy\./);assert.match(failed,/data-inv-retry/);
});

test('the chart area never offers a sign-in button; failures other than sign-in keep Retry',()=>{
 const signin=investmentMarketIssue({code:'SAXO_MARKET_SIGN_IN_REQUIRED'});
 assert.equal(signin.kind,'signin');assert.equal(investmentChartActions(signin,{retry:true,L:en}),'');
 for(const code of ['SAXO_MARKET_DATA_NO_ACCESS','SAXO_MARKET_REQUEST_REJECTED','SAXO_MARKET_DATA_UNAVAILABLE']){
  const html=investmentChartActions(investmentMarketIssue({code}),{retry:true,L:en});
  assert.match(html,/data-inv-market-retry/);assert.doesNotMatch(html,/market-connect|Sign in|Log ind/);assert.equal(buttons(html).length,1);
 }
 assert.equal(investmentChartActions(investmentMarketIssue({code:'SAXO_MARKET_DATA_NO_ACCESS'}),{retry:false,L:en}),'');
});

test('Markets panels without a session state it and offer no sign-in',()=>{
 for(const kind of ['required','expired']){
  const html=marketsSignedOutMarkup({kind,what:'Saxo SIM account details are unavailable.'},{L:en,e});
  assert.match(html,/class="td-empty td-signed-out"/);assert.match(html,kind==='expired'?/<strong>Session expired<\/strong>/:/<strong>Not signed in<\/strong>/);
  assert.match(html,/account details are unavailable/);assert.equal(buttons(html).length,0);assert.equal(promptsSignIn(html),false);
 }
});

test('the Markets chart status line is empty for a sign-in problem and keeps Retry for other failures',()=>{
 const signin=marketsChartStatusMarkup({text:'Saxo LIVE market data is not signed in.',signin:true},{L:en,e});
 assert.equal(signin,'','the chart area states it; no button, Retry or duplicate line');
 for(const text of ['Saxo denied access to this market data. (history: NoAccess)','Saxo rejected the market-data request. (history: InvalidModelState)']){
  const html=marketsChartStatusMarkup({text,signin:false},{L:en,e});
  assert.match(html,/role="alert"/);assert.ok(html.includes(e(text)));assert.match(html,/id="td-retry-chart"/);assert.equal(buttons(html).length,1);assert.doesNotMatch(html,/Sign in|Log ind/);
 }
 assert.doesNotMatch(marketsChartStatusMarkup({text:'<b>x</b>',signin:false},{L:en,e}),/<b>/);
});

test('one header control per connection: a signed-out SIM session and expired LIVE market data give exactly two sign-in actions',()=>{
 const trading=saxoAuthMarkup(saxoAuthView({name:'Saxo SIM',state:'expired',L:en}),{group:'inv-connection',action:'inv-connect'});
 const market=saxoAuthMarkup(saxoAuthView({name:'Saxo LIVE market data',state:'expired',L:en}),{group:'inv-market-auth',action:'inv-market-connect'});
 const header=trading+market;
 assert.equal(visibleButtons(header).length,2);assert.equal((header.match(/data-state="expired"/g)||[]).length,2);
 // Everything a page draws below the header adds no further sign-in action for these states.
 const content=[investmentNoticeMarkup(investmentNotice({portfolioIssue:'x',portfolioCode:'SAXO_SIGN_IN_REQUIRED',orderIssue:'x',orderCode:'SAXO_SIGN_IN_REQUIRED'}),{L:en,e}),
  investmentUnavailableMarkup({auth:'expired',subject:'holdings'},{L:en,e}),investmentUnavailableMarkup({auth:'expired',subject:'orders'},{L:en,e}),
  investmentChartActions(investmentMarketIssue({code:'SAXO_MARKET_SIGN_IN_REQUIRED'}),{retry:true,L:en}),
  marketsSignedOutMarkup({kind:'expired',what:'x'},{L:en,e}),marketsChartStatusMarkup({text:'x',signin:true},{L:en,e})].join('');
 assert.equal(buttons(content).length,0);
});
