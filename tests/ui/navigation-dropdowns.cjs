const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
module.exports=async({page,https,output,checks})=>{
 const dir=path.join(output,'navigation-dropdowns');fs.mkdirSync(dir,{recursive:true});
 await page.setViewportSize({width:1440,height:1000});
 async function route(name){await page.goto(https+'/#/'+name);await page.locator('#main h1').first().waitFor();await page.waitForFunction(()=>!document.querySelector('#main .loading'));}
 const menu=()=>page.locator('.sidebar .account-menu');
 await route('overview');
 assert.equal(await page.locator('.sidebar>.nav a[href="#/settings"],.sidebar>.nav a[href="#/connections"],.utilities').count(),0);
 await menu().locator('summary').click({position:{x:12,y:12}});
 assert.equal(await menu().getAttribute('open'),'');
 assert.equal(await menu().locator('select').count(),0);
 assert.ok((await menu().locator('summary').boundingBox()).height<=36);
 assert.equal(await page.locator('.sidebar .nav').first().evaluate(x=>getComputedStyle(x).rowGap),'0px');
 assert.equal(await page.locator('.cash').evaluate(x=>getComputedStyle(x,'::before').content),'none');
 assert.equal(await page.locator('.nav a.selected').first().evaluate(x=>getComputedStyle(x,'::before').content),'none');
 for(const name of ['Settings','Connections','Sign out'])assert.ok(await menu().getByText(name,{exact:true}).isVisible());
 await page.screenshot({path:path.join(dir,'account-menu-desktop.png'),fullPage:true});
 await page.keyboard.press('Escape');assert.equal(await menu().getAttribute('open'),null);
 assert.ok(await menu().locator('summary').evaluate(x=>x===document.activeElement));
 await page.keyboard.press('Enter');assert.equal(await menu().getAttribute('open'),'');
 await menu().getByRole('link',{name:'Connections',exact:true}).click();await page.getByRole('heading',{name:'Connections',exact:true}).waitFor();
 await menu().locator('summary').click();await menu().getByRole('link',{name:'Settings',exact:true}).click();await page.getByRole('heading',{name:'Appearance',exact:true}).waitFor();
 const audit=[];
 async function inspect(label){
  const initiallyOpen=await page.locator('select:open').evaluateAll(xs=>xs.map(x=>x.id));
  const selects=page.locator('select');
  for(let i=0;i<await selects.count();i++){
   const control=selects.nth(i);if(!await control.isVisible()||!await control.isEnabled())continue;
   if(!await control.evaluate(x=>x.matches(':open')))await control.click();
   const sizes=await control.evaluate(x=>({button:x.getBoundingClientRect().width,list:parseFloat(getComputedStyle(x,'::picker(select)').width)}));
   assert.ok(Math.abs(sizes.button-sizes.list)<1,label+' dropdown width: '+JSON.stringify(sizes));
   await page.keyboard.press('Escape');
  }
  for(const id of initiallyOpen)await page.locator('#'+id).click();
  const values=await page.locator('select').evaluateAll(elements=>elements.map(x=>({label:x.getAttribute('aria-label')||x.id,appearance:getComputedStyle(x).appearance,bg:getComputedStyle(x,'::picker(select)').backgroundColor,option:x.options[0]?getComputedStyle(x.options[0]).backgroundColor:null,ink:getComputedStyle(x).color,count:x.options.length})));
  assert.ok(values.length,label+' has dropdowns');for(const value of values){assert.equal(value.appearance,'base-select',label+': '+value.label);assert.notEqual(value.bg,'rgba(0, 0, 0, 0)');if(value.option)assert.notEqual(value.option,'rgba(0, 0, 0, 0)');}audit.push({screen:label,dropdowns:values});
 }
 for(const theme of ['light','graphite','slate','sand','forest']){
  await route('settings/appearance');await page.locator('[data-theme-value="'+theme+'"]').click();await page.locator('html[data-theme="'+theme+'"]').waitFor();
  await route('overview');await page.getByLabel('Period',{exact:true}).click();await inspect('overview-'+theme);
  assert.ok(await page.getByLabel('Period',{exact:true}).evaluate(x=>x.matches(':open')));
  await page.screenshot({path:path.join(dir,'period-'+theme+'.png'),fullPage:true});await page.keyboard.press('Escape');
 }
 await route('settings/appearance');await page.locator('[data-theme-value="graphite"]').click();
 for(const name of ['accounts','review','activity','categories','transfers','goals/new','budgets/new','budgets/suggestions','settings/language']){await route(name);await inspect(name);}
 await route('connections');await page.getByRole('button',{name:'Add bank',exact:true}).click();await page.getByLabel('Bank',{exact:true}).waitFor();await inspect('bank-dialog');await page.getByLabel('Bank',{exact:true}).click();await page.screenshot({path:path.join(dir,'bank-picker.png'),fullPage:true});await page.keyboard.press('Escape');await page.getByRole('button',{name:'Close',exact:true}).click();
 await route('overview');await page.getByLabel('Period',{exact:true}).focus();await page.keyboard.press('Space');await page.keyboard.press('End');await page.keyboard.press('Enter');await page.getByLabel('From',{exact:true}).waitFor();
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'More',exact:true}).click();
 const mobile=page.getByRole('dialog').locator('.account-menu');await mobile.locator('summary').click();
 await page.screenshot({path:path.join(dir,'account-menu-mobile.png'),fullPage:true});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.keyboard.press('Escape');assert.ok(await page.getByRole('dialog').isVisible());assert.equal(await mobile.getAttribute('open'),null);
 await mobile.locator('summary').click();await mobile.getByRole('button',{name:'Sign out',exact:true}).click();
 await page.getByRole('heading',{name:'Welcome to Banking',exact:true}).waitFor();assert.equal(new URL(page.url()).hash,'');
 await page.getByRole('button',{name:'Try Demo',exact:false}).click();await page.getByRole('heading',{name:'Cash balance',exact:true}).waitFor();
 fs.writeFileSync(path.join(dir,'audit.json'),JSON.stringify(audit,null,2));
 checks.push('Whole account row opens utility menu; keyboard/Escape, Settings/Connections, mobile and sign-out-to-welcome verified');
 checks.push('Dropdown lists audited across screens and bank dialog; opened lists captured in all five themes; keyboard selection preserved');
};
