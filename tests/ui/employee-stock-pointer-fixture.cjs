// Native pointer/keyboard checks against independently measured rendered dot geometry.
const assert=require('node:assert/strict');
module.exports=async function exactStockPointInspection({page,width,boundedTooltip}){
 const svg=page.locator('.stock-money-line'),tip=page.locator('#stock-point');
 await page.locator('[data-stock-currency=DKK]').focus();await page.keyboard.press('Escape');await svg.evaluate(el=>el.scrollIntoView({block:'center'}));
 const box=await svg.boundingBox(),dots=await page.locator('.stock-point-dot').evaluateAll(xs=>xs.map(el=>{const b=el.getBoundingClientRect(),stroke=parseFloat(getComputedStyle(el).strokeWidth);return {x:b.x+b.width/2,y:b.y+b.height/2,fill:b.width/2,r:b.width/2+stroke/2,day:el.parentElement.dataset.stockPoint};}));
 const first=dots[0],background={x:box.x+box.width/2,y:box.y+8};
 const closed=async()=>assert.equal(await tip.isVisible(),false,'Background, gaps and lines must not open a point popup');
 const opened=async day=>{await page.waitForSelector('#stock-point:popover-open');assert.equal(await page.locator('[data-stock-point][aria-pressed=true]').getAttribute('data-stock-point'),day);await boundedTooltip();};
 await page.mouse.move(background.x,background.y);await closed();
 await page.mouse.move(first.x,first.y);await opened(first.day);
 // The visible stroke counts, but the invisible 13-unit touch halo does not.
 await page.mouse.move(first.x+first.fill+.5,first.y);await opened(first.day);
 await page.mouse.move(first.x+first.r+2,first.y);await closed();
 await page.mouse.click(first.x+first.r+2,first.y);await closed();
 await page.mouse.move(first.x,first.y);await opened(first.day);
 await page.mouse.move(first.x+first.r*.9,first.y+first.r*.9);await closed();
 const gap=dots.slice(0,-1).map((p,i)=>({x:(p.x+dots[i+1].x)/2,y:p.y})).find(p=>dots.every(d=>Math.hypot(d.x-p.x,d.y-p.y)>d.r+2));
 assert.ok(gap,'Fixture must have a real horizontal-line gap outside every painted dot');
 await page.mouse.move(gap.x,gap.y);await closed();await page.mouse.click(gap.x,gap.y);await closed();
 await page.mouse.move(box.x+box.width*.7,box.y+box.height-55);await closed();
 // A mouse click must not make inspection sticky, including when a dot retains focus.
 await page.locator('[data-stock-point]').first().focus();await page.mouse.move(first.x,first.y);await page.mouse.click(first.x,first.y);await opened(first.day);
 await page.mouse.move(first.x+first.r+2,first.y);await closed();
 const selected=await page.locator('[data-stock-point][aria-pressed=true]').getAttribute('data-stock-point');assert.equal(selected,first.day,'Dismissal preserves selected point');
 await page.locator('[data-stock-point]').first().focus();await page.mouse.move(first.x,first.y);await opened(first.day);
 await page.mouse.move(box.x+box.width/2,box.y-8);await closed();
 // Genuine keyboard inspection remains available independently of mouse hit testing.
 await page.locator('[data-stock-point]').first().focus();await page.keyboard.press('Enter');await opened(first.day);await page.keyboard.press('Escape');await closed();
 await page.keyboard.press('Space');await opened(first.day);await page.keyboard.press('ArrowRight');await opened(dots[1].day);
 await page.mouse.move(background.x,background.y);await opened(dots[1].day);
 await page.keyboard.press('End');await opened(dots.at(-1).day);await page.keyboard.press('ArrowLeft');await opened(dots.at(-2).day);await page.keyboard.press('Home');await opened(first.day);await page.keyboard.press('Escape');await closed();
 if(width===390){
  // Touch retains its larger actual-point target; empty chart taps cannot pick a nearest point.
  await page.touchscreen.tap(first.x+first.r+3,first.y);await opened(first.day);
  await page.touchscreen.tap(background.x,background.y);await closed();
 }
 await page.locator('[data-stock-currency=DKK]').focus();await page.keyboard.press('Escape');
};
