import {beginSaxoSignIn,finishSaxoSignIn,saxoEnvironment,rememberSaxoEnvironment,saxoAuthKind,saxoAuthStatus,saxoAuthView,saxoAuthMarkup,saxoAuthApply,saxoFeed,saxoClock,saxoGapNote,saxoLivePoll,SAXO_SHORT_RANGES,SAXO_LIVE_REFRESH_MS} from './saxo-session.js';
import {mountOverviewAdvisor} from './overview-advisor.js';

// A SIM holding may use a Saxo LIVE research quote only for the exact same listing, asset type and currency.
// Estimates stay in the instrument currency: no FX is applied and broker account totals are never replaced.
export function pairLiveQuote(holding,quote){
 const same=(a,b)=>!!a&&!!b&&String(a).toUpperCase()===String(b).toUpperCase(),n=v=>v!=null&&v!==''&&Number.isFinite(+v);
 if(!holding||!quote||quote.source!=='Saxo LIVE'||!same(quote.symbol,holding.saxoSymbol)||!same(quote.currency,holding.currency))return null;
 if(quote.assetType&&holding.assetType&&!same(quote.assetType,holding.assetType))return null;
 const status=quote.quoteStatus||(n(quote.price)?'available':'unavailable'),price=+quote.price;
 if(status!=='available'||!n(quote.price)||price<=0||!quote.quoteTime)return null;
 const qty=n(holding.quantity)?+holding.quantity:null,avg=n(holding.avg)?+holding.avg:null,prev=n(quote.previousClose)&&+quote.previousClose>0?+quote.previousClose:null;
 const pnl=qty!=null&&avg!=null?qty*(price-avg):null;
 return {price,currency:quote.currency,quoteTime:quote.quoteTime,delayMinutes:n(quote.quoteDelayMinutes)?+quote.quoteDelayMinutes:null,
  value:qty!=null?qty*price:null,pnl,pnlPct:pnl!=null&&avg>0?(price/avg-1)*100:null,dayPct:prev!=null?(price/prev-1)*100:null};
}

// Panels without Saxo data say so briefly. The header controls hold each connection's single sign-in action; panels never do.
export function marketsSignedOutMarkup({kind,what},{L,e}) {
 return `<div class="td-empty td-signed-out" role="status"><strong>${e(saxoAuthStatus(kind,L))}</strong><p>${e(what)}</p></div>`;
}
// The status line under the chart. A sign-in failure has no line and no Retry: the chart area states it and the header control holds the action.
export function marketsChartStatusMarkup({text,signin},{L,e}) {
 return signin?'':`<span role="alert">${e(text)}</span> <button type="button" class="td-text-button" id="td-retry-chart">${L('Retry','Prøv igen')}</button>`;
}

