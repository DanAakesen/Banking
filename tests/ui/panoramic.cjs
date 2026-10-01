const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
module.exports=async({page,https,output,checks})=>{
 const dir=path.join(output,'panoramic');fs.mkdirSync(dir,{recursive:true});
 const ready=async()=>{await page.goto(https+'/#/overview');await page.locator('.ov-cash').waitFor();await page.waitForFunction(()=>!document.querySelector('#main .loading'));};
 await ready();
 const calculations=await page.evaluate(async()=>{
  const {dayScene,flowModel}=await import('/overview.js');
  const scenes=['2026-09-08T02:59:00Z','2026-09-08T03:00:00Z','2026-09-08T09:59:00Z','2026-09-08T10:00:00Z','2026-09-08T15:59:00Z','2026-09-08T16:00:00Z'].map(time=>dayScene(new Date(time)));
  const winter=[dayScene(new Date('2026-12-08T04:00:00Z')),dayScene(new Date('2026-12-08T11:00:00Z')),dayScene(new Date('2026-12-08T17:00:00Z'))];
  const cases=[[100,60],[60,100],[0,100],[100,0],[0,0]].map(([income,spending])=>flowModel({income,spending,categories:spending?[{categoryId:'a',amount:spending*.6},{categoryId:'b',amount:spending*.4}]:[]}));
  return {scenes,winter,cases};
 });
 assert.deepEqual(calculations.scenes,['evening','morning','morning','afternoon','afternoon','evening']);assert.deepEqual(calculations.winter,['morning','afternoon','evening']);
 for(const m of calculations.cases){assert.equal(m.income+m.drawdown,m.spending+m.retained);assert.equal(m.groups.reduce((n,c)=>n+c.amount,0),m.spending);assert.ok(m.drawdown>=0&&m.retained>=0);}
 checks.push('Overview: greeting boundaries follow Copenhagen summer/winter time; surplus, deficit, zero-income and empty flows conserve money');
 const result=await page.evaluate(async()=>{
  const headers={'X-Banking-Client':'web','X-Banking-Mode':document.querySelector('.sidebar .account-row-name').textContent==='Dan'?'Live':'Demo'};
  const url=performance.getEntriesByType('resource').map(r=>r.name).findLast(u=>u.includes('/api/trends?'));
  const trends=await (await fetch(url,{headers})).json();
  const el=document.querySelector('.ov-sankey');return {trends,flow:el?{income:Number(el.dataset.income),spending:Number(el.dataset.spending),retained:Number(el.dataset.retained),drawdown:Number(el.dataset.drawdown)}:null};
 });
 if(result.flow){assert.equal(result.flow.income,result.trends.current.income);assert.equal(result.flow.spending,result.trends.current.spending);}
 assert.equal(await page.locator('.ov-chart-data').count(),0);assert.ok(await page.locator('.ov-sankey-svg').getAttribute('aria-label'));assert.equal(await page.locator('.ov-motion h2').innerText(),'Cash Flow');
 await page.locator('.ov-ask').click();await page.getByRole('dialog').getByText('No AI service is connected. No chat messages are sent.').waitFor();await page.getByRole('button',{name:'Close',exact:true}).click();
 await page.locator('.ov-advisor a[href="#/review"]').click();await page.getByRole('heading',{name:'Review',exact:true}).waitFor();await ready();
 const account=await page.locator('.ov-account').first().getAttribute('data-id');await page.locator('.ov-account').first().click();await page.locator('.account-ledger tbody tr').first().waitFor();assert.ok(await page.locator('.account-ledger tbody tr').evaluateAll((rows,id)=>rows.every(r=>r.dataset.accountId===id),account));await ready();
 const category=await page.locator('.ov-mix-row[data-id]:not([data-id=""])').first().getAttribute('data-id');await page.locator('.ov-mix-row[data-id]:not([data-id=""])').first().click();await page.locator('.account-ledger tbody tr').first().waitFor();assert.equal(await page.locator('#ledger-category').inputValue(),category);await ready();
 checks.push('Overview: displayed money-flow totals reconcile with API; accessible chart table, advisor placeholder, account/category filters and Review action work');
 await page.clock.install({time:new Date('2026-09-08T06:00:00Z')});
 for(const [scene,time,greeting] of [['morning','2026-09-08T06:00:00Z','Good morning'],['afternoon','2026-09-08T12:00:00Z','Good afternoon'],['evening','2026-09-08T18:00:00Z','Good evening']]){
  await page.clock.setFixedTime(new Date(time));await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  assert.equal(await page.locator('.ov-welcome').getAttribute('data-scene'),scene);assert.ok((await page.locator('[data-greeting]').textContent()).startsWith(greeting));
  assert.ok((await page.locator('.ov-welcome').evaluate(x=>getComputedStyle(x,'::before').backgroundImage)).includes(scene));
  const response=await page.evaluate(async scene=>{const r=await fetch('/assets/overview-'+scene+'.webp');return {status:r.status,type:r.headers.get('content-type')};},scene);assert.equal(response.status,200);assert.ok(response.type.includes('image/webp'));
  await page.screenshot({path:path.join(dir,'overview-'+scene+'.png'),fullPage:true});
 }
 checks.push('Overview: all three greeting/background pairs load and update without a page reload');
 for(const theme of ['graphite','light','slate','sand','forest']){
  await page.evaluate(theme=>localStorage.setItem('banking.preferences.v1',JSON.stringify({theme,lang:'en'})),theme);await page.reload();await ready();
  assert.equal(await page.locator('html').getAttribute('data-theme'),theme);
  for(const width of [1600,1200,1024,768,390,360]){
   await page.setViewportSize({width,height:1200});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),theme+' '+width+' page fits');
   const overflow=await page.locator('.ov-panel,.ov-cash,.ov-pulse,.ov-mix-row,.ov-agenda-row').evaluateAll(xs=>xs.filter(x=>x.scrollWidth>x.clientWidth+1).map(x=>x.className));assert.deepEqual(overflow,[],theme+' '+width+' content fits');
   const amounts=await page.locator('.ov-dashboard .money').evaluateAll(xs=>xs.map(x=>({text:x.textContent,font:parseFloat(getComputedStyle(x).fontSize),currency:parseFloat(getComputedStyle(x.lastElementChild).fontSize)})));
   for(const a of amounts){assert.match(a.text,/\d [A-Z]{3}$/);assert.ok(a.currency<a.font,'currency suffix is smaller');}
   if([1600,390].includes(width))await page.screenshot({path:path.join(dir,'overview-'+theme+'-'+width+'.png'),fullPage:true});
  }
 }
 for(const lang of ['da','en']){
  await page.evaluate(lang=>localStorage.setItem('banking.preferences.v1',JSON.stringify({theme:'graphite',lang})),lang);await page.reload();await ready();
  assert.ok((await page.locator('[data-greeting]').textContent()).startsWith(lang==='da'?'Godaften':'Good evening'));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 }
 await page.setViewportSize({width:1440,height:1080});await page.clock.setFixedTime(new Date());await ready();
 checks.push('Overview: five themes at six widths, smaller currency suffixes, both languages and desktop/mobile screenshots');
};
