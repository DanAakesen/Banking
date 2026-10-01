import {t, locale, registerShell, translateShell} from './i18n.js';
import { conversationStore } from './conversations.js';
import { setupVoice } from './voice.js';
import { formatVoiceTranscript } from './voice-transcript.js';
import { setupOverviewEffects } from './overview-effects.js';
const overviewEffects = setupOverviewEffects();
const $ = id => document.getElementById(id);
document.documentElement.lang = new URLSearchParams(location.search).get('lang') === 'da' ? 'da' : 'en';
const embedded = new URLSearchParams(location.search).has('embedded') && parent !== window;
const bankingMode = new URLSearchParams(location.search).get('mode') === 'Live' ? 'Live' : 'Demo';
const hostTheme = new URLSearchParams(location.search).get('theme');
if(embedded && ['light','graphite','slate','sand','forest'].includes(hostTheme))document.documentElement.dataset.theme=hostTheme;
let hostContext={};
if(embedded) document.documentElement.dataset.embedded='true';
if(embedded && new URLSearchParams(location.search).has('floating')) document.documentElement.dataset.floating='true';
if(document.documentElement.dataset.floating){
 const footer=document.querySelector('.composer-footer');
 const tools=document.createElement('div');tools.className='composer-tools';
 tools.append($('starters'),document.querySelector('.advisor-heading'));
 footer.insertBefore(tools,$('prompt-form'));
 const gripSpace=document.createElement('div');gripSpace.className='composer-grip-space';gripSpace.setAttribute('aria-hidden','true');document.querySelector('.heading-actions').prepend(gripSpace);
 $('starters').querySelectorAll('button').forEach((button,index)=>{
  const label=button.textContent.trim();button.setAttribute('aria-label',label);button.title=label;button.dataset.short=index===0?'My goals':'Find room';
  for(const node of [...button.childNodes])if(node.nodeType===3){const span=document.createElement('span');span.className='starter-label';span.textContent=node.textContent;node.replaceWith(span);}
 });
}
registerShell(); translateShell();
const hostFont = Number(new URLSearchParams(location.search).get('font'));
if(embedded && hostFont>=10 && hostFont<=24) document.documentElement.style.setProperty('--chat-font',hostFont+'px');
const sendHost = value => { if(embedded) parent.postMessage(value,location.origin); };
window.addEventListener('message',event=>{
 if(!embedded || event.source!==parent || event.origin!==location.origin) return;
 if(event.data?.type==='advisor:context')hostContext=event.data.context||{};
 if(event.data?.type==='advisor:language' && ['en','da'].includes(event.data.lang) && document.documentElement.lang!==event.data.lang) {document.documentElement.lang=event.data.lang;translateShell();welcomeQueue=[];refreshWelcome();if(ws){drawMessages();drawChats();lists();if(!$('chat-sidebar').hidden)showDrawerView(drawerView);} }
 if(event.data?.type==='advisor:prompt'&&typeof event.data.prompt==='string'){
  $('advisor-prompt').value=event.data.prompt.slice(0,3500);persistChat({draft:$('advisor-prompt').value});resizeComposer();$('advisor-prompt').focus();
 }
 if(event.data?.type==='advisor:stop')voice.end();
 if(event.data?.type==='advisor:presentation'){
  const reopening=document.documentElement.dataset.presentation==='mini'&&event.data.value==='panel';
  document.documentElement.dataset.presentation=event.data.value;
  if(reopening)scrollReopenedChat();
 }
 if(event.data?.type==='advisor:theme' && ['light','graphite','slate','sand','forest'].includes(event.data.theme) && ws) setTheme(event.data.theme);
});
let ws, examples = [], selected = null, revision = null, dirty = false, port, frame, loadTimer, generation = 0, busy = false, editingArtifact = false;
const text = (tag, value, className) => { const el = document.createElement(tag); el.textContent = value; if (className) el.className = className; return el; };
const status = (value, error = false) => { $('status').textContent = t(value); $('status').classList.toggle('error', error); };
let chats;
try { chats = conversationStore(embedded ? {getItem:()=>null,setItem:()=>{}} : localStorage); } catch { chats = conversationStore({getItem:()=>null,setItem:()=>{}}); }
if (!chats.current()) chats.create();
let activeChatId = null;
const persistChat = patch => { try { chats.update(patch); scheduleMemory(); } catch { status(t('Chat history could not be saved in this browser.'), true); } };
let captureReady=false,memoryTimer,voiceWasActive=false;
const memoryBaseline=new Map();
function memoryPayload(reason){
 if(!embedded||!captureReady)return null;
 const chat=chats.current();if(!chat)return null;
 let messages=chat.messages.filter(m=>m.role==='user'&&memoryBaseline.get(m.id)!==m.text).slice(-40).map(m=>({id:m.id,role:'user',text:m.text.slice(-5000)}));
 while(JSON.stringify(messages).length>24000)messages.shift();
 if(!messages.length)return null;
 return {chatId:chat.id,title:chat.title.slice(0,100),messages,reason,busy:reason==='activity'&&Boolean(voice.isActive()||handlingPrompt||activeRun)};
}
function flushMemory(reason='activity',keepalive=false){
 clearTimeout(memoryTimer);memoryTimer=null;const payload=memoryPayload(reason);if(!payload)return;
 return api('memory/capture',payload,{keepalive}).catch(()=>{if(!keepalive)status(t('Conversation saved. Automatic memory could not be queued; it will try again on your next chat activity.'),true);});
}
function scheduleMemory(){if(captureReady&&!memoryTimer)memoryTimer=setTimeout(()=>flushMemory(),1000);}
setInterval(()=>{if(captureReady&&(voice.isActive()||handlingPrompt||activeRun))flushMemory();},20000);
window.addEventListener('pagehide',()=>flushMemory('pagehide',true));
const welcomePhrases = [
 'What would you like to explore?',
 'What could your money make possible?',
 'Where could you save a little more?',
 'Let’s find room for what matters.',
 'How are your goals coming along?',
 'What would you like to understand?',
 'Let’s look at the bigger picture.',
 'What could next month look like?',
 'Ready to explore a what-if?',
 'What’s on your financial mind?'
];
const welcomeMotion = matchMedia('(prefers-reduced-motion: reduce)');
let welcomeTimer, welcomeActive = false, welcomeQueue = [], lastWelcome;
function stopWelcome() { clearTimeout(welcomeTimer); welcomeTimer = undefined; }
function nextWelcome() {
 if (!welcomeActive || document.hidden || welcomeMotion.matches) return;
 if (!welcomeQueue.length) {
  welcomeQueue = [...welcomePhrases];
  for (let i=welcomeQueue.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1)); [welcomeQueue[i],welcomeQueue[j]]=[welcomeQueue[j],welcomeQueue[i]]; }
  if (welcomeQueue[0] === lastWelcome) [welcomeQueue[0],welcomeQueue[1]]=[welcomeQueue[1],welcomeQueue[0]];
 }
 const phrase = t(welcomeQueue.shift()); lastWelcome = phrase;
 const heading=$('conversation-title');
 const accessible=text('span',t(welcomePhrases[0]),'sr-only');
 const line=text('span','','welcome-line');line.setAttribute('aria-hidden','true');
 const measure=text('span',phrase,'welcome-measure'), typed=text('span','','welcome-typed');
 line.append(measure,typed);heading.replaceChildren(accessible,line);
 let index=0;
 const tick=()=>{
  if (!welcomeActive || document.hidden || welcomeMotion.matches) return;
  typed.textContent=phrase.slice(0,++index);
  if(index<phrase.length) welcomeTimer=setTimeout(tick,45+Math.random()*30);
  else welcomeTimer=setTimeout(nextWelcome,2600);
 };
 tick();
}
function refreshWelcome() {
 stopWelcome();
 if (!welcomeActive) return;
 if(welcomeMotion.matches) $('conversation-title').textContent=t(welcomePhrases[0]);
 else if(!document.hidden) nextWelcome();
}
welcomeMotion.addEventListener('change',refreshWelcome);
document.addEventListener('visibilitychange',refreshWelcome);
function setWelcome(empty) {
 document.querySelector('.conversation-intro').hidden=!empty;
 if(empty===welcomeActive)return;
 welcomeActive=empty;stopWelcome();
 if(empty)refreshWelcome();else $('conversation-title').textContent='';
}
let messageScrollFrame;
const conversationScroll=$('conversation-scroll');
conversationScroll.addEventListener('scroll',()=>{
 conversationScroll.dataset.topFade=String(conversationScroll.scrollTop>1);
},{passive:true});
function scrollReopenedChat(){
 // Let the parent reveal and size the iframe before measuring its content.
 requestAnimationFrame(()=>requestAnimationFrame(()=>{
  const scroll=$('conversation-scroll');
  scroll.scrollTo({top:scroll.scrollHeight,behavior:'instant'});
 }));
}
let handlingPrompt=false,voiceToolBusy=false;
const activityPanels=new Map();
function activityOwner(){return chats.current()?.messages.findLast(msg=>msg.role==='user');}
function activityPanel(msg){
 if(activityPanels.has(msg.id))return activityPanels.get(msg.id);
 const section=text('details','','advisor-activity'),summary=text('summary',''),title=text('span','','activity-title'),events=text('ol','');
 section.dataset.promptId=msg.id;title.setAttribute('role','status');title.setAttribute('aria-live','polite');
 events.setAttribute('aria-label',t('Advisor actions'));summary.append(title,text('span','›','activity-arrow'));section.append(summary,events);
 summary.addEventListener('click',event=>{if(section.dataset.busy==='true')event.preventDefault();});
 const panel={section,title,events};activityPanels.set(msg.id,panel);return panel;
}
function renderActivity(msg){
 const panel=activityPanel(msg),{section,title,events}=panel;
 const busy=msg.activityBusy===true,wasBusy=section.dataset.busy==='true';section.dataset.busy=String(busy);
 if(busy||wasBusy)section.open=busy;
 events.replaceChildren();
 const paths={search:'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14M15 15l6 6',terminal:'M4 5h16v14H4zM7 9l3 3-3 3M13 15h4',database:'M4 6c0-4 16-4 16 0s-16 4-16 0m0 0v12c0 4 16 4 16 0V6M4 12c0 4 16 4 16 0',file:'M6 3h8l4 4v14H6zM14 3v5h4M9 12h6M9 16h6',working:'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l3 3M15 15l3 3M6 18l3-3M15 9l3-3'};
 for(const step of msg.activities||[]){
  const row=text('li',''),glyph=text('span','','task-icon');row.dataset.state=step.state;glyph.setAttribute('aria-hidden','true');
  glyph.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[step.kind]||paths.working}"/></svg>`;
  row.append(glyph,text('span',t(step.label),'task-label'),text('span',step.state==='failed'?'!':'✓','task-state'));events.append(row);
 }
 const failed=msg.activities?.some(step=>step.state==='failed'),count=msg.activities?.length||0;
 title.textContent=busy?t(msg.activities.at(-1)?.label||'Working…'):failed?t('Could not finish'):document.documentElement.lang==='da'?`Færdig · ${count} trin`:`Done · ${count} ${count===1?'step':'steps'}`;
 return section;
}
function activity(label,state='working'){
 const msg=activityOwner();if(!msg)return;
 msg.activities||=[];
 for(const step of msg.activities)if(step.state==='working')step.state='done';
 const kind=/web|search|browse/i.test(label)?'search':/shell|terminal|command/i.test(label)?'terminal':/read|bank|budget|transaction|goal|konto|data/i.test(label)?'database':/sav|file/i.test(label)?'file':'working';
 if(msg.activities.at(-1)?.label===label)msg.activities.at(-1).state=state;else msg.activities.push({label,state,kind});
 if(state==='working')msg.activityFinished=false;
 msg.activityBusy=!msg.activityFinished&&(state==='working'||handlingPrompt||Boolean(activeRun)||voiceToolBusy);
 drawMessages();
}
function finishActivity(){
 const msg=activityOwner();if(!msg?.activities)return;
 msg.activityFinished=true;msg.activityBusy=false;
 for(const step of msg.activities)if(step.state==='working')step.state='done';
 renderActivity(msg);persistChat({});
}
function updateActivity(busy){
 const msg=activityOwner();if(!msg?.activities)return;
 busy=(busy||voiceToolBusy)&&!msg.activityFinished;
 msg.activityBusy=Boolean(busy);
 if(!busy)for(const step of msg.activities)if(step.state==='working')step.state='done';
 renderActivity(msg);
}
function toolActivity(tool) {
 const names={prepare_saxo_order:t('Checked Saxo order for review'),read_app_data:t('Read app and provider data'),read_goals:t('Read saved goals and progress'),read_banking_data:t('Read budgets, income, expenses and savings'),read_transactions:t('Read matching transactions'),create_budget_entry:t('Created budget entry'),generate_analysis:t('Started visual analysis'),clarify:t('Clarification needed')};
 activity(names[tool]||String(tool||'Request completed').replaceAll('_',' '),'done');
}
function followLatestMessage() {
 cancelAnimationFrame(messageScrollFrame);
 messageScrollFrame=requestAnimationFrame(()=>{
  const scroll=$('conversation-scroll'), last=$('messages').lastElementChild;
  if(!last)return;
  // Scroll only the chat region, never its embedding Overview page.
  const top=scroll.scrollTop+last.getBoundingClientRect().bottom-scroll.getBoundingClientRect().bottom+16;
  scroll.scrollTo({top:Math.max(0,top),behavior:'instant'});
 });
}
function drawMessages() {
 const chat = chats.current();
 setWelcome(chat.messages.length === 0);
 $('starters').hidden=chat.messages.length>0;
 $('advisor-prompt').placeholder=chat.messages.length?'':t('Ask your advisor…');
 $('conversation-scroll').classList.toggle('is-empty', chat.messages.length === 0);
 $('messages').replaceChildren();
 for (const msg of chat.messages) {
  const row = text('article', '', 'message ' + msg.role + (msg.error ? ' error' : ''));
  const bubble=text('div','','message-content');
  bubble.textContent=msg.proposal?t(msg.text):msg.voice&&msg.role==='assistant'?formatVoiceTranscript(msg.text):msg.text;
  row.append(bubble);
  if(msg.unverified?.length){const warning=text('p',t('Not verified against your Banking data:')+' '+msg.unverified.join(', '),'message-warning');warning.setAttribute('role','note');row.append(warning);}
  if(msg.proposal)renderProposal(row,msg);
  if(msg.sources&&embedded){const links=text('div','','advisor-source-links');for(const source of msg.sources){const link=text('button',source.label);link.onclick=()=>sendHost({type:'advisor:transactions',filters:source});links.append(link);}row.append(links);}
  if (msg.artifact) { const b=text('button',t('Open analysis')); b.onclick=()=>withDiscard(async()=>{const item=ws.artifacts.find(x=>x.id===msg.artifact.id);if(item)await show(item,msg.artifact.revision);else status(t('This analysis is no longer available in this Demo workspace.'),true);});row.append(b); }
  $('messages').append(row);
  if(msg.role==='user'&&msg.activities?.length)$('messages').append(renderActivity(msg));
 }
 drawChats();
 followLatestMessage();
}
function addMessage(role, value, extra={}) { if(role==='assistant')finishActivity(); try { chats.message(role,value,extra);scheduleMemory(); } catch { status(t('Chat history could not be saved in this browser.'),true); } drawMessages(); if(role==='assistant'&&!extra.voice)sendHost({type:'advisor:reply',error:Boolean(extra.error)}); }
function renderProposal(row,msg){
 const p=msg.proposal,card=text('section','','budget-proposal');card.setAttribute('aria-label',t('Review proposed changes'));
 const amount=n=>new Intl.NumberFormat(document.documentElement.lang,{maximumFractionDigits:2}).format(n)+' '+p.currency;
 const resourceLabel={accounts:'Account',goals:'Goal',loans:'Loan',wealth:'Statement',watchlist:'Watchlist',categories:'Category',rules:'Rule'}[p.resource]||p.resource;
 card.append(text('h3',p.kind==='app'?t(({create:'Create',update:'Update',delete:'Delete'}[p.operation]+' '+resourceLabel)):p.kind==='review'?t(p.name):p.name));
 if(p.kind==='saxo'){
  card.classList.add('saxo-order-review');const o=p.order;
  card.prepend(text('strong','Saxo SIM · '+t('Order review'),'order-environment'));
  const values=[['Symbol',o.symbol],['Account',o.accountName+' · '+o.accountCurrency],['Side',t(o.side)],['Shares',o.quantity],['Limit price',amount(o.limitPrice)],['Order value',amount(o.quantity*o.limitPrice)],['Duration',t(o.duration)],['Stop-loss',o.stopLoss===null?t('None'):amount(o.stopLoss)],['Take-profit',o.takeProfit===null?t('None'):amount(o.takeProfit)]];
  const cost=o.precheck?.EstimatedCashRequired,costCurrency=o.precheck?.EstimatedCashRequiredCurrency;
  if(o.stopOrderType==='StopIfTraded')values.push(['Stop trigger',t('Last traded price')]);
  if(Number.isFinite(cost)&&costCurrency)values.push(['Estimated cash required',new Intl.NumberFormat(locale(),{maximumFractionDigits:2}).format(cost)+' '+costCurrency]);
  const fees=o.precheck?.EstimatedTotalCost;
  if(Number.isFinite(fees))values.push(['Estimated total cost (Saxo)',amount(fees)]);
  for(const [label,value] of values){const line=text('div','','proposal-entry');line.append(text('strong',t(label)),text('span',String(value)));card.append(line);}
  if(o.stopLoss!==null||o.takeProfit!==null)card.append(text('p',t('Attached exits remain active until cancelled. A stop-loss trigger does not guarantee an execution price.')));
  card.append(text('small',t('Review expires at')+' '+new Date(o.expiresAt).toLocaleTimeString(locale())));
  const receipt=text('p',p.result?orderStatusText(p.result):t('Nothing has been submitted. Confirm only when every detail is correct.'),'order-receipt');receipt.setAttribute('role','status');card.append(receipt);
  const confirm=text('button',t('Confirm SIM order'),'proposal-save');confirm.disabled=p.status!=='pending'||Date.parse(o.expiresAt)<=Date.now();
  confirm.onclick=async()=>{confirm.disabled=true;p.status='checking';persistChat({});
   try{const result=await api('proposals/apply',{id:p.id,confirm:true,confirmOrder:true});p.status='applied';p.result=result;persistChat({});drawMessages();const answer=orderStatusText(result);addMessage('assistant',answer);voice.notify(answer);sendHost({type:'advisor:data-changed',result:{kind:'saxo'}});}
   catch(e){persistChat({});receipt.textContent=e.message+' '+t('Do not resubmit. Refresh order status first.');}
  };
  const refresh=text('button',t('Refresh order status'));refresh.onclick=async()=>{refresh.disabled=true;try{p.result=await api('proposals/order-status',{id:p.id});persistChat({});receipt.textContent=orderStatusText(p.result);}catch(e){receipt.textContent=e.message;}finally{refresh.disabled=false;}};
  card.append(confirm,refresh);row.append(card);return;
 }
 if(p.kind==='budget'&&p.previousName&&p.previousName!==p.name)card.append(text('p',t('Name')+': '+p.previousName+' → '+p.name));
 if(p.review){
  for(const entry of [p.review.item.transaction,p.review.item.counterpart].filter(Boolean)){const line=text('div','','proposal-entry');line.append(text('strong',entry.description),text('span',amount(entry.amount)+' · '+(entry.bookingDate||t('Unknown date'))));card.append(line);}
  card.append(text('p',p.review.categoryName?t('Category: ')+p.review.categoryName:t('Classify as an internal transfer; no money is moved.')));
  if(p.review.item.evidence)card.append(text('small',t('Bank evidence: ')+({MerchantCategory:t('Merchant category reported by the bank'),OwnAccount:t('Matching account details'),ExactAccount:t('Matching account details')}[p.review.item.evidence]||t('Suggested match; review the transaction details'))));
  if(p.review.ruleContains)card.append(text('p',t('Create a categorization rule matching: ')+p.review.ruleContains));
 }
 if(p.kind==='app'){
  const fields=new Set(Object.keys(p.operation==='delete'?(p.before||{}):(p.after||{})));
  const labels={customName:'Account name',name:'Name',description:'Description',target:'Target amount',currency:'Currency',scope:'Scope',accountId:'Account',deadline:'Deadline',notes:'Notes',references:'References',planStart:'Plan start',startingBalance:'Starting balance',monthlyContribution:'Monthly contribution',contributionDay:'Contribution day',principal:'Principal',annualRate:'Annual interest rate',months:'Months',balanceDate:'Balance date',monthlyFee:'Monthly fee',upfrontFee:'Upfront fee',isScenario:'Scenario',provider:'Provider',kind:'Type',value:'Value',asOf:'Statement date',sourceNote:'Source note',annualPension:'Annual pension',retirementAge:'Retirement age',symbol:'Symbol',url:'Link',contains:'Description contains',categoryId:'Category',priority:'Priority',active:'Active'};
  const display=v=>v===undefined||v===null||v===''?t('Not set'):typeof v==='boolean'?t(v?'Yes':'No'):typeof v==='number'?new Intl.NumberFormat(locale(),{maximumFractionDigits:2}).format(v):Array.isArray(v)?v.join(', '):String(v);
  for(const key of fields){if(!labels[key])continue;const before=p.before?.[key],after=p.after?.[key];if(JSON.stringify(before)===JSON.stringify(after))continue;const line=text('div','','proposal-entry');line.append(text('strong',t(labels[key])),text('span',display(p.displayValues?.[key]?.before??before)+' → '+(p.operation==='delete'?t('Removed'):display(p.displayValues?.[key]?.after??after))));card.append(line);}
 }
 for(const change of p.changes||[]){
  const entry=change.after,line=text('div','','proposal-entry');
  line.append(text('strong',entry.name),text('span',`${change.before?amount(change.before.amount)+' → ':''}${amount(entry.amount)} / ${entry.intervalMonths} ${document.documentElement.lang==='da'?(entry.intervalMonths===1?'måned':'måneder'):(entry.intervalMonths===1?'month':'months')}`),text('small',t(entry.isSavings?'Savings':entry.type)));card.append(line);
 }
 if(p.kind==='budget'){const totals=text('dl','','proposal-totals');
 for(const [key,label]of [['income','Income'],['expenses','Expenses'],['savings','Savings'],['available','Available per month']]){totals.append(text('dt',t(label)),text('dd',amount(p.before[key])+' → '+amount(p.after[key])));}card.append(totals);}
 const saveButton=text('button',p.status==='applied'?t('Saved'):t('Save these changes'),'proposal-save');saveButton.disabled=p.status==='applied';
 saveButton.onclick=async()=>{
  saveButton.disabled=true;
  try{const result=await api('proposals/apply',{id:p.id,confirm:true});p.status='applied';persistChat({});drawMessages();sendHost({type:'advisor:data-changed',result:{budgetId:result.budgetId,kind:result.kind}});addMessage('assistant',t('The reviewed changes have been saved.'));voice.notify('The reviewed proposal has been saved successfully.');}
  catch(e){saveButton.disabled=false;addMessage('assistant',e.message,{error:true});}
 };card.append(saveButton);row.append(card);
}
function orderStatusText(result){
 const r=result.receipt||{},status=t(result.status||'Unconfirmed');
 if(r.state==='Reviewed')return t('Review the SIM order. Nothing has been submitted.');
 return 'Saxo SIM · '+status+(r.orderId?' · '+t('Order ID')+': '+r.orderId:'')+'. '+t(result.verified?'Status verified with Saxo.':'Execution is not confirmed. Refresh order status.')+(r.relatedOrderIds?.length?' '+t('Related order IDs')+': '+r.relatedOrderIds.join(', ')+'.':'')+(result.relatedOrdersVerified===false?' '+t('Attached exits are not yet verified.'):'')+(r.error?' '+r.error:'');
}
function drawChats() {
 const query=$('chat-search').value.trim().toLowerCase();$('chats').replaceChildren();
 $('chat-count').textContent=String(chats.chats.length);
 for(const chat of [...chats.chats].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).filter(x=>x.title.toLowerCase().includes(query))){
  const b=text('button','');b.title=chat.title==='New conversation'?t('New conversation'):chat.title;b.append(text('span',chat.title==='New conversation'?t('New conversation'):chat.title,'chat-row-title'));b.classList.toggle('active',chat.id===chats.current().id);b.setAttribute('aria-current',String(chat.id===chats.current().id));b.append(text('small',new Date(chat.updatedAt).toLocaleDateString(locale(),{day:'numeric',month:'short'})));b.onclick=()=>switchChat(chat.id);$('chats').append(b);
 }
 if(!$('chats').children.length)$('chats').append(text('p',t('No matching chats.'),'muted'));
}
let drawerView='chats';
function showDrawerView(view){
 drawerView=view;
 document.querySelector('.workspace-content').scrollTop=0;
 for(const panel of document.querySelectorAll('[data-drawer-panel]'))panel.hidden=panel.dataset.drawerPanel!==view;
 for(const button of document.querySelectorAll('[data-drawer-view]')){if(button.dataset.drawerView===view)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');}
 if(view==='memories')refreshMemory();
 if(view==='usage')refreshUsage();
}
async function refreshUsage(){
 const area=$('advisor-usage');area.replaceChildren(text('p',t('Loading usage…'),'muted'));
 try{
  const u=await api('usage');area.replaceChildren();
  for(const [key,name] of [['questions','Questions'],['voice','Voice sessions'],['analyses','Analyses']]){
   const row=text('div','','usage-row'),line=text('div','','usage-row-heading');line.append(text('span',t(name)),text('strong',`${u[key]} / ${u.limits[key]}`));
   const meter=document.createElement('progress');meter.max=Math.max(1,u.limits[key]);meter.value=u[key];meter.setAttribute('aria-label',t(name));
   row.append(line,meter);area.append(row);
  }
  area.append(text('p',t('Daily service limits across workspaces. Reset at 00:00 UTC. These counts are not billed cost.'),'workspace-note'));
 }catch(e){area.replaceChildren(text('p',e.message,'workspace-note'));const retry=text('button',t('Try again'));retry.onclick=refreshUsage;area.append(retry);}
}
function setDrawer(open) {
 if(open)showDrawerView(drawerView);
 $('chat-sidebar').hidden=!open;$('toggle-chats').setAttribute('aria-expanded',String(open));
 $('toggle-chats').setAttribute('aria-label',open?t('Hide chats'):t('Open chats'));
 $('toggle-chats').title=open?t('Hide chats'):t('Open chats');
 $('drawer-shade').hidden=!open;
 document.querySelector('.active-conversation').inert=!$('drawer-shade').hidden;
 if(open){if(drawerView==='chats')$('chat-search').focus();else $('close-drawer').focus();}
 else $('toggle-chats').focus();
}
async function refreshMemory(){
 const section=$('advisor-memory');
 if(!embedded){section.replaceChildren(text('p',t('Open the advisor in Banking to manage your memories.'),'workspace-note'));return;}
 if(!section.dataset.initialized){
  section.dataset.initialized='true';
  section.innerHTML='<p class="workspace-note">Saved priorities for your advisor.</p><div class="memory-list"></div><form id="memory-form"><label for="memory-text">Remember a priority</label><textarea id="memory-text" maxlength="500" required rows="2" placeholder="What should your advisor remember?"></textarea><button>Remember</button><button type="button" id="memory-cancel" hidden>Cancel edit</button><p class="memory-error" role="status"></p></form>';
  registerShell(section);translateShell(section);
  $('memory-form').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget;try{await api('memory/save',{id:form.dataset.id||null,text:$('memory-text').value});form.dataset.id='';$('memory-text').value='';$('memory-cancel').hidden=true;form.querySelector('button').textContent=t('Remember');await refreshMemory();}catch(e){form.querySelector('.memory-error').textContent=e.message;}};
  $('memory-cancel').onclick=()=>{$('memory-form').dataset.id='';$('memory-text').value='';$('memory-cancel').hidden=true;$('memory-form').querySelector('button').textContent=t('Remember');};
 }
 try{
  const data=await api('memory'),list=section.querySelector('.memory-list');list.replaceChildren();section.querySelector('.memory-error').textContent='';
  for(const preference of data.preferences){const row=text('div','','memory-item');row.append(text('p',preference.text));
   const edit=text('button',t('Edit')),remove=text('button',t('Remove'));edit.setAttribute('aria-label',t('Edit priority: ')+preference.text);remove.setAttribute('aria-label',t('Remove priority: ')+preference.text);
   edit.onclick=()=>{$('memory-form').dataset.id=preference.id;$('memory-text').value=preference.text;$('memory-form').querySelector('button').textContent=t('Save priority');$('memory-cancel').hidden=false;$('memory-text').focus();};
   remove.onclick=async()=>{try{await api('memory/delete',{id:preference.id});await refreshMemory();}catch(e){section.querySelector('.memory-error').textContent=e.message;}};row.append(edit,remove);list.append(row);
  }
  if(!data.preferences.length)list.append(text('p',t('No remembered priorities yet.'),'muted'));
 }catch(e){section.querySelector('.memory-error').textContent=e.message;}
}
$('toggle-chats').onclick=()=>setDrawer($('chat-sidebar').hidden);
$('close-drawer').onclick=()=>setDrawer(false);
for(const button of document.querySelectorAll('[data-drawer-view]'))button.onclick=()=>showDrawerView(button.dataset.drawerView);
$('chat-sidebar').addEventListener('keydown',event=>{
 if(event.key!=='Tab')return;
 const controls=[...$('chat-sidebar').querySelectorAll('button,input,textarea,a[href]')].filter(el=>!el.disabled&&el.getClientRects().length);
 const first=controls[0],last=controls.at(-1);
 if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
 else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
});
$('drawer-shade').onclick=()=>{setDrawer(false);$('toggle-chats').focus();};
$('advisor-shell').addEventListener('cancel',e=>{e.preventDefault();if(!$('chat-sidebar').hidden)setDrawer(false);});
$('chat-search').oninput=drawChats;
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('chat-sidebar').hidden){setDrawer(false);$('toggle-chats').focus();}});
window.addEventListener('resize',()=>{$('drawer-shade').hidden=$('chat-sidebar').hidden;document.querySelector('.active-conversation').inert=!$('drawer-shade').hidden;});
async function switchChat(id) {
 if(handlingPrompt)return;
 if(activeRun){status(t('Let the current analysis finish before switching chats.'),true);return;}
 if(voice.isActive()){status(t('End voice before switching chats.'),true);return;}
 if(!id && dirty && !(await save())) return;
 withDiscard(async()=>{
  persistChat({draft:$('advisor-prompt').value});
  flushMemory('new-chat');
  if(id)chats.select(id);else chats.create();
  voice.reset(chats.context());pendingVoiceScenario=null;stop();selected=null;revision=null;setDirty(false);
  $('canvas').hidden=true;$('agent-progress').textContent='';$('voice-status').textContent='';$('follow-up').checked=false;
  $('activity-events').replaceChildren();$('advisor-activity').hidden=true;
  $('advisor-prompt').value=chats.current().draft||'';resizeComposer();drawMessages();lists();showRuns();
  const ref=chats.current().artifact, item=ws.artifacts.find(x=>x.id===ref?.id);
  if(item)await show(item,ref.revision);setDrawer(false);$('advisor-prompt').focus();status('');
 });
}
$('new-chat').onclick=()=>switchChat();
function resizeComposer(){const el=$('advisor-prompt');el.style.height='auto';el.style.height=Math.min(145,el.scrollHeight)+'px';}
$('advisor-prompt').addEventListener('input',()=>{resizeComposer();persistChat({draft:$('advisor-prompt').value});});
$('advisor-prompt').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('prompt-form').requestSubmit();}});
for(const button of document.querySelectorAll('[data-prompt]')) button.onclick=()=>{$('advisor-prompt').value=button.dataset.prompt;resizeComposer();$('prompt-form').requestSubmit();};
async function api(path, value, options={}) {
 if(value&&['advisor','voice/delegate'].includes(path))value={...value,screen:hostContext};
 const params=new URLSearchParams(location.search);
 const headers={'X-Banking-Mode':bankingMode};for(const field of ['from','to','currency'])if(hostContext[field]||params.get(field))headers['X-Banking-'+field]=hostContext[field]||params.get(field);
 const response = await fetch(new URL('./api/' + path,import.meta.url), value === undefined ? {headers} : { method:'POST', headers:{...headers,'Content-Type':'application/json'}, body:JSON.stringify(value),...options });
 const raw = await response.text(); let data;
 try { data=JSON.parse(raw); } catch { throw new Error(response.ok ? 'The advisor returned an unreadable response. Please retry.' : 'The local advisor could not complete the request. Please retry.'); }
 if (!response.ok) throw new Error(data.error || 'Please retry.'); return data;
}
function setDirty(value) { dirty=value; }
function stop(message) {
 generation++; clearTimeout(loadTimer); port?.close(); port=null; frame?.remove(); frame=null;
 $('stop').hidden=true;
 if (message) { $('stage').replaceChildren(text('div',message,'loading')); $('fallback').hidden=false; status(message); }
}
function lists() {
 $('analysis-count').textContent=ws.artifacts.length+(document.documentElement.lang==='da'?' gemte':' saved'); $('library').replaceChildren();
 if (!ws.artifacts.length) $('library').append(text('p',t('Your saved work will appear here.'),'muted'));
 for (const item of [...ws.artifacts].reverse()) {
  const latest=item.revisions.at(-1), button=text('button',latest.title);
  button.classList.toggle('active',item.id===selected?.id);button.setAttribute('aria-pressed',String(item.id===selected?.id));
  button.append(text('small',`${latest.format.toUpperCase()} · ${item.revisions.length} ${document.documentElement.lang==='da'?(item.revisions.length===1?'version':'versioner'):item.revisions.length===1?'revision':'revisions'}`));
  button.onclick=()=>withDiscard(async()=>{await show(item,latest.revision);setDrawer(false);});$('library').append(button);
 }
 $('history').hidden=!selected; $('revisions').replaceChildren();
 if (!selected) return;
 for (const rev of [...selected.revisions].reverse()) {
  const b=text('button',`Version ${rev.revision}${rev.revision===selected.revisions.length?' · '+t('Latest'):''}`);
  b.classList.toggle('active',rev.revision===revision?.revision);b.setAttribute('aria-pressed',String(rev.revision===revision?.revision));
  b.append(text('small',new Date(rev.createdAt).toLocaleString(locale(),{dateStyle:'medium',timeStyle:'short'})));
  b.onclick=()=>withDiscard(()=>show(selected,rev.revision));$('revisions').append(b);
 }
}
async function show(item, number) {
 $('canvas').hidden=false;persistChat({artifact:{id:item.id,revision:number}});$('follow-up').checked=true;
 stop(); selected=item;revision=structuredClone(item.revisions.find(x=>x.revision===number));setDirty(false);lists();showRuns();
 $('verified-scenario').hidden = true;
 try{localStorage.setItem('banking.advisor.prototype.selection',JSON.stringify({id:item.id,revision:number}));}catch{}
 $('artifact-title').textContent=revision.title;
 $('fallback').hidden=true;$('fallback-text').textContent=revision.fallback;
 $('stage').replaceChildren(text('p',t('Opening your analysis…'),'loading'));$('fallback').hidden=true;status('Opening preview…');
 const current=++generation;
 try {
  if(embedded)ws.demo=await api('context');
  const {url}=await api('render',{artifactId:item.id,revision:number,state:revision.state});if(current!==generation)return;
  frame=document.createElement('iframe');frame.title=revision.title;frame.setAttribute('sandbox','allow-scripts');frame.referrerPolicy='no-referrer';frame.src=url;
  let initialized=false;
  frame.addEventListener('load',()=>{
   if(initialized){stop('This preview navigated away and was stopped. Reopen its saved version to continue.');return;}initialized=true;
   const channel=new MessageChannel();port=channel.port1;let count=0, start=Date.now();
   port.onmessage=({data})=>{
    if(current!==generation || !port)return;
    if(Date.now()-start>1000){count=0;start=Date.now();}
    if(++count>100){stop('This preview sent too many updates. Its saved version is still available.');return;}
    if(!data||typeof data!=='object')return;
    if(data.type==='ready'){clearTimeout(loadTimer);$('stop').hidden=false;status(revision.source==='openai-agents'?t('Analysis ready.'):t('Sample artifact ready.'));if(matchMedia('(max-width:760px)').matches)$('canvas').scrollIntoView({behavior:'auto'});}
    if(data.type==='resize' && Number.isFinite(data.height) && frame){frame.style.height=Math.max(240,Math.min(4000,data.height))+'px';}
    if(data.type==='artifact-error'){status(t('This artifact encountered an error. Its readable summary and saved versions are available.'),true);$('fallback').hidden=false;}
    if(data.type==='state' && data.state && typeof data.state==='object' && !Array.isArray(data.state) && JSON.stringify(data.state).length<=8000){revision.state=structuredClone(data.state);$('verified-scenario').hidden=true;setDirty(true);}
    if(data.type==='tool' && Number.isSafeInteger(data.id)){
     port.postMessage(data.tool==='read_demo_context'?{type:'result',id:data.id,value:structuredClone(ws.demo)}:{type:'result',id:data.id,error:'This prototype only allows read_demo_context.'});
    }
   };
   port.start();
   frame.contentWindow.postMessage({type:'banking:init',theme:ws.theme,state:revision.state,context:structuredClone(ws.demo)},'*',[channel.port2]);
  });
  $('stage').replaceChildren(frame);$('stop').hidden=false;
  loadTimer=setTimeout(()=>{if(current===generation){stop('This artifact did not become ready. Reopen a saved version or use its readable summary.');status(t('Preview timed out.'),true);}},8000);
 }catch(error){if(current===generation){stop(error.message);status(error.message,true);}}
}
async function save() {
 if(!selected||!dirty||busy)return false;busy=true;setDirty(dirty);
 try {const saved=await api('artifacts',{id:selected.id,baseRevision:revision.revision,state:revision.state});ws.artifacts=ws.artifacts.map(x=>x.id===saved.id?saved:x);selected=saved;revision=structuredClone(saved.revisions.at(-1));persistChat({artifact:{id:saved.id,revision:revision.revision}});try{localStorage.setItem('banking.advisor.prototype.selection',JSON.stringify({id:saved.id,revision:revision.revision}));}catch{}setDirty(false);lists();status(t('Revision saved. You can return to it after refreshing.'));return true;}
 catch(error){status(error.message,true);return false;}finally{busy=false;setDirty(dirty);}
}
async function withDiscard(action){
 if(busy)return;if(!dirty){try{await action();}catch(e){status(e.message,true);}return;}
 $('discard-dialog').showModal();
 $('keep-editing').onclick=()=>$('discard-dialog').close();
 $('discard-changes').onclick=async()=>{$('discard-dialog').close();setDirty(false);try{await action();}catch(e){status(e.message,true);}};
 $('save-continue').onclick=async()=>{if(await save()){$('discard-dialog').close();try{await action();}catch(e){status(e.message,true);}}};
}
async function create(artifact, updateCurrent=false){
 if(busy)return;busy=true;
 try {
 const existing=examples.includes(artifact)?ws.artifacts.find(x=>x.revisions.some(rev=>rev.content===artifact.content)):null;
 if(existing)return await show(existing,existing.revisions.at(-1).revision);
 const {id: exampleId, ...payload}=artifact;
 const saved=await api('artifacts',updateCurrent?{...payload,id:selected.id}:payload);
 if(updateCurrent)ws.artifacts=ws.artifacts.map(x=>x.id===saved.id?saved:x);else ws.artifacts.push(saved);
 await show(saved,saved.revisions.at(-1).revision);
 if(matchMedia('(max-width:760px)').matches)$('canvas').scrollIntoView({behavior:'auto'});
 } finally {busy=false;setDirty(dirty);}
}
function setTheme(theme){ws.theme=theme;document.documentElement.dataset.theme=theme;port?.postMessage({type:'theme',theme});themeButtons();}
function themeButtons(){
 $('themes').replaceChildren();
 for(const theme of ['graphite','light','slate','sand','forest']){
  const b=text('button',t(theme[0].toUpperCase()+theme.slice(1)));b.classList.toggle('active',ws.theme===theme);b.setAttribute('aria-pressed',String(ws.theme===theme));
  b.onclick=async()=>{try{await api('theme',{theme});setTheme(theme);}catch(e){status(e.message,true);}};$('themes').append(b);
 }
}
$('minimize-advisor').hidden=!embedded;
$('minimize-advisor').onclick=()=>sendHost({type:'advisor:minimize'});
$('settings').onclick=()=>$('settings-dialog').showModal();
$('stop').onclick=()=>stop('Preview stopped. Select a saved version to reopen it.');
$('import').onclick=()=>withDiscard(()=>{editingArtifact=false;$('import-title').textContent=t('Bring your own artifact');$('import-submit').textContent=t('Open and save analysis');$('import-form').reset();$('import-error').textContent='';$('import-dialog').showModal();});
$('close-import').onclick=()=>$('import-dialog').close();
$('import-form').onsubmit=async event=>{
 event.preventDefault();$('import-submit').disabled=true;
 try{await create({title:$('import-name').value.trim(),format:new FormData(event.target).get('format'),content:$('import-content').value,fallback:$('import-fallback').value.trim(),state:editingArtifact?revision.state:{}},editingArtifact);$('import-dialog').close();event.target.reset();}
 catch(e){$('import-error').textContent=e.message;}finally{$('import-submit').disabled=false;}
};
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
let activeRun = null, pollTimer, pendingVoiceScenario, activeRunContext;
const voice = setupVoice({ api,
 onEnd(){if(voiceWasActive){voiceWasActive=false;flushMemory('voice-ended');}},
 onState(value){voiceToolBusy=Boolean(value.toolActive);updateActivity(handlingPrompt||Boolean(activeRun)||voiceToolBusy);overviewEffects.setVoice(value);if(value.active)voiceWasActive=true;$('voice-live-indicator').hidden=!value.active;$('advisor-shell').dataset.voiceState=value.state;$('voice-phase').textContent=({connecting:t('Connecting'),listening:t('Listening'),speaking:t('Speaking'),working:t('Working'),ending:t('Stopping')})[value.state]||'';sendHost({type:'advisor:voice',...value});},
 onCaption(value){value=formatVoiceTranscript(value);sendHost({type:'advisor:caption',text:value.length>105?value.slice(-105).replace(/^\S*\s/,''):value});},
 onLevel(level){$('advisor-shell').style.setProperty('--voice-level',level);sendHost({type:'advisor:level',level});},
 onActivity(label,tool) { if(tool)toolActivity(tool);else activity(label); },
 onError(message) { addMessage('assistant',message,{error:true}); },
 onTranscript(message) { if(message.role==='assistant')finishActivity();const existing=chats.current().messages.find(x=>x.id===message.id);if(existing){existing.text=message.text;if(message.unverified)existing.unverified=message.unverified;persistChat(chats.current().messages.find(x=>x.role==='user')?.id===message.id?{title:message.text.trim().slice(0,70)}:{});drawMessages();}else {addMessage(message.role,message.text,{id:message.id,at:message.at,voice:true,...(message.unverified?{unverified:message.unverified}:{})});} },
 context: () => ({ artifactId: selected?.id || null, revision: revision?.revision || null, state: revision?.state || {}, page:{...hostContext,language:document.documentElement.lang}, conversation:chats.context().slice(-6) }),
 async apply(action, result) {
  if(action.type==='proposal'){addMessage('assistant',result.kind==='saxo'?t('Review the SIM order. Nothing has been submitted.'):t('Review the proposed changes before saving.'),{proposal:result});return {...result,status:'pending',proposalId:result.id};}
  if(action.type==='budget-created'){sendHost({type:'advisor:data-changed',result:{budgetId:result.budgetId,entryId:result.entryId,kind:result.kind}});return result;}
  if (action.type === 'scenario') {
   const s = action.scenario;
   pendingVoiceScenario = s;
   let chartUpdated = false;
   // Compatibility with the two existing savings artifacts. New artifacts declare extraMonthly.
   const key = ['extraMonthly', 'extraContribution', 'extra'].find(k => Object.hasOwn(revision?.state || {}, k));
   if (selected && key) {
    const next = { ...revision, state: { ...revision.state, [key]: s.extra, verifiedScenario: s } };
    const temporary = { ...selected, revisions: selected.revisions.map(x => x.revision === revision.revision ? next : x) };
    await show(temporary, revision.revision); setDirty(true); chartUpdated = true;
   }
   $('verified-scenario').hidden = false;
   $('scenario-figures').textContent = `${s.extra.toLocaleString(locale())} DKK ${t('extra / month')} · ${s.available.toLocaleString(locale())} DKK ${t('left')} · ${s.monthsEarlier} ${t('months earlier')} (${s.targetDate})`;
   $('scenario-explanation').textContent = `${s.assumptions} ${chartUpdated ? t('Scenario applied to the selected visual. Unsaved until you ask to save.') : t('The selected visual has no compatible savings control; these verified figures are shown separately.')}`;
   return { ...result, chartUpdated, saved: false };
  }
  if (action.type === 'save') {
   if (!selected) throw new Error('Select or create an analysis before saving a scenario.');
   if (pendingVoiceScenario && revision.state?.verifiedScenario?.extra !== pendingVoiceScenario.extra) throw new Error('This visual cannot save that scenario. Ask for a new savings analysis first.');
   if (!dirty) return { status: 'already_saved', revision: revision.revision };
   if (!await save()) throw new Error('The revision could not be saved.');
   return { status: 'saved', revision: revision.revision, state: revision.state };
  }
  if (action.type === 'generate') {
   if (activeRun) throw new Error('An analysis is already running.');
   const request = { prompt: action.prompt, requestId: crypto.randomUUID(), visual:true };
   if (selected) { request.artifactId = selected.id; request.revision = revision.revision; request.state = revision.state; }
   activeRunContext = JSON.stringify({ id: selected?.id, state: revision?.state });
   request.history=chats.context();activeChatId=chats.current().id;
   const run = await api('advisor', request); persistChat({runId:run.id});activeRun = run.id; ws.runs ||= []; ws.runs.push(run); showRuns(); pollTimer = setTimeout(pollRun, 1000);
   return { status: 'started', message: 'The visual is being prepared in the background. We can keep talking.' };
  }
  if (action.type === 'cancel') { clearTimeout(pollTimer); activeRun = null; ws = await api('workspace'); showRuns(); return result; }
 }
});
function showRuns() {
 sendHost({type:'advisor:working',working:handlingPrompt || Boolean(activeRun)});
 overviewEffects.setWorking(handlingPrompt || Boolean(activeRun));
 updateActivity(handlingPrompt || Boolean(activeRun));
 const run = ws.runs?.at(-1);
 $('ai-connection').textContent=ws.aiConfigured?'':t('AI key not configured');
 $('ai-connection').hidden=Boolean(ws.aiConfigured);
 $('ask-advisor').disabled=!ws.aiConfigured||Boolean(activeRun);
 $('follow-up').disabled=!selected||Boolean(activeRun);
 $('agent-progress').textContent=activeRun?t(run?.phase||'Preparing your analysis…'):'';if(activeRun&&run?.phase)activity(run.phase);
 $('new-chat').disabled=Boolean(activeRun)||handlingPrompt;
}
async function pollRun() {
 try {
  const latest=await api('workspace'); const run=latest.runs?.find(x=>x.id===activeRun);
  ws=latest;showRuns();
  if(!run||run.status==='running'){pollTimer=setTimeout(pollRun,2000);return;}
  activeRun=null;showRuns();
  if(run.status==='completed') {
   const item=ws.artifacts.find(x=>x.id===run.artifactId);
   const sameInputs = activeRunContext === JSON.stringify({ id: selected?.id, state: revision?.state });
   if (sameInputs) await show(item,run.revision); else await withDiscard(()=>show(item,run.revision));
   $('follow-up').checked=true;
   if(!chats.current().messages.some(x=>x.runId===run.id)){addMessage('assistant',item.revisions.find(x=>x.revision===run.revision).fallback,{runId:run.id,artifact:{id:item.id,revision:run.revision}});}
   persistChat({runId:null});$('agent-progress').textContent='';activity('Analysis ready','done');
   voice.notify(dirty ? 'Your new analysis is ready. There are newer unsaved changes on screen; choose which version to keep.' : 'Your new analysis is ready on the canvas. ' + item.revisions.at(-1).fallback.slice(0, 800));
  } else {
   const message=run.error||'The analysis did not complete. Please try again.';
   if(!chats.current().messages.some(x=>x.runId===run.id)) {
    addMessage('assistant',message,{error:true,runId:run.id});
    voice.notify('The background analysis failed. No new visual is available. Tell the user briefly in their language that the analysis could not complete and they can ask to try again. Do not retry automatically or claim success.');
   }
   persistChat({runId:null});status('');
  }
 }catch(e){$('agent-progress').textContent=t('Connection interrupted. Checking the existing run…');pollTimer=setTimeout(pollRun,4000);}
}
$('prompt-form').onsubmit=event=>{
 event.preventDefault();if(activeRun||handlingPrompt)return;
 withDiscard(async()=>{
  const button=$('ask-advisor');button.disabled=true;handlingPrompt=true;overviewEffects.setWorking(true);$('new-chat').disabled=true;sendHost({type:'advisor:working',working:true});
  try {
   const prompt=$('advisor-prompt').value.trim();if(!prompt)return;
   const prior=chats.context();addMessage('user',prompt);activity('Reading Banking data and checking your request');voice.noteText(prompt);activeChatId=chats.current().id;
   const pending=chats.current().pendingRequest;
   const retry=pending?.prompt===prompt;
   const request=retry ? pending : {prompt,requestId:crypto.randomUUID(),history:prior};
   if(!retry && $('follow-up').checked&&selected){request.artifactId=selected.id;request.revision=revision.revision;}
   persistChat({pendingRequest:request});
   activeRunContext=JSON.stringify({id:selected?.id,state:revision?.state});
   const run=await api('advisor',request);persistChat({pendingRequest:null});if(run.status==='answered'){toolActivity(run.tool);addMessage('assistant',t(run.answer),{...(run.proposal?{proposal:run.proposal}:{}),...(run.sources?{sources:run.sources}:{}),...(run.unverifiedFigures?.length?{unverified:run.unverifiedFigures}:{})});persistChat({draft:''});$('advisor-prompt').value='';resizeComposer();if(run.budgetChanged)sendHost({type:'advisor:data-changed',result:{budgetId:run.result.budgetId,entryId:run.result.entryId,kind:run.result.kind}});voice.notify(run.answer);return;}persistChat({runId:run.id,draft:''});activeRun=run.id;ws.runs||=[];ws.runs.push(run);showRuns();
   $('advisor-prompt').value='';resizeComposer();pollTimer=setTimeout(pollRun,1000);
  }catch(e){addMessage('assistant',e.message,{error:true});$('agent-progress').textContent='';status(e.message,true);button.disabled=false;activity(e.message,'failed');}finally{handlingPrompt=false;showRuns();}
 });
};
try{
 ws=await api('workspace');if(embedded){chats=conversationStore(localStorage,'banking.advisor.chats.'+ws.scope);if(!chats.current())chats.create();}setTheme(embedded && ['light','graphite','slate','sand','forest'].includes(hostTheme)?hostTheme:ws.theme);sendHost({type:'advisor:ready'});
 $('first-example').onclick=()=>{$('advisor-prompt').focus();};lists();
 for(const chat of chats.chats)for(const message of chat.messages)memoryBaseline.set(message.id,message.text);captureReady=true;
 drawMessages();$('advisor-prompt').value=chats.current().draft||'';resizeComposer();voice.reset(chats.context());
 const choice=chats.current().artifact, latest=ws.artifacts.find(x=>x.id===choice?.id);
 if(latest&&latest.revisions.some(x=>x.revision===choice.revision))await show(latest,choice.revision);
 activeRun=ws.runs?.find(x=>x.status==='running')?.id || ws.runs?.find(x=>x.id===chats.current().runId)?.id;
 if(activeRun){const owner=chats.chats.find(x=>x.runId===activeRun);if(owner)chats.select(owner.id);drawMessages();activeRunContext=JSON.stringify({id:selected?.id,state:revision?.state});pollRun();}
 showRuns();
}catch(e){status(e.message,true);}

