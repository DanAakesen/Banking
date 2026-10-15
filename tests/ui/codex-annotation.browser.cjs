// Source-derived stylesheet fixture stays ignored. This proves Chromium CSP/DOM behavior,
// not acceptance inside the actual Codex embedded-browser preload.
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..'),origin='https://annotation.fixture';
const expected=[['sha256-WO55anZ1V8A0G22bY2t72RV4dI79SLI4VnYLgsEeWUc=',5382],['sha256-OUoShR0c3lqWNHEaHdorwfYnp/0EJHI/7QhTEUtan9w=',193],['sha256-6ddE/BE/E7OfXOyznfBSKxo7Dfm3OMuxy0O5a2y6TqI=',125]];
(async()=>{
 const fixture=JSON.parse(await fs.readFile(process.env.ANNOTATION_FIXTURE||path.join(root,'artifacts/codex-annotation/styles.json'),'utf8'));
 fixture.styles.forEach((s,i)=>{assert.equal(s.css.length,expected[i][1]);assert.equal('sha256-'+createHash('sha256').update(s.css).digest('base64'),expected[i][0]);});
 const backend=await fs.readFile(path.join(root,'src/Banking.Api/Security/LocalSecurity.cs'),'utf8');
 const policy=backend.match(/Headers\["Content-Security-Policy"\] = "([^"]+)"/)[1];
 const host=await fs.readFile(path.join(root,'tools/frontend-host/Program.cs'),'utf8');
 assert.equal(policy,host.match(/MainContentSecurityPolicy = "([^"]+)"/)[1]);
 const legacy=expected.reduce((p,[h])=>p.replace(" '"+h+"'",''),policy);
 const out=path.join(root,'artifacts/codex-annotation');await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 const results=[];
 try{
  for(const width of [1440,1024,390])for(const current of [false,true])for(const cursor of [1,2]){
   const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage();
   await page.route(origin+'/**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/fixture.js')return route.fulfill({contentType:'text/javascript',body:"window.externalRan=true;window.violations=[];window.underClicks=0;document.addEventListener('securitypolicyviolation',e=>window.violations.push(e.effectiveDirective));document.addEventListener('click',e=>{if(e.target.id==='under')window.underClicks++});"});
    if(url.pathname.endsWith('.css'))return route.fulfill({contentType:'text/css',body:await fs.readFile(path.join(root,'src/Banking.Api/wwwroot',url.pathname.slice(1)))});
    return route.fulfill({contentType:'text/html',headers:{'Content-Security-Policy':current?policy:legacy},body:'<!doctype html><html><head><script src="/fixture.js"></script><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/markets.css"></head><body><button id="under">Underlying control</button><div id="unrelated" style="color:rgb(1,2,3)">Body</div><style id="blocked-style">html{--unrelated-css:yes}</style><script>window.inlineRan=true</script><button id="inline-handler" onclick="window.handlerRan=true">Inline handler</button></body></html>'});
   });
   await page.goto(origin);assert.equal(await page.evaluate(()=>window.externalRan),true);
   const state=await page.evaluate(({overlay,cursorCss})=>{
    for(const [id,css]of [['overlay-style',overlay],['cursor-style',cursorCss]]){const style=document.createElement('style');style.id=id;style.textContent=css;document.head.append(style);}
    const dialog=document.createElement('dialog');dialog.id='codex-browser-sidebar-comments-root';dialog.className='interaction-layer';
    const blocker=document.createElement('div');blocker.className='interaction-blocker';dialog.append(blocker);
    const pointer=document.createElement('div');pointer.className='annotation-selection-cursor';pointer.textContent='◉';pointer.style.left='80px';pointer.style.top='80px';pointer.style.pointerEvents='none';dialog.append(pointer);
    window.selectionPoints=[];blocker.addEventListener('pointerdown',e=>window.selectionPoints.push([e.clientX,e.clientY]));document.body.append(dialog);dialog.showModal();
    const b=dialog.getBoundingClientRect();return {sheet:!!document.querySelector('#overlay-style').sheet,cursorSheet:!!document.querySelector('#cursor-style').sheet,position:getComputedStyle(dialog).position,pointerPosition:getComputedStyle(pointer).position,bounds:{x:b.x,y:b.y,width:b.width,height:b.height},cursor:getComputedStyle(document.documentElement).cursor,userSelect:getComputedStyle(document.body).userSelect,blockedStyle:document.querySelector('#blocked-style').sheet===null,blockedColor:getComputedStyle(document.querySelector('#unrelated')).color!=='rgb(1, 2, 3)',inlineRan:!!window.inlineRan};
   },{overlay:fixture.styles[0].css,cursorCss:fixture.styles[cursor].css});
   assert.equal(state.sheet,current);assert.equal(state.cursorSheet,current);assert.equal(state.blockedStyle,true);assert.equal(state.blockedColor,true);assert.equal(state.inlineRan,false);
   if(current){
    assert.equal(state.position,'fixed');assert.equal(state.pointerPosition,'fixed');assert.deepEqual(state.bounds,{x:0,y:0,width,height:900});assert.equal(state.cursor,'none');assert.equal(state.userSelect,cursor===1?'none':'auto');
    await page.mouse.click(10,10);await page.mouse.click(width-10,890);assert.deepEqual(await page.evaluate(()=>window.selectionPoints),[[10,10],[width-10,890]]);assert.equal(await page.evaluate(()=>window.underClicks),0);
    await page.screenshot({path:path.join(out,`current-${width}-cursor${cursor}.png`)});
   }else assert.notDeepEqual(state.bounds,{x:0,y:0,width,height:900});
   await page.evaluate(()=>document.querySelector('dialog').close());await page.locator('#under').click();assert.equal(await page.evaluate(()=>window.underClicks),1);
   await page.locator('#inline-handler').click();assert.equal(await page.evaluate(()=>!!window.handlerRan),false);
   results.push({width,current,cursor,...state});await context.close();
  }
 }finally{await browser.close();}
 await fs.writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({passed:results.length,sourceVersion:fixture.version,actualCodexPreloadAcceptance:false}));
})().catch(e=>{console.error(e);process.exitCode=1});
