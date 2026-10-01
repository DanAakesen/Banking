// Browser check of the Saxo signed-out header controls on Investments and Markets.
//
// Serves nothing itself: it drives the frontend-only host (default https://localhost:5444), which serves the local wwwroot
// against the deployed API. "real" scenarios use a Demo session against that API and only read. "fixture" scenarios keep the
// same pages but answer /api and /advisor requests from clearly synthetic responses (page.route), so states that the real
// API is not in right now, and the owner-only LIVE sign-in, can be inspected. No request leaves the fixtures for Saxo,
// and nothing here signs in, places an order or changes a setting.
//
// Usage: node tests/ui/saxo-signed-out.browser.cjs [real|fixture|all]   (BANKING_FRONTEND, BANKING_PLAYWRIGHT_PATH override defaults)
const path=require('node:path');
const fs=require('node:fs');
const playwrightPath=process.env.BANKING_PLAYWRIGHT_PATH||path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {chromium}=require(playwrightPath);
const base=process.env.BANKING_FRONTEND||'https://localhost:5444';
const out=path.resolve(__dirname,'../../artifacts/saxo-signed-out-qa');fs.mkdirSync(out,{recursive:true});
const only=process.argv[2]||'all';
const viewports=process.env.SAXO_QUICK?[[1440,900],[390,844]]:[[1440,900],[1024,768],[390,844]];
const themes=process.env.SAXO_QUICK?['graphite']:['graphite','light'];
const signInWords=/sign in|log ind|connect saxo|forbind saxo/i;
const results=[];let captured={};

const json=(route,status,body,mode)=>route.fulfill({status,contentType:'application/json',headers:{'X-Banking-Mode':mode,'Cache-Control':'no-store'},body:JSON.stringify(body)});

// Synthetic API for the owner (Live) workspace. Every handler is a plain function of the request and the scenario.
function fixtureRouter(scenario){
 return async route=>{
  const req=route.request(),url=new URL(req.url()),p=url.pathname;
  if(p.startsWith('/advisor/'))return route.fulfill({status:200,contentType:'application/json',body:'{}'});
  if(!p.startsWith('/api/'))return route.continue();
  const api=p.slice(5),mode=req.headers()['x-banking-mode']||'Live';
  if(api==='browser/status')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({role:scenario.demo?'Demo':'Owner',passwordConfigured:true,localAdvisor:false})});
  if(api==='mode')return json(route,200,{mode,availableModes:scenario.demo?['Demo']:['Live','Demo']},mode);
  if(api==='accounts'||api==='categories')return json(route,200,[],mode);
  if(api==='research')return json(route,200,scenario.research||[],mode);
  if(api.startsWith('markets/chart'))return scenario.chart(url,route,mode);
  if(api.startsWith('investments/saxo/portfolio'))return json(route,200,scenario.portfolio(url.searchParams.get('environment')||'SIM'),mode);
  if(api.startsWith('investments/saxo/status'))return json(route,200,scenario.status(),mode);
  if(api.startsWith('investments/saxo/preview'))return scenario.preview?json(route,200,scenario.preview,mode):json(route,503,{error:'SAXO_SIGN_IN_REQUIRED'},mode);
  if(api.startsWith('investments/saxo/orders'))return scenario.orders?json(route,200,scenario.orders,mode):json(route,503,{error:'SAXO_SIGN_IN_REQUIRED'},mode);
  if(api.startsWith('investments/saxo/connect'))return json(route,503,{error:'SAXO_CALLBACK_REGISTRATION_REQUIRED'},mode);
  return json(route,200,api.endsWith('s')?[]:{},mode);
 };
}
const watch=[{id:'w1',name:'Microsoft',symbol:'MSFT',version:1,notes:'',url:null},{id:'w2',name:'Genmab',symbol:'GMAB.CO',version:1,notes:'',url:null}];
const marketSignIn=(url,route,mode)=>json(route,503,{error:'SAXO_MARKET_SIGN_IN_REQUIRED'},mode);
const bar=(t,close)=>({time:t,open:close-1,high:close+1,low:close-2,close,volume:1000});
const partialChart=(historyStatus,diag)=>(url,route,mode)=>{
 const symbol=url.searchParams.get('symbol')||'MSFT';
 return json(route,200,{source:'Saxo LIVE',symbol,name:symbol,currency:({'SIE:xetr':'EUR','GMAB:xcse':'DKK','VWS:xcse':'DKK'})[symbol]||'USD',assetType:'Stock',exchange:'NASDAQ',price:510,previousClose:505,quoteTime:'2026-09-29T08:00:00Z',quoteDelayMinutes:15,quoteStatus:'available',historyStatus,bars:[],interval:'1d',retrievedAt:'2026-09-29T08:01:00Z',diagnostics:diag,delay:'Quote: delayed 15 min'},mode);
};

