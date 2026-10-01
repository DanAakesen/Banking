const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
module.exports=async({page,https,output,checks})=>{
 const dir=path.join(output,'consistency');fs.mkdirSync(dir,{recursive:true});
 const routes=['overview','accounts','activity','review','review/history','budgets','budgets/new','budgets/suggestions','budgets/legacy','goals','goals/new','categories','transfers','connections','advisor','investments','pension','settings/appearance','settings/language','settings/profile'];
 const widths=[1920,1440,1280,1200,1100,1024,901,900,768,390,360];const results=[];
 async function ready(route){await page.goto(https+'/#/'+route);await page.locator('#main h1').first().waitFor();await page.waitForFunction(()=>!document.querySelector('#main .loading'));}
 for(const width of widths){
  await page.setViewportSize({width,height:1000});
  for(const route of routes){
   await ready(route);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),route+' page overflow at '+width);
   assert.equal(await page.getByRole('button',{name:'Retry',exact:true}).count(),0,route+' loads');
   const clipped=await page.locator('.insight-card,.metric,.bp-metric,.goal-card,.collection-empty').evaluateAll(xs=>xs.filter(x=>x.scrollWidth>x.clientWidth+1).map(x=>x.className));
   assert.deepEqual(clipped,[],route+' card overflow at '+width);
   const views=await page.getByText('View all',{exact:true}).evaluateAll(xs=>xs.map(x=>{const el=x.closest('a,button');const css=getComputedStyle(el);return {shared:el.classList.contains('text-action'),font:css.fontSize,padding:css.padding,line:css.lineHeight,icon:el.querySelectorAll('svg').length};}));
   for(const action of views){assert.ok(action.shared);assert.equal(action.icon,1);assert.deepEqual(action,views[0]);}
   const currencies=await page.locator('.money').evaluateAll(xs=>xs.map(x=>({last:x.lastElementChild?.className,text:x.textContent,numberSize:parseFloat(getComputedStyle(x).fontSize),currencySize:parseFloat(getComputedStyle(x.lastElementChild).fontSize)})));
   for(const currency of currencies){assert.equal(currency.last,'money-currency');assert.ok(currency.currencySize<currency.numberSize,'currency is smaller');assert.ok(/\d [A-Z]{3}$/.test(currency.text),'currency follows number: '+currency.text);}
   if(route==='accounts'){
    const placement=await page.evaluate(()=>{const ledger=document.querySelector('.atlas-ledger').getBoundingClientRect(),nav=document.querySelector('.atlas-navigator').getBoundingClientRect(),spending=document.querySelector('.atlas-spending').getBoundingClientRect(),table=document.querySelector('.account-ledger').getBoundingClientRect();return {ledgerLeft:ledger.left,ledgerTop:ledger.top,navRight:nav.right,navBottom:nav.bottom,spendingBottom:spending.bottom,tableTop:table.top};});
    if(width>=1200)assert.ok(placement.navRight<=placement.ledgerLeft,'account directory stays beside ledger');
    else assert.ok(placement.navBottom<=placement.ledgerTop,'account directory precedes ledger');
    assert.ok(placement.spendingBottom<=placement.tableTop,'compact insights precede ledger rows at every width');
    const picker=page.locator('.ledger-category select').first();
    if(await picker.count()){
     await picker.click();
     const sizes=await picker.evaluate(x=>({button:x.getBoundingClientRect().width,list:parseFloat(getComputedStyle(x,'::picker(select)').width),options:[...x.options].map(o=>({height:o.getBoundingClientRect().height,length:o.textContent.length}))}));
     assert.ok(sizes.button>=150,'category control too narrow at '+width);
     assert.ok(Math.abs(sizes.button-sizes.list)<1,'picker width mismatch');
     assert.ok(sizes.options.every(o=>o.height<=64),'category options must not wrap letter by letter');
     if([1920,1200,390].includes(width))await page.screenshot({path:path.join(dir,'category-'+width+'.png')});
     await page.keyboard.press('Escape');
    }
   }
   if(['overview','accounts','budgets/new','review'].includes(route)&&[1920,1200,390].includes(width))await page.screenshot({path:path.join(dir,route.replaceAll('/','-')+'-'+width+'.png'),fullPage:true});
   results.push({width,route});
  }
 }
 await page.setViewportSize({width:1200,height:1000});
 for(const theme of ['light','graphite','slate','sand','forest'])for(const lang of ['en','da']){
  await page.evaluate(({theme,lang})=>localStorage.setItem('banking.preferences.v1',JSON.stringify({theme,lang})),{theme,lang});await page.reload();
  for(const route of ['overview','accounts','budgets/new','review','goals/new','settings/appearance']){await ready(route);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),theme+'/'+lang+'/'+route);}
  if(theme==='light'&&lang==='en')for(const route of ['overview','accounts']){await ready(route);await page.screenshot({path:path.join(dir,route+'-light-1200.png'),fullPage:true});}
 }
 await page.evaluate(()=>localStorage.setItem('banking.preferences.v1',JSON.stringify({theme:'graphite',lang:'en'})));await page.reload();
 fs.writeFileSync(path.join(dir,'matrix.json'),JSON.stringify({routes,widths,results},null,2));
 checks.push('Consistency: 20 routes at eleven widths, readable category options, matching picker widths and shared View all actions');
 checks.push('Consistency: five themes and both languages across six screens; screenshot review at desktop, intermediate desktop and mobile');
};
