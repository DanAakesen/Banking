// Isolated synthetic browser fixtures. Every request is fulfilled or blocked in-process;
// no app backend, database, Saxo session, trading, or production requests are used.
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require(process.env.BANKING_PLAYWRIGHT_PATH||'playwright');
const root=path.resolve(__dirname,'../../src/Banking.Api/wwwroot');
const out=path.resolve(__dirname,'../../artifacts/saxo-response-delay');
const origin='https://banking.fixture';
const stamp='2026-10-01T10:00:01Z';
const names={'MSFT:xnas':'Microsoft','SIE:xetr':'Siemens'};
const symbols=Object.keys(names);
const watch=symbols.map((symbol,i)=>({id:'w'+i,symbol,name:names[symbol],version:1}));
const positions=symbols.map((symbol,i)=>({positionId:String(i),netPositionId:String(i)+'__Share',accountId:'1',instrument:i+261,assetType:'Stock',symbol,currency:'USD',baseCurrency:'USD',quantity:2,quantityText:'2',openPrice:10,price:0,priceType:'None',reliability:'ApproximatedPrice',marketValueOpenInBaseCurrency:-20,openedAt:'2026-05-04T10:00:00Z'}));
const portfolio={currency:'USD',cash:100,totalValue:140,reliability:'Ok',observedAt:stamp,accounts:[{id:'1',currency:'USD',reliability:'Ok',invested:40}],positions};
const snapshot=(symbol,range,over={})=>({source:'Saxo LIVE',symbol,name:names[symbol],range,currency:'USD',assetType:'Stock',exchange:'xnas',interval:'1d',price:14,previousClose:13,quoteTime:stamp,quoteStatus:'available',historyStatus:'available',chartDelayMinutes:symbol===symbols[0]?15:null,quoteDelayMinutes:symbol===symbols[0]?0:25,retrievedAt:'2026-10-01T10:00:02Z',historyRetrievedAt:stamp,bars:[{time:1780000000,open:10,high:13,low:9,close:12},{time:1780086400,open:12,high:15,low:11,close:14}],...over});
const csp="default-src 'self'; script-src 'self'; style-src 'self' 'sha256-UjmwW5hqkbmZat2z0a4MIudqMdHHunQ57o+t2nldQPQ='; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; frame-src 'self' https://www.tradingview-widget.com";
async function run(browser,{route,width,theme,lang='en',interactive=false}){
 const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
 const page=await context.newPage(),errors=[],calls=[];let phase='fresh';
 if(interactive&&route==='investments')await page.clock.install();
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({theme,lang})=>{if(location.origin!=='https://banking.fixture')return;localStorage.setItem('banking.preferences.v1',JSON.stringify({theme,lang,aiGlass:false}));sessionStorage.setItem('banking.workspace','Demo');document.addEventListener('securitypolicyviolation',e=>{(window.__csp||=[]).push(e.violatedDirective);});},{theme,lang});
 await page.route('**/*',async r=>{
  const url=new URL(r.request().url());if(url.origin!==origin)return r.fulfill({status:200,contentType:'text/html',body:''});
  if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/advisor/')){
   // Non-read app initialization requests are answered by the fixture only.
   if(!['GET','HEAD'].includes(r.request().method())&&!url.pathname.endsWith('/preview'))return r.fulfill({status:403,contentType:'application/json',body:JSON.stringify({error:'FIXTURE_MUTATION_BLOCKED'})});
   const p=url.pathname.slice(5);let body={},status=200;
   if(p==='browser/status')body={role:'Demo',passwordConfigured:true,localAdvisor:false};
   else if(p==='mode')body={mode:'Demo',availableModes:['Demo']};
   else if(p==='accounts'||p==='categories')body=[];
   else if(p==='research')body=watch;
   else if(p.startsWith('transactions?')||p==='transactions')body={items:[],total:0};
   else if(p.startsWith('account-insights'))body={availableBalance:null,income:null,spending:null,net:null,retentionPercent:null,categories:[],coverage:{accountCount:0,sufficientHistory:false,oldestAccountSync:null}};
   else if(p.startsWith('markets/chart')){
    const symbol=url.searchParams.get('symbol'),range=url.searchParams.get('range');calls.push({symbol,range,phase});
    if(phase==='failed'){status=503;body={error:'SAXO_MARKET_DATA_UNAVAILABLE'};}
    else if(phase==='denied'){status=403;body={error:'SAXO_MARKET_DATA_NO_ACCESS'};}
    else if((phase==='slow'&&range==='3mo')||(phase==='slowquote'&&range==='1d')){await new Promise(resolve=>setTimeout(resolve,500));body=snapshot(symbol,range,{chartDelayMinutes:99,quoteDelayMinutes:99});}
    else body=snapshot(symbol,range,phase==='updated'?{chartDelayMinutes:0,quoteDelayMinutes:7,retrievedAt:'2026-10-01T10:01:04Z',historyRetrievedAt:'2026-10-01T10:01:03Z'}:phase==='quote-stale'?{quoteStatus:'stale',stale:true,quoteDelayMinutes:11}:phase==='quote-denied'?{quoteStatus:'denied',price:null}:phase==='history-denied'?{historyStatus:'denied',bars:[]}:phase==='partial'?{historyStatus:'stale',stale:true,quoteDelayMinutes:8,retrievedAt:'2026-10-01T10:02:05Z'}:{});
   }
   else if(p.startsWith('investments/saxo/portfolio'))body=route==='investments'?{environment:'SIM',simulation:true,portfolio,orders:[],activity:[],ordersObservedAt:stamp}:portfolio;
   else if(p.startsWith('investments/saxo/status'))body={configured:true};
   else if(p.startsWith('investments/saxo/orders'))body={orders:[],history:[]};
   else if(p.startsWith('investments/saxo/preview')){status=503;body={error:'SAXO_SIGN_IN_REQUIRED'};}
   else if(p.endsWith('s'))body=[];
   return r.fulfill({status,contentType:'application/json',headers:{'X-Banking-Mode':'Demo','Cache-Control':'no-store'},body:JSON.stringify(body)});
  }
  const file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
  if(!file.startsWith(root+path.sep))return r.fulfill({status:404,body:''});
  try{const body=await fs.readFile(file);return r.fulfill({status:200,body,headers:{'Content-Security-Policy':csp},contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream'});}catch{return r.fulfill({status:404,body:''});}
 });
 const meta=route==='markets'?'#td-source':'.inv-chart-meta';
 await page.goto(origin+'/#/'+route+(route==='markets'?'/'+encodeURIComponent(symbols[0]):''));
 await page.waitForFunction(selector=>document.querySelector(selector)?.textContent.includes('15 min'),meta);
 const chartWord=lang==='da'?'Graf':'Chart',priceWord=lang==='da'?'Kurs':'Price';
 assert.match(await page.locator(meta).innerText(),new RegExp(chartWord+' · 15 min'));
 const card=route==='markets'?'.td-response-meta':'.inv-response-meta';
 await page.waitForFunction(selector=>document.querySelectorAll(selector).length>=2,card);
 const cards=await page.locator(card).allTextContents();
 assert.ok(cards.some(t=>t.includes(priceWord+' · '+(lang==='da'?'Ingen oplyst forsinkelse':'No reported delay'))));
 assert.ok(cards.some(t=>t.includes(priceWord+' · 25 min')));
 assert.ok(cards.some(t=>t.includes(chartWord+' · '+(lang==='da'?'Forsinkelse ukendt':'Delay unknown'))));
 if(interactive&&route==='markets'){
  // Cached listing reuse keeps data and metadata together.
  const before=calls.filter(c=>c.symbol===symbols[0]&&c.range==='1d').length;
  await page.locator('[data-symbol="1"]').click();await page.waitForFunction(()=>document.querySelector('#td-source')?.textContent.includes('Price · 25 min'));
  await page.locator('[data-symbol="0"]').click();await page.waitForFunction(()=>document.querySelector('#td-source')?.textContent.includes('Chart · 15 min'));
  assert.equal(calls.filter(c=>c.symbol===symbols[0]&&c.range==='1d').length,before);
  phase='updated';await page.locator('#td-refresh').click();await page.waitForFunction(()=>document.querySelector('#td-source')?.textContent.includes('Price · 7 min'));
  assert.match(await page.locator(meta).innerText(),/Chart · No reported delay/);
  phase='partial';await page.locator('#td-refresh').click();await page.waitForFunction(()=>document.querySelector('#td-source')?.textContent.includes('Price · 8 min'));
  let text=await page.locator(meta).innerText();assert.match(text,/Chart · Update failed/);assert.doesNotMatch(text,/Price · Update failed/);
  phase='failed';await page.locator('#td-refresh').click();await page.waitForFunction(()=>document.querySelector('#td-source')?.textContent.includes('Price · Update failed'));
  text=await page.locator(meta).innerText();assert.match(text,/Price · 8 min delayed/);assert.match(text,/Price retrieved · .*:05/);
  phase='quote-stale';await page.locator('#td-refresh').click();await page.waitForFunction(()=>document.querySelector('#td-source')?.textContent.includes('Price · 11 min'));
  text=await page.locator(meta).innerText();assert.match(text,/Price · Update failed/);assert.doesNotMatch(text,/Chart · Update failed/);
  phase='quote-denied';await page.locator('[data-range="5d"]').click();await page.waitForFunction(()=>!document.querySelector('#td-source')?.textContent.includes('Price ·'));assert.match(await page.locator(meta).innerText(),/Chart · 15 min/);assert.equal(await page.locator('.td-summary .scene-figure').textContent(),'—');
  phase='history-denied';await page.locator('#td-refresh').click();await page.waitForFunction(()=>!document.querySelector('#td-source')?.textContent.includes('Chart ·'));assert.match(await page.locator(meta).innerText(),/Price · No reported delay/);
  phase='slowquote';await page.locator('#td-refresh').click();await page.waitForTimeout(50);phase='updated';await page.locator('#td-refresh').click();await page.waitForTimeout(650);assert.doesNotMatch((await page.locator('.td-response-meta').allTextContents()).join(' '),/99 min/);
  phase='slow';await page.locator('[data-range="3mo"]').click();await page.locator('[data-range="6mo"]').click();await page.waitForTimeout(650);assert.doesNotMatch(await page.locator(meta).innerText(),/99 min/);
  phase='denied';await page.locator('#td-refresh').click();await page.waitForFunction(()=>!document.querySelector('#td-source')?.textContent.includes('Chart ·'));
  assert.doesNotMatch(await page.locator(meta).innerText(),/Price · \d/);
 }
 if(interactive&&route==='investments'){
  await page.locator('[data-inv-colour="today"]').click();await page.waitForSelector('.inv-tile-meta');assert.match((await page.locator('.inv-tile-meta').allTextContents()).join(' '),/Chart · 15 min delayed/);await page.locator('[data-inv-colour="purchase"]').click();
  await page.locator('[data-inv-tile]').nth(1).click();await page.waitForFunction(()=>document.querySelector('.inv-chart-meta')?.textContent.includes('Price · 25 min'));
  await page.locator('[data-inv-tile]').nth(0).click();await page.waitForFunction(()=>document.querySelector('.inv-chart-meta')?.textContent.includes('Chart · 15 min'));
  phase='updated';await page.locator('[data-inv-range="3mo"]').click();await page.waitForFunction(()=>document.querySelector('.inv-chart-meta')?.textContent.includes('Price · 7 min'));
  phase='partial';await page.locator('[data-inv-range="6mo"]').click();await page.waitForFunction(()=>document.querySelector('.inv-chart-meta')?.textContent.includes('Price · 8 min'));
  const text=await page.locator(meta).innerText();assert.match(text,/Chart · Update failed/);assert.doesNotMatch(text,/Price · Update failed/);
  phase='updated';await page.locator('[data-inv-range="1d"]').click();await page.waitForFunction(()=>document.querySelector('.inv-chart-meta')?.textContent.includes('Price · 7 min'));
  phase='failed';await page.clock.fastForward(21000);await page.waitForFunction(()=>document.querySelector('.inv-chart-meta')?.textContent.includes('Price · Update failed'));
  const kept=await page.locator(meta).innerText();assert.match(kept,/Chart · No reported delay/);assert.match(kept,/Price · 7 min delayed/);assert.match(kept,/Price retrieved · .*:04/);
  phase='slow';await page.locator('[data-inv-range="3mo"]').click();await page.locator('[data-inv-range="1y"]').click();await page.waitForTimeout(650);assert.doesNotMatch(await page.locator(meta).innerText(),/99 min/);
 }
 const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,csp:window.__csp||[],oneSided:[...document.querySelectorAll('#main *')].filter(el=>{const s=getComputedStyle(el),n=['Top','Right','Bottom','Left'].filter(k=>parseFloat(s['border'+k+'Width'])>0&&s['border'+k+'Style']!=='none').length;return n>0&&n<4;}).map(el=>el.className)}));
 assert.equal(layout.overflow,false);assert.deepEqual(layout.csp,[]);assert.deepEqual(errors,[]);assert.deepEqual(layout.oneSided,[]);
 await page.screenshot({path:path.join(out,`${route}-${width}-${theme}-${lang}.png`),fullPage:true});
 // Accounts is the shared layout reference, using the same safe empty fixture.
 await page.goto(origin+'/#/accounts');await page.waitForSelector('.page-head.scene-composed');assert.equal(await page.locator('#main > .error').count(),0);await page.screenshot({path:path.join(out,`accounts-${width}-${theme}-${lang}.png`)});
 await context.close();console.log(`PASS ${route} ${width}px ${theme} ${lang}${interactive?' interactions':''}`);
}
(async()=>{
 await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.BANKING_CHROMIUM_PATH||'/usr/bin/chromium'});
 try{for(const route of (process.env.BANKING_FIXTURE_ROUTE?[process.env.BANKING_FIXTURE_ROUTE]:['markets','investments']))for(const width of [1440,1024,390])for(const theme of ['graphite','light'])await run(browser,{route,width,theme,interactive:width===1440&&theme==='graphite'});for(const route of ['markets','investments'])await run(browser,{route,width:390,theme:'light',lang:'da'});}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