// Click paths on the fixture API (the connect endpoints answer with a setup error, so nothing reaches Saxo). Each returns problems.
const interactions={
 'fx-owner-investments-sim-expired-market-expired':async page=>{
  const problems=[];await page.click('#inv-connect');await page.waitForFunction(()=>document.querySelector('.inv-notice'));
  const s=await page.evaluate(()=>({notice:document.querySelector('.inv-notice')?.textContent.trim(),noticeButtons:document.querySelectorAll('.inv-notice button').length,state:document.querySelector('#inv-connection').dataset.state,disabled:document.querySelector('#inv-connect').disabled,visibleSignIn:[...document.querySelectorAll('.saxo-auth button')].filter(b=>b.offsetParent).length}));
  if(!/not configured yet/.test(s.notice||''))problems.push('failed sign-in attempt is not reported: '+s.notice);
  if(s.noticeButtons)problems.push('the notice has buttons');
  if(s.state!=='expired'||s.disabled)problems.push('the SIM control did not return to a usable signed-out state: '+JSON.stringify(s));
  if(s.visibleSignIn!==2)problems.push('sign-in actions after the attempt: '+s.visibleSignIn);
  await page.click('#inv-market-connect');await page.waitForTimeout(600);
  const m=await page.evaluate(()=>({disabled:document.querySelector('#inv-market-connect').disabled,chart:document.querySelector('.inv-chart-empty')?.textContent.trim(),actions:document.querySelectorAll('.inv-chart-actions button').length}));
  if(m.disabled)problems.push('the market-data control stayed disabled after a failed attempt');if(m.actions)problems.push('the chart area has buttons');
  return problems;},
 'fx-owner-markets-sim-expired-market-expired':async page=>{
  const problems=[];await page.click('#td-connect');await page.waitForFunction(()=>document.querySelector('#td-connection')&&!document.querySelector('#td-connection').hidden);
  const s=await page.evaluate(()=>({state:document.querySelector('#td-connection').dataset.state,label:document.querySelector('#td-connection-label').textContent,auth:document.querySelector('#td-auth').hidden,message:document.querySelector('#td-broker-message').textContent,account:document.querySelector('#td-account').textContent.trim()}));
  if(s.state!=='error'||!s.auth)problems.push('a failed attempt should leave the neutral retry button: '+JSON.stringify(s));
  if(!/not configured/.test(s.message))problems.push('failed attempt not reported: '+s.message);
  await page.click('#td-market-connect');await page.waitForTimeout(600);
  const m=await page.evaluate(()=>({disabled:document.querySelector('#td-market-connect').disabled,status:document.querySelector('#td-status').textContent.trim()}));
  if(m.disabled)problems.push('the market-data control stayed disabled after a failed attempt');
  return problems;}
};
const scenarios=[
 {id:'real-demo-investments',kind:'real',route:'investments'},
 {id:'real-demo-markets',kind:'real',route:'markets'},
 {id:'fx-owner-investments-sim-expired-market-expired',kind:'fixture',route:'investments',expect:{header:2,content:0,notice:0},
  fixture:()=>({research:watch,chart:marketSignIn,portfolio:()=>({environment:'SIM',simulation:true,portfolio:null,portfolioError:'SAXO_SIGN_IN_REQUIRED',orders:null,ordersError:'SAXO_SIGN_IN_REQUIRED'})})},
 {id:'fx-owner-investments-live-expired-market-expired',kind:'fixture',route:'investments',env:'LIVE',expect:{header:1,content:0,notice:0},
  fixture:()=>({research:watch,chart:marketSignIn,portfolio:env=>({environment:env,simulation:env==='SIM',portfolio:null,portfolioError:'SAXO_SIGN_IN_REQUIRED',orders:null,ordersError:'SAXO_SIGN_IN_REQUIRED'})})},
 {id:'fx-owner-investments-da-sim-expired',kind:'fixture',route:'investments',lang:'da',expect:{header:1,content:0,notice:0},
  fixture:()=>({research:watch,chart:partialChart('available',[]),portfolio:()=>({environment:'SIM',simulation:true,portfolio:null,portfolioError:'SAXO_SIGN_IN_REQUIRED',orders:null,ordersError:'SAXO_SIGN_IN_REQUIRED'})})},
 {id:'fx-demo-investments-connected-market-expired',kind:'fixture',route:'investments',demo:true,expect:{header:0,content:0,notice:0,pills:['expired']},
  fixture:()=>({research:watch,chart:marketSignIn,portfolio:()=>captured.portfolio})},
 {id:'fx-demo-markets-connected-market-expired',kind:'fixture',route:'markets',demo:true,expect:{header:0,content:0,pills:['expired']},
  fixture:()=>({research:watch,chart:marketSignIn,status:()=>({configured:true}),preview:captured.preview,orders:captured.ordersRead,portfolio:()=>({})})},
 {id:'fx-owner-investments-sim-notsignedin',kind:'fixture',route:'investments',expect:{header:1,content:0,notice:0},
  fixture:()=>({research:watch,chart:partialChart('available',[]),portfolio:()=>({environment:'SIM',simulation:true,portfolio:null,portfolioError:'SAXO_ACCESS_REQUIRED',orders:null,ordersError:'SAXO_ACCESS_REQUIRED'})})},
 {id:'fx-owner-investments-connected-history-rejected-orders-busy',kind:'fixture',route:'investments',expect:{header:0,content:0,notice:1},
  fixture:()=>({research:watch,chart:partialChart('unavailable',[{operation:'history',code:'SAXO_MARKET_REQUEST_REJECTED',status:400,providerCode:'InvalidModelState'}]),
   portfolio:()=>({...captured.portfolio,ordersError:'SAXO_RATE_LIMITED',orders:null})})},
 {id:'fx-owner-markets-sim-expired-market-expired',kind:'fixture',route:'markets',expect:{header:2,content:0},
  fixture:()=>({research:watch,chart:marketSignIn,status:()=>({configured:false,setup:{credentialsReady:true}}),portfolio:()=>({})})},
 {id:'fx-owner-markets-connected-access-denied',kind:'fixture',route:'markets',expect:{header:0,content:0},
  fixture:()=>({research:watch,chart:(url,route,mode)=>json(route,503,{error:'SAXO_MARKET_DATA_NO_ACCESS',details:{diagnostics:[{operation:'history',code:'SAXO_MARKET_DATA_NO_ACCESS',status:403,providerCode:'NoAccess'}]}},mode),
   status:()=>({configured:true}),preview:captured.preview,orders:captured.ordersRead,portfolio:()=>({})})},
];

