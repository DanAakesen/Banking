import assert from 'node:assert/strict';
import test from 'node:test';
import {investmentSummary,investmentOrderState,investmentSnapshot,investmentHoldingView,investmentCostLines,investmentActivityKind,investmentSettlementMarkup} from '../../src/Banking.Api/wwwroot/wealth-ui.js';
const p={currency:'EUR',reliability:'Ok',cash:900,totalValue:1000,accounts:[{currency:'EUR',reliability:'Ok',invested:100}],positions:[{baseCurrency:'EUR',reliability:'Ok',profitLossInBaseCurrency:12}],hasMore:false};
test('portfolio figures reconcile in the explicit base currency',()=>{const m=investmentSummary(p);assert.equal(m.total,1000);assert.equal(m.cash,900);assert.equal(m.invested,100);assert.equal(m.pnl,12);assert.deepEqual(m.allocation,{cash:90,invested:10});});
test('pending orders cannot become holdings or unrealised returns',()=>{const m=investmentSummary({...p,cash:1000,accounts:[{currency:'EUR',reliability:'Ok',invested:0}],positions:[],orders:[{quantity:5,price:199}]});assert.equal(m.invested,0);assert.equal(m.pnl,null);assert.deepEqual(m.allocation,{cash:100,invested:0});});
test('missing, unreliable or mixed-currency amounts never become confirmed zero or summed totals',()=>{assert.equal(investmentSummary(null).total,null);assert.equal(investmentSummary({...p,cash:null}).cash,null);assert.equal(investmentSummary({...p,reliability:'Incomplete'}).total,null);assert.equal(investmentSummary({...p,accounts:[{currency:'USD',reliability:'Ok',invested:100}]}).invested,null);assert.equal(investmentSummary({...p,positions:[{profitLossInBaseCurrency:12,reliability:'Ok'}]}).pnl,null);assert.equal(investmentSummary({...p,positions:[{baseCurrency:'EUR',profitLossInBaseCurrency:null,reliability:'Ok'}]}).pnl,null);});
test('incomplete positions cannot produce portfolio P&L and unbooked differences cannot produce allocation',()=>{assert.equal(investmentSummary({...p,hasMore:true}).pnl,null);assert.equal(investmentSummary({...p,totalValue:1100}).allocation,null);});
test('broker lifecycle distinguishes working, partial fills, terminal states and unknown',()=>{assert.equal(investmentOrderState({status:'Working'}),'working');assert.equal(investmentOrderState({status:'Working',quantity:5,filledQuantity:2}),'partial');assert.equal(investmentOrderState({status:'Filled',quantity:5,filledQuantity:5}),'filled');assert.equal(investmentOrderState({status:'Rejected'}),'rejected');assert.equal(investmentOrderState({status:'Cancelled'}),'cancelled');assert.equal(investmentOrderState({status:'Expired'}),'cancelled');assert.equal(investmentOrderState({status:'Unfilled'}),'unknown');assert.equal(investmentOrderState({}),'unknown');});
test('research links use exact known listings and reject invalid or guessed mappings',async()=>{const {investmentResearchSymbol}=await import('../../src/Banking.Api/wwwroot/wealth-ui.js');assert.equal(investmentResearchSymbol({symbol:'SIE:xetr'}),'SIE.DE');assert.equal(investmentResearchSymbol({symbol:'GMAB:xcse'}),'GMAB.CO');assert.equal(investmentResearchSymbol({symbol:'SIE:other'}),null);assert.equal(investmentResearchSymbol({researchSymbol:'javascript:alert(1)'}),null);assert.equal(investmentResearchSymbol({researchSymbol:'MSFT'}),'MSFT');});

test('360 keeps SIM separate, uses broker currency, and never treats pending orders as holdings',async()=>{
 const {saxo360Model}=await import('../../src/Banking.Api/wwwroot/overview.js');
 const m=saxo360Model({environment:'SIM',simulation:true,status:'Ok',portfolio:{...p,cash:1000,positions:[],accounts:[{currency:'EUR',reliability:'Ok',invested:0}]},orders:[{quantity:5,price:199}],ordersHasMore:false});
 assert.equal(m.personalWealthContribution,0);assert.equal(m.currency,'EUR');assert.equal(m.total,1000);assert.equal(m.invested,0);assert.equal(m.holdings,0);assert.equal(m.orders,1);
});
test('360 rejects non-SIM payloads and preserves missing or partial data',async()=>{
 const {saxo360Model}=await import('../../src/Banking.Api/wwwroot/overview.js');
 assert.equal(saxo360Model({environment:'LIVE',portfolio:p}).total,null);
 assert.equal(saxo360Model(null).holdings,null);assert.equal(saxo360Model(null).orders,null);
 const m=saxo360Model({environment:'SIM',simulation:true,status:'Partial',portfolio:p,orders:null,ordersError:'UNAVAILABLE'});
 assert.equal(m.total,1000);assert.equal(m.orders,null);assert.equal(m.partial,true);
});

