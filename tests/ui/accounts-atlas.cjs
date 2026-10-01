const assert=require('node:assert/strict');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
module.exports=async({page,api,https,output,checks})=>{
 async function ready(){await page.locator('.atlas-hero').waitFor();await page.waitForFunction(()=>!document.querySelector('#main .loading'));assert.equal(await page.locator('#main>.error').count(),0);}
 async function view(){await page.goto(https+'/#/accounts');await ready();}
 const metric=key=>page.locator('[data-metric="'+key+'"]');
 const amount=async key=>Number(await metric(key).getAttribute('data-value'));
 const data=await api('accounts');
 await view();await page.getByLabel('Period',{exact:true}).selectOption('1y');await ready();
 const from=await page.evaluate(()=>{const a=new Date();a.setFullYear(a.getFullYear()-1);a.setDate(a.getDate()+1);return a.toLocaleDateString('en-CA',{timeZone:'Europe/Copenhagen'});});
 const to=await page.evaluate(()=>new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Copenhagen'}));
 const info=await api(`account-insights?from=${from}&to=${to}&currency=DKK`);
 assert.equal(await amount('income'),info.income);assert.equal(await amount('spending'),info.spending);assert.equal(await amount('net'),info.net);
 assert.equal(await page.getByRole('columnheader',{name:'Account',exact:true}).count(),1);
 assert.ok((await page.locator('.account-ledger tbody tr').evaluateAll(xs=>[...new Set(xs.map(x=>x.dataset.accountId))])).length>1);
 const summary=await page.locator('.atlas-metrics').innerText();
 await page.getByRole('button',{name:'Next',exact:true}).click();await ready();assert.equal(await page.locator('.atlas-metrics').innerText(),summary);
 checks.push('Accounts: API-reconciled cash metrics independent of ledger pagination, explicit Account column');
 const selected=data.find(a=>a.name==='Savings account');
 await page.getByLabel('Search accounts',{exact:true}).fill('savings');assert.equal(await page.locator('[data-atlas-account-name]:visible').count(),3);
 await page.locator('#accounts-navigator [data-id="'+selected.id+'"]').click();await ready();
 const selectedInfo=await api(`account-insights?from=${from}&to=${to}&currency=DKK&accountId=${selected.id}`);
 assert.equal(await amount('spending'),selectedInfo.spending);
 assert.deepEqual(await page.locator('.account-ledger tbody tr').evaluateAll(xs=>[...new Set(xs.map(x=>x.dataset.accountId))]),[selected.id]);
 assert.ok((await page.locator('.insight-scope').innerText()).includes(selected.name));
 const colours=await page.evaluate(()=>({nav:getComputedStyle(document.querySelector('.atlas-account[aria-pressed=true] .atlas-icon')).getPropertyValue('--data-colour'),row:getComputedStyle(document.querySelector('.ledger-account .colour-label')).getPropertyValue('--data-colour'),hero:getComputedStyle(document.querySelector('.atlas-balance-key .colour-label')).getPropertyValue('--data-colour')}));
 assert.equal(colours.nav,colours.row);assert.equal(colours.hero,colours.row);
 await page.getByLabel('Search transactions',{exact:true}).fill('no-such-transaction');await page.getByRole('button',{name:'Search',exact:true}).click();await ready();await page.getByRole('heading',{name:'No transactions found.',exact:true}).waitFor();assert.equal(await amount('spending'),selectedInfo.spending);
 await page.getByLabel('Search transactions',{exact:true}).fill('');await page.keyboard.press('Enter');await ready();await page.locator('.account-ledger tbody tr').first().waitFor();
 checks.push('Accounts: searchable directory selects account and currency, scoped ledger/insights and matching account colours');
 const extras=Array.from({length:10-data.length},(_,i)=>({...data[0],id:randomUUID(),name:'Extra test account '+(data.length+i+1)}));
 await page.route('**/api/accounts',route=>route.fulfill({json:[...data,...extras],headers:{'X-Banking-Mode':'Demo'}}));
 await page.route('**/api/accounts/*/balances?*',route=>extras.some(a=>route.request().url().includes(a.id))?route.fulfill({json:[],headers:{'X-Banking-Mode':'Demo'}}):route.continue());
 await page.reload();await ready();assert.equal(await page.locator('[data-atlas-account-name]').count(),10);
 await page.getByLabel('Search accounts',{exact:true}).fill('account 10');assert.equal(await page.locator('[data-atlas-account-name]:visible').count(),1);
 await page.getByLabel('Search accounts',{exact:true}).fill('nonexistent');await page.getByText('No accounts found.',{exact:true}).waitFor();
 await page.unroute('**/api/accounts');await page.unroute('**/api/accounts/*/balances?*');await page.reload();await ready();
 await page.locator('.atlas-all').click();await ready();await page.getByLabel('Period',{exact:true}).selectOption('1m');await ready();
 checks.push('Accounts: ten-account directory, missing individual balances and no-search-results feedback');
 for(const width of [1920,1448,1280,1200,1100,1024,901,900,768,700,650,390,360]){
  await page.setViewportSize({width,height:1086});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page overflow at '+width);
  assert.deepEqual(await page.locator('.atlas-hero,.atlas-navigator,.atlas-spending,.atlas-spending-key').evaluateAll(xs=>xs.filter(x=>x.scrollWidth>x.clientWidth+1).map(x=>x.className)),[],'component overflow at '+width);
  const category=page.locator('.ledger-category select').first();if(await category.count()){
   await category.click();const box=await category.evaluate(el=>({button:el.getBoundingClientRect().width,picker:parseFloat(getComputedStyle(el,'::picker(select)').width)}));assert.ok(box.button>=150);assert.ok(Math.abs(box.button-box.picker)<1,'dropdown width at '+width);await page.keyboard.press('Escape');
  }
  if([1448,1024,390].includes(width))await page.screenshot({path:path.join(output,'accounts-atlas-'+width+'.png'),fullPage:true});
 }
 checks.push('Accounts: thirteen desktop/tablet/mobile widths, readable categories and exact dropdown widths');
 for(const theme of ['graphite','light','slate','sand','forest'])for(const lang of ['en','da']){
  await page.evaluate(({theme,lang})=>localStorage.setItem('banking.preferences.v1',JSON.stringify({theme,lang})),{theme,lang});
  await page.setViewportSize({width:1024,height:1086});await page.reload();await ready();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  if(theme==='light'&&lang==='en')await page.screenshot({path:path.join(output,'accounts-atlas-light.png'),fullPage:true});
 }
 await page.evaluate(()=>localStorage.setItem('banking.preferences.v1',JSON.stringify({theme:'graphite',lang:'en'})));await page.reload();await ready();
 checks.push('Accounts: all five themes and both languages render without page overflow');
 // Response fixtures stay in this browser and never change stored bank data.
 const noMoney={...info,income:0,spending:0,net:0,retentionPercent:null,categories:[],availableBalance:null,balanceStale:true};
 await page.route('**/api/account-insights?*',route=>route.fulfill({json:noMoney,headers:{'X-Banking-Mode':'Demo'}}));
 await page.reload();await ready();assert.equal(await page.locator('#scope-balance').innerText(),'—');assert.equal(await page.locator('.atlas-scenery .ring-component').count(),0);await page.getByText('No spending in this period.',{exact:true}).waitFor();assert.ok((await page.locator('.atlas-warnings').innerText()).includes('Missing balance'));
 await page.unroute('**/api/account-insights?*');
 await page.route('**/api/account-insights?*',route=>route.fulfill({json:{...noMoney,availableBalance:-500,balanceStale:false,net:-500,retentionPercent:-20},headers:{'X-Banking-Mode':'Demo'}}));
 await page.reload();await ready();assert.ok((await page.locator('#scope-balance').innerText()).startsWith('-500'));assert.equal(await page.locator('.atlas-scenery .ring-component').count(),0);
 await page.unroute('**/api/account-insights?*');await page.reload();await ready();
 checks.push('Accounts: missing balances and zero spending remain explicit; negative cash is never drawn as a positive allocation');
};