async function samples(page,points){
 const png=(await page.screenshot({type:'png'})).toString('base64');
 return page.evaluate(async({png,points})=>{
  const img=new Image();img.src='data:image/png;base64,'+png;await img.decode();
  const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const x=c.getContext('2d');x.drawImage(img,0,0);
  return points.map(([px,py])=>Array.from(x.getImageData(Math.round(px),Math.round(py),1,1).data.slice(0,3)));
 },{png,points});
}
const lum=([r,g,b])=>{const f=v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4;};return .2126*f(r)+.7152*f(g)+.0722*f(b);};
const contrast=(a,b)=>{const [x,y]=[lum(a),lum(b)].sort((m,n)=>n-m);return +((x+.05)/(y+.05)).toFixed(2);};

async function inspect(page){
 return page.evaluate(signInSource=>{
  const re=new RegExp(signInSource,'i'),main=document.querySelector('#main')||document.querySelector('.main');
  const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&!el.closest('[hidden]');};
  const name=el=>(el.getAttribute('aria-label')||'')+' '+el.textContent;
  const actions=[...main.querySelectorAll('button,a')].filter(visible).filter(el=>re.test(name(el))).map(el=>({id:el.id,text:el.textContent.trim(),aria:el.getAttribute('aria-label'),area:el.closest('.saxo-auth')?'header-control':el.closest('.page-head')?'header-other':'content'}));
  const pills=[...main.querySelectorAll('.saxo-auth')].filter(visible).map(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return {id:el.id,state:el.dataset.state,aria:el.getAttribute('aria-label'),text:el.querySelector('.saxo-auth-label')?.textContent,border:['Top','Right','Bottom','Left'].map(k=>s['border'+k+'Color']+' '+s['border'+k+'Width']),radius:s.borderRadius,rect:{x:r.x,y:r.y,w:r.width,h:r.height},button:!![...el.querySelectorAll('button')].find(visible)};});
  const oneSided=[...main.querySelectorAll('*')].filter(el=>{const s=getComputedStyle(el),n=['Top','Right','Bottom','Left'].filter(k=>parseFloat(s['border'+k+'Width'])>0&&s['border'+k+'Style']!=='none').length;return n>0&&n<4;}).map(el=>el.className||el.tagName);
  const bars=[...main.querySelectorAll('.inv-notice')].filter(visible).map(el=>({text:el.textContent.trim().slice(0,160),buttons:[...el.querySelectorAll('button')].map(b=>b.textContent.trim())}));
  const head=main.querySelector('.page-head');const hr=head?.getBoundingClientRect();
  const controls=head?.querySelector('.overview-controls')?.getBoundingClientRect();
  return {url:location.hash,h1:main.querySelectorAll('h1').length,overflowX:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,mainOverflow:main.scrollWidth>main.clientWidth+1,
   actions,pills,oneSided,bars,readText:head?.querySelector('#inv-read,#td-read')?.textContent||'',chartNote:main.querySelector('.inv-chart-empty p,#td-chart-note:not([hidden]),.td-notice:not([hidden])')?.textContent||'',
   controlsFit:controls?{right:Math.round(controls.right),head:Math.round(hr.right),left:Math.round(controls.left)}:null,geometry:(()=>{const box=el=>{const r=el?.getBoundingClientRect();return r?[Math.round(r.left),Math.round(r.top),Math.round(r.width),Math.round(r.height)]:null;};return {head:box(head),cols:head&&getComputedStyle(head).gridTemplateColumns,h1:box(head?.querySelector('h1')),outer:box(head?.querySelector(':scope > .controls')),overview:box(head?.querySelector('.overview-controls')),group:box(head?.querySelector('.overview-controls > .controls'))};})(),
   titleOverlap:(()=>{const title=head?.querySelector('h1'),range=document.createRange();if(title)range.selectNodeContents(title);const h=title?range.getBoundingClientRect():null,g=head?.querySelector('.overview-controls > .controls')?.getBoundingClientRect();return !!h&&!!g&&h.left<g.right-1&&g.left<h.right-1&&h.top<g.bottom-1&&g.top<h.bottom-1;})(),controlsInHead:!!controls&&controls.right<=hr.right+1&&controls.left>=hr.left-1,scenic:!!head?.classList.contains('scene-composed')};
 },signInWords.source);
}