test('missing cash cannot become a zero-percent allocation',()=>{
 assert.equal(investmentSummary({...p,cash:null,totalValue:100}).allocation,null);
 assert.equal(investmentSummary({...p,currency:null,accounts:[{currency:null,reliability:'Ok',invested:100}]}).allocation,null);
});

test('combined snapshot keeps holdings, open orders and audit activity separate',()=>{
 const order={orderId:'test',status:'Working',quantity:5},event={orderId:'test',status:'Placed'};
 const m=investmentSnapshot({environment:'SIM',simulation:true,portfolio:p,orders:[order],activity:[event],ordersObservedAt:'2026-09-27T22:00:00Z',ordersHasMore:true});
 assert.equal(m.portfolio,p);assert.deepEqual(m.orders.orders,[order]);assert.deepEqual(m.orders.history,[event]);assert.equal(m.orders.hasMore,true);
});
test('combined snapshot preserves partial failures and rejects LIVE',()=>{
 const m=investmentSnapshot({environment:'SIM',simulation:true,portfolio:p,portfolioError:'FAILED',orders:[],activity:null,activityError:'AUDIT_UNAVAILABLE'});
 assert.equal(m.portfolio,null);assert.deepEqual(m.orders.orders,[]);assert.equal(m.orders.history,null);assert.equal(m.orders.historyError,'AUDIT_UNAVAILABLE');
 assert.throws(()=>investmentSnapshot({environment:'LIVE',simulation:false,portfolio:p}));
});

