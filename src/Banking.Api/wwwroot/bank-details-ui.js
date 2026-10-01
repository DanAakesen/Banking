// Read-only bank evidence. All provider strings are escaped; unknown data stays unknown.
export function createBankDetailsUI({S,api,t,e,date,money,moneyText,dialog,button,accountName}) {
 async function transaction(id,ruleForm) {
  dialog.innerHTML=`<div class="dialog-head"><h2>${t('Transaction details')}</h2>${button('Close','close')}</div><p>${t('Loading…')}</p>`;
  if(!dialog.open)dialog.showModal();
  const loadingNode=dialog.lastElementChild;
  const marker=Symbol();transaction.marker=marker;
  try {
   const x=await api(`transactions/${id}`);if(!dialog.open||transaction.marker!==marker||!loadingNode.isConnected)return;
   const d=x.details,field=(label,value)=>`<div><dt>${t(label)}</dt><dd>${value==null||value===''?'—':e(value)}</dd></div>`;
   dialog.innerHTML=`<div class="dialog-head"><h2>${t('Transaction details')}</h2>${button('Close','close')}</div>
    <p class="wrap">${e(x.description)}</p><h2>${money(x.amount,x.currency)}</h2><p>${e(accountName(x.accountId))}</p>
    <dl class="bank-detail-grid">${field('Booking date',date(x.bookingDate))}${field('Value date',date(x.valueDate))}
    ${d?`${field('Sender',d.debtor)}${field('Recipient',d.creditor)}${field('Sender account',d.debtorAccount)}${field('Recipient account',d.creditorAccount)}
    ${field('Transaction type',d.bankDescription||t('Not provided by the bank'))}${field('Merchant category',d.merchantCategory?t(d.merchantCategory):null)}
    ${d.transactionDate?field('Transaction date',date(d.transactionDate)):''}
    <div><dt>${t('Booked balance after transaction')}</dt><dd>${d.balanceCurrency?money(d.balanceAfter,d.balanceCurrency):'—'}</dd></div>`:''}</dl>
    ${!d?`<p class="muted">${t('Extra bank details have not been imported for this transaction yet.')}</p>`:`<details class="bank-technical"><summary>${t('Bank reference details')}</summary><dl class="bank-detail-grid">${field('Bank code',d.bankCode)}${field('Bank subcode',d.bankSubCode)}${field('Merchant category code',d.merchantCategoryCode)}</dl></details>`}
    <details class="bank-technical"><summary>${t('Create a rule for similar transactions')}</summary>${ruleForm(x)}</details>`;
  }catch(err){if(!err.stale&&dialog.open)dialog.innerHTML=`<div class="dialog-head"><h2>${t('Transaction details')}</h2>${button('Close','close')}</div><p role="alert">${t('This request could not be completed.')}</p>`;}
 }
 async function history(host,range,preferred) {
  const accounts=S.accounts.filter(a=>a.currency===S.currency);
  if(!accounts.length){host.hidden=true;return;}
  host.innerHTML=`<div class="section-head"><div><h2>${t('Balance over time')}</h2></div><label class="field">${t('Account')}<select data-history-account>${accounts.map(a=>`<option value="${a.id}" ${a.id===preferred?'selected':''}>${e(a.name)}</option>`).join('')}</select></label></div><div data-history-chart></div>`;
  const picker=host.querySelector('[data-history-account]');let request=0;
  async function load(){const version=++request,canvas=host.querySelector('[data-history-chart]');canvas.innerHTML=`<p>${t('Loading…')}</p>`;
   try {const result=await api(`accounts/${picker.value}/balance-history?from=${range.from}&to=${range.to}`);if(!host.isConnected||request!==version)return;render(canvas,result);}
   catch(err){if(!err.stale&&host.isConnected&&request===version)canvas.innerHTML=`<p role="alert">${t('Balance history could not be loaded. Choose an account to retry.')}</p>`;}
  }
  picker.addEventListener('change',load);await load();
 }
 function render(host,data){
  const known=data.points.filter(p=>p.balance!=null),points=data.points;
  if(!known.length){host.innerHTML=`<p class="muted">${t('No reliable booked balance history in this period yet.')}</p><small>${t(data.bankDetailsImportedAt?'Missing or ambiguous bank balances are not estimated.':'Extra bank details will be imported at the next eligible sync.')}</small>`;return;}
  const amount=(n,c)=>money(n,c,{minimumFractionDigits:0});
  // One observation cannot show a trend; state it plainly instead of drawing a lone dot.
  if(known.length===1){const p=known[0];host.innerHTML=`<div class="bank-chart-single"><p>${t('Only one bank-reported balance in this period')}</p><strong>${amount(p.balance,data.currency)}</strong><span class="muted">${date(p.date)}</span></div><p class="muted bank-chart-basis">${t('Booked closing balances on transaction days; not the available balance.')}</p>`;return;}
  const time=d=>new Date(d+'T12:00:00Z').valueOf(),start=time(data.from),duration=Math.max(86400000,time(data.to)-start);
  const low=Math.min(...known.map(p=>p.balance)),high=Math.max(...known.map(p=>p.balance)),padding=Math.max((high-low)*.12,1),bottom=low-padding,top=high+padding;
  const x=p=>80+(time(p.date)-start)/duration*600,y=p=>18+(top-p.balance)/(top-bottom)*150;
  let segment=[],segments=[];for(const p of points){if(p.balance==null){if(segment.length)segments.push(segment);segment=[];}else segment.push(p);}if(segment.length)segments.push(segment);
  host.innerHTML=`<div class="bank-chart-readout" aria-live="polite"></div><svg class="bank-balance-chart" viewBox="0 0 710 204" role="img" aria-label="${e(t('Booked balance history'))}">
    ${[low,(low+high)/2,high].filter((v,i,a)=>a.indexOf(v)===i).map(v=>`<g><line x1="80" x2="680" y1="${y({balance:v})}" y2="${y({balance:v})}" class="chart-grid"/><text x="72" y="${y({balance:v})+4}" text-anchor="end" class="chart-axis">${e(new Intl.NumberFormat(S.lang==='da'?'da-DK':'en-GB',{notation:'compact',maximumFractionDigits:1}).format(v))}</text></g>`).join('')}
    ${segments.map(s=>`<polyline points="${s.map(p=>`${x(p)},${y(p)}`).join(' ')}" class="bank-balance-line"/>`).join('')}
    ${known.map(p=>`<circle cx="${x(p)}" cy="${y(p)}" r="3" class="bank-balance-dot"><title>${e(date(p.date)+': '+moneyText(p.balance,data.currency))}</title></circle>`).join('')}
    <text x="80" y="198" class="chart-axis">${e(date(data.from))}</text><text x="680" y="198" text-anchor="end" class="chart-axis">${e(date(data.to))}</text></svg>
    <label class="bank-chart-inspect">${t('Inspect a balance')}<input type="range" min="0" max="${known.length-1}" value="${known.length-1}" step="1" aria-label="${t('Inspect a balance')}"></label>
    <p class="muted bank-chart-basis">${t('Booked closing balances on transaction days; not the available balance.')}${data.unavailableDays?` ${data.unavailableDays} ${t('days omitted: missing balances or uncertain posting order.')}`:''}</p>
    <details class="bank-technical"><summary>${t('Recorded balances')}</summary><div class="bank-history-values">${points.map(p=>`<div><span>${date(p.date)}</span><strong>${amount(p.balance,data.currency)}</strong></div>`).join('')}</div></details>`;
  const slider=host.querySelector('input');const inspect=()=>{const point=known[Number(slider.value)];slider.setAttribute('aria-valuetext',date(point.date)+': '+moneyText(point.balance,data.currency));host.querySelector('.bank-chart-readout').innerHTML=`<span>${date(point.date)}</span><strong>${amount(point.balance,data.currency)}</strong>`;};slider.addEventListener('input',inspect);inspect();
 }
 return {transaction,history};
}
