import {pathToFileURL} from 'node:url';
import path from 'node:path';
const assetRoot=process.env.BANKING_ASSET_ROOT;
const assetModule=name=>assetRoot?pathToFileURL(path.join(assetRoot,name)):new URL('../../src/Banking.Api/wwwroot/'+name,import.meta.url);
const {wealthPeriodSeries,pensionPeriod}=await import(assetModule('overview.js'));
import {randomUUID} from 'node:crypto';
import {verifySaxoOrder} from './saxo-tools.mjs';
import {bankingRequest} from './banking-context.mjs';
const {budgetForecast}=await import(assetModule('budget-ui.js'));
const fail=message=>{throw Object.assign(new Error(message),{status:400});};
const guid=id=>{if(!/^[a-f0-9-]{36}$/i.test(id||''))fail('Choose an existing record ID.');return id;};
export const resources=['saxo','saxo_orders','saxo_instruments','saxo_ticket','saxo_order_status','market_search','market_chart','balance_history','transaction_detail','wealth_history','budget_forecast','upcoming','cash_flow','trends','goals','loans','wealth','watchlist','categories','rules','review_history','accounts'];
export const editable={
 accounts:['customName'],
 goals:['name','description','target','currency','scope','accountId','deadline','notes','references','planStart','startingBalance','monthlyContribution','contributionDay'],
 loans:['name','principal','annualRate','months','balanceDate','currency','monthlyFee','upfrontFee','isScenario'],
 wealth:['name','provider','kind','value','currency','asOf','sourceNote','annualPension','retirementAge'],
 watchlist:['name','symbol','notes','url'],categories:['name'],rules:['contains','categoryId','priority','active']
};
const paths={accounts:'accounts',goals:'goals',loans:'loans',wealth:'wealth',watchlist:'research',categories:'categories',rules:'rules'};
export async function readAppData(session,mode,query,context={},request=bankingRequest){
 if(!resources.includes(query.resource))fail('Unsupported data resource.');
 const section={wealth_history:'wealth',budget_forecast:'budget',cash_flow:'cashFlow',trends:'cashFlow',market_chart:'markets',saxo:'markets',saxo_orders:'markets'}[query.resource];
 const p={...(context.screen?.sections?.[section]||{}),...(query.parameters||{})},get=(path)=>request(session,mode,'/api/'+path),from=p.from||context.from,to=p.to||context.to,currency=p.currency||context.currency||'DKK';
 const params=o=>new URLSearchParams(Object.entries(o).filter(([,v])=>v!==null&&v!==undefined)).toString();
 const period=()=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(from||'')||!/^\d{4}-\d{2}-\d{2}$/.test(to||'')||from>to)fail('Choose a valid date range.');return params({from,to,currency,accountId:p.accountId});};
 switch(query.resource){
 case 'saxo':{const environment=p.environment||'SIM';if(!['SIM','LIVE'].includes(environment)||environment==='LIVE'&&mode!=='Live')fail('LIVE Saxo requires the owner workspace.');return request(session,mode,'/api/investments/saxo/preview?environment='+environment,{});}
 case 'saxo_orders':{const environment=p.environment||'SIM';if(!['SIM','LIVE'].includes(environment)||environment==='LIVE'&&mode!=='Live')fail('LIVE Saxo requires the owner workspace.');return get('investments/saxo/orders?environment='+environment);}
 case 'saxo_instruments':if(p.environment&&p.environment!=='SIM')fail('Trading tools support SIM only.');if(typeof p.q!=='string'||!p.q.trim()||p.q.length>80)fail('Provide a Saxo instrument search term.');return get('investments/saxo/instruments?environment=SIM&'+params({q:p.q}));
 case 'saxo_ticket':if(p.environment&&p.environment!=='SIM')fail('Trading tools support SIM only.');if(!Number.isInteger(p.uic)||p.uic<=0)fail('Select a Saxo instrument from search results.');return get('investments/saxo/ticket?environment=SIM&'+params({uic:p.uic}));
 case 'saxo_order_status':if(p.environment&&p.environment!=='SIM')fail('Trading tools support SIM only.');return verifySaxoOrder(session,mode,p.ticketId,request);
 case 'market_search':if(typeof p.q!=='string'||!p.q.trim()||p.q.length>80)fail('Provide a search term up to 80 characters.');return get('markets/search?'+params({q:p.q.trim()}));
 case 'market_chart':{const range=({'1m':'1mo','3m':'3mo','6m':'6mo','1w':'5d'})[p.range]||p.range||'1mo';if(!['1h','1d','5d','1mo','3mo','6mo','ytd','1y','5y'].includes(range))fail('Use market range 1h, 1d, 5d, 1mo, 3mo, 6mo, ytd, 1y or 5y.');
  if(typeof p.symbol!=='string'||! /^[A-Za-z0-9][A-Za-z0-9.:^=_-]{0,23}$/.test(p.symbol))fail('Choose a market listing symbol.');
  const data=await get('markets/chart?'+params({symbol:p.symbol,range}));
  if(data?.source!=='Saxo LIVE')throw Object.assign(new Error('Saxo market data is unavailable. No alternative price source was used.'),{status:503});
  return data;}
 case 'balance_history':return get('accounts/'+guid(p.accountId)+'/balance-history?'+period());
 case 'transaction_detail':return get('transactions/'+guid(p.id));
 case 'wealth_history':{period();const data=await get('wealth/overview?'+params({currency}));const history=data.visuals?.investment?.history||[];const end=(data.records||[]).filter(r=>r.kind==='Pension'&&r.currency===currency).map(r=>r.asOf).sort()[0]?.slice(0,10);const pensionHistory=end?[{date:new Date(Date.parse(end)-180*86400000).toISOString().slice(0,10)},{date:end}]:[];const investment=wealthPeriodSeries(history,from,to);return {...data,selectedPeriod:{from,to,investment,investmentReturnPercent:investment.length>1&&investment[0].value>0?(investment.at(-1).value/investment[0].value-1)*100:null,pension:pensionPeriod(data.visuals?.pension,pensionHistory,from,to)}};}
 case 'budget_forecast':{const id=p.id||context.activeBudget?.plan?.id;if(!id)fail('Choose a budget.');const actual=await get('budget-plans/'+guid(id)+'/progress?'+params({month:p.month}));const flow=await get('cash-flow?'+params({from:actual.from,to:actual.to,currency:actual.currency}));return {actual,forecast:budgetForecast(actual,flow),basis:'Daily spending run rate; estimate, not a scheduled payment forecast.'};}
 case 'upcoming':return get('upcoming-estimates?'+params({from:p.from||new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Copenhagen'}).format(new Date()),days:p.days||30,currency,accountId:p.accountId}));
 case 'cash_flow':return get('cash-flow?'+period());
 case 'trends':return get('trends?'+period());
 case 'review_history':return get('review/history?'+params({offset:p.offset||0}));
 default:return get(paths[query.resource]);
 }
}
export async function proposeAppChange(session,mode,args,requestId,request=bankingRequest){
 const fields=editable[args.resource];if(!fields||!['create','update','delete'].includes(args.operation))fail('Unsupported edit.');
 if(!args.fields||typeof args.fields!=='object'||Array.isArray(args.fields)||Object.keys(args.fields).some(k=>!fields.includes(k)))fail('Unsupported fields in proposal.');
 if(args.resource==='accounts'&&args.operation!=='update')fail('Accounts support display-name updates only.');
 let before=null;
 if(args.operation!=='create'){
  const data=await request(session,mode,'/api/'+paths[args.resource]);
  const rows=Array.isArray(data)?data:data.items||data.goals||data.loans||data.records||[];
  before=rows.find(x=>x.id===guid(args.id));if(!before)fail('Record not found in this workspace.');
  if(!before.version)fail('The record has no concurrency version.');
 }
 const after=args.operation==='delete'?null:Object.fromEntries(fields.filter(k=>Object.hasOwn(args.fields,k)||before&&Object.hasOwn(before,k)).map(k=>[k,Object.hasOwn(args.fields,k)?args.fields[k]:before[k]]));
 const required={accounts:[],goals:['name','description','target','currency','scope','accountId'],loans:['name','principal','annualRate','months','balanceDate'],wealth:['name','provider','kind','value','currency','asOf','sourceNote'],watchlist:['name','symbol','notes'],categories:['name'],rules:['contains','categoryId']};
 if(after&&required[args.resource].some(k=>after[k]===undefined||after[k]===null))fail('Provide all required fields before proposing this record.');
 if(after&&Object.values(after).some(v=>typeof v==='string'&&v.length>10000))fail('A field is too long.');
 const displayValues={};
 for(const [key,path] of [['accountId','accounts'],['categoryId','categories']]){
  if(after&&Object.hasOwn(after,key)&&before?.[key]!==after[key]){
   const rows=await request(session,mode,'/api/'+path);
   const label=id=>id?(rows.find(x=>x.id===id)?.name||id):null;
   displayValues[key]={before:label(before?.[key]),after:label(after[key])};
  }
 }
 return {id:randomUUID(),requestId,kind:'app',status:'pending',name:args.operation+' '+args.resource,resource:args.resource,operation:args.operation,before,after,displayValues,createdAt:new Date().toISOString(),payload:{resource:args.resource,operation:args.operation,id:before?.id||null,version:before?.version||null,fields:after,...(args.resource==='accounts'?{isSavings:before.isSavings}:{})}};
}
export async function applyAppChange(session,mode,p,request=bankingRequest){
 const {resource,operation,id,version,fields}=p;
 if(!editable[resource]||!['create','update','delete'].includes(operation))fail('Unsupported proposal.');
 if(resource==='accounts'){if(operation!=='update')fail('Accounts support display-name updates only.');return request(session,mode,'/api/accounts/'+guid(id)+'/preferences',{customName:fields.customName,isSavings:p.isSavings,version},'PUT');}
 const base='/api/'+paths[resource];
 if(operation==='delete')return request(session,mode,base+'/'+guid(id)+'?'+new URLSearchParams({version}),undefined,'DELETE');
 return request(session,mode,base+(operation==='update'?'/'+guid(id):''),{...fields,...(operation==='update'?{version}:{})},operation==='update'?'PUT':'POST');
}
