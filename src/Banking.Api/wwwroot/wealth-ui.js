import {mountEmployeeStockPreview} from './employee-stock-ui.js';
import {mountPensionImports} from './pension-import-ui.js';
import {beginSaxoSignIn,finishSaxoSignIn,saxoEnvironment,rememberSaxoEnvironment,saxoAuthKind,saxoAuthStatus,saxoAuthView,saxoAuthMarkup,saxoAuthApply,saxoDelayLabel,saxoResponseMeta,saxoRetainedSnapshot,saxoUpdateFailed,saxoClock,saxoGapNote,saxoLivePoll,SAXO_SHORT_RANGES,SAXO_LIVE_REFRESH_MS} from './saxo-session.js';
// Legacy JSON preview helper; retained uploads use the private pension history endpoint.
export function pensionPreviewDocument(document) {
 const field=(v,key)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.entries(v).find(([k])=>k.toLowerCase()===key.toLowerCase())?.[1]:undefined;
 const text=(v,max)=>typeof v==='string'&&v.length<=max?v:null;
 const providers=field(document,'PensionProviders');
 if(!Array.isArray(providers))throw {code:'PENSIONSINFO_PROVIDERS_REQUIRED'};
 if(providers.length>100)throw {code:'PENSION_IMPORT_LIMIT'};
 return {PensionProviders:providers.map(p=>{
  const schemes=field(p,'Schemes');if(Array.isArray(schemes)&&schemes.length>100)throw {code:'PENSION_IMPORT_LIMIT'};
  return {PensionProviderName:text(field(p,'PensionProviderName'),120),CurrencyCode:text(field(p,'CurrencyCode'),3),Schemes:Array.isArray(schemes)?schemes.map(s=>{
   const reference=field(s,'ReferenceNumber'),benefits=field(s,'Benefits');
   return {SavedValue:typeof field(s,'SavedValue')==='number'?field(s,'SavedValue'):null,SavedValueDate:text(field(s,'SavedValueDate'),40),ReferenceNumber:typeof reference==='string'?'••'+reference.slice(-4):undefined,
    Benefits:Array.isArray(benefits)&&benefits.some(b=>{const v=field(b,'Pension');return v&&typeof v==='object'&&!Array.isArray(v);})?[{Pension:{}}]:[]};
  }):null};
 })};
}
export function statementAmount(value,lang='en') {
 const text=String(value??'').trim();
 const valid=lang==='da'?/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/:/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/;
 if(!valid.test(text))return null;
 const amount=Number(lang==='da'?text.replaceAll('.','').replace(',','.'):text.replaceAll(',',''));
 return Number.isFinite(amount)&&amount>=0&&amount<=100000000?amount:null;
}
export function createWealthUI({S,t,e,money,date,today,api,post,header,input,button,dialog,leave,navigate,errorText,confirmAction,validateForms,composeScene}) {
 const investments=createInvestmentWorkspace({S,e,money,api,post,header,errorText,composeScene});
 const L=(en,da)=>S.lang==='da'?da:en;
 let records=[],disposeEmployeeStock=()=>{};
 const amountInput=v=>v==null?'':String(v).replace('.',S.lang==='da'?',':'.');
 const age=x=>Math.floor((Date.parse(today())-Date.parse(x))/86400000);
 async function render(main,kind) {
  if(kind==='Investment'){
   const seq=S.seq;const broker=investments.render(main).catch(err=>{if(seq===S.seq&&main.isConnected)main.querySelector('.inv-workspace').textContent=errorText(err);});if(seq!==S.seq||!main.isConnected)return;
   main.insertAdjacentHTML('beforeend','<section id="employee-stock-preview"></section><section id="manual-investments" class="loan-card"><h2>'+L('Other recorded investments','Andre registrerede investeringer')+'</h2><div id="manual-investment-values"></div><button id="manual-investment-add" type="button">+ '+L('Add statement value','Tilføj værdi fra opgørelse')+'</button></section>');
   disposeEmployeeStock=mountEmployeeStockPreview(main.querySelector('#employee-stock-preview'),{S,e,money,date,today,api});
   main.querySelector('#manual-investment-add').onclick=()=>edit('Investment');
   try{const all=await api('wealth');if(seq!==S.seq||!main.isConnected)return;records=all.filter(x=>x.kind==='Investment');
    main.querySelector('#manual-investment-values').innerHTML=records.map(x=>`<div class="wealth-row"><div><strong>${e(x.name)}</strong><small>${e(x.provider)} · ${date(x.asOf)}</small></div><strong>${money(x.value,x.currency)}</strong><button data-manual-edit="${e(x.id)}">${t('Edit')}</button></div>`).join('')||'<p>'+L('No external statement values recorded. An empty list can be correct.','Ingen eksterne opgørelsesværdier registreret. En tom liste kan være korrekt.')+'</p>';
    main.querySelectorAll('[data-manual-edit]').forEach(b=>b.onclick=()=>edit('Investment',records.find(x=>x.id===b.dataset.manualEdit)));
   }catch(err){if(seq===S.seq&&main.isConnected)main.querySelector('#manual-investment-values').textContent=errorText(err);}await broker;return;
  }
  const seq=S.seq;
  const [all,summary,saxo]=await Promise.all([api('wealth'),api('wealth/summary?currency='+S.currency),kind==='Investment'?api('investments/saxo/status'):null]);
  if(seq!==S.seq||!main.isConnected)return;records=all.filter(x=>x.kind===kind);
  const pension=kind==='Pension',total=records.filter(x=>x.currency===S.currency).reduce((s,x)=>s+x.value,0);
  main.insertAdjacentHTML('beforeend',header(pension?'Pension':'Investments',`<div class="overview-controls"><small>${L('Dated statements · manual updates','Daterede opgørelser · manuel opdatering')}</small><div class="controls"><button id="new-valuation" class="primary">+ ${L('Add statement value','Tilføj værdi fra opgørelse')}</button></div></div>`)+`<section class="loan-hero pension-summary"><div class="loan-head-metrics"><div><small>${L('Recorded value','Registreret værdi')} · ${e(S.currency)}</small><strong>${records.some(x=>x.currency===S.currency)?money(total):'—'}</strong><small>${L('Dated statements · no automatic sync','Daterede opgørelser · ingen automatisk synkronisering')}</small></div></div><div class="pension-facts"><div><small>${L('Recorded products','Registrerede produkter')} · ${e(S.currency)}</small><strong>${records.filter(x=>x.currency===S.currency).length}</strong></div><div><small>${L('Oldest statement','Ældste opgørelse')}</small><strong>${date(records.filter(x=>x.currency===S.currency).map(x=>x.asOf).sort()[0])}</strong></div></div></section>${pension?`<div id="pension-imports"></div>`:""}<div class="wealth-layout"><section><div class="loan-grid">${records.length?records.map(x=>`<article class="loan-card"><div class="loan-title"><h2>${e(x.name)}</h2><button data-valuation-edit="${x.id}" aria-label="${e(t('Edit')+' '+x.name)}">${t('Edit')}</button></div><small>${e(x.provider)} · ${date(x.asOf)}${age(x.asOf)>30?' · '+L('Older statement','Ældre opgørelse'):''}</small><div class="wealth-value">${money(x.value,x.currency)}</div>${x.annualPension!=null?`<p>${L('Statement projection at age','Opgørelsens prognose ved alder')} ${e(x.retirementAge)}: <strong>${money(x.annualPension,x.currency)} / ${L('year','år')}</strong></p><small>${L('Before tax. Not added to the balance. Assumptions come from the statement.','Før skat. Lægges ikke til saldoen. Forudsætninger fremgår af opgørelsen.')}</small>`:''}<p class="muted">${e(x.sourceNote)}</p><small>${L('Manual statement snapshot','Manuelt øjebliksbillede fra opgørelse')}</small><div class="loan-actions"><button data-valuation-delete="${x.id}">${t('Delete')}</button></div></article>`).join(''):`<article class="loan-card"><h2>${pension?L('No pension data yet','Ingen pensionsdata endnu'):L('No investments recorded','Ingen investeringer registreret')}</h2><p>${L('Add a value from a statement to start. Missing values are not treated as a confirmed zero.','Tilføj en værdi fra en opgørelse for at starte. Manglende data er ikke et bekræftet nul.')}</p><button id="first-valuation">+ ${L('Add statement value','Tilføj værdi fra opgørelse')}</button></article>`}</div><section class="loan-card wealth-provider"><h2>${pension?'PFA · PensionsInfo':'Saxo OpenAPI'}</h2><p>${pension?L('Automatic integration is unavailable and parked. Add values from your statement, then update the same product when a newer statement arrives.','Automatisk integration er utilgængelig og sat på pause. Tilføj værdier fra din opgørelse, og opdatér samme produkt, når der kommer en nyere opgørelse.'):saxo.configured?L('SIM access is configured. Preview your simulation account without adding it to your wealth.','SIM-adgang er konfigureret. Se din simulationskonto uden at medregne den i formuen.'):saxo.setup?.credentialsReady?L('SIM credentials are ready. Register the Banking callback in Saxo, then sign in. Live access is not enabled.','SIM-oplysninger er klar. Registrér Bankings callback hos Saxo, og log ind. Live-adgang er ikke aktiveret.'):L('SIM credentials are needed before the connection can be tested. Live access is not enabled.','SIM-adgang skal konfigureres, før forbindelsen kan testes. Live-adgang er ikke aktiveret.')}</p>${!pension&&saxo.configured?`<button id="saxo-preview">${L('Read SIM portfolio','Læs SIM-portefølje')}</button><div id="saxo-result" aria-live="polite"></div>`:''}<a href="${pension?'https://www.pensionsinfo.dk/':'https://www.developer.saxo/openapi/learn/security'}" target="_blank" rel="noopener noreferrer">${pension?'PensionsInfo':'Saxo Developer Portal'} ↗</a></section></section><aside class="loan-card wealth-summary"><h2>${L('Recorded wealth','Registreret formue')}</h2><p class="muted">${L('Selected currency','Valgt valuta')}: ${e(S.currency)}</p>${[[L('Bank cash (booked)','Bankindestående (bogført)'),summary.bankCash],[L('Non-cash investments','Værdipapirer'),summary.investments],[L('Pension · restricted','Pension · bundet'),summary.pension],[L('Actual debt','Faktisk gæld'),summary.debt? -summary.debt:0]].map(([name,value])=>`<div class="wealth-row"><span>${name}</span><strong>${money(value)}</strong></div>`).join('')}<div class="wealth-row wealth-total"><span>${L('Recorded net wealth','Registreret nettoformue')}</span><strong>${money(summary.recordedNetWealth)}</strong></div><div class="wealth-row"><span>${L('Excluding pension','Ekskl. pension')}</span><strong>${money(summary.excludingPension)}</strong></div><p class="muted">${L('Only recorded assets and loans. Different valuation dates; no currency conversion. Missing assets and property are not included. This is not a complete net-worth statement.','Kun registrerede aktiver og lån. Forskellige opgørelsesdatoer; ingen valutaomregning. Manglende aktiver og bolig er ikke medregnet. Dette er ikke en komplet formueopgørelse.')}</p>${summary.bankCash==null?`<p class="warning">${L('A complete booked cash balance is unavailable. Totals remain unknown.','En fuldstændig bogført saldo mangler. Totaler vises som ukendte.')}</p>`:''}${summary.accounts.some(x=>x.balance&&age(x.balance.observedAt.slice(0,10))>1)?`<p class="warning">${L('Bank balances may be stale.','Bankindeståender kan være forældede.')}</p>`:''}<a href="#/loans">${L('View loans and scenarios','Se lån og scenarier')} →</a></aside></div>`);
  if(pension)await mountPensionImports(main.querySelector('#pension-imports'),{S,e,money,date,today,api,post,errorText,navigate});
  main.querySelector('#new-valuation').onclick=()=>edit(kind);main.querySelector('#first-valuation')?.addEventListener('click',()=>edit(kind));
  main.querySelectorAll('[data-valuation-edit]').forEach(b=>b.onclick=()=>edit(kind,records.find(x=>x.id===b.dataset.valuationEdit)));
  main.querySelectorAll('[data-valuation-delete]').forEach(b=>b.onclick=async()=>{const x=records.find(x=>x.id===b.dataset.valuationDelete);if(!await confirmAction(L(`Delete ${x.name}?`,`Slet ${x.name}?`)))return;try{await api(`wealth/${x.id}?version=${encodeURIComponent(x.version)}`,{method:'DELETE'});await navigate();}catch(err){b.insertAdjacentHTML('afterend',`<p role="alert">${e(errorText(err))}</p>`);}});
  if(!pension&&saxo.setup?.credentialsReady){
   const provider=main.querySelector('.wealth-provider');
   if(!saxo.setup.callbackReady)provider.insertAdjacentHTML('beforeend',`<p class="muted">${L('Required registered callback','Påkrævet registreret callback')}: <code class="saxo-callback">${e(saxo.setup.requiredCallback)}</code></p>`);
   else{
    provider.insertAdjacentHTML('beforeend',`<button id="saxo-connect">${L('Sign in to Saxo SIM','Log ind på Saxo SIM')}</button><p id="saxo-connect-status" role="status"></p>`);
    main.querySelector('#saxo-connect').onclick=async ev=>{ev.currentTarget.disabled=true;try{const result=await post('investments/saxo/connect',{});beginSaxoSignIn(result);}catch(err){main.querySelector('#saxo-connect-status').textContent=errorText(err);ev.currentTarget.disabled=false;}};
   }
  }
  main.querySelector('#saxo-preview')?.addEventListener('click',async ev=>{const b=ev.currentTarget;b.disabled=true;try{const r=await post('investments/saxo/preview',{});main.querySelector('#saxo-result').innerHTML=`<h3>Saxo SIM · ${e(r.currency)}</h3><p>${L('Total including cash','Total inklusive kontanter')}: ${money(r.totalValue,r.currency)} · ${L('Cash','Kontanter')}: ${money(r.cash,r.currency)}</p><p>${e(r.positions.length)} ${L('positions shown','positioner vist')}${r.hasMore?' · '+L('More positions available','Flere positioner findes'):''}</p>${r.positions.map(p=>`<p>${e(p.name||p.instrument||L('Unknown instrument','Ukendt værdipapir'))} · ${e(p.quantity??'—')} · ${L('Price delay (minutes)','Prisforsinkelse (minutter)')}: ${e(p.priceDelayMinutes??'—')}</p>`).join('')}<small>${L('Simulation only. Not part of your wealth.','Kun simulation. Indgår ikke i din formue.')}</small>`;}catch(err){main.querySelector('#saxo-result').textContent=errorText(err);}finally{b.disabled=false;}});
 }
 async function edit(kind,existing,imported=false){
  if(!await leave())return;const pension=kind==='Pension';
  const matches=imported&&/ · ••.{4}$/u.test(existing.name)?records.filter(r=>r.provider===existing.provider&&r.name===existing.name&&r.currency===existing.currency):[];
  let target=imported?(matches.length===1?matches[0]:null):existing;
  const x=imported?{...target,...existing,name:target?.name||existing.name,annualPension:target?.annualPension??existing.annualPension,retirementAge:target?.retirementAge??existing.retirementAge}:existing||{name:'',provider:pension?'PFA':'',value:'',currency:S.currency,asOf:today(),sourceNote:'',annualPension:null,retirementAge:null};
  dialog.className='creation-modal';dialog.innerHTML=`<div class="creation-header"><h2>${L('Statement value','Værdi fra opgørelse')}</h2>${button('Close','close')}</div><form id="wealth-form" class="form loan-form">${imported?`<div class="field"><label for="wealth-existing">${L("Save to product","Gem i produkt")}</label><select id="wealth-existing"><option value="">${L("New product","Nyt produkt")}</option>${records.map(r=>`<option value="${e(r.id)}" ${r.id===target?.id?"selected":""}>${e(r.name)} · ${e(r.provider)} · ${e(r.currency)}</option>`).join('')}</select></div><p id="wealth-existing-note"></p>`:""}${input('wealth-name',L('Product / account name','Produkt- eller kontonavn'),x.name,'text','required maxlength="120"')}${input('wealth-provider',L('Provider','Udbyder'),x.provider,'text','required maxlength="120"')}<div class="loan-fields">${input('wealth-value',pension?L('Pension balance','Pensionssaldo'):L('Investment value excluding cash','Investeringsværdi ekskl. kontanter'),amountInput(x.value),'text','required inputmode="decimal" autocomplete="off"')}${input('wealth-currency','Currency',x.currency,'text','required pattern="[A-Z]{3}" maxlength="3"')}${input('wealth-date',L('Statement date','Opgørelsesdato'),x.asOf,'date',`required min="1900-01-01" max="${today()}"`)}</div>${input('wealth-source',L('Statement reference / page','Opgørelsens reference / side'),x.sourceNote,'text','required maxlength="500"')}${pension?`<details ${x.annualPension!=null?'open':''}><summary>${L('Optional retirement projection from the statement','Valgfri pensionsprognose fra opgørelsen')}</summary>${input('wealth-income',L('Annual pension before tax','Årlig pension før skat'),amountInput(x.annualPension),'text','inputmode="decimal" autocomplete="off"')}${input('wealth-age',L('At retirement age','Ved pensionsalder'),x.retirementAge??'','number','min="40" max="100" step="1"')}<p>${L('Enter both fields or leave both empty. Projections are not imported; verify any retained projection against this statement. Do not enter a monthly amount as an annual amount.','Udfyld begge felter, eller lad begge stå tomme. Prognoser importeres ikke; kontrollér en bevaret prognose mod denne opgørelse. Indtast ikke et månedligt beløb som et årsbeløb.')}</p></details>`:`<p class="muted">${L('Exclude any cash already shown under Accounts. Use one current value per product; edit it for the next statement instead of adding it twice.','Udelad kontanter, der allerede vises under Konti. Brug én aktuel værdi pr. produkt; opdatér posten ved næste opgørelse frem for at tilføje den igen.')}</p>`}<p class="muted">${L('Copy the figures from your statement and check the currency and date.','Kopiér tallene fra opgørelsen, og kontrollér valuta og dato.')}${pension&&S.mode==='Live'?' '+L('This manual save creates a dated history receipt. Use report upload to retain an original PDF.','Denne manuelle gemning opretter en dateret historikpost. Upload en rapport for at bevare den oprindelige PDF.'):''}</p><p class="error" role="alert"></p><button class="primary" type="submit">${t('Save changes')}</button></form>`;
  dialog.showModal();const form=dialog.querySelector('form');
  const v=n=>form.querySelector('#wealth-'+n)?.value||'';
  const validateAmounts=()=>{for(const name of ['value','income']){const el=form.querySelector('#wealth-'+name);if(el)el.setCustomValidity(el.value&&statementAmount(el.value,S.lang)===null?L('Use an amount such as 123,456.78, with at most two decimals.','Brug et beløb som 123.456,78 med højst to decimaler.'):'');}};
  const destination=()=>{const note=form.querySelector('#wealth-existing-note');if(note)note.textContent=target?L('Updates the existing product. Previous statement: ','Opdaterer det eksisterende produkt. Tidligere opgørelse: ')+date(target.asOf)+' · '+amountInput(target.value)+' '+target.currency:L('Creates one new product after you press Save changes.','Opretter ét nyt produkt, når du trykker Gem ændringer.');};destination();
  form.querySelector('#wealth-existing')?.addEventListener('change',ev=>{target=records.find(r=>r.id===ev.target.value)||null;for(const [name,key] of [['name','name'],['provider','provider'],['income','annualPension'],['age','retirementAge']]){const el=form.querySelector('#wealth-'+name);el.value=name==='income'?amountInput(target?.[key]):target?.[key]??existing[key]??'';}destination();validateAmounts();S.dirty=true;});
  form.oninput=()=>{S.dirty=true;validateAmounts();};validateAmounts();validateForms();form.querySelector(imported?'#wealth-existing':'#wealth-name')?.focus();
  form.onsubmit=async ev=>{ev.preventDefault();ev.stopPropagation();if(!form.reportValidity()||S.saving)return;const seq=S.seq,mode=S.mode;S.saving=true;try{await post(target?.id?'wealth/'+target.id:'wealth',{name:v('name'),provider:v('provider'),kind,value:statementAmount(v('value'),S.lang),currency:v('currency'),asOf:v('date'),sourceNote:v('source'),annualPension:v('income')===''?null:statementAmount(v('income'),S.lang),retirementAge:v('age')===''?null:+v('age'),version:target?.version},target?.id?'PUT':'POST');if(seq!==S.seq||mode!==S.mode)return;S.dirty=false;dialog.close();await navigate();}catch(err){if(!err.stale)form.querySelector('.error').textContent=err.code==='VALUATION_ALREADY_EXISTS_EDIT_IT'?L('This product already exists. Close this form and edit the existing product, or select it above.','Produktet findes allerede. Luk formularen, og redigér det eksisterende produkt, eller vælg det ovenfor.'):errorText(err);}finally{S.saving=false;}};
 }
 async function markets(main){
  const rows=await api('research');if(!main.isConnected)return;
  main.insertAdjacentHTML('beforeend',header(L('Markets','Markeder'),`<button class="primary" id="new-research">+ ${L('Add to watchlist','Tilføj til observationsliste')}</button>`)+`<section class="loan-hero"><div><h2>${L('Explore before you invest.','Undersøg, før du investerer.')}</h2></div><div><h3>${L('Market feed not connected','Markedsdata er ikke tilsluttet')}</h3><p>${L('No live or delayed prices are being shown. Open a saved source to research an instrument.','Der vises hverken live- eller forsinkede kurser. Åbn en gemt kilde for at undersøge et værdipapir.')}</p></div></section><div class="loan-grid">${rows.length?rows.map(x=>`<article class="loan-card"><div class="loan-title"><h2>${e(x.name)}</h2><span class="pill">${e(x.symbol)}</span></div><p class="research-notes">${e(x.notes||L('No notes yet','Ingen noter endnu'))}</p><small>${L('Notes updated','Noter opdateret')} ${date(x.updatedAt)}</small><div class="loan-actions">${x.url?`<a href="${e(x.url)}" target="_blank" rel="noopener noreferrer">${L('Open research source','Åbn kilde')} ↗</a>`:''}<button data-research-edit="${x.id}">${t('Edit')}</button><button data-research-delete="${x.id}">${t('Delete')}</button></div></article>`).join(''):`<article class="loan-card"><h2>${L('Your watchlist starts here','Din observationsliste starter her')}</h2><p>${L('Add a company or fund you want to understand. Keep questions about costs, risk and diversification alongside the source.','Tilføj et selskab eller en fond, du vil forstå. Gem spørgsmål om omkostninger, risiko og spredning sammen med kilden.')}</p></article>`}</div>`);
  main.querySelector('#new-research').onclick=()=>editResearch();
  main.querySelectorAll('[data-research-edit]').forEach(b=>b.onclick=()=>editResearch(rows.find(x=>x.id===b.dataset.researchEdit)));
  main.querySelectorAll('[data-research-delete]').forEach(b=>b.onclick=async()=>{const x=rows.find(x=>x.id===b.dataset.researchDelete);if(!await confirmAction(L(`Remove ${x.name} from the watchlist?`,`Fjern ${x.name} fra observationslisten?`)))return;try{await api(`research/${x.id}?version=${encodeURIComponent(x.version)}`,{method:'DELETE'});await navigate();}catch(err){b.insertAdjacentHTML('afterend',`<p role="alert">${e(errorText(err))}</p>`);}});
 }
 async function editResearch(x){
  if(!await leave())return;dialog.className='creation-modal';dialog.innerHTML=`<div class="creation-header"><h2>${L('Watchlist idea','Idé til observationslisten')}</h2>${button('Close','close')}</div><form id="research-form" class="form loan-form">${input('research-name','Name',x?.name||'','text','required maxlength="120"')}${input('research-symbol',L('Symbol / identifier','Symbol / identifikation'),x?.symbol||'','text','required maxlength="24"')}${input('research-url',L('Research source (HTTPS, optional)','Kilde (HTTPS, valgfri)'),x?.url||'','url','maxlength="1000"')}<label for="research-notes">${L('Questions and notes','Spørgsmål og noter')}</label><textarea id="research-notes" rows="5" maxlength="4000">${e(x?.notes||'')}</textarea><p class="error" role="alert"></p><button class="primary" type="submit">${t('Save changes')}</button></form>`;dialog.showModal();validateForms();const f=dialog.querySelector('form');f.oninput=()=>S.dirty=true;f.onsubmit=async ev=>{ev.preventDefault();ev.stopPropagation();if(!f.reportValidity()||S.saving)return;S.saving=true;try{const v=id=>f.querySelector('#research-'+id).value;await post(x?'research/'+x.id:'research',{name:v('name'),symbol:v('symbol'),notes:v('notes'),url:v('url'),version:x?.version},x?'PUT':'POST');S.dirty=false;dialog.close();await navigate();}catch(err){f.querySelector('.error').textContent=errorText(err);}finally{S.saving=false;}};
 }
 return {render,markets,dispose:()=>{disposeEmployeeStock();disposeEmployeeStock=()=>{};investments.dispose();}};
}