async function run(browser,scenario,quick=false){
 for(const theme of quick?themes.slice(0,1):themes)for(const [w,h] of quick?viewports.slice(0,1):viewports){
  const ctx=await browser.newContext({viewport:{width:w,height:h},ignoreHTTPSErrors:true,locale:'en-GB'});
  const page=await ctx.newPage(),errors=[],netEntries=[],csp=[];
  page.on('console',m=>{if(m.type()==='error'){if(/Failed to load resource/.test(m.text()))netEntries.push(m.text());else errors.push(m.text());}});
  page.on('pageerror',err=>errors.push('pageerror: '+err.message));
  await page.addInitScript(({theme,lang,live,env})=>{
   localStorage.setItem('banking.preferences.v1',JSON.stringify({theme,lang,aiGlass:false}));
   if(live)sessionStorage.setItem('banking.workspace','Live');
   if(env)sessionStorage.setItem('banking.saxo.environment',env);
   document.addEventListener('securitypolicyviolation',e=>{(window.__csp=window.__csp||[]).push(e.violatedDirective+' '+e.blockedURI);});
  },{theme,lang:scenario.lang||'en',live:scenario.kind==='fixture'&&!scenario.demo,env:scenario.env||null});
  if(scenario.kind==='real'){
   page.on('response',async res=>{try{const u=new URL(res.url());if(!u.pathname.startsWith('/api/investments/saxo/'))return;const key=u.pathname.split('/').pop();if(res.status()===200)captured[key==='portfolio'?'portfolio':key==='preview'?'preview':key==='orders'?'ordersRead':key]=await res.json();}catch{}});
   await page.goto(base+'/',{waitUntil:'load'});await page.locator('#access-demo').click();await page.waitForSelector('.page-head h1');
   await page.evaluate(r=>{location.hash='#/'+r;},scenario.route);
  }else{
   await page.route('**/*',fixtureRouter(scenario.fixture()));
   await page.goto(base+'/#/'+scenario.route,{waitUntil:'load'});
  }
  try{await page.waitForFunction(()=>!!document.querySelector('.page-head .saxo-auth'));}
  catch(err){await page.screenshot({path:path.join(out,`failed-${scenario.id}.png`)});console.error('did not reach the page:',scenario.id,'\n',errors.join('\n'),'\n',netEntries.join('\n'),'\n',await page.evaluate(()=>document.body.innerText.slice(0,300)));throw err;}
  await page.waitForTimeout(scenario.route==='markets'?3500:3000);
  const report=await inspect(page);report.csp=await page.evaluate(()=>window.__csp||[]);
  // Contrast of the label over its pill and of the danger border over what surrounds it, from real pixels.
  const pill=report.pills.find(p=>['required','expired'].includes(p.state));
  if(pill){
   // The border is one pixel wide and its row depends on sub-pixel layout: take the brightest of the two candidate rows,
   // and the least favourable of the pixels around the pill (glass to the left and above, the dark ring outside the border).
   const r=pill.rect,x=r.x+r.w/2,b=Math.round(r.y),inside=[r.x+6,r.y+r.h/2];
   const px=await samples(page,[inside,[x,b-1],[x,b],[x,b+1],[r.x-5,r.y+r.h/2],[x,b-2],[x,b-6]]);
   const border=[px[1],px[2],px[3]].sort((m,n)=>lum(n)-lum(m))[0],ring=lum(px[1])<=lum(px[5])?px[1]:px[5];
   const glass=[px[4],px[6]].sort((m,n)=>contrast(ring,m)-contrast(ring,n))[0];
   report.contrast={labelWhiteOnPill:contrast([255,255,255],px[0]),borderOverFill:contrast(border,px[0]),borderOverGlass:contrast(border,glass),ringOverGlass:contrast(ring,glass),pillPixel:px[0],borderPixel:border,ringPixel:ring,glassPixel:glass};   // Keyboard: the sign-in button is reachable with Tab and shows a visible focus ring.
   const target=await page.evaluate(id=>{const b=document.getElementById(id)?.querySelector('button:not([hidden])');return b?b.id:null;},pill.id);
   if(target){let hit=false;for(let i=0;i<60&&!hit;i++){await page.keyboard.press('Tab');hit=await page.evaluate(id=>document.activeElement?.id===id,target);}
    report.keyboard=hit?await page.evaluate(()=>{const s=getComputedStyle(document.activeElement);return {id:document.activeElement.id,outline:s.outlineStyle+' '+s.outlineWidth+' '+s.outlineColor};}):'not reachable';}
  }
  if(interactions[scenario.id]&&w===1440&&theme==='graphite')report.interaction=await interactions[scenario.id](page);
  report.errors=errors;report.network=[...new Set(netEntries)];report.scenario=scenario.id;report.viewport=w;report.theme=theme;
  const file=`${scenario.id}-${w}-${theme}.png`;report.screenshot=file;
  await page.screenshot({path:path.join(out,file),fullPage:false});
  if(!quick)results.push(report);
  await ctx.close();
 }
}

