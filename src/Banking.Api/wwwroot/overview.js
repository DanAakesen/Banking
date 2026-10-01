import {saxoEnvironment,rememberSaxoEnvironment} from './saxo-session.js';
import {investmentSummary,investmentSettlementMarkup} from './wealth-ui.js';
// Overview presentation. All amounts come from scoped API aggregates, never mock values.

// A broker snapshot is deliberately separate from wealth360Model and its personal totals.
export function saxo360Model(snapshot,environment='SIM') {
 const valid=['SIM','LIVE'].includes(environment)&&snapshot?.environment===environment&&snapshot.simulation===(environment==='SIM');
 const portfolio=valid&&!snapshot.portfolioError?snapshot.portfolio:null;
 const summary=investmentSummary(portfolio);
 const orders=valid&&!snapshot.ordersError&&Array.isArray(snapshot.orders)?snapshot.orders:null;
 return {...summary,holdings:Array.isArray(portfolio?.positions)?portfolio.positions.length:null,
  holdingsMore:portfolio?.hasMore===true,orders:orders?.length??null,ordersMore:snapshot?.ordersHasMore===true,
  observedAt:portfolio?.observedAt||null,ordersObservedAt:valid?snapshot.ordersObservedAt:null,
  partial:!valid||snapshot.status!=='Ok'||portfolio?.reliability!=='Ok',personalWealthContribution:0};
}

