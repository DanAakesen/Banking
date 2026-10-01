const fail=message=>{throw Object.assign(new Error(message),{status:400});};
const money=value=>Math.round((value+Number.EPSILON)*100)/100;
const amount=value=>typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=1e9;

// Matches Banking's goal forecast: next contribution strictly after the as-of date,
// whole monthly deposits, no returns, and no backfilling missed payments.
export function goalForecast(balance,target,monthly,today,day){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(today)||!Number.isInteger(day)||day<1||day>28)fail('The goal schedule is unavailable.');
 if(balance>=target)return {date:today,payments:0};
 if(monthly<=0)return {date:null,payments:null};
 const payments=Math.ceil(money(target-balance)/monthly);
 const [year,month,date]=today.split('-').map(Number);
 const next=new Date(Date.UTC(year,month-1+(day<=date?1:0)+payments-1,day));
 return {date:next.getUTCFullYear()>9999?null:next.toISOString().slice(0,10),payments};
}

export function calculateBankingScenario(context,args){
 if(context.source!=='Banking')fail('This calculation requires saved Banking data.');
 const plan=context.budgets?.plans?.find(p=>args.budgetId?p.id===args.budgetId:p.isActive);
 if(!plan)fail('Choose a saved budget for the monthly baseline.');
 const base=plan.monthly;
 if(!base||!['income','expenses','savings','available'].every(k=>amount(base[k])))fail('Budget totals are unavailable.');
 for(const k of ['incomeChange','expenseChange','savingsChange'])if(!amount(args[k]))fail('Provide valid monthly changes in the budget currency.');
 const changed={income:money(base.income+args.incomeChange),expenses:money(base.expenses+args.expenseChange),savings:money(base.savings+args.savingsChange)};
 if(Object.values(changed).some(v=>v<0))fail('A scenario cannot produce negative planned income, expenses or savings.');
 changed.available=money(changed.income-changed.expenses-changed.savings);
 let goal=null;
 const warnings=[];
 if(args.goalId){
  const entry=context.goalContext?.goals?.find(x=>x.goal.id===args.goalId);
  if(!entry)fail('Choose a saved goal from this workspace.');
  const g=entry.goal,p=entry.progress,j=entry.journey;
  if(g.currency!==plan.currency)fail('Goal and budget currencies must match.');
  if((!j?.fresh&&p?.reason!=='STALE_BALANCE')||!amount(p?.measuredBalance)||!amount(g.monthlyContribution)||g.monthlyContribution<=0)fail('A recorded goal balance and monthly contribution plan are required.');
  if(!j.fresh)warnings.push('The goal balance is stale. This hypothetical projection assumes that the last recorded balance still holds; it is not a current on-track assessment.');
  const monthly=money(g.monthlyContribution+args.savingsChange);
  if(monthly<0)fail('The change exceeds the goal contribution.');
  const baseline=goalForecast(p.measuredBalance,g.target,g.monthlyContribution,j.to,g.contributionDay);
  const scenario=goalForecast(p.measuredBalance,g.target,monthly,j.to,g.contributionDay);
  const linked=(plan.entries||[]).filter(e=>e.isSavings&&e.savingsAccountId===g.accountId).reduce((sum,e)=>sum+e.amount/e.intervalMonths,0);
  if(Math.abs(linked-g.monthlyContribution)>.01)warnings.push('The linked budget allocation differs from the goal monthly plan. Goal projections use its own plan; the budget changes only by the stated savings adjustment.');
  goal={id:g.id,name:g.name,target:g.target,balance:p.measuredBalance,balanceFresh:j.fresh,balanceSources:p.sources,balanceRecordedAt:p.sources?.[0]?.bankTime||p.sources?.[0]?.observedAt||null,projectionFrom:j.to,baseline:{monthly:g.monthlyContribution,...baseline},scenario:{monthly,...scenario},paymentsEarlier:baseline.payments!=null&&scenario.payments!=null?baseline.payments-scenario.payments:null};
 }
 if(changed.available<0)warnings.push('This scenario has a monthly funding shortfall. It is not fully funded by the selected budget.');
 return {source:'Banking',mode:context.mode,kind:'hypothetical',saved:false,currency:plan.currency,budgetId:plan.id,budgetName:plan.name,baseline:{...base},changes:{income:args.incomeChange,expenses:args.expenseChange,savings:args.savingsChange},scenario:changed,goal,warnings,assumptions:['Monthly planned budget, not actual bank activity.','Existing savings contributions are already in the baseline; only the change is subtracted again.','All changed savings go to the selected goal, when a goal is selected.','Goal projections exclude interest, investment returns, price changes and future withdrawals.'],generatedAt:context.generatedAt};
}

export function previousPeriod(from,to){
 const start=Date.parse(from+'T00:00:00Z'),end=Date.parse(to+'T00:00:00Z');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||!Number.isFinite(start)||!Number.isFinite(end)||end<start||end-start>366*86400000)fail('Choose a valid comparison period of at most one year.');
 const days=Math.round((end-start)/86400000)+1;
 return {from:new Date(start-days*86400000).toISOString().slice(0,10),to:new Date(start-86400000).toISOString().slice(0,10)};
}
export function compareFinancials(current,previous){
 if(current.currency!==previous.currency)fail('Comparison currencies must match.');
 const a=current.actuals,b=previous.actuals;
 if(!a||!b)fail('Both comparison periods are required.');
 const changes={};
 for(const field of ['income','spending','net','disposableAmount'])changes[field]=amount(a[field])&&amount(b[field])?{current:a[field],previous:b[field],change:money(a[field]-b[field])}:null;
 const ids=new Set([...(a.categories||[]),...(b.categories||[])].map(x=>x.categoryId));
 const categories=[...ids].map(id=>{const current=(a.categories||[]).find(x=>x.categoryId===id)?.amount||0,previous=(b.categories||[]).find(x=>x.categoryId===id)?.amount||0;return {categoryId:id,name:currentCategory(id),current,previous,change:money(current-previous)};}).sort((x,y)=>Math.abs(y.change)-Math.abs(x.change));
 function currentCategory(id){return current.categories?.find(x=>x.id===id)?.name||(id?'Unknown category':'Uncategorized');}
 return {source:'Banking',mode:current.mode,currency:current.currency,scope:'All accounts in this currency',currentPeriod:{from:current.from,to:current.to,coverage:a.coverage},previousPeriod:{from:previous.from,to:previous.to,coverage:b.coverage},changes,categories,definitions:'Changes compare equal-length booked periods using Banking totals, excluding matched internal transfers. Evidence transactions are a bounded page, not complete attribution. Coverage can be incomplete; never invent a merchant cause.'};
}