// Account totals are broker values, not sums of pending orders or research prices.
export function investmentSummary(portfolio) {
 const finite=x=>typeof x==='number'&&Number.isFinite(x);
 const reliable=portfolio?.reliability==='Ok',currency=portfolio?.currency;
 const accounts=portfolio?.accounts||[],positions=portfolio?.positions||[];
 const invested=reliable&&accounts.length&&accounts.every(a=>a.currency===currency&&a.reliability==='Ok'&&finite(a.invested))?accounts.reduce((sum,a)=>sum+a.invested,0):null;
 const cash=reliable&&finite(portfolio.cash)?portfolio.cash:null,total=reliable&&finite(portfolio.totalValue)?portfolio.totalValue:null;
 const pnl=reliable&&!portfolio.hasMore&&positions.length&&positions.every(p=>p.reliability==='Ok'&&p.baseCurrency===currency&&finite(p.profitLossInBaseCurrency))?positions.reduce((sum,p)=>sum+p.profitLossInBaseCurrency,0):null;
 const unbooked=reliable&&accounts.length&&accounts.every(a=>a.currency===currency&&a.reliability==='Ok'&&finite(a.unbooked))?accounts.reduce((sum,a)=>sum+a.unbooked,0):null;
 const cashAfterSettlement=cash!==null&&unbooked!==null?cash+unbooked:null;
 const allocationCash=cashAfterSettlement??cash;
 const reconciled=total!==null&&allocationCash!==null&&invested!==null&&Math.abs(allocationCash+invested-total)<.02;
 const allocation=currency&&total>0&&allocationCash>=0&&invested>=0&&reconciled?{cash:allocationCash/total*100,invested:invested/total*100}:null;
 const available=reliable&&accounts.length&&accounts.every(a=>a.currency===currency&&a.reliability==='Ok'&&finite(a.available))?accounts.reduce((sum,a)=>sum+a.available,0):reliable&&finite(portfolio.buyingPower)?portfolio.buyingPower:null;
 return {currency,cash,total,invested,pnl,allocation,unbooked,cashAfterSettlement,reconciled,available};
}

// Acquisition facts remain useful even when the broker cannot supply a reliable valuation.
export function investmentHoldingView(position) {
 const finite=x=>typeof x==='number'&&Number.isFinite(x);
 const reliable=position?.reliability==='Ok'&&!['None','NoAccess'].includes(position?.priceType);
 return {price:reliable&&finite(position.price)&&position.price>0?position.price:null,
  marketValue:reliable&&finite(position.marketValueInBaseCurrency)&&(position.marketValueInBaseCurrency!==0||position.quantity===0)?position.marketValueInBaseCurrency:null,
  pnl:reliable&&finite(position.profitLossInBaseCurrency)?position.profitLossInBaseCurrency:null,
  reliable};
}

export function investmentCostLines(position) {
 return ['commission','exchangeFee','stampDuty','additionalTransactionCosts','externalCharges','performanceFee'].flatMap(key=>{
  const base=position?.openCostsInBaseCurrency?.[key],native=position?.openCosts?.[key];
  if(typeof base==='number'&&Number.isFinite(base)&&position.baseCurrency)return [{key,value:base,currency:position.baseCurrency}];
  if(typeof native==='number'&&Number.isFinite(native)&&position.currency)return [{key,value:native,currency:position.currency}];
  return [];
 });
}

export function investmentActivityKind(event) {
 if(event?.subStatus!=='Confirmed'||!Number.isFinite(event.filled)||event.filled<=0)return 'event';
 if(['FinalFill','Filled'].includes(event.status)&&Number.isFinite(event.quantity)&&event.quantity>0&&event.filled===event.quantity)return 'filled';
 if(['PartialFill','PartiallyFilled'].includes(event.status))return 'partial';
 return 'event';
}

export function investmentSettlementMarkup(m,{L,money}) {
 if(m.unbooked===null||m.unbooked===0)return '';
 const amount=n=>typeof n==='number'&&Number.isFinite(n)&&m.currency?money(n,m.currency):'—';
 return `<div class="inv-settlement"><dl>${[[L('Booked cash','Bogførte kontanter'),m.cash],[L('Pending settlement','Afventer afvikling'),m.unbooked],[L('Cash after settlement','Kontanter efter afvikling'),m.cashAfterSettlement]].map(([label,value])=>`<div><dt>${label}</dt><dd>${amount(value)}</dd></div>`).join('')}</dl><p>${L('Pending purchases, sales and charges are not yet included in booked cash. Cash after settlement is not the amount available to trade.','Ventende køb, salg og omkostninger indgår endnu ikke i bogførte kontanter. Kontanter efter afvikling er ikke det beløb, du kan handle for.')}${m.reconciled?'':` ${L('The account figures do not fully reconcile yet.','Kontotallene stemmer endnu ikke fuldt overens.')}`}</p></div>`;
}

export function investmentOrderState(order) {
 const text=String(order?.status||'').toLowerCase();
 if(/reject|fail/.test(text))return 'rejected';
 if(/cancel|expir/.test(text))return 'cancelled';
 if(/part/.test(text)||(Number(order?.filledQuantity)>0&&Number(order?.filledQuantity)<Number(order?.quantity)))return 'partial';
 if(/filled|executed/.test(text)&&!/unfilled/.test(text))return 'filled';
 if(/working|placed|accepted|open/.test(text))return 'working';
 return 'unknown';
}

export function investmentResearchSymbol(item) {
 const exact={'GMAB:xcse':'GMAB.CO','VWS:xcse':'VWS.CO','MSFT:xnas':'MSFT','SIE:xetr':'SIE.DE'};
 const symbol=item?.researchSymbol||exact[item?.symbol];
 return typeof symbol==='string'&&/^[A-Z0-9.^=-]{1,24}$/.test(symbol)?symbol:null;
}

export function investmentSnapshot(snapshot,environment='SIM') {
 if(!['SIM','LIVE'].includes(environment)||snapshot?.environment!==environment||snapshot.simulation!==(environment==='SIM'))throw {code:'INVALID_SAXO_ENVIRONMENT'};
 return {portfolio:snapshot.portfolioError?null:snapshot.portfolio,
  orders:{orders:snapshot.ordersError?null:snapshot.orders,hasMore:snapshot.ordersHasMore,
   observedAt:snapshot.ordersObservedAt,history:snapshot.activity,historyError:snapshot.activityError,historyHasMore:snapshot.activityHasMore},
  portfolioError:snapshot.portfolioError,ordersError:snapshot.ordersError};
}

// Group Saxo lots of one instrument into a holding. Totals exist only when every lot reports them.
export function investmentHoldings(positions) {
 const finite=x=>typeof x==='number'&&Number.isFinite(x);
 const sum=values=>values.length&&values.every(finite)?values.reduce((s,x)=>s+x,0):null;
 const byTime=(values,newest)=>values.filter(x=>x&&!Number.isNaN(Date.parse(x))).sort((a,b)=>newest?Date.parse(b)-Date.parse(a):Date.parse(a)-Date.parse(b))[0]||null;
 const groups=new Map();
 (Array.isArray(positions)?positions:[]).forEach((p,i)=>{
  const key=p?.netPositionId||(p?.instrument!=null&&p?.accountId?`${p.accountId}:${p.instrument}`:null)||p?.positionId||`${p?.symbol||p?.name||'position'}:${i}`;
  if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p||{});
 });
 return [...groups].map(([key,lots])=>{
  const first=lots[0],views=lots.map(investmentHoldingView),reliable=views.every(v=>v.reliable),quantity=sum(lots.map(p=>p.quantity));
  const lines=lots.map(investmentCostLines);
  const costs=lines[0].filter(c=>lines.every(l=>l.some(x=>x.key===c.key&&x.currency===c.currency))).map(c=>({...c,value:lines.reduce((s,l)=>s+l.find(x=>x.key===c.key&&x.currency===c.currency).value,0)}));
  return {key,name:first.name,symbol:first.symbol,researchSymbol:first.researchSymbol,instrument:first.instrument,assetType:first.assetType,currency:first.currency,baseCurrency:first.baseCurrency,
   priceDecimals:first.priceDecimals,priceDelayMinutes:first.priceDelayMinutes,priceAsOf:byTime(lots.map(p=>p.priceAsOf),true),
   quantity,quantityText:lots.length===1?(first.quantityText??first.quantity):quantity,
   openPrice:quantity&&lots.every(p=>finite(p.openPrice)&&finite(p.quantity))?lots.reduce((s,p)=>s+p.openPrice*p.quantity,0)/quantity:null,
   price:reliable?views.find(v=>v.price!==null)?.price??null:null,
   marketValue:reliable?sum(views.map(v=>v.marketValue)):null,pnl:reliable?sum(views.map(v=>v.pnl)):null,
   cost:sum(lots.map(p=>finite(p.marketValueOpenInBaseCurrency)?Math.abs(p.marketValueOpenInBaseCurrency):null)),
   reliable,costs,openedAt:byTime(lots.map(p=>p.openedAt),false),valueDate:byTime(lots.map(p=>p.valueDate),true),
   lots:lots.map(p=>({positionId:p.positionId,openedAt:p.openedAt,quantity:p.quantity,openPrice:p.openPrice}))};
 });
}

// Tiles are sized consistently: all by current value, else all by purchase value, else equally.
export function investmentTileBasis(holdings) {
 if(!holdings?.length)return 'equal';
 if(holdings.every(h=>h.marketValue>0))return 'market';
 if(holdings.every(h=>h.cost>0))return 'cost';
 return 'equal';
}

// Squarified treemap layout (Bruls, Huizing and van Wijk). Items need a positive size `v`.
export function investmentTreemap(items,width,height) {
 const rest=(items||[]).filter(i=>i.v>0).sort((a,b)=>b.v-a.v),out=[],total=rest.reduce((s,i)=>s+i.v,0);
 let x=0,y=0,w=width,h=height;
 if(!(w>0&&h>0&&total>0))return out;
 const scale=w*h/total;
 const worst=(row,len)=>{const s=row.reduce((a,r)=>a+r.v*scale,0),max=Math.max(...row.map(r=>r.v*scale)),min=Math.min(...row.map(r=>r.v*scale));return Math.max(len*len*max/(s*s),(s*s)/(len*len*min));};
 while(rest.length){
  const len=Math.min(w,h),row=[rest[0]];let i=1;
  while(i<rest.length&&worst([...row,rest[i]],len)<=worst(row,len))row.push(rest[i++]);
  const thick=row.reduce((a,r)=>a+r.v*scale,0)/len;let offset=0;
  row.forEach(r=>{const size=r.v*scale/thick;out.push(w>=h?{item:r,x,y:y+offset,w:thick,h:size}:{item:r,x:x+offset,y,w:size,h:thick});offset+=size;});
  if(w>=h){x+=thick;w-=thick;}else{y+=thick;h-=thick;}
  rest.splice(0,row.length);
 }
 return out;
}

