// Synthetic isolated API fixtures only. The real PDF acceptance is performed by the owner after deployment.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../../src/Banking.Api/wwwroot'),out=path.resolve(__dirname,'../../artifacts/pension-history/browser'),origin='https://banking.fixture';
const csp="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; frame-src 'self' https://www.tradingview-widget.com";
let reports; const report=(variant="later")=>structuredClone(reports[variant]);
async function run(browser,{width,theme,lang='en',live=true}){
 const context=await browser.newContext({viewport:{width,height:1000},hasTouch:width===390,reducedMotion:'reduce'}),page=await context.newPage(),errors=[],writes=[],receipts=[],snapshots=[],records=[];
 let next=1,parseCalls=0,conflict=false,slowOwnerUpload=false,role=live?'Owner':'Demo';
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({theme,lang,live})=>{localStorage.setItem('banking.preferences.v1',JSON.stringify({theme,lang,aiGlass:false}));sessionStorage.setItem('banking.workspace',live?'Live':'Demo');document.addEventListener('securitypolicyviolation',e=>(window.__csp||=[]).push(e.violatedDirective));},{theme,lang,live});
 await page.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());if(u.origin!==origin)return route.abort();
  if(u.pathname.startsWith('/api/')){
   const p=u.pathname.slice(5),method=req.method(),mode=req.headers()['x-banking-mode']||'Demo';let status=200,body={};
   const isolatedDemo=live&&mode==='Demo';
   const detail=u=>({...u,existingApproval:snapshots.filter(s=>s.hash===u.hash).at(-1)||null,products:records,suggestedProducts:u.report.agreements.map(a=>({key:a.key,product:records[0]||null}))});
   if(p==='browser/logout'){role=null;body={};}
   else if(p==='browser/demo'){role='Demo';body={role:'Demo'};}
   else if(p==='browser/status')body={role,passwordConfigured:true,localAdvisor:false};
   else if(p==='mode')body={mode,availableModes:role==='Owner'?['Demo','Live']:['Demo']};
   else if(p==='wealth'&&method==='GET')body=isolatedDemo?[]:records;
   else if(p==='wealth/summary')body={currency:'DKK',bankCash:null,pension:isolatedDemo?0:records.reduce((s,r)=>s+r.value,0),investments:0,debt:0,recordedNetWealth:null,excludingPension:null,accounts:[]};
   else if(p==='pension/uploads'&&method==='GET'&&isolatedDemo)body={total:0,offset:0,items:[],development:[],developmentHasMore:false};
   else if(p==='pension/uploads'&&method==='GET')body={total:receipts.length,offset:0,items:receipts.slice().reverse(),development:snapshots.filter(s=>!snapshots.some(n=>n.supersedesId===s.id)).map(s=>({id:s.id,asOf:s.asOf,approvedAt:s.approvedAt,currency:'DKK',products:['Demo Pension · pension 1'],sourceDates:[s.asOf],capital:s.accepted.report.agreements[0].balance.value,contributions:36000,returns:null})),developmentHasMore:false};
   else if(p==='pension/uploads'&&method==='POST'){
    const variant=process.env.PENSION_COLUMNS_ONLY?'columns':req.postDataBuffer().toString().endsWith(':correction')?'correction':'later';if(slowOwnerUpload)await new Promise(resolve=>setTimeout(resolve,250));
    if(live){assert.equal(req.headers()['content-type'],'application/pdf');assert.match(req.postDataBuffer().toString(),/^%PDF/);}
    const data={id:'receipt-'+next++,uploadedAt:'2026-10-15T12:00:00Z',status:'NeedsReview',errorCode:null,version:'AAAAAAAAAAE=',hash:(variant==='later'?'a':variant==='earlier'?'b':'c').repeat(64),mediaType:'application/pdf',byteLength:1700000,synthetic:!live,parserVersion:'pensionsinfo-text-1',report:report(variant),financialSaved:false,snapshotId:null};receipts.push(data);body=detail(data);
   }
   else if(/^pension\/uploads\/[^/]+\/parse$/.test(p)){
    const receipt=receipts.find(r=>r.id===p.split('/')[2]);assert.equal(req.postDataJSON().version,receipt.version);assert.equal(receipt.status,'NeedsReview');parseCalls++;
    receipt.report=report('columns');receipt.parserVersion=receipt.report.parserVersion;receipt.version='AAAAAAAAAAI=';body=detail(receipt);
   }
   else if(/^pension\/uploads\/[^/]+\/link$/.test(p)){
    const receipt=receipts.find(r=>r.id===p.split('/')[2]),input=req.postDataJSON();assert.equal(input.confirm,true);receipt.status='Approved';receipt.financialSaved=true;receipt.snapshotId=input.snapshotId;body={duplicate:true,snapshotId:input.snapshotId};
   }
   else if(/^pension\/uploads\/[^/]+\/approve$/.test(p)){
    const receipt=receipts.find(r=>r.id===p.split('/')[2]),input=req.postDataJSON();writes.push(input);
    assert.equal(input.confirm,true);assert.equal(input.acknowledgeWarnings,true);
    if(conflict){status=409;body={error:'VERSION_CONFLICT'};conflict=false;}
    else {const prior=snapshots.find(s=>s.asOf===input.reportAsOf);
     if(prior&&!input.supersedesId){status=409;body={error:'PENSION_CORRECTION_CONFIRMATION_REQUIRED',details:{supersedesId:prior.id,approvedAt:prior.approvedAt}};}
     else{const s={id:'snapshot-'+next++,hash:receipt.hash,asOf:input.reportAsOf,approvedAt:'2026-10-15T12:01:00Z',supersedesId:input.supersedesId,accepted:{report:input.reviewed,products:input.products}};snapshots.push(s);receipt.status='Approved';receipt.financialSaved=true;receipt.snapshotId=s.id;
      records.splice(0,1,{id:'product-one',name:input.reviewed.agreements[0].name,provider:'Demo Pension',kind:'Pension',value:input.reviewed.agreements[0].balance.value,currency:'DKK',asOf:input.reviewed.agreements[0].asOf,sourceNote:'Reviewed synthetic statement',version:'AAAAAAAAAAI='});body={snapshotId:s.id,duplicate:false,financialSaved:true};}
    }
   }
   else if(/^pension\/uploads\/[^/]+\/original$/.test(p))return route.fulfill({headers:{'X-Banking-Mode':mode,'Cache-Control':'no-store, private','Content-Disposition':'attachment; filename="PensionsInfo-report.pdf"'},contentType:'application/pdf',body:'%PDF-synthetic-browser-fixture'});
   else if(/^pension\/uploads\/[^/]+$/.test(p))body=detail(receipts.find(r=>r.id===p.split('/')[2]));
   else if(p.startsWith('pension/snapshots/'))body=snapshots.find(s=>s.id===p.split('/')[2]);
   else if(p==='accounts'||p==='categories')body=[];
   else if(p==='transactions')body={items:[],total:0};
   else if(p==='account-insights')body={availableBalance:null,income:null,spending:null,net:null,retentionPercent:null,categories:[],coverage:{accountCount:0,sufficientHistory:false,oldestAccountSync:null}};
   else if(isolatedDemo&&method==='GET')body={};
   else throw Error('Unexpected fixture '+method+' '+p);
   return route.fulfill({status,contentType:'application/json',headers:{'X-Banking-Mode':mode},body:JSON.stringify(body)});
  }
  if(u.pathname.startsWith('/advisor/'))return route.fulfill({contentType:'text/html',body:''});
  const file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(!file.startsWith(root+path.sep))return route.abort();
  try{return route.fulfill({body:await fs.readFile(file),headers:{'Content-Security-Policy':csp},contentType:({'.js':'text/javascript','.css':'text/css','.html':'text/html','.webp':'image/webp','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream'});}catch{return route.fulfill({status:404,body:''});}
 });
 const ready=async()=>{await page.waitForSelector('.page-head.scene-composed');await page.waitForFunction(()=>!document.querySelector('#main').hasAttribute('aria-busy'));};
 async function inspect(label){const state=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,csp:window.__csp||[],edges:[...document.querySelectorAll('#main *')].filter(el=>{const s=getComputedStyle(el),n=['Top','Right','Bottom','Left'].filter(k=>parseFloat(s['border'+k+'Width'])>0&&s['border'+k+'Style']!=='none').length;return n>0&&n<4;}).map(el=>el.className)}));assert.equal(state.overflow,false,label);assert.deepEqual(state.csp,[]);assert.deepEqual(state.edges,[],label);assert.deepEqual(errors,[]);await page.screenshot({path:path.join(out,`${label}-${width}-${theme}-${lang}-${live?'owner':'demo'}.png`),fullPage:true});}
 const upload=async variant=>{if(live)await page.locator('#pension-file').setInputFiles({name:'synthetic.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-synthetic-fixture:'+variant)});await page.waitForSelector('#pension-review-form');};
 const approve=async()=>{await page.locator('#pension-confirm').check();await page.locator('#pension-warnings-confirm').check();await page.locator('#pension-review-form [type=submit]').click();};
 try{
  await page.goto(origin+'/#/pension');await ready();await inspect('empty');
  const pensionLink=page.locator('.sidebar a[href="#/pension"]');
  assert.equal(await pensionLink.locator('small').count(),0);assert.equal((await pensionLink.innerText()).trim(),'Pension');
  assert.equal(await pensionLink.getAttribute('aria-current'),'page');
  assert.equal(await page.locator('.sidebar a[href="#/review"] .nav-count').count(),1);
  assert.equal(await page.locator('.sidebar a[href="#/investments"]').count(),1);
  if(width<=900){await page.locator('[data-action=more]').click();const mobile=page.locator('#overlay a[href="#/pension"]');assert.equal((await mobile.innerText()).trim(),'Pension');assert.equal(await mobile.locator('small').count(),0);await inspect('pension-navigation-more');await page.locator('#overlay [data-action=close]').click();}
  if(process.env.PENSION_NAV_ONLY){assert.equal(receipts.length,0);assert.equal(writes.length,0);await page.goto(origin+'/#/accounts');await ready();await inspect('accounts-reference');console.log(`PASS pension navigation ${width}px ${theme} ${lang} ${live?'owner':'demo'}`);return;}
  if(!live){assert.equal(await page.locator('#pension-file').count(),0);assert.equal(await page.locator('[data-sample]').count(),0);assert.equal(await page.locator('#pension-demo-held').count(),1);assert.equal(receipts.length,0);await page.goto(origin+'/#/accounts');await ready();await inspect('accounts-reference');console.log('PASS Demo import held; no data created');return;}
  assert.equal(await page.locator('#pension-file').count(),live?1:0);await upload('later');assert.equal(writes.length,0);assert.equal(records.length,0);
  if(process.env.PENSION_COLUMNS_ONLY){
   assert.equal(await page.locator('[data-agreement]').count(),1);assert.equal(await page.locator('[data-number="balance.0"]').inputValue(),'927000');
   assert.equal(await page.locator('[data-number="contribution.0"]').inputValue(),'132000');
   assert.equal(await page.locator('[data-number^="component.0."]').count(),3);
   assert.equal(await page.locator('#pension-report-date').inputValue(),'');assert.equal(await page.locator('[data-date]').inputValue(),'2024-04-12');
   await page.locator('#pension-retry-confirm').locator('..').locator('..').locator('summary').click();
   assert.equal(await page.locator('#pension-retry').isDisabled(),true);
   await page.locator('[data-number="balance.0"]').fill('123');await page.locator('#pension-retry-confirm').check();await page.locator('#pension-retry').click();
   await page.waitForFunction(()=>document.querySelector('.pension-receipt').textContent.includes('pensionsinfo-text-2'));
   assert.equal(await page.locator('[data-number="balance.0"]').inputValue(),'927000');assert.equal(receipts.length,1);assert.equal(parseCalls,1);assert.equal(records.length,0);assert.equal(snapshots.length,0);assert.equal(writes.length,0);
   await page.locator('#pension-review').evaluate(el=>el.scrollIntoView({block:'start'}));await page.screenshot({path:path.join(out,`column-review-viewport-${width}-${theme}-${lang}.png`)});
   await page.locator('.pension-projections summary').click();await page.locator('#pension-scenario').selectOption('5');
   const table=await page.locator('#pension-payouts').innerText();assert.match(table,/70–84/);assert.match(table,/85–\+/);assert.match(table,/PFA/);const amounts=await page.locator('#pension-payouts [data-number]').evaluateAll(nodes=>nodes.map(n=>n.value));assert.ok(amounts.includes('536000'));assert.ok(amounts.includes('258000'));
   await page.locator('details').filter({has:page.locator('summary', {hasText:lang==='da'?'Forsikring':'Insurance'})}).locator('summary').click();
   assert.equal(await page.locator('.pension-source-row [data-number^="insurance."]').count(),5);
   assert.doesNotMatch(await page.locator('#pension-review').innerText(),/87654321|2054/);
   await inspect('column-layout-reparsed');await page.goto(origin+'/#/accounts');await ready();await inspect('accounts-reference');console.log(`PASS column preview/retry ${width}px ${theme} ${lang}`);return;
  }
  await page.locator('.pension-projections summary').click();await page.locator('#pension-scenario').selectOption('10');assert.match(await page.locator('#pension-payouts').innerText(),/ATP/);
  await inspect('review');
  if(width===1440&&theme==='graphite'){conflict=true;await approve();await page.waitForFunction(()=>document.querySelector('#pension-save-error').textContent.includes('changed'));assert.equal(records.length,0);await inspect('conflict');}
  await approve();await page.waitForSelector('#pension-review-form',{state:'detached'});await ready();assert.equal(records.length,1);assert.equal(records[0].value,431000);
  await page.reload();await ready();await page.locator('[data-upload]').first().click();await page.waitForSelector('#pension-original');assert.equal(await page.locator('#pension-confirm').count(),0);await inspect('history');
  const download=page.waitForEvent('download');await page.locator('#pension-original').click();assert.match((await download).suggestedFilename(),/\.pdf$/);
  {await page.reload();await ready();await upload('later');await page.locator('#pension-existing-values').click();await page.waitForSelector('#pension-existing-preview p');await page.locator('#pension-reuse').click();await page.waitForSelector('#pension-review-form',{state:'detached'});await ready();assert.equal(snapshots.length,1);assert.equal(records[0].value,431000);await upload('correction');await approve();await page.waitForSelector('#pension-correction-confirm');await page.locator('#pension-view-prior').click();await page.waitForSelector('#pension-prior-values p');assert.equal(records[0].value,431000);await page.locator('#pension-correction-confirm').check();await page.locator('#pension-review-form [type=submit]').click();await page.waitForSelector('#pension-review-form',{state:'detached'});await ready();assert.equal(records[0].value,432000);assert.equal(receipts.length,3);assert.equal(snapshots.length,2);await inspect('corrected');}
  if(live){await page.reload();await ready();slowOwnerUpload=true;await page.locator('#pension-file').setInputFiles({name:'synthetic.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-owner-synthetic-fixture')});if(width<=900)await page.locator('[data-action=more]').click();await page.locator('.account-menu summary:visible').click();await page.locator('[data-action=logout]:visible').click();await page.locator('#access-demo').click();await page.waitForURL('**/#/overview',{timeout:10000});await page.evaluate(()=>location.hash='/pension');await ready();await page.waitForTimeout(350);assert.equal(await page.locator('#pension-original').count(),0);assert.equal(await page.locator('#pension-file').count(),0);assert.equal(await page.locator('#pension-history-list').count(),0);assert.equal(await page.locator('#pension-demo-held').count(),1);await inspect('owner-to-demo-cleared');}
  await page.goto(origin+'/#/accounts');await ready();await inspect('accounts-reference');
  console.log(`PASS pension ${width}px ${theme} ${lang} ${live?'owner':'demo'}`);
 }finally{await context.close();}
}
(async()=>{await fs.mkdir(out,{recursive:true});reports=Object.fromEntries(await Promise.all(['earlier','later','correction'].map(async v=>[v,JSON.parse(await fs.readFile(path.join(out,'report-'+v+'.json'),'utf8'))])));if(process.env.PENSION_COLUMNS_ONLY)reports.columns=JSON.parse(await fs.readFile(path.join(out,'../report-columns.json'),'utf8'));const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium'});try{for(const width of [1440,1024,390])for(const theme of ['graphite','light'])await run(browser,{width,theme});await run(browser,{width:390,theme:'light',lang:'da'});await run(browser,{width:1440,theme:'light',live:false});}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
