// User-approved synthetic goal scenarios. Idempotent; public Demo API only, never Live.
const {chromium}=require(process.env.USERPROFILE+'/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{if(!process.argv.includes('--apply'))throw Error('Pass --apply to refine synthetic Demo goals.');const browser=await chromium.launch({channel:'chrome',headless:true});try{const page=await browser.newPage();await page.goto('https://localhost:5443');console.log(JSON.stringify(await page.evaluate(async()=>{
 const api=async(path,method='GET',body)=>{const response=await fetch('/api/'+path,{method,headers:{'X-Banking-Client':'web','X-Banking-Mode':'Demo','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});if(!response.ok)throw Error(path+' '+response.status);return response.status===204?null:response.json()};
 await api('browser/demo','POST');if((await api('mode')).mode!=='Demo')throw Error('DEMO_ONLY');const accounts=await api('accounts'),connections=await api('connections');if(accounts.some(a=>!a.isDemo)||connections.some(c=>c.provider!=='product-demo'))throw Error('SYNTHETIC_ONLY');
 const rows=[];for(let offset=0;;offset+=200){const batch=await api('transactions?status=BOOK&limit=200&offset='+offset);rows.push(...batch.items);if(rows.length>=batch.total)break}
 const returns=rows.filter(r=>r.description==="Tilbageført indbetaling til bilopsparing");if(returns.length!==2||returns.reduce((s,r)=>s+r.amount,0)!==0)throw Error('Run Enrich-FamilyDemo.cjs --apply first to import the returned contribution.');
 if(!returns.every(r=>r.isInternalTransfer)){await api('transfer-matches','POST',{outgoingId:returns.find(r=>r.amount<0).id,incomingId:returns.find(r=>r.amount>0).id})}
 const goals=await api('goals');let updated=0;const reference='2026-09-09',start='2026-07-01';
 for(const [name,amount,description] of [["Familieferie",1800,"To uger ved søen med plads til familieoplevelser."],["Bil",2500,"En praktisk elektrisk familiebil til familiens næste kapitel."],["Sommerhus",5000,"Et sted ved kysten til rolige weekender og familieminder."]]){
  const g=goals.find(g=>g.name===name);if(!g)throw Error('Missing Demo goal: '+name);const account=accounts.find(a=>a.id===g.accountId);if(!account)throw Error('Dedicated account required');
  const opening=account.name==="Opsparingskonto"?22000:0;const baseline=opening+rows.filter(r=>r.accountId===account.id&&r.bookingDate<start).reduce((s,r)=>s+r.amount,0);
  const plannedAtReference=baseline+3*amount;const remaining=Math.max(0,g.target-plannedAtReference),months=Math.ceil(remaining/amount);const deadline=months===0?reference:new Date(Date.UTC(2026,9+months-1,2)).toISOString().slice(0,10);
  const changes={description,planStart:start,startingBalance:baseline,monthlyContribution:amount,contributionDay:2,deadline};
  if(Object.entries(changes).some(([k,v])=>g[k]!==v)){await api('goals/'+g.id,'PUT',{...g,...changes});updated++}
 }
 const after=await api('goals');const details=await Promise.all(after.map(async g=>{const [p,j]=await Promise.all([api('goals/'+g.id+'/progress'),api('goals/'+g.id+'/journey')]);if(!j.historyComplete||!j.fresh)throw Error('Demo evidence is incomplete or stale');if(Math.abs(j.openingBalance+j.deposits-j.withdrawals-j.closingBalance)>.01)throw Error('Goal does not reconcile');return{name:g.name,status:p.status,balance:p.measuredBalance,shortfall:j.shortfall,forecast:j.forecastDate,delayMonths:j.delayMonths,months:j.months}}));
 if(details.find(g=>g.name==="Familieferie").status!=='OnTrack'||details.find(g=>g.name==="Bil").status!=='BehindPlan'||details.find(g=>g.name==="Bil").delayMonths!==1)throw Error('Expected contrasting Demo scenarios');
 return{workspace:'Demo',updated,goals:details};
})));}finally{await browser.close()}})().catch(e=>{console.error(e.message);process.exitCode=1});
