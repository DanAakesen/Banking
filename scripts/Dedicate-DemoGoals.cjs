// Explicit Demo migration from shared goals to dedicated accounts. No Live access or bank writes.
const {chromium}=require(process.env.USERPROFILE+'/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{if(!process.argv.includes('--apply'))throw Error('Pass --apply for the approved Demo goal/account migration.');const b=await chromium.launch({channel:'chrome',headless:true});try{const p=await b.newPage();await p.goto('https://localhost:5443');console.log(JSON.stringify(await p.evaluate(async()=>{
 const api=async(path,method='GET',body)=>{const r=await fetch('/api/'+path,{method,headers:{'X-Banking-Client':'web','X-Banking-Mode':'Demo','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});if(!r.ok)throw Error(path+' '+r.status+' '+await r.text());return r.status===204?null:r.json()};await api('browser/demo','POST');if((await api('mode')).mode!=='Demo')throw Error('DEMO_ONLY');
 const accounts=await api('accounts');if(accounts.length!==5||accounts.some(a=>!a.isDemo))throw Error('EXPANDED_DEMO_REQUIRED');if((await api('connections')).some(c=>c.provider!=='product-demo'))throw Error('SYNTHETIC_ONLY');
 const goals=await api('goals'),today=new Date().toISOString().slice(0,10);let reassigned=0;
 for(const [name,accountName,amount] of [["Bil","Bilopsparing",2500],["Sommerhus","Sommerhusopsparing",5000]]){
  const goal=goals.find(g=>g.name===name),account=accounts.find(a=>a.name===accountName);if(!goal||!account)throw Error('GOAL_OR_ACCOUNT_MISSING');if(goal.scope==='Account'&&goal.accountId===account.id)continue;
  const balance=(await api('accounts/'+account.id+'/balances?limit=20')).find(b=>b.type==='ITBD');
  await api('goals/'+goal.id,'PUT',{...goal,scope:'Account',accountId:account.id,planStart:today,startingBalance:balance.amount,notes:`Særskilt ${accountName.toLocaleLowerCase('da-DK')}. Månedlig indbetaling: ${amount.toLocaleString('da-DK')} DKK.`});reassigned++;
 }
 const plan=(await api('budget-plans')).plans.find(p=>p.id==='b31c671b-df11-4b59-a879-f7184b27d240');if(!plan)throw Error('FAMILY_BUDGET_REQUIRED');const entries=[...plan.entries];
 for(const [name,amount] of [["Indbetaling til bilopsparing",2500],["Indbetaling til sommerhusopsparing",5000]])if(!entries.some(e=>e.name===name))entries.push({id:crypto.randomUUID(),name,type:'Expense',isSavings:true,amount,intervalMonths:1,source:'Transactions',historyFrom:'2025-09-01',historyTo:'2026-08-31',categoryId:null});
 const saved=entries.length===plan.entries.length?plan:await api('budget-plans','POST',{...plan,entries,requestId:crypto.randomUUID()});
 const after=await api('goals');if(after.some(g=>g.scope!=='Account'||!g.accountId)||new Set(after.map(g=>g.accountId)).size!==after.length)throw Error('GOALS_NOT_EXCLUSIVE');
 const progress=await Promise.all(after.map(g=>api('goals/'+g.id+'/progress')));if(progress.some(p=>!p.accountExclusive||p.sources.length!==1))throw Error('PROGRESS_NOT_EXCLUSIVE');
 return {workspace:'Demo',reassigned,goals:after.map((g,i)=>({name:g.name,account:accounts.find(a=>a.id===g.accountId).name,balance:progress[i].measuredBalance,target:g.target})),budget:saved.name,monthly:saved.monthly};
})));}finally{await b.close()}})().catch(e=>{console.error(e.message);process.exitCode=1});