test('actual filled SIM snapshot reconciles through pending settlement without changing booked cash',()=>{
 const m=investmentSummary({...p,cash:999973.83,totalValue:999952.11,accounts:[{currency:'EUR',reliability:'Ok',invested:683.16,unbooked:-704.88}]});
 assert.equal(m.cash,999973.83);assert.equal(m.unbooked,-704.88);assert.equal(m.cashAfterSettlement,999268.95);assert.equal(m.reconciled,true);
 assert.ok(Math.abs(m.allocation.cash+m.allocation.invested-100)<1e-9);
 assert.equal(m.allocation.invested,683.16/999952.11*100);
 const html=investmentSettlementMarkup(m,{L:en=>en,money:(n,c)=>`${n.toFixed(2)} ${c}`});
 assert.match(html,/-704.88 EUR/);assert.match(html,/999268.95 EUR/);assert.match(html,/not the amount available to trade/);
});
test('settlement signs, missing components, mixed currencies and unreconciled totals stay explicit',()=>{
 const m=investmentSummary({...p,cash:850,accounts:[{currency:'EUR',reliability:'Ok',invested:100,unbooked:50}]});
 assert.equal(m.cashAfterSettlement,900);assert.deepEqual(m.allocation,{cash:90,invested:10});
 for(const account of [{currency:'EUR',reliability:'Ok',invested:100,unbooked:null},{currency:'USD',reliability:'Ok',invested:100,unbooked:50},{currency:'EUR',reliability:'Incomplete',invested:100,unbooked:50}]){
  const missing=investmentSummary({...p,cash:850,accounts:[account]});assert.equal(missing.unbooked,null);assert.equal(missing.allocation,null);
 }
 assert.equal(investmentSummary({...p,accounts:[{currency:'EUR',reliability:'Ok',invested:100,unbooked:-50}]}).allocation,null);
 assert.equal(investmentSummary({...p,cash:20,totalValue:100,accounts:[{currency:'EUR',reliability:'Ok',invested:100,unbooked:-20}]}).allocation.cash,0);
});
test('unavailable SIM valuations cannot turn confirmed holdings into worthless positions',()=>{
 const holding={quantity:2,price:0,priceType:'None',marketValueInBaseCurrency:0,profitLossInBaseCurrency:-2.5,reliability:'ApproximatedPrice',openPrice:277.95};
 assert.deepEqual(investmentHoldingView(holding),{price:null,marketValue:null,pnl:null,reliable:false});assert.equal(holding.openPrice,277.95);
 assert.equal(investmentHoldingView({...holding,reliability:'Ok'}).price,null);
 assert.deepEqual(investmentHoldingView({...holding,price:280,priceType:'Bid',marketValueInBaseCurrency:560,profitLossInBaseCurrency:0,reliability:'Ok'}),{price:280,marketValue:560,pnl:0,reliable:true});
 assert.equal(investmentHoldingView(null).marketValue,null);
});
test('structured charges preserve known zero, native/base currency and unknown components',()=>{
 assert.deepEqual(investmentCostLines({currency:'DKK',baseCurrency:'EUR',openCosts:{commission:29},openCostsInBaseCurrency:{commission:3.88,exchangeFee:null}}),[{key:'commission',value:3.88,currency:'EUR'}]);
 assert.deepEqual(investmentCostLines({currency:'DKK',openCosts:{commission:29,exchangeFee:0}}),[{key:'commission',value:29,currency:'DKK'},{key:'exchangeFee',value:0,currency:'DKK'}]);
 assert.deepEqual(investmentCostLines({openCosts:{commission:29}}),[]);assert.deepEqual(investmentCostLines({}),[]);
});
test('confirmed full and partial fills are distinct from accepted or requested events',()=>{
 assert.equal(investmentActivityKind({status:'FinalFill',subStatus:'Confirmed',quantity:2,filled:2}),'filled');
 assert.equal(investmentActivityKind({status:'PartialFill',subStatus:'Confirmed',quantity:5,filled:2}),'partial');
 for(const event of [{status:'Placed',subStatus:'Confirmed',quantity:2,filled:2},{status:'FinalFill',subStatus:'Requested',quantity:2,filled:2},{status:'FinalFill',subStatus:'Confirmed',quantity:2,filled:null},{status:'FinalFill',subStatus:'Confirmed',quantity:2,filled:1}])assert.equal(investmentActivityKind(event),'event');
});
test('360 reconciles settlements with the same model and contributes no SIM wealth',async()=>{
 const {saxo360Model}=await import('../../src/Banking.Api/wwwroot/overview.js');
 const m=saxo360Model({environment:'SIM',simulation:true,status:'Ok',portfolio:{...p,cash:950,accounts:[{currency:'EUR',reliability:'Ok',invested:100,unbooked:-50}]},orders:[]});
 assert.equal(m.cashAfterSettlement,900);assert.equal(m.personalWealthContribution,0);assert.deepEqual(m.allocation,{cash:90,invested:10});
});

 test('LIVE reads must match the explicitly selected environment and stay outside personal totals',async()=>{
  const {saxo360Model}=await import('../../src/Banking.Api/wwwroot/overview.js');
  const live={environment:'LIVE',simulation:false,status:'Ok',portfolio:p,orders:[]};
  assert.throws(()=>investmentSnapshot(live));assert.equal(investmentSnapshot(live,'LIVE').portfolio,p);
  assert.throws(()=>investmentSnapshot({...live,simulation:true},'LIVE'));
  assert.equal(saxo360Model(live,'LIVE').total,1000);assert.equal(saxo360Model(live,'LIVE').personalWealthContribution,0);
  assert.equal(saxo360Model(live,'SIM').total,null);
 });
 test('quantity and price formatting retain tiny fractions and instrument precision',async()=>{
  const {investmentQuantity,investmentPrice}=await import('../../src/Banking.Api/wwwroot/wealth-ui.js');
  assert.equal(investmentQuantity('-0.000000000123'),'-0.000000000123');
  assert.equal(investmentQuantity(0),'0');assert.equal(investmentQuantity(null),'—');
  assert.equal(investmentPrice(1.23456789,'USD',8),'1.23456789 USD');
  assert.equal(investmentPrice(null,'USD',2),'—');
 });