function mountSaxo360(parent,{S,e,money,api}) {
 const L=(en,da)=>S.lang==='da'?da:en;
 let environment=saxoEnvironment(S.mode),run=0;const mode=S.mode;
 const panel=document.createElement('section');panel.className='w360-saxo';
 panel.setAttribute('aria-label','Saxo '+environment);
 panel.innerHTML=`<header><h2>Saxo ${environment}</h2><div>${S.mode==='Live'?`<select data-saxo-environment aria-label="${L('Saxo environment','Saxo-miljø')}"><option value="SIM">SIM</option><option value="LIVE">LIVE · ${L('Read only','Kun læsning')}</option></select>`:''}<button type="button" data-saxo-refresh>${L('Refresh','Opdatér')}</button><a href="#/investments">${L('View investments','Se investeringer')} →</a></div></header><p class="muted" data-saxo-context></p><div class="w360-saxo-data" aria-live="polite"></div>`;
 parent.append(panel);
 const output=panel.querySelector('.w360-saxo-data'),button=panel.querySelector('button');
 const stamp=value=>value?new Date(value).toLocaleString(S.lang==='da'?'da-DK':'en-GB',{dateStyle:'medium',timeStyle:'short'}):'—';
 async function refresh(){
  const requestRun=++run;
  panel.querySelector('h2').textContent='Saxo '+environment;
  panel.querySelector('[data-saxo-context]').textContent=environment==='SIM'?L('Simulation · excluded from personal wealth','Simulation · indgår ikke i personlig formue'):L('LIVE · read only · separate from recorded wealth to avoid double counting','LIVE · kun læsning · separat fra registreret formue for at undgå dobbelttælling');
  button.disabled=true;output.setAttribute('aria-busy','true');
  output.textContent=L('Reading Saxo…','Henter fra Saxo…');
  try{
   const snapshot=await api('investments/saxo/portfolio?environment='+environment);
   if(!panel.isConnected||requestRun!==run||S.mode!==mode)return;
   const m=saxo360Model(snapshot,environment),cashLabel=m.unbooked?L('Cash after settlement','Kontanter efter afvikling'):L('Cash','Kontanter'),amount=n=>n==null||!m.currency?'—':money(n,m.currency);
   const count=(n,more)=>n==null?'—':String(n)+(more?'+':'');
   output.innerHTML=`<dl class="w360-saxo-metrics">${[[L('Account value','Kontoværdi'),amount(m.total)],[L('Booked cash','Bogførte kontanter'),amount(m.cash)],[L('Invested','Investeret'),amount(m.invested)],[L('Holdings','Beholdninger'),count(m.holdings,m.holdingsMore)],[L('Open orders','Åbne ordrer'),count(m.orders,m.ordersMore)]].map(([label,value])=>`<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>${investmentSettlementMarkup(m,{L,money})}${m.allocation?`<div class="w360-saxo-allocation" role="img" aria-label="${e(cashLabel+' '+m.allocation.cash.toFixed(1)+'%; '+L('Invested','Investeret')+' '+m.allocation.invested.toFixed(1)+'%')}"><span data-share="${m.allocation.cash}"></span><span data-share="${m.allocation.invested}"></span></div><div class="w360-saxo-key"><span>${cashLabel} ${m.allocation.cash.toFixed(1)}%</span><span>${L('Invested','Investeret')} ${m.allocation.invested.toFixed(1)}%</span></div>`:''}<p class="muted">${L('Balances read','Saldi hentet')}: ${e(stamp(m.observedAt))} · ${L('Orders read','Ordrer hentet')}: ${e(stamp(m.ordersObservedAt))}</p>${m.partial?`<p role="status">${L('Some Saxo data is unavailable. Unknown values are shown as —.','Nogle Saxo-data er utilgængelige. Ukendte værdier vises som —.')}</p>`:''}`;
   output.querySelectorAll('[data-share]').forEach(x=>x.style.width=x.dataset.share+'%');
  }catch{
   if(panel.isConnected&&requestRun===run&&S.mode===mode)output.innerHTML=`<p role="status">${L('Saxo data could not be loaded. Retry or check your Saxo connection in Investments.','Saxo-data kunne ikke hentes. Prøv igen, eller kontrollér Saxo-forbindelsen i Investeringer.')}</p><a href="#/investments">${L('Check connection','Kontrollér forbindelse')} →</a>`;
  }finally{if(requestRun===run){button.disabled=false;output.removeAttribute('aria-busy');}}
 }
 const selector=panel.querySelector('[data-saxo-environment]');if(selector){selector.value=environment;selector.onchange=()=>{environment=S.mode==='Live'&&selector.value==='LIVE'?'LIVE':'SIM';rememberSaxoEnvironment(environment);void refresh();};}
 button.addEventListener('click',refresh);void refresh();
}
// Category glyphs follow the category name (Danish or English), never list position.
export const categoryIconPaths={
 'cat-home':'M3 10 12 3l9 7M5 9v12h14V9M10 21v-6h4v6',
 'cat-cart':'M3 4h2l2.4 11h10.2L20 7H6.2M9 20h.01M17 20h.01',
 'cat-car':'M3 13l2-6h14l2 6v4H3zM3 13h18M7 17v2M17 17v2M7 15h.01M17 15h.01',
 'cat-child':'M12 7a3 3 0 1 0 0-6 3 3 0 0 0 0 6M8 22v-6l-3-3 3-3h8l3 3-3 3v6M10 16h4',
 'cat-dining':'M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 2-2 6 0 8v10',
 'cat-leisure':'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
 'cat-shield':'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
 'cat-health':'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
 'cat-shirt':'M8 3 3 6l2 4 2-1v12h10V9l2 1 2-4-5-3a4 4 0 0 1-8 0',
 'cat-gift':'M3 8h18v4H3zM5 12v9h14v-9M12 8v13M12 8S10 3 7.5 3a2.5 2.5 0 0 0 0 5M12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5',
 'cat-plane':'M2 16l20-8-7 13-3-6zM12 15l10-7',
 'cat-repeat':'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3',
 'cat-bolt':'M13 2 4 14h7l-1 8 9-12h-7z',
 'cat-bag':'M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2',
 'cat-coins':'M12 3c-4.4 0-8 1.3-8 3s3.6 3 8 3 8-1.3 8-3-3.6-3-8-3M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6',
 'cat-question':'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7M12 17h.01',
 'cat-tag':'M3 12V3h9l9 9-9 9zM7.5 7.5h.01'
};
const categoryRules=[
 ['cat-question',/^(uncategori[sz]ed|ukategoriseret|uden kategori)/],
 ['cat-coins',/indkomst|income|salary|løn\b|lon\b|refund|tilbagebetal/],
 ['goals',/opsparing|saving/],
 ['cat-home',/bolig|housing|husleje|\brent\b|home|hjem|have\b|garden|hus\b|house/],
 ['cat-cart',/dagligvare|grocer|supermarked|supermarket|food|mad\b/],
 ['cat-car',/transport|fuel|benzin|brændstof|\bcar\b|\bbil|parkering|parking|pendler/],
 ['cat-child',/børn|born\b|child|kids|institution|skole|school/],
 ['cat-dining',/restaurant|dining|takeaway|café|cafe|kaffe|coffee|frokost|lunch/],
 ['cat-shield',/forsikring|insurance/],
 ['cat-health',/sundhed|health|apotek|pharmacy|tandlæge|dental|læge|doctor/],
 ['cat-shirt',/tøj|toj\b|cloth|sko\b|shoes/],
 ['cat-gift',/gave|gift/],
 ['cat-plane',/ferie|holiday|travel|rejse|vacation/],
 ['cat-repeat',/abonnement|subscription|streaming|medlemskab|membership|fagforening|union/],
 ['cat-bolt',/forsyning|utilit|\bel\b|varme|heating|vand|water|internet|mobil|phone/],
 ['cat-leisure',/fritid|leisure|sport|hobby|outing|oplevelse|entertainment|kultur/],
 ['cat-bag',/indkøb|indkob|shopping|forbrug|household|husholdning/]
];
export function categoryIcon(name,{other=false}={}){
 if(other)return 'more';
 const value=String(name||'').trim().toLowerCase();
 if(!value)return 'cat-tag';
 return categoryRules.find(([,pattern])=>pattern.test(value))?.[0]||'cat-tag';
}
// Goals without a photo get a distinct colour and a glyph from their name instead of a shared scene.
export function goalGlyph(name){const key=categoryIcon(name);return key==='cat-tag'||key==='cat-question'||key==='cat-coins'?'goals':key;}
export function goalTone(id){let h=0;for(const c of String(id||''))h=(h*31+c.charCodeAt(0))>>>0;return h%6;}
export function demoGoalPhoto(name){const n=String(name||'').trim().toLowerCase();return /^(car|bil)$/.test(n)?'car':/^(summer house|sommerhus)$/.test(n)?'summer-house':null;}
export function balanceAgeDays(p,now=Date.now()){const times=(p?.sources||[]).map(s=>Date.parse(s.bankTime||s.observedAt)).filter(Number.isFinite);return times.length?Math.max(0,Math.floor((now-Math.min(...times))/86400000)):null;}
export function staleBalanceText(p,t){const days=balanceAgeDays(p);return days==null?t('Balance is out of date.'):t(days===1?'Balance is 1 day old. Status updates after the next sync.':'Balance is {n} days old. Status updates after the next sync.').replace('{n}',days);}
export function dayScene(now = new Date()) {
 const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Copenhagen',hour:'numeric',hourCycle:'h23'}).format(now));
 return hour>=5&&hour<12?'morning':hour>=12&&hour<18?'afternoon':'evening';
}
export function flowModel(info) {
 const income=Math.max(0,info.income),spending=Math.max(0,info.spending);
 const categories=info.categories.filter(c=>c.amount>0).slice().sort((a,b)=>b.amount-a.amount);
 const groups=categories.slice(0,3);
 if(categories.length>3)groups.push({categoryId:null,other:true,amount:categories.slice(3).reduce((s,c)=>s+c.amount,0)});
 return {income,spending,retained:Math.max(0,income-spending),drawdown:Math.max(0,spending-income),total:Math.max(income,spending),groups};
}
export function createOverview({S,t,e,money,moneyText,date,locale,icon,colour,categoryName,sectionAction,statusName,statusClass}) {
 const cash=(n,c=S.currency)=>money(n,c,{minimumFractionDigits:0,maximumFractionDigits:2});
 const percent=n=>new Intl.NumberFormat(locale(),{maximumFractionDigits:1}).format(n)+'%';
 const symbol=(name,cls='')=>`<span class="ov-symbol ${cls}" aria-hidden="true">${icon(name)}</span>`;
 const head=(title,action='')=>`<div class="section-head"><h2>${t(title)}</h2>${action}</div>`;
 function pulse(trends) {
  return `<div class="ov-pulse"><div class="ov-pulse-heading"><h3>${t('Financial pulse')}</h3><small><i class="ov-key current"></i>${t('Selected period')} <i class="ov-key previous"></i>${t('Previous period')}</small></div><div class="ov-pulse-grid">${[['Income','income','positive','investments'],['Spending','spending','warning','activity'],['Net saved','net','','budgets']].map(([label,key,cls,sym])=>{
   const current=trends.currentCoverage.accountCount?trends.current[key]:null,previous=trends.previousCoverage.accountCount?trends.previous[key]:null,max=Math.max(Math.abs(current||0),Math.abs(previous||0),1);
   return `<div class="ov-pulse-item">${symbol(sym,cls)}<div><h4>${t(label)}</h4>${[[current,'current',t('Selected period')],[previous,'previous',t('Previous period')]].map(([value,kind,caption])=>`<div class="ov-pulse-value ${kind}" title="${e(caption)}"><span class="sr-only">${caption}: </span><span class="ov-track"><i class="${value<0?'deficit':''}" data-width="${Math.abs(value||0)/max*100}%"></i></span><strong class="${value<0?'negative':''}">${cash(value)}</strong></div>`).join('')}</div></div>`;
  }).join('')}</div><small class="ov-comparison">${t('Compared with')} ${date(trends.previousFrom)} – ${date(trends.previousTo)}${!trends.comparable?' · '+t('Incomplete history'):''}</small></div>`;
 }
 function sankey(info) {
  const m=flowModel(info),known=info.coverage.accountCount>0;
  if(!known||!m.total)return `<div class="ov-chart-empty">${symbol('accounts')}<h3>${t(known?'No transactions in this period.':'No data')}</h3><p>${t('Choose another period to explore your cash flow.')}</p></div>`;
  const height=240,scale=height/m.total,top=28,gap=22,sy=top,sp=m.spending*scale,ret=m.retained*scale,inc=m.income*scale,draw=m.drawdown*scale;
  const ribbon=(x1,y1,x2,y2,h,cls)=>h>0?`<path class="ov-ribbon ${cls}" d="M${x1},${y1} C${(x1+x2)/2},${y1} ${(x1+x2)/2},${y2} ${x2},${y2} L${x2},${y2+h} C${(x1+x2)/2},${y2+h} ${(x1+x2)/2},${y1+h} ${x1},${y1+h}Z"/>`:'';
  const node=(x,y,h,cls)=>h>0?`<rect x="${x}" y="${y}" width="14" height="${h}" rx="5" class="ov-node ${cls}"/>`:'';
  const label=(x,y,width,title,value)=>`<div class="ov-flow-label" data-flow-x="${x/770*100}" data-flow-y="${Math.max(0,y)}" data-flow-width="${width/770*100}"><span>${e(title)}</span><strong>${cash(value)}</strong></div>`;
  let paths='',nodes='',labels='',offset=0,sinkOffset=0;
  paths+=ribbon(14,sy,286,top,Math.min(inc,sp),'spend');
  if(draw)paths+=ribbon(14,sy+inc+gap,286,top+inc,draw,'drawdown');
  if(ret)paths+=ribbon(14,sy+sp,286,top+sp+gap,ret,'retained');
  nodes+=node(0,sy,inc,'income')+node(0,sy+inc+gap,draw,'drawdown')+node(286,top,sp,'spend')+node(286,top+sp+gap,ret,'retained');
  if(inc)labels+=label(24,sy+inc/2-20,200,t('Income'),m.income);
  if(draw)labels+=label(24,sy+inc+gap+draw/2-20,225,t('Drawn from balance'),m.drawdown);
  if(sp)labels+=label(310,top+sp/2-22,165,t('Spent'),m.spending);
  if(ret)labels+=label(310,top+sp+gap+ret/2-20,170,t('Retained'),m.retained);
  m.groups.forEach((g,i)=>{const h=g.amount*scale,slot=Math.max(h,48),y=top+sinkOffset+(slot-h)/2;paths+=ribbon(300,top+offset,555,y,h,'spend');nodes+=node(555,y,h,'spend');labels+=label(580,y+h/2-20,180,g.other?t('Other categories'):categoryName(g.categoryId),g.amount);offset+=h;sinkOffset+=slot+14;});
  const viewHeight=Math.max(330,top+sinkOffset+15);
  return `<div class="ov-sankey" data-income="${m.income}" data-spending="${m.spending}" data-retained="${m.retained}" data-drawdown="${m.drawdown}"><div class="ov-flow-stage" data-flow-height="${viewHeight}"><svg class="ov-sankey-svg" preserveAspectRatio="none" viewBox="0 0 770 ${viewHeight}" role="img" aria-label="${e(`${t('Income')} ${moneyText(m.income)}; ${t('Spending')} ${moneyText(m.spending)}; ${t('Net saved')} ${moneyText(info.net)}`)}">${paths}${nodes}</svg>${labels}</div><div class="ov-flow-mobile"><div>${t('Income')}<strong>${cash(m.income)}</strong></div>${m.drawdown?`<div class="negative">${t('Drawn from balance')}<strong>${cash(m.drawdown)}</strong></div>`:''}<div class="ov-mobile-flow-track"><i data-width="${m.spending/m.total*100}%"></i></div><div>${t('Spent')}<strong>${cash(m.spending)}</strong></div><div class="positive">${t('Retained')}<strong>${cash(m.retained)}</strong></div></div></div>`;
 }
 function spending(info) {
  const groups=info.categories.slice(0,3);
  if(info.categories.length>3)groups.push({other:true,categoryId:null,amount:info.categories.slice(3).reduce((sum,g)=>sum+g.amount,0)});
  return `<section class="ov-panel ov-mix">${head('Spending mix',sectionAction('View all','#/accounts'))}<small>${t('Total spending')} ${cash(info.coverage.accountCount?info.spending:null)}</small><div class="ov-mix-list">${groups.map(g=>`<a href="#/accounts" data-action="overview-category" data-id="${e(g.categoryId||'')}" class="ov-mix-row ${colour(g.categoryId,'category')}">${symbol(g.other?'more':g.categoryId?categoryIcon(categoryName(g.categoryId)):'cat-question')}<span class="ov-mix-name">${e(g.other?t('Other categories'):categoryName(g.categoryId))}</span><span class="ov-track"><i data-width="${info.spending?g.amount/info.spending*100:0}%"></i></span><strong>${cash(g.amount)}</strong><small>${percent(info.spending?g.amount/info.spending*100:0)}</small></a>`).join('')||`<p class="muted">${t('No spending in this period.')}</p>`}</div></section>`;
 }
 function journeys(goals,progress) {
  return `<section class="ov-panel ov-journeys">${head('Goal journey',sectionAction('View all','#/goals'))}${goals.length?goals.slice(0,3).map((g,i)=>{const p=progress[i],value=p.completionPercent,pc=Math.max(0,Math.min(100,value||0));return `<a class="ov-journey" data-status="${e(p.status)}" href="#/goals/${e(g.id)}"><div class="ov-goal-top"><span class="ov-symbol ov-goal-visual" data-tone="${goalTone(g.id)}" ${S.mode==='Demo'&&demoGoalPhoto(g.name)?`data-photo="${demoGoalPhoto(g.name)}"`:''} aria-hidden="true">${icon(goalGlyph(g.name))}</span><div><h3>${e(g.name)}</h3><small>${e(g.scope==='Account'?S.accounts.find(a=>a.id===g.accountId)?.name||t('Inactive'):t('Choose a dedicated account'))}</small></div><span class="ov-status ${statusClass(p.status)}">${t(statusName(p.status))}</span></div><div class="ov-goal-amount"><strong>${cash(p.measuredBalance,p.currency)}</strong><small>/ ${cash(p.target,p.currency)}</small><b>${value==null?'—':percent(value)}</b></div><div class="ov-journey-track" role="progressbar" aria-label="${e(g.name)}" aria-valuemin="0" aria-valuemax="100" ${value==null?'':`aria-valuenow="${pc}"`}><i data-width="${pc}%"></i><span data-left="${pc}%"></span></div><div class="ov-goal-milestones"><small>${t('Started')}<br>${date(g.planStart||g.createdAt)}</small><small>${t('Target')}${g.deadline?'<br>'+date(g.deadline):''}</small></div>${p.reason?`<small class="ov-goal-reason">${t(p.reason==='DEDICATED_ACCOUNT_REQUIRED'?'Choose a dedicated account':p.reason==='NO_ACTIVE_PLAN'?'No active plan':p.reason==='STALE_BALANCE'?staleBalanceText(p,t):p.reason==='MISSING_BOOKED_BALANCE'?'Missing balance':p.reason==='MIXED_CURRENCY_REQUIRES_CONVERSION'?'Multiple currencies cannot be combined without conversion.':'No data')}</small>`:''}</a>`;}).join(''):`<div class="ov-empty-goal">${symbol('goals')}<h3>${t('No goals yet')}</h3><p>${t('Track an account balance toward something that matters.')}</p>${sectionAction('Create goal','#/goals/new')}</div>`}</section>`;
 }

 function advisor(info,previous,review) {
  const changes=info.categories.filter(g=>g.categoryId).map(g=>({...g,previous:previous.categories.find(p=>p.categoryId===g.categoryId)?.amount||0})).filter(g=>g.previous>0&&g.amount>g.previous).sort((a,b)=>(b.amount-b.previous)-(a.amount-a.previous));
  const change=info.coverage.sufficientHistory&&previous.coverage.sufficientHistory?changes[0]:null;
  const categoryCount=review.counts?.categories??0;
  return `<aside class="ov-panel ov-advisor">${head('Your advisor',`<span class="ov-preview">${t('Preview')}</span>`)}<h3 class="ov-attention-title">${t('What deserves your attention')}</h3><div class="ov-advice">${symbol(change?'investments':'budgets',change?'negative':'positive')}<div><h4>${change?`${e(categoryName(change.categoryId))} · ${cash(change.amount-change.previous)} ${t('more')}`:info.retentionPercent!=null?`${percent(info.retentionPercent)} ${t('of income retained')}`:t('Your spending, in perspective')}</h4><p>${change?`${t('Selected period')}: ${cash(change.amount)}<br>${t('Previous period')}: ${cash(change.previous)}`:info.coverage.accountCount?`${t('Income')}: ${cash(info.income)}<br>${t('Spending')}: ${cash(info.spending)}`:t('Explore the categories behind your spending.')}</p>${sectionAction('Review spending','#/accounts')}</div></div><div class="ov-advice">${symbol('review')}<div><h4>${categoryCount?`${categoryCount} ${t('transactions need a category')}`:t('Your review queue')}</h4><p>${categoryCount?t('Categorise these entries for a clearer spending breakdown.'):review.total?`${review.total} ${t('items to review')}`:t('You are all caught up.')}</p>${sectionAction('Open review','#/review')}</div></div><div class="ov-advisor-footer"><button type="button" data-action="advisor" class="ov-ask">${icon('advisor')}<span>${t('Ask your advisor')}</span><span aria-hidden="true">→</span></button><small>${t('Data insights · AI not connected')}</small></div></aside>`;
 }
 function updateGreeting(root) {
  const hero=root.querySelector('.ov-welcome');if(!hero)return;
  const scene=dayScene();hero.dataset.scene=scene;hero.querySelector('time').textContent=date(new Date());
  const greeting={morning:'Good morning',afternoon:'Good afternoon',evening:'Good evening'}[scene];
  hero.querySelector('[data-greeting]').textContent=t(greeting)+(S.mode==='Live'?', Dan.':'.');
 }
 function render(root,{selected,total,trends,info,previous,upcoming,goals,progress,review,range}) {
  const nonnegative=total>0&&selected.every(x=>x.balance?.amount>=0);
  const observed=selected.map(x=>x.balance?.observedAt).filter(x=>x&&Number.isFinite(Date.parse(x))).sort((a,b)=>Date.parse(a)-Date.parse(b));
  const balanceNote=info.balanceStale?`<small class="ov-balance-note"><span>${S.mode==='Demo'?(S.lang==='da'?'Demodata · saldi fra':'Demo data · balances from'):(S.lang==='da'?'Ældste saldoopdatering:':'Oldest balance update:')} ${observed.length?e(date(observed[0])):(S.lang==='da'?'dato ikke tilgængelig':'date unavailable')}</span>${S.mode==='Demo'?'':`<a href="#/connections">${S.lang==='da'?'Se bankforbindelse og synkronisering':'Check bank connection and sync'}</a>`}</small>`:'';
  root.innerHTML=`<section class="ov-welcome" data-scene="${dayScene()}"><div class="ov-welcome-top"><div><h2 data-greeting></h2></div><time>${date(new Date())}</time></div><div class="ov-hero-pills"><button type="button" data-action="overview-money" data-kind="disposable">${symbol('budgets',info.disposableAmount<0?'negative':'positive')}<span>${t('Available to spend')}<strong>${cash(info.disposableAmount)}</strong><small>${t('Selected period')}</small></span></button><button type="button" data-action="overview-money" data-kind="savings">${symbol('goals')}<span>${t('Total savings')}<strong>${cash(info.totalSavings)}</strong><small>${t(info.savingsAccountCount?'Savings accounts':'Select savings accounts')}</small></span></button></div><section class="ov-cash"><div class="ov-cash-total"><h2>${t('Cash balance')}</h2><strong>${cash(total)}</strong></div>${nonnegative?`<div class="ov-account-allocation" aria-label="${t('Your accounts')}">${selected.map(x=>`<span class="${colour(x.account.id)}" data-flex="${x.balance.amount/total}" title="${e(x.account.name+' · '+moneyText(x.balance.amount))}"></span>`).join('')}</div>`:''}<div class="ov-accounts">${selected.map(x=>`<a href="#/accounts" data-action="overview-account" data-id="${e(x.account.id)}" class="ov-account ${colour(x.account.id)}"><i></i><span>${e(x.account.name)}<strong>${cash(x.balance?.amount)}</strong></span></a>`).join('')}</div>${total==null?`<small>${t('Missing balance')}</small>`:balanceNote}</section></section><div class="ov-main-grid"><section class="ov-panel ov-motion" id="ov-motion">${head('Cash Flow')}${pulse(trends)}${sankey(info)}${!info.coverage.sufficientHistory||info.excludedUndatedBookedCount?`<small class="ov-basis">${[!info.coverage.sufficientHistory?t('Incomplete history'):null,info.excludedUndatedBookedCount?t('Undated entries excluded')+': '+info.excludedUndatedBookedCount:null].filter(Boolean).join(' · ')}</small>`:''}</section>${advisor(info,previous,review)}</div><div class="ov-bottom-grid">${spending(info)}${journeys(goals,progress)}</div>`;
  root.querySelectorAll('[data-flow-x]').forEach(el=>{el.style.left=el.dataset.flowX+'%';el.style.top=Number(el.dataset.flowY)/Number(el.closest('[data-flow-height]').dataset.flowHeight)*100+'%';el.style.width=el.dataset.flowWidth+'%';});
  root.querySelectorAll('[data-width]').forEach(el=>{el.style.width=el.dataset.width;});
  root.querySelectorAll('[data-left]').forEach(el=>{el.style.left=el.dataset.left;});
  root.querySelectorAll('[data-flex]').forEach(el=>{el.style.flex=el.dataset.flex;});
  updateGreeting(root);
  root.querySelector('a[href="#ov-motion"]')?.addEventListener('click',event=>{event.preventDefault();root.querySelector('#ov-motion').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});});
 }
 return {render,updateGreeting};
}

// The 360 view includes recorded assets only; missing records are not confirmed zeroes.
export function wealth360Model(total, records, currency) {
 const amount=kind=>{const rows=(records||[]).filter(x=>x.kind===kind&&x.currency===currency);return rows.length?rows.reduce((s,x)=>s+x.value,0):null;};
 const investments=records===null?null:amount('Investment'),pension=records===null?null:amount('Pension');
 const values=[total,investments,pension];
 return {values,total:total==null?null:values.reduce((s,x)=>s+(x??0),0),partial:values.some(x=>x==null),chartable:total!=null&&values.every(x=>x==null||x>=0)&&values.some(x=>x>0)};
}
// Calendar-shaped fixtures for the Demo workspace; never used for Live financial history.
export function calendarMetricSeries(from,to,values,monthlySavings=9300){
 const start=new Date(from+'T12:00:00Z'),end=new Date(to+'T12:00:00Z');
 const days=Math.min(366,Math.max(1,Math.round((end-start)/86400000)+1));
 const dates=Array.from({length:days},(_,i)=>new Date(end.getTime()-(days-1-i)*86400000));
 const payday=d=>{const p=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0,12));while([0,6].includes(p.getUTCDay()))p.setUTCDate(p.getUTCDate()-1);return p;};
 const pay=dates.map(d=>d.getTime()===payday(d).getTime()?1:0),count=pay.reduce((a,b)=>a+b,0);
 const weights=dates.map(d=>d.getUTCDate()===1?7:[5,6].includes(d.getUTCDay())?1.5:.7),weight=weights.reduce((a,b)=>a+b,0);
 let paid=0,spent=0;
 const rows=dates.map((d,i)=>{paid+=pay[i];spent+=weights[i];let last=payday(d);if(d<last)last=payday(new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),0,12)));const age=(d-last)/86400000;return {income:count?paid/count:1,spending:spent/weight,pulses:paid,allowance:Math.max(.08,1-age/33)};});
 const last=rows.at(-1),value=i=>Number(values[i]??0);
 return [rows.map(r=>value(0)*r.allowance/last.allowance),
 rows.map(r=>value(1)+(r.income-last.income)*value(3)-(r.spending-last.spending)*value(4)),
 rows.map(r=>Math.max(0,value(2)-(last.pulses-r.pulses)*monthlySavings)),
 rows.map(r=>r.income*value(3)),rows.map(r=>r.spending*value(4)),
 rows.map(r=>value(5)+(1-r.spending)*value(4))];
}
// Select a dated series with interpolated boundaries, without extrapolating missing history.
export function wealthPeriodSeries(history,from,to){
 const points=[...history].sort((a,b)=>a.date.localeCompare(b.date));
 if(!points.length)return [];
 const start=from>points[0].date?from:points[0].date,end=to<points.at(-1).date?to:points.at(-1).date;
 if(start>end)return [];
 const at=date=>{const exact=points.find(p=>p.date===date);if(exact)return exact;const j=points.findIndex(p=>p.date>date),a=points[j-1],b=points[j],f=(Date.parse(date)-Date.parse(a.date))/(Date.parse(b.date)-Date.parse(a.date));return {date,value:a.value+(b.value-a.value)*f};};
 return [at(start),...points.filter(p=>p.date>start&&p.date<end),...(end>start?[at(end)]:[])];
}
// Demo-only daily pension fixture: month-end deposits and accrued growth, anchored to the statement.
export function pensionPeriod(pension,history,from,to){
 if(!pension||history.length<2)return null;
 const end=history.at(-1).date,start=history[0].date,days=[];
 for(let d=new Date(start+'T00:00:00Z');d<=new Date(end+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+1))days.push(d.toISOString().slice(0,10));
 let deposits=0,growth=0;
 const totals=days.map((date,i)=>{const d=new Date(date+'T00:00:00Z'),pay=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0));while(pay.getUTCDay()===0||pay.getUTCDay()===6)pay.setUTCDate(pay.getUTCDate()-1);if(i&&date===pay.toISOString().slice(0,10))deposits+=pension.contributions/100;if(i)growth+=(pension.contributions+pension.returns)*.045/365;return {date,deposits,growth};});
 const selected=totals.filter(p=>p.date>=from&&p.date<=to);if(selected.length<2)return null;
 return {from:selected[0].date,to:selected.at(-1).date,contributions:selected.at(-1).deposits-selected[0].deposits,returns:selected.at(-1).growth-selected[0].growth};
}
export function mount360(root,{S,t,e,money,date,icon,api},{selected,total,info,upcoming,range,records,visuals,budget,flow}) {
 const L=(en,da)=>S.lang==='da'?da:en, cash=n=>n==null?'—':money(n,S.currency,{minimumFractionDigits:0,maximumFractionDigits:0});
 const model=wealth360Model(total,records,S.currency), names=[L('Cash','Kontanter'),L('Investments','Investeringer'),L('Pension','Pension')];
 if(selected.some(x=>x.balance?.amount<0))model.chartable=false;
 const routes=['accounts','investments','pension'];
 const observed=selected.map(x=>x.balance?.observedAt).filter(Boolean).sort()[0];
 const balanceDate=observed?date(observed):L('Date unavailable','Dato mangler');
 const period=`${date(range.from)} – ${date(range.to)}`;
 let wealthRange;
 const setWealthRange=()=>{const end=new Date();end.setHours(12,0,0,0);const start=new Date(end);const key=S.wealthPeriod||'1m';if(key==='1w')start.setDate(start.getDate()-6);else{start.setMonth(start.getMonth()-({'1m':1,'3m':3,'6m':6,'1y':12}[key]||1));start.setDate(start.getDate()+1);}const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;wealthRange=key==='custom'?{from:S.wealthFrom||iso(start),to:S.wealthTo||iso(end)}:{from:iso(start),to:iso(end)};;window.dispatchEvent(new CustomEvent('banking:section-context',{detail:{section:'wealth',...wealthRange,currency:S.currency}}));};setWealthRange();
 const remaining=budget?.plan?.currency===S.currency&&budget?.actuals?budget.plan.monthly.expenses-budget.actuals.actualExpenses:null;
 const budgetLabel=budget?.actuals?L('This month · spent to date','Denne måned · forbrugt til dato'):L('No active budget','Intet aktivt budget');
 const items=upcoming.estimates||[];
 const spark=key=>{const pts=flow?.points||[];if(pts.length<2)return '';const vals=pts.map(x=>Number(x[key]));const max=Math.max(...vals,1);return `<svg class="w360-spark" viewBox="0 0 160 30" preserveAspectRatio="none" aria-hidden="true"><polyline points="${vals.map((v,i)=>`${i/(vals.length-1)*160},${28-v/max*24}`).join(' ')}"/></svg>`;};
 const metrics=[
 [t('Available to spend'),info.disposableAmount,t('Selected period'),'budgets','disposable',''],
 [L('Total cash','Kontantbeholdning'),total,balanceDate,'accounts','',''],
 [t('Total savings'),info.totalSavings,L('Included in cash','Indgår i kontanter'),'goals','savings',''],
 [t('Income'),info.coverage.accountCount?info.income:null,t('Selected period'),'investments','',spark('income')],
 [t('Spending'),info.coverage.accountCount?info.spending:null,t('Selected period'),'activity','',spark('spending')],
 [L('Budget remaining','Tilbage i budgettet'),remaining,budgetLabel,'budgets','',remaining==null?'':`<span class="w360-budget-track"><i data-share="${budget.plan.monthly.expenses>0?Math.max(0,Math.min(100,remaining/budget.plan.monthly.expenses*100)):0}"></i></span>`],
 [L('Upcoming expenses','Kommende udgifter'),items.length?items.reduce((s,x)=>s+x.amount,0):null,L('Next 7 days · estimated','Næste 7 dage · estimeret'),'activity','upcoming','']];
 // Synthetic time-series fixtures are supplied only by the Demo endpoint.
 if(S.mode==='Demo'&&visuals?.synthetic&&visuals.currency===S.currency){const series=calendarMetricSeries(range.from,range.to,metrics.map(m=>m[1]),budget?.plan?.monthly?.savings??9300);metrics.forEach((metric,i)=>{const vals=series[i];if(metric[1]==null||!vals?.length)return;const min=Math.min(...vals),max=Math.max(...vals),pad=Math.max((max-min)*.2,1);let coords=vals.map((v,j)=>[j/Math.max(1,vals.length-1)*160,28-(v-min+pad)/(max-min+2*pad)*24]);if([0,1,2,3].includes(i))coords=coords.flatMap((p,j)=>j?[[p[0],coords[j-1][1]],p]:[p]);const pts=coords.map(p=>p.join(',')).join(' ');metric[5]=`<svg class="w360-spark w360-demo-spark" viewBox="0 0 160 30" preserveAspectRatio="none" role="img" aria-label="${e(metric[0]+' · '+period)}"><polyline points="${pts}"/><circle cx="160" cy="${coords.at(-1)[1]}" r="2"/></svg>`;});}
 const next=items.slice().sort((a,b)=>a.expectedDate.localeCompare(b.expectedDate))[0];
 metrics[6][5]=`<span class="w360-upcoming-count"><b>${items.length}</b><span>${L(items.length===1?'upcoming payment':'upcoming payments',items.length===1?'kommende betaling':'kommende betalinger')}<small>${next?L('Next: ','Næste: ')+date(next.expectedDate):L('No payments identified','Ingen betalinger fundet')}</small></span></span>`;

 const point=(r,a)=>[250+r*Math.cos((a-90)*Math.PI/180),250+r*Math.sin((a-90)*Math.PI/180)];
 const wedge=(inner,outer,start,end)=>{end=Math.min(end,start+359.99);const [a,b,c,d]=[point(outer,start),point(outer,end),point(inner,end),point(inner,start)];return `M${a} A${outer},${outer} 0 ${end-start>180?1:0} 1 ${b} L${c} A${inner},${inner} 0 ${end-start>180?1:0} 0 ${d} Z`;};
 let angle=0;
 const segments=model.chartable?model.values.map((value,i)=>{if(!(value>0))return '';const span=value/model.total*360,start=angle;angle+=span;return `<path class="w360-sector w360-asset-${i}" data-asset="${i}" tabindex="0" role="button" aria-label="${e(names[i]+' '+value+' '+S.currency)}" d="${wedge(123,241,start+Math.min(.4,span/4),angle-Math.min(.4,span/4))}"><title>${e(names[i])}: ${e(String(value))} ${e(S.currency)}</title></path>`;}).join(''):'';
 let labelAngle=0;
 const labels=model.chartable?model.values.map((value,i)=>{const span=(value||0)/model.total*360,mid=labelAngle+span/2;labelAngle+=span;if(span<30)return '';const [x,y]=point(182,mid);return `<text class="w360-chart-label" x="${x}" y="${y-5}" text-anchor="middle">${e(names[i])}<tspan x="${x}" dy="19">${Math.round(value/model.total*100)}%</tspan></text>`;}).join(''):'';
 let accountAngle=0;
 const outer=model.chartable?selected.map((x,i)=>{if(!(x.balance?.amount>0))return '';const start=accountAngle;accountAngle+=x.balance.amount/model.total*360;return `<path class="w360-account-arc w360-arc-${i%5}" data-account="${i}" tabindex="0" role="button" aria-label="${e(x.account.name)}" d="${wedge(179,241,start+Math.min(.35,(accountAngle-start)/4),accountAngle-Math.min(.35,(accountAngle-start)/4))}"><title>${e(x.account.name)}: ${x.balance.amount} ${e(S.currency)}</title></path>`;}).join(''):'';
 const accountRows=selected.map((x,i)=>`<a class="w360-account" data-row="${i}" href="#/accounts" data-action="overview-account" data-id="${e(x.account.id)}"><span class="w360-dot w360-tone-${i%5}"></span><span class="w360-account-name">${e(x.account.name)}<span class="w360-account-track"><i class="w360-tone-${i%5}" data-share="${total>0?Math.max(0,x.balance?.amount||0)/total*100:0}"></i></span></span><strong>${cash(x.balance?.amount)}</strong><span aria-hidden="true">›</span></a>`).join('');
 const recordRows=kind=>(records||[]).filter(x=>x.kind===kind&&x.currency===S.currency).map(x=>`<a class="w360-record" href="#/${kind==='Pension'?'pension':'investments'}"><span>${e(x.name)}<small>${e(x.provider)} · ${date(x.asOf)}</small></span><strong>${cash(x.value)}</strong></a>`).join('');
 const demoVisuals=S.mode==='Demo'&&visuals?.synthetic&&visuals.currency===S.currency?visuals:null;
 const investmentVisual=()=>{const points=wealthPeriodSeries(demoVisuals?.investment?.history||[],wealthRange.from,wealthRange.to);if(points.length<2)return '';const vals=points.map(x=>x.value),lo=Math.min(...vals)*.99,hi=Math.max(...vals)*1.01,coords=vals.map((v,i)=>`${i/(vals.length-1)*300},${70-(v-lo)/(hi-lo||1)*60}`).join(' ');return `<div class="w360-invest-visual"><svg viewBox="0 0 300 86" preserveAspectRatio="none" role="img" aria-label="${e(date(wealthRange.from)+' – '+date(wealthRange.to))}"><defs><linearGradient id="w360-trend-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#78c4b8" stop-opacity=".3"/><stop offset="1" stop-color="#78c4b8" stop-opacity="0"/></linearGradient></defs><polygon points="0,86 ${coords} 300,86" fill="url(#w360-trend-fill)"/><polyline points="${coords}"/><title>${date(points[0].date)} – ${date(points.at(-1).date)}: ${points[0].value} – ${points.at(-1).value} ${e(S.currency)}</title></svg><div><strong>${points[0].value>0?((points.at(-1).value/points[0].value-1)*100).toLocaleString(S.lang==='da'?'da-DK':'en-GB',{maximumFractionDigits:1,signDisplay:'always'})+'%':'—'}</strong><small>${date(points[0].date)} – ${date(points.at(-1).date)}</small></div></div>`;};
 const pensionVisual=()=>{const asOf=(records||[]).filter(x=>x.kind==='Pension'&&x.currency===S.currency).map(x=>x.asOf).sort()[0];const end=asOf?.slice(0,10),start=end?new Date(Date.parse(end)-180*86400000).toISOString().slice(0,10):null;const p=pensionPeriod(demoVisuals?.pension,start?[{date:start},{date:end}]:[],wealthRange.from,wealthRange.to);if(!p||model.values[2]<=0)return '';return `<div class="w360-pension-visual"><small>${date(p.from)} – ${date(p.to)}</small><div class="w360-pension-track" role="img" aria-label="${e(L('Contributions','Indbetalinger')+' '+p.contributions+'; '+L('Returns','Afkast')+' '+p.returns+' '+S.currency)}"><i data-share="${p.contributions/(p.contributions+p.returns||1)*100}"></i><b></b></div><div class="w360-pension-key"><span><i></i>${L('Contributions','Indbetalinger')}<strong>${cash(p.contributions)}</strong></span><span><i></i>${L('Returns','Afkast')}<strong>${cash(p.returns)}</strong></span></div></div>`;};
 const assetVisual=i=>i===1?investmentVisual():pensionVisual();
 const el=document.createElement('section');el.className='w360';el.dataset.active='0';el.setAttribute('aria-label',L('Financial overview','Økonomisk overblik'));
 el.innerHTML=`
 <div class="w360-metrics" aria-label="${L('Everyday finances','Daglig økonomi')}" tabindex="0">${metrics.map(([label,value,note,glyph,action,trend],i)=>`<${action?'button':'a'} class="w360-metric w360-asset-${i%3}" ${action?'type="button"':`href="${i===5?'#/budgets':'#/accounts'}"`} ${action?`data-action="${action==='upcoming'?'upcoming':'overview-money'}" ${action==='upcoming'?'':`data-kind="${action}"`}`:''}><span class="w360-metric-label"><i>${icon(glyph)}</i>${label}</span><strong>${cash(value)}</strong><small>${e(note)}</small>${trend}</${action?'button':'a'}>`).join('')}</div><div class="w360-pages" aria-label="${L('Finance cards','Økonomikort')}">${metrics.map((x,i)=>`<button type="button" data-metric-page="${i}" aria-label="${e(x[0])}" aria-current="${i===0}"><span></span></button>`).join('')}</div>
 <div class="w360-body"><div class="w360-chart"><svg viewBox="0 0 500 500" aria-label="${L('Recorded asset allocation','Fordeling af registrerede aktiver')}"><defs>${[['cash','#739edd','#30588f'],['invest','#6bafa7','#284f55'],['pension','#a386c4','#544075']].map(([id,a,b])=>`<radialGradient id="w360-${id}-fill" cx="45%" cy="40%" r="70%"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient>`).join('')}</defs><circle class="w360-ring-base" cx="250" cy="250" r="183"/>${segments}<circle class="w360-inner-seam" cx="250" cy="250" r="179"/>${outer}${labels}</svg><div class="w360-center"><span>${L('Recorded assets','Registrerede aktiver')}</span><strong>${cash(model.total)}</strong>${model.partial?`<small>${L('Partial overview','Delvist overblik')}</small>`:''}${!model.chartable?`<small>${L('Allocation unavailable','Fordeling utilgængelig')}</small>`:''}</div></div>
 <div class="w360-tabs" role="group" aria-label="${L('Asset details','Aktivdetaljer')}">${names.map((name,i)=>`<button class="w360-asset-${i}" data-asset="${i}" aria-pressed="${i===0}"><span class="w360-dot"></span><span>${name}<strong>${cash(model.values[i])}</strong></span></button>`).join('')}</div>
 <div class="w360-panels">${names.map((name,i)=>`<section class="w360-panel w360-asset-${i}" data-panel="${i}"><header><div class="w360-panel-title"><i>${icon(['accounts','investments','pension'][i])}</i><div><h3>${name}</h3><strong>${cash(model.values[i])}</strong><small>${i===0?balanceDate:i===2?L('Restricted · dated statements','Bundet · daterede opgørelser'):L('Non-cash · dated statements','Værdipapirer · daterede opgørelser')}</small></div></div><a href="#/${routes[i]}">${L('View','Se')} ›</a></header><div class="w360-details">${i===0?(accountRows||`<p>${L('No bank accounts yet','Ingen bankkonti endnu')}</p>`):(assetVisual(i)||recordRows(i===1?'Investment':'Pension'))||`<p>${records===null?L('Data unavailable. Reload to retry.','Data kunne ikke hentes. Genindlæs for at prøve igen.'):L('No recorded value yet','Ingen registreret værdi endnu')}</p><a href="#/${routes[i]}">${L('Add statement value','Tilføj værdi fra opgørelse')} →</a>`}</div></section>`).join('')}</div></div>
`;
 root.querySelector('.ov-welcome')?.replaceWith(el);
 // Keep each date selector beside the content it controls.
 const wealth=document.createElement('section');wealth.className='w360-wealth';
 wealth.innerHTML=`<div class="w360-wealth-controls"><label><span class="w360-period-label">${L('Period','Periode')}</span><select aria-label="${L('Investment and pension period','Periode for investeringer og pension')}">${[['1w','1 week'],['1m','1 month'],['3m','3 months'],['6m','6 months'],['1y','1 year'],['custom','Custom']].map(([v,label])=>`<option value="${v}" ${v===(S.wealthPeriod||'1m')?'selected':''}>${t(label)}</option>`).join('')}</select></label><div class="w360-wealth-custom" hidden><input type="date" aria-label="${L('Wealth period from','Formueperiode fra')}" value="${wealthRange.from}"><input type="date" aria-label="${L('Wealth period to','Formueperiode til')}" value="${wealthRange.to}"></div></div><div class="w360-wealth-panels"></div>`;
 for(const panel of el.querySelectorAll('[data-panel="1"],[data-panel="2"]'))wealth.querySelector('.w360-wealth-panels').append(panel);
 el.append(wealth);
 if(api)mountSaxo360(el,{S,e,money,api});
 const refreshWealth=()=>{setWealthRange();for(const i of [1,2]){const details=wealth.querySelector(`[data-panel="${i}"] .w360-details`);details.innerHTML=assetVisual(i)||recordRows(i===1?'Investment':'Pension');details.querySelectorAll('[data-share]').forEach(x=>x.style.width=x.dataset.share+'%');}wealth.querySelector('.w360-wealth-custom').hidden=S.wealthPeriod!=='custom';};
 wealth.querySelector('select').addEventListener('change',ev=>{S.wealthPeriod=ev.target.value;refreshWealth();});
 const dates=wealth.querySelectorAll('input');dates.forEach(input=>input.addEventListener('change',()=>{if(!dates[0].value||!dates[1].value||dates[0].value>dates[1].value)return;S.wealthFrom=dates[0].value;S.wealthTo=dates[1].value;refreshWealth();}));
 wealth.querySelector('.w360-wealth-custom').hidden=S.wealthPeriod!=='custom';

 el.querySelectorAll('[data-share]').forEach(x=>x.style.width=x.dataset.share+'%');
 function activate(index){el.dataset.active=String(index);el.querySelectorAll('.w360-tabs button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.asset===String(index))));el.querySelectorAll('.w360-sector').forEach(p=>p.classList.toggle('selected',p.dataset.asset===String(index)));}
 el.querySelectorAll('[data-asset]').forEach(x=>{x.addEventListener('click',()=>activate(x.dataset.asset));if(x.tagName.toLowerCase()==='path')x.addEventListener('keydown',ev=>{if(['Enter',' '].includes(ev.key)){ev.preventDefault();activate(x.dataset.asset);}});});
 function selectAccount(index){activate(0);el.querySelectorAll('[data-row]').forEach(x=>x.classList.toggle('selected',x.dataset.row===String(index)));el.querySelectorAll('[data-account]').forEach(x=>x.classList.toggle('selected',x.dataset.account===String(index)));el.querySelector(`[data-row="${index}"]`)?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});}
 el.querySelectorAll('[data-account]').forEach(x=>{x.addEventListener('click',()=>selectAccount(x.dataset.account));x.addEventListener('keydown',ev=>{if(['Enter',' '].includes(ev.key)){ev.preventDefault();selectAccount(x.dataset.account);}});});
 const track=el.querySelector('.w360-metrics');el.querySelectorAll('[data-metric-page]').forEach(b=>b.onclick=()=>{const card=track.children[+b.dataset.metricPage];track.scrollTo({left:card.offsetLeft-track.children[0].offsetLeft,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});});
 track.addEventListener('scroll',()=>{const idx=track.scrollLeft>0&&track.scrollLeft>=track.scrollWidth-track.clientWidth-2?track.children.length-1:Math.round(track.scrollLeft/(track.children[0].getBoundingClientRect().width+12));el.querySelectorAll('[data-metric-page]').forEach(b=>b.setAttribute('aria-current',String(+b.dataset.metricPage===idx)));},{passive:true});activate(0);el.querySelector('[data-row="0"]')?.classList.add('selected');el.querySelector('[data-account="0"]')?.classList.add('selected');
}