// Only short Saxo identifiers are kept from provider diagnostics; messages and bodies never reach the page.
function investmentDiagnostics(list) {
 return (Array.isArray(list)?list:[]).filter(d=>typeof d?.code==='string'&&/^[A-Z0-9_]{1,80}$/.test(d.code)).slice(0,6).map(d=>({
  operation:['search','history','quote'].includes(d.operation)?d.operation:null,code:d.code,status:Number.isInteger(d.status)?d.status:null,
  providerCode:typeof d.providerCode==='string'&&/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(d.providerCode)?d.providerCode:null,cooldown:d.cooldown===true}));
}
// Market data is Saxo LIVE only; any other source (such as an older Yahoo fallback) is unavailable.
// History and quote are independent parts. Builds without the part statuses are inferred from bars and price.
export function investmentMarketData(data) {
 if(data?.source!=='Saxo LIVE')return null;
 const finite=x=>typeof x==='number'&&Number.isFinite(x),positive=x=>finite(x)&&x>0?x:null,minutes=x=>finite(x)&&x>=0?x:null,seen=new Set();
 const when=x=>typeof x==='string'&&!Number.isNaN(Date.parse(x))?x:null;
 const clean=(Array.isArray(data.bars)?data.bars:[]).filter(b=>finite(b?.time)&&positive(b.close)).sort((a,b)=>a.time-b.time).filter(b=>!seen.has(b.time)&&seen.add(b.time));
 const inferred=!('historyStatus' in data);
 let historyStatus=['available','empty','stale','denied','unavailable'].includes(data.historyStatus)?data.historyStatus:clean.length?'available':'unavailable';
 if(['available','stale'].includes(historyStatus)&&!clean.length)historyStatus='unavailable';
 let quoteStatus=['available','stale','denied','unavailable','mismatch'].includes(data.quoteStatus)?data.quoteStatus:data.price!=null?'available':'unavailable';
 if(['available','stale'].includes(quoteStatus)&&positive(data.price)===null)quoteStatus='unavailable';
 const bars=['available','stale'].includes(historyStatus)?clean:[],quoted=['available','stale'].includes(quoteStatus);
 return {normalized:true,source:data.source,symbol:typeof data.symbol==='string'&&data.symbol?data.symbol:null,name:typeof data.name==='string'?data.name:null,
  currency:typeof data.currency==='string'&&/^[A-Z]{3}$/.test(data.currency)?data.currency:null,assetType:typeof data.assetType==='string'&&data.assetType?data.assetType:null,range:data.range??null,
  historyStatus,quoteStatus,bars,price:quoted?positive(data.price):null,previousClose:quoted?positive(data.previousClose):null,quoteTime:quoted?when(data.quoteTime):null,
  quoteDelayMinutes:minutes(data.quoteDelayMinutes),chartDelayMinutes:minutes(data.chartDelayMinutes),retrievedAt:when(data.retrievedAt),
  historyRetrievedAt:when(data.historyRetrievedAt)??(inferred&&bars.length?when(data.retrievedAt):null),
  interval:typeof data.interval==='string'&&/^\d+(m|d|wk)$/.test(data.interval)?data.interval:null,
  missingIntervals:Number.isInteger(data.historySamples?.missingIntervals)&&data.historySamples.missingIntervals>=0?data.historySamples.missingIntervals:null,
  stale:data.stale===true||historyStatus==='stale'||quoteStatus==='stale',warning:typeof data.warning==='string'?data.warning:null,diagnostics:investmentDiagnostics(data.diagnostics)};
}
const investmentMarketKinds={SAXO_MARKET_SIGN_IN_REQUIRED:'signin',SAXO_SIGN_IN_REQUIRED:'signin',SAXO_ACCESS_REQUIRED:'signin',SAXO_MARKET_DATA_NO_ACCESS:'denied',SAXO_PERMISSION_REQUIRED:'denied',
 SAXO_LIVE_OWNER_REQUIRED:'owner',SAXO_PRIVATE_ACCESS_REQUIRED:'owner',SAXO_LIVE_READ_DISABLED:'disabled',SAXO_MARKET_DEPLOYMENT_REQUIRED:'release',SAXO_MARKET_DATA_MISMATCH:'mismatch',
 SAXO_MARKET_LISTING_REQUIRED:'listing',NO_LISTING:'listing',SAXO_MARKET_REQUEST_REJECTED:'rejected',SAXO_RATE_LIMITED:'busy'};
// A thrown market-data error. Global kinds apply to every symbol, so further automatic reads stop.
export function investmentMarketIssue(err) {
 const code=typeof err?.code==='string'&&err.code?err.code:'MARKET_DATA_UNAVAILABLE',kind=investmentMarketKinds[code]||'transient';
 return {kind,code,status:Number.isInteger(err?.status)?err.status:null,diagnostics:investmentDiagnostics(err?.details?.diagnostics),global:['signin','owner','disabled','release','busy'].includes(kind)};
}
// Sign-in state of the trading connection ('required', 'expired' or null) from the codes of the last reads.
export function investmentAuthState({portfolioCode,orderCode,connectCode}={}) {
 const kinds=[portfolioCode,orderCode,connectCode].map(saxoAuthKind).filter(Boolean);
 return kinds.includes('expired')?'expired':kinds[0]||null;
}
// The banner lists problems other than sign-in, which the header control owns. A failed sign-in attempt is a notice without Retry.
export function investmentNotice({portfolio,orders,portfolioIssue,portfolioCode,orderIssue,orderCode,connectIssue,connectCode}={}) {
 const other=(code,text)=>text&&!saxoAuthKind(code)?text:'';
 const attempt=other(connectCode,connectIssue),texts=attempt?[attempt]:[...new Set([other(portfolioCode,portfolioIssue),other(orderCode,orderIssue)].filter(Boolean))];
 return texts.length?{text:texts.join(' · '),stale:!!(portfolio||orders),retry:!attempt}:null;
}
export function investmentNoticeMarkup(notice,{L,e}) {
 if(!notice)return '';
 return `<div class="inv-notice" role="status">${e(notice.text)}${notice.stale?` · ${L('Previously read data is shown with its original timestamp.','Tidligere hentede data vises med deres oprindelige tidspunkt.')}`:''}${notice.retry?` <button type="button" data-inv-retry data-inv-focus="notice-retry">${L('Retry','Prøv igen')}</button>`:''}</div>`;
}
// A panel without data. When signed out it only says so; the header control has the sign-in action and Retry would not help.
export function investmentUnavailableMarkup({auth,subject='holdings',message,icon=''},{L,e}) {
 if(auth)return `<div class="inv-empty" data-auth="${e(auth)}">${icon}<p><strong>${e(saxoAuthStatus(auth,L))}</strong></p><p>${subject==='orders'?L('Working orders are unavailable.','Aktive ordrer er ikke tilgængelige.'):L('Holdings are unavailable.','Beholdninger er ikke tilgængelige.')}</p></div>`;
 return `<div class="inv-empty">${icon}<p><strong>${L('Data unavailable','Data er ikke tilgængelige')}</strong></p><p>${e(message||L('Saxo data is not available yet.','Saxo-data er endnu ikke tilgængelige.'))}</p><button type="button" data-inv-retry data-inv-focus="retry">${L('Try again','Prøv igen')}</button></div>`;
}
// Sign-in for market data is the header control's action, never a button in the chart area.
export function investmentChartActions(issue,{retry=true,L}) {
 return retry&&issue?.kind!=='signin'?`<div class="inv-chart-actions"><button type="button" data-inv-market-retry data-inv-focus="market-retry">${L('Retry','Prøv igen')}</button></div>`:'';
}
// A LIVE quote belongs to a holding only for the same exact listing, asset type and verified currency. SIM UICs are never used.
export function investmentQuotePair(holding,snapshot) {
 const snap=snapshot?.normalized?snapshot:investmentMarketData(snapshot);
 if(!snap)return {paired:false,reason:'missing'};
 const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toUpperCase()===b.toUpperCase();
 if(!same(snap.symbol,holding?.symbol))return {paired:false,reason:'symbol',snapshot:snap};
 if(snap.assetType&&holding.assetType&&snap.assetType!==holding.assetType)return {paired:false,reason:'assetType',snapshot:snap};
 if(!snap.currency||snap.currency!==holding.currency)return {paired:false,reason:'currency',snapshot:snap};
 if(snap.quoteStatus!=='available'||!(snap.price>0))return {paired:false,reason:snap.quoteStatus==='available'?'unavailable':snap.quoteStatus,snapshot:snap};
 return {paired:true,price:snap.price,previousClose:snap.previousClose,currency:snap.currency,quoteTime:snap.quoteTime,quoteDelayMinutes:snap.quoteDelayMinutes,retrievedAt:snap.retrievedAt,snapshot:snap};
}
// Broker values stay broker values. Without a reliable broker valuation, a paired LIVE quote gives estimates in the
// instrument currency only; they count in base-currency totals only when that currency is the account currency (no FX).
export function investmentValuation(holding,pair) {
 const finite=x=>typeof x==='number'&&Number.isFinite(x),q=pair?.paired?pair:null;
 const dayChange=q&&q.previousClose>0?(q.price/q.previousClose-1)*100:null;
 if(holding?.reliable)return {source:'broker',price:holding.price,priceCurrency:holding.currency||null,marketValue:holding.marketValue,pnl:holding.pnl,valueCurrency:holding.baseCurrency||null,baseValue:holding.marketValue,basePnl:holding.pnl,dayChange,quote:q};
 if(q&&finite(holding?.quantity)){
  const value=holding.quantity*q.price,pnl=finite(holding.openPrice)?holding.quantity*(q.price-holding.openPrice):null,base=!!holding.baseCurrency&&q.currency===holding.baseCurrency;
  return {source:'estimate',price:q.price,priceCurrency:q.currency,marketValue:value,pnl,valueCurrency:q.currency,baseValue:base?value:null,basePnl:base?pnl:null,dayChange,quote:q};
 }
 return {source:'unknown',price:null,priceCurrency:holding?.currency||null,marketValue:null,pnl:null,valueCurrency:null,baseValue:null,basePnl:null,dayChange,quote:q};
}
// Pairs every holding with its LIVE snapshot. Tile sizing and weights need a base-currency value for every holding.
export function investmentLiveView(holdings,snapshotFor=()=>null) {
 const finite=x=>typeof x==='number'&&Number.isFinite(x);
 const items=(holdings||[]).map(h=>{const pair=investmentQuotePair(h,snapshotFor(h));return {...h,pair,valuation:investmentValuation(h,pair)};});
 const values=items.map(x=>x.valuation.baseValue),complete=items.length>0&&values.every(v=>finite(v)&&v>=0);
 return {items,basis:investmentTileBasis(items.map(x=>({marketValue:x.valuation.baseValue,cost:x.cost}))),sizeTotal:complete?values.reduce((s,v)=>s+v,0):null,
  estimated:items.some(x=>x.valuation.source==='estimate'&&x.valuation.baseValue!==null)};
}
export function investmentDayChange(snapshot) {
 return snapshot?.price>0&&snapshot.previousClose>0?(snapshot.price/snapshot.previousClose-1)*100:null;
}
// "Today" needs the paired LIVE quote's previous close. "Since purchase" uses broker P&L against purchase value, else a reliable or estimated price against the open price.
export function investmentHoldingChange(holding,mode='purchase',valuation=null) {
 if(mode==='today')return valuation?.dayChange??null;
 if(typeof holding?.pnl==='number'&&Number.isFinite(holding.pnl)&&holding.cost>0)return holding.pnl/holding.cost*100;
 const current=holding?.reliable?holding.price:valuation?.source==='estimate'?valuation.price:null;
 if(current>0&&holding.openPrice>0)return (current/holding.openPrice-1)*100*(holding.quantity<0?-1:1);
 return null;
}

const investmentAssetGroups={Stock:'stocks',Etf:'etfs',Etc:'etfs',Etn:'etfs',MutualFund:'funds',Bond:'bonds'};
// Cash appears only through the reconciled account bridge; holdings are split only when their values add up to the invested amount.
export function investmentAllocation(portfolio,by='type') {
 const m=investmentSummary(portfolio),currency=m.currency;
 if(!m.allocation)return {reason:'unreconciled',currency};
 if(portfolio.hasMore)return {reason:'incomplete',currency};
 const holdings=investmentHoldings(portfolio.positions),group=h=>by==='currency'?h.currency||null:h.assetType?investmentAssetGroups[h.assetType]||h.assetType:null;
 if(holdings.some(h=>!group(h)))return {reason:'labels',currency};
 const kinds=[...new Set(holdings.map(group))],groups=new Map();
 if(kinds.length===1)groups.set(kinds[0],m.invested);
 else if(holdings.length){
  if(!holdings.every(h=>typeof h.marketValue==='number'&&h.marketValue>=0&&h.baseCurrency===currency))return {reason:'valuation',currency};
  const sum=holdings.reduce((s,h)=>s+h.marketValue,0);
  if(Math.abs(sum-m.invested)>Math.max(.02+.01*holdings.length,Math.abs(m.invested)*.001))return {reason:'positions',currency};
  holdings.forEach(h=>groups.set(group(h),(groups.get(group(h))||0)+h.marketValue));
 }else if(m.invested>.02)return {reason:'positions',currency};
 const parts=[{key:'cash',value:m.cashAfterSettlement??m.cash},...[...groups].map(([key,value])=>({key,value}))].filter(x=>x.value>0);
 const total=parts.reduce((s,x)=>s+x.value,0);
 if(!(total>0))return {reason:'empty',currency};
 return {currency,total:m.total,parts:parts.map(x=>({...x,share:x.value/total*100})).sort((a,b)=>b.value-a.value)};
}

// Order entry is SIM-only and limited to stocks, the only asset type the backend ticket supports.
export function investmentTradeAccess(environment,holding) {
 if(environment!=='SIM')return 'live';
 const uic=Number(holding?.instrument);
 return holding?.assetType==='Stock'&&(Number.isInteger(uic)&&uic>0||!!holding?.symbol)?'sim':'unsupported';
}

// Categorical lifecycle only: no fill probability or time estimate.
export function investmentOrderSteps(order,acceptedAt=null) {
 const state=investmentOrderState(order),known=x=>x!=null&&x!==''&&Number.isFinite(Number(x))?Number(x):null;
 const middle=state==='partial'?'partial':['cancelled','rejected','unknown'].includes(state)?state:'working';
 return {state,filled:known(order?.filledQuantity),quantity:known(order?.quantity),
  steps:[{key:'placed',status:'done',time:order?.placedAt||acceptedAt||null},{key:middle,status:state==='filled'?'done':'current'},{key:'filled',status:state==='filled'?'done':'todo'}]};
}

