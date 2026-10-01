import { dayScene } from './overview.js';

// Balances and period totals come from the scoped API; pencils open account preferences.
export function createAccountsUI({S,t,e,money,date,locale,icon,colour,categoryName,sectionAction,charts}) {
 const cash=(value,currency=S.currency)=>money(value,currency,{minimumFractionDigits:0,maximumFractionDigits:2});
 const percent=value=>new Intl.NumberFormat(locale(),{maximumFractionDigits:1}).format(value)+'%';
 const choose=(id,content,extra='')=>`<button type="button" data-action="select-account" data-id="${e(id)}" ${extra}>${content}</button>`;
 function segments(groups,total) {
  return `<div class="atlas-segments" aria-hidden="true">${groups.map(g=>`<span class="${g.tone}" data-atlas-share="${g.amount/total}"></span>`).join('')}</div>`;
 }
 let accountResizeObserver;
 function render(root,{info,previous,balances,range}) {
  accountResizeObserver?.disconnect();
  const selectedId=S.accountView.accountId;
  const entries=S.accounts.map((account,index)=>({account,balance:balances[index].filter(b=>b.currency===account.currency&&['ITAV','CLAV'].includes(b.type)).sort((a,b)=>b.observedAt.localeCompare(a.observedAt))[0]}));
  const selected=entries.filter(x=>x.account.currency===S.currency&&(!selectedId||x.account.id===selectedId));
  const known=info.coverage.accountCount>0;
  const shares=selected.map(x=>({id:x.account.id,name:x.account.name,amount:x.balance?.amount,tone:colour(x.account.id)}));
  // A negative or missing balance cannot be represented honestly by a part-of-whole chart.
  const allocation=shares.length>0&&shares.every(x=>x.amount!=null&&x.amount>=0)&&info.availableBalance>0&&Math.abs(shares.reduce((sum,x)=>sum+x.amount,0)-info.availableBalance)<.005;
  const groups=info.categories.filter(g=>g.amount>0).slice(0,4).map(g=>({...g,name:categoryName(g.categoryId),tone:colour(g.categoryId,'category')}));
  if(info.categories.length>4)groups.push({name:t('Other categories'),amount:info.categories.slice(4).reduce((n,g)=>n+g.amount,0),tone:'tone-other',other:true});
  const metric=(label,value,glyph,kind)=>`<div class="atlas-metric ${kind}"><span class="atlas-icon">${icon(glyph)}</span><div><span>${t(label)}</span><strong data-metric="${kind}" data-value="${value??''}">${cash(value)}</strong></div></div>`;
  const label=selectedId?selected[0]?.account.name||t('Account'):t('Total cash');
  const warnings=[info.availableBalance==null?t('Missing balance'):info.balanceStale?t('Stale balance'):'',!info.coverage.sufficientHistory?t('Incomplete history'):'',info.excludedUndatedBookedCount?t('Undated entries excluded')+': '+info.excludedUndatedBookedCount:''].filter(Boolean);
  root.querySelector('#accounts-summary').outerHTML=`<section class="atlas-hero" data-scene="${dayScene()}" aria-label="${t('Account summary')}">
   <div class="atlas-cash"><strong id="scope-balance" aria-label="${e(label)}">${cash(info.availableBalance)}</strong>
    ${allocation?segments(shares,info.availableBalance):`<p class="atlas-allocation-note">${t('Balance allocation is unavailable for missing, zero or negative balances.')}</p>`}
    <div class="atlas-balance-key">${shares.map(g=>choose(g.id,`<span class="colour-label ${g.tone}"><span class="colour-dot" aria-hidden="true"></span><span>${e(g.name)}</span></span><strong>${cash(g.amount)}</strong>`)).join('')}</div>
   </div>
   <div class="atlas-scenery">${allocation?charts.ring(shares,info.availableBalance,S.currency,'Account balances'):''}</div>
   <div class="atlas-metrics">${metric('Income',known?info.income:null,'investments','income')}${metric('Spending',known?info.spending:null,'activity','spending')}${metric('Net saved',known?info.net:null,'budgets','net')}<div class="atlas-retention"><strong class="${info.retentionPercent<0?'negative':''}">${info.retentionPercent==null?'—':percent(info.retentionPercent)}</strong><span>${t('of income retained')}</span></div></div>
  </section>${warnings.length?`<div class="atlas-warnings" role="status">${warnings.map(w=>`<span>${e(w)}</span>`).join('')}</div>`:''}`;
  const ring=root.querySelector('.atlas-scenery .ring-component');
  if(ring){
   const center=ring.querySelector('.ring-center'),svg=ring.querySelector('svg');
   const savings=selected.filter(x=>x.account.isSavings).reduce((sum,x)=>sum+x.balance.amount,0);
   const savingsPercent=savings/info.availableBalance*100;
   const defaultCenter=`<strong>${percent(savingsPercent)}</strong><small>${t('in savings accounts')}</small>`;
   const defaultDetail=`<span>${t('How your money is distributed')}</span><strong>${cash(savings)} <small>${t('in savings accounts')}</small></strong>`;
   center.innerHTML=defaultCenter;
   ring.querySelector('.ring-legend').remove();
   ring.insertAdjacentHTML('beforeend',`<div class="atlas-ring-detail" aria-live="polite">${defaultDetail}</div>`);
   const detail=ring.querySelector('.atlas-ring-detail');
   svg.setAttribute('role','group');svg.setAttribute('aria-label',t('How your money is distributed'));
   const positiveShares=shares.filter(g=>g.amount>0);
   const restore=()=>{center.innerHTML=defaultCenter;detail.innerHTML=defaultDetail;ring.querySelectorAll('.ring-segment').forEach(x=>x.classList.remove('ring-dim'));};
   ring.querySelectorAll('.ring-segment').forEach((arc,i)=>{
    const account=positiveShares[i],share=percent(account.amount/info.availableBalance*100);
    const description=`${account.name}: ${new Intl.NumberFormat(locale(),{style:'currency',currency:S.currency}).format(account.amount)}, ${share}. ${t('View transactions')}`;
    arc.setAttribute('role','button');arc.setAttribute('tabindex','0');arc.setAttribute('aria-label',description);
    arc.dataset.action='select-account';arc.dataset.id=account.id;
    const preview=()=>{center.innerHTML=`<strong>${share}</strong><small>${t('of selected balance')}</small>`;detail.innerHTML=`<span>${e(account.name)}</span><strong>${cash(account.amount)}</strong>`;ring.querySelectorAll('.ring-segment').forEach(x=>x.classList.toggle('ring-dim',x!==arc));};
    arc.addEventListener('pointerenter',preview);arc.addEventListener('focus',preview);
    arc.addEventListener('pointerleave',()=>{if(document.activeElement!==arc)restore();});arc.addEventListener('blur',restore);
    arc.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();arc.dispatchEvent(new MouseEvent('click',{bubbles:true}));}else if(event.key==='Escape'){arc.blur();restore();}});
   });
   // The account labels also expose details for tiny/zero slices and touch users.
   root.querySelectorAll('.atlas-balance-key button').forEach(button=>{
    const account=shares.find(g=>g.id===button.dataset.id);
    button.title=`${account.name} · ${percent(account.amount/info.availableBalance*100)} · ${t('View transactions')}`;
   });
  }
  const nav=root.querySelector('#accounts-navigator');
  nav.innerHTML=`<div class="atlas-nav-heading"><h2>${t('Your accounts')}</h2>${selectedId?choose('',t('All accounts'),'class="quiet atlas-show-all"'):`<span class="atlas-count">${S.accounts.length}</span>`}</div>
   <label class="atlas-account-search"><span class="sr-only">${t('Search accounts')}</span><input id="atlas-account-query" type="search" placeholder="${t('Search accounts')}" autocomplete="off"></label>
   <div class="atlas-carousel"><button type="button" class="atlas-scroll atlas-scroll-prev" aria-label="${t('Previous accounts')}" aria-controls="atlas-account-list"><span aria-hidden="true">‹</span></button><div id="atlas-account-list" class="atlas-account-list" role="group" aria-label="${t('Choose account')}" tabindex="0">
   ${entries.map(({account:a,balance:b})=>`<div class="atlas-account atlas-account-item" data-atlas-account-name="${e((a.name+' '+a.currency).toLocaleLowerCase(locale()))}" data-account-id="${e(a.id)}">
    ${choose(a.id,`<span class="atlas-icon ${colour(a.id)}">${icon('accounts')}</span><span class="atlas-account-body"><span class="atlas-account-line"><span class="atlas-account-name">${e(a.name)}</span><strong>${cash(b?.amount,a.currency)}</strong></span>${!a.accessible?`<small>${t('Inactive')}</small>`:b==null?`<small class="warning">${t('Missing balance')}</small>`:new Date(b.observedAt)<new Date(Date.now()-86400000)?`<small class="warning">${t('Stale balance')}</small>`:''}</span>`,`class="atlas-account-select" aria-pressed="${selectedId===a.id}"`)}
    <button type="button" class="atlas-rename-toggle" data-action="edit-accounts" data-id="${e(a.id)}" aria-label="${t('Edit account name')}: ${e(a.name)}" title="${t('Edit account name')}">${icon('pencil')}</button>
   </div>`).join('')}</div><button type="button" class="atlas-scroll atlas-scroll-next" aria-label="${t('Next accounts')}" aria-controls="atlas-account-list"><span aria-hidden="true">›</span></button></div><p id="atlas-account-no-results" class="muted" hidden>${t('No accounts found.')}</p>`;
  const list=nav.querySelector('.atlas-account-list'),carousel=nav.querySelector('.atlas-carousel'),prev=nav.querySelector('.atlas-scroll-prev'),next=nav.querySelector('.atlas-scroll-next');
  carousel.insertAdjacentHTML('afterend','<div class="atlas-pages" role="img" hidden></div>');
  const pages=nav.querySelector('.atlas-pages');
  let pageStops=[];
  const syncArrows=()=>{
   const max=list.scrollWidth-list.clientWidth;prev.disabled=list.scrollLeft<=2;next.disabled=list.scrollLeft>=max-2;
   const current=pageStops.reduce((best,stop,i)=>Math.abs(stop-list.scrollLeft)<Math.abs(pageStops[best]-list.scrollLeft)?i:best,0);
   pages.querySelectorAll('span').forEach((mark,i)=>mark.classList.toggle('is-current',i===current));
   pages.setAttribute('aria-label',`${t('Account pages')}: ${current+1} ${t('of')} ${pageStops.length}`);
  };
  const syncScroll=()=>{
   const count=list.querySelectorAll('.atlas-account-item:not([hidden])').length;
   // Overlay arrows never reserve space; card sizing always uses the full row.
   carousel.classList.toggle('has-overflow',count*210+Math.max(0,count-1)*10>carousel.clientWidth-8);
   const available=Math.max(0,list.clientWidth-8),slots=Math.max(1,Math.min(count,Math.floor((available+10)/220)));
   list.style.setProperty('--atlas-card-width',Math.max(0,(available-(slots-1)*10)/slots)+'px');
   const max=Math.max(0,list.scrollWidth-list.clientWidth),card=list.querySelector('.atlas-account-item:not([hidden])');
   const step=card?card.getBoundingClientRect().width+10:0;
   pageStops=max>2?Array.from({length:Math.ceil(count/slots)},(_,i)=>Math.min(max,i*slots*step)):[];
   pages.hidden=pageStops.length<2;
   if(pages.childElementCount!==pageStops.length)pages.innerHTML=pageStops.map(()=>'<span aria-hidden="true"></span>').join('');
   syncArrows();
  };
  const move=direction=>{const stops=direction>0?pageStops:[...pageStops].reverse();const target=stops.find(stop=>direction>0?stop>list.scrollLeft+2:stop<list.scrollLeft-2);if(target!=null)list.scrollTo({left:target,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});};
  prev.addEventListener('click',()=>move(-1));next.addEventListener('click',()=>move(1));
  list.addEventListener('scroll',()=>{S.accountView.accountScroll=list.scrollLeft;syncArrows();},{passive:true});
  list.addEventListener('keydown',event=>{if(event.target!==list)return;if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();if(event.key==='Home'||event.key==='End')list.scrollTo({left:event.key==='Home'?0:list.scrollWidth,behavior:'instant'});else move(event.key==='ArrowLeft'?-1:1);}});
  syncScroll();list.scrollLeft=S.accountView.accountScroll||0;
  const selectedCard=list.querySelector('.atlas-account-select[aria-pressed="true"]')?.closest('.atlas-account-item');
  if(selectedCard){const card=selectedCard.getBoundingClientRect(),viewport=list.getBoundingClientRect();if(card.left<viewport.left)list.scrollLeft+=card.left-viewport.left;else if(card.right>viewport.right)list.scrollLeft+=card.right-viewport.right;}
  syncScroll();accountResizeObserver=new ResizeObserver(()=>{if(!nav.isConnected){accountResizeObserver.disconnect();return;}syncScroll();});accountResizeObserver.observe(list);
  nav.querySelector('#atlas-account-query').addEventListener('input',event=>{const query=event.target.value.toLocaleLowerCase(locale()).trim();let count=0;nav.querySelectorAll('[data-atlas-account-name]').forEach(b=>{b.hidden=!b.dataset.atlasAccountName.includes(query);if(!b.hidden)count++;});nav.querySelector('#atlas-account-no-results').hidden=count>0;list.scrollLeft=0;S.accountView.accountScroll=0;syncScroll();});
  root.querySelector('#atlas-spending').innerHTML=`<div class="atlas-spending-total"><span>${t('Spending')}</span><strong>${cash(known?info.spending:null)}</strong><small class="insight-scope">${selectedId?e(selected[0]?.account.name):t('All accounts')} · ${t('Selected period')}</small></div><div class="atlas-spending-chart">${groups.length?segments(groups,info.spending)+`<div class="atlas-spending-key">${groups.map(g=>`<div class="${g.tone}"><span><span class="colour-dot" aria-hidden="true"></span>${e(g.name)}</span><strong>${cash(g.amount)}</strong></div>`).join('')}</div>`:`<p class="muted">${t(known?'No spending in this period.':'No data')}</p>`}</div>`;
  root.querySelectorAll('[data-atlas-share]').forEach(el=>el.style.flexGrow=el.dataset.atlasShare);
  nav.classList.remove('loading');
 }
 return {render};
}
