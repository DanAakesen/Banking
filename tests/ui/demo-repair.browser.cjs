// Explicit opt-in live acceptance. Financial reads only; a fresh Demo session is the only POST.
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('playwright');
const origin='https://banking-dan-0ac7d719.azurewebsites.net';
if(process.env.BANKING_DEMO_LIVE!=='1')throw new Error('Set BANKING_DEMO_LIVE=1 for read-only deployed Demo acceptance.');
(async()=>{
 const out=path.resolve(__dirname,'../../artifacts/demo-repair/browser');await fs.mkdir(out,{recursive:true});
 const proxy=process.env.HTTPS_PROXY||process.env.HTTP_PROXY;
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox'],...(proxy?{proxy:{server:proxy}}:{})});
 const results=[];
 try{
  for(const {width,theme,lang} of [{width:1440,theme:'graphite',lang:'en'},{width:1024,theme:'light',lang:'en'},{width:390,theme:'sand',lang:'da'}]){
   const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'}),page=await context.newPage();
   const writes=[],errors=[],violations=[];
   page.on('pageerror',e=>errors.push(e.message));
   await context.exposeBinding('recordCsp',(_,x)=>violations.push(x));
   await context.addInitScript(({theme,lang})=>{localStorage.setItem('banking.preferences.v1',JSON.stringify({theme,lang,aiGlass:false}));document.addEventListener('securitypolicyviolation',e=>window.recordCsp(e.effectiveDirective));},{theme,lang});
   await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.origin!==origin)return route.abort();
    if(req.method()!=='GET'&&!(req.method()==='POST'&&url.pathname==='/api/browser/demo')){writes.push(req.method()+' '+url.pathname);return route.abort();}
    return route.continue();
   });
   const headers={'X-Banking-Client':'web','X-Banking-Mode':'Demo',Origin:origin};
   const session=await context.request.post(origin+'/api/browser/demo',{headers,data:{}});assert.equal(session.status(),200);
   const read=async route=>{const res=await context.request.get(origin+'/api/'+route,{headers});assert.equal(res.status(),200,route);return res.json()};
   const mode=await read('mode');assert.equal(mode.mode,'Demo');assert.deepEqual(mode.availableModes,['Demo']);
   const connections=await read('connections');assert.equal(connections.length,1);assert.equal(connections[0].provider,'product-demo');assert.equal(connections[0].isDemo,true);
   const activePlan=(await read('budget-plans')).plans.find(p=>p.isActive);assert.ok(activePlan);
   const denied=await context.request.get(origin+'/api/accounts',{headers:{...headers,'X-Banking-Mode':'Live'}});assert.equal(denied.status(),403);
   const ready=async()=>{await page.waitForSelector('#main .page-head',{timeout:60000});await page.waitForFunction(()=>!document.querySelector('#main')?.hasAttribute('aria-busy'),null,{timeout:60000});};
   const inspect=async name=>{await ready();const size=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:innerWidth}));assert.ok(size.scroll<=size.viewport+1,`${name}: document overflow ${JSON.stringify(size)}`);await page.screenshot({path:path.join(out,`${name}-${width}-${theme}-${lang}.png`),fullPage:true});results.push({name,width,theme,lang,overflow:false});};
   await page.goto(origin+'/#/overview');await ready();
   await fs.writeFile(path.join(out,`overview-dom-${width}.html`),await page.locator('#main').innerHTML());
   await page.screenshot({path:path.join(out,`overview-initial-${width}.png`),fullPage:true});
   await page.waitForSelector('.ov-mix-list',{timeout:60000});
   assert.equal(await page.locator('.bv-tile').count(),5);
   assert.ok(!(await page.locator('.bv-categories').innerText()).includes('Uncategorized'));
   await inspect('overview-default');
   // October and September are the affected calendar periods, independently of the default rolling period.
   for(const month of ['2026-10','2026-09']){
    if(await page.locator('#period').inputValue()!=='custom'){await page.locator('#period').selectOption('custom');await ready();}
    await page.locator('#from').fill(month+'-01');await page.locator('#to').fill(month==='2026-10'?'2026-10-15':'2026-09-30');await page.locator('[data-action=range]').click();await ready();
    const info=await read(`account-insights?from=${month}-01&to=${month==='2026-10'?'2026-10-15':'2026-09-30'}&currency=DKK`);
    assert.ok(info.categories.filter(c=>c.categoryId&&c.amount>0).length>=10);
    const ledger=await read(`transactions?from=${month}-01&to=${month==='2026-10'?'2026-10-15':'2026-09-30'}&limit=200`);
    assert.equal(ledger.items.length,ledger.total);
    const remaining=ledger.items.filter(x=>x.status==='BOOK'&&x.amount<0&&!x.categoryId&&!x.isInternalTransfer);
    // Two September categories were explicitly cleared manually before this repair; preserve them.
    assert.ok(remaining.every(x=>x.classification==='Manual'||(['Coffee','Kaffe'].includes(x.description)&&x.amount===-32)));
    const missing=info.categories.find(c=>c.categoryId===null)?.amount||0;assert.equal(missing,-remaining.reduce((sum,x)=>sum+x.amount,0));
    assert.ok(await page.locator('.ov-mix-row[data-id]:not([data-id=""])').count()>=3);
    // Budget month is independent of the main 360 period. Reconcile its actual rendered category tiles.
    await page.locator('.bv-actions input[type=month]').fill(month);
    await page.locator('.bv-actions input[type=month]').dispatchEvent('change');
    const progress=await read(`budget-plans/${activePlan.id}/progress?month=${month}-01`);
    await page.waitForFunction(amount=>Number(document.querySelector('.bv-kpi:nth-child(2)>strong')?.textContent.replace(/\D/g,''))===Math.round(amount),progress.actualExpenses);
    const tiles=await page.locator('.bv-tile').evaluateAll(xs=>xs.map(x=>({name:x.querySelector('h4').textContent,actual:Number(x.querySelector('strong').textContent.replace(/\D/g,''))})));
    const uncategorized=progress.groups.filter(g=>g.type==='Expense'&&!g.categoryId).reduce((sum,g)=>sum+g.actual,0);
    assert.equal(tiles.reduce((sum,x)=>sum+x.actual,0),Math.round(progress.actualExpenses-uncategorized));
    for(const tile of tiles.slice(0,-1))assert.equal(tile.actual,Math.round(progress.groups.find(g=>g.type==='Expense'&&g.name===tile.name).actual));
    await page.locator('.bv-categories').screenshot({path:path.join(out,`categories-${month}-${width}.png`)});
    await inspect('overview-'+month);
   }
   await page.locator('#period').selectOption('1y');await ready();await inspect('overview-1y');
   for(const route of ['accounts','budgets','goals','review']){await page.goto(origin+'/#/'+route);await inspect(route);}
   assert.deepEqual(errors,[]);assert.deepEqual(violations,[]);assert.deepEqual(writes,[]);
   results.push({width,danReadStatus:denied.status(),financialWrites:0,pageErrors:errors.length,cspViolations:violations.length});
   await context.close();
  }
 }finally{await browser.close();}
 await fs.writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({screens:results.filter(r=>r.name).length,widths:[1440,1024,390],financialWrites:0,verified:true}));
})().catch(e=>{console.error(e);process.exitCode=1});
