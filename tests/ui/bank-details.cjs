const assert=require('node:assert/strict');
const path=require('node:path');
module.exports=async({page,api,https,output,checks})=>{
 await require('./workspace.cjs')(page,'Demo');
 await page.goto(https+'/#/accounts');
 await page.locator('.bank-balance-chart').waitFor();
 const account=await page.locator('[data-history-account]').inputValue();
 const params=await page.locator('.bank-chart-basis').innerText();
 assert.ok(params.includes('Booked closing balances'));
 const first=await page.locator('[data-action="transaction"]').first().getAttribute('data-id');
 const source=await api('transactions/'+first);
 await page.locator('[data-action="transaction"]').first().click();
 await page.getByRole('dialog').getByText('Booked balance after transaction',{exact:true}).waitFor();
 assert.ok((await page.getByRole('dialog').innerText()).includes(source.description));
 assert.equal(await page.getByRole('dialog').locator('dd').filter({hasText:'••••'}).count()>0,true);
 const errors=[];
 for(const width of [1440,820,390]){
  await page.setViewportSize({width,height:900});
  for(const theme of ['light','graphite','slate','sand','forest']){
   // Presentation-only variation within a disposable browser context; no product settings saved.
   await page.evaluate(value=>document.documentElement.dataset.theme=value,theme);
   const fit=await page.evaluate(()=>{const d=document.querySelector('dialog').getBoundingClientRect();return {page:document.documentElement.scrollWidth<=innerWidth+1,dialog:d.left>=0&&d.right<=innerWidth+1,grid:document.querySelector('.bank-detail-grid').scrollWidth<=document.querySelector('.bank-detail-grid').clientWidth+1};});
   if(!fit.page||!fit.dialog||!fit.grid)errors.push({width,theme,fit});
  }
  await page.screenshot({path:path.join(output,`bank-details-${width}.png`)});
 }
 assert.deepEqual(errors,[]);await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
 for(const width of [1440,820,390]){
  await page.setViewportSize({width,height:900});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  const slider=page.getByRole('slider',{name:'Inspect a balance'});await slider.focus();await slider.press('Home');
  assert.ok(await slider.getAttribute('aria-valuetext'));
 }
 await page.setViewportSize({width:1440,height:1080});
 await page.locator('#bank-balance-history').screenshot({path:path.join(output,'bank-balance-history.png')});
 // Deliberately unclassify one synthetic grocery in this disposable database to exercise the suggestion workflow.
 const rows=await api('transactions?status=BOOK&limit=100');
 const grocery=rows.items.find(x=>/grocer|supermarket/i.test(x.description));assert.ok(grocery);
 await api(`transactions/${grocery.id}/category`,'PUT',{categoryId:null,version:grocery.version});
 await page.goto(https+'/#/review');await page.locator('#review-detail').waitFor();
 const queue=await api('review');
 const item=queue.items.find(x=>x.transaction.id===grocery.id);assert.ok(item);assert.ok(item.suggestedCategoryId);
 await page.locator(`[data-action="review-select"][data-key="${item.key}"]`).click();await page.getByText('Bank-based suggestion:',{exact:false}).waitFor();
 assert.equal(await page.locator('#review-category').inputValue(),item.suggestedCategoryId);
 assert.equal((await api('transactions/'+grocery.id)).categoryId,null);
 await page.screenshot({path:path.join(output,'bank-review-suggestion.png'),fullPage:true});
 checks.push('Bank details API agrees with transaction modal; masked identifiers; balance chart and inspection work; no overflow at desktop/tablet/mobile in all five themes; Review preselects the bank-based category without saving it');
};
