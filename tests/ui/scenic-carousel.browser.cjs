// Real shared header/component and CSS with independent synthetic API responses.
// No backend, provider session, production request, or financial write is used.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'../../src/Banking.Api/wwwroot'),out=path.resolve(__dirname,'../../artifacts/scenic-carousel'),origin='https://banking.fixture';
const csp="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; frame-src 'self' https://www.tradingview-widget.com";
const stamp='2026-10-17T09:00:00Z',results=[];
async function geometry(page){return page.locator('.scene-cards').evaluate(el=>({left:el.scrollLeft,max:el.scrollWidth-el.clientWidth,width:el.clientWidth,offset:el.offsetLeft,items:[...el.children].map(x=>({left:x.offsetLeft,width:x.offsetWidth})),more:!!el.parentElement.querySelector('.scene-more')}));}
async function run(browser,{width,theme,lang,motion}){
 const context=await browser.newContext({viewport:{width,height:1000},hasTouch:width===390,reducedMotion:motion}),page=await context.newPage(),errors=[];let refresh=0,reads=0;
 page.on('pageerror',e=>errors.push(e.name));page.on('console',m=>{if(m.type()==='error')errors.push('CONSOLE_ERROR');});
 await page.addInitScript(({theme,lang})=>{localStorage.setItem('banking.preferences.v1',JSON.stringify({theme,lang,aiGlass:false}));sessionStorage.setItem('banking.workspace','Live');document.addEventListener('securitypolicyviolation',e=>(window.__csp||=[]).push(e.violatedDirective));},{theme,lang});
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());assert.equal(url.origin,origin,'Fixture never contacts a provider');
  if(url.pathname.startsWith('/advisor/'))return route.fulfill({contentType:'application/json',body:'{}'});
  if(url.pathname.startsWith('/api/')){
   assert.ok(['GET','HEAD'].includes(req.method()),'No write is part of this header test');
   const p=url.pathname.slice(5),environment=url.searchParams.get('environment')||'SIM';let body,status=200;
   if(p==='browser/status')body={role:'Owner',passwordConfigured:true,localAdvisor:false};
   else if(p==='mode')body={mode:'Live',availableModes:['Live','Demo']};
   else if(['accounts','categories','wealth','research'].includes(p))body=[];
   else if(p==='employee-stocks/uploads')body={items:[],total:0,development:[],current:null};
   else if(p==='investments/saxo/portfolio'){
    reads++;const sim=environment==='SIM',total=(sim?72000:26500)+refresh,cash=(sim?61000:20000)+refresh;
    body={environment,simulation:sim,portfolio:{currency:'EUR',totalValue:total,cash,reliability:'Ok',observedAt:stamp,accounts:[{id:'fictional-broker-account',currency:'EUR',reliability:'Ok',invested:sim?11500:6000,unbooked:sim?-500:500,available:cash}],positions:[],hasMore:false},orders:[],activity:[],ordersObservedAt:stamp};
   }else if(p==='account-insights')body={availableBalance:null,income:null,spending:null,net:null,retentionPercent:null,categories:[],coverage:{accountCount:0,sufficientHistory:false}};
   else if(p==='transactions')body={items:[],total:0};
   else throw new Error('UNEXPECTED_FIXTURE_ENDPOINT '+p);
   return route.fulfill({status,contentType:'application/json',headers:{'X-Banking-Mode':'Live','Cache-Control':'no-store'},body:JSON.stringify(body)});
  }
  const file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));assert.ok(file.startsWith(root+path.sep));
  return route.fulfill({body:await fs.readFile(file),headers:{'Content-Security-Policy':csp},contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream'});
 });
 try{
  await page.goto(origin+'/#/investments');await page.waitForSelector('.scene-stage .scene-card');await page.waitForFunction(()=>!document.querySelector('#main').hasAttribute('aria-busy'));
  const initial=await geometry(page),more=page.locator('.scene-more');
  if(width===1222){
   assert.ok(initial.max>2&&initial.offset>initial.width/2,'Reproduces a nonzero stage-relative card origin');
   await more.click();await page.waitForFunction(prior=>{const el=document.querySelector('.scene-cards');return el.scrollLeft>prior+1&&Math.abs(el.scrollWidth-el.clientWidth-el.scrollLeft)<2;},initial.left);
   const advanced=await geometry(page);assert.ok(advanced.left>initial.left+1,'More must advance the clipped card');assert.ok(Math.abs(advanced.left-advanced.max)<2);
   await more.focus();await page.keyboard.press('Enter');await page.waitForFunction(start=>Math.abs(document.querySelector('.scene-cards').scrollLeft-start)<2,initial.left);
   await more.focus();await page.keyboard.press('Space');await page.waitForFunction(start=>{const el=document.querySelector('.scene-cards');return el.scrollLeft>start+1&&Math.abs(el.scrollWidth-el.clientWidth-el.scrollLeft)<2;},initial.left);
   const retained=(await geometry(page)).left;await page.locator('.scene-stage').evaluate(el=>window.__priorScene=el);refresh=7;const before=reads;await page.locator('#inv-refresh').click();
   await page.waitForFunction(()=>window.__priorScene&&!window.__priorScene.isConnected);assert.ok(reads>before);
   assert.ok(Math.abs((await geometry(page)).left-retained)<2,'Live recomposition retains card-row scroll');
   await page.setViewportSize({width:1440,height:1000});await page.waitForFunction(()=>!document.querySelector('.scene-more'));assert.equal((await geometry(page)).max,0);
   await page.setViewportSize({width:1222,height:1000});await page.waitForSelector('.scene-more');await page.locator('.scene-more').click();await page.waitForFunction(()=>document.querySelector('.scene-cards').scrollLeft>1);
  }else if(initial.max<=2)assert.equal(initial.more,false,'More is absent when cards fit');
  if(width===390){
   assert.ok(initial.max>2);assert.equal(await more.isVisible(),false,'Phone uses the existing native scroll row');
   const b=await page.locator('.scene-cards').boundingBox(),cdp=await context.newCDPSession(page),y=b.y+b.height/2;
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width-30,y}]});
   for(let step=1;step<=5;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:b.x+b.width-30-step*40,y}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForFunction(()=>document.querySelector('.scene-cards').scrollLeft>1);
  }
  const label=env=>lang==='da'?`Saxo ${env}-kontoværdi`:`Saxo ${env} account value`;
  assert.equal(await page.locator('.scene-lead .scene-eyebrow').textContent(),label('SIM'));
  const amount=n=>new Intl.NumberFormat(lang==='da'?'da-DK':'en-GB',{maximumFractionDigits:2}).format(n);
  assert.ok((await page.locator('.scene-figure').innerText()).includes(amount(72000+refresh)));
  await page.locator('#inv-environment').selectOption('LIVE');await page.waitForFunction(({label,value})=>document.querySelector('.scene-eyebrow')?.textContent===label&&document.querySelector('.scene-figure')?.textContent.includes(value),{label:label('LIVE'),value:amount(26500+refresh)});
  assert.ok((await page.locator('.scene-figure').innerText()).includes(amount(26500+refresh)));assert.match(await page.locator('.scene-figure').innerText(),/EUR/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.locator('.scenic-page-head').screenshot({path:path.join(out,`investments-${width}-${theme}-${lang}.png`)});
  // Compare Accounts under the same shared header rules and native carousel behavior.
  await page.goto(origin+'/#/accounts');await page.waitForSelector('.scene-stage .scene-card');
  assert.equal(await page.locator('.scene-stage .scene-card').count(),3);await page.locator('.scenic-page-head').screenshot({path:path.join(out,`accounts-${width}-${theme}-${lang}.png`)});
  const checks=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,csp:window.__csp||[],edges:[...document.querySelectorAll('.scenic-page-head *')].filter(el=>{const s=getComputedStyle(el),n=['Top','Right','Bottom','Left'].filter(k=>parseFloat(s['border'+k+'Width'])>0&&s['border'+k+'Style']!=='none').length;return n>0&&n<4;}).map(el=>el.className)}));
  assert.deepEqual(checks,{overflow:false,csp:[],edges:[]});assert.deepEqual(errors,[]);
  results.push({width,theme,lang,motion,initial,simLiveBrokerValues:true,accountsCompared:true,recomposition:width===1222,nativeSwipe:width===390,consoleErrors:0,cspViolations:0,overflow:false});
 }finally{await context.close();}
}
(async()=>{await fs.mkdir(out,{recursive:true});const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});try{
 for(const width of process.env.SCENE_QUICK?[1222]:[1222,1440,1024,390])for(const [theme,lang] of process.env.SCENE_QUICK?[['light','en']]:[['light','en'],['graphite','da']])await run(browser,{width,theme,lang,motion:'reduce'});
 if(!process.env.SCENE_QUICK)await run(browser,{width:1222,theme:'light',lang:'en',motion:'no-preference'});
 await fs.writeFile(path.join(out,'acceptance.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({passed:results.length,evidence:out}));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
