// Private, stateless workbook preview. Nothing in this module writes wealth or retains a file.
export function upcomingStockEvents(report,cutoff){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(cutoff||''))return [];
 const day=new Date(cutoff+'T00:00:00Z');if(!Number.isFinite(day.getTime())||day.toISOString().slice(0,10)!==cutoff)return [];
 return report.schedules.filter(s=>s.date>=cutoff&&s.shares>s.matchedPastVesting)
  .map(s=>({...s,conditionalShares:s.shares-s.matchedPastVesting})).sort((a,b)=>a.date.localeCompare(b.date));
}
export function stockIllustration(shares,price,rate){
 if(!Number.isFinite(shares)||shares<0||!Number.isFinite(price)||price<=0||price>1000000)return {usd:null,dkk:null};
 const usd=shares*price;if(!Number.isFinite(usd))return {usd:null,dkk:null};
 const converted=usd*rate;return {usd,dkk:Number.isFinite(rate)&&rate>0&&rate<=10000&&Number.isFinite(converted)?converted:null};
}
// A dated holding declaration is independent of the decision to map it into wealth.
export function stockHoldingIllustration(review,price,rate){
 if(review.currentHeldShares===0)return {usd:0,dkk:0};
 return stockIllustration(review.currentHeldShares,price,rate);
}
// Optional research quote. Never reads positions or infers holdings, cost basis or FX.
export function employeeStockQuote(snapshot,now=Date.now()){
 const q=snapshot;if(!q||q.source!=='Saxo LIVE'||!['MSFT','MSFT:xnas'].includes(q.symbol)||q.currency!=='USD'||q.assetType!=='Stock'||q.quoteStatus!=='available'||!Number.isFinite(q.price)||q.price<=0||q.price>1000000)return null;
 const observed=Date.parse(q.quoteTime),retrieved=Date.parse(q.retrievedAt);
 if(!Number.isFinite(now)||!Number.isFinite(observed)||!Number.isFinite(retrieved)||observed>now+60000||retrieved>now+60000||now-observed>7*86400000||now-retrieved>15*60000)return null;
 if(q.quoteDelayMinutes!=null&&(!Number.isFinite(q.quoteDelayMinutes)||q.quoteDelayMinutes<0||q.quoteDelayMinutes>1440))return null;
 return {price:q.price,observedAt:new Date(observed).toISOString(),retrievedAt:new Date(retrieved).toISOString(),delayMinutes:q.quoteDelayMinutes??null};
}
export function mountEmployeeStockPreview(root,{S,e,money,date,today,api}){
 const L=(en,da)=>S.lang==='da'?da:en,seq=S.seq,mode=S.mode,controller=new AbortController();let report=null,request=0,disposeReport=()=>{};
 const current=()=>root.isConnected&&S.seq===seq&&S.mode===mode&&!controller.signal.aborted;
 const number=n=>n==null?'—':new Intl.NumberFormat(S.lang==='da'?'da-DK':'en-GB',{maximumFractionDigits:8}).format(n);

 root.className='employee-stock loan-card';root.innerHTML=`<h2>${L('Microsoft employee shares','Microsoft-medarbejderaktier')}</h2><p>${L('Upcoming vesting is conditional on continued employment. Historical vesting does not establish current holdings.','Kommende modning afhænger af fortsat ansættelse. Tidligere modning dokumenterer ikke den aktuelle beholdning.')}</p>${mode==='Live'&&S.owner?`<label for="employee-stock-file">${L('Preview stock export · .xlsx','Gennemgå aktieeksport · .xlsx')}</label><input id="employee-stock-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"><p>${L('Preview only. This file and its values are not saved. Nothing is added to your wealth.','Kun gennemgang. Filen og dens værdier gemmes ikke. Intet lægges til din formue.')}</p><p id="employee-stock-status" role="status" aria-live="polite"></p><div id="employee-stock-result"></div>`:`<p>${L('Private workbook preview is available in Dan’s workspace. No employee-share imports in Demo yet.','Privat filgennemgang er tilgængelig i Dans arbejdsområde. Der er endnu ingen medarbejderaktier importeret i Demo.')}</p>`}`;
 const input=root.querySelector('#employee-stock-file'),status=root.querySelector('#employee-stock-status'),out=root.querySelector('#employee-stock-result');
 if(input)input.onchange=async()=>{
  const file=input.files?.[0],id=++request;disposeReport();disposeReport=()=>{};report=null;out.replaceChildren();status.textContent='';if(!file)return;
  if(file.size>8*1024*1024||!file.name.toLowerCase().endsWith('.xlsx')){status.textContent=L('Choose an .xlsx file no larger than 8 MiB.','Vælg en .xlsx-fil på højst 8 MiB.');input.value='';return;}
  status.textContent=L('Reading the three source sheets…','Læser de tre kildeark…');input.disabled=true;
  try{const result=await api('employee-stocks/preview',{method:'POST',headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},body:file,signal:controller.signal});if(!current()||id!==request)return;report=result;disposeReport=renderEmployeeStockReport(out,report,{S,e,money,date,today,api});status.textContent=L('Preview ready. No financial values saved.','Gennemgang klar. Ingen finansielle værdier gemt.');}
  catch(err){if(current()&&id===request&&!err.stale&&err.name!=='AbortError')status.textContent=L('The workbook could not be previewed. Check the supported three-sheet export.','Filen kunne ikke gennemgås. Kontrollér eksporten med de tre understøttede ark.')+' '+(/^[A-Z_]{1,80}$/.test(err.code||'')?err.code:'');}
  finally{if(current()&&id===request){input.disabled=false;input.value='';}}
 };

 return ()=>{request++;controller.abort();disposeReport();report=null;root.replaceChildren();};
}

