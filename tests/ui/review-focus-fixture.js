// Browser-only visual/interaction fixture. Inject through local development CDP.
// All Review requests are intercepted; no records or classifications are persisted.
(async()=>{
 const original=window.fetch.bind(window),headers={'X-Banking-Client':'web','X-Banking-Mode':'Demo'};
 const mode=await(await original('/api/mode',{headers})).json();if(mode.mode!=='Demo')throw Error('Demo only');
 const accounts=await(await original('/api/accounts',{headers})).json();if(accounts.some(a=>!a.isDemo))throw Error('Synthetic accounts only');
 const first=accounts.find(a=>a.name==='Everyday account')||accounts[0],second=accounts.find(a=>a.name==='Savings account')||accounts[1];
 const tx=(id,description,amount,day,accountId=first.id)=>({id,accountId,description,amount,currency:'DKK',bookingDate:'2026-09-'+String(day).padStart(2,'0'),version:'fixture'});
 const cat=(id,text,amount,day)=>({key:id,signature:'fixture',kind:'Category',reason:'MissingCategory',transaction:tx(id,text,amount,day),counterpart:null});
 let items=[cat('f1','Coffee Collective',-49,8),cat('f2','Matas',-219,8),cat('f3','Online purchase',-649,7),cat('f4','Coffee Collective',-49,7),cat('f5','Coffee Collective',-49,5),cat('f6','Coffee Collective',-49,3),...[1800,2500].map((n,i)=>({key:'pair'+i,signature:'fixture',kind:'Transfer',reason:'PossibleInternalTransfer',transaction:tx('out'+i,'Savings transfer',-n,2),counterpart:tx('in'+i,'Contribution from Everyday',n,2,second.id)}))];
 let history=[],writes=[];window.__reviewFixture={writes};
 const response=x=>new Response(JSON.stringify(x),{status:200,headers:{'Content-Type':'application/json','X-Banking-Mode':'Demo'}});
 window.fetch=async(input,options={})=>{
  const u=new URL(typeof input==='string'?input:input.url,location.href);if(u.origin!==location.origin||!u.pathname.startsWith('/api/review'))return original(input,options);
  if(u.pathname==='/api/review'){
   const account=u.searchParams.get('accountId'),kind=u.searchParams.get('kind')||'All',offset=Number(u.searchParams.get('offset')||0),scope=items.filter(x=>!account||x.transaction.accountId===account||x.counterpart?.accountId===account);
   const filtered=scope.filter(x=>kind==='All'||x.kind===kind).sort((a,b)=>(u.searchParams.get('sort')==='oldest'?1:-1)*a.transaction.bookingDate.localeCompare(b.transaction.bookingDate));
   return response({items:filtered.slice(offset,offset+8),total:filtered.length,globalTotal:items.length,counts:{all:scope.length,categories:scope.filter(x=>x.kind==='Category').length,transfers:scope.filter(x=>x.kind==='Transfer').length}});
  }
  if(u.pathname==='/api/review/history')return response({items:history.map(({previous,...h})=>h),total:history.length});
  if(u.pathname==='/api/review/actions'&&options.method==='POST'){
   const body=JSON.parse(options.body);writes.push(body);const selected=items.filter(x=>body.items.some(ref=>ref.key===x.key));if(!selected.length)throw Error('Fixture selection missing');
   history.unshift({id:'h'+history.length,version:'fixture',kind:body.kind,count:selected.length,description:selected[0].transaction.description,createdAt:'2026-09-09T16:00:00Z',undoneAt:null,previous:selected});items=items.filter(x=>!selected.includes(x));return response({});
  }
  if(u.pathname.endsWith('/undo')&&options.method==='POST'){
   const h=history.find(x=>u.pathname.includes('/'+x.id+'/'));items.push(...h.previous);h.undoneAt='2026-09-09T16:01:00Z';return response({});
  }
  throw Error('Unintercepted Review fixture request');
 };
 return {fixtureItems:items.length};
})()
