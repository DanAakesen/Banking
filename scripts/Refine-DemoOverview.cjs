// Explicit, repeatable local Demo refinement. Never runs automatically at startup.
// Uses the same public Demo APIs as the UI; no owner credential or Live access.
const {chromium}=require(process.env.USERPROFILE+'/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 if(!process.argv.includes('--apply'))throw Error('Pass --apply to refine the local synthetic Demo workspace.');
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage();await page.goto('https://localhost:5443');
  const result=await page.evaluate(async()=>{
   const api=async(path,method='GET',body)=>{const response=await fetch('/api/'+path,{method,headers:{'X-Banking-Client':'web','X-Banking-Mode':'Demo','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});if(!response.ok)throw Error('Demo refinement failed: '+path+' '+response.status);return response.status===204?null:response.json();};
   await api('browser/demo','POST');const mode=await api('mode');if(mode.mode!=='Demo')throw Error('DEMO_ONLY');
   const connections=await api('connections');if(connections.some(c=>!c.isDemo||c.provider!=='product-demo'))throw Error('Requires only synthetic product-demo connections.');
   const accounts=await api('accounts'),categories=await api('categories');
   const rows=[];for(let offset=0;;offset+=200){const batch=await api('transactions?limit=200&offset='+offset);rows.push(...batch.items);if(rows.length>=batch.total)break;}
   if(rows.some(r=>!r.isDemo))throw Error('DEMO_ONLY');
   const booked=rows.filter(r=>r.status==='BOOK'),transfers=booked.filter(r=>/^Overførsel til (budgetkonto|opsparing)$/i.test(r.description));
   let matched=0,classified=0;const pairs=[];
   for(const out of transfers.filter(r=>r.amount<0&&!r.isInternalTransfer)){
    const matches=transfers.filter(r=>!r.isInternalTransfer&&r.accountId!==out.accountId&&r.bookingDate===out.bookingDate&&r.description===out.description&&r.currency===out.currency&&r.amount===-out.amount);
    if(matches.length===1)pairs.push([out,matches[0]]);
   }
   // Exact, known synthetic transfer descriptions and matching amounts/dates only.
   for(const [out,incoming] of pairs){await api('transfer-matches','POST',{outgoingId:out.id,incomingId:incoming.id});out.isInternalTransfer=incoming.isInternalTransfer=true;matched++;}
   const definitions={"Løn":"Indkomst","Tilbagebetaling for køb":"Anden indkomst",'Internet':"Forbrug","Kaffe":"Restaurantbesøg"};
   const coffees=booked.filter(r=>r.description==="Kaffe"&&!r.categoryId).sort((a,b)=>b.bookingDate.localeCompare(a.bookingDate));
   const leaveForReview=new Set(coffees.slice(0,4).map(r=>r.id));
   for(const [description,name] of Object.entries(definitions)){
    let category=categories.find(c=>c.name===name);if(!category){category=await api('categories','POST',{name});categories.push(category);}
    for(const row of booked.filter(r=>r.description===description&&!r.categoryId&&r.classification!=='Manual'&&!leaveForReview.has(r.id))){await api('transactions/'+row.id+'/category','PUT',{categoryId:category.id,version:row.version});classified++;}
   }
   const goals=await api('goals');let goalCreated=false;
   // Never overwrite an existing goal. A rerun leaves the owner's edits intact.
   if(!goals.length){
    const savings=accounts.find(a=>a.name==="Opsparingskonto");
    if(savings){const balances=await api('accounts/'+savings.id+'/balances?limit=20'),balance=balances.find(b=>b.type==='ITBD'&&b.currency==='DKK');if(balance){
     const now=new Date(),day=d=>d.toISOString().slice(0,10),start=new Date(now),end=new Date(now);start.setUTCDate(start.getUTCDate()-30);end.setUTCDate(end.getUTCDate()+150);
     await api('goals','POST',{name:"Familieferie",description:"En fiktiv familierejse på seks uger: ophold, transport, aktiviteter og en reserve til uventede udgifter.",notes:"Illustrativt demomål til overblikket. Redigér eller fjern det under Mål.",target:Math.ceil(balance.amount/0.6/1000)*1000,currency:'DKK',scope:'Account',accountId:savings.id,planStart:day(start),deadline:day(end),startingBalance:Math.round(balance.amount*0.8),references:[]});goalCreated=true;
    }}
   }
   return {workspace:'Demo',transactionsReviewed:rows.length,matched,classified,goalCreated,bankAmountsChanged:false,budgetsCreated:false};
  });console.log(JSON.stringify(result));
 }finally{await browser.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