// Calendar bins retain empty months and actual delivery dates. Viewing never changes ownership.
export function stockTimeline(report,cutoff,{period='month',range='12',history=false}={}){
 const future=upcomingStockEvents(report,cutoff).map(s=>({date:s.date,shares:s.conditionalShares,kind:'conditional',grantKey:s.grantKey,source:s.source}));
 const past=history?report.transactions.filter(t=>t.type==='StockAwardVest').map(t=>({date:t.date,shares:t.quantity,kind:'history',grantKey:t.grantKey,source:t.source})):[];
 const events=[...past,...future].sort((a,b)=>a.date.localeCompare(b.date));
 const start=history&&events.length?events[0].date:cutoff;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(start||''))return {period,bins:[],events:[]};
 const month=d=>Number(d.slice(0,4))*12+Number(d.slice(5,7))-1;
 let first=month(start),last=range==='all'?Math.max(first,...events.map(x=>month(x.date))):first+Number(range)-1;
 // Long source histories use years rather than an unreadable/unbounded monthly plot.
 if(period==='month'&&last-first>119)period='year';
 const key=d=>period==='year'?d.slice(0,4):d.slice(0,7),bins=[];
 if(period==='year'){for(let y=Math.floor(first/12);y<=Math.floor(last/12);y++)bins.push({key:String(y),date:y+'-01-01',events:[]});}
 else for(let m=first;m<=last;m++)bins.push({key:Math.floor(m/12)+'-'+String(m%12+1).padStart(2,'0'),date:Math.floor(m/12)+'-'+String(m%12+1).padStart(2,'0')+'-01',events:[]});
 const byKey=new Map(bins.map(b=>[b.key,b]));for(const event of events)if(month(event.date)>=first&&month(event.date)<=last)byKey.get(key(event.date))?.events.push(event);
 return {period,bins:bins.map(b=>({...b,conditional:b.events.filter(x=>x.kind==='conditional').reduce((s,x)=>s+x.shares,0),history:b.events.filter(x=>x.kind==='history').reduce((s,x)=>s+x.shares,0)})),events:bins.flatMap(b=>b.events)};
}

// Actual source vest dates only. A step is flat between events; no daily interpolation or rollforward.
export function stockVestingLine(report,cutoff,price,rate,currency='DKK'){
 const grouped=new Map();for(const row of upcomingStockEvents(report,cutoff))grouped.set(row.date,(grouped.get(row.date)||0)+row.conditionalShares);
 let total=0;return [...grouped].map(([date,shares])=>{total+=shares;const value=stockIllustration(shares,price,rate),cumulative=stockIllustration(total,price,rate);return {date,shares,cumulativeShares:total,value:value[currency==='USD'?'usd':'dkk'],cumulative:cumulative[currency==='USD'?'usd':'dkk']};});
}
// Inclusive viewing windows never create source events or reset cumulative vesting.
export function stockVestingRange(points,base,preset='all',from=base,to=points.at(-1)?.date||base){
 const valid=d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'')&&Number.isFinite(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
 if(!valid(base))return null;
 if(preset!=='custom'){
  from=base;to=points.at(-1)?.date||base;
  const months={'6m':6,'1y':12,'2y':24}[preset];
  if(months){const d=new Date(base+'T00:00:00Z'),last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+months+1,0));to=new Date(Date.UTC(last.getUTCFullYear(),last.getUTCMonth(),Math.min(d.getUTCDate(),last.getUTCDate()))).toISOString().slice(0,10);}
 }
 if(!valid(from)||!valid(to)||from<base||to<from||to>'2200-12-31')return null;
 const visible=points.filter(p=>p.date>=from&&p.date<=to),prior=points.filter(p=>p.date<from).at(-1),end=points.filter(p=>p.date<=to).at(-1);
 return {from,to,points:visible,shares:visible.reduce((s,p)=>s+p.shares,0),value:visible.some(p=>p.value==null)?null:visible.reduce((s,p)=>s+p.value,0),baseline:prior?prior.cumulative:0,cumulative:end?end.cumulative:0};
}
export function employeeStockMarket(snapshot,now=Date.now()){
 const stock=snapshot?.stock,quote=employeeStockQuote(stock?.quoteStatus==='stale'?{...stock,quoteStatus:'available'}:stock,now),f=snapshot?.fx;
 if(quote){quote.stale=stock.quoteStatus==='stale';quote.marketState=['Open','Closed','PreMarket','PostMarket'].includes(stock.marketState)?stock.marketState:null;}
 const observed=Date.parse(f?.observedAt),retrieved=Date.parse(f?.retrievedAt);
 const valid=f?.source==='Saxo LIVE'&&['available','stale'].includes(f?.status)&&f?.baseCurrency==='USD'&&f?.quoteCurrency==='DKK'&&f?.basis==='provider-mid'
  &&Number.isFinite(f.dkkPerUsd)&&f.dkkPerUsd>0&&f.dkkPerUsd<=10000&&Number.isFinite(retrieved)
  &&(Number.isFinite(observed)&&observed<=now+60000&&now-observed<=7*86400000||f.observedAt==null&&f.sourceTimeStatus==='not-reported'&&['Tradable','Indicative','OldIndicative'].includes(f.quoteQuality))
  &&retrieved<=now+60000&&now-retrieved<=15*60000
  &&(f.delayMinutes==null||(Number.isFinite(f.delayMinutes)&&f.delayMinutes>=0&&f.delayMinutes<=1440));
 return {price:quote?.price??null,rate:valid?f.dkkPerUsd:null,quote,fx:valid?f:null};
}
// One read-only valuation per minute per workspace/client; point/currency changes never fetch.
const marketReads=new WeakMap();
export function readEmployeeStockMarket(api,mode,now=Date.now(),context=null){
 let states=marketReads.get(api);if(!states){states=new Map();marketReads.set(api,states);}const saved=states.get(mode);
 if(saved&&saved.context===context&&now-saved.at<60000)return saved.promise;
 const entry={at:now,context,promise:null};entry.promise=Promise.resolve().then(()=>api('markets/employee-shares')).catch(err=>{if((err.stale||err.name==='AbortError')&&states.get(mode)===entry)states.delete(mode);throw err;});states.set(mode,entry);return entry.promise;
}