// Portfolio canvas (28 September 2026).
const canvas=await import('../../src/Banking.Api/wwwroot/wealth-ui.js');
const lot=(over={})=>({netPositionId:'261__Share',positionId:'A',accountId:'1',instrument:261,assetType:'Stock',currency:'USD',baseCurrency:'EUR',quantity:2,quantityText:'2.0',openPrice:400,price:505,priceType:'Bid',reliability:'Ok',marketValueInBaseCurrency:888.8,marketValueOpenInBaseCurrency:-704,profitLossInBaseCurrency:184.8,openedAt:'2026-05-04T10:00:00Z',openCostsInBaseCurrency:{commission:0.88},...over});
test('lots of one instrument become one holding with weighted open price and complete totals only',()=>{
 const [h]=canvas.investmentHoldings([lot(),lot({positionId:'B',quantity:1,quantityText:'1.0',openPrice:450,marketValueInBaseCurrency:444.4,marketValueOpenInBaseCurrency:-396,profitLossInBaseCurrency:48.4,openedAt:'2026-07-15T10:00:00Z'})]);
 assert.equal(h.quantity,3);assert.ok(Math.abs(h.openPrice-1250/3)<1e-9);assert.ok(Math.abs(h.marketValue-1333.2)<1e-9);assert.equal(h.cost,1100);assert.ok(Math.abs(h.pnl-233.2)<1e-9);
 assert.equal(h.lots.length,2);assert.equal(h.openedAt,'2026-05-04T10:00:00Z');assert.deepEqual(h.costs.map(c=>[c.key,c.currency,+c.value.toFixed(2)]),[['commission','EUR',1.76]]);
 const [partial]=canvas.investmentHoldings([lot(),lot({positionId:'B',reliability:'ApproximatedPrice',priceType:'None',price:0,marketValueInBaseCurrency:0,openCostsInBaseCurrency:{}})]);
 assert.equal(partial.marketValue,null);assert.equal(partial.pnl,null);assert.equal(partial.price,null);assert.equal(partial.reliable,false);assert.equal(partial.cost,1408);assert.deepEqual(partial.costs,[]);
});
test('tile sizes use one consistent basis and the squarified layout fills the map exactly',()=>{
 assert.equal(canvas.investmentTileBasis([{marketValue:5,cost:4},{marketValue:2,cost:1}]),'market');
 assert.equal(canvas.investmentTileBasis([{marketValue:null,cost:4},{marketValue:2,cost:1}]),'cost');
 assert.equal(canvas.investmentTileBasis([{marketValue:null,cost:null}]),'equal');assert.equal(canvas.investmentTileBasis([]),'equal');
 const rects=canvas.investmentTreemap([{v:6},{v:6},{v:4},{v:3},{v:2},{v:2},{v:1}],600,400);
 assert.equal(rects.length,7);assert.ok(Math.abs(rects.reduce((s,r)=>s+r.w*r.h,0)-240000)<1e-6);
 for(const r of rects){assert.ok(r.x>=-1e-9&&r.y>=-1e-9&&r.x+r.w<=600+1e-6&&r.y+r.h<=400+1e-6);assert.ok(Math.abs(r.w*r.h/240000-r.item.v/24)<1e-9);}
 assert.deepEqual(canvas.investmentTreemap([{v:0},{v:-1}],600,400),[]);assert.deepEqual(canvas.investmentTreemap([{v:1}],0,400),[]);
});
test('market data is accepted only from Saxo LIVE, with clean ascending bars',()=>{
 assert.equal(canvas.investmentMarketData({source:'Yahoo Finance',price:10,bars:[{time:1,close:10}]}),null);assert.equal(canvas.investmentMarketData(null),null);
 const m=canvas.investmentMarketData({source:'Saxo LIVE',currency:'USD',price:0,previousClose:null,bars:[{time:3,close:12},{time:1,close:10},{time:1,close:11},{time:2,close:0},{time:4,close:null}]});
 assert.deepEqual(m.bars.map(b=>b.time),[1,3]);assert.equal(m.price,null);assert.equal(m.previousClose,null);assert.equal(canvas.investmentDayChange(m),null);
 assert.ok(Math.abs(canvas.investmentDayChange({price:101,previousClose:100})-1)<1e-9);
});
test('tile change is since purchase unless a paired LIVE quote has a previous close; unreliable values stay unknown',()=>{
 const h={pnl:50,cost:1000,reliable:true,price:262.5,openPrice:250,quantity:4};
 assert.equal(canvas.investmentHoldingChange(h,'purchase'),5);assert.equal(canvas.investmentHoldingChange(h,'today',null),null);
 assert.ok(Math.abs(canvas.investmentHoldingChange(h,'today',{dayChange:-1})+1)<1e-9);assert.equal(canvas.investmentHoldingChange(h,'today',{price:99,previousClose:100}),null);
 assert.ok(Math.abs(canvas.investmentHoldingChange({...h,pnl:null},'purchase')-5)<1e-9);
 assert.equal(canvas.investmentHoldingChange({pnl:null,cost:1000,reliable:false,price:null,openPrice:250},'purchase'),null);
});
test('allocation splits holdings only when cash and holding values reconcile',()=>{
 const pos=(o)=>lot({positionId:o.id,netPositionId:o.id,instrument:o.uic,assetType:o.type,currency:o.currency,marketValueInBaseCurrency:o.value,reliability:o.reliability||'Ok'});
 const book=(positions,invested,extra={})=>({currency:'EUR',reliability:'Ok',cash:10000,totalValue:10000+invested,hasMore:false,accounts:[{currency:'EUR',reliability:'Ok',invested,unbooked:0}],positions,...extra});
 const mixed=book([pos({id:'a',uic:1,type:'Stock',currency:'USD',value:1333.2}),pos({id:'b',uic:2,type:'Etf',currency:'EUR',value:2000})],3333.2);
 const type=canvas.investmentAllocation(mixed,'type');
 assert.deepEqual(type.parts.map(p=>[p.key,+p.share.toFixed(2)]),[['cash',75],['etfs',15],['stocks',10]]);assert.equal(type.total,13333.2);
 assert.deepEqual(canvas.investmentAllocation(mixed,'currency').parts.map(p=>p.key),['cash','EUR','USD']);
 assert.equal(canvas.investmentAllocation({...mixed,totalValue:14000},'type').reason,'unreconciled');
 assert.equal(canvas.investmentAllocation({...mixed,hasMore:true},'type').reason,'incomplete');
 assert.equal(canvas.investmentAllocation(book([pos({id:'a',uic:1,type:'Stock',currency:'USD',value:1333.2}),pos({id:'b',uic:2,type:'Etf',currency:'EUR',value:1500})],3333.2),'type').reason,'positions');
 const unvalued=book([pos({id:'a',uic:1,type:'Stock',currency:'USD',value:0,reliability:'ApproximatedPrice'}),pos({id:'b',uic:2,type:'Stock',currency:'DKK',value:0,reliability:'ApproximatedPrice'})],3333.2);
 assert.deepEqual(canvas.investmentAllocation(unvalued,'type').parts.map(p=>[p.key,p.value]),[['cash',10000],['stocks',3333.2]]);
 assert.equal(canvas.investmentAllocation(unvalued,'currency').reason,'valuation');
 assert.deepEqual(canvas.investmentAllocation(book([],0),'type').parts.map(p=>[p.key,p.share]),[['cash',100]]);
});
test('observed 28 September SIM snapshot: approximated valuations size tiles by purchase value and keep the reconciled cash split',()=>{
 const approx=(id,uic,currency,qty,open,mvOpen)=>({positionId:id,netPositionId:uic+'__Share',accountId:'22741575',instrument:uic,assetType:'Stock',currency,baseCurrency:'EUR',quantity:qty,openPrice:open,price:0,priceType:'None',marketValueInBaseCurrency:0,marketValueOpenInBaseCurrency:mvOpen,profitLossInBaseCurrency:2.9,reliability:'ApproximatedPrice'});
 const portfolio={currency:'EUR',reliability:'Ok',cash:999973.83,totalValue:999949.6,hasMore:false,accounts:[{currency:'EUR',reliability:'Ok',invested:1447.77,unbooked:-1472,available:998501.83}],
  positions:[approx('1',261,'USD',1,505.57,-445.01),approx('2',14400824,'DKK',1,2280,-305.01),approx('3',117646,'EUR',2,277.95,-555.9),approx('4',15611,'DKK',5,199,-133.11)]};
 const holdings=canvas.investmentHoldings(portfolio.positions);
 assert.equal(canvas.investmentTileBasis(holdings),'cost');assert.ok(holdings.every(h=>h.marketValue===null&&h.pnl===null&&canvas.investmentHoldingChange(h)===null));
 const split=canvas.investmentAllocation(portfolio,'type');assert.deepEqual(split.parts.map(p=>[p.key,p.value]),[['cash',998501.83],['stocks',1447.77]]);
 assert.equal(canvas.investmentAllocation(portfolio,'currency').reason,'valuation');assert.equal(investmentSummary(portfolio).available,998501.83);
});
test('working orders use categorical steps and report partial fills without estimates',()=>{
 const working=canvas.investmentOrderSteps({status:'Working',quantity:3,filledQuantity:0,placedAt:'2026-09-28T09:31:00Z'});
 assert.deepEqual(working.steps.map(s=>[s.key,s.status]),[['placed','done'],['working','current'],['filled','todo']]);assert.equal(working.steps[0].time,'2026-09-28T09:31:00Z');
 const partial=canvas.investmentOrderSteps({status:'Working',quantity:10,filledQuantity:4},'2026-09-28T10:00:00Z');
 assert.equal(partial.steps[1].key,'partial');assert.equal(partial.filled,4);assert.equal(partial.steps[0].time,'2026-09-28T10:00:00Z');
 assert.equal(canvas.investmentOrderSteps({status:'Rejected'}).steps[1].key,'rejected');assert.equal(canvas.investmentOrderSteps({status:'Working'}).filled,null);
 assert.deepEqual(canvas.investmentOrderSteps({status:'Filled',quantity:2,filledQuantity:2}).steps.map(s=>s.status),['done','done','done']);
});
test('order entry is SIM-only and limited to stocks',()=>{
 assert.equal(canvas.investmentTradeAccess('SIM',{assetType:'Stock',instrument:261}),'sim');
 assert.equal(canvas.investmentTradeAccess('LIVE',{assetType:'Stock',instrument:261}),'live');
 assert.equal(canvas.investmentTradeAccess('SIM',{assetType:'Etf',instrument:900}),'unsupported');
 assert.equal(canvas.investmentTradeAccess('SIM',{assetType:'Stock'}),'unsupported');
 assert.equal(investmentSummary({...p,accounts:[{currency:'EUR',reliability:'Ok',invested:100}]}).available,null);
});

