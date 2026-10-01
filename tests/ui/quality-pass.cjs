const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
module.exports=async function({page,api,view,until,output,checks}){
 const dir=path.join(output,'quality');fs.mkdirSync(dir,{recursive:true});
 await page.setViewportSize({width:1440,height:1000});
 await require('./workspace.cjs')(page,'Demo');
 await page.getByRole('heading',{name:'Cash balance',exact:true}).waitFor();
 const base=page.url().split('#')[0];
 const routes=['overview','accounts','review','review/history','budgets','budgets/legacy','goals','goals/new','categories','transfers','connections','advisor','investments','pension','settings/appearance','settings/language','settings/profile'];
 const captures=[];
 async function ready(route){if(page.url()===base+'#/'+route)await page.reload();else await page.goto(base+'#/'+route);await page.locator('#main h1').first().waitFor();await until(async()=>await page.locator('#main .loading').count()===0);}
 for(const width of [1440,1024,768,390,360]){
  await page.setViewportSize({width,height:1000});
  for(const route of routes){await ready(route);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}px overflow on ${route}`);assert.equal(await page.getByRole('button',{name:'Retry',exact:true}).count(),0,route+' loaded');
   if(width===1440||width===390){const file=route.replaceAll('/','-')+'-'+width+'.png';await page.screenshot({path:path.join(dir,file),fullPage:true});captures.push(file);}
  }
 }
 checks.push('Quality: all 17 routes fit desktop, tablet, 390px and 360px, including empty and legacy screens');
 for(const [i,theme] of ['light','graphite','slate','sand','forest'].entries())for(const lang of ['en','da']){
  await page.evaluate(({theme,lang})=>localStorage.setItem('banking.preferences.v1',JSON.stringify({theme,lang})),{theme,lang});await page.reload();
  await page.setViewportSize({width:lang==='da'?390:1440,height:1000});
  for(const route of ['overview','accounts','review','budgets','goals/new','settings/appearance']){await ready(route);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${theme}/${lang}/${route} overflow`);assert.equal(await page.locator('html').getAttribute('lang'),lang);}
 }
 checks.push('Quality: five themes and both languages across six primary workflows');
 await page.evaluate(()=>localStorage.setItem('banking.preferences.v1',JSON.stringify({theme:'graphite',lang:'en'})));await page.reload();await ready('overview');
 await page.route('**/api/trends?*',route=>route.fulfill({status:503,json:{error:'TEMPORARILY_UNAVAILABLE'},headers:{'X-Banking-Mode':'Demo'}}));
 await ready('overview');await page.getByRole('button',{name:'Retry',exact:true}).waitFor();assert.equal(await page.locator('.cash .balance').count(),0);await page.unroute('**/api/trends?*');await page.getByRole('button',{name:'Retry',exact:true}).click();await page.getByRole('heading',{name:'Cash balance',exact:true}).waitFor();checks.push('Quality: failed data loads show an error and Retry recovers without fabricated totals');
 await ready('goals/new');await page.getByLabel('Name',{exact:true}).fill('Unsaved failure fixture');await page.getByLabel('Description',{exact:true}).fill('Keep this draft when the server is unavailable.');await page.getByLabel('Target amount',{exact:true}).fill('15000');await page.getByLabel('Dedicated account',{exact:true}).selectOption({index:1});
 let requestHeld=false,releaseSave;const saveGate=new Promise(resolve=>releaseSave=resolve);await page.route('**/api/goals',async route=>{if(route.request().method()==='POST'){requestHeld=true;await saveGate;await route.fulfill({status:503,json:{error:'TEMPORARILY_UNAVAILABLE'},headers:{'X-Banking-Mode':'Demo'}});}else await route.continue();});await page.getByRole('button',{name:'Create goal',exact:true}).click();await until(()=>requestHeld);assert.equal(await page.getByLabel('Name',{exact:true}).isDisabled(),true);releaseSave();await until(async()=>await page.getByLabel('Name',{exact:true}).isEnabled());assert.equal(await page.getByLabel('Name',{exact:true}).inputValue(),'Unsaved failure fixture');assert.ok((await page.locator('#goal-form .error').textContent()).includes('TEMPORARILY_UNAVAILABLE'));await page.unroute('**/api/goals');page.once('dialog',d=>d.accept());await page.getByRole('link',{name:'Back to goals',exact:false}).click();await page.getByRole('heading',{name:'Goals',exact:true}).waitFor();checks.push('Quality: pending goal saves lock inputs and failures preserve the complete draft');
 await ready('accounts');
 await page.evaluate(()=>{const original=window.fetch;window.__parseHeld=false;window.fetch=async(...args)=>{const res=await original(...args);if(String(args[0])==='/api/goals'&&!window.__parseHeld){const json=res.json.bind(res);res.json=async()=>{const data=await json();window.__parseHeld=true;await new Promise(resolve=>window.__releaseParse=resolve);return data;};}return res;};window.__restoreFetch=()=>window.fetch=original;});
 await page.goto(base+'#/goals');await until(()=>page.evaluate(()=>window.__parseHeld));
 await page.getByRole('button',{name:'More',exact:true}).click();await require('./workspace.cjs')(page,'Live');await page.evaluate(()=>{window.__releaseParse();window.__restoreFetch();});await page.getByRole('heading',{name:'Cash balance',exact:true}).waitFor();await ready('goals');await page.getByRole('heading',{name:'No goals yet',exact:true}).waitFor();assert.equal(await page.getByText('Edited browser goal',{exact:true}).count(),0);checks.push('Quality: late JSON body parsing cannot cross the Demo/Dan boundary');
 await page.emulateMedia({reducedMotion:'reduce'});await ready('overview');assert.ok(await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches));await page.emulateMedia({reducedMotion:'no-preference'});
 fs.writeFileSync(path.join(dir,'matrix.json'),JSON.stringify({routes,widths:[1440,1024,768,390,360],themes:['light','graphite','slate','sand','forest'],languages:['en','da'],captures},null,2));
};