// Shared dashboard for private and independently synthetic retained reports.
export function renderEmployeeStockReport(out,report,{S,e,money,date,today,api},initial={}){
 const seq=S.seq,mode=S.mode,L=(en,da)=>S.lang==='da'?da:en,locale=S.lang==='da'?'da-DK':'en-GB';
 const number=n=>n==null?'—':new Intl.NumberFormat(locale,{maximumFractionDigits:8}).format(n);
 const sum=key=>report.grants.reduce((s,g)=>s+g[key],0),source=s=>s.sheet+' · '+L('row','række')+' '+s.row;
 const next=upcomingStockEvents(report,initial.cutoff||today()),first=next[0]?.date,nextQty=next.filter(x=>x.date===first).reduce((s,x)=>s+x.conditionalShares,0);
 const messages={CURRENT_HOLDINGS_NOT_REPORTED:L('Past vesting does not establish current holdings. Use a separate dated holding declaration.','Tidligere modning dokumenterer ikke aktuel beholdning. Brug en separat dateret beholdningserklæring.'),PROFILE_CURRENCY_AND_ISSUER_NOT_REPORTED:L('Microsoft / MSFT and USD are reviewed profile information, not workbook fields.','Microsoft / MSFT og USD er gennemgåede profiloplysninger, ikke felter i filen.'),REPORT_DATE_NOT_REPORTED:initial.reportAsOf?L('Source report date: not reported. This snapshot uses a separately owner-confirmed date.','Kildens rapportdato: ikke oplyst. Dette øjebliksbillede bruger en separat ejerbekræftet dato.'):L('Source report date: not reported. No confirmed report date saved.','Kildens rapportdato: ikke oplyst. Ingen bekræftet rapportdato gemt.'),TAX_OBSERVATIONS_NOT_TAX_SETTLEMENT:L('Reported taxes do not establish settled tax liability.','Rapporterede skatter dokumenterer ikke afregnet skattepligt.')};
 function table(headers,rows,moneyColumn=-1,unit='USD'){const columns=Array.isArray(moneyColumn)?moneyColumn:[moneyColumn];return `<div class="stock-table-wrap" role="region" tabindex="0" aria-label="${e(headers.join(' · '))}"><table class="stock-table"><thead><tr>${headers.map(h=>`<th scope="col">${e(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map((v,i)=>`<td>${columns.includes(i)?money(Number.isFinite(v)?v:null,unit):v==null||v===''?'—':e(v)}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${headers.length}">${L('No source rows reported','Ingen kilderækker oplyst')}</td></tr>`}</tbody></table></div>`;}
 out.innerHTML=`<div class="stock-facts"><div><small>${L('Held now','Ejet nu')}</small><strong id="stock-held-value">—</strong><small>${L('Declared','Erklæret')} ${date(initial.holdingAsOf)}</small></div><div><small>${L('Unvested · conditional','Umodnet · betinget')}</small><strong id="stock-unvested-value">—</strong><small>${L('Latest available price','Senest tilgængelige kurs')}</small></div><div><small>${L('Next vesting','Næste modning')}</small><strong id="stock-next-value">—</strong><small>${first?date(first):L('No upcoming source event','Ingen kommende kildehændelse')}</small></div></div>
 <div class="stock-chart-head"><h3>${L('Vesting over time','Modning over tid')}</h3><div class="stock-segments" role="group" aria-label="${L('Currency','Valuta')}"><button type="button" data-stock-currency="DKK" aria-pressed="true">DKK</button><button type="button" data-stock-currency="USD" aria-pressed="false">USD</button></div></div>
 <div class="stock-range-toolbar"><div class="stock-segments stock-periods" role="group" aria-label="${L('Vesting period','Modningsperiode')}">${[['6m','6M'],['1y','1Y'],['2y','2Y'],['all',L('All','Alle')],['custom',L('Custom','Vælg')]].map(([id,label])=>`<button type="button" data-stock-period="${id}" aria-pressed="${id==='all'}">${label}</button>`).join('')}</div><span id="stock-range-label"></span></div>
 <form id="stock-custom-range" class="stock-custom-range" hidden><label>${L('From','Fra')}<input id="stock-range-from" type="date" min="${e(initial.cutoff||today())}" max="2200-12-31" required></label><label>${L('To','Til')}<input id="stock-range-to" type="date" min="${e(initial.cutoff||today())}" max="2200-12-31" required></label><button type="submit">${L('Apply range','Anvend periode')}</button><p id="stock-range-error" role="alert"></p></form>
 <p id="stock-market-status" class="stock-market-status" role="status">${L('Loading current price and USD/DKK…','Henter aktuel kurs og USD/DKK…')}</p>
 <div id="stock-chart"></div>
 <div class="stock-brush" aria-label="${L('Select a vesting date range','Vælg en periode for modning')}"><svg id="stock-brush-preview" viewBox="0 0 1000 42" preserveAspectRatio="none" aria-hidden="true"></svg><input id="stock-brush-from" type="range" min="0" step="1" aria-label="${L('Range start','Periodestart')}"><input id="stock-brush-to" type="range" min="0" step="1" aria-label="${L('Range end','Periodeslut')}"></div>
 <p id="stock-value-note" class="stock-conditional-note">${L('At latest price · before tax','Ved seneste kurs · før skat')}</p>
 <div id="stock-report-secondary" hidden><h3>${L('Vesting schedule','Modningsplan')}</h3><p>${L('Indicative money at the viewed price · before tax','Indikative beløb ved den viste kurs · før skat')}</p><div id="stock-schedule-data"></div>
 <details id="stock-valuation"><summary>${L('Price & currency','Kurs og valuta')}</summary><p class="stock-report-date">${initial.reportAsOf?L('Saved report','Gemt rapport')+' · '+date(initial.reportAsOf):L('Report date awaiting review','Rapportdato afventer gennemgang')}</p><p>${L('Future awards are conditional on continued employment and excluded from owned wealth. Current holdings come from a separate approved declaration, never past vesting.','Fremtidige aktier afhænger af fortsat ansættelse og medregnes ikke i ejet formue. Aktuel beholdning kommer fra en særskilt godkendt erklæring, aldrig fra tidligere modning.')}</p><p>${L('Indicative gross value at a dated price. Future prices and net proceeds are unknown.','Indikativ bruttoværdi ved en dateret kurs. Fremtidige kurser og nettoprovenu er ukendt.')}</p><div class="stock-profile"><label>${L('Price · USD/share','Kurs · USD/aktie')}<input id="stock-price" type="number" min="0.000001" max="1000000" step="any" placeholder="—"></label><label>${L('Price date','Kursdato')}<input id="stock-observed" type="date" min="1900-01-01" max="${e(today())}"></label><label>${L('Price source','Kurskilde')}<input id="stock-price-source" maxlength="120" placeholder="—"></label><label>${L('DKK per 1 USD','DKK pr. 1 USD')}<input id="stock-rate" type="number" min="0.000001" max="10000" step="any" placeholder="—"></label><label>${L('FX date','Valutadato')}<input id="stock-fx-observed" type="date" min="1900-01-01" max="${e(today())}"></label><label>${L('FX source','Valutakilde')}<input id="stock-fx-source" maxlength="120" placeholder="—"></label></div><label>${initial.historicalCutoff?L('Historical from (view cutoff)','Historisk fra (visningsdato)'):L('Upcoming from (view cutoff)','Kommende fra (visningsdato)')}<input id="stock-cutoff" type="date" min="1900-01-01" max="2200-12-31" value="${e(initial.cutoff||today())}"></label></details>
 <details id="stock-past"><summary>${L('Past vesting and source grants','Tidligere modning og tildelinger')}</summary><p>${L('Vested history is not held now. Gross deliveries, tax withholding and net delivery are separate. Total Transacted is not a sale.','Modningshistorik er ikke ejet nu. Bruttolevering, skattetræk og nettolevering er adskilt. Total Transacted er ikke et salg.')}</p>${table([L('Source','Kilde'),L('Date / grant','Dato / tildeling'),L('Gross / net shares','Brutto- / nettoaktier'),L('Historical FMV · USD/profile','Historisk markedsværdi · USD/profil')],report.transactions.map(t=>[source(t.source),date(t.date)+' · '+(report.grants.findIndex(g=>g.key===t.grantKey)+1),number(t.quantity)+' / '+number(t.netShares),t.historicalFairMarketValue]),3)}${table([L('Grant / source','Tildeling / kilde'),L('Source dates','Kildedatoer'),L('Awarded / past vested / unvested','Tildelt / tidligere modnet / umodnet'),L('Grant price · not current quote','Tildelingskurs · ikke aktuel kurs')],report.grants.map((g,i)=>[(i+1)+' · '+g.type+' · '+source(g.source),date(g.awardDate),[g.awarded,g.vested,g.unvested].map(number).join(' / '),g.grantPrice]),3)}</details>
 <details id="stock-warnings"><summary>${L('Source & review notes','Kilde og gennemgang')} (${report.warnings.length})</summary><p>${L('Source report date: not reported.','Kildens rapportdato: ikke oplyst.')} ${initial.reportAsOf?L('Owner-confirmed report date','Ejerbekræftet rapportdato')+': '+date(initial.reportAsOf):L('Date awaiting review','Dato afventer gennemgang')}</p><ul>${report.warnings.map(w=>`<li>${e(messages[w.code]||L('Reconciliation needs review','Afstemning kræver gennemgang'))}${w.source?' · '+e(source(w.source)):''}</li>`).join('')}</ul>${next.reduce((s,x)=>s+x.conditionalShares,0)!==sum('unvested')?`<p>${L('Upcoming schedule and source unvested differ. Review the report date and unmatched deliveries; no clock-based rollforward.','Kommende plan og kildens umodnede afviger. Gennemgå rapportdato og uafstemte leveringer; ingen fremførsel efter kalenderen.')}</p>`:''}<p>${L('Parser','Parser')}: ${e(report.parserVersion)}</p></details></div>`;
 for(const [id,value] of Object.entries({'stock-price':initial.priceUsd,'stock-rate':initial.dkkPerUsd,'stock-observed':initial.priceAsOf,'stock-price-source':initial.priceSource,'stock-fx-observed':initial.fxAsOf,'stock-fx-source':initial.fxSource}))if(value!=null)out.querySelector('#'+id).value=value;
 let currency='DKK',selectedDate=null,disposed=false,lastWidth=0,resizeFrame=0,timer=null,loading=false,manual=false,preset='all',rangeFrom=initial.cutoff||today(),rangeTo=null,tooltipOpen=false,tooltipInput=null,rangeEditing=false;
 const secondary=out.querySelector('#stock-report-secondary');
 let market={price:null,rate:null,quote:null,fx:null};
 let marketPending=Boolean(api&&!initial.historicalCutoff);
 const waitingForMarket=()=>!manual&&marketPending&&!market.quote&&!market.fx;
 const current=()=>!disposed&&out.isConnected&&S.seq===seq&&S.mode===mode;
 const field=id=>out.querySelector('#stock-'+id)||secondary.querySelector('#stock-'+id);
 const timestamp=value=>new Intl.DateTimeFormat(locale,{year:'numeric',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',second:'2-digit',timeZone:'Europe/Copenhagen',timeZoneName:'short'}).format(new Date(value));
 function status(){
  if(manual){field('market-status').title='';field('market-status').textContent=L('Saved / edited illustration · not a live quote','Gemt / redigeret illustration · ikke en aktuel kurs');return;}
  if(waitingForMarket()){field('market-status').title='';field('market-status').textContent=L('Loading current price and USD/DKK…','Henter aktuel kurs og USD/DKK…');return;}
  const q=market.quote,f=market.fx,delay=n=>n==null?L('delay unknown','ukendt forsinkelse'):n>0?n+' '+L('min delayed','min forsinket'):'';
  field('market-status').title=[q&&'Saxo LIVE · MSFT '+timestamp(q.observedAt)+' · '+L('retrieved','hentet')+' '+timestamp(q.retrievedAt)+' · '+(q.delayMinutes??L('unknown','ukendt'))+' min',f&&'Saxo LIVE · USD/DKK '+(f.observedAt?timestamp(f.observedAt):L('source time unknown','kildetid ukendt'))+' · '+L('retrieved','hentet')+' '+timestamp(f.retrievedAt)+' · '+(f.delayMinutes??L('unknown','ukendt'))+' min',initial.reportAsOf&&L('Report','Rapport')+' '+date(initial.reportAsOf)].filter(Boolean).join(' / ');
  const stockText=q?'MSFT '+number(q.price)+' USD'+(delay(q.delayMinutes)?' · '+delay(q.delayMinutes):''):L('MSFT price unavailable','MSFT-kurs utilgængelig');
  const fxText=f?'USD/DKK '+number(f.dkkPerUsd)+(f.observedAt?'':' · '+L('source time unknown','kildetid ukendt'))+(delay(f.delayMinutes)?' · '+delay(f.delayMinutes):''):L('USD/DKK unavailable','USD/DKK utilgængelig');
  field('market-status').textContent=stockText+' / '+fxText+(q?.marketState==='Closed'||f?.marketState==='Closed'?' · '+L('market closed','marked lukket'):'')+(q?.stale||f?.status==='stale'?' · '+L('update failed · last known','opdatering fejlede · senest kendte'):'');

 }
 out.querySelectorAll('[data-stock-currency]').forEach(button=>button.onclick=()=>{currency=button.dataset.stockCurrency;out.querySelectorAll('[data-stock-currency]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));draw();});
 out.querySelectorAll('#stock-valuation .stock-profile input').forEach(el=>el.addEventListener('input',()=>{manual=true;draw();}));
 field('cutoff').oninput=()=>{rangeFrom=field('cutoff').value;preset='all';draw();};
 out.querySelectorAll('[data-stock-period]').forEach(b=>b.onclick=()=>{preset=b.dataset.stockPeriod;rangeEditing=false;field('range-error').textContent='';field('custom-range').hidden=preset!=='custom';draw();});
 for(const event of ['input','change'])field('custom-range').addEventListener?.(event,ev=>{rangeEditing=true;ev.stopPropagation();});
 field('custom-range').onsubmit=ev=>{ev.preventDefault();ev.stopPropagation();if(!field('custom-range').reportValidity())return;const points=stockVestingLine(report,field('cutoff').value,1,1),range=stockVestingRange(points,field('cutoff').value,'custom',field('range-from').value,field('range-to').value);field('range-error').textContent=range?'':L('Choose an end date on or after the start date.','Vælg en slutdato på eller efter startdatoen.');if(range){preset='custom';rangeEditing=false;rangeFrom=range.from;rangeTo=range.to;draw();}};
 const dayOffset=(a,b)=>Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000),shiftDay=(day,n)=>new Date(Date.parse(day+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
 for(const side of ['from','to'])field('brush-'+side).oninput=()=>{const base=field('cutoff').value,n=field('brush-'+side).valueAsNumber;preset='custom';rangeEditing=false;field('custom-range').hidden=false;if(side==='from'){rangeFrom=shiftDay(base,n);if(rangeFrom>rangeTo)rangeTo=rangeFrom;}else{rangeTo=shiftDay(base,n);if(rangeTo<rangeFrom)rangeFrom=rangeTo;}draw();};
 function hideTooltip(){tooltipOpen=false;tooltipInput=null;const tip=field('point');if(tip){tip.hidden=true;if(tip.matches?.(':popover-open'))tip.hidePopover();}}
 function dismissTooltip(ev){if(ev.key==='Escape'&&tooltipOpen&&current()){ev.preventDefault();ev.stopPropagation();hideTooltip();}}
 function positionTooltip(){
  if(!tooltipOpen||!current())return;const tip=field('point'),dot=out.querySelector('[data-stock-point="'+selectedDate+'"] .stock-point-dot');if(!dot)return hideTooltip();
  const anchor=dot.getBoundingClientRect();if(anchor.bottom<0||anchor.top>innerHeight||anchor.right<0||anchor.left>innerWidth)return hideTooltip();
  tip.hidden=false;if(tip.showPopover&&!tip.matches(':popover-open'))tip.showPopover();
  const box=tip.getBoundingClientRect(),x=Math.max(12,Math.min(innerWidth-box.width-12,anchor.x+anchor.width/2-box.width/2)),above=anchor.top-box.height-14;
  tip.style.left=x+'px';tip.style.top=Math.max(12,Math.min(innerHeight-box.height-12,above>=12?above:anchor.bottom+14))+'px';
 }
 function draw(){
  if(disposed)return;const chart=field('chart'),cutoff=field('cutoff');lastWidth=chart.clientWidth;
  const focused=chart.querySelector('[data-stock-point]:focus')?.dataset?.stockPoint;
  const valid=(value,day,src)=>value.validity.valid&&day.value&&day.validity.valid&&src.value.trim().length>0&&src.validity.valid;
  const price=manual?(valid(field('price'),field('observed'),field('price-source'))?field('price').valueAsNumber:null):market.price;
  const rate=manual?(valid(field('rate'),field('fx-observed'),field('fx-source'))?field('rate').valueAsNumber:null):market.rate;
  const val=qty=>stockIllustration(qty,price,rate)[currency==='USD'?'usd':'dkk'];
  field('value-note').textContent=manual?L('Illustration · before tax','Illustration · før skat'):L('At latest price · before tax','Ved seneste kurs · før skat');
  field('held-value').innerHTML=money(stockHoldingIllustration(initial,price,rate)[currency==='USD'?'usd':'dkk'],currency);
  field('unvested-value').innerHTML=money(val(sum('unvested')),currency);field('next-value').innerHTML=money(first?val(nextQty):null,currency);status();
  const allPoints=stockVestingLine(report,cutoff.value,price,rate,currency),range=stockVestingRange(allPoints,cutoff.value,preset,rangeFrom,rangeTo||allPoints.at(-1)?.date||cutoff.value);
  if(!cutoff.value||!cutoff.validity.valid||!range){hideTooltip();chart.innerHTML='<p role="alert">'+L('Choose a valid date range.','Vælg en gyldig periode.')+'</p>';return;}
  rangeFrom=range.from;rangeTo=range.to;field('range-from').min=cutoff.value;field('range-to').min=cutoff.value;if(!rangeEditing){field('range-from').value=range.from;field('range-to').value=range.to;}const applyRange=field('custom-range').querySelector?.('[type=submit]');if(applyRange)applyRange.disabled=false;
  out.querySelectorAll('[data-stock-period]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.stockPeriod===preset)));
  field('range-label').textContent=date(range.from)+' – '+date(range.to);
  const points=range.points,known=val(1)!=null,W=Math.max(300,Math.min(1080,chart.clientWidth||900)),H=W<500?290:300,left=W<500?48:64,right=20,top=20,bottom=38,plotH=H-top-bottom;
  const start=Date.parse(range.from+'T00:00:00Z'),end=Date.parse(range.to+'T00:00:00Z'),x=day=>left+(Date.parse(day+'T00:00:00Z')-start)/Math.max(86400000,end-start)*(W-left-right);
  const max=Math.max(1,range.cumulative??0),y=value=>top+plotH*(1-value/max);
  let line='M '+left+' '+y(range.baseline??0);for(const p of points)line+=' H '+x(p.date)+' V '+y(p.cumulative??0);line+=' H '+(W-right);
  const area=line+' L '+(W-right)+' '+y(0)+' L '+left+' '+y(0)+' Z';
  const ticks=[...new Set([range.from,...Array.from({length:W<500?3:5},(_,i)=>new Date(start+(end-start)*(i+1)/(W<500?3:5)).toISOString().slice(0,10))])];
  if(field('point')?.matches?.(':popover-open'))field('point').hidePopover();
  chart.innerHTML=`<div class="stock-range-summary"><div><span>${L('Vesting in this period','Modning i denne periode')}</span><strong id="stock-range-total">${money(range.value,currency)}</strong></div><div class="stock-chart-total"><span>${L('Cumulative by','Samlet frem til')} ${date(range.to)}</span><strong>${money(range.cumulative,currency)}</strong></div></div>${!known?`<div class="stock-money-unavailable" role="status">${waitingForMarket()?L('Loading current price and USD/DKK…','Henter aktuel kurs og USD/DKK…'):currency==='DKK'&&market.price!=null?L('DKK conversion unavailable. View USD.','DKK-omregning utilgængelig. Se USD.'):L('Current price unavailable. Source dates are retained.','Aktuel kurs utilgængelig. Kildedatoerne er bevaret.')}</div>`:''}
  <svg class="stock-timeline stock-money-line" viewBox="0 0 ${W} ${H}" role="group" aria-label="${L('Cumulative conditional vesting value','Samlet betinget modningsværdi')} · ${currency}">${known?[0,.5,1].map(r=>`<line class="stock-grid" x1="${left}" x2="${W-right}" y1="${y(max*r)}" y2="${y(max*r)}"/><text class="stock-axis" x="${left-8}" y="${y(max*r)+4}" text-anchor="end">${e(new Intl.NumberFormat(locale,{notation:'compact',maximumFractionDigits:1}).format(max*r))}</text>`).join('')+`<path class="stock-line-area" d="${area}"/><path class="stock-step-line" d="${line}"/>`:''}${ticks.map(day=>`<text class="stock-axis" x="${x(day)}" y="${H-10}" text-anchor="${day===range.from?'start':day===ticks.at(-1)?'end':'middle'}">${e(new Intl.DateTimeFormat(locale,{month:'short',year:'2-digit',timeZone:'UTC'}).format(new Date(day+'T00:00:00Z')))}</text>`).join('')}${points.map((p,i)=>`<g data-stock-point="${e(p.date)}" class="stock-line-point" role="button" tabindex="${i===0?0:-1}" aria-pressed="false" aria-describedby="stock-point" aria-label="${e(date(p.date)+' · '+number(p.value)+' '+currency+' · '+L('cumulative','samlet')+' '+number(p.cumulative)+' '+currency)}"><circle class="stock-point-hit" cx="${x(p.date)}" cy="${known?y(p.cumulative):y(0)}" r="13"/><circle class="stock-point-dot" cx="${x(p.date)}" cy="${known?y(p.cumulative):y(0)}" r="4"/></g>`).join('')}</svg>
  <div id="stock-point" class="stock-point-tooltip" popover="manual" role="tooltip" hidden></div>${points.length?'':`<p class="stock-range-empty" role="status">${L('No vesting in this period','Ingen modning i denne periode')}</p>`}`;
  field('schedule-data').innerHTML=table([L('Date','Dato'),L('Vests this date','Modner denne dato'),L('Cumulative','Samlet'),L('Shares','Aktier')],allPoints.map(p=>[date(p.date),p.value,p.cumulative,number(p.shares)]),[1,2],currency);
  const horizon=allPoints.at(-1)?.date||cutoff.value,span=Math.max(1,dayOffset(cutoff.value,horizon)),brushX=day=>Math.max(0,Math.min(1000,dayOffset(cutoff.value,day)/span*1000));
  for(const side of ['from','to']){field('brush-'+side).max=span;field('brush-'+side).value=Math.max(0,Math.min(span,dayOffset(cutoff.value,range[side])));field('brush-'+side).setAttribute?.('aria-valuetext',date(range[side]));}
  const mini=known?allPoints.map((p,i)=>(i?' H ':'M ')+brushX(p.date)+(i?' V ':' ')+(36-(p.cumulative??0)/Math.max(1,allPoints.at(-1)?.cumulative??0)*30)).join(''):'';
  field('brush-preview').innerHTML=`<rect class="stock-brush-selection" x="${brushX(range.from)}" y="0" width="${Math.max(0,brushX(range.to)-brushX(range.from))}" height="42"/>${known?`<path class="stock-brush-line" d="${mini}"/>`:''}`;
  const buttons=[...chart.querySelectorAll('[data-stock-point]')];let restoringFocus=false;
  function select(i,focus=false,open=true,input='keyboard'){const p=points[i];if(!p)return;selectedDate=p.date;buttons.forEach((b,j)=>{b.setAttribute('aria-pressed',String(j===i));b.setAttribute('tabindex',j===i?'0':'-1');});field('point').innerHTML=`<strong>${date(p.date)}</strong><div><span>${L('Vests this date','Modner denne dato')}</span><b>${money(p.value,currency)}</b></div><div><span>${L('Cumulative','Samlet')}</span><b>${money(p.cumulative,currency)}</b></div><small>${number(p.shares)} ${L('shares · conditional','aktier · betinget')}</small>`;if(focus)buttons[i]?.focus({preventScroll:true});tooltipOpen=open;tooltipInput=open?input:null;if(open)positionTooltip();}
  buttons.forEach((button,i)=>{button.onclick=ev=>{if(ev.detail===0)select(i);};button.onfocus=()=>{if(!restoringFocus)select(i);};button.onkeydown=ev=>{const n=ev.key==='ArrowRight'?i+1:ev.key==='ArrowLeft'?i-1:ev.key==='Home'?0:ev.key==='End'?points.length-1:null;if(n!==null){ev.preventDefault();select(Math.max(0,Math.min(points.length-1,n)),true);}else if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();select(i);}else if(ev.key==='Escape'){ev.preventDefault();hideTooltip();}};});
  const wasOpen=tooltipOpen,input=tooltipInput;select(Math.max(0,points.findIndex(p=>p.date===selectedDate)),false,wasOpen,input);
  const svg=chart.querySelector('svg');
  // Mouse inspection uses the painted dot; only touch/pen gets the larger marker target.
  function inspectPointer(ev){if(!points.length)return;const c=svg.createSVGPoint();c.x=ev.clientX;c.y=ev.clientY;const local=c.matrixTransform(svg.getScreenCTM().inverse()),touch=ev.pointerType==='touch'||ev.pointerType==='pen'||ev.sourceCapabilities?.firesTouchEvents;let best=null,distance=Infinity;
   buttons.forEach((b,i)=>{const dot=b.querySelector(touch?'.stock-point-hit':'.stock-point-dot'),inside=dot.isPointInFill(local)||(!touch&&dot.isPointInStroke(local));const d=(x(points[i].date)-local.x)**2+((known?y(points[i].cumulative):y(0))-local.y)**2;if(inside&&d<distance){distance=d;best=i;}});
   if(best!==null)select(best,false,true,touch?'touch':'mouse');else if(touch||ev.type==='click'||tooltipInput==='mouse')hideTooltip();
  }
  svg.onclick=ev=>{if(ev.detail!==0)inspectPointer(ev);};svg.onpointermove=ev=>{if(ev.pointerType==='mouse')inspectPointer(ev);};svg.onpointerleave=()=>{if(tooltipInput==='mouse')hideTooltip();};svg.onfocusout=ev=>{if(!svg.contains?.(ev.relatedTarget))hideTooltip();};
  if(!points.length)hideTooltip();if(focused){restoringFocus=true;buttons.find(b=>b.dataset.stockPoint===focused)?.focus({preventScroll:true});restoringFocus=false;}
 }
 async function refresh(){
  clearTimeout(timer);if(!current()||loading)return;if(document.hidden){timer=setTimeout(refresh,60000);return;}loading=true;marketPending=true;draw();
  try{market=employeeStockMarket(await readEmployeeStockMarket(api,mode,Date.now(),seq));}
  catch(err){if(current()&&err.name!=='AbortError')market={price:null,rate:null,quote:null,fx:null};}
  finally{loading=false;marketPending=false;if(current()){draw();timer=setTimeout(refresh,60000);}}
 }
 function visible(){if(!document.hidden)void refresh();}
 globalThis.window?.addEventListener('scroll',positionTooltip,true);globalThis.window?.addEventListener('resize',positionTooltip);globalThis.window?.addEventListener('keydown',dismissTooltip,true);out.addEventListener?.('stock-manage-open',hideTooltip);
 draw();if(api&&!initial.historicalCutoff){document.addEventListener('visibilitychange',visible);void refresh();}else {manual=true;draw();}
 const chart=field('chart'),resize=typeof ResizeObserver==='undefined'?null:new ResizeObserver(()=>{if(!current()||chart.clientWidth===lastWidth||resizeFrame)return;resizeFrame=requestAnimationFrame(()=>{resizeFrame=0;if(current())draw();});});resize?.observe(chart);
 return ()=>{hideTooltip();disposed=true;clearTimeout(timer);globalThis.window?.removeEventListener('scroll',positionTooltip,true);globalThis.window?.removeEventListener('resize',positionTooltip);globalThis.window?.removeEventListener('keydown',dismissTooltip,true);out.removeEventListener?.('stock-manage-open',hideTooltip);document.removeEventListener('visibilitychange',visible);resize?.disconnect();if(resizeFrame)cancelAnimationFrame(resizeFrame);};
}