// Saxo LIVE research quotes for SIM holdings (new /api/markets/chart contract, 28 September 2026).
const simLot=o=>({positionId:o.id,netPositionId:o.id+'__Share',accountId:'1',instrument:o.uic,assetType:o.type||'Stock',symbol:o.symbol,currency:o.currency,baseCurrency:'EUR',quantity:o.qty,quantityText:String(o.qty),openPrice:o.open,price:0,priceType:'None',reliability:'ApproximatedPrice',marketValueInBaseCurrency:0,marketValueOpenInBaseCurrency:o.mvOpen,profitLossInBaseCurrency:2.9});
const liveQuote=o=>({source:'Saxo LIVE',symbol:o.symbol,currency:o.currency,assetType:'assetType' in o?o.assetType:'Stock',range:'1d',price:o.price,previousClose:o.prev??null,quoteTime:'2026-09-28T15:00:00Z',quoteDelayMinutes:'delay' in o?o.delay:15,chartDelayMinutes:15,
 historyStatus:o.history??'available',quoteStatus:o.quote??'available',bars:o.bars??[{time:100,open:1,high:1,low:1,close:o.price||1},{time:200,open:1,high:1,low:1,close:o.price||1}],retrievedAt:'2026-09-28T15:01:00Z',historyRetrievedAt:'2026-09-28T15:01:00Z',diagnostics:o.diagnostics??null,stale:false});
