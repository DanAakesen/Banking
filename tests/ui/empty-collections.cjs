const assert=require('node:assert/strict');
const path=require('node:path');
module.exports=async({page,api,https,output,checks})=>{
 await page.setViewportSize({width:1440,height:1000});
 for(const mode of ['Demo','Live']){
  await page.goto(https+'/#/overview');await page.getByRole('heading',{name:'Cash balance',exact:true}).waitFor();
  await require('./workspace.cjs')(page,mode);
  // The selected mode may already be current, in which case no navigation is needed.
  await page.goto(https+'/#/budgets');await page.getByRole('heading',{name:'No budgets yet',exact:true}).waitFor();
  assert.equal(await page.locator('#bp-form').count(),0);
  await page.reload();await page.getByRole('heading',{name:'No budgets yet',exact:true}).waitFor();
  await page.screenshot({path:path.join(output,'budgets-empty-'+mode.toLowerCase()+'.png'),fullPage:true});
  await page.getByRole('link',{name:'Create budget',exact:false}).click();await page.getByLabel('Budget name',{exact:true}).waitFor();
  assert.equal(new URL(page.url()).hash,'#/budgets/new');assert.equal(await page.getByRole('button',{name:'New budget',exact:true}).count(),0);
  assert.equal(await page.locator('.bp-picker').count(),0);
  await page.getByRole('link',{name:'Cancel',exact:true}).click();await page.getByRole('heading',{name:'No budgets yet',exact:true}).waitFor();
  await page.getByRole('link',{name:'From transactions',exact:true}).click();await page.getByRole('heading',{name:'From transactions',exact:true}).waitFor();
  await page.goto(https+'/#/goals');await page.getByRole('heading',{name:'No goals yet',exact:true}).waitFor();
  assert.equal(await page.getByRole('link',{name:'Create goal',exact:false}).count(),1);assert.equal(await page.locator('#goal-form').count(),0);
  await page.screenshot({path:path.join(output,'goals-empty-'+mode.toLowerCase()+'.png'),fullPage:true});
  await page.getByRole('link',{name:'Create goal',exact:false}).click();await page.getByLabel('Name',{exact:true}).waitFor();
  await page.getByRole('link',{name:'Cancel',exact:true}).click();await page.getByRole('heading',{name:'No goals yet',exact:true}).waitFor();
 }
 await page.setViewportSize({width:390,height:844});
 for(const route of ['budgets','goals']){await page.goto(https+'/#/'+route);await page.locator('.collection-empty').waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(output,route+'-empty-mobile.png'),fullPage:true});}
 await page.setViewportSize({width:1440,height:1080});await page.goto(https+'/#/overview');await page.getByRole('heading',{name:'Cash balance',exact:true}).waitFor();
 await require('./workspace.cjs')(page,'Demo');
 await page.getByRole('heading',{name:'No budgets yet',exact:true}).waitFor();
 await page.getByRole('link',{name:'Create budget',exact:false}).click();await page.getByLabel('Budget name',{exact:true}).waitFor();
 await page.getByRole('link',{name:'Cancel',exact:true}).click();await page.getByRole('heading',{name:'No budgets yet',exact:true}).waitFor();
 assert.equal((await api('budget-plans')).plans.length,0);assert.equal((await api('goals')).length,0);
 await page.goto(https+'/#/overview');await page.getByRole('heading',{name:'Cash balance',exact:true}).waitFor();
 checks.push('Empty budgets/goals in both workspaces: explicit Create, cancel, reload, transaction entry path, Overview shortcut and 390px layout; no records created');
};
