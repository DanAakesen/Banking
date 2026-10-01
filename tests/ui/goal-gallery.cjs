const assert=require('node:assert/strict');
const fs=require('node:fs');
module.exports=async({page,checks})=>{
 const photo=()=>page.locator('[data-goal-photo]').first();
 await page.locator('[data-photo-input]').first().setInputFiles({name:'goal.webp',mimeType:'image/webp',buffer:fs.readFileSync('src/Banking.Api/wwwroot/assets/goal-car.webp')});
 await page.waitForFunction(()=>document.querySelector('[data-goal-photo]')?.src.startsWith('data:image/jpeg;base64,'));
 assert.ok((await photo().getAttribute('src')).length<=60000);
 await page.reload();await page.waitForFunction(()=>document.querySelector('[data-goal-photo]')?.src.startsWith('data:image/jpeg;base64,'));
 assert.ok(await photo().evaluate(el=>el.complete&&el.naturalWidth>0));
 await page.locator('.gg-notes summary').click();await page.getByRole('button',{name:'Remove photo',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('[data-goal-photo]')?.src.includes('/assets/overview-afternoon.webp'));
 await page.reload();await page.locator('.gg-detail').waitFor();assert.ok(!(await photo().getAttribute('src')).startsWith('data:'));
 checks.push('goal photo upload normalizes a real image, persists across reload, removes cleanly');
 // Root gallery renders the first goal's controls; deleting there must refresh even though the hash is unchanged.
 const saved=await page.evaluate(async()=>{const r=await fetch('/api/goals',{headers:{'X-Banking-Client':'web','X-Banking-Mode':'Demo'}});return(await r.json())[0]});
 await page.goto(new URL('/#/goals',page.url()).href);await page.locator('.gg-notes summary').click();page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Delete',exact:true}).click();await page.getByRole('heading',{name:'No goals yet',exact:true}).waitFor();
 // Restore only this disposable fixture so the surrounding notes/edit/isolation checks retain their input.
 const restored=await page.evaluate(async goal=>{const r=await fetch('/api/goals',{method:'POST',headers:{'X-Banking-Client':'web','X-Banking-Mode':'Demo','Content-Type':'application/json'},body:JSON.stringify(goal)});if(!r.ok)throw Error('Fixture restore failed');return r.json()},saved);
 await page.goto(new URL('/#/goals/'+restored.id,page.url()).href);await page.locator('.gg-detail').waitFor();
 checks.push('deleting the displayed goal from the root gallery refreshes to the explicit empty state');
};
