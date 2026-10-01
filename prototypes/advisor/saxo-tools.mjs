import {randomUUID} from 'node:crypto';
import {bankingRequest} from './banking-context.mjs';
const fail=message=>{throw Object.assign(new Error(message),{status:400});};
const base='/api/investments/saxo/';
export async function prepareSaxoOrder(session,mode,args,requestId,request=bankingRequest){
 const fields=['environment','uic','accountId','side','quantity','limitPrice','currency','duration','stopLoss','takeProfit'];
 if(!args||fields.some(k=>!Object.hasOwn(args,k))||Object.keys(args).some(k=>!fields.includes(k)))fail('Collect the instrument, account, side, share quantity, limit price, currency, duration and explicit stop-loss/take-profit choices first.');
 if(args.environment!=='SIM')fail('Chat orders support Saxo SIM only.');
 if(!Number.isInteger(args.uic)||args.uic<=0||!Number.isInteger(args.quantity)||args.quantity<1||args.quantity>1000||!['Buy','Sell'].includes(args.side)||!Number.isFinite(args.limitPrice)||args.limitPrice<=0||args.limitPrice>1e6||!['DayOrder','GoodTillCancel'].includes(args.duration))fail('Choose a valid limit order and whole-share quantity (1–1000).');
 for(const k of ['stopLoss','takeProfit'])if(args[k]!==null&&(!Number.isFinite(args[k])||args[k]<=0||args[k]>1e6))fail('Use a positive exit price or explicitly choose no exit order.');
 if((args.stopLoss!==null||args.takeProfit!==null)&&args.side!=='Buy')fail('Attached exit orders are available for new buys only.');
 if(args.stopLoss!==null&&args.stopLoss>=args.limitPrice||args.takeProfit!==null&&args.takeProfit<=args.limitPrice)fail('Stop-loss must be below the buy limit; take-profit must be above it.');
 const instrument=await request(session,mode,base+'ticket?environment=SIM&uic='+args.uic);
 const account=instrument.accounts?.find(x=>x.name===args.accountId);
 if(!account||instrument.currency!==args.currency)fail('Verify the Saxo account and instrument currency before review.');
 const {environment,currency,accountId,...details}=args;
 const input={...details,accountKey:account.key};
 const ticket=await request(session,mode,base+'orders/precheck?environment=SIM',input);
 if(ticket.state!=='Reviewed'||ticket.precheck?.PreCheckResult!=='Ok'){
  const errors=[ticket.precheck,...(ticket.precheck?.Orders||[])].flatMap((x,i)=>x?.ErrorInfo?[`${i?'Exit '+i+': ':''}${x.ErrorInfo.ErrorCode||''} ${x.ErrorInfo.Message||''}`.trim()]:[]);
  fail('Saxo rejected the order precheck: '+(errors.join(' · ')||ticket.state||'unavailable'));
 }
 return {id:randomUUID(),requestId,kind:'saxo',status:'pending',name:instrument.name,currency,
  createdAt:new Date().toISOString(),order:{...input,accountKey:undefined,stopOrderType:ticket.input?.stopOrderType,accountName:account.name,accountCurrency:account.currency,symbol:instrument.symbol,environment:'SIM',expiresAt:ticket.expiresAt,precheck:ticket.precheck},payload:{ticketId:ticket.ticketId}};
}
export async function verifySaxoOrder(session,mode,ticketId,request=bankingRequest){
 if(!/^[a-f0-9-]{36}$/i.test(ticketId||''))fail('Choose an existing Saxo order ticket.');
 const receipt=await request(session,mode,base+'orders/'+ticketId+'?environment=SIM');
 const expectedIds=[receipt.orderId,...(receipt.relatedOrderIds||[])].filter(Boolean);
 let snapshot;
 try{snapshot=await request(session,mode,base+'orders?environment=SIM');}
 catch{return {kind:'saxo',receipt,verified:false,status:receipt.state==='Rejected'?'Rejected':'Unconfirmed',message:'Saxo order-status lookup is unavailable. Do not resubmit. Refresh status.'};}
 const reference='Banking-'+ticketId.replaceAll('-','');
 const matches=[...(snapshot.orders||[]),...(snapshot.history||[])].filter(x=>expectedIds.includes(x.orderId)||x.reference===reference);
 const entry=matches.filter(x=>x.orderId===receipt.orderId||!receipt.orderId&&x.reference===reference).sort((a,b)=>(b.time||'').localeCompare(a.time||''))[0];
 return {kind:'saxo',receipt,status:entry?.status||(receipt.state==='Rejected'?'Rejected':receipt.state==='Reviewed'?'NotSubmitted':receipt.orderId?'Accepted':'Unconfirmed'),verified:Boolean(entry),observedAt:snapshot.observedAt,evidence:matches,
  relatedOrdersVerified:(receipt.relatedOrderIds||[]).length===Number(receipt.input?.stopLoss!=null)+Number(receipt.input?.takeProfit!=null)&&expectedIds.slice(1).every(id=>matches.some(x=>x.orderId===id)),historyError:snapshot.historyError,
  message:entry?'Order status checked against Saxo.':receipt.orderId?'Saxo returned an order ID. Follow-up status is not yet visible; execution is not confirmed.':'No confirmed placement. Check status before another order.'};
}
export async function submitSaxoOrder(session,mode,payload,request=bankingRequest){
 // Backend ticket is immutable, scoped, short-lived and consumed before any network write.
 await request(session,mode,base+'orders?environment=SIM',{ticketId:payload.ticketId,confirm:true});
 return verifySaxoOrder(session,mode,payload.ticketId,request);
}