// Size only the floating content, not an entire empty panel. Parent owns viewport clamping.
if(embedded && document.documentElement.dataset.floating){
 let sizingFrame=0,lastSize='';
 const reportSize=()=>{cancelAnimationFrame(sizingFrame);sizingFrame=requestAnimationFrame(()=>{
  const content=$('conversation-scroll');
  const natural=[...content.children].filter(el=>!el.hidden&&getComputedStyle(el).display!=='none'&&el.getBoundingClientRect().height>0).reduce((sum,el)=>sum+el.getBoundingClientRect().height+12,0);
  const drawerOpen=!$('chat-sidebar').hidden;
  const footer=document.querySelector('.composer-footer'),height=Math.max(drawerOpen?480:155,Math.min(570,natural+footer.offsetHeight+14));
  const grip=document.querySelector('.composer-grip-space').getBoundingClientRect(),composer=document.querySelector('.composer').getBoundingClientRect();
  $('chat-sidebar').style.setProperty('--drawer-bottom',Math.max(0,innerHeight-composer.top+8)+'px');
  const size={type:'advisor:size',height,drawerOpen,resizeLeft:composer.left,resizeBottom:innerHeight-composer.bottom,resizeHeight:composer.height,footerHeight:footer.offsetHeight,dragBottom:Math.round(innerHeight-grip.bottom),dragRight:Math.round(innerWidth-grip.right)};
  const key=JSON.stringify(size);if(key!==lastSize){lastSize=key;sendHost(size);}
 });};
 const observer=new ResizeObserver(reportSize);
 for(const el of [$('messages'),$('canvas'),$('advisor-activity'),document.querySelector('.composer-footer'),$('chat-sidebar')])observer.observe(el);
 new MutationObserver(reportSize).observe($('advisor-shell'),{attributes:true,childList:true,subtree:true,attributeFilter:['hidden','class']});
 window.addEventListener('resize',reportSize);reportSize();
}