// Markets trading desk (approved 28 September 2026). One selected instrument drives the scenic header, the chart,
// key figures and the inline order ticket. Market data is Saxo LIVE only; trading keeps its own SIM/LIVE environment.
export function createMarketsUI({S,e,money,api,post,header,errorText}) {
 const L=(en,da)=>S.lang==='da'?da:en;
 const locale=()=>S.lang==='da'?'da-DK':'en-GB';
 let root,chart,searchTimer,marketTimer,liveTimer,keyHandler,themeObserver,exploreObserver;
 let searchRun=0,chartRun=0,brokerRun=0,quoteRun=0,yearRun=0,ticketRun=0,exploreLoaded=false;
 let rows=[],selected=null,snapshot=null,period='1mo',list='watchlist',dock='positions',chartType='candles',marketBlock=null,chartBlocked=null;
 let environment='SIM',portfolio=null,orders=null,ordersError='',status=null,brokerError='',brokerIssue=null,brokerAuth=null,accountIndex=0;
 let pending=new AbortController(),ticket={side:'Buy',step:'idle'},marketConnecting=false;
 const averages={50:false,200:false},quotes=new Map(),years=new Map(),listings=new Map();
 environment=saxoEnvironment(S.mode);
 const ranges=[['1h','1H'],['1d','1D'],['5d','1W'],['1mo','1M'],['3mo','3M'],['6mo','6M'],['ytd','YTD'],['1y','1Y'],['5y','5Y']];
 const rangeLabel=label=>S.lang==='da'?({'1H':'1T','1W':'1U','YTD':'ÅTD','1Y':'1Å','5Y':'5Å'}[label]||label):label;
 const short=()=>SAXO_SHORT_RANGES.includes(period);
 const live=()=>root?.isConnected&&S.route==='markets';
 // Header controls sit outside root, in the page's scenic header.
 const mk=s=>root?.parentElement?.querySelector(s)||root?.querySelector(s);
 const read=path=>api(path,{signal:pending.signal});
 const fmt=x=>new Intl.DateTimeFormat(locale(),{dateStyle:'medium',timeStyle:'short'}).format(new Date(x));
 const clock=x=>new Intl.DateTimeFormat(locale(),{timeStyle:'short'}).format(new Date(x));
 const finite=n=>n!=null&&n!==''&&Number.isFinite(+n);
 const num=(n,d=2)=>finite(n)?new Intl.NumberFormat(locale(),{minimumFractionDigits:d,maximumFractionDigits:d}).format(n):'—';
 const qty=n=>finite(n)?new Intl.NumberFormat(locale(),{maximumFractionDigits:4}).format(n):'—';
 const compact=n=>finite(n)?new Intl.NumberFormat(locale(),{notation:'compact',maximumFractionDigits:1}).format(n):'—';
 const signed=(n,d=2)=>finite(n)?(n>0?'+':n<0?'−':'')+num(Math.abs(n),d):'—';
 const pct=n=>finite(n)?signed(n)+'%':'—';
 const tone=n=>finite(n)?(n>=0?'td-up':'td-down'):'';
 const signedMoney=(n,c)=>finite(n)?`<span class="money">${e(signed(n))}<span class="money-currency"> ${e(c||'')}</span></span>`:'—';
 const same=(a,b)=>!!a&&!!b&&String(a).toUpperCase()===String(b).toUpperCase();
 const monogram=s=>e(String(s||'').split(/[:.\s]/)[0].slice(0,4).toUpperCase()||'—');
 const clamp=n=>Math.max(0,Math.min(100,n)).toFixed(1);
 const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
 const side=s=>s==='Sell'?L('Sell','Sælg'):L('Buy','Køb');
 const shares=n=>+n===1?L('share','stk.'):L('shares','stk.');
 // Saxo symbols already carry their venue (MSFT:xnas); only add the exchange to unqualified symbols.
 const listing=(symbol,exchange)=>[symbol,symbol&&!String(symbol).includes(':')?exchange:null].filter(Boolean).join(' · ');
 const signinCodes=['SAXO_MARKET_SIGN_IN_REQUIRED','SAXO_SIGN_IN_REQUIRED','SAXO_ACCESS_REQUIRED'];
 const deniedCodes=[...signinCodes,'SAXO_LIVE_OWNER_REQUIRED','SAXO_PRIVATE_ACCESS_REQUIRED','SAXO_MARKET_DATA_NO_ACCESS','SAXO_LIVE_READ_DISABLED'];
 // Entitlement is per listing, so a denied instrument does not stop the other rows; these codes apply to every row.
 const blockingCodes=[...signinCodes,'SAXO_LIVE_OWNER_REQUIRED','SAXO_PRIVATE_ACCESS_REQUIRED','SAXO_LIVE_READ_DISABLED','SAXO_MARKET_DEPLOYMENT_REQUIRED'];
 // Saxo LIVE is the only accepted market-data source; any other response means the API release is missing.
 async function market(symbol,range){const data=await read('markets/chart?symbol='+encodeURIComponent(symbol)+'&range='+range);if(data?.source!=='Saxo LIVE')throw {code:'SAXO_MARKET_DEPLOYMENT_REQUIRED'};return data;}
 // History and quote are independent parts. Older API responses lack the status fields, so infer them conservatively.
 const historyPart=d=>d?.historyStatus||(d?.bars?.length?'available':'unavailable');
 const quotePart=d=>d?.quoteStatus||(finite(d?.price)?'available':d?.warning==='SAXO_MARKET_DATA_NO_ACCESS'?'denied':'unavailable');
 const hasHistory=d=>['available','stale'].includes(historyPart(d))&&d?.bars?.length>0;
 const hasQuote=d=>quotePart(d)==='available'&&finite(d?.price)&&+d.price>0;
 // A 400/404/422 is a request Saxo refused as invalid, not a temporary outage.
 const rejected=(d,operation)=>(d?.diagnostics||[]).some(x=>x.operation===operation&&x.code==='SAXO_MARKET_REQUEST_REJECTED');
 // Evidence for a failure: the operation and Saxo's own code (or HTTP status), never a guessed cause.
 function evidence(diagnostics,operation){
  const items=(diagnostics||[]).filter(d=>!operation||d.operation===operation).map(d=>{const what=d.providerCode||(d.status?'HTTP '+d.status:'');return what?`${d.operation==='history'?L('history','historik'):d.operation==='quote'?L('quote','kurs'):L('search','søgning')}: ${what}${d.cooldown?' · '+L('paused before retry','pause før nyt forsøg'):''}`:'';}).filter(Boolean);
  return items.length?' ('+[...new Set(items)].join('; ')+')':'';
 }

 function dispose(){pending.abort();pending=new AbortController();chartRun++;searchRun++;brokerRun++;quoteRun++;yearRun++;ticketRun++;clearTimeout(searchTimer);clearTimeout(marketTimer);clearTimeout(liveTimer);document.removeEventListener('visibilitychange',onVisibility);chart?.remove();chart=null;themeObserver?.disconnect();exploreObserver?.disconnect();if(keyHandler)document.removeEventListener('keydown',keyHandler);keyHandler=null;root=null;}
 function error(err){const detail=err?.details?.diagnostics?evidence(err.details.diagnostics):'';const messages={SAXO_MARKET_SIGN_IN_REQUIRED:L('Saxo LIVE market data is not signed in.','Saxo LIVE-markedsdata er ikke logget ind.'),SAXO_SIGN_IN_REQUIRED:L('Saxo LIVE market data is not signed in.','Saxo LIVE-markedsdata er ikke logget ind.'),SAXO_MARKET_DATA_NO_ACCESS:L('Saxo denied access to this market data.','Saxo afviste adgang til disse markedsdata.'),SAXO_MARKET_QUOTE_UNAVAILABLE:L('Current quote unavailable.','Aktuel kurs er ikke tilgængelig.'),SAXO_MARKET_HISTORY_NO_ACCESS:L('Saxo denied access to price history for this listing.','Saxo afviste adgang til kurshistorikken for denne notering.'),SAXO_MARKET_HISTORY_UNAVAILABLE:L('Price history is temporarily unavailable.','Kurshistorikken er midlertidigt utilgængelig.'),SAXO_MARKET_HISTORY_STALE:L('Price history could not be refreshed. Showing previously retrieved history.','Kurshistorikken kunne ikke opdateres. Viser tidligere hentet historik.'),SAXO_MARKET_REQUEST_REJECTED:L('Saxo rejected the market-data request.','Saxo afviste forespørgslen på markedsdata.'),SAXO_MARKET_DATA_MISMATCH:L('Saxo returned data for another listing or currency, so it is not shown.','Saxo returnerede data for en anden notering eller valuta, så de vises ikke.'),SAXO_MARKET_LISTING_REQUIRED:L('Select the exact Saxo listing using search.','Vælg den præcise Saxo-notering via søgning.'),SAXO_LIVE_OWNER_REQUIRED:L('Saxo LIVE market data is available in Dan’s private workspace.','Saxo LIVE-markedsdata er tilgængelige i Dans private arbejdsområde.'),SAXO_LIVE_READ_DISABLED:L('Saxo LIVE market-data reads are not enabled.','Læsning af Saxo LIVE-markedsdata er ikke aktiveret.'),SAXO_MARKET_DATA_UNAVAILABLE:L('Saxo market data is temporarily unavailable.','Saxo-markedsdata er midlertidigt utilgængelige.'),SAXO_MARKET_DEPLOYMENT_REQUIRED:L('The Saxo market-data update needs to be deployed to the shared API.','Saxo-markedsdataopdateringen skal udgives til den fælles API.'),SAXO_RATE_LIMITED:L('Saxo’s request limit was reached. Prices refresh again shortly.','Saxos grænse for forespørgsler er nået. Kurserne opdateres igen om lidt.')};if(messages[err?.code])return messages[err.code]+detail;return err?.code==='MARKET_DATA_UNAVAILABLE'?L('Market data is temporarily unavailable. Try again.','Markedsdata er midlertidigt utilgængelige. Prøv igen.'):errorText(err);}

 function headControls(){
  return `<div class="overview-controls td-head-controls"><small id="td-read"></small><div class="controls"><button type="button" id="td-search-open" class="td-search-pill" aria-haspopup="dialog" aria-keyshortcuts="/"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg><span>${L('Search instruments','Søg værdipapirer')}</span><kbd aria-hidden="true">/</kbd></button>${S.mode==='Demo'?'<span class="td-env">Saxo SIM</span>':`<select id="td-environment" aria-label="${L('Saxo trading environment','Saxo-handelsmiljø')}"><option value="SIM">Saxo SIM</option><option value="LIVE">Saxo LIVE · ${L('Read only','Kun læsning')}</option></select>`}<button type="button" id="td-connection" class="td-connection" data-state="checking" disabled aria-describedby="td-broker-message"><span class="td-dot" aria-hidden="true"></span><span id="td-connection-label">${L('Checking…','Kontrollerer…')}</span></button>${saxoAuthMarkup(tradingAuthView('required',false),{group:'td-auth',label:'td-auth-label',action:'td-connect'})}${saxoAuthMarkup(marketAuthView(null),{group:'td-market-auth',label:'td-market-auth-label',action:'td-market-connect'})}</div></div>`;
 }
 function tabs(name,items,active,label){return `<div class="td-tabs" role="tablist" aria-label="${label}">${items.map(([id,text])=>`<button type="button" role="tab" id="td-${name}-${id}" aria-controls="td-${name}" aria-selected="${id===active}" tabindex="${id===active?0:-1}" data-${name}="${id}">${text}<span class="td-count" data-count="${id}"></span></button>`).join('')}</div>`;}
 function layout(){
  return `<div class="markets-workspace td"><section class="td-summary" aria-hidden="true"></section><div class="td-grid">
   <section class="td-panel td-list" aria-label="${L('Instruments','Værdipapirer')}"><div class="td-head">${tabs('list',[['watchlist',L('Watchlist','Observationsliste')],['holdings',L('Holdings','Beholdning')]],list,L('Instrument lists','Lister'))}<button type="button" class="td-icon" id="td-add" aria-label="${L('Add instrument','Tilføj værdipapir')}" title="${L('Add instrument','Tilføj værdipapir')}">+</button></div><p class="td-notice" id="td-list-notice" role="status" hidden></p><div id="td-list" class="td-rows" role="tabpanel" aria-labelledby="td-list-watchlist">${L('Loading watchlist…','Henter observationsliste…')}</div></section>
   <section class="td-panel td-chart" aria-labelledby="td-instrument-name"><div id="td-instrument" class="td-instrument"></div>
    <div class="td-toolbar"><div class="td-pills" role="group" aria-label="${L('Chart period','Grafperiode')}">${ranges.map(([id,label])=>`<button type="button" data-range="${id}" aria-pressed="${id===period}">${rangeLabel(label)}</button>`).join('')}</div><div class="td-pills" role="group" aria-label="${L('Chart type','Graftype')}">${[['candles',L('Candles','Lys')],['line',L('Line','Linje')],['area',L('Area','Areal')]].map(([id,label])=>`<button type="button" data-chart-type="${id}" aria-pressed="${id===chartType}">${label}</button>`).join('')}</div><div class="td-pills" role="group" aria-label="${L('Moving averages','Glidende gennemsnit')}"><button type="button" data-average="50" aria-pressed="false">MA 50</button><button type="button" data-average="200" aria-pressed="false">MA 200</button></div></div>
    <p id="td-source" class="td-source"></p><div id="td-status" class="td-status" role="status"></div>
    <div class="td-chart-box"><div id="td-legend" class="td-legend" aria-hidden="true"></div><div id="td-chart" role="img" aria-label="${L('Price history','Kurshistorik')}"></div><p id="td-chart-note" class="td-chart-note" role="status" hidden></p></div>
    <p id="td-gaps" class="td-source" hidden></p>
    <a class="td-attribution" href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">${L('Charting by TradingView','Grafer fra TradingView')}</a><div id="td-stats" class="td-stats"></div></section>
   <section class="td-panel td-ticket" id="td-ticket" aria-labelledby="td-ticket-title"></section>
   <section class="td-panel td-dock" aria-label="${L('Positions and orders','Positioner og ordrer')}"><div class="td-head">${tabs('dock',[['positions',L('Positions','Positioner')],['orders',L('Working orders','Aktive ordrer')],['activity',L('Activity','Aktivitet')]],dock,L('Portfolio views','Porteføljevisninger'))}<button type="button" class="td-text-button" id="td-refresh">${L('Refresh','Opdatér')}</button></div><div id="td-dock" class="td-table-wrap" role="tabpanel" aria-labelledby="td-dock-positions"></div></section>
   <section class="td-panel td-account" aria-labelledby="td-account-title"><div class="td-head"><h2 id="td-account-title">${L('Saxo account','Saxo-konto')}</h2></div><p id="td-broker-message" class="td-message" role="status" hidden></p><div id="td-account"></div></section>
  </div>
  <div class="td-explore"><section class="td-panel"><div class="td-head"><h2>${L('Explore the market','Udforsk markedet')}</h2><select id="td-universe" aria-label="${L('Heatmap market','Heatmap-marked')}"><option value="SPX500">S&amp;P 500</option><option value="NASDAQ100">Nasdaq 100</option></select></div><div id="td-heatmap" class="td-widget"></div></section><section class="td-panel"><div class="td-head"><h2>${L('Company insights','Selskabsindsigt')}</h2></div><div id="td-fundamentals" class="td-widget"></div></section></div>
  <dialog id="td-search-dialog" class="td-search-dialog" aria-label="${L('Search instruments','Søg værdipapirer')}"><form class="td-search" role="search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg><label class="sr-only" for="td-search">${L('Search stocks and ETFs','Søg aktier og ETF’er')}</label><input id="td-search" autocomplete="off" maxlength="80" placeholder="${L('Search stocks and ETFs by name or symbol','Søg aktier og ETF’er efter navn eller symbol')}" role="combobox" aria-expanded="false" aria-controls="td-results" aria-autocomplete="list"><button type="button" class="td-text-button" data-close-search>${L('Close','Luk')}</button></form><div id="td-results" class="td-results" role="listbox" aria-label="${L('Search results','Søgeresultater')}"></div><p class="td-search-foot">${L('Saxo LIVE instrument search · ↑ ↓ to move · Enter to open','Saxo LIVE-søgning · ↑ ↓ for at flytte · Enter for at åbne')}</p></dialog>
 </div>`;
 }
 async function render(main){
  dispose();environment=saxoEnvironment(S.mode);selected=null;snapshot=null;portfolio=null;orders=null;ordersError='';status=null;brokerError='';brokerIssue=null;brokerAuth=null;marketConnecting=false;rows=[];list='watchlist';dock='positions';marketBlock=null;chartBlocked=null;exploreLoaded=false;quotes.clear();years.clear();ticket={side:'Buy',step:'idle'};
  main.classList.add('markets-main');main.insertAdjacentHTML('beforeend',header('Markets',headControls())+layout());
  root=main.querySelector('.markets-workspace');
  const env=mk('#td-environment');if(env){env.value=environment;env.onchange=ev=>{environment=ev.target.value==='LIVE'?'LIVE':'SIM';rememberSaxoEnvironment(environment);ticket={side:ticket.side,step:'idle'};loadBroker();};}
  mk('#td-search-open').onclick=()=>openSearch();root.querySelector('#td-add').onclick=()=>openSearch();
  mk('#td-connect').onclick=()=>void connect();mk('#td-market-connect').onclick=()=>void connectMarketData();
  bindTabs('list',next=>{list=next;drawList();});bindTabs('dock',next=>{dock=next;drawDock();});
  root.querySelectorAll('[data-range]').forEach(b=>b.onclick=()=>{period=b.dataset.range;loadChart();});
  root.querySelectorAll('[data-chart-type]').forEach(b=>b.onclick=()=>{chartType=b.dataset.chartType;root.querySelectorAll('[data-chart-type]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));if(snapshot)drawChart(snapshot,true);});
  root.querySelectorAll('[data-average]').forEach(b=>b.onclick=()=>{averages[b.dataset.average]=!averages[b.dataset.average];b.setAttribute('aria-pressed',String(averages[b.dataset.average]));if(snapshot)drawChart(snapshot,true);});
  root.querySelector('#td-refresh').onclick=()=>{loadBroker();loadQuotes(true);if(selected)loadChart(true);};
  root.querySelector('#td-universe').onchange=loadHeatmap;
  bindSearch();
  keyHandler=ev=>{if(ev.key!=='/'||ev.ctrlKey||ev.metaKey||ev.altKey||!live())return;const el=document.activeElement;if(/^(INPUT|TEXTAREA|SELECT)$/.test(el?.tagName)||el?.isContentEditable||document.querySelector('dialog[open]'))return;ev.preventDefault();openSearch();};
  document.addEventListener('keydown',keyHandler);document.addEventListener('visibilitychange',onVisibility);
  themeObserver=new MutationObserver(()=>{if(!live())return;if(snapshot)drawChart(snapshot,true);if(exploreLoaded){loadHeatmap();loadFundamentals();}});themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  // TradingView's heatmap and fundamentals are third-party frames: load them only when the section is reached.
  exploreObserver=new IntersectionObserver(entries=>{if(!live()||exploreLoaded||!entries.some(x=>x.isIntersecting))return;exploreLoaded=true;exploreObserver.disconnect();loadHeatmap();loadFundamentals();},{rootMargin:'200px'});exploreObserver.observe(root.querySelector('.td-explore'));
  drawSummary();drawInstrument();drawStats();drawTicket();drawDock();drawAccount(true);
  const target=root;
  try{const completed=await finishSaxoSignIn(api);if(completed){environment=completed.purpose==='market-data'?completed.tradingEnvironment:completed.environment;rememberSaxoEnvironment(environment);if(mk('#td-environment'))mk('#td-environment').value=environment;}}catch(err){brokerError=errorText(err);}
  const tasks=await Promise.allSettled([read('research'),loadBroker(),mountOverviewAdvisor(root,{mode:S.mode,theme:S.theme,currency:S.currency,contextActions:false})]);
  if(!live()||root!==target)return;
  let requestedSymbol;try{requestedSymbol=decodeURIComponent(location.hash.split('/')[2]||'');}catch{}
  const requested=requestedSymbol&&/^[A-Za-z0-9.:^=_-]{1,24}$/.test(requestedSymbol)?requestedSymbol:null;
  if(tasks[0].status==='fulfilled'){rows=tasks[0].value;drawList();const holding=holdingGroups().find(g=>g.symbol);if(requested)select(rows.find(x=>same(x.symbol,requested))||{symbol:requested,name:requested});else if(rows.length)select(rows[0]);else if(holding)select({name:holding.name,symbol:holding.symbol,uic:holding.uic});loadQuotes();}
  else{root.querySelector('#td-list').innerHTML=`<p role="alert">${e(error(tasks[0].reason))}</p><button type="button" class="td-button" id="td-retry-list">${L('Retry','Prøv igen')}</button>`;root.querySelector('#td-retry-list').onclick=async()=>{try{rows=await read('research');drawList();loadQuotes();}catch{}};if(requested)select({symbol:requested,name:requested});}
  scheduleRefresh();
 }
 function bindTabs(name,onSelect){
  const buttons=[...root.querySelectorAll(`[data-${name}]`)];
  buttons.forEach((b,i)=>{b.onclick=()=>onSelect(b.dataset[name]);b.onkeydown=ev=>{const keys={ArrowRight:1,ArrowLeft:-1,Home:-i,End:buttons.length-1-i};if(!(ev.key in keys))return;ev.preventDefault();const next=buttons[(i+keys[ev.key]+buttons.length)%buttons.length];next.focus();onSelect(next.dataset[name]);};});
 }
 // Market data refreshes once a minute while the page is visible; this is polling, not a streaming feed.
 // The selected chart on a short range (1H/1D) refreshes itself faster through scheduleLive.
 function scheduleRefresh(){clearTimeout(marketTimer);marketTimer=setTimeout(()=>{if(!live())return;if(document.visibilityState==='visible'){if(selected&&!chartBlocked&&!short())loadChart(true);loadQuotes(true);if(portfolio)loadBroker(true);}scheduleRefresh();},60000);}
 // Live refresh of the selected short-range chart and quote: only while visible, and never after sign-in or access denial.
 function scheduleLive(){clearTimeout(liveTimer);const wait=live()&&selected?saxoLivePoll({range:period,visible:document.visibilityState==='visible',blocked:!!chartBlocked}):null;if(wait==null)return;liveTimer=setTimeout(()=>{if(live()&&selected&&saxoLivePoll({range:period,visible:document.visibilityState==='visible',blocked:!!chartBlocked})!=null)loadChart(true);},wait);}
 function onVisibility(){
  if(!live())return;if(document.visibilityState!=='visible'){clearTimeout(liveTimer);return;}
  if(!selected||!short()||chartBlocked)return;
  const age=snapshot?.retrievedAt?Date.now()-Date.parse(snapshot.retrievedAt):Infinity;
  if(age>=SAXO_LIVE_REFRESH_MS)loadChart(true);else scheduleLive();
 }

 /* ---------- Search ---------- */
 function openSearch(){const d=mk('#td-search-dialog');if(!d||d.open)return;d.showModal();const input=d.querySelector('#td-search');input.select();if(input.value.trim().length>=2)search();}
 function closeSearch(){const d=mk('#td-search-dialog');if(d?.open)d.close();}
 function bindSearch(){
  const d=root.querySelector('#td-search-dialog'),input=d.querySelector('#td-search');
  d.querySelector('form').onsubmit=ev=>{ev.preventDefault();clearTimeout(searchTimer);search();};
  d.querySelector('[data-close-search]').onclick=closeSearch;
  d.addEventListener('click',ev=>{if(ev.target===d)closeSearch();});
  input.oninput=()=>{clearTimeout(searchTimer);searchRun++;searchTimer=setTimeout(search,300);};
  input.onkeydown=ev=>{if(ev.key==='ArrowDown'){ev.preventDefault();d.querySelector('[data-result]')?.focus();}};
  d.querySelector('#td-results').onkeydown=ev=>{const items=[...d.querySelectorAll('[data-result]')],i=items.indexOf(document.activeElement);if(ev.key==='ArrowDown'&&i>=0){ev.preventDefault();items[Math.min(items.length-1,i+1)].focus();}if(ev.key==='ArrowUp'&&i>=0){ev.preventDefault();(i?items[i-1]:input).focus();}};
 }
 async function search(){
  if(!live())return;const d=mk('#td-search-dialog'),input=d.querySelector('#td-search'),out=d.querySelector('#td-results'),q=input.value.trim(),run=++searchRun;
  if(q.length<2){out.innerHTML='';input.setAttribute('aria-expanded','false');return;}
  input.setAttribute('aria-expanded','true');out.innerHTML=`<p class="td-muted" role="status">${L('Searching…','Søger…')}</p>`;
  try{const results=await read('markets/search?q='+encodeURIComponent(q));if(!live()||run!==searchRun)return;
   out.innerHTML=results.length?results.map((x,i)=>{const watched=rows.some(r=>same(r.symbol,x.symbol));return `<div class="td-result"><button type="button" role="option" data-result="${i}"><span class="td-mono" aria-hidden="true">${monogram(x.symbol)}</span><span class="td-row-name"><strong>${e(x.name)}</strong><small>${e(x.symbol)} · ${e(x.exchange)} · ${e(x.kind)}</small></span></button>${watched?`<span class="td-chip">${L('Watching','Følges')}</span>`:`<button type="button" class="td-button" data-watch-result="${i}" aria-label="${e(L('Add to watchlist: ','Tilføj til observationslisten: ')+x.name)}">${L('+ Watch','+ Følg')}</button>`}</div>`;}).join(''):`<p class="td-muted">${L('No stocks or ETFs found. Try another name or exact symbol.','Ingen aktier eller ETF’er fundet. Prøv et andet navn eller præcist symbol.')}</p>`;
   out.querySelectorAll('[data-result]').forEach(b=>b.onclick=()=>{const x=results[+b.dataset.result];closeSearch();select(rows.find(r=>same(r.symbol,x.symbol))||{name:x.name,symbol:x.symbol,exchange:x.exchange,kind:x.kind});});
   out.querySelectorAll('[data-watch-result]').forEach(b=>b.onclick=async()=>{const x=results[+b.dataset.watchResult];b.disabled=true;try{const row=await watch(x);if(!live())return;closeSearch();select(row);}catch(err){if(live()){b.disabled=false;out.insertAdjacentHTML('afterbegin',`<p role="alert">${e(error(err))}</p>`);}}});
  }catch(err){if(live()&&run===searchRun)out.innerHTML=`<p role="alert">${e(error(err))}</p>`;}
 }
 async function watch(x){const existing=rows.find(r=>same(r.symbol,x.symbol));if(existing)return existing;const row=await post('research',{name:x.name,symbol:x.symbol,notes:'',url:null});rows.unshift(row);drawList();quoteFor(row.symbol).then(()=>{if(live())drawList();}).catch(()=>{});return row;}
 /* ---------- Quotes and holdings ---------- */
 async function quoteFor(symbol,force=false){
  const known=quotes.get(symbol);if(known?.data&&!force&&Date.now()-known.at<55000)return known;
  try{const next={data:await market(symbol,'1d'),at:Date.now()};quotes.set(symbol,next);return next;}
  catch(err){if(err?.name==='AbortError')throw err;const blocked=blockingCodes.includes(err?.code),drop=blocked||deniedCodes.includes(err?.code),next={data:drop?null:known?.data||null,stale:!drop&&!!known?.data,error:err,at:Date.now()};quotes.set(symbol,next);if(blocked)marketBlock=err;return next;}
 }
 async function loadQuotes(force=false){
  if(!live())return;if(marketBlock?.code==='SAXO_LIVE_OWNER_REQUIRED'){drawListNotice();return;}
  const run=++quoteRun;if(force)marketBlock=null;
  // Bounded: at most 20 instruments (watchlist, then SIM holdings by exact Saxo listing), three requests at a time.
  const symbols=[...new Set([...rows.map(r=>r.symbol),...holdingGroups().map(g=>g.saxoSymbol).filter(Boolean)])].slice(0,20);let i=0;
  const worker=async()=>{while(i<symbols.length){if(!live()||run!==quoteRun||marketBlock)return;const s=symbols[i++];try{await quoteFor(s,force);}catch{return;}if(!live()||run!==quoteRun)return;drawList();if(same(s,selected?.symbol)){drawSummary();drawStats();drawInstrument();}}};
  await Promise.all([worker(),worker(),worker()]);if(live()&&run===quoteRun){drawList();drawListNotice();drawDock();drawSummary();drawStats();}
 }
 function drawListNotice(){
  drawMarketAuth();
  const note=root?.querySelector('#td-list-notice');if(!note)return;
  // Without a global block, still say so when Saxo denied every watchlist row, with the provider's evidence.
  const denied=rows.length?rows.map(r=>quotes.get(r.symbol)?.error).filter(x=>x?.code==='SAXO_MARKET_DATA_NO_ACCESS'):[];
  const block=marketBlock||(rows.length&&denied.length===rows.length?denied[0]:null);
  note.hidden=!block||list!=='watchlist';note.textContent=block?error(block):'';
 }
 const dayData=()=>selected?quotes.get(selected.symbol)?.data||(period==='1d'?snapshot:null):null;
 const currentPrice=()=>snapshot?.price??dayData()?.price??null;
 const valued=p=>!p.reliability||p.reliability==='Ok';
 // Saxo may report one instrument as several lots; the desk shows one row per net position.
 function holdingGroups(){
  if(!portfolio?.positions)return [];const groups=new Map();
  portfolio.positions.forEach(p=>{const key=p.netPositionId||p.symbol||p.instrument||p.positionId;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p);});
  return [...groups.values()].map(lots=>{const p=lots[0],all=f=>lots.every(f),sum=f=>lots.reduce((s,x)=>s+(+f(x)||0),0);
   const quantity=all(x=>finite(x.quantity))?sum(x=>x.quantity):null,sameCurrency=all(x=>x.currency===p.currency),ok=all(valued);
   const cost=sameCurrency&&all(x=>finite(x.openPrice)&&finite(x.quantity))?sum(x=>x.openPrice*x.quantity):null;
   const pnl=ok&&sameCurrency&&all(x=>finite(x.profitLoss))?sum(x=>x.profitLoss):null;
   return {lots,name:p.name||p.symbol||L('Instrument','Værdipapir'),symbol:p.researchSymbol||p.symbol,saxoSymbol:p.symbol,researchSymbol:p.researchSymbol,uic:p.instrument,currency:p.currency,assetType:p.assetType,quantity,
    avg:cost!=null&&quantity?cost/quantity:null,price:ok&&finite(p.price)?+p.price:null,valueBase:ok&&all(x=>finite(x.marketValueInBaseCurrency))?sum(x=>x.marketValueInBaseCurrency):null,
    pnlBase:ok&&all(x=>finite(x.profitLossInBaseCurrency))?sum(x=>x.profitLossInBaseCurrency):null,pnlPct:pnl!=null&&cost?pnl/Math.abs(cost)*100:null};})
   .map(g=>({...g,live:g.price==null?pairLiveQuote(g,quotes.get(g.saxoSymbol)?.data):null}));
 }
 const estTag=()=>`<span class="td-tag" title="${e(L('Estimated from the Saxo LIVE research quote and SIM quantity/open price, in the instrument currency. Not a broker valuation.','Anslået ud fra Saxo LIVE-researchkursen og SIM-antal/købskurs i værdipapirets valuta. Ikke en mæglerværdiansættelse.'))}">${L('est.','anslået')}</span>`;
 const liveTag=q=>`<span class="td-tag" title="${e(L('Saxo LIVE research quote','Saxo LIVE-researchkurs')+(q?.quoteTime?' · '+fmt(q.quoteTime):'')+(q?.delayMinutes>0?' · '+L(`delayed ${q.delayMinutes} min`,`forsinket ${q.delayMinutes} min`):q?.delayMinutes===0?' · '+L('no reported delay','ingen oplyst forsinkelse'):' · '+L('delay unknown','forsinkelse ukendt')))}">LIVE</span>`;
 const matches=(g,x)=>!!x&&(same(g.researchSymbol,x.symbol)||same(g.saxoSymbol??g.symbol,x.symbol)||(!!snapshot&&same(g.saxoSymbol??g.symbol,snapshot.symbol))||(finite(x.uic)&&+g.uic===+x.uic));
 const holdingFor=x=>holdingGroups().find(g=>matches(g,x))||null;
 const ordersFor=x=>(orders?.orders||[]).filter(o=>matches({researchSymbol:o.researchSymbol,saxoSymbol:o.symbol,uic:o.uic},x));
 function setCount(name,n){root?.querySelectorAll(`[data-count="${name}"]`).forEach(c=>c.textContent=n==null?'':String(n));}
 function select(x){
  if(!x||!live())return;selected={...x};snapshot=null;ticketRun++;ticket={side:ticket.side,step:'idle'};
  drawList();drawSummary();drawInstrument();drawStats();drawTicket();loadChart();
  if(period!=='1d')quoteFor(selected.symbol).then(()=>{if(live()){drawSummary();drawStats();drawInstrument();}}).catch(()=>{});
  loadYear();
 }
 async function loadYear(){
  const x=selected;if(!x||!live())return;if(period==='1y'){drawStats();return;}const run=++yearRun,known=years.get(x.symbol);
  if(known?.data&&Date.now()-known.at<10*60000){drawStats();return;}if(marketBlock&&blockingCodes.includes(marketBlock.code))return;
  try{const data=await market(x.symbol,'1y');if(!live()||run!==yearRun)return;years.set(x.symbol,{data,at:Date.now()});drawStats();}
  catch(err){if(live()&&run===yearRun&&err?.name!=='AbortError'){years.set(x.symbol,{error:err,at:Date.now()});drawStats();}}
 }

 /* ---------- Watchlist and holdings list ---------- */
 function spark(d){
  const pts=(d?.bars||[]).map(b=>+b.close).filter(Number.isFinite);if(pts.length<2)return '<span class="td-spark" aria-hidden="true"></span>';
  const base=finite(d.previousClose)?+d.previousClose:null,lo=Math.min(...pts,base??Infinity),hi=Math.max(...pts,base??-Infinity),r=hi-lo||1,w=64,h=26;
  const x=i=>(i/(pts.length-1)*w).toFixed(1),y=v=>(h-2-(v-lo)/r*(h-4)).toFixed(1),up=pts[pts.length-1]>=(base??pts[0]);
  return `<svg class="td-spark ${up?'up':'down'}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">${base!=null?`<line class="base" x1="0" x2="${w}" y1="${y(base)}" y2="${y(base)}"/>`:''}<path d="${pts.map((v,i)=>(i?'L':'M')+x(i)+' '+y(v)).join('')}"/></svg>`;
 }
 function drawList(){
  if(!live())return;root.querySelectorAll('[data-list]').forEach(b=>{const on=b.dataset.list===list;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;});
  const out=root.querySelector('#td-list');out.setAttribute('aria-labelledby','td-list-'+list);
  const groups=holdingGroups();setCount('watchlist',rows.length);setCount('holdings',portfolio?groups.length:null);drawListNotice();
  if(list==='holdings'){
   if(!portfolio){out.innerHTML=brokerIssue==='signin'?marketsSignedOutMarkup({kind:brokerAuth,what:L('Holdings are unavailable.','Beholdninger er ikke tilgængelige.')},{L,e}):`<div class="td-empty"><p>${e(brokerError||L('Holdings appear once Saxo is connected.','Beholdninger vises, når Saxo er forbundet.'))}</p>${brokerIssue==='error'?`<button type="button" class="td-button" data-broker-inline>${L('Retry connection','Prøv igen')}</button>`:''}</div>`;out.querySelector('[data-broker-inline]')?.addEventListener('click',brokerIssue==='error'?()=>loadBroker():connect);return;}
   if(!groups.length){out.innerHTML=`<div class="td-empty"><strong>${L('No holdings yet','Ingen beholdninger endnu')}</strong><p>Saxo ${e(environment)} · ${e(fmt(portfolio.observedAt))}</p></div>`;return;}
   out.innerHTML=`<p class="td-caption">${L('Change since purchase','Ændring siden køb')}${groups.some(g=>g.live)?' · '+L('est. from Saxo LIVE quotes','anslået ud fra Saxo LIVE-kurser'):''}</p>`+groups.map((g,i)=>`<div class="td-row-wrap ${matches(g,selected)?'selected':''}"><button type="button" class="td-row" data-holding="${i}" aria-pressed="${matches(g,selected)}"><span class="td-mono" aria-hidden="true">${monogram(g.saxoSymbol||g.symbol)}</span><span class="td-row-name"><strong>${e(g.name)}</strong><small>${e(qty(g.quantity))} ${shares(g.quantity)}${g.currency?' · '+e(g.currency):''}</small></span><span class="td-row-price"><span class="td-px">${e(num(g.price??g.live?.price))}${g.price==null&&g.live?liveTag(g.live):''}</span><span class="td-chg ${tone(g.pnlPct??g.live?.pnlPct)}"${g.pnlPct==null&&g.live?` title="${e(L('Estimated from the Saxo LIVE quote','Anslået ud fra Saxo LIVE-kursen'))}"`:''}>${e(pct(g.pnlPct??g.live?.pnlPct))}</span></span></button></div>`).join('')+(portfolio.hasMore?`<p class="td-caption">${L('Showing the first 100 positions.','Viser de første 100 positioner.')}</p>`:'');
   out.querySelectorAll('[data-holding]').forEach(b=>b.onclick=()=>{const g=groups[+b.dataset.holding];if(g.symbol)select({name:g.name,symbol:g.symbol,uic:g.uic});});return;
  }
  if(!rows.length){out.innerHTML=`<div class="td-empty"><strong>${L('Your watchlist is empty','Din observationsliste er tom')}</strong><p>${L('Search for a stock or ETF and add it to follow its price.','Søg efter en aktie eller ETF, og tilføj den for at følge kursen.')}</p><button type="button" class="td-button" data-open-search>${L('Find an investment','Find en investering')}</button></div>`;out.querySelector('[data-open-search]').onclick=()=>openSearch();return;}
  out.innerHTML=rows.map((x,i)=>{const q=quotes.get(x.symbol),d=q?.data,change=finite(d?.price)&&finite(d?.previousClose)&&+d.previousClose?(d.price/d.previousClose-1)*100:null,on=same(selected?.symbol,x.symbol);
   return `<div class="td-row-wrap ${on?'selected':''}"><button type="button" class="td-row" data-symbol="${i}" aria-pressed="${on}"${q?.error?` title="${e(error(q.error))}"`:''}><span class="td-mono" aria-hidden="true">${monogram(d?.symbol||x.symbol)}</span><span class="td-row-name"><strong>${e(d?.name||x.name)}</strong><small>${e(d?.symbol||x.symbol)}${q?.stale||d?.stale?' · '+L('stale','forældet'):''}</small></span>${spark(d)}<span class="td-row-price"><span class="td-px">${e(num(d?.price))}</span><span class="td-chg ${tone(change)}">${e(pct(change))}</span></span></button><button type="button" class="td-remove" data-remove="${i}" aria-label="${e(L('Remove ','Fjern ')+x.name)}">×</button></div>`;}).join('');
  out.querySelectorAll('[data-symbol]').forEach(b=>b.onclick=()=>select(rows[+b.dataset.symbol]));
  out.querySelectorAll('[data-remove]').forEach(b=>b.onclick=async()=>{const x=rows[+b.dataset.remove];b.disabled=true;try{await api(`research/${x.id}?version=${encodeURIComponent(x.version)}`,{method:'DELETE'});if(!live())return;rows=rows.filter(r=>r.id!==x.id);quotes.delete(x.symbol);drawList();if(same(selected?.symbol,x.symbol))drawInstrument();}catch(err){if(live()){b.disabled=false;out.insertAdjacentHTML('afterbegin',`<p role="alert">${e(error(err))}</p>`);}}});
 }
 /* ---------- Selected instrument: header summary, head, key figures ---------- */
 function feed(data){
  if(!data||!hasQuote(data))return null;
  // Saxo's numeric quote delay decides. Zero is only "no reported delay", never real-time; missing or invalid is unknown.
  const quote=/quote:\s*([^.;]+)/i.exec(data.delay||'')?.[1]||'',parsed=/delayed\s+([\d.]+)\s*min/i.exec(quote)?.[1];
  const f=finite(data.quoteDelayMinutes)?saxoFeed(+data.quoteDelayMinutes):parsed!=null?saxoFeed(+parsed):/no reported delay/i.test(quote)?saxoFeed(0):saxoFeed(null);
  return f.kind==='delayed'?{kind:'delayed',label:L(`Delayed ${f.minutes} min`,`Forsinket ${f.minutes} min`)}:f.kind==='none-reported'?{kind:'current',label:L('No reported delay','Ingen oplyst forsinkelse')}:{kind:'unknown',label:L('Delay unknown','Forsinkelse ukendt')};
 }
 // Explain each unavailable part separately, with Saxo's evidence, and keep the usable part on screen.
 function partsMessage(data){
  if(data.stale&&historyPart(data)!=='stale')return L('Refresh failed — showing the last Saxo snapshot.','Opdatering fejlede — viser seneste Saxo-øjebliksbillede.');
  const h=historyPart(data),q=quotePart(data),out=[];
  if(h==='denied')out.push(error({code:'SAXO_MARKET_HISTORY_NO_ACCESS'})+evidence(data.diagnostics,'history'));
  else if(h==='unavailable')out.push((rejected(data,'history')?L('Saxo rejected the price-history request.','Saxo afviste forespørgslen på kurshistorik.'):error({code:'SAXO_MARKET_HISTORY_UNAVAILABLE'}))+evidence(data.diagnostics,'history'));
  else if(h==='stale')out.push(error({code:'SAXO_MARKET_HISTORY_STALE'}));
  else if(h==='empty'||!data.bars?.length)out.push(L('No prices available for this period.','Ingen kurser for denne periode.'));
  if(q==='denied')out.push(L('Saxo denied access to the current quote.','Saxo afviste adgang til den aktuelle kurs.')+evidence(data.diagnostics,'quote'));
  else if(q==='mismatch')out.push(error({code:'SAXO_MARKET_DATA_MISMATCH'}));
  else if(q!=='available')out.push(error({code:'SAXO_MARKET_QUOTE_UNAVAILABLE'})+evidence(data.diagnostics,'quote'));
  return out.join(' ');
 }
 // Why the header has no current quote: the part status, or the last request's error for this instrument.
 function quoteLabel(data){
  const code=data?null:quotes.get(selected?.symbol)?.error?.code,q=data?quotePart(data):null;
  return q==='denied'||code==='SAXO_MARKET_DATA_NO_ACCESS'?L('Access denied by Saxo','Adgang afvist af Saxo'):q==='mismatch'?L('Not shown: listing or currency mismatch','Ikke vist: notering eller valuta passer ikke'):signinCodes.includes(code)?saxoAuthStatus(saxoAuthKind(code)||'required',L):q==='stale'?L('Previously retrieved','Tidligere hentet'):data||code?L('Unavailable','Utilgængelig'):L('Not loaded','Ikke hentet');
 }
 function chartNote(text){const note=root?.querySelector('#td-chart-note');if(!note)return;note.textContent=text||'';note.hidden=!text;}
 const feedChip=data=>{const f=feed(data);return f?`<span class="td-feed ${f.kind}" title="${e(data.delay)}">${e(f.label)}</span>`:'';};
 // The scenic header is composed from this hidden summary (app.js sceneBuilders.markets), so keep it current.
 function drawSummary(){
  const host=root?.querySelector('.td-summary');if(!host)return;
  const x=selected,day=dayData(),data=snapshot||day,price=currentPrice(),prev=snapshot?.previousClose??day?.previousClose,cur=data?.currency;
  const change=finite(price)&&finite(prev)&&+prev?price-prev:null,changePct=change!=null?change/prev*100:null;
  const bars=day?.bars||[],lo=bars.length?Math.min(...bars.map(b=>+b.low)):null,hi=bars.length?Math.max(...bars.map(b=>+b.high)):null,open=bars[0]?.open,held=x?holdingFor(x):null,f=feed(data);
  const label=x?[data?.name||x.name||x.symbol,listing(data?.symbol||x.symbol,data?.exchange||x.exchange)].filter(Boolean).join(' · '):L('Saxo LIVE market data','Saxo LIVE-markedsdata');
  host.innerHTML=`<div class="td-sum-lead"><span class="scene-eyebrow">${e(label)}</span><strong class="scene-figure">${finite(price)?money(+price,cur):'—'}</strong><small>${change!=null?`<span class="scene-tag ${change>=0?'positive':'negative'}">${e(signed(change))} · ${e(pct(changePct))} ${L('today','i dag')}</span>`:''}${f?e(f.label):snapshot?.stale&&finite(price)?e(L('Previously retrieved','Tidligere hentet')):''}</small></div>
   <div class="td-sum-card"><span class="scene-card-label">${L('Day range','Dagens spænd')}</span><strong>${lo!=null?e(num(lo)+' – '+num(hi)):'—'}</strong>${lo!=null&&hi>lo&&finite(price)?`<span class="scene-meter" aria-hidden="true"><i data-share="${clamp((price-lo)/(hi-lo)*100)}"></i></span>`:''}<small>${[finite(open)?L('Open ','Åbning ')+num(open):'',finite(prev)?L('Prev. close ','Forrige luk ')+num(prev):''].filter(Boolean).map(e).join(' · ')}</small></div>
   <div class="td-sum-card"><span class="scene-card-label">${L('Quote','Kurs')}</span><strong>${snapshot?.quoteTime?e(clock(snapshot.quoteTime)):'—'}</strong><small>${e(f?f.label:x?quoteLabel(data):L('Nothing selected','Intet valgt'))}</small></div>
   <div class="td-sum-card"><span class="scene-card-label">${L('Your position','Din position')}</span><strong>${held?e(qty(held.quantity))+' '+shares(held.quantity):portfolio&&x?L('Not owned','Ikke ejet'):'—'}</strong><small>${held&&held.pnlBase!=null?signedMoney(held.pnlBase,portfolio.currency)+' · '+e(pct(held.pnlPct)):held?.live?.pnl!=null?signedMoney(held.live.pnl,held.live.currency)+' · '+e(pct(held.live.pnlPct))+' '+L('est.','anslået'):''}</small></div>`;
 }
 function drawInstrument(){
  const host=root?.querySelector('#td-instrument');if(!host)return;
  root.querySelectorAll('[data-range]').forEach(b=>{b.disabled=!selected;b.setAttribute('aria-pressed',String(b.dataset.range===period));});
  root.querySelectorAll('.td-toolbar,.td-chart-box,.td-attribution').forEach(x=>x.hidden=!selected);
  if(!selected){host.innerHTML=`<div class="td-empty"><h2 id="td-instrument-name">${L('Nothing selected','Intet valgt')}</h2><p>${L('Search for a stock or ETF, or choose one from your watchlist.','Søg efter en aktie eller ETF, eller vælg en fra observationslisten.')}</p><button type="button" class="td-button" data-open-search>${L('Search instruments','Søg værdipapirer')}</button></div>`;host.querySelector('[data-open-search]').onclick=()=>openSearch();return;}
  const data=snapshot||dayData(),watched=rows.some(r=>same(r.symbol,selected.symbol)),meta=[listing(data?.symbol||selected.symbol,data?.exchange||selected.exchange),data?.currency].filter(Boolean).join(' · ');
  host.innerHTML=`<div class="td-id"><span class="td-mono td-mono-lg" aria-hidden="true">${monogram(data?.symbol||selected.symbol)}</span><div><h2 id="td-instrument-name">${e(data?.name||selected.name||selected.symbol)}</h2><small>${e(meta)}</small></div></div><div class="td-id-side">${feedChip(data)}${watched?'':`<button type="button" class="td-button" data-watch>${L('+ Watch','+ Følg')}</button>`}<span class="td-quick-trade"><button type="button" class="td-button td-buy" data-trade="Buy">${L('Buy','Køb')}</button><button type="button" class="td-button td-sell" data-trade="Sell">${L('Sell','Sælg')}</button></span></div>`;
  host.querySelector('[data-watch]')?.addEventListener('click',async ev=>{const b=ev.currentTarget;b.disabled=true;try{await watch({name:data?.name||selected.name||selected.symbol,symbol:selected.symbol});if(live())drawInstrument();}catch(err){if(live()){b.disabled=false;root.querySelector('#td-status').textContent=error(err);}}});
  host.querySelectorAll('[data-trade]').forEach(b=>b.onclick=()=>{setSide(b.dataset.trade);root.querySelector('#td-ticket').scrollIntoView({behavior:reduced()?'auto':'smooth',block:'start'});});
 }
 function drawStats(){
  const host=root?.querySelector('#td-stats');if(!host)return;if(!selected){host.innerHTML='';return;}
  const day=dayData(),year=period==='1y'?snapshot:years.get(selected.symbol)?.data,price=currentPrice(),cur=(snapshot||day)?.currency,bars=day?.bars||[];
  const open=bars[0]?.open,volume=bars.some(b=>b.volume!=null)?bars.reduce((s,b)=>s+(+b.volume||0),0):null,prev=snapshot?.previousClose??day?.previousClose;
  const yb=year?.bars||[],lo=yb.length?Math.min(...yb.map(b=>+b.low)):null,hi=yb.length?Math.max(...yb.map(b=>+b.high)):null,first=yb[0]?.close,yearChange=finite(first)&&finite(price)?(price/first-1)*100:null,held=holdingFor(selected);
  const stat=(label,value,extra='')=>`<div class="td-stat"><span>${label}</span><strong>${value}</strong>${extra}</div>`;
  host.innerHTML=stat(L('Open','Åbning'),finite(open)?money(+open,cur):'—')+stat(L('Previous close','Forrige luk'),finite(prev)?money(+prev,cur):'—')+stat(L('Volume today','Volumen i dag'),e(compact(volume)))
   +stat(L('1 year','1 år'),`<span class="${tone(yearChange)}">${e(pct(yearChange))}</span>`)
   +stat(L('52-week range','52-ugers spænd'),lo!=null?e(num(lo)+' – '+num(hi)):'—',lo!=null&&hi>lo&&finite(price)?`<span class="td-range" aria-hidden="true"><i data-position="${clamp((price-lo)/(hi-lo)*100)}"></i></span>`:'')
   +stat(L('Your position','Din position'),held?`${e(qty(held.quantity))} · <span class="${tone(held.pnlPct??held.live?.pnlPct)}">${e(pct(held.pnlPct??held.live?.pnlPct))}</span>${held.pnlPct==null&&held.live?.pnlPct!=null?' '+estTag():''}`:portfolio?L('Not owned','Ikke ejet'):'—');
  host.querySelectorAll('[data-position]').forEach(i=>i.style.left=i.dataset.position+'%');
 }

 /* ---------- Chart ---------- */
 function drawMarketSource(){
  const node=root?.querySelector('#td-source');if(!node)return;drawGapNote();
  if(!snapshot){node.textContent=L('Market data: Saxo LIVE · independent of trading mode','Markedsdata: Saxo LIVE · uafhængigt af handelsmiljø');return;}
  const pieces=[snapshot.source,snapshot.delay];
  if(snapshot.quoteTime)pieces.push(L('Quote updated ','Kurs opdateret ')+fmt(snapshot.quoteTime));
  // Retrieval time from the shared API projection, with seconds, so a short-range refresh is visible.
  pieces.push(L('Updated ','Opdateret ')+saxoClock(snapshot.retrievedAt,locale()));
  if(short()&&!chartBlocked)pieces.push(L(`refreshes every ${SAXO_LIVE_REFRESH_MS/1000} s while visible`,`opdateres hvert ${SAXO_LIVE_REFRESH_MS/1000}. sek., mens siden er synlig`));
  node.textContent=pieces.join(' · ');node.title=snapshot.priceBasis||'';
 }
 // Intraday gaps are compressed on the time axis, so one muted line under the chart says when Saxo sent no samples.
 function drawGapNote(){
  const node=root?.querySelector('#td-gaps');if(!node)return;
  const text=snapshot&&hasHistory(snapshot)?saxoGapNote({missing:snapshot.historySamples?.missingIntervals,interval:snapshot.interval},L):'';
  node.textContent=text;node.hidden=!text;
 }
 async function connectMarketData(){
  if(marketConnecting)return;marketConnecting=true;drawMarketAuth();
  try{const next=await post('investments/saxo/connect?environment=LIVE&returnUrl='+encodeURIComponent(location.origin+'/#/markets'));if(live())beginSaxoSignIn(next,{purpose:'market-data',tradingEnvironment:environment});}
  catch(err){marketConnecting=false;if(live()){root.querySelector('#td-status').textContent=error(err);drawMarketAuth();}}
 }
 async function loadChart(background=false){window.dispatchEvent(new CustomEvent('banking:section-context',{detail:{section:'markets',symbol:selected?.symbol,range:period,environment,marketDataSource:'Saxo LIVE'}}));
  if(!live())return;const run=++chartRun;
  if(!background){chart?.remove();chart=null;snapshot=null;drawInstrument();drawSummary();root.querySelector('#td-legend').innerHTML='';chartNote('');}
  drawMarketSource();const state=root.querySelector('#td-status');
  if(!selected){state.textContent='';return;}if(!background)state.textContent=L('Loading Saxo price history…','Henter Saxo-kurshistorik…');
  try{const data=await market(selected.symbol,period);if(!live()||run!==chartRun)return;
   snapshot=data;chartBlocked=null;if(period==='1d')quotes.set(selected.symbol,{data,at:Date.now()});if(period==='1y')years.set(selected.symbol,{data,at:Date.now()});
   drawInstrument();drawMarketSource();drawSummary();drawStats();drawList();
   state.textContent=partsMessage(data);
   chartNote(hasHistory(data)?'':historyPart(data)==='empty'?L('No prices available for this period.','Ingen kurser for denne periode.'):historyPart(data)==='denied'?L('Price history unavailable: Saxo denied access.','Kurshistorik utilgængelig: Saxo afviste adgang.'):L('Price history unavailable.','Kurshistorik utilgængelig.'));
   await drawChart(data,background);if(exploreLoaded)loadFundamentals();
   if(live()&&run===chartRun)scheduleLive();
  }catch(err){if(live()&&run===chartRun&&err?.name!=='AbortError'){
   const signin=signinCodes.includes(err.code),denied=deniedCodes.includes(err.code);
   if(denied){snapshot=null;chart?.remove();chart=null;root.querySelector('#td-legend').innerHTML='';drawInstrument();drawMarketSource();drawSummary();drawStats();}
   if(!snapshot)chartNote(signin?L('Price history unavailable: Saxo LIVE is not signed in.','Kurshistorik utilgængelig: Saxo LIVE er ikke logget ind.'):err.code==='SAXO_MARKET_DATA_NO_ACCESS'?L('Saxo denied access to this listing’s price history and quote.','Saxo afviste adgang til noteringens kurshistorik og kurs.'):L('Price history unavailable.','Kurshistorik utilgængelig.'));
   chartBlocked=denied||err.code==='SAXO_MARKET_DEPLOYMENT_REQUIRED'?err.code:null;
   state.innerHTML=marketsChartStatusMarkup({text:error(err)+(background&&snapshot?' '+L('Showing the last Saxo snapshot.','Viser seneste Saxo-øjebliksbillede.'):''),signin},{L,e});
   state.querySelector('#td-retry-chart')?.addEventListener('click',()=>loadChart());drawMarketAuth();scheduleLive();
  }}
 }
 const movingAverage=(bars,n)=>{const out=[];let sum=0;bars.forEach((b,i)=>{sum+=+b.close;if(i>=n)sum-=+bars[i-n].close;if(i>=n-1)out.push({time:b.time,value:sum/n});});return out;};
 const alpha=(color,a)=>/^#[0-9a-f]{6}$/i.test(color)?color+a:color;
 async function drawChart(data,keepRange=false){
  await import('./vendor/lightweight-charts-5.2.0.js');if(!live()||snapshot!==data)return;
  const LW=window.LightweightCharts,node=root.querySelector('#td-chart'),visible=keepRange?chart?.timeScale().getVisibleLogicalRange():null;chart?.remove();chart=null;
  if(!data.bars.length){root.querySelector('#td-legend').innerHTML='';root.querySelectorAll('[data-average]').forEach(b=>b.disabled=true);return;}
  const style=getComputedStyle(root),token=n=>style.getPropertyValue(n).trim(),ink=token('--ink'),muted=token('--muted'),line=token('--line'),accent=token('--accent'),warn=token('--warn'),ai=token('--ai-accent'),up='#7bc9a3',down='#e38c92';
  const intraday=['1h','1d','5d'].includes(period)||/m$/.test(data.interval||''),bars=data.bars;
  // The library's own logo injects an inline <style> that CSP blocks; the attribution is a normal link instead.
  chart=LW.createChart(node,{autoSize:true,layout:{background:{type:'solid',color:'transparent'},textColor:muted,fontFamily:'inherit',attributionLogo:false},grid:{vertLines:{visible:false},horzLines:{color:alpha(line,'aa')}},rightPriceScale:{borderVisible:false},timeScale:{borderVisible:false,timeVisible:intraday},localization:{locale:locale()}});
  let series;
  if(chartType==='candles'){series=chart.addSeries(LW.CandlestickSeries,{upColor:up,downColor:down,wickUpColor:up,wickDownColor:down,borderVisible:false});series.setData(bars.map(b=>({time:b.time,open:+b.open,high:+b.high,low:+b.low,close:+b.close})));}
  else if(chartType==='line'){series=chart.addSeries(LW.LineSeries,{color:accent,lineWidth:2});series.setData(bars.map(b=>({time:b.time,value:+b.close})));}
  else{series=chart.addSeries(LW.AreaSeries,{lineColor:accent,topColor:alpha(accent,'55'),bottomColor:alpha(accent,'00'),lineWidth:2});series.setData(bars.map(b=>({time:b.time,value:+b.close})));}
  series.priceScale().applyOptions({scaleMargins:{top:.08,bottom:.22}});
  const withVolume=bars.filter(b=>b.volume!=null);
  if(withVolume.length){const v=chart.addSeries(LW.HistogramSeries,{priceFormat:{type:'volume'},priceScaleId:'volume',lastValueVisible:false,priceLineVisible:false});v.priceScale().applyOptions({scaleMargins:{top:.84,bottom:0}});v.setData(withVolume.map(b=>({time:b.time,value:+b.volume,color:(+b.close>=+b.open?up:down)+'44'})));}
  const shown=[];
  [[50,warn],[200,ai]].forEach(([n,color])=>{if(!averages[n]||intraday||bars.length<n)return;chart.addSeries(LW.LineSeries,{color,lineWidth:1.5,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false}).setData(movingAverage(bars,n));shown.push(`<span class="td-ma${n}">MA ${n}</span>`);});
  root.querySelectorAll('[data-average]').forEach(b=>{const n=+b.dataset.average;b.disabled=intraday||bars.length<n;b.title=b.disabled?L(`Needs at least ${n} daily bars`,`Kræver mindst ${n} dagskurser`):'';});
  const held=holdingFor(selected);
  if(held&&finite(held.avg)&&same(held.currency,data.currency))series.createPriceLine({price:+held.avg,color:accent,lineStyle:2,lineWidth:1,axisLabelVisible:true,title:L('Avg cost','Snitkurs')});
  ordersFor(selected).forEach(o=>{if(finite(o.price)&&(!o.currency||same(o.currency,data.currency)))series.createPriceLine({price:+o.price,color:ink,lineStyle:1,lineWidth:1,axisLabelVisible:true,title:`${side(o.side)} ${L('limit','limit')} · ${qty(o.quantity)}`});});
  if(held&&LW.createSeriesMarkers){const marks=held.lots.map(p=>{const t=Date.parse(p.openedAt)/1000;if(!Number.isFinite(t)||t<bars[0].time)return null;let bar=bars[0];for(const b of bars){if(b.time<=t)bar=b;else break;}return {time:bar.time,position:'belowBar',color:accent,shape:'arrowUp',text:L('Bought ','Købt ')+qty(p.quantity)};}).filter(Boolean);if(marks.length)LW.createSeriesMarkers(series,marks);}
  const legend=root.querySelector('#td-legend'),last=bars[bars.length-1],byTime=new Map(bars.map(b=>[b.time,b]));
  const show=b=>{legend.innerHTML=`<span>O <b>${e(num(b.open))}</b></span><span>H <b>${e(num(b.high))}</b></span><span>L <b>${e(num(b.low))}</b></span><span>C <b>${e(num(b.close))}</b></span>${b.volume!=null?`<span>${L('Vol','Vol')} <b>${e(compact(b.volume))}</b></span>`:''}${shown.join('')}`;};
  show(last);chart.subscribeCrosshairMove(p=>show((p?.time!=null&&byTime.get(p.time))||last));
  chart.timeScale().fitContent();if(visible)chart.timeScale().setVisibleLogicalRange(visible);
 }
 /* ---------- Inline order ticket (Saxo SIM only; accepted is not filled) ---------- */
 const orderMessage=err=>err?.code==='SAXO_SESSION_REQUIRED'?L('Your session has expired. Open Banking again to prepare and confirm SIM orders.','Din session er udløbet. Åbn Banking igen for at klargøre og bekræfte SIM-ordrer.'):err?.code==='SAXO_SIM_TRADING_DISABLED'?L('SIM trading has not been enabled on the shared backend yet. Account data is still available.','SIM-handel er endnu ikke aktiveret på den fælles backend. Kontodata er stadig tilgængelige.'):[...blockingCodes,'SAXO_RATE_LIMITED','SAXO_MARKET_DATA_UNAVAILABLE'].includes(err?.code)?error(err):err?.code?.startsWith('SAXO_')?L('Saxo: ','Saxo: ')+err.code.slice(5).replaceAll('_',' '):error(err);
 function setSide(next){ticket.side=next==='Sell'?'Sell':'Buy';if(['review','receipt'].includes(ticket.step))ticket.step=ticket.detail?'form':'idle';if(ticket.step==='form'&&ticket.quote){const q=ticket.quote.quote,p=ticket.side==='Buy'?q?.Ask:q?.Bid;if(p>0&&!ticket.limitEdited)ticket.limit=p;}drawTicket();}
 function quoteState(detail){const raw=detail.quote?.Quote,noAccess=detail.quoteError==='SAXO_MARKET_DATA_NO_ACCESS'||raw?.PriceTypeAsk==='NoAccess'||raw?.PriceTypeBid==='NoAccess',unavailable=!!detail.quoteError||noAccess||!(raw?.Ask>0||raw?.Bid>0);return {noAccess,unavailable,quote:unavailable?null:raw};}
 function ticketHead(chip){return `<div class="td-head"><h2 id="td-ticket-title">${L('Order ticket','Ordreseddel')}</h2>${chip?`<span class="td-chip">${chip}</span>`:''}</div>`;}
 function sideSegment(){return `<div class="td-side" role="group" aria-label="${L('Buy or sell','Køb eller sælg')}"><button type="button" data-side="Buy" aria-pressed="${ticket.side==='Buy'}">${L('Buy','Køb')}</button><button type="button" data-side="Sell" aria-pressed="${ticket.side==='Sell'}">${L('Sell','Sælg')}</button></div>`;}
 function drawTicket(){
  const host=root?.querySelector('#td-ticket');if(!host)return;const chip='Saxo '+e(environment);
  if(!selected){host.innerHTML=ticketHead(chip)+`<p class="td-muted">${L('Select an instrument to prepare an order.','Vælg et værdipapir for at klargøre en ordre.')}</p>`;return;}
  if(environment!=='SIM'){host.innerHTML=ticketHead(chip)+`<div class="td-empty"><strong>${L('LIVE is read only','LIVE er kun læsning')}</strong><p>${L('Order entry is currently available in SIM only.','Ordreafgivelse er foreløbig kun tilgængelig i SIM.')}</p></div>`;return;}
  if(!portfolio){host.innerHTML=ticketHead(chip)+signedOutState(L('Order entry is unavailable.','Ordreafgivelse er ikke tilgængelig.'));host.querySelector('[data-broker-inline]')?.addEventListener('click',brokerIssue==='error'?()=>loadBroker():connect);return;}
  const bindSide=()=>host.querySelectorAll('[data-side]').forEach(b=>b.onclick=()=>setSide(b.dataset.side));
  if(ticket.step==='idle'){resolveListing();return;}
  if(['listing-loading','form-loading'].includes(ticket.step)){host.innerHTML=ticketHead(chip)+sideSegment()+`<p class="td-muted" role="status">${ticket.step==='listing-loading'?L('Finding the Saxo listing…','Finder Saxo-noteringen…'):L('Loading Saxo order details…','Henter Saxo-ordreoplysninger…')}</p>`;bindSide();return;}
  if(ticket.step==='error'){host.innerHTML=ticketHead(chip)+`<p role="alert">${e(ticket.error)}</p><button type="button" class="td-button" data-retry>${L('Retry','Prøv igen')}</button>`;host.querySelector('[data-retry]').onclick=()=>ticket.uic?loadTicket(ticket.uic):(ticket.step='idle',drawTicket());return;}
  if(ticket.step==='listings'){
   const target=snapshot?.symbol||selected.symbol;
   host.innerHTML=ticketHead(chip)+sideSegment()+`<p>${L('Confirm the Saxo listing for','Bekræft Saxo-noteringen for')} <strong>${e(snapshot?.name||selected.name||selected.symbol)}</strong></p><div class="td-listings">${ticket.matches.map((x,i)=>`<button type="button" data-listing="${i}"><span class="td-row-name"><strong>${e(x.name)}</strong><small>${e(x.symbol)} · ${e(x.exchange)}</small></span>${same(x.symbol,target)?`<span class="td-chip">${L('Same as chart','Samme som graf')}</span>`:''}</button>`).join('')||`<p class="td-muted">${L('No matching Saxo stock found.','Ingen matchende Saxo-aktie fundet.')}</p>`}</div>`;
   bindSide();host.querySelectorAll('[data-listing]').forEach(b=>b.onclick=()=>loadTicket(ticket.matches[+b.dataset.listing].uic));return;
  }
  if(ticket.step==='form')return drawTicketForm(host,chip,bindSide);
  if(ticket.step==='review')return drawReview(host);
  if(ticket.step==='receipt')return drawReceipt(host);
 }
 async function resolveListing(){
  const x=selected,run=++ticketRun,target=snapshot?.symbol||x.symbol,saved=listings.get(target.toUpperCase())||listings.get(x.symbol.toUpperCase());
  if(saved)return loadTicket(saved,run);
  ticket={side:ticket.side,step:'listing-loading'};drawTicket();
  // Never pick a search result as the executable instrument; the person confirms the exact listing once.
  try{const query=target.includes(':')?target.split(':')[0]:target.endsWith('.CO')?target.replace('.CO','').replace('-',' '):target;
   let matches=await read('investments/saxo/instruments?q='+encodeURIComponent(query));if(!live()||run!==ticketRun)return;
   if(!matches.length){matches=await read('investments/saxo/instruments?q='+encodeURIComponent(snapshot?.name||x.name||query));if(!live()||run!==ticketRun)return;}
   ticket={side:ticket.side,step:'listings',matches};drawTicket();
  }catch(err){if(live()&&run===ticketRun&&err?.name!=='AbortError'){ticket={side:ticket.side,step:'error',error:orderMessage(err)};drawTicket();}}
 }
 async function loadTicket(uic,run=++ticketRun){
  ticket={...ticket,step:'form-loading',uic};drawTicket();
  try{const detail=await read('investments/saxo/ticket?uic='+uic);if(!live()||run!==ticketRun)return;
   listings.set((snapshot?.symbol||selected.symbol).toUpperCase(),uic);
   const q=quoteState(detail),p=ticket.side==='Buy'?q.quote?.Ask:q.quote?.Bid;
   ticket={side:ticket.side,step:'form',uic,detail,quote:q,qty:ticket.qty||1,limit:ticket.limitEdited?ticket.limit:p>0?p:null,limitEdited:!!ticket.limitEdited,account:ticket.account||detail.accounts?.[0]?.key,error:''};drawTicket();
  }catch(err){if(live()&&run===ticketRun&&err?.name!=='AbortError'){ticket={...ticket,step:'error',error:orderMessage(err)};drawTicket();}}
 }
 function drawTicketForm(host,chip,bindSide){
  const d=ticket.detail,q=ticket.quote,cur=d.currency,last=snapshot&&same(snapshot.currency,cur)&&finite(snapshot.price)?+snapshot.price:null,account=portfolio.accounts?.[accountIndex];
  const note=q.noAccess?L('Saxo has not granted this SIM account access to prices. No price has been filled in.','Saxo har ikke givet denne SIM-konto adgang til kurser. Ingen kurs er udfyldt.'):q.unavailable?L('Saxo prices are currently unavailable. No price has been filled in.','Saxo-kurser er ikke tilgængelige lige nu. Ingen kurs er udfyldt.'):q.quote?.DelayedByMinutes?e(q.quote.DelayedByMinutes)+' min '+L('delay','forsinkelse'):L('Indicative price. Your limit controls the order.','Vejledende kurs. Din limit styrer ordren.');
  const prices=[[L('Bid','Bud'),q.quote?.Bid],[L('Last','Seneste'),last],[L('Ask','Udbud'),q.quote?.Ask]].filter(x=>x[1]>0);
  host.innerHTML=ticketHead(`Saxo SIM · ${L('Limit · Day','Limit · Dag')}`)+sideSegment()+`<p class="td-listing">${e(d.name)} · ${e(d.symbol)} · ${e(cur)} <button type="button" class="td-text-button" data-change-listing>${L('Change listing','Skift notering')}</button></p>
   <div class="td-quote-line"><span>${L('Saxo SIM bid / ask','Saxo SIM bud / udbud')}</span><strong>${e(num(q.quote?.Bid))} / ${e(num(q.quote?.Ask))}</strong><small>${note}</small></div>
   <form class="td-order-form">${d.accounts.length>1?`<label class="td-field">${L('Saxo account','Saxo-konto')}<select name="account">${d.accounts.map(a=>`<option value="${e(a.key)}" ${a.key===ticket.account?'selected':''}>${e(a.name)} · ${e(a.currency)}</option>`).join('')}</select></label>`:''}
    <label class="td-field">${L('Quantity','Antal')}<span class="td-stepper"><button type="button" data-step="-1" aria-label="${L('Fewer shares','Færre aktier')}">−</button><input name="quantity" type="number" inputmode="numeric" min="1" max="1000" step="1" value="${e(ticket.qty)}" required><button type="button" data-step="1" aria-label="${L('More shares','Flere aktier')}">+</button></span></label>
    <div class="td-quick" role="group" aria-label="${L('Quantity shortcuts','Genveje til antal')}">${[1,5,10,25].map(n=>`<button type="button" data-qty="${n}" aria-pressed="${+ticket.qty===n}">${n}</button>`).join('')}</div>
    <label class="td-field">${L('Limit price','Limitkurs')} · ${e(cur)}<input name="price" type="number" inputmode="decimal" min="0.0001" step="any" value="${ticket.limit!=null?e(ticket.limit):''}" required></label>
    ${prices.length?`<div class="td-quick" role="group" aria-label="${L('Use a price','Brug en kurs')}">${prices.map(([label,v])=>`<button type="button" data-price="${e(v)}">${label} ${e(num(v))}</button>`).join('')}</div>`:''}
    <dl class="td-est"><dt>${L('Limit value','Limitværdi')}</dt><dd data-estimate>—</dd><dt>${L('Available to trade','Til handel')}</dt><dd>${account?money(account.available,account.currency):'—'}</dd></dl>
    <p class="td-error" role="alert">${e(ticket.error||'')}</p><button class="primary td-wide" type="submit">${ticket.side==='Buy'?L('Review buy order','Gennemgå købsordre'):L('Review sell order','Gennemgå salgsordre')}</button>
    <p class="td-muted">${L('Saxo checks costs before you confirm. Fees are shown in the review.','Saxo kontrollerer omkostninger, før du bekræfter. Gebyrer vises ved gennemgang.')}</p></form>`;
  bindSide();const form=host.querySelector('form'),field=n=>form.elements.namedItem(n);
  const sync=()=>{ticket.qty=Math.max(1,Math.min(1000,Math.round(+field('quantity').value||1)));const p=+field('price').value;ticket.limit=p>0?p:null;if(form.elements.namedItem('account'))ticket.account=field('account').value;form.querySelector('[data-estimate]').innerHTML=ticket.limit?money(ticket.qty*ticket.limit,cur):'—';form.querySelectorAll('[data-qty]').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.qty===ticket.qty)));};
  form.oninput=ev=>{if(ev.target.name==='price')ticket.limitEdited=true;sync();};sync();
  form.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>{field('quantity').value=Math.max(1,Math.min(1000,(+field('quantity').value||1)+ +b.dataset.step));sync();});
  form.querySelectorAll('[data-qty]').forEach(b=>b.onclick=()=>{field('quantity').value=b.dataset.qty;sync();});
  form.querySelectorAll('[data-price]').forEach(b=>b.onclick=()=>{field('price').value=b.dataset.price;ticket.limitEdited=true;sync();});
  host.querySelector('[data-change-listing]').onclick=()=>{listings.delete((snapshot?.symbol||selected.symbol).toUpperCase());ticket={side:ticket.side,step:'idle'};drawTicket();};
  form.onsubmit=async ev=>{ev.preventDefault();if(!form.reportValidity())return;sync();const button=form.querySelector('[type=submit]'),run=ticketRun;button.disabled=true;
   try{const review=await post('investments/saxo/orders/precheck',{uic:ticket.uic,accountKey:ticket.account||d.accounts[0]?.key,side:ticket.side,quantity:ticket.qty,limitPrice:ticket.limit});if(!live()||run!==ticketRun)return;ticket={...ticket,step:'review',review,error:''};drawTicket();}
   catch(err){if(live()&&run===ticketRun){ticket.error=orderMessage(err);form.querySelector('.td-error').textContent=ticket.error;button.disabled=false;}}};
 }
 function drawReview(host){
  const r=ticket.review,p=r.precheck||{},ok=r.state==='Reviewed';
  host.innerHTML=ticketHead(`Saxo SIM · ${L('Review','Gennemgå')}`)+`<p class="td-listing">${e(r.name)}</p><dl class="td-est td-review"><dt>${L('Order','Ordre')}</dt><dd>${side(r.input.side)} ${e(qty(r.input.quantity))} ${L('share(s)','aktie(r)')}</dd><dt>${L('Limit price','Limitkurs')}</dt><dd>${money(r.input.limitPrice,r.currency)}</dd><dt>${L('Valid until','Gyldig til')}</dt><dd>${L('End of trading day','Handelsdagens slutning')}</dd><dt>${L('Estimated total incl. fees','Anslået total inkl. omkostninger')}</dt><dd>${money(p.EstimatedTotalCost,r.currency)}</dd><dt>${L('Estimated cash required','Anslået kontantbehov')}</dt><dd>${money(p.EstimatedCashRequired,p.EstimatedCashRequiredCurrency||r.currency)}</dd></dl>
   <p role="status" class="td-review-state ${ok?'ok':'bad'}">${ok?L('Saxo check passed. This does not mean the order is filled.','Saxo-kontrol godkendt. Det betyder ikke, at ordren er handlet.'):e(p.ErrorInfo?.Message||p.ErrorInfo?.ErrorCode||p.PreCheckResult||L('Saxo did not approve this order.','Saxo godkendte ikke ordren.'))}</p>
   <div class="td-actions"><button type="button" class="td-button" data-edit>${L('Edit','Redigér')}</button>${ok?`<button type="button" class="primary" data-submit>${L('Place SIM order','Afgiv SIM-ordre')}</button>`:''}</div><p class="td-error" role="alert"></p>`;
  const message=host.querySelector('.td-error'),edit=host.querySelector('[data-edit]');
  edit.onclick=()=>{ticket.step='form';drawTicket();};
  host.querySelector('[data-submit]')?.addEventListener('click',async ev=>{const btn=ev.currentTarget,run=ticketRun;btn.disabled=true;edit.disabled=true;btn.textContent=L('Submitting…','Sender…');
   try{const receipt=await post('investments/saxo/orders',{ticketId:r.ticketId,confirm:true});if(!live()||run!==ticketRun)return;ticket={...ticket,step:'receipt',receipt};drawTicket();loadBroker(true);}
   catch(err){if(!live()||run!==ticketRun)return;
    if(['SAXO_REVIEW_EXPIRED','SAXO_COST_CHANGED_REVIEW_AGAIN','SAXO_REGISTRATION_CHANGED'].includes(err.code)){
     message.textContent=err.code==='SAXO_REVIEW_EXPIRED'?L('This review expired. Nothing was submitted. Refresh the review to continue.','Gennemgangen er udløbet. Intet blev sendt. Opdatér gennemgangen for at fortsætte.'):L('Order details changed. Nothing was submitted. Review the current details again.','Ordreoplysningerne er ændret. Intet blev sendt. Gennemgå de aktuelle oplysninger igen.');
     edit.disabled=false;const refresh=btn.cloneNode(true);refresh.disabled=false;refresh.textContent=L('Refresh review','Opdatér gennemgang');btn.replaceWith(refresh);
     refresh.onclick=async()=>{refresh.disabled=true;try{const next=await post('investments/saxo/orders/precheck',r.input);if(live()&&run===ticketRun){ticket={...ticket,review:next};drawTicket();}}catch(e2){message.textContent=orderMessage(e2);refresh.disabled=false;}};return;}
    // The outcome is unknown: never offer a second submission, only a status check.
    message.textContent=L('The response was interrupted. Check status before placing another order.','Svaret blev afbrudt. Kontrollér status, før du afgiver en ny ordre.');
    const check=btn.cloneNode(true);check.disabled=false;check.textContent=L('Check status','Kontrollér status');btn.replaceWith(check);
    check.onclick=async()=>{try{const receipt=await read('investments/saxo/orders/'+r.ticketId);if(live()&&run===ticketRun){ticket={...ticket,step:'receipt',receipt};drawTicket();loadBroker(true);}}catch(e2){message.textContent=orderMessage(e2);}};}});
 }
 function drawReceipt(host){
  const r=ticket.receipt,accepted=r.state==='Accepted';
  host.innerHTML=ticketHead('Saxo SIM')+`<div class="td-receipt"><strong>${accepted?L('Order accepted','Ordre accepteret'):r.state==='Rejected'?L('Order rejected','Ordre afvist'):L('Check order status','Kontrollér ordrestatus')}</strong><p>${e(r.name)} · ${e(qty(r.input?.quantity))} ${L('share(s)','aktie(r)')}</p>${r.orderId?`<p>${L('Saxo order','Saxo-ordre')} ${e(r.orderId)}</p>`:''}${accepted?`<ol class="td-steps" aria-label="${L('Order progress','Ordreforløb')}"><li class="done">${L('Placed','Afgivet')}</li><li class="now" aria-current="step">${L('Working','Aktiv')}</li><li>${L('Filled','Handlet')}</li></ol>`:''}<p class="td-muted">${e(r.error||L('Accepted orders may still be waiting or partially filled. Check working orders and holdings.','Accepterede ordrer kan stadig afvente eller være delvist handlet. Se aktive ordrer og beholdninger.'))}</p></div><div class="td-actions"><button type="button" class="td-button" data-view-orders>${L('View working orders','Se aktive ordrer')}</button><button type="button" class="td-button" data-new-order>${L('New order','Ny ordre')}</button></div>`;
  host.querySelector('[data-view-orders]').onclick=()=>{dock='orders';drawDock();root.querySelector('.td-dock').scrollIntoView({behavior:reduced()?'auto':'smooth',block:'start'});};
  host.querySelector('[data-new-order]').onclick=()=>{ticket={side:ticket.side,step:ticket.detail?'form':'idle',uic:ticket.uic,detail:ticket.detail,quote:ticket.quote,qty:ticket.qty,limit:ticket.limit,limitEdited:ticket.limitEdited,account:ticket.account};drawTicket();};
 }
 /* ---------- Dock: positions, working orders, activity ---------- */
 function drawDock(){
  const host=root?.querySelector('#td-dock');if(!host)return;
  root.querySelectorAll('[data-dock]').forEach(b=>{const on=b.dataset.dock===dock;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;});host.setAttribute('aria-labelledby','td-dock-'+dock);
  const groups=holdingGroups(),history=orders?.history||[],receipts=orders?.receipts||[];
  setCount('positions',portfolio?groups.length:null);setCount('orders',orders?.orders?orders.orders.length:null);setCount('activity',orders?history.length+receipts.length:null);
  const disconnected=brokerIssue==='signin'?`<p class="td-muted">${e(saxoAuthStatus(brokerAuth,L))} · ${L('Positions and orders are unavailable.','Positioner og ordrer er ikke tilgængelige.')}</p>`:`<p class="td-muted">${e(brokerError||L('Positions and orders appear once Saxo is connected.','Positioner og ordrer vises, når Saxo er forbundet.'))}</p>`;
  if(dock==='positions'){
   if(!portfolio){host.innerHTML=disconnected;return;}
   if(!groups.length){host.innerHTML=`<p class="td-muted"><strong>${L('No holdings yet','Ingen beholdninger endnu')}</strong> · Saxo ${e(environment)} · ${e(fmt(portfolio.observedAt))}</p>`;return;}
   // Weights need one currency and one source: all broker base values, or all estimates already in the account's base currency.
   const brokerAll=groups.every(g=>g.valueBase!=null),estAll=!brokerAll&&groups.every(g=>g.valueBase==null&&g.live?.value!=null&&same(g.live.currency,portfolio.currency));
   const baseValue=g=>brokerAll?g.valueBase:estAll?g.live.value:null;
   const total=groups.every(g=>baseValue(g)!=null)?groups.reduce((s,g)=>s+baseValue(g),0):null,anyLive=groups.some(g=>g.live);
   host.innerHTML=`<table class="td-table"><thead><tr><th scope="col">${L('Instrument','Værdipapir')}</th><th scope="col">${L('Quantity','Antal')}</th><th scope="col">${L('Open price','Købskurs')}</th><th scope="col">${L('Current price','Aktuel kurs')}</th><th scope="col">${L('Market value','Markedsværdi')}</th><th scope="col">${L('Profit/loss','Gevinst/tab')}</th><th scope="col">${L('Weight','Andel')}</th></tr></thead><tbody>${groups.map((g,i)=>{const w=total&&baseValue(g)!=null?baseValue(g)/total*100:null,est=g.price==null&&g.live;return `<tr class="${matches(g,selected)?'selected':''}"><th scope="row"><button type="button" class="td-inst" data-open-holding="${i}"><span class="td-mono" aria-hidden="true">${monogram(g.saxoSymbol||g.symbol)}</span><span>${e(g.name)}</span></button></th><td>${e(qty(g.quantity))}</td><td>${g.avg!=null?money(g.avg,g.currency):'—'}</td><td>${g.price!=null?money(g.price,g.currency):est?money(g.live.price,g.live.currency)+liveTag(g.live):'—'}</td><td>${g.valueBase!=null?money(g.valueBase,portfolio.currency):est&&g.live.value!=null?money(g.live.value,g.live.currency)+estTag():'—'}</td><td class="${tone(g.pnlBase??(est?g.live.pnl:null))}">${g.pnlBase!=null?signedMoney(g.pnlBase,portfolio.currency)+(g.pnlPct!=null?' · '+e(pct(g.pnlPct)):''):est&&g.live.pnl!=null?signedMoney(g.live.pnl,g.live.currency)+' · '+e(pct(g.live.pnlPct))+estTag():'—'}</td><td>${w!=null?`${e(num(w,1))}%<span class="td-weight" aria-hidden="true"><i data-width="${clamp(w)}"></i></span>`:'—'}</td></tr>`;}).join('')}</tbody></table>${anyLive?`<p class="td-muted">${L('LIVE = Saxo LIVE research quote for the exact listing. est. = SIM quantity and open price with that quote, in the instrument currency. No currency conversion; broker account totals are unchanged.','LIVE = Saxo LIVE-researchkurs for den præcise notering. anslået = SIM-antal og købskurs med den kurs i værdipapirets valuta. Ingen valutaomregning; mæglerens kontototaler er uændrede.')}</p>`:''}${portfolio.hasMore?`<p class="td-muted">${L('Showing the first 100 positions.','Viser de første 100 positioner.')}</p>`:''}`;
   host.querySelectorAll('[data-width]').forEach(i=>i.style.width=i.dataset.width+'%');
   host.querySelectorAll('[data-open-holding]').forEach(b=>b.onclick=()=>{const g=groups[+b.dataset.openHolding];if(g.symbol)select({name:g.name,symbol:g.symbol,uic:g.uic});});return;
  }
  if(!portfolio&&!orders){host.innerHTML=disconnected;return;}
  if(ordersError&&!orders){host.innerHTML=`<p role="alert">${e(ordersError)}</p><button type="button" class="td-button" data-retry-orders>${L('Retry','Prøv igen')}</button>`;host.querySelector('[data-retry-orders]').onclick=()=>loadBroker(true);return;}
  if(dock==='orders'){
   const list=orders?.orders||[];
   if(!list.length){host.innerHTML=`<p class="td-muted">${L('No working orders. Filled orders appear under Positions.','Ingen aktive ordrer. Handlede ordrer vises under Positioner.')}</p>`;return;}
   host.innerHTML=`<table class="td-table"><thead><tr><th scope="col">${L('Instrument','Værdipapir')}</th><th scope="col">${L('Side','Retning')}</th><th scope="col">${L('Quantity','Antal')}</th><th scope="col">${L('Type','Type')}</th><th scope="col">${L('Limit','Limit')}</th><th scope="col">${L('Distance to last','Afstand til seneste')}</th><th scope="col">${L('Duration','Varighed')}</th><th scope="col">${L('Status','Status')}</th><th scope="col">${L('Placed','Afgivet')}</th></tr></thead><tbody>${list.map((o,i)=>{
    const quote=[...quotes.values()].map(q=>q.data).find(d=>d&&(same(d.symbol,o.symbol)))||(snapshot&&same(snapshot.symbol,o.symbol)?snapshot:null),last=quote&&(!o.currency||same(quote.currency,o.currency))?quote.price:null,distance=finite(last)&&finite(o.price)?(o.price/last-1)*100:null,partial=finite(o.filledQuantity)&&o.filledQuantity>0;
    return `<tr><th scope="row"><button type="button" class="td-inst" data-open-order="${i}"><span class="td-mono" aria-hidden="true">${monogram(o.symbol)}</span><span>${e(o.name||o.symbol||o.uic)}</span></button></th><td class="${o.side==='Sell'?'td-down':'td-up'}">${e(side(o.side))}</td><td>${partial?`${e(qty(o.filledQuantity))} ${L('of','af')} ${e(qty(o.quantity))}`:e(qty(o.quantity))}</td><td>${e(o.orderType||'—')}</td><td>${finite(o.price)?money(+o.price,o.currency||''):'—'}</td><td>${distance!=null?e(pct(distance)):'—'}</td><td>${e(o.duration||'—')}</td><td><span class="td-state ${partial?'partial':''}">${e(partial?L('Partially filled','Delvist handlet'):o.status||L('Working','Aktiv'))}</span></td><td>${o.placedAt?e(fmt(o.placedAt)):'—'}</td></tr>`;}).join('')}</tbody></table>${orders.hasMore?`<p class="td-muted">${L('Showing the first 100 orders.','Viser de første 100 ordrer.')}</p>`:''}`;
   host.querySelectorAll('[data-open-order]').forEach(b=>b.onclick=()=>{const o=list[+b.dataset.openOrder],symbol=o.researchSymbol||o.symbol;if(symbol)select({name:o.name,symbol,uic:o.uic});});return;
  }
  const events=[...history.map(x=>({name:x.name||x.orderId,detail:[x.status,x.subStatus].filter(Boolean).join(' · '),time:x.time})),...receipts.map(r=>({name:r.name,detail:`${side(r.input?.side)} ${qty(r.input?.quantity)} · ${r.state}${r.orderId?' · #'+r.orderId:r.error?' · '+r.error:''}`,time:r.submittedAt||r.createdAt,banking:true}))];
  host.innerHTML=events.length?`<table class="td-table"><thead><tr><th scope="col">${L('Instrument','Værdipapir')}</th><th scope="col">${L('Event','Hændelse')}</th><th scope="col">${L('Time','Tid')}</th></tr></thead><tbody>${events.map(x=>`<tr><th scope="row">${e(x.name||'—')}${x.banking?` <span class="td-chip">${L('From Banking','Fra Banking')}</span>`:''}</th><td>${e(x.detail||'—')}</td><td>${x.time?e(fmt(x.time)):'—'}</td></tr>`).join('')}</tbody></table>`:`<p class="td-muted">${L('No broker activity in the last seven days.','Ingen mægleraktivitet de seneste syv dage.')}</p>`;
  if(orders?.historyError)host.insertAdjacentHTML('beforeend',`<p class="td-muted" role="status">${e(orderMessage({code:orders.historyError}))}</p>`);
 }

 /* ---------- Saxo connection and account ---------- */
 // The header shows each Saxo connection once: a status button, or the signed-out control with its single sign-in action.
 function tradingAuthView(state,visible){return saxoAuthView({name:`Saxo ${environment}`,state,compact:true,visible,L});}
 function marketAuthView(kind){
  return saxoAuthView({name:L('Saxo LIVE market data','Saxo LIVE-markedsdata'),state:kind||'required',canSignIn:S.mode==='Live',busy:marketConnecting,visible:!!kind,actionNote:S.mode==='Live'?L('Your trading mode stays unchanged.','Dit handelsmiljø ændres ikke.'):'',L});
 }
 // The sign-in state of LIVE market data, from the last quote or chart failure. It shares the LIVE sign-in with the LIVE trading environment.
 function drawMarketAuth(){
  const code=[marketBlock?.code,chartBlocked].find(c=>signinCodes.includes(c));
  saxoAuthApply(mk('#td-market-auth'),marketAuthView(code&&!(environment==='LIVE'&&brokerAuth)?saxoAuthKind(code)||'required':null));
 }
 function brokerState(state,label,message='',action=null){
  const button=mk('#td-connection'),detail=root?.querySelector('#td-broker-message');if(!button)return;
  const signedOut=state==='required'||state==='expired';
  saxoAuthApply(mk('#td-auth'),tradingAuthView(signedOut?state:'required',signedOut));
  button.hidden=signedOut;drawMarketAuth();
  button.dataset.state=signedOut?'disconnected':state;button.disabled=state==='checking';button.onclick=action;button.title=state==='connected'?L('Refresh Saxo connection','Opdatér Saxo-forbindelse'):label;
  mk('#td-connection-label').textContent=label;if(detail){detail.textContent=message;detail.hidden=!message;}
 }
 async function loadBroker(background=false){
  const run=++brokerRun;
  if(!background){portfolio=null;orders=null;ordersError='';status=null;brokerError='';brokerIssue=null;brokerAuth=null;root.querySelector('.mk-account-drawer')?.close();brokerState('checking',L('Checking…','Kontrollerer…'));drawAccount(true);drawList();drawTicket();drawDock();}
  try{const nextStatus=await read('investments/saxo/status?environment='+environment);if(!live()||run!==brokerRun)return;status=nextStatus;
   if(!status.configured){portfolio=null;orders=null;brokerAuth=status.setup?.credentialsReady?'required':null;brokerIssue=brokerAuth?'signin':'unconfigured';brokerError=brokerAuth?'':L('This Saxo environment is not configured yet.','Dette Saxo-miljø er endnu ikke konfigureret.');}
   else{const loaded=await post('investments/saxo/preview?environment='+environment);if(!live()||run!==brokerRun)return;portfolio=loaded;brokerIssue=null;brokerAuth=null;brokerError='';
    try{orders=await read('investments/saxo/orders?environment='+environment);ordersError='';}catch(err){if(err?.name==='AbortError')return;ordersError=orderMessage(err);if(!background)orders=null;}
    if(!live()||run!==brokerRun)return;}
   brokerState(portfolio?'connected':brokerAuth||'disconnected',portfolio?L('Connected','Forbundet'):L(`Connect Saxo ${environment}`,`Forbind Saxo ${environment}`),'',portfolio?()=>loadBroker():connect);
   mk('#td-read').textContent=portfolio?`Saxo ${environment} · ${clock(portfolio.observedAt)}`:'';
  }catch(err){if(!live()||run!==brokerRun||err?.name==='AbortError')return;
   if(background&&portfolio){mk('#td-read').textContent=`Saxo ${environment} · ${clock(portfolio.observedAt)} · ${L('refresh failed','opdatering fejlede')}`;return;}
   portfolio=null;orders=null;brokerAuth=saxoAuthKind(err?.code);
   if(brokerAuth){brokerIssue='signin';brokerError='';brokerState(brokerAuth,'','',connect);}
   else{brokerIssue='error';brokerError=error(err);brokerState('error',L('Retry connection','Prøv igen'),brokerError,()=>loadBroker());}
   mk('#td-read').textContent='';}
  drawAccount();drawList();drawDock();drawSummary();drawStats();if(!background||!['form','review','receipt'].includes(ticket.step))drawTicket();if(snapshot&&chart)drawChart(snapshot,true);
 }
 // Without Saxo data a signed-out session only says so: the header control holds the sign-in action. A failed read offers Retry.
 function signedOutState(what){
  if(brokerIssue==='signin')return marketsSignedOutMarkup({kind:brokerAuth,what},{L,e});
  const title=brokerIssue==='error'?L('Saxo could not be reached','Saxo kunne ikke nås'):brokerIssue==='unconfigured'?L(`Saxo ${environment} is not set up`,`Saxo ${environment} er ikke sat op`):L('Saxo account','Saxo-konto');
  const message=brokerIssue==='unconfigured'?L('Add Saxo credentials for this environment before connecting.','Tilføj Saxo-adgang for dette miljø, før du forbinder.'):brokerError||what;
  const action=brokerIssue==='error'?`<button type="button" class="primary" data-broker-inline>${L('Retry connection','Prøv igen')}</button>`:'';
  return `<div class="td-empty td-signed-out" role="status"><strong>${e(title)}</strong><p>${e(message)}</p>${action}</div>`;
 }
 function drawAccount(loading=false){
  const host=root?.querySelector('#td-account');if(!host)return;
  const accounts=portfolio?.accounts||[];accountIndex=Math.min(accountIndex,Math.max(0,accounts.length-1));const a=accounts[accountIndex];
  if(!a){host.innerHTML=loading?`<p class="td-muted" role="status">${L('Loading Saxo account…','Henter Saxo-konto…')}</p>`:signedOutState(L(`Saxo ${environment} account details are unavailable.`,`Saxo ${environment}-kontooplysninger er ikke tilgængelige.`));host.querySelector('[data-broker-inline]')?.addEventListener('click',brokerIssue==='error'?()=>loadBroker():connect);return;}
  host.innerHTML=`<div class="td-account-meta"><span>Saxo <b>${e(environment)}</b> · ${e(a.currency)}${accounts.length===1&&a.id?` · ${L('Account','Konto')} ${e(String(a.id).slice(-4))}`:''}</span>${accounts.length>1?`<select aria-label="${L('Saxo account','Saxo-konto')}">${accounts.map((x,i)=>`<option value="${i}" ${i===accountIndex?'selected':''}>${e(x.id)} · ${e(x.currency)}</option>`).join('')}</select>`:''}</div>
   ${a.reliability&&a.reliability!=='Ok'?`<p class="td-warning" role="status">${L('Saxo reports incomplete balance calculations. Open details before trading.','Saxo melder om ufuldstændige saldoberegninger. Åbn detaljer før handel.')} ${e(a.reliability)}</p>`:''}
   <dl class="td-kv">${[[L('Account value','Kontoværdi'),a.value],[L('Available to trade','Til handel'),a.available],[L('Invested','Investeret'),a.invested],[L('Unbooked activity','Ikke bogført'),a.unbooked]].map(([label,value])=>`<div><dt>${label}</dt><dd>${money(value,a.currency)}</dd></div>`).join('')}</dl>
   ${environment==='SIM'?`<p class="td-muted">${L('Simulation funds · excluded from your net worth','Simulationsmidler · ikke medregnet i din formue')}</p>`:''}<button type="button" class="td-button" data-account-details aria-haspopup="dialog">${L('Account details','Kontooplysninger')}</button>`;
  host.querySelector('select')?.addEventListener('change',ev=>{accountIndex=+ev.target.value;drawAccount();if(ticket.step==='form')drawTicket();});
  host.querySelector('[data-account-details]').onclick=()=>showAccountDetails(a);
 }
 function orderDialog(title){
  root.querySelector('.mk-order-dialog')?.remove();const d=document.createElement('dialog');d.className='creation-modal mk-order-dialog';d.setAttribute('aria-label',title);
  d.innerHTML=`<div class="creation-header"><h2>${e(title)}</h2><button class="mk-ticket-close" aria-label="${L('Close','Luk')}">×</button></div><div class="mk-ticket-body"></div>`;root.append(d);d.querySelector('button').onclick=()=>d.close();d.onclose=()=>d.remove();d.showModal();return d;
 }
 function showAccountDetails(a){
  const d=orderDialog(L('Saxo account','Saxo-konto'));d.classList.add('mk-account-drawer');const n=v=>v==null?'—':new Intl.NumberFormat(S.lang==='da'?'da-DK':'en-GB',{style:'currency',currency:a.currency}).format(v);
  const row=(label,value)=>`<dt>${label}</dt><dd>${e(value)}</dd>`,yn=v=>v==null?'—':v?L('Yes','Ja'):L('No','Nej');
  d.querySelector('.mk-ticket-body').innerHTML=`<p class="mk-sim-label">${e(environment)} · ${e(a.currency)} · ${L('Account','Konto')} ${e(a.id)}</p><div class="mk-account-detail-value"><span>${L('Account value','Kontoværdi')}</span><strong>${e(n(a.value))}</strong></div><dl class="mk-order-summary">${row(L('Booked cash','Bogførte kontanter'),n(a.cash))}${row(L('Invested','Investeret'),n(a.invested))}${row(L('Unbooked activity','Ikke bogført'),n(a.unbooked))}${row(L('Available to trade','Til handel'),n(a.available))}${row(L('Blocked cash','Reserverede kontanter'),n(a.blocked))}</dl><p class="muted">${L('Account value already includes cash and unbooked activity.','Kontoværdien inkluderer allerede kontanter og ikke-bogført aktivitet.')}</p><h3>${L('Awaiting booking','Afventer bogføring')}</h3><dl class="mk-order-summary">${row(L('Commission','Kurtage'),n(a.commission))}${row(L('Exchange fees','Børsgebyrer'),n(a.exchangeFees))}${row(L('Share transactions','Aktiehandler'),n(a.shareValue))}</dl><details><summary>${L('Margin and account details','Margin og kontooplysninger')}</summary><dl class="mk-order-summary">${row(L('Margin used','Anvendt margin'),n(a.marginUsed))}${row(L('Margin available','Tilgængelig margin'),n(a.marginAvailable))}${row(L('Margin utilisation','Marginudnyttelse'),a.marginUtilization==null?'—':a.marginUtilization+'%')}${row(L('Account type','Kontotype'),a.accountType||'—')}${row(L('Fractional shares','Brøkaktier'),yn(a.fractionalOrders))}${row(L('FX conversion at settlement','Valutaveksling ved afvikling'),yn(a.conversionAtSettlement))}</dl></details><p class="mk-account-detail-source">Saxo ${e(environment)} · ${e(fmt(portfolio.observedAt))}<br>${L('Calculation status','Beregningsstatus')}: ${e(a.reliability||L('Unavailable','Ukendt'))}${environment==='SIM'?'<br>'+L('Simulation funds · excluded from your net worth','Simulationsmidler · ikke medregnet i din formue'):''}</p>`;
 }
 async function connect(){
  const run=++brokerRun;brokerState('checking',L('Connecting…','Forbinder…'));
  try{const next=await post('investments/saxo/connect?environment='+environment+'&returnUrl='+encodeURIComponent(location.origin+'/#/markets'));if(live()&&run===brokerRun)beginSaxoSignIn(next);}
  catch(err){if(live()&&run===brokerRun){const message=err.code==='SAXO_CALLBACK_REGISTRATION_REQUIRED'?L('Saxo sign-in is not configured for this environment yet.','Saxo-login er endnu ikke konfigureret for dette miljø.'):err.code==='SAXO_SIM_ACCESS_REQUIRED'||err.code==='SAXO_ACCESS_REQUIRED'?L('Saxo credentials are not configured for this environment.','Saxo-adgang er ikke konfigureret for dette miljø.'):error(err);brokerState('error',L('Retry connection','Prøv igen'),message,connect);}}
 }
 // The remote widgets are isolated display-only documents, like the old insights board.
 // They cannot see Banking cookies, holdings, API responses or the advisor's context.
 function widget(node,type,config,title){
  const frame=document.createElement('iframe');frame.title=title;frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-popups');frame.referrerPolicy='no-referrer';
  // The remote origin is preserved for TradingView's own storage. No third-party
  // script runs at Banking's origin; the browser's same-origin boundary protects it.
  frame.src='https://www.tradingview-widget.com/embed-widget/'+type+'/?locale='+(S.lang==='da'?'da_DK':'en')+'#'+encodeURIComponent(JSON.stringify({...config,colorTheme:['light','sand'].includes(S.theme)?'light':'dark',width:'100%',height:'100%',utm_source:'banking',utm_medium:'widget',utm_campaign:type}));node.replaceChildren(frame);
 }
 function loadHeatmap(){if(!live())return;widget(root.querySelector('#td-heatmap'),'stock-heatmap',{dataSource:root.querySelector('#td-universe').value,blockSize:'market_cap_basic',blockColor:'change',grouping:'sector',hasTopBar:false,isDataSetEnabled:false,isZoomEnabled:true,hasSymbolTooltip:true},L('Market heatmap by TradingView','Markeds-heatmap fra TradingView'));}
 function tvSymbol(){if(!snapshot)return null;const s=snapshot.symbol;const venue={xnas:'NASDAQ:',xnys:'NYSE:',xcse:'OMXCOP:',xetr:'XETR:'};if(s.includes(':')){const [ticker,exchange]=s.split(':');return venue[exchange.toLowerCase()]?venue[exchange.toLowerCase()]+ticker:null;}const suffix={'.CO':'OMXCOP:', '.DE':'XETR:', '.L':'LSE:', '.PA':'EURONEXT:', '.ST':'OMXSTO:', '.AS':'EURONEXT:'};for(const [end,prefix] of Object.entries(suffix))if(s.endsWith(end))return prefix+s.slice(0,-end.length).replaceAll('-','_');if(/nasdaq/i.test(snapshot.exchange))return 'NASDAQ:'+s;if(/NYSE|New York/i.test(snapshot.exchange))return 'NYSE:'+s;return null;}
 function loadFundamentals(){const node=root.querySelector('#td-fundamentals'),symbol=tvSymbol();if(!symbol){node.innerHTML=`<div class="td-empty"><p>${selected?L('Company insights are unavailable for this exchange.','Selskabsindsigt er ikke tilgængelig for denne børs.'):L('Select an instrument using search or your watchlist.','Vælg et værdipapir via søgning eller observationslisten.')}</p></div>`;return;}widget(node,'financials',{symbol,autosize:true,displayMode:'regular',isTransparent:false},L('Company fundamentals by TradingView','Selskabsnøgletal fra TradingView'));}
 return {render,dispose};
}
