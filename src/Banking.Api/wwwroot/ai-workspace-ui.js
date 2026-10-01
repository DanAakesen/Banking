export function createAIWorkspace({S,t,e,money,date,today,header,button,dialog,leave,navigate,confirmAction,validateForms}){
 const L=(en,da)=>S.lang==='da'?da:en;
 const stamp=x=>x?new Date(x).toLocaleString(S.lang==='da'?'da-DK':'en-GB',{dateStyle:'medium',timeStyle:'short'}):L('Unknown','Ukendt');
 let bootedMode=null;
 async function request(path,data,period={}){
  const mode=S.mode;
  const send=async(p,d)=>{
   const res=await fetch('/advisor/api/'+p,{method:d===undefined?'GET':'POST',credentials:'same-origin',headers:{'X-Banking-Mode':mode,...(period.from?{'X-Banking-From':period.from,'X-Banking-To':period.to,'X-Banking-Currency':period.currency}:{}),...(d===undefined?{}:{'Content-Type':'application/json'})},body:d===undefined?undefined:JSON.stringify(d)});
   if(!res.ok){let msg;try{msg=(await res.json()).error;}catch{}throw Error(msg||L('The local advisor is unavailable. Start it and retry.','Den lokale rådgiver er ikke tilgængelig. Start den og prøv igen.'));}return res.json();
  };
  if(bootedMode!==mode){await send('workspace');bootedMode=mode;}
  return send(path,data);
 }
 function error(main,err){const target=main.querySelector('.workspace-error');if(target)target.textContent=err.message;}
 function modal(title,body){dialog.innerHTML=`<div class="dialog-head"><h2>${e(title)}</h2>${button('Close','close')}</div>${body}`;dialog.showModal();validateForms();dialog.scrollTop=0;}
 function wrap(main,title,actions,content){main.insertAdjacentHTML('beforeend',header(title,actions)+`<p class="workspace-error" role="alert"></p>${content}`);}
 async function memory(main){
  wrap(main,L('Memory','Hukommelse'),`<button id="new-memory" class="primary">+ ${L('New memory','Ny hukommelse')}</button>`,`<div class="workspace-toolbar"><input id="memory-search" type="search" placeholder="${L('Search memories…','Søg i hukommelsen…')}" aria-label="${L('Search memories','Søg i hukommelsen')}"><select id="memory-origin" aria-label="${L('Memory origin','Oprindelse')}"><option value="all">${L('All memories','Alle minder')}</option><option value="User">${L('From you','Fra dig')}</option><option value="AI">${L('From AI','Fra AI')}</option><option value="suggested">${L('Needs review','Afventer gennemgang')}</option></select><button id="memory-view" aria-pressed="false">${L('List view','Listevisning')}</button><button id="suggest-memory">✧ ${L('Suggest a memory','Foreslå en hukommelse')}</button></div><section id="memory-capture" class="memory-capture" aria-label="${L('Automatic memory','Automatisk hukommelse')}"></section><div class="memory-layout"><section class="memory-canvas" aria-label="${L('Memory graph','Hukommelsesgraf')}"><div id="memory-graph"></div><div class="graph-controls"><button id="graph-out" aria-label="${L('Zoom out','Zoom ud')}">−</button><button id="graph-in" aria-label="${L('Zoom in','Zoom ind')}">+</button><button id="graph-fit">${L('Fit view','Tilpas visning')}</button><span>● ${L('You','Dig')} <span class="origin-ai">● AI</span></span><small>${L('Scroll to zoom · drag to explore · select a point to read','Rul for at zoome · træk for at udforske · vælg et punkt for at læse')}</small></div></section><aside id="memory-details" class="memory-inspector"></aside></div>`);
  let rows=[],selected=null,list=matchMedia('(max-width:750px)').matches,positions=new Map(),box=[0,0,1200,900],cameraSet=false,graph=null,entered=false;
  const load=async()=>{try{const data=await request('memory');if(!main.isConnected)return;rows=data.preferences;captureControls(data);selected=rows.some(x=>x.id===selected)?selected:rows[0]?.id;layout();if(!cameraSet)fit();draw();}catch(err){error(main,err);}};
  function captureControls(data){
   const c=data.capture||{enabled:false,pending:0,failed:[]},host=main.querySelector('#memory-capture');
   host.innerHTML=`<label><input type="checkbox" id="automatic-memory" ${c.enabled?'checked':''}> ${L('Automatic memory','Automatisk hukommelse')}</label><span>${L('After voice ends or 10 minutes without chat activity. Interpretations need your review.','Efter tale afsluttes eller 10 minutter uden chataktivitet. Fortolkninger kræver din gennemgang.')}</span><small role="status">${c.pending?c.pending+' '+L('conversation(s) waiting','samtale(r) afventer'):c.lastCompletedAt?L('Last processed: ','Sidst behandlet: ')+stamp(c.lastCompletedAt):L('New conversations only','Kun nye samtaler')} · ${data.usage?.memory||0}/${data.usage?.limits?.memory||12} ${L('checks today','tjek i dag')}</small>${c.failed.map(j=>`<div class="capture-failure"><span>${e(j.title)} · ${e(j.error)}</span><button data-capture-retry="${j.id}">${L('Retry','Prøv igen')}</button></div>`).join('')}`;
   host.querySelector('input').onchange=async ev=>{const el=ev.currentTarget;el.disabled=true;try{await request('memory/settings',{enabled:el.checked});await load();}catch(err){el.checked=!el.checked;error(main,err);}finally{el.disabled=false;}};
   host.querySelectorAll('[data-capture-retry]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await request('memory/retry',{id:b.dataset.captureRetry});await load();}catch(err){error(main,err);b.disabled=false;}});
  }
  function layout(){
   rows.forEach((r,i)=>{if(r.position)positions.set(r.id,r.position);else if(!positions.has(r.id)){const a=i*2.39996,rad=rows.length===1?0:110+Math.sqrt(i)*86;positions.set(r.id,{x:Math.max(75,Math.min(1125,600+Math.cos(a)*rad)),y:Math.max(80,Math.min(820,450+Math.sin(a)*rad))});}});
  }
  function fit(){
   const points=filtered().map(r=>positions.get(r.id)),host=main.querySelector('#memory-graph'),aspect=Math.max(.5,host.clientWidth/host.clientHeight);
   if(!points.length){box=[0,0,1200,1200/aspect];return;}
   const xs=points.map(p=>p.x),ys=points.map(p=>p.y),w=Math.max(1000,Math.max(...xs)-Math.min(...xs)+360,(Math.max(...ys)-Math.min(...ys)+240)*aspect),h=w/aspect;
   box=[(Math.max(...xs)+Math.min(...xs)-w)/2,(Math.max(...ys)+Math.min(...ys)-h)/2,w,h];
  }
  function filtered(){const q=main.querySelector('#memory-search').value.toLowerCase(),origin=main.querySelector('#memory-origin').value;return rows.filter(r=>(origin==='all'||r.origin===origin||origin==='suggested'&&r.status==='suggested')&&(r.title+' '+r.text).toLowerCase().includes(q));}
  function origin(r){return `<span class="origin-tag ${r.origin==='AI'?'origin-ai':''}">${r.origin==='AI'?'✧ AI':L('From you','Fra dig')}${r.status==='suggested'?' · '+L('Needs review','Afventer gennemgang'):''}</span>`;}
  function draw(){
   graph?.stop();
   const focusedNode=document.activeElement?.dataset.node;
   const visible=filtered(),host=main.querySelector('#memory-graph');
   if(!visible.some(r=>r.id===selected))selected=visible[0]?.id||null;
   if(!rows.length){host.innerHTML=`<div class="graph-empty"><div class="empty-constellation">✧</div><h2>${L('No memories yet','Ingen minder endnu')}</h2><p>${L('Create a memory, then link it to another. Your graph grows from real connections.','Opret en hukommelse og forbind den med en anden. Grafen vokser med dine forbindelser.')}</p><button id="empty-create">+ ${L('Create memory','Opret hukommelse')}</button></div>`;host.querySelector('button').onclick=()=>edit();}
   else if(!visible.length)host.innerHTML=`<div class="graph-empty"><h2>${L('No matching memories','Ingen matchende minder')}</h2><p>${L('Try another search or origin filter.','Prøv en anden søgning eller oprindelse.')}</p></div>`;
   else if(list){host.innerHTML=`<div class="memory-list">${visible.map(r=>`<button data-memory="${r.id}" class="${r.id===selected?'selected':''}">${origin(r)}<strong>${e(r.title)}</strong><span>${e(r.text)}</span></button>`).join('')}</div>`;host.querySelectorAll('[data-memory]').forEach(b=>b.onclick=()=>{selected=b.dataset.memory;draw();});}
   else{
    graph=mountMemoryGraph(host,{rows:visible,positions,selected,box,animate:!entered,escape:e,
     label:L('Connected memories. Scroll to zoom, drag to explore, Tab to select.','Forbundne minder. Rul for at zoome, træk for at udforske, Tab for at vælge.'),
     onSelect:id=>{selected=id;draw();},onMove:persistPosition,onCamera:value=>{box=value;cameraSet=true;}});
    entered=true;
   }
   main.querySelector('.graph-controls').hidden=list;main.querySelector('#memory-view').textContent=list?L('Graph view','Grafvisning'):L('List view','Listevisning');main.querySelector('#memory-view').setAttribute('aria-pressed',String(list));details();
   if(focusedNode)host.querySelector('[data-node="'+CSS.escape(focusedNode)+'"]')?.focus({preventScroll:true});
  }
  async function persistPosition(id){try{const p=positions.get(id);await request('memory/position',{id,...p});const r=rows.find(x=>x.id===id);if(r)r.position={...p};draw();}catch(err){error(main,err);}}
  function details(){const host=main.querySelector('#memory-details'),r=rows.find(x=>x.id===selected);if(!r){host.innerHTML=`<h2>${L('No memory selected','Intet minde valgt')}</h2><p>${L('Select a node to see its source and connections.','Vælg en node for at se kilde og forbindelser.')}</p>`;return;}
   const incoming=rows.flatMap(x=>(x.links||[]).filter(l=>l.id===r.id).map(l=>({id:x.id,label:l.label,incoming:true}))),links=[...(r.links||[]),...incoming];
   host.innerHTML=`${origin(r)}<h2>${e(r.title)}</h2><p class="memory-text">${e(r.text)}</p><div class="memory-actions"><button id="edit-memory">${t('Edit')}</button><button id="delete-memory" class="danger">${t('Delete')}</button>${r.status==='suggested'?`<button id="confirm-memory">${L('Confirm memory','Bekræft hukommelse')}</button>`:''}</div><dl><dt>${L('Created','Oprettet')}</dt><dd>${stamp(r.createdAt)}</dd><dt>${L('Updated','Opdateret')}</dt><dd>${stamp(r.updatedAt)}</dd><dt>${L('Source','Kilde')}</dt><dd>${e(r.source||L('Saved priority','Gemt prioritet'))}</dd></dl>${r.evidence?`<details class="memory-evidence"><summary>${L('Source message','Kildebesked')}</summary><p>${e(r.evidence.chatTitle)}</p><blockquote>${e(r.evidence.quote)}</blockquote></details>`:''}<h3>${L('Connected memories','Forbundne minder')} · ${links.length}</h3><div class="linked-memories">${links.length?links.map(l=>`<button data-linked="${l.id}"><strong>${e(rows.find(x=>x.id===l.id)?.title||'')}</strong><small>${l.incoming?'← ':'→ '}${e(l.label)}</small></button>`).join(''):`<p>${L('Edit this memory to add a meaningful connection.','Redigér for at tilføje en meningsfuld forbindelse.')}</p>`}</div>`;
   host.querySelector('#edit-memory').onclick=()=>edit(r);host.querySelector('#delete-memory').onclick=async()=>{if(await confirmAction(L('Delete this memory and its connections?','Slet denne hukommelse og dens forbindelser?'))){try{await request('memory/delete',{id:r.id,version:r.version});await load();}catch(err){error(main,err);}}};host.querySelector('#confirm-memory')?.addEventListener('click',async()=>{try{await request('memory/save',{...r,confirm:true});await load();}catch(err){error(main,err);}});host.querySelectorAll('[data-linked]').forEach(b=>b.onclick=()=>{selected=b.dataset.linked;draw();});
  }
  function edit(r){
   modal(r?L('Edit memory','Redigér hukommelse'):L('New memory','Ny hukommelse'),`<form id="memory-form" class="workspace-form"><label>${L('Title','Titel')}<input name="title" required maxlength="80" value="${e(r?.title||'')}"></label><label>${L('What should your advisor remember?','Hvad skal din rådgiver huske?')}<textarea name="text" required maxlength="500" rows="4">${e(r?.text||'')}</textarea></label><h3>${L('Connections','Forbindelser')}</h3><div id="memory-links"></div><button id="add-memory-link" type="button">+ ${L('Add connection','Tilføj forbindelse')}</button><p class="muted">${L('Each line in the graph is one of these saved relationships.','Hver linje i grafen er en af disse gemte forbindelser.')}</p><p class="error" role="alert"></p><button class="primary" type="submit">${t('Save changes')}</button></form>`);
   const form=dialog.querySelector('form'),holder=form.querySelector('#memory-links');
   function linkRow(value={}){const div=document.createElement('div');div.className='memory-link-row';div.innerHTML=`<select aria-label="${L('Linked memory','Forbundet hukommelse')}" required><option value="">${L('Choose memory','Vælg hukommelse')}</option>${rows.filter(x=>x.id!==r?.id).map(x=>`<option value="${x.id}" ${x.id===value.id?'selected':''}>${e(x.title)}</option>`).join('')}</select><input aria-label="${L('Relationship','Relation')}" required maxlength="60" placeholder="${L('e.g. supports','fx understøtter')}" value="${e(value.label||'')}"><button type="button" aria-label="${L('Remove connection','Fjern forbindelse')}">×</button>`;div.querySelector('button').onclick=()=>{div.remove();S.dirty=true;};holder.append(div);}
   (r?.links||[]).forEach(linkRow);form.querySelector('#add-memory-link').onclick=()=>{if(holder.children.length<20){linkRow();S.dirty=true;}};form.oninput=()=>S.dirty=true;
   form.onsubmit=async ev=>{ev.preventDefault();if(!form.reportValidity()||S.saving)return;S.saving=true;try{const saved=await request('memory/save',{id:r?.id,version:r?.version,title:form.elements.title.value,text:form.elements.text.value,links:[...holder.children].map(el=>({id:el.querySelector('select').value,label:el.querySelector('input').value}))});selected=saved.id;S.dirty=false;dialog.close();await load();}catch(err){form.querySelector('.error').textContent=err.message;}finally{S.saving=false;}};
  }
  const captureRefresh=setInterval(()=>{if(!main.isConnected){clearInterval(captureRefresh);return;}if(!dialog.open&&!document.hidden)request('memory').then(data=>{if(main.isConnected){captureControls(data);if(!main.querySelector(':active')&&JSON.stringify(rows.map(r=>[r.id,r.version]))!==JSON.stringify(data.preferences.map(r=>[r.id,r.version])))load();}}).catch(err=>error(main,err));},15000);
  main.querySelector('#new-memory').onclick=()=>edit();main.querySelector('#memory-search').oninput=draw;main.querySelector('#memory-origin').onchange=draw;main.querySelector('#memory-view').onclick=()=>{list=!list;draw();};
  function zoom(factor){graph?.zoom(factor);}
  main.querySelector('#graph-in').onclick=()=>zoom(.8);main.querySelector('#graph-out').onclick=()=>zoom(1.25);main.querySelector('#graph-fit').onclick=()=>{cameraSet=false;fit();draw();};
  main.querySelector('#suggest-memory').onclick=async ev=>{const b=ev.currentTarget;b.disabled=true;const original=b.textContent;b.textContent=L('Thinking…','Tænker…');try{const saved=await request('memory/suggest',{requestId:crypto.randomUUID()});selected=saved.id;await load();}catch(err){error(main,err);}finally{b.disabled=false;b.textContent=original;}};
  let lastWidth=0;
  const resize=new ResizeObserver(entries=>{if(!main.isConnected){resize.disconnect();return;}const width=entries[0].contentRect.width;if(width===lastWidth)return;lastWidth=width;if(rows.length&&!list){if(!cameraSet)fit();draw();}});
  resize.observe(main.querySelector('#memory-graph'));
  await load();
 }
 async function analysis(main,initialId){
  wrap(main,L('Analysis','Analyser'),`<button id="new-analysis" class="primary">+ ${L('New analysis','Ny analyse')}</button>`,`<div class="workspace-toolbar"><input type="search" id="analysis-search" placeholder="${L('Search your analyses…','Søg i dine analyser…')}" aria-label="${L('Search analyses','Søg i analyser')}"><span id="analysis-count"></span></div><p id="analysis-status" role="status"></p><section id="analysis-selected"></section><h2 class="workspace-section-title">${L('Your saved analyses','Dine gemte analyser')}</h2><div id="analysis-cards" class="analysis-grid"></div><h2 class="workspace-section-title">${L('Suggested for you','Forslag til dig')}</h2><div id="analysis-suggestions" class="analysis-grid suggestions"></div>`);
  let library={items:[],suggestions:[],runs:[]},selected=null,currentRevision=null,viewState=null,channel=null,generation=0,polling=false,requestSequence=0;
  const status=msg=>{if(main.isConnected)main.querySelector('#analysis-status').textContent=msg;};
  async function load(){try{library=await request('library');if(!main.isConnected)return;cards();suggestions();const running=library.runs.find(r=>r.status==='running');if(running&&!polling)poll(running.id);if(!selected&&library.items.length)await open(initialId&&library.items.some(i=>i.id===initialId)?initialId:library.items[0].id);}catch(err){error(main,err);}}
  function cards(){const q=main.querySelector('#analysis-search').value.toLowerCase(),items=library.items.filter(x=>(x.title+' '+x.question).toLowerCase().includes(q));main.querySelector('#analysis-count').textContent=library.items.length+' '+L('saved','gemt');main.querySelector('#analysis-cards').innerHTML=items.length?items.map(item=>`<button class="analysis-card ${selected?.id===item.id?'selected':''}" data-analysis="${item.id}"><span class="analysis-glyph" aria-hidden="true">◷</span><h3>${e(item.title)}</h3><p>${e(item.question.slice(0,150))}</p><div><small>${stamp(item.updatedAt)}</small><span>${item.versions} ${item.versions===1?L('version','version'):L('versions','versioner')} →</span></div></button>`).join(''):`<div class="analysis-empty"><h3>${library.items.length?L('No matching analyses','Ingen matchende analyser'):L('No saved analyses yet','Ingen gemte analyser endnu')}</h3><p>${L('Start with a suggestion or ask your own question. Every refresh keeps the earlier version.','Start med et forslag eller dit eget spørgsmål. Hver opdatering bevarer den tidligere version.')}</p></div>`;main.querySelectorAll('[data-analysis]').forEach(b=>b.onclick=()=>open(b.dataset.analysis));}
  function suggestionText(x){const da={budget:['Skab plads i din måned','Sammenlign indkomst, udgifter og opsparing i dit gemte budget.'],goals:['Følg dine mål','Gennemgå dine gemte mål med de aktuelle indbetalinger.'],wealth:['Se din registrerede formue','Du har en pensionsopgørelse sammen med dine bankkonti.'],overview:['Forstå dine tilgængelige data','Start med de økonomiske oplysninger, der er tilgængelige her.']};return S.lang==='da'&&da[x.id]?{...x,title:da[x.id][0],reason:da[x.id][1]}:x;}
  function suggestions(){main.querySelector('#analysis-suggestions').innerHTML=library.suggestions.map(suggestionText).map(x=>`<button class="suggestion-card" data-suggestion="${x.id}"><span aria-hidden="true">✧</span><div><h3>${e(x.title)}</h3><p>${e(x.reason)}</p><small>${L('Create analysis','Opret analyse')} →</small></div></button>`).join('');main.querySelectorAll('[data-suggestion]').forEach(b=>b.onclick=()=>create(library.suggestions.find(x=>x.id===b.dataset.suggestion).prompt));}
  async function open(id,revisionNumber){const sequence=++requestSequence;try{const item=await request('library/open',{id});if(!main.isConnected||sequence!==requestSequence)return;selected=item;cards();await showRevision(revisionNumber||item.revisions.length);}catch(err){error(main,err);}}
  async function showRevision(number){
   const mine=++generation;channel?.close();currentRevision=selected.revisions.find(x=>x.revision===number);const r=currentRevision;if(!r)return;viewState=structuredClone(r.state||{});const snapshot=r.snapshot,previous=selected.revisions.filter(x=>x.revision<number).at(-1),container=main.querySelector('#analysis-selected');
   const metrics=snapshot?.financials,old=previous?.snapshot?.financials,sameCurrency=snapshot?.currency===previous?.snapshot?.currency;
   container.innerHTML=`<div class="analysis-feature"><div class="analysis-feature-head"><div><small>${L('Saved analysis','Gemt analyse')}</small><h2>${e(r.title)}</h2><p>${L('Saved','Gemt')} ${stamp(r.createdAt)}${snapshot?.from?' · '+date(snapshot.from)+' – '+date(snapshot.to):''}</p></div><button id="refresh-analysis">↻ ${L('Update with current data','Opdatér med aktuelle data')}</button></div><div class="analysis-body"><div><div class="analysis-comparison">${metrics?[[L('Income','Indkomst'),'income'],[L('Spending','Forbrug'),'spending'],[L('Available','Rådighedsbeløb'),'disposableAmount']].map(([label,key])=>`<div><small>${label} · ${L('actuals in period','faktisk i perioden')}</small><strong>${money(metrics[key]??null,snapshot.currency)}</strong>${typeof old?.[key]==='number'&&typeof metrics[key]==='number'&&sameCurrency?`<small>${L('Previous run','Forrige kørsel')}: ${money(old[key],snapshot.currency)} · Δ ${money(metrics[key]-old[key],snapshot.currency)}</small>`:''}</div>`).join(''):''}</div><div id="library-artifact" class="library-artifact"><p>${L('Opening visual…','Åbner visualisering…')}</p></div><details class="analysis-inputs"><summary>${L('Question and saved data context','Spørgsmål og gemt datagrundlag')}</summary><p>${e(selected.question)}</p><p>${L('Data read','Data læst')}: ${stamp(snapshot?.generatedAt)}</p><p>${L('Refreshing reuses this question with new data. Recorded bank/statement values may still be stale. Previous versions stay unchanged.','Opdatering genbruger spørgsmålet med nye data. Gemte bank- og opgørelsesværdier kan stadig være forældede. Tidligere versioner bevares.')}</p></details><p id="artifact-problem" class="workspace-error" role="status"></p></div><aside class="analysis-history"><h3>${L('Saved runs','Gemte kørsler')}</h3><div class="run-timeline">${[...selected.revisions].reverse().map(v=>`<button class="${number===v.revision?'selected':''}" data-revision="${v.revision}"><span class="run-dot"></span><strong>${stamp(v.createdAt)}</strong><small>${L('Version','Version')} ${v.revision}${v.snapshot?.to?' · '+L('through','til')+' '+date(v.snapshot.to):''}</small></button>`).join('')}</div></aside></div></div>`;
   container.querySelector('#refresh-analysis').onclick=()=>refresh();container.querySelectorAll('[data-revision]').forEach(b=>b.onclick=()=>showRevision(+b.dataset.revision));
   try{const result=await request('render',{title:r.title,format:r.format,content:r.content,fallback:r.fallback,state:r.state});if(mine!==generation||!main.isConnected)return;const iframe=document.createElement('iframe');iframe.title=r.title;iframe.sandbox='allow-scripts';iframe.referrerPolicy='no-referrer';iframe.src=result.url;let initialized=false;
    iframe.onload=()=>{if(initialized)return;initialized=true;const pair=new MessageChannel();channel=pair.port1;let count=0,windowStart=Date.now();channel.onmessage=({data})=>{if(mine!==generation||!main.isConnected){channel?.close();return;}if(Date.now()-windowStart>1000){windowStart=Date.now();count=0;}if(++count>100){channel.close();return;}if(data?.type==='resize'&&Number.isFinite(data.height))iframe.style.height=Math.max(280,Math.min(2400,data.height))+'px';if(data?.type==='artifact-error')container.querySelector('#artifact-problem').textContent=L('This visual encountered an error. Its saved summary is still available: ','Visualiseringen fejlede. Den gemte opsummering er stadig tilgængelig: ')+r.fallback;if(data?.type==='state'&&data.state&&typeof data.state==='object'&&!Array.isArray(data.state)&&JSON.stringify(data.state).length<=8000)viewState=structuredClone(data.state);if(data?.type==='tool'&&Number.isSafeInteger(data.id))channel.postMessage(data.tool==='read_demo_context'?{type:'result',id:data.id,value:snapshot?.context||{source:'Archived analysis',coverage:'Original context unavailable'}}:{type:'result',id:data.id,error:'Open the advisor to request an action. Saved visuals cannot change financial records.'});};channel.start();iframe.contentWindow.postMessage({type:'banking:init',theme:S.theme,state:viewState,context:snapshot?.context||{}},'*',[pair.port2]);};container.querySelector('#library-artifact').replaceChildren(iframe);
   }catch(err){if(mine===generation){container.querySelector('#library-artifact').textContent=r.fallback;error(main,err);}}
  }
  function period(days=30,currency=S.currency){const to=today(),from=new Date(to+'T12:00:00Z');from.setUTCDate(from.getUTCDate()-days+1);return {from:from.toISOString().slice(0,10),to,currency};}
  function create(prefill=''){
   modal(L('New analysis','Ny analyse'),`<form class="workspace-form" id="new-analysis-form"><label>${L('What would you like to understand?','Hvad vil du forstå?')}<textarea name="prompt" rows="5" required maxlength="4000">${e(prefill)}</textarea></label><label>${L('Rolling period','Rullende periode')}<select name="days"><option value="30">${L('Last 30 days','Seneste 30 dage')}</option><option value="90">${L('Last 90 days','Seneste 90 dage')}</option><option value="365">${L('Last year','Seneste år')}</option></select></label><p class="muted">${L('Creates a saved visual using current Banking data. Future updates keep earlier runs.','Opretter en gemt visualisering med aktuelle Banking-data. Fremtidige opdateringer bevarer tidligere kørsler.')}</p><p class="error" role="alert"></p><button class="primary" type="submit">${L('Create analysis','Opret analyse')}</button></form>`);
   const form=dialog.querySelector('form');form.oninput=()=>S.dirty=true;form.onsubmit=async ev=>{ev.preventDefault();if(!form.reportValidity()||S.saving)return;S.saving=true;try{error(main,{message:''});const run=await request('advisor',{prompt:form.elements.prompt.value,visual:true,requestId:crypto.randomUUID()},period(+form.elements.days.value));S.dirty=false;dialog.close();poll(run.id);}catch(err){form.querySelector('.error').textContent=err.message;}finally{S.saving=false;}};
  }
  async function refresh(){
   error(main,{message:''});const id=selected.id,b=main.querySelector('#refresh-analysis');b.disabled=true;status(L('Reading current data and starting a new version…','Læser aktuelle data og starter en ny version…'));
   try{const latest=await request('library/open',{id,prepare:true}),r=latest.revisions.at(-1),s=r.snapshot;const days=s?.from&&s?.to?Math.max(1,Math.min(366,Math.round((Date.parse(s.to)-Date.parse(s.from))/86400000)+1)):30;const run=await request('advisor',{prompt:latest.question,visual:true,requestId:crypto.randomUUID(),artifactId:id,revision:r.revision,state:currentRevision?.revision===r.revision?viewState:r.state},period(days,s?.currency||S.currency));poll(run.id);}catch(err){error(main,err);status(L('The previous saved version is unchanged.','Den tidligere gemte version er uændret.'));b.disabled=false;}
  }
  async function poll(id){
   polling=true;
   const tick=async()=>{if(!main.isConnected){polling=false;return;}try{const ws=await request('workspace'),run=ws.runs?.find(x=>x.id===id);if(!run){status(L('Run unavailable. Reopen the library to check saved results.','Kørslen er ikke tilgængelig. Genåbn biblioteket.'));polling=false;return;}status(run.phase||L('Working…','Arbejder…'));if(run.status==='running'){
     const target=main.querySelector('#analysis-status');const cancel=document.createElement('button');cancel.textContent=L('Cancel','Annuller');cancel.onclick=async()=>{try{await request('library/cancel',{id});}catch(err){error(main,err);}};target.append(' ',cancel);setTimeout(tick,2500);
    }else{polling=false;if(run.status==='failed')error(main,Error(run.error||'Analysis failed'));library=await request('library');cards();suggestions();if(run.status==='completed')await open(run.artifactId);else main.querySelector('#refresh-analysis')?.removeAttribute('disabled');}
   }catch(err){polling=false;error(main,err);}};await tick();
  }
  main.querySelector('#new-analysis').onclick=()=>create();main.querySelector('#analysis-search').oninput=cards;
  await load();
 }
 return {memory,analysis};
}

// Screen-sized labels keep the graph legible without turning nodes into cards.
function mountMemoryGraph(host,{rows,positions,selected,box,animate,onSelect,onMove,onCamera,escape:e,label}){
 const ids=new Set(rows.map(r=>r.id));
 const edges=rows.flatMap(r=>(r.links||[]).filter(l=>ids.has(l.id)).map(l=>({from:r.id,to:l.id,label:l.label})));
 host.innerHTML=`<svg viewBox="${box.join(' ')}" role="group" aria-label="${e(label)}">${edges.map(l=>`<g class="memory-edge ${l.from===selected||l.to===selected?'active':''}"><path/><title>${e(l.label)}</title></g>`).join('')}${rows.map(r=>`<g class="memory-node ${r.origin==='AI'?'ai':''} ${r.id===selected?'selected':''}" data-node="${r.id}" tabindex="0" role="button" aria-label="${e(r.title+' · '+r.origin+(r.status==='suggested'?' · Needs review':''))}"><title>${e(r.title)}</title><circle class="node-hit"/><circle class="node-halo"/><circle class="node-core"/>${r.status==='suggested'?'<circle class="review-dot"/>':''}<g class="node-label"></g></g>`).join('')}</svg>`;
 const svg=host.querySelector('svg'),nodes=[...svg.querySelectorAll('.memory-node')],paths=[...svg.querySelectorAll('.memory-edge path')];
 let frame=0,stopped=false;
 const scale=()=>svg.getScreenCTM()?.a||1;
 function paint(points=positions){
  nodes.forEach(g=>{const p=points.get(g.dataset.node);g.setAttribute('transform',`translate(${p.x} ${p.y})`);});
  edges.forEach((l,i)=>{const a=points.get(l.from),b=points.get(l.to);paths[i].setAttribute('d',`M${a.x} ${a.y} L${b.x} ${b.y}`);});
 }
 function presentation(){
  const s=scale(),zoom=1200/box[2];
  svg.classList.toggle('graph-detail',zoom>1.35);
  nodes.forEach((g,i)=>{
   const radius=Math.min(10,Math.max(4.5,6*zoom));
   [['.node-core',radius],['.node-halo',radius+6],['.node-hit',22]].forEach(([q,r])=>g.querySelector(q).setAttribute('r',r/s));
   const dot=g.querySelector('.review-dot');if(dot){dot.setAttribute('r',2.5/s);dot.setAttribute('cx',(radius+3)/s);dot.setAttribute('cy',(-radius-2)/s);}
   const group=g.querySelector('.node-label');group.setAttribute('transform',`scale(${1/s})`);
   group.innerHTML='<text></text>';const probe=group.firstChild;probe.style.fontSize='12px';
   const words=rows[i].title.split(/\s+/),lines=[];let line='';
   for(const word of words){probe.textContent=(line?line+' ':'')+word;if(probe.getComputedTextLength()>150&&line){lines.push(line);line=word;}else line=probe.textContent;}
   if(line)lines.push(line);
   const shortened=lines.slice(0,2);if(lines.length>2)shortened[1]+='…';
   group.innerHTML=shortened.map((text,i)=>`<text y="${radius+19+i*16}">${e(text)}</text>`).join('');
   group.querySelectorAll('text').forEach(t=>{while(t.getComputedTextLength()>150&&t.textContent.length>2)t.textContent=t.textContent.replace(/…$/,'').slice(0,-1)+'…';});
  });
  // Suppress collisions in the overview; hover/focus always reveals a label.
  const occupied=[];
  [...nodes].sort((a,b)=>Number(b.dataset.node===selected)-Number(a.dataset.node===selected)).forEach(g=>{
   const r=g.querySelector('.node-label').getBoundingClientRect(),overlap=occupied.some(b=>r.left<b.right+8&&r.right>b.left-8&&r.top<b.bottom+4&&r.bottom>b.top-4);
   g.classList.toggle('label-crowded',overlap&&g.dataset.node!==selected);if(!overlap)occupied.push(r);
  });
 }
 function stop(){stopped=true;cancelAnimationFrame(frame);paint();svg.classList.remove('graph-entering');}
 function camera(){svg.setAttribute('viewBox',box.join(' '));presentation();onCamera(box);}
 function zoom(factor,anchor){
  stop();const w=Math.max(320,Math.min(2400,box[2]*factor)),ratio=w/box[2],p=anchor||{x:box[0]+box[2]/2,y:box[1]+box[3]/2};
  box=[p.x-(p.x-box[0])*ratio,p.y-(p.y-box[1])*ratio,w,box[3]*ratio];camera();
 }
 svg.addEventListener('wheel',ev=>{ev.preventDefault();const p=new DOMPoint(ev.clientX,ev.clientY).matrixTransform(svg.getScreenCTM().inverse());zoom(Math.exp(Math.max(-100,Math.min(100,ev.deltaY))*.002),p);},{passive:false});
 svg.onpointerdown=ev=>{
  if(ev.button!==0)return;stop();const g=ev.target.closest('[data-node]'),p=g?positions.get(g.dataset.node):null,s=scale();
  const start={x:ev.clientX,y:ev.clientY,px:p?.x,py:p?.y,box:[...box]};let dragged=false;
  svg.setPointerCapture(ev.pointerId);
  svg.onpointermove=move=>{
   const dx=move.clientX-start.x,dy=move.clientY-start.y;if(Math.hypot(dx,dy)>4)dragged=true;
   if(p){p.x=Math.max(35,Math.min(1165,start.px+dx/s));p.y=Math.max(35,Math.min(865,start.py+dy/s));paint();}
   else{box=[start.box[0]-dx/s,start.box[1]-dy/s,...start.box.slice(2)];svg.setAttribute('viewBox',box.join(' '));onCamera(box);}
  };
  function finish(cancelled){svg.onpointermove=null;svg.onpointerup=null;svg.onpointercancel=null;presentation();if(g){if(dragged)onMove(g.dataset.node);else if(!cancelled)onSelect(g.dataset.node);}}
  svg.onpointerup=()=>finish(false);svg.onpointercancel=()=>finish(true);
 };
 nodes.forEach(g=>{g.onkeydown=ev=>{
  if(['Enter',' '].includes(ev.key)){ev.preventDefault();stop();onSelect(g.dataset.node);}
  else if(ev.key.startsWith('Arrow')){ev.preventDefault();stop();const p=positions.get(g.dataset.node);p.x=Math.max(35,Math.min(1165,p.x+(ev.key==='ArrowRight'?20:ev.key==='ArrowLeft'?-20:0)));p.y=Math.max(35,Math.min(865,p.y+(ev.key==='ArrowDown'?20:ev.key==='ArrowUp'?-20:0)));paint();presentation();}
 };g.onkeyup=ev=>{if(ev.key.startsWith('Arrow'))onMove(g.dataset.node);};});
 paint();presentation();
 if(animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
  const center={x:box[0]+box[2]/2,y:box[1]+box[3]/2},start=performance.now();svg.classList.add('graph-entering');
  const tick=now=>{
   if(stopped||!svg.isConnected)return;
   const points=new Map();rows.forEach((r,i)=>{const p=positions.get(r.id),t=Math.max(0,Math.min(1,(now-start-Math.min(i*35,240))/850)),k=1-Math.pow(1-t,3);points.set(r.id,{x:center.x+(p.x-center.x)*k,y:center.y+(p.y-center.y)*k});});paint(points);
   if(now-start<1100)frame=requestAnimationFrame(tick);else{paint();svg.classList.remove('graph-entering');presentation();}
  };tick(start);
 }
 return {zoom,stop};
}