const simHoldings=()=>canvas.investmentHoldings([simLot({id:'m',uic:261,symbol:'MSFT:xnas',currency:'USD',qty:1,open:505.57,mvOpen:-445.01}),simLot({id:'s',uic:117646,symbol:'SIE:xetr',currency:'EUR',qty:2,open:277.95,mvOpen:-555.9})]);
test('unreliable SIM holdings are estimated from paired Saxo LIVE quotes in the instrument currency only',()=>{
 const quotes={'MSFT:xnas':liveQuote({symbol:'msft:XNAS',currency:'USD',price:516.17,prev:510}),'SIE:xetr':liveQuote({symbol:'SIE:xetr',currency:'EUR',price:280,prev:282})};
 const lv=canvas.investmentLiveView(simHoldings(),h=>quotes[h.symbol]);
 const [msft,sie]=['MSFT:xnas','SIE:xetr'].map(s=>lv.items.find(x=>x.symbol===s));
 assert.equal(msft.pair.paired,true);assert.equal(msft.valuation.source,'estimate');assert.equal(msft.valuation.price,516.17);assert.equal(msft.valuation.valueCurrency,'USD');
 assert.equal(msft.valuation.marketValue,516.17);assert.ok(Math.abs(msft.valuation.pnl-10.6)<1e-9);assert.equal(msft.valuation.baseValue,null);assert.equal(msft.valuation.basePnl,null);
 assert.ok(Math.abs(msft.valuation.dayChange-(516.17/510-1)*100)<1e-9);assert.ok(Math.abs(canvas.investmentHoldingChange(msft,'purchase',msft.valuation)-(516.17/505.57-1)*100)<1e-9);
 assert.equal(sie.valuation.marketValue,560);assert.ok(Math.abs(sie.valuation.pnl-4.1)<1e-9);assert.equal(sie.valuation.baseValue,560);assert.equal(sie.valuation.quote.quoteDelayMinutes,15);
 // No FX source: a USD estimate cannot enter EUR totals, weights or value-based tile sizes.
 assert.equal(lv.sizeTotal,null);assert.equal(lv.basis,'cost');
 // The holdings themselves and the broker account summary are never rewritten.
 assert.equal(msft.marketValue,null);assert.equal(msft.pnl,null);assert.equal(investmentSummary({...p,positions:[simLot({id:'m',uic:261,symbol:'MSFT:xnas',currency:'USD',qty:1,open:505.57,mvOpen:-445.01})]}).pnl,null);
 const euro=canvas.investmentLiveView(simHoldings().filter(h=>h.currency==='EUR'),h=>quotes[h.symbol]);assert.equal(euro.sizeTotal,560);assert.equal(euro.basis,'market');assert.equal(euro.estimated,true);
});
test('LIVE quotes pair only with the same listing, asset type and verified currency and an available price',()=>{
 const [msft]=simHoldings(),pair=o=>canvas.investmentQuotePair(msft,liveQuote({symbol:'MSFT:xnas',currency:'USD',price:516.17,...o}));
 assert.equal(pair({symbol:'MSFT:xnys'}).reason,'symbol');assert.equal(pair({symbol:'MSFT'}).reason,'symbol');
 assert.equal(pair({currency:'EUR'}).reason,'currency');assert.equal(pair({currency:'Unknown'}).reason,'currency');assert.equal(pair({currency:null}).reason,'currency');
 assert.equal(pair({assetType:'Etf'}).reason,'assetType');assert.equal(pair({assetType:null}).paired,true);
 assert.equal(pair({quote:'stale'}).reason,'stale');assert.equal(pair({quote:'mismatch'}).reason,'mismatch');assert.equal(pair({quote:'denied'}).reason,'denied');assert.equal(pair({price:0}).reason,'unavailable');
 assert.equal(canvas.investmentQuotePair(msft,{...liveQuote({symbol:'MSFT:xnas',currency:'USD',price:516}),source:'Yahoo Finance'}).reason,'missing');
 for(const reason of ['symbol','currency','assetType','stale'])assert.equal(canvas.investmentValuation(msft,{paired:false,reason}).source,'unknown');
});
test('without a paired LIVE quote an unreliable valuation stays unknown, and broker values stay broker values',()=>{
 const lv=canvas.investmentLiveView(simHoldings(),()=>null);
 for(const x of lv.items){assert.deepEqual([x.valuation.source,x.valuation.price,x.valuation.marketValue,x.valuation.pnl,x.valuation.dayChange],['unknown',null,null,null,null]);assert.equal(canvas.investmentHoldingChange(x,'purchase',x.valuation),null);}
 assert.equal(lv.sizeTotal,null);assert.equal(lv.basis,'cost');assert.equal(lv.estimated,false);
 const [broker]=canvas.investmentHoldings([lot({symbol:'MSFT:xnas'})]);
 const v=canvas.investmentValuation(broker,canvas.investmentQuotePair(broker,liveQuote({symbol:'MSFT:xnas',currency:'USD',price:600,prev:500})));
 assert.equal(v.source,'broker');assert.equal(v.price,505);assert.equal(v.marketValue,888.8);assert.equal(v.valueCurrency,'EUR');assert.ok(Math.abs(v.dayChange-20)<1e-9);
});
test('history and quote parts are independent; denied or unavailable parts carry no prices',()=>{
 const historyDenied=canvas.investmentMarketData(liveQuote({symbol:'SIE:xetr',currency:'EUR',price:280,prev:282,history:'denied',bars:[{time:1,open:1,high:1,low:1,close:1}],diagnostics:[{operation:'history',code:'SAXO_MARKET_DATA_NO_ACCESS',status:403,providerCode:'NoAccess',message:'secret'}]}));
 assert.deepEqual([historyDenied.historyStatus,historyDenied.bars.length,historyDenied.quoteStatus,historyDenied.price],['denied',0,'available',280]);
 assert.deepEqual(historyDenied.diagnostics,[{operation:'history',code:'SAXO_MARKET_DATA_NO_ACCESS',status:403,providerCode:'NoAccess',cooldown:false}]);
 assert.equal(canvas.investmentQuotePair(simHoldings()[1],historyDenied).paired,true);
 const quoteDenied=canvas.investmentMarketData(liveQuote({symbol:'SIE:xetr',currency:'EUR',price:280,prev:282,quote:'denied'}));
 assert.deepEqual([quoteDenied.historyStatus,quoteDenied.bars.length,quoteDenied.quoteStatus,quoteDenied.price,quoteDenied.previousClose,quoteDenied.quoteTime],['available',2,'denied',null,null,null]);
 assert.equal(canvas.investmentQuotePair(simHoldings()[1],quoteDenied).reason,'denied');
 const neither=canvas.investmentMarketData(liveQuote({symbol:'SIE:xetr',currency:'EUR',price:null,history:'unavailable',quote:'unavailable'}));
 assert.deepEqual([neither.historyStatus,neither.bars.length,neither.quoteStatus,neither.price],['unavailable',0,'unavailable',null]);
 const stale=canvas.investmentMarketData({...liveQuote({symbol:'SIE:xetr',currency:'EUR',price:280,history:'stale',quote:'stale'}),stale:true});
 assert.equal(stale.stale,true);assert.equal(stale.bars.length,2);assert.equal(canvas.investmentQuotePair(simHoldings()[1],stale).reason,'stale');
 assert.equal(canvas.investmentMarketData(liveQuote({symbol:'X',currency:'EUR',price:1,delay:0})).quoteDelayMinutes,0);
 assert.equal(canvas.investmentMarketData(liveQuote({symbol:'X',currency:'EUR',price:1,delay:null})).quoteDelayMinutes,null);
 assert.equal(canvas.investmentMarketData({...liveQuote({symbol:'X',currency:'EUR',price:1}),diagnostics:[{operation:'quote',code:'x y',providerCode:'NoAccess'},{operation:'quote',code:'SAXO_MARKET_DATA_NO_ACCESS',providerCode:'No Access: denied'}]}).diagnostics[0].providerCode,null);
});
test('builds without part statuses are inferred from bars and price, with unknown delays',()=>{
 const old=canvas.investmentMarketData({source:'Saxo LIVE',symbol:'MSFT:xnas',currency:'USD',price:516,previousClose:510,retrievedAt:'2026-09-28T15:01:00Z',quoteTime:'2026-09-28T15:00:00Z',delay:'15 min',bars:[{time:1,close:500},{time:2,close:516}]});
 assert.deepEqual([old.historyStatus,old.quoteStatus,old.historyRetrievedAt,old.quoteDelayMinutes,old.chartDelayMinutes,old.assetType,old.diagnostics.length],['available','available','2026-09-28T15:01:00Z',null,null,null,0]);
 assert.equal(canvas.investmentQuotePair(simHoldings()[0],old).paired,true);
 const empty=canvas.investmentMarketData({source:'Saxo LIVE',symbol:'MSFT:xnas',currency:'USD',price:null,bars:[]});
 assert.deepEqual([empty.historyStatus,empty.quoteStatus,empty.historyRetrievedAt],['unavailable','unavailable',null]);
 assert.equal(canvas.investmentMarketData({source:'Saxo LIVE',price:0,bars:[]}).quoteStatus,'unavailable');
});
test('thrown market-data errors keep their kind and Saxo evidence; only global kinds stop every read',()=>{
 const denied=canvas.investmentMarketIssue({status:502,code:'SAXO_MARKET_DATA_NO_ACCESS',details:{source:'Saxo LIVE',diagnostics:[{operation:'history',code:'SAXO_MARKET_DATA_NO_ACCESS',status:403,providerCode:'NoAccess'},{operation:'quote',code:'SAXO_MARKET_DATA_NO_ACCESS',status:200,providerCode:'NoAccess',cooldown:true}]}});
 assert.deepEqual([denied.kind,denied.global,denied.diagnostics.map(d=>d.providerCode)],['denied',false,['NoAccess','NoAccess']]);
 assert.deepEqual(canvas.investmentMarketIssue({status:502,code:'SAXO_MARKET_DATA_NO_ACCESS'}).diagnostics,[]);
 for(const [code,kind,global] of [['SAXO_MARKET_SIGN_IN_REQUIRED','signin',true],['SAXO_LIVE_OWNER_REQUIRED','owner',true],['SAXO_LIVE_READ_DISABLED','disabled',true],['SAXO_RATE_LIMITED','busy',true],['SAXO_MARKET_DEPLOYMENT_REQUIRED','release',true],
  ['SAXO_MARKET_DATA_UNAVAILABLE','transient',false],['SAXO_MARKET_REQUEST_REJECTED','rejected',false],['SAXO_MARKET_DATA_MISMATCH','mismatch',false],['SAXO_MARKET_LISTING_REQUIRED','listing',false],[undefined,'transient',false]]){
  const issue=canvas.investmentMarketIssue({code});assert.equal(issue.kind,kind,code);assert.equal(issue.global,global,code);
 }
});
