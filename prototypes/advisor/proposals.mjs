import {randomUUID} from 'node:crypto';
const fail=message=>{throw Object.assign(new Error(message),{status:400});};
const round=n=>Math.round(n*100)/100;
export function budgetTotals(entries){
 const totals={income:0,expenses:0,savings:0};
 for(const e of entries)totals[e.type==='Income'?'income':e.isSavings?'savings':'expenses']+=e.amount/e.intervalMonths;
 totals.available=totals.income-totals.expenses-totals.savings;
 return Object.fromEntries(Object.entries(totals).map(([k,v])=>[k,round(v)]));
}
export function proposeBudget(context,args,requestId){
 const plan=args.budgetId?context.budgets?.plans?.find(p=>p.id===args.budgetId):null;
 if(args.budgetId&&!plan)fail('Choose a budget in this workspace.');
 if(!args.name?.trim()||args.name.length>120)fail('Provide a budget name.');
 if(!/^[A-Z]{3}$/.test(args.currency)||plan&&plan.currency!==args.currency)fail('Use the budget currency.');
 if(!Array.isArray(args.entries)||(args.entries.length<1&&(!plan||plan.name===args.name.trim()))||args.entries.length>30)fail('Propose between 1 and 30 entries at a time.');
 const entries=structuredClone(plan?.entries||[]),changes=[],seen=new Set();
 for(const draft of args.entries){
  if(!draft.name?.trim()||draft.name.length>120||!Number.isFinite(draft.amount)||draft.amount<0||draft.amount>1e9||![1,3,6,12].includes(draft.intervalMonths)||!['Income','Expense','Savings'].includes(draft.type))fail('A proposed entry is incomplete or invalid.');
  if(draft.id&&seen.has(draft.id))fail('An entry can only be changed once in a proposal.');seen.add(draft.id);
  const index=draft.id?entries.findIndex(e=>e.id===draft.id):-1;
  if(draft.id&&index<0)fail('Choose an existing entry from this budget.');
  if(draft.categoryId&&!context.categories?.some(c=>c.id===draft.categoryId))fail('Choose a category in this workspace.');
  if(draft.savingsAccountId&&!context.accounts?.some(a=>a.id===draft.savingsAccountId&&a.currency===args.currency))fail('Choose a savings account with matching currency.');
  const before=index>=0?structuredClone(entries[index]):null;
  const after={...(before||{}),id:before?.id||randomUUID(),name:draft.name.trim(),type:draft.type==='Income'?'Income':'Expense',isSavings:draft.type==='Savings',amount:round(draft.amount),intervalMonths:draft.intervalMonths,categoryId:draft.categoryId,savingsAccountId:draft.type==='Savings'?draft.savingsAccountId:null,source:before?.source||'Manual',historyFrom:before?.historyFrom||null,historyTo:before?.historyTo||null};
  if(index>=0)entries[index]=after;else entries.push(after);
  changes.push({before,after});
 }
 if(entries.length>200)fail('The budget entry limit would be exceeded.');
 return {id:randomUUID(),requestId,kind:'budget',status:'pending',name:args.name.trim(),previousName:plan?.name,currency:args.currency,changes,before:budgetTotals(plan?.entries||[]),after:budgetTotals(entries),createdAt:new Date().toISOString(),payload:{id:plan?.id||randomUUID(),name:args.name.trim(),currency:args.currency,entries,requestId:randomUUID(),version:plan?.version||null}};
}
export function proposalView(p){return {id:p.id,kind:p.kind,status:p.status,name:p.name,previousName:p.previousName,currency:p.currency,changes:p.changes,before:p.before,after:p.after,createdAt:p.createdAt,result:p.result,review:p.review,resource:p.resource,operation:p.operation,displayValues:p.displayValues,order:p.order,...(p.kind==='saxo'?{ticketId:p.payload.ticketId}:{})};}
export function proposeReview(context,args,requestId){
 const item=context.reviewQueue?.items?.find(x=>x.key===args.itemKey);
 if(!item)fail('Read the current Review queue and choose one of its items first.');
 const category=context.categories?.find(c=>c.id===args.categoryId);
 if(item.kind==='Category'&&!category)fail('Choose a category in this workspace.');
 if(!['Category','Transfer'].includes(item.kind))fail('This Review item is unsupported.');
 if(args.ruleContains&&(item.kind!=='Category'||args.ruleContains.length>200||!item.transaction.description.toLowerCase().includes(args.ruleContains.trim().toLowerCase())))fail('A proposed rule must match the selected transaction description.');
 return {id:randomUUID(),requestId,kind:'review',status:'pending',name:item.kind==='Transfer'?'Confirm internal transfer':'Categorize transaction',currency:item.transaction.currency,createdAt:new Date().toISOString(),review:{item,categoryName:category?.name||null,ruleContains:args.ruleContains||null},payload:{kind:item.kind==='Transfer'?'ConfirmTransfer':'Categorize',items:[{key:item.key,signature:item.signature}],categoryId:item.kind==='Category'?args.categoryId:null,ruleContains:args.ruleContains?.trim()||null}};
}
