// Owner-invoked family Demo enrichment. No Live credentials, database reset or startup seeding.
const {chromium}=require(process.env.USERPROFILE+'/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs');
(async()=>{
 if(!process.argv.includes('--apply'))throw Error('Use --apply for the explicitly approved local Demo enrichment.');
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage();await page.goto('https://localhost:5443');
  const result=await page.evaluate(async()=>{
   const api=async(path,method='GET',body)=>{const r=await fetch('/api/'+path,{method,headers:{'X-Banking-Client':'web','X-Banking-Mode':'Demo','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});if(!r.ok)throw Error(path+': '+r.status+' '+await r.text());return r.status===204?null:r.json()};
   await api('browser/demo','POST');if((await api('mode')).mode!=='Demo')throw Error('DEMO_ONLY');
   const connections=await api('connections');if(connections.length!==1||connections.some(c=>!c.isDemo||c.provider!=='product-demo'))throw Error('Requires the single synthetic household connection.');
   const beforeGoals=await api('goals'),beforePlans=(await api('budget-plans')).plans;
   const categories=await api('categories'),rules=await api('rules');
   const mappings={
    'Indkomst':["Løn"],"Anden indkomst":["Tilbagebetaling for køb"],
    "Dagligvarer":["Familiens supermarkedsindkøb","Bager og friske råvarer"],
    "Børn":["Skolemad","Skolefritidsordning","Indkøb til skolestart"],
    'Transport':["Tankstation","Parkering og broafgifter","Leasing af familiebil","Årlig bilservice"],
    "Tøj":["Børnetøj og sko"],
    "Restaurantbesøg":["Mad ud af huset til familien","Restaurantbesøg med familien","Frokost på arbejdet"],
    "Sundhed":["Apotek","Familiens tandpleje"],
    "Fritid":["Børnenes sportsklubber","Svømmeundervisning","Biograf og familieudflugter"],
    "Gaver":["Fødselsdagsgaver","Julegaver"],
    "Indkøb":["Hus og have"],
    "Abonnementer":["Familiens musikabonnement"],
    "Ferie":["Vinterferie","Familiens sommerferie"],
    "Forbrug":["Fjernvarme","Familiens mobilabonnementer","Vand og renovation",'internet'],
    "Forsikring":["Familiens ulykkesforsikring"],
    "Medlemskaber":["Fagforening og a-kasse"]
   };
   for(const [name,patterns] of Object.entries(mappings)){
    let category=categories.find(c=>c.name===name);if(!category){category=await api('categories','POST',{name});categories.push(category)}
    for(const contains of patterns)if(!rules.some(r=>r.contains.toLowerCase()===contains.toLowerCase())){await api('rules','POST',{contains,categoryId:category.id,priority:100,active:true});}
   }
   // The synthetic provider returns a local callback immediately. Never open an external bank flow.
   const started=new Date().toISOString();const auth=await api('connections/authorize','POST',{provider:'product-demo',bank:connections[0].bank,country:'DK',reconnectId:connections[0].id});
   const callback=new URL(auth.authorizationUrl);if(!['https://localhost:5443','http://127.0.0.1:5080'].includes(callback.origin)||!callback.pathname.startsWith('/api/auth/callback')||callback.searchParams.get('code')!=='fictional-household-v1')throw Error('LOCAL_DEMO_CALLBACK_REQUIRED');
   const r=await fetch(callback.pathname+callback.search,{headers:{'X-Banking-Client':'web','X-Banking-Mode':'Demo'}});if(!r.ok)throw Error('Demo callback failed');
   let accounts=[];for(let n=0;n<120;n++){accounts=await api('accounts');if(accounts.length===5&&accounts.every(a=>a.lastSuccess>=started))break;if(n===119)throw Error('Demo import did not finish');await new Promise(r=>setTimeout(r,1000));}
   if(accounts.some(a=>!a.isDemo))throw Error('DEMO_ONLY');
   await api('rules/apply','POST');
   const rows=[];for(let offset=0;;offset+=200){const batch=await api('transactions?limit=200&offset='+offset);rows.push(...batch.items);if(rows.length>=batch.total)break;}
   if(rows.some(r=>!r.isDemo))throw Error('DEMO_ONLY');
   let matched=0;const transfers=rows.filter(r=>r.status==='BOOK'&&/^(Overførsel til (budgetkonto|opsparing|bilopsparing|sommerhusopsparing)|Familiens overførsel til budgetkonto)$/i.test(r.description));
   for(const out of transfers.filter(r=>r.amount<0&&!r.isInternalTransfer)){
    const matches=transfers.filter(r=>!r.isInternalTransfer&&r.accountId!==out.accountId&&r.bookingDate===out.bookingDate&&r.description===out.description&&r.currency===out.currency&&r.amount===-out.amount);
    if(matches.length!==1)throw Error('Synthetic transfer has no unique counterpart');
    await api('transfer-matches','POST',{outgoingId:out.id,incomingId:matches[0].id});out.isInternalTransfer=matches[0].isInternalTransfer=true;matched++;
   }
   const balances=await Promise.all(accounts.map(async a=>({account:a,rows:await api('accounts/'+a.id+'/balances?limit=20')})));
   const currentBalance=x=>x.rows.find(b=>b.type==='ITAV').amount;
   for(const x of balances){const opening=x.account.name==="Opsparingskonto"?22000:x.account.name==="Budgetkonto"?6000:x.account.name==="Lønkonto"?12000:0;const ledger=opening+rows.filter(r=>r.accountId===x.account.id&&r.status==='BOOK').reduce((s,r)=>s+r.amount,0);if(Math.abs(ledger-x.rows.find(b=>b.type==='ITBD').amount)>.01)throw Error('Demo ledger does not reconcile');}
   const savings=balances.find(x=>x.account.name==="Opsparingskonto");const car=balances.find(x=>x.account.name==="Bilopsparing"),summerhouse=balances.find(x=>x.account.name==="Sommerhusopsparing");const total=balances.reduce((s,x)=>s+currentBalance(x),0);
   const today=new Date(),day=d=>d.toISOString().slice(0,10),end=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),1)),from=new Date(end);from.setUTCFullYear(from.getUTCFullYear()-1);const to=new Date(end);to.setUTCDate(to.getUTCDate()-1);
   const goalDefinitions=[
    {name:"Bil",description:"Udskift familiens bil med en praktisk elbil til to voksne og to børn. Afsæt penge til udbetaling, ladeboks og de første driftsudgifter.",notes:"Særskilt bilopsparing. Månedlig indbetaling: 2.500 DKK.",target:225000,scope:'Account',accountId:car.account.id,startingBalance:currentBalance(car),months:24},
    {name:"Sommerhus",description:"Spar op til udbetaling og købsomkostninger til et sommerhus med plads til to børn, gæster og weekendture.",notes:"Særskilt sommerhusopsparing. Månedlig indbetaling: 5.000 DKK.",target:1200000,scope:'Account',accountId:summerhouse.account.id,startingBalance:currentBalance(summerhouse),months:36}
   ];
   let createdGoals=0;for(const g of goalDefinitions){if(beforeGoals.some(x=>x.name===g.name||x.description===g.description))continue;const deadline=new Date(today);deadline.setUTCMonth(deadline.getUTCMonth()+g.months);const {months,...input}=g;await api('goals','POST',{...input,currency:'DKK',planStart:day(today),deadline:day(deadline),references:[]});createdGoals++;}
   // Twelve COMPLETE months include seasonal holidays, gifts and annual servicing.
   const history=rows.filter(r=>r.status==='BOOK'&&r.bookingDate>=day(from)&&r.bookingDate<=day(to)&&!r.isInternalTransfer);
   const groups=new Map();for(const r of history){const type=r.amount>0?'Income':'Expense';const name=type==='Income'?r.description:(categories.find(c=>c.id===r.categoryId)?.name??"Øvrige udgifter");const key=type+'|'+name;const g=groups.get(key)||{name,type,total:0};g.total+=Math.abs(r.amount);groups.set(key,g);}
   const planId='b31c671b-df11-4b59-a879-f7184b27d240';let plan=beforePlans.find(p=>p.id===planId),budgetCreated=false;
   if(!plan){const entries=[...groups.values()].sort((a,b)=>a.type!==b.type?a.type==='Income'?-1:1:b.total-a.total).map(g=>{const intervalMonths=["Ferie","Gaver"].includes(g.name)?12:1;return {id:crypto.randomUUID(),name:g.name,type:g.type,isSavings:false,amount:Math.round(g.total/12*intervalMonths*100)/100,intervalMonths,source:'Transactions',historyFrom:day(from),historyTo:day(to)}});
    const saved=transfers.filter(r=>r.description==="Overførsel til opsparing"&&r.amount<0&&r.bookingDate>=day(from)&&r.bookingDate<=day(to)).reduce((s,r)=>s-r.amount,0);
    entries.push({id:crypto.randomUUID(),name:"Indbetaling til opsparing",type:'Expense',isSavings:true,amount:Math.round(saved/12*100)/100,intervalMonths:1,source:'Transactions',historyFrom:day(from),historyTo:day(to)});
    plan=await api('budget-plans','POST',{id:planId,name:"Familie på fire",currency:'DKK',entries,requestId:crypto.randomUUID()});
    plan=await api('budget-plans/'+plan.id+'/activation','POST',{version:plan.version,expectedActiveId:beforePlans.find(p=>p.isActive)?.id??null,active:true});budgetCreated=true;
   }
   const afterPlans=(await api('budget-plans')).plans,afterGoals=await api('goals');
   if(beforeGoals.some(g=>!afterGoals.some(a=>a.id===g.id&&a.version===g.version)))throw Error('Existing goal changed');
   if(beforePlans.some(p=>!afterPlans.some(a=>a.id===p.id&&JSON.stringify(a.entries)===JSON.stringify(p.entries))))throw Error('Existing budget entries changed');
   return {workspace:'Demo',transactions:rows.length,booked:rows.filter(r=>r.status==='BOOK').length,matchedTransfers:matched,createdGoals,goals:afterGoals.map(g=>({name:g.name,target:g.target,scope:g.scope})),budgetCreated,budget:plan.name,active:plan.isActive,monthly:plan.monthly,budgetEntries:plan.entries.length,historyFrom:day(from),historyTo:day(to),historyTransactions:history.length,actualMonthlyIncome:history.filter(r=>r.amount>0).reduce((s,r)=>s+r.amount,0)/12,actualMonthlyExpenses:history.filter(r=>r.amount<0).reduce((s,r)=>s-r.amount,0)/12,balances:balances.map(x=>({name:x.account.name,amount:currentBalance(x)})),existingGoalsAndBudgetEntriesPreserved:true};
  });fs.writeFileSync('artifacts/demo-family-verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await browser.close()}
})().catch(e=>{console.error(e.message);process.exitCode=1});
