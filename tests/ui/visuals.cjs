const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
module.exports=async function({page,api,view,until,output,checks}){
 const dir=path.join(output,'visual-upgrade');fs.mkdirSync(dir,{recursive:true});
 await page.setViewportSize({width:1440,height:1080});
 await require('./workspace.cjs')(page,'Demo');
 await require('./panoramic.cjs')({page,https:new URL(page.url()).origin,output,checks});
 const format=n=>new Intl.NumberFormat('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n)+' DKK';
 await view(page,'accounts','Accounts');await page.locator('.ring-segment').first().waitFor();const first=page.locator('.ring-legend-item').first();const expected=await first.getAttribute('data-ring-value');await first.click();assert.equal(await first.getAttribute('aria-pressed'),'true');assert.equal(await page.locator('.ring-center strong').textContent(),expected);assert.equal(await page.locator('.ring-segment:not(.ring-dim)').count(),1);await first.click();assert.equal(await page.locator('.ring-dim').count(),0);checks.push('Visuals: spending-ring selection updates value and highlights matching segment');await page.screenshot({path:path.join(dir,'accounts-graphite-desktop.png'),fullPage:true});
 await view(page,'budgets','Budgets');await page.locator('.allocation svg').waitFor();const saved=(await api('budget-plans')).plans.find(x=>x.isActive);assert.ok((await page.locator('.allocation svg').getAttribute('aria-label')).includes(format(saved.monthly.available)));assert.equal(await page.locator('.allocation-bar').count(),4);await page.screenshot({path:path.join(dir,'budgets-graphite-desktop.png'),fullPage:true});checks.push('Visuals: four-step budget allocation agrees with active monthly plan');
 await view(page,'review','Review');await page.locator('.review-row').first().waitFor();await page.screenshot({path:path.join(dir,'review-graphite-desktop.png'),fullPage:true});
 for(const theme of ['light','slate','sand','forest']){await view(page,'settings/appearance','Appearance');await page.locator('[data-theme-value="'+theme+'"]').click();await until(async()=>await page.locator('html').getAttribute('data-theme')===theme);await view(page,'overview','Overview');await page.locator('.ov-cash').waitFor();await page.screenshot({path:path.join(dir,'overview-'+theme+'-desktop.png'),fullPage:true});}
 await view(page,'settings/appearance','Appearance');await page.locator('[data-theme-value="graphite"]').click();await page.setViewportSize({width:390,height:844});
 for(const [route,title] of [['overview','Overview'],['accounts','Accounts'],['budgets','Budgets'],['goals','Goals'],['review','Review']]){await view(page,route,title);await until(async()=>await page.locator('#main .loading').count()===0);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),route+' mobile overflow');await page.screenshot({path:path.join(dir,route+'-mobile.png'),fullPage:true});}
 await page.emulateMedia({reducedMotion:'reduce'});await view(page,'overview','Overview');await page.locator('.ov-cash').waitFor();assert.equal(await page.locator('button').first().evaluate(el=>getComputedStyle(el).transitionDuration),'0s');await page.emulateMedia({reducedMotion:'no-preference'});checks.push('Visuals: five themes, 390px layouts and reduced-motion rendering captured');
};