export function createInvestmentWorkspace({S,e,money,api,post,header,errorText,composeScene}) {
 const L=(en,da)=>S.lang==='da'?da:en;
 const issueText=err=>{
  const messages={SAXO_SIGN_IN_CANCELLED:['Saxo sign-in was cancelled.','Saxo-login blev annulleret.'],SAXO_ACCESS_REQUIRED:['Not signed in to Saxo.','Ikke logget ind på Saxo.'],SAXO_SIGN_IN_REQUIRED:['Your Saxo session has expired.','Din Saxo-session er udløbet.'],SAXO_PERMISSION_REQUIRED:['Saxo has not granted access to this data. Check your account permissions.','Saxo har ikke givet adgang til disse data. Kontrollér dine kontorettigheder.'],SAXO_RATE_LIMITED:['Saxo is busy. Automatic refresh is paused; try again later.','Saxo er optaget. Automatisk opdatering er sat på pause. Prøv igen senere.'],SAXO_READ_DISABLED:['Read access is disabled for this environment.','Læseadgang er deaktiveret for dette miljø.'],SAXO_AUTH_SESSION_MISMATCH:['The sign-in could not be completed in this browser tab.','Login kunne ikke gennemføres i denne browserfane.']};
  return messages[err?.code]?L(...messages[err.code]):errorText(err);
 };
 // Market-data issues are described by kind, with Saxo's own evidence (provider code, HTTP status) when the API supplies it.
 const evidence=issue=>{
  const d=issue?.diagnostics||[],codes=[...new Set(d.map(x=>x.providerCode).filter(Boolean))],statuses=[...new Set(d.map(x=>x.status).filter(s=>s>=300))];
  return [codes.join(', ')||issue?.code,statuses.length?'HTTP '+statuses.join(', '):null].filter(Boolean).join(' · ');
 };
 const marketText=issue=>{
  const kind=issue?.kind||investmentMarketIssue(issue).kind;
  const messages={signin:['Saxo LIVE market data is not signed in.','Saxo LIVE-markedsdata er ikke logget ind.'],
   owner:['Saxo LIVE market data is available in Dan’s private workspace.','Saxo LIVE-markedsdata er tilgængelige i Dans private arbejdsområde.'],disabled:['Saxo LIVE market-data reads are not enabled.','Læsning af Saxo LIVE-markedsdata er ikke aktiveret.'],
   release:['This API does not return Saxo LIVE market data yet. It needs the Saxo market-data release.','Denne API returnerer endnu ikke Saxo LIVE-markedsdata. Det kræver udgivelsen af Saxo-markedsdata.'],
   mismatch:['Saxo’s listing data did not match, so no prices are shown.','Saxos noteringsdata stemte ikke overens, så der vises ingen kurser.'],busy:['Saxo is busy. Market data will not refresh automatically; try again later.','Saxo er optaget. Markedsdata opdateres ikke automatisk; prøv igen senere.'],
   transient:['Saxo market data is temporarily unavailable. Try again.','Saxo-markedsdata er midlertidigt utilgængelige. Prøv igen.']};
  if(kind==='denied')return L(`Saxo denied access to this market data (${evidence(issue)}).`,`Saxo afviste adgang til disse markedsdata (${evidence(issue)}).`);
  if(kind==='rejected')return L(`Saxo rejected the market-data request (${evidence(issue)}).`,`Saxo afviste forespørgslen om markedsdata (${evidence(issue)}).`);
  if(kind==='listing')return issue?.code==='NO_LISTING'?L('No Saxo listing is known for this holding.','Der kendes ingen Saxo-notering for denne beholdning.'):L('Saxo needs the exact listing. Open the instrument in Markets.','Saxo kræver den præcise notering. Åbn værdipapiret i Markeder.');
  return L(...messages[kind]||messages.transient);
 };
 // Zero is only "no reported delay", never real-time; a missing delay stays "not reported".

 const ranges=[['1h','1H'],['1d','1D'],['5d','1W'],['1mo','1M'],['3mo','3M'],['6mo','6M'],['ytd','YTD'],['1y','1Y'],['5y','5Y']];
 let environment='SIM',run=0,paused=false;
 let root,main,controller,timer,seq,portfolio=null,orders=null,portfolioIssue='',orderIssue='',selection=null,busy=false,lastRead=null,metadata=new Map(),connecting=false,connectIssue='',marketConnecting=false;
 // Provider codes behind the issue texts: sign-in states belong to the header control, everything else to the banner.
 let portfolioCode='',orderCode='',connectCode='';
 let view={m:investmentSummary(null),holdings:[],basis:'equal',valueTotal:null,sizeTotal:null,estimated:false,costTotal:null},colour='purchase',allocBy='type',range='6mo',activityOpen=false,research=null,researchIssue='',researchLoading=false;
 let chart=null,chartSeries=null,chartSnap=null,chartResize=null,treemapResize=null,themeObserver=null,drawer=null,marketTimer,liveTimer,marketRun=0,historyRun=0,quoteRun=0,historyPromise=null,lastMarketAt=0;
 // results: latest one-day read per listing; history: the selected holding's period read. Both carry a quote.
 let market={available:false,checked:false,blocked:null,results:new Map(),history:null};
 const finite=x=>typeof x==='number'&&Number.isFinite(x);
 const amount=(x,c)=>finite(x)&&c?money(x,c):'—';
 const number=x=>investmentQuantity(x,S.lang);
 const price=(x,c,d)=>investmentPrice(x,c,d,S.lang);
 const locale=()=>S.lang==='da'?'da-DK':'en-GB';
 const pct=(x,digits=2)=>finite(x)?new Intl.NumberFormat(locale(),{signDisplay:'exceptZero',minimumFractionDigits:digits,maximumFractionDigits:digits}).format(x)+'%':'—';
 const share=x=>!finite(x)?'—':x>0&&x<.05?'<0.1%':new Intl.NumberFormat(locale(),{minimumFractionDigits:1,maximumFractionDigits:1}).format(x)+'%';
 const time=x=>x&&!Number.isNaN(Date.parse(x))?new Intl.DateTimeFormat(locale(),{dateStyle:'short',timeStyle:'short'}).format(new Date(x)):'—';
 const day=x=>x&&!Number.isNaN(Date.parse(x))?new Date(x).toLocaleDateString(locale(),{timeZone:'UTC'}):'—';
 const tone=x=>finite(x)&&x!==0?x<0?'negative':'positive':'neutral';
 const live=()=>root?.isConnected&&S.seq===seq&&!controller?.signal.aborted;
 const read=(path,options={})=>api('investments/saxo/'+path,{...options,signal:controller.signal});
 const ignored=err=>err?.stale||err?.name==='AbortError'||!live();
 const glyph=(path)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">${path}</svg>`;
 const icons={portfolio:glyph('<path d="M4 8h16v12H4zM8 8V4h8v4M4 12h16M10 12v3h4v-3"/>'),cash:glyph('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M6 15h4"/>'),invested:glyph('<path d="M3 19h18M5 15l5-6 4 3 6-8M16 4h4v4"/>'),pnl:glyph('<path d="M4 17l5-5 4 3 7-10M15 5h5v5"/>'),refresh:glyph('<path d="M20 7v5h-5M4 17v-5h5M5 8a8 8 0 0 1 13-3l2 3M4 16l2 3a8 8 0 0 0 13-3"/>'),chart:glyph('<path d="M4 19h16M6 15l4-4 3 3 5-6"/>')};
 const stateLabels={working:()=>L('Working','Afventer handel'),partial:()=>L('Partially filled','Delvist gennemført'),filled:()=>L('Filled','Gennemført'),cancelled:()=>L('Cancelled / expired','Annulleret / udløbet'),rejected:()=>L('Rejected','Afvist'),unknown:()=>L('Status unavailable','Status ukendt')};
 const eventLabel=x=>{const labels={FinalFill:['Filled','Gennemført'],PartialFill:['Partially filled','Delvist gennemført'],Placed:['Order placed','Ordre afgivet'],Confirmed:['Confirmed','Bekræftet'],Requested:['Requested','Anmodet'],Filled:['Filled','Gennemført'],Cancelled:['Cancelled','Annulleret'],Rejected:['Rejected','Afvist'],Limit:['Limit','Limit'],Market:['Market','Marked'],GoodTillCancel:['Until cancelled','Indtil annullering'],DayOrder:['Today','I dag']};return e(labels[x]?L(...labels[x]):x||'—');};
 const groupLabel=key=>({cash:L('Cash','Kontanter'),stocks:L('Stocks','Aktier'),etfs:L('ETFs','ETF’er'),funds:L('Funds','Fonde'),bonds:L('Bonds','Obligationer')})[key]||key;
 const label=x=>x?.name||x?.symbol||x?.instrument||L('Unknown instrument','Ukendt værdipapir');
 const ticker=x=>String(x?.symbol||'').split(':')[0].toUpperCase()||String(label(x)).slice(0,6).toUpperCase();
 const monogram=x=>`<span class="inv-monogram" aria-hidden="true">${e(ticker(x).replace(/\.[A-Z]{1,3}$/,'').replace(/[^A-Z0-9]/g,'').slice(0,4))}</span>`;
 const K=s=>typeof s==='string'?s.toUpperCase():'';
 // Newest read for a listing, from either the one-day read or the selected holding's history read.
 function quoteEntry(symbol){
  const k=K(symbol);if(!k)return null;
  const a=market.results.get(k),b=market.history?.key===k&&market.history.at?market.history:null;
  return !a?b:!b?a:b.at>a.at?b:a;
 }
 // A watchlist item reuses a held listing's read when it refers to the same instrument.
 const watchSymbol=x=>view.holdings.find(h=>[h.symbol,h.researchSymbol].some(s=>K(s)&&K(s)===K(x?.symbol)))?.symbol||x?.symbol||null;
 const selectedHolding=()=>view.holdings.find(h=>h.key===selection)||null;
 function patch(node,html){
  if(!node)return;const active=document.activeElement,key=node.contains(active)?active.dataset?.invFocus:null;
  node.innerHTML=html;
  if(key)[...node.querySelectorAll('[data-inv-focus]')].find(x=>x.dataset.invFocus===key)?.focus({preventScroll:true});
 }
 function destroyChart(){chart?.remove();chart=null;chartSeries=null;chartSnap=null;chartResize?.disconnect();chartResize=null;}
 function dispose(){run++;marketRun++;historyRun++;quoteRun++;clearTimeout(timer);clearTimeout(marketTimer);clearTimeout(liveTimer);controller?.abort();destroyChart();treemapResize?.disconnect();themeObserver?.disconnect();drawer?.close();drawer?.remove();drawer=null;document.removeEventListener('visibilitychange',onVisibility);root=null;busy=false;connecting=false;}
 function onVisibility(){
  if(document.hidden){clearTimeout(timer);clearTimeout(marketTimer);clearTimeout(liveTimer);return;}
  if(!paused)refresh();
  if(!market.blocked&&lastMarketAt){clearTimeout(marketTimer);marketTimer=setTimeout(()=>marketCycle(false),Math.max(0,60000-(Date.now()-lastMarketAt)));}
  const age=market.history?.at?Date.now()-market.history.at:Infinity;
  if(SAXO_SHORT_RANGES.includes(range)&&age>=SAXO_LIVE_REFRESH_MS)void loadHistory(true);else scheduleLive();
 }
 // The selected holding's short-range chart and quote refresh faster, only while visible and never after sign-in or denial.
 function liveEligible(){
  const issue=market.history?.issue;
  return live()&&saxoLivePoll({range,visible:!document.hidden,blocked:!!market.blocked||['signin','denied','owner','disabled','release','listing','rejected','mismatch'].includes(issue?.kind)})!=null;
 }
 function scheduleLive(){
  clearTimeout(liveTimer);if(!liveEligible())return;
  liveTimer=setTimeout(()=>{if(liveEligible())void loadHistory(true);},SAXO_LIVE_REFRESH_MS);
 }
 async function render(target){
  dispose();environment=saxoEnvironment(S.mode);paused=false;main=target;seq=S.seq;controller=new AbortController();portfolio=null;orders=null;portfolioIssue='';orderIssue='';selection=null;lastRead=null;metadata=new Map();connecting=false;connectIssue='';portfolioCode=orderCode=connectCode='';marketConnecting=false;
  view={m:investmentSummary(null),holdings:[],basis:'equal',valueTotal:null,sizeTotal:null,estimated:false,costTotal:null};colour='purchase';allocBy='type';range='6mo';activityOpen=false;research=null;researchIssue='';historyPromise=null;lastMarketAt=0;
  market={available:false,checked:false,blocked:null,results:new Map(),history:null};
  main.insertAdjacentHTML('beforeend',header('Investments',`<div class="overview-controls inv-head-controls"><small id="inv-read"></small><div class="controls">${S.mode==='Live'?`<select id="inv-environment" aria-label="${L('Saxo environment','Saxo-miljø')}"><option value="SIM">SIM</option><option value="LIVE">LIVE · ${L('Read only','Kun læsning')}</option></select>`:''}${saxoAuthMarkup(authView('checking'),{group:'inv-connection',label:'inv-connection-label',action:'inv-connect'})}${saxoAuthMarkup(marketAuthView(null),{group:'inv-market-auth',label:'inv-market-auth-label',action:'inv-market-connect'})}${S.mode==='Live'?`<button id="inv-disconnect" type="button">${L('Disconnect','Afbryd')}</button>`:''}<button id="inv-refresh" type="button" aria-label="${L('Refresh portfolio','Opdatér portefølje')}" title="${L('Refresh portfolio','Opdatér portefølje')}">${icons.refresh}</button></div></div>`)+`<div class="inv-workspace" aria-busy="true"><div class="inv-loading" role="status">${icons.portfolio}<p>${L('Reading your Saxo portfolio…','Henter din Saxo-portefølje…')}</p></div></div>`);
  root=main.querySelector('.inv-workspace');main.querySelector('#inv-refresh').onclick=()=>{void refresh(true);};main.querySelector('#inv-connect').onclick=connect;main.querySelector('#inv-market-connect').onclick=()=>void connectMarketData();document.addEventListener('visibilitychange',onVisibility);
  themeObserver=new MutationObserver(()=>{if(live()&&chartSnap){chartSnap=null;void drawChart();}});themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  const selector=main.querySelector('#inv-environment');
  if(selector){selector.value=environment;selector.onchange=()=>changeEnvironment(selector.value);}
  main.querySelector('#inv-disconnect')?.addEventListener('click',disconnect);
  try{const completed=await finishSaxoSignIn(api);if(completed){environment=completed.purpose==='market-data'?completed.tradingEnvironment:completed.environment;if(S.mode!=='Live')environment='SIM';rememberSaxoEnvironment(environment);if(selector)selector.value=environment;}}catch(err){connectIssue=issueText(err);connectCode=err?.code||'';}
  const researchRead=loadResearch();
  await refresh();await researchRead;
  if(live())void marketCycle(true);
 }
 function changeEnvironment(next){
  if(connecting)return;
  environment=S.mode==='Live'&&next==='LIVE'?'LIVE':'SIM';rememberSaxoEnvironment(environment);run++;controller.abort();controller=new AbortController();clearTimeout(timer);
  portfolio=orders=null;metadata.clear();selection=null;portfolioIssue=orderIssue=connectIssue=portfolioCode=orderCode=connectCode='';lastRead=null;busy=connecting=paused=false;drawer?.close();draw();void refresh();
  if(!research)void loadResearch();
 }
 async function disconnect(){
  if(busy||connecting)return;
  if(!confirm(L(`Disconnect Saxo ${environment} from Banking? Open orders are not cancelled.`,`Afbryd Saxo ${environment} fra Banking? Åbne ordrer annulleres ikke.`)))return;
  connecting=true;clearTimeout(timer);draw();
  try{await read('disconnect?environment='+environment,{method:'POST',body:'{}'});  portfolio=orders=null;metadata.clear();paused=true;portfolioCode='SAXO_ACCESS_REQUIRED';portfolioIssue=issueText({code:portfolioCode});}
    catch(err){connectIssue=issueText(err);connectCode=err?.code||'';}finally{connecting=false;draw();}
 }
 async function refresh(manual=false){
  if(!live()||busy||connecting||document.hidden)return;busy=true;clearTimeout(timer);const target=root,requestRun=++run;paused=false;
  const button=main.querySelector('#inv-refresh');button.disabled=true;button.classList.add('is-refreshing');
  if(manual&&!researchLoading)void loadResearch();
  try{
   try{
    const result=investmentSnapshot(await read('portfolio?environment='+environment),environment);
    if(!live()||root!==target||requestRun!==run)return;
    paused=[result.portfolioError,result.ordersError,result.orders?.historyError].some(code=>['SAXO_ACCESS_REQUIRED','SAXO_SIGN_IN_REQUIRED','SAXO_PERMISSION_REQUIRED','SAXO_RATE_LIMITED','SAXO_READ_DISABLED'].includes(code));
    if(result.portfolio){portfolio=result.portfolio;portfolioIssue=portfolioCode=connectIssue=connectCode='';}else{portfolioCode=result.portfolioError||'SAXO_READ_UNAVAILABLE';portfolioIssue=issueText({code:portfolioCode});}
    if(!result.ordersError){orders=result.orders;orderIssue=orderCode='';}else{orderCode=result.ordersError;orderIssue=issueText({code:orderCode});}
   }catch(err){if(!live()||root!==target||requestRun!==run)return;paused=true;portfolioIssue=orderIssue=issueText(err);portfolioCode=orderCode=err?.code||'';}
   lastRead=new Date().toISOString();
   draw();
   // Older deployed contracts omit order currency. Read instrument metadata, never infer it from account currency.
   const missing=environment==='LIVE'||paused?[]:[...new Set((orders?.orders||[]).filter(x=>!x.currency&&x.uic&&!metadata.has(x.uic)).map(x=>x.uic))].slice(0,20);
   await Promise.allSettled(missing.map(async uic=>{metadata.set(uic,null);try{const x=await read('ticket?environment=SIM&uic='+encodeURIComponent(uic));if(live()&&root===target&&requestRun===run)metadata.set(uic,{currency:x.currency,researchSymbol:x.researchSymbol,quoteError:x.quoteError});}catch{}}));
   if(live()&&root===target&&requestRun===run&&missing.length)draw();
   if(manual&&live()&&market.blocked)retryMarket();
  }finally{if(root===target&&live()&&requestRun===run){busy=false;root.setAttribute('aria-busy','false');button.disabled=false;button.classList.remove('is-refreshing');main.querySelector('#inv-disconnect')?.toggleAttribute('disabled',connecting||!portfolio);if(!paused)timer=setTimeout(refresh,30000);}}
 }
 async function connect(){
  if(!live()||connecting)return;
  connecting=true;connectIssue='';clearTimeout(timer);const target=root;
  draw();
  try{
   const result=await read('connect?environment='+environment+'&returnUrl='+encodeURIComponent(location.origin+'/#/investments'),{method:'POST',body:'{}'});
   if(!live()||root!==target)return;
   beginSaxoSignIn(result);
  }catch(err){
   if(!live()||root!==target)return;
   connectIssue=err.code==='SAXO_CALLBACK_REGISTRATION_REQUIRED'?L('Saxo sign-in is not configured yet. Please try again after setup is complete.','Saxo-login er endnu ikke konfigureret. Prøv igen, når opsætningen er færdig.'):issueText(err);connectCode=err.code||'';
   connecting=false;draw();timer=setTimeout(refresh,30000);
  }
 }
 async function connectMarketData(){
  if(marketConnecting)return;marketConnecting=true;drawMarketAuth();
  try{const next=await read('connect?environment=LIVE&returnUrl='+encodeURIComponent(location.origin+'/#/investments'),{method:'POST',body:'{}'});if(live())beginSaxoSignIn(next,{purpose:'market-data',tradingEnvironment:environment});}
  catch(err){if(!ignored(err))drawChartState(issueText(err));marketConnecting=false;if(live())drawMarketAuth();}
 }
 async function loadResearch(){
  researchLoading=true;
  try{const rows=await api('research',{signal:controller.signal});if(!live())return;research=Array.isArray(rows)?rows:[];researchIssue='';}
  catch(err){if(ignored(err))return;researchIssue=errorText(err);}
  finally{researchLoading=false;if(live()&&root.querySelector('.inv-canvas'))drawWatchlist();}
 }
 function model(){
  const m=investmentSummary(portfolio),holdings=portfolio?investmentHoldings(portfolio.positions):[],complete=!!portfolio&&!portfolio.hasMore&&holdings.length>0;
  const lv=investmentLiveView(holdings,h=>quoteEntry(h.symbol)?.snap||null);
  // valueTotal is broker-reported only; sizeTotal may include same-currency LIVE estimates and is labelled as such.
  const valueTotal=complete&&holdings.every(h=>finite(h.marketValue))?holdings.reduce((s,h)=>s+h.marketValue,0):null;
  const costTotal=complete&&holdings.every(h=>h.cost>0)?holdings.reduce((s,h)=>s+h.cost,0):null;
  return {m,holdings:lv.items,basis:lv.basis,valueTotal,sizeTotal:complete?lv.sizeTotal:null,estimated:lv.estimated,costTotal};
 }
 // Market reads change quotes and estimates only; broker account figures and the header stay as drawn.
 function redrawMarket(){if(!live()||!root.querySelector('.inv-canvas'))return;drawMarketAuth();view=model();drawHoldings();drawFocus();drawOrders();drawWatchlist();}
 // The header holds each connection's state and its single sign-in action; nothing else on the page offers one.
 function authView(state){
  const status={connected:L('Connected','Tilsluttet'),attention:L('Check connection','Kontrollér forbindelse'),checking:L('Checking…','Kontrollerer…')}[state]||'';
  return saxoAuthView({name:`Saxo ${environment}`,state,status,busy:connecting,L});
 }
 function marketAuthView(kind){
  return saxoAuthView({name:L('Saxo LIVE market data','Saxo LIVE-markedsdata'),state:kind||'required',canSignIn:S.mode==='Live',busy:marketConnecting,visible:!!kind,actionNote:S.mode==='Live'?L('Your trading environment stays unchanged.','Dit handelsmiljø ændres ikke.'):'',L});
 }
 const tradingAuth=()=>investmentAuthState({portfolioCode,orderCode,connectCode});
 function drawAuth(){
  const auth=tradingAuth();
  saxoAuthApply(main.querySelector('#inv-connection'),authView(auth||(portfolioIssue||orderIssue||connectIssue?'attention':portfolio?'connected':'checking')));
  drawMarketAuth(auth);
 }
 // LIVE market data uses the same LIVE sign-in as the LIVE trading environment, so only one of them offers it.
 function drawMarketAuth(auth=tradingAuth()){
  const host=main?.querySelector('#inv-market-auth');if(!host)return;
  saxoAuthApply(host,marketAuthView(market.blocked?.kind==='signin'&&!(environment==='LIVE'&&auth)?saxoAuthKind(market.blocked.code)||'required':null));
 }
 function draw(){
  if(!live())return;
  view=model();
  const size=h=>view.basis==='market'?h.valuation.baseValue:view.basis==='cost'?h.cost:1;
  if(!view.holdings.some(h=>h.key===selection))selection=view.holdings.slice().sort((a,b)=>size(b)-size(a))[0]?.key||null;
  main.querySelector('#inv-disconnect')?.toggleAttribute('disabled',busy||connecting||!portfolio);
  main.querySelector('#inv-environment')?.toggleAttribute('disabled',connecting);
  drawAuth();
  main.querySelector('#inv-read').textContent=`${portfolio?L('Read','Hentet'):L('Last attempt','Seneste forsøg')} ${time(portfolio?.observedAt||lastRead)} · ${paused?L('Refresh paused','Opdatering sat på pause'):L('Refreshes every 30 sec.','Opdateres hvert 30. sek.')}`;
  if(!root.querySelector('.inv-canvas')){
   root.innerHTML=`<div class="inv-source"></div><div class="inv-notice-slot"></div><div class="inv-canvas">
    <section class="inv-panel inv-holdings" aria-labelledby="inv-holdings-title"></section>
    <section class="inv-panel inv-focus" aria-labelledby="inv-focus-title"><div class="inv-focus-head"></div><div class="inv-focus-body"><div class="inv-chart-area"><div class="inv-chart" id="inv-chart"></div><div class="inv-chart-state"></div><p class="inv-chart-meta"></p></div><div class="inv-focus-facts"></div><div class="inv-focus-details"></div></div></section>
    <div class="inv-side"><section class="inv-panel inv-alloc" aria-labelledby="inv-alloc-title"></section><section class="inv-panel inv-orders" id="inv-orders" tabindex="-1" aria-labelledby="inv-orders-title"></section></div>
    <section class="inv-panel inv-watch" aria-labelledby="inv-watch-title"></section></div>`;
   treemapResize=new ResizeObserver(()=>layoutTreemap());treemapResize.observe(root.querySelector('.inv-holdings'));
  }
  drawSource();drawNotice();drawHoldings();drawFocus();drawAllocation();drawOrders();drawWatchlist();
  composeScene?.(main);
 }
 function drawSource(){
  const {m,holdings,costTotal}=view,pnlShare=m.pnl!==null&&costTotal>0?m.pnl/costTotal*100:null;
  const metrics=[['portfolio',L('Account value','Kontoværdi'),m.total,''],
   ['cash',L('Booked cash','Bogførte kontanter'),m.cash,m.available!==null?`${L('Available to trade','Til rådighed for handel')} ${amount(m.available,m.currency)}`:''],
   ['invested',L('Invested','Investeret'),m.invested,portfolio?`${holdings.length}${portfolio.hasMore?'+':''} ${holdings.length===1?L('holding','beholdning'):L('holdings','beholdninger')}`:''],
   ['pnl',L('Unrealised trade P&L','Urealiseret handelsresultat'),m.pnl,pnlShare!==null?`${pct(pnlShare)} ${L('on','af')} ${amount(costTotal,m.currency)} ${L('purchase value','købsværdi')}`:'']];
  patch(root.querySelector('.inv-source'),`<section class="inv-metrics" aria-label="${L('Account summary','Kontooverblik')}">${metrics.map(([icon,title,value,note])=>`<article class="inv-metric"><div><span class="inv-metric-icon" data-tone="${icon}">${icons[icon]}</span><span>${title}</span></div><strong${icon==='pnl'&&finite(value)?` class="${value<0?'inv-negative':'inv-positive'}"`:''}>${amount(value,m.currency)}</strong>${note?`<small>${note}</small>`:''}</article>`).join('')}${m.allocation?`<div class="inv-allocation" aria-hidden="true"><span data-share="${m.allocation.cash}"></span><span data-share="${m.allocation.invested}"></span></div>`:''}</section>
   <div class="inv-meta">${environment==='SIM'?L('Simulation · excluded from your personal wealth','Simulation · indgår ikke i din personlige formue'):L('LIVE · read only · shown separately from recorded wealth','LIVE · kun læsning · vises separat fra registreret formue')}</div>`);
  root.querySelectorAll('.inv-allocation>[data-share]').forEach(s=>s.style.width=`${Math.max(0,Math.min(100,+s.dataset.share))}%`);
 }
 function drawNotice(){
  // Sign-in problems have no banner: the header control states them and holds the only sign-in action.
  patch(root.querySelector('.inv-notice-slot'),investmentNoticeMarkup(investmentNotice({portfolio,orders,portfolioIssue,portfolioCode,orderIssue,orderCode,connectIssue,connectCode}),{L,e}));
  bind(root.querySelector('.inv-notice-slot'));
 }
 function bind(node){
  node.querySelectorAll('[data-inv-retry]').forEach(b=>{b.onclick=()=>{void refresh(true);};b.disabled=connecting;});
 }
 const unavailable=(subject,message)=>investmentUnavailableMarkup({auth:tradingAuth(),subject,message,icon:icons.portfolio},{L,e});
 function drawHoldings(){
  const host=root.querySelector('.inv-holdings'),{holdings,basis,valueTotal,sizeTotal}=view;
  const todayReady=holdings.some(h=>h.valuation.dayChange!==null);
  if(!todayReady)colour='purchase';
  const size=h=>basis==='market'?h.valuation.baseValue:basis==='cost'?h.cost:1,totalSize=holdings.reduce((s,h)=>s+size(h),0);
  const anyEstimate=holdings.some(h=>h.valuation.source==='estimate');
  const total=valueTotal!==null?amount(valueTotal,view.m.currency):basis==='market'&&sizeTotal!==null?`${L('Est.','Anslået')} ${amount(sizeTotal,view.m.currency)}`:'';
  const summary=!portfolio?'':`${holdings.length}${portfolio.hasMore?'+':''} ${holdings.length===1?L('holding','beholdning'):L('holdings','beholdninger')}${total?` · ${total}`:''}`;
  const toolbar=todayReady?`<div class="inv-segment" role="group" aria-label="${L('Colour tiles by','Farv felter efter')}">${[['today',L('Today','I dag')],['purchase',L('Since purchase','Siden køb')]].map(([id,title])=>`<button type="button" data-inv-colour="${id}" data-inv-focus="colour-${id}" aria-pressed="${colour===id}">${title}</button>`).join('')}</div>`:holdings.length?`<span class="inv-chip">${L('Colour: change since purchase','Farve: udvikling siden køb')}</span>`:'';
  const tiles=holdings.slice().sort((a,b)=>size(b)-size(a)).map(h=>{
   const v=h.valuation,est=v.source==='estimate',change=investmentHoldingChange(h,colour,v);
   const weight=sizeTotal>0&&finite(v.baseValue)?v.baseValue/sizeTotal*100:null;
   const estimate=est?`${L('Est.','Anslået')} ${amount(v.marketValue,v.valueCurrency)}`:'';
   const value=basis==='market'?`${est?L('Est.','Anslået')+' ':''}${amount(v.baseValue,h.baseCurrency)}${weight!==null?` · ${share(weight)}`:''}`:estimate||(basis==='cost'?`${L('Purchase value','Købsværdi')} ${amount(h.cost,h.baseCurrency)}`:`${number(h.quantityText)} ${L('shares','stk.')}`);
   const badge=est?`<span class="inv-tile-badge" title="${e(saxoResponseMeta(v.quote,{L,locale:locale(),history:false}).join(' · '))}">LIVE<span class="inv-sr"> · ${e(saxoDelayLabel('quote',v.quote.quoteDelayMinutes,L))}</span></span>`:v.source==='broker'&&finite(h.priceDelayMinutes)&&h.priceDelayMinutes>0?`<span class="inv-tile-badge" title="${L('Price delayed','Kurs forsinket')} ${e(h.priceDelayMinutes)} min.">${e(h.priceDelayMinutes)}m</span>`:'';
   const tileHistory=colour==='today'&&h.pair.paired?market.results.get(K(h.symbol))?.snap:null,bars=tileHistory?.bars;
   return `<button type="button" class="inv-tile" data-inv-tile="${e(h.key)}" data-inv-focus="tile-${e(h.key)}" data-size="${size(h)}" data-share="${totalSize>0?size(h)/totalSize*100:0}" data-change="${change??''}" data-tone="${change===null?'neutral':tone(change)}" aria-pressed="${h.key===selection}"><span class="inv-tile-top"><span><strong>${e(ticker(h))}</strong><span class="inv-tile-name">${e(label(h))}</span></span>${badge}</span><span class="inv-tile-bottom"><span class="inv-tile-change"><span class="inv-sr">${colour==='today'?L('Today, Saxo LIVE','I dag, Saxo LIVE'):L('Since purchase','Siden køb')}${est&&colour!=='today'?' '+L('(estimated)','(anslået)'):''}: </span>${pct(change)}</span><span class="inv-tile-value">${value}</span></span><span class="inv-tile-share" aria-hidden="true"><i></i></span>${bars?spark(bars,h.pair.previousClose)+`<small class="inv-tile-meta">${e(saxoResponseMeta(tileHistory,{L,locale:locale(),quote:false}).join(' · '))}</small>`:''}</button>`;
  }).join('');
  const sizing=basis==='market'?(view.estimated?L('Values marked Est. are estimated from Saxo LIVE quotes in the account currency; broker values are used where Saxo SIM supplies them.','Værdier markeret Anslået er beregnet ud fra Saxo LIVE-kurser i kontovalutaen; mæglerens værdier bruges, hvor Saxo SIM leverer dem.'):'')
   :basis==='cost'?(anyEstimate?L('Saxo SIM has no reliable current values. Estimates marked LIVE use Saxo LIVE quotes in each instrument’s currency; without an exchange rate, tiles are sized by purchase value.','Saxo SIM har ingen pålidelige aktuelle værdier. Skøn markeret LIVE bruger Saxo LIVE-kurser i værdipapirets valuta; uden en valutakurs har felterne størrelse efter købsværdi.'):L('Saxo has not supplied reliable current values, so tiles are sized by purchase value and current changes show as —.','Saxo har ikke leveret pålidelige aktuelle værdier, så felterne har størrelse efter købsværdi, og aktuelle ændringer vises som —.'))
   :L('Values are unavailable, so the tiles have equal sizes.','Værdierne er ikke tilgængelige, så felterne har ens størrelse.');
  const body=!portfolio?unavailable('holdings',portfolioIssue):!holdings.length?`<div class="inv-empty">${icons.portfolio}<p><strong>${L('No holdings yet','Ingen beholdninger endnu')}</strong></p><p>${L('Saxo has not reported any holdings. Pending orders appear under Working orders until they are filled.','Saxo har endnu ikke registreret beholdninger. Ventende ordrer vises under Aktive ordrer, indtil de bliver gennemført.')}</p><a href="#/markets">${L('Explore Markets','Udforsk Markeder')} →</a></div>`
   :`<div class="inv-treemap" role="group" aria-label="${L('Holdings map. Select a holding to see its details.','Beholdningskort. Vælg en beholdning for at se detaljerne.')}">${tiles}</div>
    ${sizing?`<p class="inv-panel-note">${sizing}</p>`:''}
    ${portfolio.hasMore?`<p class="inv-notice">${L('The first 100 records are shown. This list is incomplete.','De første 100 poster vises. Listen er ikke komplet.')}</p>`:''}`;
  patch(host,`<div class="inv-panel-head"><h2 id="inv-holdings-title">${L('Holdings','Beholdninger')}</h2><div class="inv-toolbar">${toolbar}${summary?`<span class="inv-panel-meta">${summary}</span>`:''}</div></div>${body}`);
  host.querySelectorAll('.inv-tile').forEach(t=>{const change=t.dataset.change===''?null:+t.dataset.change;t.style.backgroundColor=change===null||change===0?'':`color-mix(in srgb,var(${change<0?'--bad':'--good'}) ${Math.min(40,10+Math.abs(change)*6).toFixed(0)}%,var(--surface))`;t.onclick=()=>select(t.dataset.invTile);});
  host.querySelectorAll('[data-inv-colour]').forEach(b=>b.onclick=()=>{colour=b.dataset.invColour;drawHoldings();});
  bind(host);layoutTreemap();
 }
 function layoutTreemap(){
  const host=root?.querySelector('.inv-treemap');if(!host)return;
  const tiles=[...host.querySelectorAll('.inv-tile')],width=host.clientWidth,stacked=width<520||tiles.length>24;
  host.classList.toggle('is-stacked',stacked);
  if(stacked){tiles.forEach(t=>{t.style.left=t.style.top=t.style.width=t.style.height='';t.classList.remove('is-small','is-tiny');const bar=t.querySelector('.inv-tile-share>i');if(bar)bar.style.width=`${Math.max(2,Math.min(100,+t.dataset.share))}%`;});return;}
  investmentTreemap(tiles.map(t=>({v:+t.dataset.size,t})),width,host.clientHeight).forEach(r=>{const t=r.item.t,g=3;Object.assign(t.style,{left:r.x+g+'px',top:r.y+g+'px',width:Math.max(0,r.w-g*2)+'px',height:Math.max(0,r.h-g*2)+'px'});t.classList.toggle('is-small',r.w<180||r.h<130);t.classList.toggle('is-tiny',r.w<90||r.h<70);});
 }
 function spark(bars,base){
  const closes=(bars||[]).map(b=>b.close);if(closes.length<2)return '';
  const all=base>0?[...closes,base]:closes,min=Math.min(...all),max=Math.max(...all),span=max-min||1,y=v=>(30-(v-min)/span*28).toFixed(2);
  const path=closes.map((v,i)=>`${i?'L':'M'}${(i/(closes.length-1)*100).toFixed(2)} ${y(v)}`).join(' ');
  return `<svg class="inv-spark" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true" data-tone="${closes.at(-1)>=(base>0?base:closes[0])?'positive':'negative'}">${base>0?`<path class="inv-spark-base" d="M0 ${y(base)} L100 ${y(base)}"/>`:''}<path d="${path}"/></svg>`;
 }
 function select(key){
  if(key===selection)return;selection=key;
  root.querySelectorAll('.inv-tile').forEach(t=>t.setAttribute('aria-pressed',String(t.dataset.invTile===key)));
  drawFocus();
  const focus=root.querySelector('.inv-focus');
  if(root.clientWidth<=900&&focus)focus.scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
 }
 function drawAllocation(){
  const host=root.querySelector('.inv-alloc'),m=view.m,a=portfolio?investmentAllocation(portfolio,allocBy):null;
  const by=allocBy==='currency'?L('currency','valuta'):L('asset type','aktivtype');
  const reasons={unreconciled:L('Cash and invested amounts do not reconcile with the account value, so the split is not shown.','Kontanter og investeret beløb stemmer ikke med kontoværdien, så fordelingen vises ikke.'),incomplete:L('Saxo reported more holdings than Banking reads, so the split is not shown.','Saxo har flere beholdninger, end Banking læser, så fordelingen vises ikke.'),valuation:L(`Saxo has not supplied reliable current values for every holding, so the split by ${by} is not shown.`,`Saxo har ikke leveret pålidelige aktuelle værdier for alle beholdninger, så fordelingen efter ${by} vises ikke.`),positions:L('Holding values do not add up to the invested amount, so the split is not shown.','Beholdningernes værdier svarer ikke til det investerede beløb, så fordelingen vises ikke.'),labels:L(`Some holdings have no reported ${by}, so the split is not shown.`,`Nogle beholdninger mangler ${by}, så fordelingen vises ikke.`),empty:L('There is no value to split.','Der er ingen værdi at fordele.')};
  let tones=0;const parts=(a?.parts||[]).map(p=>({...p,tone:p.key==='cash'?0:(tones++%4)+1}));
  const R=60,C=2*Math.PI*R,gap=parts.length>1?1.2:0;let offset=0;
  const donut=a?.parts?`<div class="inv-donut-wrap"><div class="inv-donut" role="img" aria-label="${e(`${L('Allocation by','Fordeling efter')} ${by}: ${parts.map(p=>`${groupLabel(p.key)} ${share(p.share)}`).join(', ')}`)}"><svg viewBox="0 0 150 150" aria-hidden="true"><circle class="inv-donut-track" cx="75" cy="75" r="${R}"/>${parts.map(p=>{const length=Math.max(1.5,p.share/100*C-gap),arc=`<circle class="inv-donut-part" data-tone="${p.tone}" cx="75" cy="75" r="${R}" stroke-dasharray="${length.toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}"/>`;offset+=p.share/100*C;return arc;}).join('')}</svg><div class="inv-donut-center"><strong>${e(new Intl.NumberFormat(locale(),{notation:'compact',maximumFractionDigits:1}).format(a.total))}</strong><small>${e(a.currency)}</small></div></div>
   <dl class="inv-legend">${parts.map(p=>`<div><dt><i data-tone="${p.tone}"></i>${e(groupLabel(p.key))}</dt><dd><strong>${share(p.share)}</strong><small>${amount(p.value,a.currency)}</small></dd></div>`).join('')}</dl></div>
   <p class="inv-panel-note">${L('Cash after settlement and invested amounts reconcile with the account value, so the split is shown.','Kontanter efter afvikling og investeret beløb stemmer med kontoværdien, så fordelingen vises.')}</p>`:'';
  const body=!portfolio?`<p class="inv-panel-note">${L('Account data is unavailable.','Kontodata er ikke tilgængelige.')}</p>`:a.reason?`<p class="inv-panel-note" role="status">${reasons[a.reason]}</p>`:donut;
  patch(host,`<div class="inv-panel-head"><h2 id="inv-alloc-title">${L('Allocation','Fordeling')}</h2>${portfolio?`<div class="inv-segment" role="group" aria-label="${L('Group allocation by','Gruppér fordeling efter')}">${[['type',L('Asset type','Aktivtype')],['currency',L('Currency','Valuta')]].map(([id,title])=>`<button type="button" data-inv-alloc="${id}" data-inv-focus="alloc-${id}" aria-pressed="${allocBy===id}">${title}</button>`).join('')}</div>`:''}</div>${body}${investmentSettlementMarkup(m,{L,money})}`);
  host.querySelectorAll('[data-inv-alloc]').forEach(b=>b.onclick=()=>{allocBy=b.dataset.invAlloc;drawAllocation();});
 }
 function drawOrders(){
  const host=root.querySelector('.inv-orders'),list=orders?.orders,history=orders?.history;
  const count=Array.isArray(list)?`${list.length}${orders.hasMore?'+':''}`:'—';
  const cards=(list||[]).map(x=>{
   const currency=x.currency||metadata.get(x.uic)?.currency,accepted=(history||[]).find(event=>event.orderId===x.orderId&&event.subStatus==='Confirmed'&&event.status==='Placed')?.time;
   const s=investmentOrderSteps(x,accepted),side=x.side==='Buy'?L('Buy','Køb'):x.side==='Sell'?L('Sell','Sælg'):e(x.side||'—');
   const stepLabel=k=>k==='placed'?L('Placed','Afgivet'):k==='filled'?L('Filled','Gennemført'):stateLabels[k]?.()||stateLabels.unknown();
   const q=investmentQuotePair({symbol:x.symbol,currency},quoteEntry(x.symbol)?.snap),distance=q.paired&&finite(x.price)?(x.price/q.price-1)*100:null;
   const terms=[x.orderType?eventLabel(x.orderType):null,x.duration?eventLabel(x.duration):null,s.state==='partial'&&s.filled!==null?`${L('Filled','Gennemført')} ${number(s.filled)} ${L('of','af')} ${number(s.quantity)}`:null,distance!==null?`${L('Limit is','Limit er')} ${share(Math.abs(distance))} ${distance<0?L('below','under'):L('above','over')} ${L('the last Saxo LIVE quote','seneste Saxo LIVE-kurs')}`:null].filter(Boolean);
   return `<article class="inv-order" data-state="${s.state}"><div class="inv-order-top">${monogram(x)}<strong>${side} ${number(x.quantityText??x.quantity)} ${e(label(x))}</strong><span class="inv-order-price">${amount(x.price,currency)}</span></div>
    <ol class="inv-steps" aria-label="${L('Order lifecycle','Ordreforløb')}">${s.steps.map(step=>`<li data-step="${step.status}" data-state="${step.key}"${step.status==='current'?' aria-current="step"':''}><span>${stepLabel(step.key)}</span>${step.time?`<time datetime="${e(step.time)}">${e(time(step.time))}</time>`:''}</li>`).join('')}</ol>
    ${terms.length?`<p class="inv-order-note">${terms.join(' · ')}</p>`:''}</article>`;
  }).join('');
  const events=(history||[]).slice().sort((a,b)=>Date.parse(b.time)-Date.parse(a.time));
  const eventText=x=>{const kind=investmentActivityKind(x);return kind==='filled'?`${L('Filled','Gennemført')} · ${number(x.filled)}`:kind==='partial'?`${L('Partially filled','Delvist gennemført')} · ${number(x.filled)}`:`${eventLabel(x.status)} · ${eventLabel(x.subStatus)}`;};
  const activity=orders?`<details class="inv-activity"${activityOpen?' open':''}><summary data-inv-focus="activity">${L('Recent activity · 7 days','Seneste aktivitet · 7 dage')} (${orders.historyError||!Array.isArray(history)?'—':history.length+(orders.historyHasMore?'+':'')})</summary>${orders.historyError?`<p class="inv-panel-note">${e(issueText({code:orders.historyError}))}</p>`:events.length?`<ul>${events.slice(0,20).map(x=>`<li><span><strong>${e(label(x))}</strong><small>${e(time(x.time))}</small></span><span>${eventText(x)}</span></li>`).join('')}</ul>${events.length>20?`<p class="inv-panel-note">${events.length-20} ${L('older events are not shown.','ældre hændelser vises ikke.')}</p>`:''}`:`<p class="inv-panel-note">${L('No broker events were returned for the last 7 days.','Saxo har ikke returneret hændelser for de seneste 7 dage.')}</p>`}<p class="inv-panel-note">${L('Order acceptance is not a fill. Only a confirmed fill means shares were bought or sold.','En accepteret ordre er ikke en gennemført handel. Kun en bekræftet handel betyder, at aktier er købt eller solgt.')}</p></details>`:'';
  const body=!Array.isArray(list)?unavailable('orders',orderIssue):list.length?`<div class="inv-order-list">${cards}</div>`:`<p class="inv-panel-note"><strong>${L('No working orders','Ingen aktive ordrer')}</strong><br>${L('New orders appear here until Saxo reports them filled.','Nye ordrer vises her, indtil Saxo rapporterer dem gennemført.')}</p>`;
  patch(host,`<div class="inv-panel-head"><h2 id="inv-orders-title">${L('Working orders','Aktive ordrer')}</h2><span class="inv-count">${count}</span></div>${body}${orders?.hasMore?`<p class="inv-notice">${L('The first 100 records are shown. This list is incomplete.','De første 100 poster vises. Listen er ikke komplet.')}</p>`:''}${activity}${orders?`<p class="inv-panel-note">${L('Order data read','Ordredata hentet')} ${e(time(orders.observedAt))}. ${L('The limit price is not an execution price.','Limitkursen er ikke en handelskurs.')}</p>`:''}`);
  host.querySelector('.inv-activity')?.addEventListener('toggle',ev=>{activityOpen=ev.currentTarget.open;});
  bind(host);
 }
 function drawFocus(){
  const panel=root.querySelector('.inv-focus'),h=selectedHolding();
  root.querySelector('.inv-canvas').classList.toggle('no-focus',!h);panel.hidden=!h;
  if(!h){destroyChart();return;}
  const v=h.valuation,est=v.source==='estimate',q=v.quote,lotsCount=h.lots.length,change=investmentHoldingChange(h,'purchase',v);
  const weight=view.sizeTotal>0&&finite(v.baseValue)?v.baseValue/view.sizeTotal*100:null;
  patch(panel.querySelector('.inv-focus-head'),`<div class="inv-focus-title">${monogram(h)}<h2 id="inv-focus-title">${e(label(h))}</h2><span class="inv-chip">${e(ticker(h))} · ${e(h.currency||'—')}</span><span class="inv-focus-quote"></span></div><div class="inv-segment inv-ranges" role="group" aria-label="${L('Chart period','Grafperiode')}">${ranges.map(([id,title])=>`<button type="button" data-inv-range="${id}" data-inv-focus="range-${id}" aria-pressed="${range===id}">${title}</button>`).join('')}</div>`);
  const costLabels={commission:L('Opening commission','Kurtage ved køb'),exchangeFee:L('Opening exchange fee','Valutagebyr ved køb'),stampDuty:L('Stamp duty','Stempelafgift'),additionalTransactionCosts:L('Additional transaction costs','Yderligere handelsomkostninger'),externalCharges:L('External charges','Eksterne gebyrer'),performanceFee:L('Performance fee','Resultatgebyr')};
  const estNote=L('Est. from Saxo LIVE quote','Anslået ud fra Saxo LIVE-kurs'),liveNote=q?`Saxo LIVE · ${saxoResponseMeta(q,{L,locale:locale(),history:false}).join(' · ')}`:'';
  const stats=[[L('Quantity','Antal'),number(h.quantityText),lotsCount>1?`${lotsCount} ${L('purchases','køb')}`:''],[lotsCount>1?L('Average open price','Gns. købskurs'):L('Open price','Købskurs'),price(h.openPrice,h.currency,h.priceDecimals),''],
   [L('Current price','Aktuel kurs'),price(v.price,v.priceCurrency||h.currency,h.priceDecimals),v.source==='broker'?saxoDelayLabel('quote',h.priceDelayMinutes,L):est?liveNote:''],
   [L('Market value','Markedsværdi'),amount(v.marketValue,v.valueCurrency),est?estNote:''],
   [L('Unrealised trade P&L','Urealiseret handelsresultat'),amount(v.pnl,v.valueCurrency),[change!==null?pct(change):'',est?L('Est., before charges','Anslået, før omkostninger'):''].filter(Boolean).join(' · '),v.pnl],
   [L('Weight','Vægt'),share(weight),weight!==null?(view.estimated?L('Est. share of holdings’ value','Anslået andel af beholdningernes værdi'):L('of holdings’ value','af beholdningernes værdi')):'']];
  const details=[[L('Purchase value','Købsværdi'),amount(h.cost,h.baseCurrency)],...h.costs.map(c=>[costLabels[c.key],amount(c.value,c.currency)]),[L('Opened','Åbnet'),e(time(h.openedAt))],[L('Settlement date','Afviklingsdato'),e(day(h.valueDate))],[L('Price observed','Kurs observeret'),e(time(v.source==='broker'?h.priceAsOf:est?q.quoteTime:null))],[L('Asset type','Aktivtype'),e(h.assetType||'—')]];
  const access=investmentTradeAccess(environment,h),research=investmentResearchSymbol(h)||h.researchSymbol;
  const actions=access==='live'?`<p class="inv-detail-note" role="note">${L('LIVE is read only in Banking. Order entry is available in Saxo SIM only.','LIVE er kun til læsning i Banking. Ordrer kan kun afgives i Saxo SIM.')}</p>`:access==='sim'?`<div class="inv-actions"><button type="button" class="inv-buy" data-inv-trade="Buy" data-inv-focus="trade-buy">${L('Buy more','Køb flere')}</button><button type="button" class="inv-sell" data-inv-trade="Sell" data-inv-focus="trade-sell">${L('Sell','Sælg')}</button></div><p class="inv-detail-note">${L('Saxo SIM · simulation account. Limit orders valid today.','Saxo SIM · simulationskonto. Limitordrer gældende i dag.')}</p>`:`<p class="inv-detail-note">${L('Broker-reported values. Trading this asset type is not supported in Banking.','Værdier fra Saxo. Handel med denne aktivtype understøttes ikke i Banking.')}</p>`;
  const reason=quoteReason(h);
  const valuationNote=est?`${L(`Saxo SIM has no reliable valuation for this holding. Current price, market value and P&L are estimates from the Saxo LIVE quote in ${v.valueCurrency}, before charges; account totals use broker figures only.`,`Saxo SIM har ingen pålidelig værdi for denne beholdning. Aktuel kurs, markedsværdi og resultat er skøn ud fra Saxo LIVE-kursen i ${v.valueCurrency}, før omkostninger; kontototaler bruger kun mæglerens tal.`)}${v.baseValue===null?' '+L(`Without an exchange rate, its value in ${h.baseCurrency||'the account currency'} stays unknown.`,`Uden en valutakurs er værdien i ${h.baseCurrency||'kontovalutaen'} ukendt.`):''}`
   :v.source==='unknown'?`${L('Saxo has not supplied a reliable current valuation. Price, market value and unrealised P&L are unavailable; the confirmed purchase details remain available.','Saxo har ikke leveret en pålidelig aktuel værdi. Kurs, markedsværdi og urealiseret resultat er utilgængelige; de bekræftede købsoplysninger vises her.')}${reason?' '+reason:''}`
   :reason&&v.dayChange===null?`${L('Today’s change needs a Saxo LIVE quote.','Dagens ændring kræver en Saxo LIVE-kurs.')} ${reason}`:'';
  patch(panel.querySelector('.inv-focus-facts'),`<div class="inv-stats">${stats.map(([title,value,note,sign])=>`<div class="inv-stat"><span>${title}</span><strong${sign!==undefined&&finite(sign)&&sign!==0?` class="${sign<0?'inv-negative':'inv-positive'}"`:''}>${value}</strong>${note?`<small>${note}</small>`:''}</div>`).join('')}</div>
   ${valuationNote?`<p class="inv-detail-note" role="status">${e(valuationNote)}</p>`:''}
   ${actions}<a class="inv-research" data-inv-focus="research" href="${research?`#/markets/${encodeURIComponent(research)}`:'#/markets'}">${research?L('Research in Markets','Undersøg i Markeder'):L('Open Markets','Åbn Markeder')} →</a>`);
  patch(panel.querySelector('.inv-focus-details'),`<dl class="inv-facts">${details.map(([a,b])=>`<div><dt>${a}</dt><dd>${b}</dd></div>`).join('')}</dl>
   <p class="inv-detail-note">${h.costs.length?L('Only reported opening charges are shown. Missing charges are unknown, not zero.','Kun oplyste købsomkostninger vises. Manglende omkostninger er ukendte, ikke nul.'):L('Opening charges have not been supplied by Saxo.','Saxo har ikke oplyst købsomkostninger.')}</p>`);
  panel.querySelectorAll('[data-inv-range]').forEach(b=>b.onclick=()=>{if(range===b.dataset.invRange)return;range=b.dataset.invRange;panel.querySelectorAll('[data-inv-range]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));void loadHistory();});
  panel.querySelectorAll('[data-inv-trade]').forEach(b=>b.onclick=()=>openDrawer(h,b.dataset.invTrade,b));
  // A routine redraw keeps the drawn chart; only a new holding or period reads history again.
  if(market.history?.key!==K(h.symbol)||market.history.period!==range)void loadHistory();else drawMarket();
 }
 // Why the selected holding has no usable LIVE quote, in the user's terms.
 function quoteReason(h){
  if(!h.symbol)return marketText({kind:'listing',code:'NO_LISTING'});
  if(market.blocked)return marketText(market.blocked);
  const entry=quoteEntry(h.symbol),p=h.pair,snap=p.snapshot;
  if(p.paired)return '';
  if(!entry)return market.checked?'':L('Checking the Saxo LIVE quote…','Kontrollerer Saxo LIVE-kursen…');
  if(entry.issue&&!snap)return marketText(entry.issue);
  if(['symbol','assetType','currency'].includes(p.reason))return L(`The Saxo LIVE listing (${snap?.symbol||'—'} · ${snap?.currency||'—'}) does not match this holding, so its price is not used.`,`Saxo LIVE-noteringen (${snap?.symbol||'—'} · ${snap?.currency||'—'}) svarer ikke til denne beholdning, så kursen bruges ikke.`);
  if(p.reason==='denied')return L(`Saxo denied access to the current quote (${evidence({code:'SAXO_MARKET_DATA_NO_ACCESS',diagnostics:snap.diagnostics.filter(d=>d.operation==='quote')})}).`,`Saxo afviste adgang til den aktuelle kurs (${evidence({code:'SAXO_MARKET_DATA_NO_ACCESS',diagnostics:snap.diagnostics.filter(d=>d.operation==='quote')})}).`);
  if(p.reason==='stale')return L('The Saxo LIVE quote could not be refreshed, so it is not used.','Saxo LIVE-kursen kunne ikke opdateres, så den bruges ikke.');
  if(p.reason==='mismatch')return L('Saxo’s quote currency does not match the listing, so it is not used.','Saxos kursvaluta svarer ikke til noteringen, så den bruges ikke.');
  return L('The current Saxo LIVE quote is unavailable.','Den aktuelle Saxo LIVE-kurs er ikke tilgængelig.');
 }
 function drawQuote(){
  const node=root?.querySelector('.inv-focus-quote'),h=selectedHolding();if(!node||!h)return;
  const v=h.valuation;
  node.innerHTML=v.price==null?'':`<strong>${price(v.price,v.priceCurrency||h.currency,h.priceDecimals)}</strong>${v.source==='estimate'?`<span class="inv-chip">Saxo LIVE · ${e(saxoDelayLabel('quote',v.quote.quoteDelayMinutes,L))}</span>`:v.source==='broker'?`<span class="inv-chip">${e(saxoDelayLabel('quote',h.priceDelayMinutes,L))}</span>`:''}${v.dayChange!==null?`<span class="inv-change" data-tone="${tone(v.dayChange)}"><span class="inv-sr">${L('Today, Saxo LIVE','I dag, Saxo LIVE')}: </span>${pct(v.dayChange)}</span>`:''}`;
 }
 function drawChartState(message,actions=''){
  const node=root?.querySelector('.inv-chart-state');if(!node)return;
  root.querySelector('.inv-chart-area').classList.toggle('has-chart',!message);
  node.innerHTML=message?`<div class="inv-chart-empty">${icons.chart}<p role="status">${e(message)}</p>${actions}</div>`:'';
  node.querySelector('[data-inv-market-retry]')?.addEventListener('click',retryMarket);
 }
 function retryMarket(){market.blocked=null;market.history=null;for(const [k,x] of market.results)if(x.issue)market.results.delete(k);void marketCycle(false);}
 // Short ranges show the API retrieval time with seconds, so each automatic refresh is visible.
 const sourceMeta=(snap,history)=>['Saxo LIVE',...saxoResponseMeta(snap,{L,locale:locale(),history}),
  SAXO_SHORT_RANGES.includes(range)&&liveEligible()?L(`refreshes every ${SAXO_LIVE_REFRESH_MS/1000} s while visible`,`opdateres hvert ${SAXO_LIVE_REFRESH_MS/1000}. sek., mens siden er synlig`):null].filter(Boolean).map(e).join(' · ');
 function drawMarket(){
  drawQuote();drawMarketAuth();
  const meta=root?.querySelector('.inv-chart-meta'),h=selectedHolding();if(!meta||!h)return;
  const entry=market.history,snap=entry?.snap,issue=entry?.issue||market.blocked;
  const empty=(message,metaHtml='',retry=true)=>{destroyChart();meta.innerHTML=metaHtml;drawChartState(message,investmentChartActions(issue,{retry,L}));};
  if(!snap&&(market.blocked||entry&&!entry.loading))return empty(marketText(issue),'',issue?.kind!=='listing');
  if(!snap)return empty(L('Loading Saxo LIVE price history…','Henter Saxo LIVE-kurshistorik…'),'',false);
  const p=investmentQuotePair(h,snap);
  if(['symbol','assetType','currency'].includes(p.reason))return empty(L(`The Saxo LIVE listing (${snap.symbol||'—'} · ${snap.currency||'—'}) does not match this holding, so its price history is not shown.`,`Saxo LIVE-noteringen (${snap.symbol||'—'} · ${snap.currency||'—'}) svarer ikke til denne beholdning, så kurshistorikken vises ikke.`),'',false);
  if(!snap.bars.length){
   const denied=snap.historyStatus==='denied',history={code:'SAXO_MARKET_HISTORY_NO_ACCESS',diagnostics:snap.diagnostics.filter(d=>d.operation==='history')};
   const rejected=!denied&&history.diagnostics.some(d=>d.code==='SAXO_MARKET_REQUEST_REJECTED');
   const message=denied?L(`Saxo denied access to price history (${evidence(history)}).`,`Saxo afviste adgang til kurshistorikken (${evidence(history)}).`):rejected?L(`Saxo rejected the price-history request (${evidence(history)}).`,`Saxo afviste forespørgslen på kurshistorik (${evidence(history)}).`):snap.historyStatus==='empty'?L('Saxo returned no prices for this period.','Saxo returnerede ingen kurser for denne periode.'):L('Saxo price history is unavailable right now.','Saxo-kurshistorikken er ikke tilgængelig lige nu.');
   return empty(message+(p.paired?' '+L('The current Saxo LIVE quote is still used.','Den aktuelle Saxo LIVE-kurs bruges stadig.'):''),`<span>${sourceMeta(snap,false)}</span>`,snap.historyStatus==='unavailable'&&!rejected);
  }
  drawChartState('');
  const first=snap.bars[0].close,last=snap.bars.at(-1).close,low=Math.min(...snap.bars.map(b=>b.close)),high=Math.max(...snap.bars.map(b=>b.close)),c=snap.currency;
  // Intraday gaps are compressed on the time axis, so one muted line says when Saxo sent no samples; nothing is filled in.
  const gaps=saxoGapNote({missing:snap.missingIntervals,interval:snap.interval},L);
  meta.innerHTML=`<span>${sourceMeta(snap,true)}</span>${gaps?`<span class="inv-chart-gaps">${e(gaps)}</span>`:''}<span class="inv-sr">${e(`${L('Closing prices','Lukkekurser')} ${price(first,c,h.priceDecimals)} → ${price(last,c,h.priceDecimals)}, ${L('range','interval')} ${price(low,c,h.priceDecimals)}–${price(high,c,h.priceDecimals)}.`)}</span><span>${L('Dashed line: your average open price.','Stiplet linje: din gennemsnitlige købskurs.')} <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">${L('Charting by TradingView','Grafer fra TradingView')}</a></span>`;
  if(chartSnap!==snap)void drawChart();
 }
 async function drawChart(){
  const snap=market.history?.snap,h=selectedHolding(),node=root?.querySelector('#inv-chart');if(!snap?.bars.length||!h||!node)return;
  await import('./vendor/lightweight-charts-5.2.0.js');
  if(!live()||market.history?.snap!==snap||selectedHolding()?.key!==h.key)return;
  const LC=window.LightweightCharts,style=getComputedStyle(root),token=name=>style.getPropertyValue(name).trim();
  const accent=token('--accent'),alpha=(color,hex)=>/^#[0-9a-f]{6}$/i.test(color)?color+hex:color,decimals=Number.isInteger(h.priceDecimals)&&h.priceDecimals>=0&&h.priceDecimals<=8?h.priceDecimals:2;
  destroyChart();chartSnap=snap;
  // The library's own logo injects an inline <style> that the CSP blocks; attribution is a normal link below the chart.
  chart=LC.createChart(node,{width:node.clientWidth,height:node.clientHeight||300,layout:{background:{type:'solid',color:'transparent'},textColor:token('--muted'),fontFamily:'inherit',attributionLogo:false},grid:{vertLines:{visible:false},horzLines:{color:alpha(token('--line'),'99')}},rightPriceScale:{borderVisible:false},timeScale:{borderVisible:false,timeVisible:['1h','1d','5d'].includes(market.history.period)},localization:{locale:locale()},handleScroll:false,handleScale:false});
  const average=finite(h.openPrice)&&snap.currency===h.currency?h.openPrice:null;
  // Keep the average-cost line in view even when the price has moved far away from it.
  chartSeries=chart.addSeries(LC.AreaSeries,{lineColor:accent,topColor:alpha(accent,'44'),bottomColor:alpha(accent,'00'),lineWidth:2,priceLineVisible:false,priceFormat:{type:'price',precision:decimals,minMove:1/10**decimals},
   autoscaleInfoProvider:original=>{const info=original();if(info?.priceRange&&average!==null){info.priceRange.minValue=Math.min(info.priceRange.minValue,average);info.priceRange.maxValue=Math.max(info.priceRange.maxValue,average);}return info;}});
  chartSeries.setData(snap.bars.map(b=>({time:b.time,value:b.close})));
  if(average!==null)chartSeries.createPriceLine({price:average,color:token('--warn'),lineStyle:2,lineWidth:1,axisLabelVisible:true,title:L('Avg cost','Gns. kurs')});
  const times=snap.bars.map(b=>b.time),markers=h.lots.map(lot=>{const at=Date.parse(lot.openedAt)/1000;if(!finite(at)||at<times[0])return null;const bar=times.filter(t=>t<=at).at(-1);return bar===undefined?null:{time:bar,position:'belowBar',color:accent,shape:'arrowUp',text:`${L('Buy','Køb')} ${number(lot.quantity)}`};}).filter(Boolean).sort((a,b)=>a.time-b.time);
  if(markers.length&&LC.createSeriesMarkers)LC.createSeriesMarkers(chartSeries,markers);
  chart.timeScale().fitContent();
  chartResize=new ResizeObserver(()=>{if(chart&&node.isConnected){chart.applyOptions({width:node.clientWidth,height:node.clientHeight||300});chart.timeScale().fitContent();}});chartResize.observe(node);
 }
 async function readMarket(symbol,period){
  try{
   const snap=investmentMarketData(await api('markets/chart?symbol='+encodeURIComponent(symbol)+'&range='+period,{signal:controller.signal}));
   if(!snap)throw {code:'SAXO_MARKET_DEPLOYMENT_REQUIRED'};
   if(K(snap.symbol)!==K(symbol)||snap.range&&snap.range!==period)throw {code:'SAXO_MARKET_DATA_MISMATCH'};
   market.available=true;return snap;
  }finally{lastMarketAt=Date.now();}
 }
 // Sign-in, owner, disabled, busy, non-Saxo source or denial for every holding: stop automatic reads and drop earlier prices.
 function block(issue){market.blocked=issue;market.results.clear();if(market.history)market.history={...market.history,snap:null,issue,loading:false};}
 function loadHistory(background=false){
  const h=selectedHolding();if(!h||!live())return Promise.resolve();
  const symbol=h.symbol||null,period=range,key=K(symbol),requestRun=++historyRun;
  const previous=market.history?.key===key&&market.history.period===period?market.history:null;
  if(!symbol||market.blocked){market.history={key,period,snap:null,issue:symbol?market.blocked:{kind:'listing',code:'NO_LISTING',diagnostics:[]},at:0,loading:false};drawMarket();return Promise.resolve();}
  market.history={key,period,snap:previous?.snap||null,issue:previous?.issue||null,at:previous?.at||0,loading:true};
  if(!background||!previous?.snap)drawMarket();
  historyPromise=(async()=>{
   const at=Date.now();
   try{const snap=await readMarket(symbol,period);if(!live()||requestRun!==historyRun)return;market.history={key,period,snap,issue:null,at,loading:false};}
   catch(err){
    if(requestRun!==historyRun)return;
    if(ignored(err)){market.history=null;return;}
    const issue=investmentMarketIssue(err),old=previous?.snap;
    // Only a transient failure may keep earlier bars, explicitly stale and never as a usable quote.
    const kept=issue.kind==='transient'&&old?.bars.length?saxoRetainedSnapshot(old):null;
    market.history={key,period,snap:kept,issue,at,loading:false};
    if(issue.global)block(issue);
   }
   finally{if(requestRun===historyRun&&live()){redrawMarket();scheduleLive();}}
  })();
  return historyPromise;
 }
 // Holdings first (at most 10 listings), then watchlist items, 12 listings in total.
 function quoteSymbols(){
  const held=[],watch=[],seen=new Set(),add=(list,s)=>{const k=K(s);if(k&&!seen.has(k)){seen.add(k);list.push(s);}};
  view.holdings.forEach(h=>{if(held.length<10)add(held,h.symbol);});
  (research||[]).forEach(x=>add(watch,watchSymbol(x)));
  return {held,symbols:[...held,...watch].slice(0,12),total:held.length+watch.length};
 }
 async function loadQuotes(){
  if(market.blocked||!live())return;
  const {held,symbols}=quoteSymbols(),now=Date.now();
  // A fresh failure, or a fresh one-day read made for the chart, is not repeated within the same minute.
  const due=symbols.filter(s=>{const x=quoteEntry(s);return !(x&&now-x.at<45000&&(x.issue||x.period==='1d'));});
  const requestRun=++quoteRun;let next=0;
  const one=async symbol=>{
   const k=K(symbol),at=Date.now();
   try{const snap=await readMarket(symbol,'1d');if(!live()||requestRun!==quoteRun)return;market.results.set(k,{key:k,period:'1d',snap,issue:null,at});}
   catch(err){if(ignored(err)||requestRun!==quoteRun)return;const issue=investmentMarketIssue(err);market.results.set(k,{key:k,period:'1d',snap:null,issue,at});if(issue.global)block(issue);}
  };
  // One probe first, so an unavailable feed costs a single request instead of a batch.
  if(!market.available&&due.length)await one(due[next++]);
  const worker=async()=>{while(!market.blocked&&next<due.length&&live()&&requestRun===quoteRun)await one(due[next++]);};
  await Promise.all([worker(),worker(),worker()]);
  if(!live()||requestRun!==quoteRun)return;
  market.checked=true;
  const outcomes=held.map(quoteEntry),denied=x=>x?.issue?.kind==='denied'&&!x.snap;
  if(!market.blocked&&held.length&&outcomes.every(denied))block({...outcomes.find(denied).issue,all:true});
  redrawMarket();
 }
 // Bounded Saxo usage: the selected holding's history plus at most 12 one-day reads, at most once a minute while visible.
 async function marketCycle(initial){
  if(!live())return;clearTimeout(marketTimer);const cycle=++marketRun;
  if(initial)await historyPromise;else if(!SAXO_SHORT_RANGES.includes(range))await loadHistory(true);
  if(!live()||cycle!==marketRun)return;
  await loadQuotes();
  if(!live()||cycle!==marketRun)return;
  if(!market.blocked&&!document.hidden)marketTimer=setTimeout(()=>marketCycle(false),60000);
 }
 function drawWatchlist(){
  const host=root?.querySelector('.inv-watch');if(!host)return;
  const scroller=host.querySelector('.inv-carousel'),left=scroller?.scrollLeft||0,owned=new Set(view.holdings.flatMap(h=>[h.researchSymbol,h.symbol]).filter(Boolean).map(K));
  const issues=[];let priced=0;
  const cards=(research||[]).map(x=>{
   const entry=quoteEntry(watchSymbol(x)),snap=entry?.snap,ok=snap?.quoteStatus==='available'&&snap.price>0,change=ok?investmentDayChange(snap):null,bars=entry?.period==='1d'?snap?.bars:null;
   const reason=ok?'':market.blocked?marketText(market.blocked):entry?.issue&&!snap?marketText(entry.issue):snap?L('Current Saxo LIVE quote unavailable','Aktuel Saxo LIVE-kurs ikke tilgængelig'):'';
   if(ok)priced++;else if(reason)issues.push(reason);
   return `<a class="inv-wcard" href="#/markets/${encodeURIComponent(x.symbol)}" data-inv-focus="watch-${e(x.id)}"><span class="inv-wcard-top">${monogram(x)}<span><strong>${e(x.name)}</strong><small>${e(ok&&snap.symbol?snap.symbol:x.symbol)}${owned.has(K(x.symbol))?` · ${L('Owned','Ejet')}`:''}</small></span></span>${bars?.length>1?spark(bars,snap.previousClose):'<span class="inv-spark-empty" aria-hidden="true"></span>'}<span class="inv-wcard-price"><span>${ok?price(snap.price,snap.currency,2):'—'}</span>${change!==null?`<span class="inv-change" data-tone="${tone(change)}"><span class="inv-sr">${L('Today','I dag')}: </span>${pct(change)}</span>`:''}</span>${snap?`<small class="inv-response-meta">${e(saxoResponseMeta(snap,{L,locale:locale(),history:entry?.period==='1d'}).join(' · '))}</small>`:''}${reason?`<span class="inv-sr">${e(reason)}</span>`:''}</a>`;
  }).join('');
  const budget=quoteSymbols().total>12;
  const note=!research?.length?'':market.blocked?marketText(market.blocked):!priced&&issues.length?issues[0]:priced?`Saxo LIVE · ${L('prices and today’s change refresh at most once a minute.','kurser og dagens ændring opdateres højst én gang i minuttet.')}${budget?' '+L('Prices are read for 12 listings, holdings first.','Kurser hentes for 12 noteringer, beholdninger først.'):''}`:'';
  const body=research===null?(researchIssue?`<div class="inv-empty inv-empty-compact"><p>${e(researchIssue)}</p><button type="button" data-inv-research-retry data-inv-focus="research-retry">${L('Try again','Prøv igen')}</button></div>`:`<p class="inv-panel-note" role="status">${L('Loading watchlist…','Henter observationsliste…')}</p>`)
   :research.length?`<div class="inv-carousel">${cards}</div>${note?`<p class="inv-panel-note">${e(note)}</p>`:''}`
   :`<div class="inv-empty inv-empty-compact"><p><strong>${L('No watchlist instruments yet','Ingen værdipapirer på observationslisten endnu')}</strong></p><a href="#/markets">${L('Add instruments in Markets','Tilføj værdipapirer i Markeder')} →</a></div>`;
  patch(host,`<div class="inv-panel-head"><h2 id="inv-watch-title">${L('Watchlist','Observationsliste')}</h2>${research?.length?`<span class="inv-count">${research.length}</span>`:''}</div>${body}`);
  const next=host.querySelector('.inv-carousel');if(next&&left)next.scrollLeft=left;
  host.querySelector('[data-inv-research-retry]')?.addEventListener('click',()=>{researchIssue='';drawWatchlist();void loadResearch();});
 }
 const orderMessage=err=>{
  const messages={SAXO_SESSION_REQUIRED:['Your session has expired. Open Banking again to prepare and confirm SIM orders.','Din session er udløbet. Åbn Banking igen for at klargøre og bekræfte SIM-ordrer.'],SAXO_SIM_TRADING_DISABLED:['SIM trading has not been enabled on the shared backend yet. Account data is still available.','SIM-handel er endnu ikke aktiveret på den fælles backend. Kontodata er stadig tilgængelige.'],SAXO_INSUFFICIENT_HOLDINGS:['You do not hold enough shares for this sale. Open sell orders also reserve shares.','Du ejer ikke nok aktier til dette salg. Åbne salgsordrer reserverer også aktier.'],SAXO_CASH_CHECK_FAILED:['Saxo could not confirm enough cash for this order.','Saxo kunne ikke bekræfte kontanter nok til ordren.'],SAXO_ORDER_NOTIONAL_LIMIT:['This order is above the SIM order limit.','Ordren overstiger SIM-grænsen for én ordre.'],SAXO_DAILY_NOTIONAL_LIMIT:['This order would exceed today’s SIM limit.','Ordren vil overstige dagens SIM-grænse.'],SAXO_ORDER_FREQUENCY_LIMIT:['Too many orders in the last minute. Wait before trying again.','For mange ordrer inden for det seneste minut. Vent, før du prøver igen.'],SAXO_INVALID_PRICE_INCREMENT:['The limit price does not match the instrument’s price steps.','Limitkursen passer ikke til værdipapirets kursintervaller.'],SAXO_MINIMUM_QUANTITY:['The quantity is below the instrument’s minimum.','Antallet er under værdipapirets minimum.'],SAXO_ORDERS_SIM_ONLY:['Order entry is available in Saxo SIM only.','Ordrer kan kun afgives i Saxo SIM.']};
  return messages[err?.code]?L(...messages[err.code]):err?.code?.startsWith('SAXO_')?L('Saxo: ','Saxo: ')+err.code.slice(5).replaceAll('_',' '):errorText(err||{});
 };
 const simLabel=text=>`<p class="inv-sim-label">Saxo SIM · ${text}</p>`;
 function openDrawer(h,side,opener){
  drawer?.close();
  const d=document.createElement('dialog');d.className='inv-drawer';d.setAttribute('aria-labelledby','inv-drawer-title');
  d.innerHTML=`<div class="inv-drawer-inner"><div class="inv-drawer-head">${monogram(h)}<h2 id="inv-drawer-title">${e(label(h))}</h2><button type="button" class="inv-drawer-close" aria-label="${L('Close','Luk')}">×</button></div><div class="inv-drawer-body"></div></div>`;
  main.append(d);drawer=d;
  const close=()=>{if(d.dataset.submitting!=='true')d.close();};
  d.querySelector('.inv-drawer-close').onclick=close;
  d.addEventListener('cancel',ev=>{if(d.dataset.submitting==='true')ev.preventDefault();});
  d.addEventListener('click',ev=>{if(ev.target===d)close();});
  d.addEventListener('close',()=>{d.remove();if(drawer===d)drawer=null;if(!live())return;
   if(d.dataset.returnFocus==='orders'){const panel=root.querySelector('#inv-orders');panel?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});panel?.focus({preventScroll:true});return;}
   if(opener?.isConnected)opener.focus({preventScroll:true});else root.querySelector(`[data-inv-focus="${side==='Sell'?'trade-sell':'trade-buy'}"]`)?.focus({preventScroll:true});});
  d.showModal();
  const body=d.querySelector('.inv-drawer-body');
  if(environment!=='SIM'){body.innerHTML=`<p role="status">${L('Order entry is available in Saxo SIM only. LIVE is read only in Banking.','Ordrer kan kun afgives i Saxo SIM. LIVE er kun til læsning i Banking.')}</p>`;return;}
  const uic=Number(h.instrument);
  if(Number.isInteger(uic)&&uic>0)void ticketForm(d,uic,side,h);else void listing(d,h,side);
 }
 async function listing(d,h,side){
  const body=d.querySelector('.inv-drawer-body');body.innerHTML=`${simLabel(L('Simulation account','Simulationskonto'))}<p role="status">${L('Finding the Saxo listing for','Finder Saxo-noteringen for')} <strong>${e(label(h))}</strong>…</p>`;
  try{const query=ticker(h);let matches=await read('instruments?q='+encodeURIComponent(query));if(!d.isConnected)return;
   if(!matches.length&&h.name){matches=await read('instruments?q='+encodeURIComponent(h.name));if(!d.isConnected)return;}
   body.innerHTML=`${simLabel(L('Confirm listing','Bekræft notering'))}<p>${L('Choose the exact listing for','Vælg den præcise notering for')} <strong>${e(label(h))} · ${e(h.symbol||'—')}</strong>.</p><div class="inv-listings">${matches.map((x,i)=>`<button type="button" data-listing="${i}"><strong>${e(x.name)}</strong><small>${e(x.symbol)} · ${e(x.exchange)} · ${L('Stock','Aktie')}</small></button>`).join('')||`<p>${L('No matching Saxo stock found.','Ingen matchende Saxo-aktie fundet.')}</p>`}</div>`;
   body.querySelectorAll('[data-listing]').forEach(b=>b.onclick=()=>ticketForm(d,matches[+b.dataset.listing].uic,side,h));
  }catch(err){if(d.isConnected&&!err?.stale)body.innerHTML=`<p role="alert">${e(orderMessage(err))}</p>`;}
 }
 async function ticketForm(d,uic,side,h){
  const body=d.querySelector('.inv-drawer-body');body.innerHTML=`${simLabel(L('Simulation account','Simulationskonto'))}<p role="status">${L('Loading Saxo order details…','Henter Saxo-ordreoplysninger…')}</p>`;
  try{const detail=await read('ticket?environment=SIM&uic='+encodeURIComponent(uic));if(!d.isConnected)return;
   const rawQuote=detail.quote?.Quote,noAccess=detail.quoteError==='SAXO_MARKET_DATA_NO_ACCESS'||rawQuote?.PriceTypeAsk==='NoAccess'||rawQuote?.PriceTypeBid==='NoAccess',quoteUnavailable=!!detail.quoteError||noAccess||!(rawQuote?.Ask>0||rawQuote?.Bid>0),quote=quoteUnavailable?null:rawQuote;
   const currency=detail.currency||h.currency,held=Number.isInteger(h.quantity)&&h.quantity>0?h.quantity:null,accounts=Array.isArray(detail.accounts)?detail.accounts:[];
   const fill=s=>{const p=s==='Buy'?quote?.Ask:quote?.Bid;return p>0?p:'';};
   body.innerHTML=`${simLabel(L('Limit order · valid today','Limitordre · gælder i dag'))}
    <div class="inv-ticket-quote"><span>${L('Saxo bid / ask','Saxo bud / udbud')}</span><strong>${quote?.Bid>0?e(quote.Bid):'—'} / ${quote?.Ask>0?e(quote.Ask):'—'} ${e(currency||'')}</strong><small>${noAccess?L('Saxo has not granted this SIM account access to stock prices. No price has been filled in.','Saxo har ikke givet denne SIM-konto adgang til aktiekurser. Ingen kurs er udfyldt.'):quoteUnavailable?L('Saxo prices are currently unavailable. No price has been filled in.','Saxo-kurser er ikke tilgængelige lige nu. Ingen kurs er udfyldt.'):quote?.DelayedByMinutes?`${e(quote.DelayedByMinutes)} min ${L('delay','forsinkelse')} · ${L('Your limit controls the order.','Din limit styrer ordren.')}`:L('Indicative price. Your limit controls the order.','Vejledende kurs. Din limit styrer ordren.')}</small></div>
    <form class="inv-ticket" novalidate>
     <fieldset class="inv-side-toggle"><legend class="inv-sr">${L('Action','Handling')}</legend>${[['Buy',L('Buy','Køb')],['Sell',L('Sell','Sælg')]].map(([id,title])=>`<label><input type="radio" name="side" value="${id}"${side===id?' checked':''}><span>${title}</span></label>`).join('')}</fieldset>
     <label for="inv-qty">${L('Shares','Aktier')}</label><div class="inv-stepper"><button type="button" data-step="-1" aria-label="${L('Fewer shares','Færre aktier')}">−</button><input id="inv-qty" name="quantity" type="number" inputmode="numeric" min="1" max="1000" step="1" value="1" required><button type="button" data-step="1" aria-label="${L('More shares','Flere aktier')}">+</button></div>
     ${held?`<p class="inv-ticket-hint">${L('You hold','Du ejer')} ${number(held)} · <button type="button" class="inv-chip-button" data-all="${held}">${L('Use all','Brug alle')}</button></p>`:''}
     <label for="inv-limit">${L('Limit price','Limitkurs')} · ${e(currency||'—')}</label><input id="inv-limit" name="price" type="number" min="0.0001" step="any" inputmode="decimal" value="${e(fill(side))}" required>
     ${quote?`<div class="inv-chips">${quote.Bid>0?`<button type="button" class="inv-chip-button" data-fill="${e(quote.Bid)}">${L('Bid','Bud')} ${e(quote.Bid)}</button>`:''}${quote.Ask>0?`<button type="button" class="inv-chip-button" data-fill="${e(quote.Ask)}">${L('Ask','Udbud')} ${e(quote.Ask)}</button>`:''}</div>`:''}
     <label for="inv-account">${L('Saxo account','Saxo-konto')}</label><select id="inv-account" name="account" required>${accounts.map(a=>`<option value="${e(a.key)}">${e(a.name)} · ${e(a.currency)}</option>`).join('')}</select>
     <dl class="inv-ticket-terms"><div><dt>${L('Order type','Ordretype')}</dt><dd>${L('Limit','Limit')}</dd></div><div><dt>${L('Valid','Gyldig')}</dt><dd>${L('Today (day order)','I dag (dagsordre)')}</dd></div><div><dt>${L('Limit value','Limitværdi')}</dt><dd class="inv-ticket-value">—</dd></div></dl>
     <p class="inv-ticket-error" role="alert"></p>
     <button class="primary inv-ticket-submit" type="submit"></button>
     <p class="inv-detail-note">${L('Saxo checks costs and cash before you confirm. Nothing is sent until you place the order.','Saxo kontrollerer omkostninger og kontanter, før du bekræfter. Intet sendes, før du afgiver ordren.')}</p>
    </form>`;
   const form=body.querySelector('form'),field=name=>form.elements.namedItem(name),qty=field('quantity'),limit=field('price');
   const current=()=>form.querySelector('input[name=side]:checked').value;
   const update=()=>{const n=+qty.value,p=+limit.value;body.querySelector('.inv-ticket-value').innerHTML=n>0&&p>0&&currency?`${amount(n*p,currency)} · ${L('fees in review','omkostninger ved gennemgang')}`:'—';form.querySelector('.inv-ticket-submit').textContent=current()==='Buy'?L('Review buy order','Gennemgå købsordre'):L('Review sell order','Gennemgå salgsordre');};
   form.querySelectorAll('input[name=side]').forEach(r=>r.onchange=()=>{if(!limit.dataset.edited){const p=fill(current());limit.value=p;}update();});
   limit.addEventListener('input',()=>{limit.dataset.edited='true';});
   form.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>{qty.value=String(Math.max(1,Math.min(1000,Math.round(+qty.value||1)+ +b.dataset.step)));update();});
   form.querySelectorAll('[data-fill]').forEach(b=>b.onclick=()=>{limit.value=b.dataset.fill;limit.dataset.edited='true';update();});
   form.querySelector('[data-all]')?.addEventListener('click',ev=>{qty.value=String(Math.min(1000,+ev.currentTarget.dataset.all));const sell=form.querySelector('input[value=Sell]');sell.checked=true;sell.dispatchEvent(new Event('change'));update();});
   form.oninput=update;update();
   form.onsubmit=async ev=>{ev.preventDefault();ev.stopPropagation();const error=body.querySelector('.inv-ticket-error');error.textContent='';
    if(!form.checkValidity()||!Number.isInteger(+qty.value)){error.textContent=L('Enter whole shares from 1 to 1000, a positive limit price and an account.','Angiv hele aktier fra 1 til 1000, en positiv limitkurs og en konto.');form.reportValidity();return;}
    const submit=form.querySelector('.inv-ticket-submit');submit.disabled=true;
    try{const input={uic,accountKey:field('account').value,side:current(),quantity:+qty.value,limitPrice:+limit.value};const review=await post('investments/saxo/orders/precheck',input);if(d.isConnected)reviewOrder(d,review,()=>ticketForm(d,uic,input.side,h));}
    catch(err){if(!d.isConnected||err?.stale)return;error.textContent=orderMessage(err);submit.disabled=false;}};
  }catch(err){if(d.isConnected&&!err?.stale)body.innerHTML=`<p role="alert">${e(orderMessage(err))}</p>`;}
 }
 function reviewOrder(d,r,back){
  const body=d.querySelector('.inv-drawer-body'),p=r.precheck||{},format=(n,c)=>amount(n,c||r.currency);
  body.innerHTML=`${simLabel(L('Review','Gennemgå'))}<dl class="inv-ticket-terms inv-review"><div><dt>${L('Order','Ordre')}</dt><dd>${r.input.side==='Buy'?L('Buy','Køb'):L('Sell','Sælg')} ${e(r.input.quantity)} ${L('share(s)','aktie(r)')}</dd></div><div><dt>${L('Limit price','Limitkurs')}</dt><dd>${e(price(r.input.limitPrice,r.currency))}</dd></div><div><dt>${L('Valid until','Gyldig til')}</dt><dd>${L('End of trading day','Handelsdagens slutning')}</dd></div><div><dt>${L('Estimated total incl. fees','Anslået total inkl. omkostninger')}</dt><dd>${format(p.EstimatedTotalCost)}</dd></div><div><dt>${L('Estimated cash required','Anslået kontantbehov')}</dt><dd>${format(p.EstimatedCashRequired,p.EstimatedCashRequiredCurrency)}</dd></div></dl>
   <p role="status" class="inv-review-state" data-state="${r.state==='Reviewed'?'ok':'rejected'}">${r.state==='Reviewed'?L('Saxo check passed. This does not mean the order is filled.','Saxo-kontrol godkendt. Det betyder ikke, at ordren er handlet.'):e(p.ErrorInfo?.Message||p.ErrorInfo?.ErrorCode||p.PreCheckResult||L('Saxo did not approve this order.','Saxo godkendte ikke ordren.'))}</p>
   <div class="inv-ticket-actions"><button type="button" class="inv-back">${L('Edit','Redigér')}</button>${r.state==='Reviewed'?`<button type="button" class="primary inv-submit">${L('Place SIM order','Afgiv SIM-ordre')}</button>`:''}</div><p class="inv-ticket-error" role="alert"></p>`;
  body.querySelector('.inv-back').onclick=back;
  body.querySelector('.inv-submit')?.addEventListener('click',async()=>{const btn=body.querySelector('.inv-submit'),error=body.querySelector('.inv-ticket-error');btn.disabled=true;body.querySelector('.inv-back').disabled=true;btn.textContent=L('Submitting…','Sender…');d.dataset.submitting='true';d.querySelector('.inv-drawer-close').disabled=true;
   const settle=()=>{d.dataset.submitting='false';d.querySelector('.inv-drawer-close').disabled=false;};
   try{const receipt=await post('investments/saxo/orders',{ticketId:r.ticketId,confirm:true});settle();if(d.isConnected)showReceipt(d,receipt);void refresh();}
   catch(err){settle();if(!d.isConnected)return;
    if(['SAXO_REVIEW_EXPIRED','SAXO_COST_CHANGED_REVIEW_AGAIN','SAXO_REGISTRATION_CHANGED'].includes(err.code)){
     error.textContent=err.code==='SAXO_REVIEW_EXPIRED'?L('This review expired. Nothing was submitted. Refresh the review to continue.','Gennemgangen er udløbet. Intet blev sendt. Opdatér gennemgangen for at fortsætte.'):L('Order details changed. Nothing was submitted. Review the current details again.','Ordreoplysningerne er ændret. Intet blev sendt. Gennemgå de aktuelle oplysninger igen.');
     body.querySelector('.inv-back').disabled=false;const again=btn.cloneNode(true);again.textContent=L('Refresh review','Opdatér gennemgang');again.disabled=false;btn.replaceWith(again);
     again.onclick=async()=>{again.disabled=true;try{const next=await post('investments/saxo/orders/precheck',r.input);if(d.isConnected)reviewOrder(d,next,back);}catch(e2){if(d.isConnected){error.textContent=orderMessage(e2);again.disabled=false;}}};return;
    }
    // The outcome is uncertain: never resubmit automatically; only read the stored receipt.
    error.textContent=L('The response was interrupted. Check status before placing another order.','Svaret blev afbrudt. Kontrollér status, før du afgiver en ny ordre.');
    const check=btn.cloneNode(true);check.textContent=L('Check status','Kontrollér status');check.disabled=false;btn.replaceWith(check);
    check.onclick=async()=>{check.disabled=true;try{const receipt=await read('orders/'+encodeURIComponent(r.ticketId));if(d.isConnected)showReceipt(d,receipt);void refresh();}catch(e2){if(d.isConnected){error.textContent=orderMessage(e2);check.disabled=false;}}};}});
 }
 function showReceipt(d,r){
  const body=d.querySelector('.inv-drawer-body'),state=r.state==='Accepted'?'accepted':r.state==='Rejected'?'rejected':'unknown';
  body.innerHTML=`${simLabel(L('Receipt','Kvittering'))}<p class="inv-receipt-title" data-state="${state}" role="status">${state==='accepted'?L('Order accepted — not filled yet','Ordre accepteret — endnu ikke handlet'):state==='rejected'?L('Order rejected','Ordre afvist'):L('Check order status','Kontrollér ordrestatus')}</p><p>${e(r.name||'')} · ${r.input?.side==='Sell'?L('Sell','Sælg'):L('Buy','Køb')} ${e(r.input?.quantity??'—')} ${L('share(s)','aktie(r)')}</p>${r.orderId?`<p>${L('Saxo order','Saxo-ordre')} ${e(r.orderId)}</p>`:''}<p class="inv-detail-note">${e(r.error||L('Accepted orders may still be waiting or partially filled. Check Working orders and Holdings.','Accepterede ordrer kan stadig afvente eller være delvist handlet. Se Aktive ordrer og Beholdninger.'))}</p><button type="button" class="primary inv-view-orders">${L('View working orders','Se aktive ordrer')}</button>`;
  body.querySelector('.inv-view-orders').onclick=()=>{d.dataset.returnFocus='orders';d.close();};
 }
 return {render,dispose};
}

// Preserve tiny fractions and broker display precision instead of money-format rounding.
export function investmentQuantity(value,lang='en') {
 if(value==null||value===''||!Number.isFinite(Number(value)))return '—';
 const raw=String(value);
 const digits=raw.includes('.')?Math.min(20,raw.split('.')[1].length):6;
 return new Intl.NumberFormat(lang==='da'?'da-DK':'en-GB',{maximumFractionDigits:Math.max(6,digits),maximumSignificantDigits:21}).format(value);
}
export function investmentPrice(value,currency,decimals,lang='en') {
 if(typeof value!=='number'||!Number.isFinite(value)||!currency)return '—';
 const digits=Number.isInteger(decimals)&&decimals>=0&&decimals<=20?decimals:6;
 return new Intl.NumberFormat(lang==='da'?'da-DK':'en-GB',{minimumFractionDigits:Math.min(2,digits),maximumFractionDigits:digits}).format(value)+' '+currency.replace(/[^A-Z]/g,'');
}
