// Every API is an isolated fixture. No provider, AI call or production write.
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../../src/Banking.Api/wwwroot');
const out=path.resolve(__dirname,'../../artifacts/presentation-readiness/pension');
const origin='https://banking.fixture';
const csp="default-src 'self'; script-src 'self'; style-src 'self' 'sha256-UjmwW5hqkbmZat2z0a4MIudqMdHHunQ57o+t2nldQPQ='; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; frame-src 'self' https://www.tradingview-widget.com";
const original={id:'pension-one',name:'PFA · ••6789',provider:'PFA',kind:'Pension',value:200000,currency:'DKK',asOf:'2026-01-01',sourceNote:'Synthetic fixture statement',annualPension:12000,retirementAge:70,version:'v1'};
const statement=value=>({CPR:'private-cpr-fixture',Contacts:['private-contact-fixture'],PensionProviders:[{PensionProviderName:'PFA',CurrencyCode:'DKK',Schemes:[{ReferenceNumber:'123456789',SavedValue:value,SavedValueDate:'2026-09-30',Benefits:[{Pension:{AnnualAmount:999999,CPR:'private-benefit-fixture'}}]}]}]});
async function run(browser,{width,theme,lang='en',interactive=false}){
 const store=await fs.mkdtemp(path.join(os.tmpdir(),'banking-pension-'));
 const recordPath=path.join(store,'records.json');await fs.writeFile(recordPath,JSON.stringify([original]));
 const context=await browser.newContext({viewport:{width,height:1000},hasTouch:width===390,reducedMotion:'reduce'});
 const page=await context.newPage(),errors=[],writes=[],previews=[];let conflict=false,failedRead=false;
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({theme,lang})=>{localStorage.setItem('banking.preferences.v1',JSON.stringify({theme,lang,aiGlass:false}));sessionStorage.setItem('banking.workspace','Demo');document.addEventListener('securitypolicyviolation',e=>(window.__csp||=[]).push(e.violatedDirective));},{theme,lang});
 await page.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());
  if(u.origin!==origin)return route.abort();
  if(u.pathname.startsWith('/api/')){
   const p=u.pathname.slice(5),method=req.method(),mode=req.headers()['x-banking-mode']||'Demo';let status=200,body={};
   const records=mode==='Demo'?JSON.parse(await fs.readFile(recordPath)):[];
   if(p==='browser/status')body={role:'Demo',passwordConfigured:true,localAdvisor:false};
   else if(p==='mode')body={mode:'Demo',availableModes:['Demo']};
   else if(p==='wealth'&&method==='GET'){body=records;if(failedRead){status=503;body={error:'FIXTURE_UNAVAILABLE'};}}
   else if(p==='wealth/summary')body={currency:'DKK',bankCash:null,pension:records.reduce((s,r)=>s+r.value,0),investments:0,debt:0,recordedNetWealth:null,excludingPension:null,accounts:[]};
   else if(p==='pension/statement-preview'){
    const input=req.postDataJSON();previews.push(input);
    assert.doesNotMatch(JSON.stringify(input),/private-|123456789|999999/);
    const scheme=input.PensionProviders[0]?.Schemes?.[0],value=scheme?.SavedValue;
    if(value===111)await new Promise(resolve=>setTimeout(resolve,450));
    body={rows:typeof value==='number'?[{name:'PFA · ••6789',provider:'PFA',kind:'Pension',value,currency:'DKK',asOf:'2026-09-30',sourceNote:'PensionsInfo JSON · scheme balance · verify against the original statement',annualPension:null,retirementAge:null}]:[],skipped:typeof value==='number'?0:1,saved:false};
   }
   else if(p.startsWith('wealth/')&&method==='PUT'){
    const input=req.postDataJSON();writes.push({method,p,input,mode});
    if(conflict||input.version!==records[0].version){status=409;body={error:'VERSION_CONFLICT'};}
    else{body={...records[0],...input,version:'v'+(Number(records[0].version.slice(1))+1)};await fs.writeFile(recordPath,JSON.stringify([body]));}
   }
   else if(p==='wealth'&&method==='POST'){status=409;body={error:'VALUATION_ALREADY_EXISTS_EDIT_IT'};writes.push({method,input:req.postDataJSON()});}
   else if(p==='accounts'||p==='categories')body=[];
   else if(p==='transactions')body={items:[],total:0};
   else if(p==='account-insights')body={availableBalance:null,income:null,spending:null,net:null,retentionPercent:null,categories:[],coverage:{accountCount:0,sufficientHistory:false,oldestAccountSync:null}};
   else throw Error('Unexpected fixture request '+method+' '+p);
   return route.fulfill({status,contentType:'application/json',headers:{'X-Banking-Mode':mode},body:JSON.stringify(body)});
  }
  if(u.pathname.startsWith('/advisor/'))return route.fulfill({contentType:'text/html',body:''});
  const file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));
  if(!file.startsWith(root+path.sep))return route.abort();
  try{return route.fulfill({body:await fs.readFile(file),headers:{'Content-Security-Policy':csp},contentType:({'.js':'text/javascript','.css':'text/css','.html':'text/html','.webp':'image/webp','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream'});}catch{return route.fulfill({status:404,body:''});}
 });
 const upload=(name,content)=>page.locator('#pension-json').setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(typeof content==='string'?content:JSON.stringify(content))});
 const ready=async()=>{await page.waitForSelector('.page-head.scene-composed');await page.waitForFunction(()=>!document.querySelector('#main').hasAttribute('aria-busy'));};
 const inspect=async label=>{
  const state=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,csp:window.__csp||[],edges:[...document.querySelectorAll('#main *')].filter(el=>{const s=getComputedStyle(el),n=['Top','Right','Bottom','Left'].filter(k=>parseFloat(s['border'+k+'Width'])>0&&s['border'+k+'Style']!=='none').length;return n>0&&n<4;}).map(el=>el.className)}));
  assert.equal(state.overflow,false,label);assert.deepEqual(state.csp,[]);assert.deepEqual(state.edges,[]);assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(out,`${label}-${width}-${theme}-${lang}.png`),fullPage:true});
 };
 try{
  await page.goto(origin+'/#/pension');await ready();
  assert.equal(await page.locator('.pension-summary').isVisible(),false);await inspect('pension');
  await upload('statement.json',statement(210000.50));await page.locator('[data-import-scheme]').click();
  assert.equal(await page.locator('#wealth-existing').inputValue(),original.id);
  assert.equal(await page.locator('#wealth-income').inputValue(),'12000');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'wealth-existing');
  await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'wealth-name');
  await page.locator('#wealth-value').fill(lang==='da'?'210.000,50':'210,000.50');
  await page.screenshot({path:path.join(out,`review-${width}-${theme}-${lang}.png`)});
  await page.locator('#wealth-form button[type=submit]').click();await page.waitForSelector('#wealth-form',{state:'detached'});await ready();
  assert.equal(writes.length,1);assert.equal(writes[0].method,'PUT');assert.equal(writes[0].input.value,210000.50);assert.equal(writes[0].input.version,'v1');assert.equal(writes[0].input.annualPension,12000);
  await page.reload();await ready();const saved=JSON.parse(await fs.readFile(recordPath));assert.equal(saved.length,1);assert.equal(saved[0].value,210000.50);assert.equal(saved[0].version,'v2');
  if(interactive){
   for(const [name,content,message] of [['bad.json','{invalid','not valid JSON'],['big.json','x'.repeat(60001),'60 KB'],['pfa.pdf','%PDF fixture','PDF'],['wrong.json',{},'not a supported']]){
    const n=previews.length;await upload(name,content);await page.waitForFunction(text=>document.querySelector('#pension-import-preview').textContent.includes(text),message);assert.equal(previews.length,n);
   }
   await upload('missing.json',statement(null));await page.waitForFunction(()=>document.querySelector('#pension-import-preview').textContent.includes('No supported balances'));await inspect('empty-preview');
   await upload('slow.json',statement(111));await page.waitForTimeout(30);await upload('newer.json',statement(222));await page.waitForTimeout(550);assert.match(await page.locator('#pension-import-preview').innerText(),/222/);assert.doesNotMatch(await page.locator('#pension-import-preview').innerText(),/111/);
   await page.locator('[data-import-scheme]').click();conflict=true;await page.locator('#wealth-form button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('#wealth-form .error')?.textContent.includes('latest version'));assert.equal(await page.locator('#wealth-value').inputValue(),'222');await page.screenshot({path:path.join(out,'conflict.png')});
   // A stale save leaves values available for review; no blind automatic retry.
   assert.equal(writes.length,2);assert.equal(JSON.parse(await fs.readFile(recordPath))[0].value,210000.50);
   await page.reload();await ready();await fs.writeFile(recordPath,'[]');await page.reload();await ready();await inspect('no-statements');
   failedRead=true;await page.reload();await page.waitForSelector('[data-action=refresh]');await inspect('read-error');failedRead=false;await page.locator('[data-action=refresh]').click();await ready();
  }
  await page.goto(origin+'/#/accounts');await ready();await inspect('accounts-reference');
  console.log(`PASS pension ${width}px ${theme} ${lang}${interactive?' errors/race/conflict/retry':''}`);
 }finally{await context.close();await fs.rm(store,{recursive:true,force:true});}
}
(async()=>{await fs.mkdir(out,{recursive:true});const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium'});try{for(const width of [1440,1024,390])for(const theme of ['graphite','light','sand'])await run(browser,{width,theme,interactive:width===1440&&theme==='graphite'});await run(browser,{width:390,theme:'light',lang:'da'});}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