(async()=>{
 // The Playwright-bundled browser may not be installed; fall back to the system Chrome or Edge.
 let browser;
 for(const options of [{},{channel:'chrome'},{channel:'msedge'}]){try{browser=await chromium.launch(options);break;}catch(err){if(options.channel==='msedge')throw err;}}
 try{
  const wanted=s=>only==='all'||s.kind===only||s.id===only;
  // Fixture scenarios that replay real Demo responses need them captured first.
  if(scenarios.some(s=>s.kind==='fixture'&&wanted(s))&&!scenarios.some(s=>s.kind==='real'&&wanted(s)))for(const s of scenarios.filter(s=>s.kind==='real'))await run(browser,s,true);
  for(const s of scenarios.filter(wanted))await run(browser,s);
 }finally{await browser.close();}
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(results,null,1));
 let failures=0;
 for(const r of results){
  const s=scenarios.find(x=>x.id===r.scenario),problems=[];
  if(r.h1!==1)problems.push('h1='+r.h1);
  if(r.overflowX||r.mainOverflow)problems.push('horizontal overflow');
  if(r.interaction?.length)problems.push('interaction: '+r.interaction.join('; '));
  if(r.titleOverlap)problems.push('controls overlap the title');
  if(r.controlsInHead===false)problems.push('controls leave the header');
  if(r.oneSided.length)problems.push('one-sided borders: '+r.oneSided.join(','));
  if(r.errors.length)problems.push('console errors: '+r.errors.join(' | '));
  if(r.csp.length)problems.push('CSP: '+r.csp.join(' | '));
  if(r.actions.some(a=>a.area!=='header-control'))problems.push('sign-in wording outside the header controls: '+JSON.stringify(r.actions.filter(a=>a.area!=='header-control')));
  if(s.expect){
   const header=r.actions.filter(a=>a.area==='header-control').length;
   if(header!==s.expect.header)problems.push(`header sign-in actions ${header}, expected ${s.expect.header}`);
   if(s.expect.pills&&JSON.stringify(r.pills.filter(p=>p.state!=='connected').map(p=>p.state))!==JSON.stringify(s.expect.pills))problems.push('pill states '+JSON.stringify(r.pills.map(p=>p.state))+', expected '+JSON.stringify(s.expect.pills));
   if(s.expect.notice!==undefined&&r.bars.length!==s.expect.notice)problems.push(`banners ${r.bars.length}, expected ${s.expect.notice}`);
   if(r.bars.some(b=>b.buttons.some(t=>signInWords.test(t))))problems.push('banner has a sign-in button');
  }
  if(r.pills.some(p=>['required','expired'].includes(p.state))&&r.contrast&&(r.contrast.labelWhiteOnPill<4.5||r.contrast.borderOverFill<3||Math.max(r.contrast.borderOverGlass,r.contrast.ringOverGlass)<3))problems.push('contrast '+JSON.stringify(r.contrast));
  if(r.keyboard==='not reachable'||(r.keyboard&&/none/.test(r.keyboard.outline)))problems.push('keyboard focus: '+JSON.stringify(r.keyboard));
  if(problems.length)failures++;
  console.log(`${problems.length?'FAIL':'ok  '} ${r.scenario} ${r.viewport}px ${r.theme}${problems.length?' — '+problems.join('; '):''}`);
 }
 console.log(`${results.length} checks, ${failures} with problems. Report and screenshots: ${out}`);
 process.exit(failures?1:0);
})().catch(err=>{console.error(err);process.exit(2);});
