// Isolated frontend/HTTP fixtures only. DTO and XLSX are emitted by the real C# parser test.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'../../src/Banking.Api/wwwroot'),out=path.resolve(__dirname,'../../artifacts/employee-stock-preview'),origin='https://banking.fixture';
const csp="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; frame-src 'self' https://www.tradingview-widget.com";
(async()=>{await fs.mkdir(out,{recursive:true});const report=JSON.parse(await fs.readFile(path.join(out,'report.json'))),workbook=await fs.readFile(path.join(out,'synthetic.xlsx'));
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});let count=0;
 try{for(const width of [1440,1024,390])for(const theme of ['light','graphite'])for(const lang of ['en','da']){
  const context=await browser.newContext({viewport:{width,height:1000},hasTouch:width===390,reducedMotion:'reduce'}),page=await context.newPage(),errors=[],writes=[];let uploadCalls=0,slow=false,fail=false,role='Owner';
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(({theme,lang})=>{localStorage.setItem('banking.preferences.v1',JSON.stringify({theme,lang,aiGlass:false}));sessionStorage.setItem('banking.workspace','Live');document.addEventListener('securitypolicyviolation',e=>(window.__csp||=[]).push(e.violatedDirective));},{theme,lang});
  await page.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());if(u.origin!==origin)return route.abort();
   if(u.pathname.startsWith('/api/')){
    const p=u.pathname.slice(5),mode=req.headers()['x-banking-mode']||'Demo';let body={},status=200;
    if(req.method()!=='GET')writes.push(p);
    if(p==='browser/logout'){role=null;body={};}
    else if(p==='browser/demo'){role='Demo';body={role:'Demo'};}
    else if(p==='browser/status')body={role,passwordConfigured:true,localAdvisor:false};
    else if(p==='mode')body={mode,availableModes:['Demo','Live']};
    else if(['accounts','categories','wealth','research'].includes(p))body=[];
    else if(p==='transactions')body={items:[],total:0};
    else if(p==='account-insights')body={availableBalance:null,income:null,spending:null,net:null,retentionPercent:null,categories:[],coverage:{accountCount:0,sufficientHistory:false,oldestAccountSync:null}};
    else if(p==='employee-stocks/preview'){
     uploadCalls++;assert.equal(mode,'Live');assert.equal(req.headers()['content-type'],'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');assert.deepEqual(req.postDataBuffer(),workbook);
     if(slow)await new Promise(r=>setTimeout(r,350));if(fail){status=400;body={error:'STOCK_INVALID_WORKBOOK'};}else body=report;
    }
    else if(p==='investments/saxo/portfolio'){status=503;body={error:'SAXO_SIGN_IN_REQUIRED'};}
    else if(p.startsWith('markets/chart')){status=503;body={error:'SAXO_MARKET_SIGN_IN_REQUIRED'};}
    else if(mode==='Demo'&&req.method()==='GET')body={};
    else throw Error('Unexpected fixture '+req.method()+' '+p);
    return route.fulfill({status,contentType:'application/json',headers:{'X-Banking-Mode':mode},body:JSON.stringify(body)});
   }
   if(u.pathname.startsWith('/advisor/'))return route.fulfill({contentType:'application/json',body:'{}'});
   const file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(!file.startsWith(root+path.sep))return route.abort();
   try{return route.fulfill({body:await fs.readFile(file),headers:{'Content-Security-Policy':csp},contentType:({'.js':'text/javascript','.css':'text/css','.html':'text/html','.webp':'image/webp','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream'});}catch{return route.fulfill({status:404,body:''});}
  });
  const ready=async()=>{await page.waitForSelector('.page-head.scene-composed');await page.waitForFunction(()=>!document.querySelector('#main').hasAttribute('aria-busy'));};
  const inspect=async label=>{const s=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,csp:window.__csp||[],edges:[...document.querySelectorAll('#main *')].filter(el=>{const s=getComputedStyle(el);const sides=['Top','Right','Bottom','Left'].filter(k=>parseFloat(s['border'+k+'Width'])>0&&s['border'+k+'Style']!=='none');return sides.length>0&&sides.length<4;}).map(el=>el.className)}));assert.equal(s.overflow,false,label);assert.deepEqual(s.csp,[]);assert.deepEqual(s.edges,[],label);assert.deepEqual(errors,[]);await page.screenshot({path:path.join(out,`${label}-${width}-${theme}-${lang}.png`),fullPage:true});};
  await page.goto(origin+'/#/accounts');await ready();assert.equal(await page.locator('.sidebar a[href="#/accounts"]').getAttribute('aria-current'),'page');await inspect('accounts');
  await page.goto(origin+'/#/investments');await ready();await page.waitForSelector('#employee-stock-file');await inspect('empty-saxo-unavailable');
  await page.locator('#manual-investment-add').click();await page.waitForSelector('#wealth-form');assert.equal(await page.locator('#wealth-form').count(),1);await page.locator('#overlay [data-action=close]').click();
  const upload=()=>page.locator('#employee-stock-file').setInputFiles({name:'independent-synthetic.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:workbook});
  await upload();await page.waitForSelector('#stock-cutoff');await page.locator('#stock-cutoff').fill('2026-10-16');
  assert.equal(await page.locator('.stock-bar').count(),4);assert.match(await page.locator('#stock-chart').innerText(),/90[.,]375/);
  await page.locator('.stock-bar').first().focus();await page.keyboard.press('Enter');assert.match(await page.locator('#stock-point').innerText(),/2026/);
  await page.locator('#stock-price').fill('200');await page.locator('#stock-rate').fill('6.25');assert.doesNotMatch(await page.locator('#stock-chart').innerText(),/18[,. ]?075/);
  await page.locator('#stock-observed').fill('2026-10-16');await page.locator('#stock-price-source').fill('Synthetic reviewed manual quote');assert.match(await page.locator('#stock-chart').innerText(),/18[,. ]?075/);
  await inspect('preview');
  await page.locator('#stock-price').fill('1000001');assert.equal(await page.locator('#stock-price').evaluate(el=>el.validity.valid),false);assert.doesNotMatch(await page.locator('#stock-chart').innerText(),/18[,. ]?075|Infinity/);
  await page.locator('#stock-price').fill('200');await page.locator('#stock-rate').fill('10001');assert.equal(await page.locator('#stock-rate').evaluate(el=>el.validity.valid),false);assert.doesNotMatch(await page.locator('#stock-chart').innerText(),/112[,. ]?968|Infinity/);
  await page.locator('#stock-rate').fill('6.25');await page.locator('#stock-observed').fill('1899-01-01');assert.equal(await page.locator('#stock-observed').evaluate(el=>el.validity.valid),false);assert.doesNotMatch(await page.locator('#stock-chart').innerText(),/18[,. ]?075|Infinity/);
  await page.locator('#stock-observed').fill('2026-10-16');
  const wrap=page.locator('.stock-table-wrap').first();await wrap.focus();await page.keyboard.press('ArrowRight');assert.equal(await wrap.getAttribute('tabindex'),'0');
  const select=page.locator('#inv-environment');await select.selectOption('LIVE');assert.equal(await page.locator('#stock-cutoff').count(),1);assert.equal(await page.locator('#employee-stock-file').isEnabled(),true);
  // New malformed preview clears prior successful facts, and a retry still works.
  fail=true;await upload();await page.waitForFunction(()=>document.querySelector('#employee-stock-status').textContent.includes('STOCK_INVALID_WORKBOOK'));assert.equal(await page.locator('#stock-chart').count(),0);
  fail=false;await upload();await page.waitForSelector('#stock-chart');
  // Navigate during a response: no workbook facts/caches can leak to another route/workspace.
  slow=true;await upload();await page.goto(origin+'/#/accounts');await ready();assert.equal(await page.locator('#stock-chart').count(),0);
  await page.goto(origin+'/#/investments');await ready();assert.equal(await page.locator('#stock-chart').count(),0);
  if(width<=900)await page.locator('[data-action=more]').click();await page.locator('.account-menu summary:visible').click();await page.locator('[data-action=logout]:visible').click();await page.locator('#access-demo').click();await page.waitForURL('**/#/overview');
  await page.goto(origin+'/#/investments');await ready();assert.equal(await page.locator('#employee-stock-file').count(),0);assert.equal(await page.locator('#stock-chart').count(),0);
  assert.ok(uploadCalls>=3);assert.ok(writes.every(p=>['employee-stocks/preview','browser/logout','browser/demo'].includes(p)));await inspect('demo-isolated');count++;await context.close();
 }
 console.log(JSON.stringify({passed:count,viewports:[1440,1024,390],themes:['light','graphite'],languages:['en','da'],actualOwnerFileTested:false,financialWrites:0}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
