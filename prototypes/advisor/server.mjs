import {readAppData,proposeAppChange,applyAppChange} from './app-tools.mjs';
import {prepareSaxoOrder,submitSaxoOrder,verifySaxoOrder} from './saxo-tools.mjs';
import http from 'node:http';
import { evidenceValues, ungroundedAmounts } from './public/voice-transcript.js';
import { bankingScope, readBankingContext, readBankingTransactions, createBankingBudgetEntry, saveBankingBudget, readBudgetSuggestions, readBankingReview, applyBankingReview } from './banking-context.mjs';
import { readFile, writeFile, mkdir, rename, readdir } from 'node:fs/promises';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createAgentClient } from './agent.mjs';
import { createVoiceClient, voiceSessions, calculateScenario } from './voice.mjs';
import { calculateBankingScenario, previousPeriod, compareFinancials } from './financial-tools.mjs';
import { reserveUsage, usageView } from './usage.mjs';
import { proposeBudget, proposalView, proposeReview } from './proposals.mjs';
import { memoryScope as localMemoryScope, memoryView, savePreference, deletePreference, positionMemory } from './memory.mjs';
import { libraryScope as localLibraryScope, mergeLibrary, librarySummary, dataSnapshot, analysisSuggestions } from './library.mjs';
import {captureView,configureCapture,queueCapture,claimCapture,completeCapture,failCapture,retryCapture,memoryIdleMs} from './memory-capture.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
export const themes = ['graphite', 'light', 'slate', 'sand', 'forest'];
export const demo = Object.freeze({
  source: 'Synthetic prototype fixture; not your bank data', asOf: '2026-09-12', currency: 'DKK',
  income: 54000, expenses: 32700, savings: 9300, available: 12000,
  goal: { name: 'Summer house', balance: 180000, target: 400000, monthly: 5000 },
  categories: [{ name: 'Home', amount: 14800 }, { name: 'Food & household', amount: 8200 },
    { name: 'Family & transport', amount: 6200 }, { name: 'Other', amount: 3500 }]
});

function invalid(message, status = 400) { return Object.assign(new Error(message), { status }); }
export function validateArtifact(input) {
  if (!input || typeof input !== 'object' || !['html', 'markdown'].includes(input.format)) throw invalid('Choose HTML or Markdown.');
  for (const [field, max] of [['title', 100], ['content', 100000], ['fallback', 2000]]) {
    if (typeof input[field] !== 'string' || !input[field].trim() || input[field].length > max) throw invalid(`${field} must contain 1–${max} characters.`);
  }
  const state = input.state ?? {};
  if (!state || Array.isArray(state) || typeof state !== 'object' || JSON.stringify(state).length > 8000) throw invalid('Artifact state is too large or invalid.');
  return { title: input.title, format: input.format, content: input.content, fallback: input.fallback, state };
}
export function validateHistory(history = []) {
  if (!Array.isArray(history) || history.length > 16) throw invalid('Conversation history is too large.');
  return history.map(message => {
    if (!message || !['user', 'assistant'].includes(message.role) || typeof message.text !== 'string' || message.text.length > 2000) throw invalid('Conversation history is invalid.');
    return { role: message.role, text: message.text };
  });
}
const escape = value => String(value).replace(/[&<>"']/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[x]));

// Intentionally small Markdown subset. Raw HTML is displayed as text; no HTML sanitizer dependency.
export function markdown(text) {
  let code = false;
  const inline = line => escape(line).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  let result = '';
  for (const line of text.split('\n')) {
    if (line.startsWith('```')) { result += code ? '</code></pre>' : '<pre><code>'; code = !code; continue; }
    if (code) { result += escape(line) + '\n'; continue; }
    const heading = /^(#{1,3}) (.*)$/.exec(line);
    result += heading ? `<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`
      : /^[-*] /.test(line) ? `<p class="md-item">• ${inline(line.slice(2))}</p>`
      : line.startsWith('> ') ? `<blockquote>${inline(line.slice(2))}</blockquote>`
      : line.trim() ? `<p>${inline(line)}</p>` : '';
  }
  return `<article class="markdown">${result}${code ? '</code></pre>' : ''}</article>`;
}

async function body(req, maximum = 160000) {
  let text = '';
  req.setEncoding('utf8');
  for await (const part of req) { text += part; if (Buffer.byteLength(text) > maximum) throw invalid('This request is too large.', 413); }
  try { return JSON.parse(text); } catch { throw invalid('Invalid JSON.'); }
}

export async function startPrototype({ port = 5450, renderPort = 5451, storageRoot = path.join(process.env.LOCALAPPDATA || root, 'Banking', 'AdvisorPrototype'), agentRunner = createAgentClient().run, agentRecovery = createAgentClient().recover, voiceClient = createVoiceClient(), aiConfigured = Boolean(process.env.OPENAI_API_KEY), goalReader = readBankingContext, budgetWriter = createBankingBudgetEntry, transactionReader = readBankingTransactions, budgetSaver=saveBankingBudget, suggestionReader=readBudgetSuggestions, reviewReader=readBankingReview, reviewWriter=applyBankingReview, appReader=readAppData, appProposer=proposeAppChange, appWriter=applyAppChange, orderPreparer=prepareSaxoOrder, orderSubmitter=submitSaxoOrder, orderVerifier=verifySaxoOrder, captureIdleMs=memoryIdleMs,capturePollMs=15000 } = {}) {
  const cloudOrigin = process.env.BANKING_PUBLIC_ORIGIN;
  if (cloudOrigin && (!/^https:\/\/[a-z0-9.-]+$/.test(cloudOrigin))) throw new Error('Invalid advisor public origin.');
  const origin = `http://127.0.0.1:${port}`, renderer = cloudOrigin ? '/advisor-render' : `http://127.0.0.1:${renderPort}`;
  const embedOrigin = cloudOrigin || 'https://localhost:5443';
  const frameAncestors = cloudOrigin ? `'self' ${embedOrigin}` : `'self' ${origin} ${embedOrigin}`;
  const requestScope = new AsyncLocalStorage();
  const scoped = (kind,mode) => { const identity=requestScope.getStore(); if(!identity)throw invalid('Workspace authorization is required.',401); return createHash('sha256').update('banking-cloud-'+kind+'\0'+identity+'\0'+mode).digest('hex'); };
  const memoryScope = mode => cloudOrigin ? scoped('memory',mode) : localMemoryScope(mode);
  const libraryScope = mode => cloudOrigin ? scoped('library',mode) : localLibraryScope(mode);
  const renders = new Map(), locks = new Map();
  const jobs = new Map(); const memorySuggestions = new Map();const captureJobs=new Map();let closing=false;
  const jobControllers = new Map(), voices = voiceSessions(voiceClient);
  await mkdir(storageRoot, { recursive: true });
  const token = () => randomBytes(32).toString('hex');
  const assetRoot = process.env.BANKING_ASSET_ROOT || path.join(root, '../../src/Banking.Api/wwwroot');
  const styles = (await readFile(path.join(assetRoot, 'styles.css'), 'utf8')).split(/\r?\n/).slice(0, 5).join('\n');
  const kit = styles + '\n' + await readFile(path.join(root, 'public/artifact.css'), 'utf8');
  const bridgeOrigin = cloudOrigin ? 'new URL(location.href).origin' : JSON.stringify([origin, embedOrigin]);
  const bridge = (await readFile(path.join(root, 'public/bridge.js'), 'utf8')).replace('__HOST_ORIGIN__', bridgeOrigin);
  const send = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
  function headers(res) { res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer'); }
  async function workspace(sid) {
    try { return JSON.parse(await readFile(path.join(storageRoot, sid + '.json'), 'utf8')); }
    catch (e) { if (e.code !== 'ENOENT') throw e; return { artifacts: [], theme: 'graphite' }; }
  }
  async function mutate(sid, fn) {
    const previous = locks.get(sid) || Promise.resolve();
    const operation = previous.catch(() => {}).then(async () => {
      const current = await workspace(sid); const result = fn(current);
      const temporary = path.join(storageRoot, sid + '.tmp');
      await writeFile(temporary, JSON.stringify(current), { mode: 0o600 });
      // Windows readers/antivirus may briefly hold the target open. Retry only the atomic disk commit, never the provider call.
      for(let attempt=0;;attempt++){try{await rename(temporary,path.join(storageRoot,sid+'.json'));break;}catch(error){if(!['EPERM','EACCES','EBUSY'].includes(error.code)||attempt>=5)throw error;await new Promise(resolve=>setTimeout(resolve,20*(attempt+1)));}}return result;
    });
    locks.set(sid, operation);
    try { return await operation; } finally { if (locks.get(sid) === operation) locks.delete(sid); }
  }
  async function processCapture(scope){
    if(closing||!aiConfigured||captureJobs.has(scope))return;
    const work=(async()=>{
      const pending=(await workspace(scope)).memoryCapture;if(!pending?.enabled||!pending.jobs.some(j=>j.status==='pending'&&j.dueAt<=Date.now()&&(!j.busy||j.busyUntil<=Date.now())))return;
      const job=await mutate(scope,ws=>claimCapture(ws));if(!job)return;
      try{
        await mutate('_usage',ws=>reserveUsage(ws,'memory',scope+':'+job.id));
        const existing=(await workspace(scope)).preferences||[];
        const candidates=await voiceClient.extractMemories({messages:job.messages,existing,signal:AbortSignal.timeout(45000)});
        await mutate(scope,ws=>completeCapture(ws,job,candidates));
      }catch(e){await mutate(scope,ws=>failCapture(ws,job.id,e.status?e.message:'Automatic memory could not finish. Retry from Memory.'));}
    })();captureJobs.set(scope,work);
    try{await work;}finally{captureJobs.delete(scope);}
  }
  // Pending inputs survive app restarts; an uncertain provider attempt is never replayed.
  const captureScopes = async()=>cloudOrigin ? (await readdir(storageRoot)).filter(x=>/^[a-f0-9]{64}\.json$/.test(x)).map(x=>x.slice(0,-5)) : ['Demo','Live'].map(memoryScope);
  for(const scope of await captureScopes()){if((await workspace(scope)).memoryCapture)await mutate(scope,ws=>{for(const j of ws.memoryCapture.jobs)if(j.status==='processing')failCapture(ws,j.id,'Processing was interrupted. Review and retry from Memory.');});}
  const captureTimer=setInterval(()=>{captureScopes().then(scopes=>Promise.all(scopes.map(processCapture))).catch(()=>console.error('Automatic memory storage unavailable.'));},capturePollMs);captureTimer.unref();
  const applying=new Set();
  async function applyProposal(sid,session,mode,id,orderConfirmed=false){
    const p=(await workspace(sid)).proposals?.find(p=>p.id===id);
    if(!p)throw invalid('Proposal not found in this workspace.',404);
    if(p.kind==='saxo'&&!orderConfirmed)throw invalid('Review the Saxo order card and press Confirm SIM order to submit. Voice cannot bypass this confirmation.');
    if(p.status==='applied')return p.result;
    if(p.status!=='pending'||applying.has(id))throw invalid('This proposal is no longer pending or is already being saved.',409);
    applying.add(id);
    try{
      if(p.kind==='saxo'){
        await mutate(sid,ws=>{ws.proposals.find(x=>x.id===id).status='checking';});
        const result=await orderSubmitter(session,mode,p.payload);
        await mutate(sid,ws=>{const target=ws.proposals.find(x=>x.id===id);target.status='applied';target.result=result;});
        return result;
      }
      if(p.kind==='app'){
        await mutate(sid,ws=>{ws.proposals.find(x=>x.id===id).status='checking';});
        const saved=await appWriter(session,mode,p.payload);
        const result={status:'updated',kind:p.resource,record:saved};
        await mutate(sid,ws=>{const target=ws.proposals.find(x=>x.id===id);target.status='applied';target.result=result;});return result;
      }
      if(p.kind==='review'){
        // Review writes have signed version checks but no request ID. An uncertain
        // outcome must be reconciled in Review history, never automatically replayed.
        await mutate(sid,ws=>{ws.proposals.find(x=>x.id===id).status='checking';});
        const saved=await reviewWriter(session,mode,p.payload);
        if(!saved.id||!saved.version)throw invalid('Review completion could not be confirmed. Check Review history.',502);
        const result={status:'updated',kind:'review',actionId:saved.id,version:saved.version};
        await mutate(sid,ws=>{const target=ws.proposals.find(x=>x.id===id);target.status='applied';target.result=result;});return result;
      }
      const saved=await budgetSaver(session,mode,p.payload);
      if(saved.id!==p.payload.id)throw invalid('The budget save was not confirmed.',502);
      const result={status:'updated',budgetId:saved.id,budget:saved};
      await mutate(sid,ws=>{const target=ws.proposals.find(x=>x.id===id);target.status='applied';target.result=result;});
      return result;
    }finally{applying.delete(id);}
  }
  async function archiveWorkspace(sid,mode){const current=await workspace(sid);return mutate(libraryScope(mode),state=>mergeLibrary(state,current.artifacts));}
  async function recoverRuns(sid){
    const ws=await workspace(sid);
    for(const run of (ws.runs||[]).filter(x=>x.status==='running'&&!jobs.has(x.id))){
      jobs.set(run.id,true);
      const progress=change=>mutate(sid,data=>Object.assign(data.runs.find(x=>x.id===run.id),change));
      try{
        const latest=(await workspace(sid)).runs?.find(x=>x.id===run.id);
        if(!latest||latest.status!=='running')continue;
        const result=await agentRecovery({...latest,onProgress:progress});
        if(!result)continue;
        const artifact=validateArtifact(result.output);
        await mutate(sid,data=>{
          const stored=data.runs.find(x=>x.id===run.id);if(stored.status!=='running')return;
          let item=data.artifacts.find(x=>x.id===run.artifactId);
          if(!item){item={id:token(),revisions:[]};data.artifacts.push(item);}
          item.revisions.push({...artifact,revision:item.revisions.length+1,createdAt:new Date().toISOString(),source:'openai-agents',sessionId:result.sessionId,turnId:result.turnId,prompt:run.prompt,snapshot:run.snapshot});
          Object.assign(stored,{status:'completed',phase:'Recovered saved analysis',artifactId:item.id,revision:item.revisions.length,completedAt:new Date().toISOString()});delete stored.downloadedOutput;
        });
        if(run.bankingMode)await archiveWorkspace(sid,run.bankingMode);
      }catch(error){await progress({status:'failed',phase:'Recovery unavailable',error:error.safe?error.message:'The interrupted analysis could not be recovered. No prompt was resubmitted.'});}
      finally{jobs.delete(run.id);}
    }
  }
  // Financial answers are drafted by a model; every amount must trace to the supplied records.
  // One corrective retry, then any remaining unmatched figures are reported rather than hidden.
  async function verifiedSummary({transcript,context,signal}){
    const evidence=evidenceValues(context,transcript.filter(x=>x.role==='user').map(x=>x.text));
    let answer=await voiceClient.summarizeGoals({transcript,context,signal});
    let unverified=typeof answer==='string'?ungroundedAmounts(answer,evidence):[];
    if(unverified.length){
      answer=await voiceClient.summarizeGoals({transcript,context:{...context,figureCheck:`Your previous draft stated ${unverified.join(', ')}, which do not appear in these records. Answer again using only figures present in the records, or say that the figure is unavailable.`},signal});
      unverified=typeof answer==='string'?ungroundedAmounts(answer,evidence):[];
    }
    return {answer,unverifiedFigures:unverified};
  }
  async function bankingTool({sid, session, mode, context, tool, transcript, requestId, signal}) {
    let result = context;
    let sources;
    if(tool.name==='prepare_saxo_order'){
      let args;try{args=JSON.parse(tool.args.orderJson);}catch{throw invalid('Invalid order details.');}
      const existing=(await workspace(sid)).proposals?.find(p=>p.requestId===requestId);
      let p=existing||await orderPreparer(session,mode,args,requestId);
      if(!existing)p=await mutate(sid,ws=>{ws.proposals||=[];const prior=ws.proposals.find(x=>x.requestId===requestId);if(prior)return prior;if(ws.proposals.length>=100)throw invalid('Proposal limit reached.');for(const old of ws.proposals)if(old.kind==='saxo'&&old.status==='pending')old.status='superseded';ws.proposals.push(p);return p;});
      return {answer:'Saxo has checked the order. Review all details and press Confirm SIM order on the card to place it. No order has been submitted.',tool:tool.name,proposal:proposalView(p),result:proposalView(p)};
    }
    if(tool.name==='propose_app_change'){
      let fields;try{fields=JSON.parse(tool.args.fieldsJson);}catch{throw invalid('Invalid proposed fields.');}
      const existing=(await workspace(sid)).proposals?.find(p=>p.requestId===requestId);
      let p=existing||await appProposer(session,mode,{...tool.args,fields},requestId);
      if(!existing)p=await mutate(sid,ws=>{ws.proposals||=[];const prior=ws.proposals.find(x=>x.requestId===requestId);if(prior)return prior;if(ws.proposals.length>=100)throw invalid('Proposal limit reached.');ws.proposals.push(p);return p;});
      return {answer:'Review these changes before applying them. Nothing has been changed.',tool:tool.name,proposal:proposalView(p),result:proposalView(p)};
    }
    if(tool.name==='read_app_data'){
      const researchResults=[],seen=new Set();let next=tool;
      for(let round=0;round<3&&next.name==='read_app_data';round++){
        if(!Array.isArray(next.args.queries)||next.args.queries.length<1||next.args.queries.length>4)throw invalid('Use one to four data queries.');
        for(const query of next.args.queries){
          const key=JSON.stringify(query);if(seen.has(key)||seen.size>=8)continue;seen.add(key);
          try{const parameters=JSON.parse(query.parametersJson);if(!parameters||Array.isArray(parameters)||typeof parameters!=='object')throw invalid('Invalid query parameters.');researchResults.push({resource:query.resource,parameters,data:await appReader(session,mode,{resource:query.resource,parameters},context)});}
          catch(error){researchResults.push({resource:query.resource,error:error.status?error.message:'This data source is unavailable.'});}
        }
        if(round===2||seen.size>=8)break;
        next=await voiceClient.route({transcript,context:{demo:context,readOnlyResearch:true,stageRequestedEdit:tool.args.stageRequestedEdit===true,researchResults},signal});
      }
      // Saxo preparation is a read/precheck, never submission. It may follow a
      // lookup even when the edit flag is false (e.g. "prepare, do not submit").
      if(next.name==='prepare_saxo_order'||tool.args.stageRequestedEdit===true&&next.name==='propose_app_change')return bankingTool({sid,session,mode,context,tool:next,transcript,requestId,signal});
      const result={source:'Banking',mode,screen:context.screen,researchResults};
      return {...await verifiedSummary({transcript,context:result,signal}),tool:tool.name,result};
    }
    if (tool.name === 'clarify') {
      const question=typeof tool.args.question==='string'?tool.args.question.trim():'';
      if(question)return {answer:question,tool:tool.name};
      // An empty clarification means the router has enough context to answer.
      // Never forward an empty result to the voice model as financial evidence.
      const verified=await verifiedSummary({transcript,context,signal});
      if(typeof verified.answer!=='string'||!verified.answer.trim())throw invalid('No verified answer was returned. Please try again.',502);
      return {...verified,tool:'read_banking_data',result:context};
    }
    if(tool.name==='remember_preference'){
      const result=await mutate(memoryScope(mode),ws=>savePreference(ws,{text:tool.args.text},{origin:'AI',status:'confirmed',source:'Advisor recorded your explicit request to remember this priority'}));
      return {answer:'Remembered priority: '+result.text+'. You can edit or remove it in chat history under Remembered priorities.',tool:tool.name,result};
    }
    if(tool.name==='forget_preference'){
      const result=await mutate(memoryScope(mode),ws=>deletePreference(ws,tool.args.id));
      return {answer:'That priority has been removed from advisor memory.',tool:tool.name,result};
    }
    if(tool.name==='propose_budget_entries'||tool.name==='propose_review'){
      const p=await mutate(sid,ws=>{
        ws.proposals||=[];const prior=ws.proposals.find(p=>p.requestId===requestId);if(prior)return prior;
        if(ws.proposals.length>=100)throw invalid('This workspace reached its saved proposal limit.',429);
        const proposal=tool.name==='propose_review'?proposeReview(context,tool.args,requestId):proposeBudget(context,tool.args,requestId);ws.proposals.push(proposal);return proposal;
      });
      return {answer:'Proposal ready. Review the changes below before applying them; no records have changed.',tool:tool.name,proposal:proposalView(p),result:proposalView(p)};
    }
    if(tool.name==='confirm_proposal'){
      const result=await applyProposal(sid,session,mode,tool.args.proposalId);
      return {answer:'The reviewed changes have been saved.',tool:tool.name,result,budgetChanged:true};
    }
    if(tool.name==='read_budget_suggestions')result={source:'Banking',mode,suggestions:await suggestionReader(session,mode,tool.args.currency),savedBudgets:context.budgets,definitions:'Transaction-derived suggestions are estimates. Compare saved entries and category mappings to identify missing recurring expenses; never silently replace a budget. Use propose_budget_entries only when the user asks for a proposal.'};
    if(tool.name==='read_review'){
      if(!['All','Category','Transfer'].includes(tool.args.kind)||!Number.isInteger(tool.args.offset)||tool.args.offset<0||tool.args.offset>50000)throw invalid('Choose a valid Review page.');
      const queue=await reviewReader(session,mode,tool.args.kind,tool.args.offset);await mutate(sid,ws=>{ws.reviewQueue=queue;});
      result={source:'Banking',mode,queue,categories:context.categories,definitions:'Only these pending candidates are shown. Evidence is a suggestion, not approval. Preserve existing manual categories. Use propose_review to stage one selected category, matching rule or internal-transfer classification. This never initiates a bank transfer.'};
    }
    if(tool.name==='explain_deviations'){
      const previous=previousPeriod(context.from,context.to);
      const baseline=await goalReader(session,mode,{...previous,currency:context.currency});
      result=compareFinancials(context,baseline);
      result.evidence={current:await transactionReader(session,mode,{from:context.from,to:context.to,currency:context.currency,offset:0}),previous:await transactionReader(session,mode,{...previous,currency:context.currency,offset:0})};
      sources=[{label:'Selected-period transactions',from:context.from,to:context.to,currency:context.currency},{label:'Previous-period transactions',...previous,currency:context.currency}];
    }
    if (tool.name === 'create_budget_entry') {
      const plan = context.budgets?.plans.find(x => x.id === tool.args.budgetId);
      if (!plan) throw invalid('Choose an existing budget before adding an entry.');
      const args = tool.args;
      if (!args.name?.trim() || args.name.length > 120 || !Number.isFinite(args.amount) || args.amount < 0 || ![1,3,6,12].includes(args.intervalMonths) || !['Income','Expense','Savings'].includes(args.type)) throw invalid('The budget entry is incomplete or invalid.');
      if (args.categoryId && !context.categories?.some(x=>x.id===args.categoryId)) throw invalid('The category does not exist in this workspace.');
      if (args.savingsAccountId && !context.accounts?.some(x=>x.id===args.savingsAccountId)) throw invalid('The savings account does not exist in this workspace.');
      // Reserve the exact operation before the write. Retrying the same request
      // reuses its payload and entry ID, including after a lost response/restart.
      const operation = await mutate(sid, ws => {
        ws.budgetOperations ||= [];
        const prior = ws.budgetOperations.find(x=>x.requestId===requestId);
        if (prior) { if(JSON.stringify(prior.args)!==JSON.stringify(args))throw invalid('This request identity was already used.',409);return prior; }
        if(ws.budgetOperations.length>=500)throw invalid('This workspace reached its saved action limit.',429);
        const entry={requestId,version:plan.version,name:args.name,type:args.type,amount:args.amount,intervalMonths:args.intervalMonths,categoryId:args.categoryId,savingsAccountId:args.savingsAccountId};
        const item={requestId,args,entry};ws.budgetOperations.push(item);return item;
      });
      result = operation.result || await budgetWriter(session,mode,args.budgetId,operation.entry);
      if (result.status !== 'created') throw invalid('The budget entry was not confirmed.',502);
      await mutate(sid,ws=>{ws.budgetOperations.find(x=>x.requestId===requestId).result=result;});
      // Creation must remain visibly confirmed even if a later provider call fails.
      return { answer:`Created ${args.type} budget entry “${args.name}” in “${plan.name}”: ${args.amount} ${plan.currency} every ${args.intervalMonths} month(s), equivalent to ${Number(args.amount)/Number(args.intervalMonths)} ${plan.currency} per month.`, tool:tool.name, result, budgetChanged:true };
    }
    if (tool.name === 'read_transactions') result = { source:'Banking',mode,transactions:await transactionReader(session,mode,tool.args),definitions:context.definitions };
    if (tool.name === 'calculate_banking_scenario') {
      result=calculateBankingScenario(context,tool.args);
      await mutate(sid,ws=>{ws.latestScenario=result;});
    }
    return {...await verifiedSummary({transcript,context:result,signal}),tool:tool.name,result,sources};
  }
  const app = http.createServer((req, res) => requestScope.run(req.headers['x-banking-scope'], async () => {
    headers(res);
    // The authenticated Banking proxy also serves the composer through private
    // preview tunnels. 'self' follows that browser origin without trusting other sites.
    res.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; media-src 'self' blob:; connect-src 'self'; frame-src ${cloudOrigin ? "'self'" : renderer}; base-uri 'none'; object-src 'none'; form-action 'none'; frame-ancestors ${frameAncestors}`);
    try {
      if (req.headers.host !== `127.0.0.1:${port}`) throw invalid('Invalid host.', 403);
      const url = new URL(req.url, origin);
      if (url.pathname === '/') res.setHeader('Set-Cookie', 'banking_advisor_demo=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
      if (req.headers.origin && ![origin, embedOrigin].includes(req.headers.origin)) throw invalid('Invalid origin.', 403);
      let sid = /(?:^|; )banking_advisor_demo=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
      if (!sid) {
        if (url.pathname === '/api/workspace' && req.method === 'GET') {
          sid = token(); res.setHeader('Set-Cookie', `banking_advisor_demo=${sid}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=2592000`);
        } else if (url.pathname.startsWith('/api/')) throw invalid('Open the prototype first.', 401);
      }
      const bankingSession = req.headers['x-banking-session'];
      const bankingMode = req.headers['x-banking-mode'] || 'Demo';
      if(cloudOrigin && url.pathname.startsWith('/api/') && (!bankingSession || !/^(owner-live|[a-f0-9]{64})$/.test(req.headers['x-banking-scope']||'')))throw invalid('Authenticated Banking workspace required.',401);
      if (bankingSession) sid = bankingScope(bankingSession, bankingMode);
      const financialContext = () => bankingSession ? goalReader(bankingSession, bankingMode, {from:req.headers['x-banking-from'],to:req.headers['x-banking-to'],currency:req.headers['x-banking-currency']}) : Promise.resolve(demo);
      if (url.pathname === '/api/context' && req.method === 'GET') return send(res, 200, await financialContext());
      if (url.pathname === '/api/workspace' && req.method === 'GET') { await recoverRuns(sid); return send(res, 200, { ...await workspace(sid), demo: bankingSession ? { source: 'Banking', mode: bankingMode } : demo, scope: bankingSession ? sid : 'prototype', renderer, aiConfigured }); }
      if (req.method === 'POST' && ![origin, embedOrigin].includes(req.headers.origin)) throw invalid('Invalid origin.', 403);
      if (req.method === 'POST' && !req.headers['content-type']?.startsWith('application/json')) throw invalid('JSON is required.', 415);
      if(url.pathname==='/api/usage'&&req.method==='GET')return send(res,200,usageView(await workspace('_usage')));
      if(url.pathname.startsWith('/api/library')){
        if(!bankingSession)throw invalid('Sign into Banking to open your analysis library.',401);
        const context=await financialContext();if(context.source!=='Banking'||context.mode!==bankingMode)throw invalid('Workspace authorization failed.',401);
        context.rememberedPreferences=((await workspace(memoryScope(bankingMode))).preferences||[]).filter(x=>x.status!=='suggested');
        await recoverRuns(sid);const items=await archiveWorkspace(sid,bankingMode);
        if(url.pathname==='/api/library'&&req.method==='GET')return send(res,200,{items:items.map(librarySummary).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)),suggestions:analysisSuggestions(context),runs:(await workspace(sid)).runs||[]});
        if(url.pathname==='/api/library/cancel'&&req.method==='POST'){
          const input=await body(req);const result=await mutate(sid,ws=>{const run=ws.runs?.find(x=>x.id===input.id);if(!run)throw invalid('Run not found.',404);if(run.status==='running'){jobControllers.get(run.id)?.abort();run.status='cancelled';run.phase='Analysis cancelled';}return {status:run.status};});return send(res,200,result);
        }
        if(url.pathname==='/api/library/open'&&req.method==='POST'){
          const input=await body(req),item=items.find(x=>x.id===input.id);if(!item)throw invalid('Analysis not found in this workspace.',404);
          if(input.prepare===true){if(jobs.size)throw invalid('Wait for the running analysis before refreshing.',409);await mutate(sid,ws=>{ws.artifacts=ws.artifacts.filter(x=>x.id!==item.id);ws.artifacts.push(structuredClone(item));});}
          return send(res,200,item);
        }
        throw invalid('Unknown library action.',404);
      }
      if(['/api/memory','/api/memory/save','/api/memory/delete','/api/memory/position','/api/memory/suggest','/api/memory/capture','/api/memory/settings','/api/memory/retry'].includes(url.pathname)){
        if(!bankingSession)throw invalid('Remembered priorities are available in the authenticated Banking app.',401);
        // Stable across logins for the single-owner local app, but authorize the
        // actual Banking workspace on EVERY request before accessing preferences.
        const authenticated=await financialContext();
        if(authenticated.source!=='Banking'||authenticated.mode!==bankingMode)throw invalid('Workspace authorization failed.',401);
        const scope=memoryScope(bankingMode);
        if(url.pathname==='/api/memory'&&req.method==='GET'){const data=await workspace(scope);return send(res,200,{preferences:(data.preferences||[]).map(memoryView),capture:captureView(data),usage:usageView(await workspace('_usage'))});}
        if(req.method==='POST'){
          const input=await body(req);
          if(url.pathname==='/api/memory/settings')return send(res,200,await mutate(scope,ws=>configureCapture(ws,input.enabled)));
          if(url.pathname==='/api/memory/retry')return send(res,202,await mutate(scope,ws=>retryCapture(ws,input.id)));
          if(url.pathname==='/api/memory/capture')return send(res,202,await mutate(scope,ws=>queueCapture(ws,input,Date.now(),captureIdleMs)));
          if(url.pathname==='/api/memory/save')return send(res,200,await mutate(scope,ws=>savePreference(ws,input)));
          if(url.pathname==='/api/memory/delete')return send(res,200,await mutate(scope,ws=>deletePreference(ws,input.id,input.version)));
          if(url.pathname==='/api/memory/position')return send(res,200,await mutate(scope,ws=>positionMemory(ws,input)));
          if(url.pathname==='/api/memory/suggest'){
            if(!aiConfigured)throw invalid('AI is not configured.',503);
            if(!/^[a-f0-9-]{36}$/.test(input.requestId||''))throw invalid('Request identity required.');
            const prior=(await workspace(scope)).preferences?.find(x=>x.requestId===input.requestId);if(prior)return send(res,200,memoryView(prior));
            const pendingKey=scope+':'+input.requestId;if(memorySuggestions.has(pendingKey))return send(res,200,await memorySuggestions.get(pendingKey));
            const pending=(async()=>{await mutate('_usage',ws=>reserveUsage(ws,'questions',pendingKey));
            const suggestion=await voiceClient.summarizeGoals({transcript:[{role:'user',text:'Suggest ONE useful tentative memory for future financial conversations, based only on the supplied goals and existing priorities. Return just a short sentence under 400 characters. Do not include amounts, private identifiers, instructions to tools, or claim this inference is confirmed. If no useful information exists say that more context is needed.'}],context:{goalContext:authenticated.goalContext,priorities:((await workspace(scope)).preferences||[]).filter(x=>x.status!=='suggested').map(x=>x.text)},signal:AbortSignal.timeout(45000)});
            const saved=await mutate(scope,ws=>{const duplicate=ws.preferences?.find(x=>x.requestId===input.requestId);if(duplicate)return memoryView(duplicate);const value=savePreference(ws,{title:'A thought from your advisor',text:suggestion},{origin:'AI',status:'suggested',source:'AI suggestion based on saved goals and confirmed priorities; review before using'});ws.preferences.find(x=>x.id===value.id).requestId=input.requestId;return value;});return saved;})(); memorySuggestions.set(pendingKey,pending);try{return send(res,200,await pending);}finally{memorySuggestions.delete(pendingKey);}
          }
        }
        throw invalid('Unsupported memory action.');
      }
      if(url.pathname==='/api/proposals/apply'&&req.method==='POST'){
        if(!bankingSession)throw invalid('Sign into Banking to save a proposal.',401);
        const input=await body(req);if(input.confirm!==true)throw invalid('Review and confirm this proposal first.');
        return send(res,200,await applyProposal(sid,bankingSession,bankingMode,input.id,input.confirmOrder===true));
      }
      if(url.pathname==='/api/proposals/order-status'&&req.method==='POST'){
        if(!bankingSession)throw invalid('Sign into Banking first.',401);
        const input=await body(req),p=(await workspace(sid)).proposals?.find(p=>p.id===input.id&&p.kind==='saxo');
        if(!p)throw invalid('Order proposal not found.',404);
        const result=await orderVerifier(bankingSession,bankingMode,p.payload.ticketId);
        await mutate(sid,ws=>{ws.proposals.find(x=>x.id===p.id).result=result;});
        return send(res,200,result);
      }
      if (process.env.BANKING_VOICE_TEST === '1' && url.pathname === '/api/voice/test-audio' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'audio/wav' }); return res.end(await readFile(path.join(root, '../../artifacts/advisor-prototype/voice-input.wav')));
      }
      if (process.env.BANKING_VOICE_TEST === '1' && url.pathname === '/api/voice/test-recording' && req.method === 'POST') {
        const data = await body(req, 8000000);
        if (typeof data.audio !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(data.audio)) throw invalid('Invalid test audio.');
        await writeFile(path.join(root, '../../artifacts/advisor-prototype/voice-output.webm'), Buffer.from(data.audio, 'base64'));
        return send(res, 200, { saved: true });
      }
      if (url.pathname === '/api/voice/session' && req.method === 'POST') {
        if (!aiConfigured) throw invalid('The local OpenAI key is not configured.', 503);
        await mutate('_usage',ws=>reserveUsage(ws,'voice',token()));
        return send(res, 201, await voices.start(sid, (await body(req)).sdp));
      }
      if (url.pathname === '/api/voice/end' && req.method === 'POST') {
        voices.end(sid, (await body(req)).id); return send(res, 200, { ended: true });
      }
      if (url.pathname === '/api/voice/delegate' && req.method === 'POST') {
        const data = await body(req), session = voices.get(sid, data.id);
        const context = {...await financialContext()};if(bankingSession){context.screen=data.screen||data.context?.page||null;const stored=await workspace(sid);context.latestScenario=stored.latestScenario||null;context.pendingProposals=(stored.proposals||[]).filter(p=>p.status==='pending').map(proposalView);context.reviewQueue=stored.reviewQueue||null;context.rememberedPreferences=((await workspace(memoryScope(bankingMode))).preferences||[]).filter(x=>x.status!=='suggested');context.automaticMemoryEnabled=(await workspace(memoryScope(bankingMode))).memoryCapture?.enabled!==false;}
        if (typeof data.delegationId !== 'string' || !data.delegationId || data.delegationId.length > 200) throw invalid('Invalid delegation identity.');
        if (session.calls.has(data.delegationId)) return send(res, 200, await session.calls.get(data.delegationId));
        if (session.calls.size >= 30) throw invalid('This conversation reached its 30-task limit.', 429);
        if (!Array.isArray(data.transcript) || data.transcript.length > 100 || data.transcript.some(x => !['user', 'assistant'].includes(x.role) || typeof x.text !== 'string' || x.text.length > 6000) || JSON.stringify(data.transcript).length > 24000) throw invalid('Invalid conversation context.');
        const current = await workspace(sid);
        // A duplicate can arrive while the workspace read is in flight.
        if (session.calls.has(data.delegationId)) return send(res, 200, await session.calls.get(data.delegationId));
        if (session.calls.size >= 30) throw invalid('This conversation reached its 30-task limit.', 429);
        const item = current.artifacts.find(x => x.id === data.artifactId);
        if (data.artifactId && !item) throw invalid('Analysis not found.', 404);
        const selected = item?.revisions.find(x => x.revision === data.revision);
        if (item && !selected) throw invalid('Saved version not found.', 404);
        // Context cannot supply bank data or credentials; only bounded state for an owned artifact.
        const state = selected ? validateArtifact({ ...selected, state: data.state ?? selected.state }).state : {};
        const currentExtra = state.extraMonthly ?? state.extraContribution ?? state.extra;
        const restoredScenario = !bankingSession && typeof currentExtra === 'number' && currentExtra >= 0 && currentExtra <= demo.available ? calculateScenario(demo, currentExtra) : null;
        const scenario = restoredScenario || session.scenario;
        session.controller?.abort(); const controller = new AbortController(); session.controller = controller;
        const version = ++session.version;
        const work = (async () => {
          await mutate('_usage',ws=>reserveUsage(ws,'questions',sid+':'+data.id+':'+data.delegationId));
          const tool = await voiceClient.route({ transcript: data.transcript, context: { voiceActive:true,demo: context, scenario, selected: selected ? { title: selected.title, state } : null }, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45000)]) });
          if (controller.signal.aborted || version !== session.version) throw invalid('This request was superseded.', 409);
          if(tool.name==='end_voice_session')return {delegationId:data.delegationId,tool:tool.name,callId:tool.callId,result:{status:'ending'},action:{type:'end-voice'}};
          if (bankingSession && ['prepare_saxo_order','read_app_data','propose_app_change','read_goals','read_banking_data','read_demo_context','read_transactions','create_budget_entry','calculate_banking_scenario','read_budget_suggestions','propose_budget_entries','confirm_proposal','explain_deviations','read_review','propose_review','remember_preference','forget_preference','clarify'].includes(tool.name)) {
            session.requests ||= new Map();
            if(!session.requests.has(data.delegationId))session.requests.set(data.delegationId,randomUUID());
            const reply=await bankingTool({sid,session:bankingSession,mode:bankingMode,context,tool,transcript:data.transcript,requestId:session.requests.get(data.delegationId),signal:controller.signal});
            return {delegationId:data.delegationId,tool:tool.name,callId:tool.callId,result:{...(tool.name==='read_goals'?context.goalContext:reply.result),spokenAnswer:reply.answer,unverifiedFigures:reply.unverifiedFigures||[]},action:reply.budgetChanged?{type:'budget-created'}:reply.proposal?{type:'proposal'}:null};
          }
          let result, action = null;
          if (tool.name === 'read_goals') result = context.goalContext ? { source: context.source, mode: context.mode, ...context.goalContext } : { unavailable: true, reason: 'This standalone prototype has no Banking connection.' };
          else if (tool.name === 'read_demo_context') result = bankingSession ? context : { ...demo, scenario, baselineScenario: calculateScenario(demo, 0) };
          else if (tool.name === 'calculate_scenario' && bankingSession) { result = { instruction: 'Use the actual goal plans in this context. Do not substitute the prototype scenario. For a visual what-if, request generate_analysis with the selected goal name and explicit assumptions.', ...context }; }
          else if (tool.name === 'calculate_scenario') { result = calculateScenario(demo, tool.args.extra); session.scenario = result; action = { type: 'scenario', scenario: result }; }
          else if (tool.name === 'save_scenario') { result = { status: 'pending', instruction: 'Only report saved after the UI confirms persistence.' }; action = { type: 'save' }; }
          else if (tool.name === 'generate_analysis') {
            if (typeof tool.args.prompt !== 'string' || !tool.args.prompt.trim() || tool.args.prompt.length > 4000) throw invalid('Invalid analysis prompt.');
            result = { status: 'pending', instruction: 'Only report started after the UI confirms the run.' }; action = { type: 'generate', prompt: tool.args.prompt };
          } else if (tool.name === 'cancel_analysis') {
            const cancelled = await mutate(sid, ws => {
              const run = ws.runs?.find(x => x.status === 'running');
              if (!run) return false;
              jobControllers.get(run.id)?.abort(); Object.assign(run, { status: 'cancelled', phase: 'Analysis cancelled', completedAt: new Date().toISOString() }); return true;
            });
            result = { status: cancelled ? 'cancelled' : 'no_running_analysis' }; action = { type: 'cancel' };
          } else { if (typeof tool.args.question !== 'string' || tool.args.question.length > 1000) throw invalid('Invalid clarification.'); result = { question: tool.args.question }; }
          if (bankingSession && ['read_goals', 'read_demo_context', 'calculate_scenario'].includes(tool.name)) {
            const verified = await verifiedSummary({ transcript: data.transcript, context, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45000)]) });
            result.spokenAnswer = verified.answer; result.unverifiedFigures = verified.unverifiedFigures;
            if (controller.signal.aborted || version !== session.version) throw invalid('This request was superseded.', 409);
          }
          return { delegationId: data.delegationId, tool: tool.name, callId: tool.callId, result, action };
        })();
        session.calls.set(data.delegationId, work);
        return send(res, 200, await work);
      }
      if (url.pathname === '/api/advisor' && req.method === 'POST') {
        if (!aiConfigured) throw invalid('The local OpenAI key is not configured.', 503);
        const data = await body(req);
        if (typeof data.prompt !== 'string' || !data.prompt.trim() || data.prompt.length > 4000) throw invalid('Ask a question using 1–4,000 characters.');
        const history = validateHistory(data.history);
        const context = {...await financialContext()};if(bankingSession){context.screen=data.screen||data.context?.page||null;const stored=await workspace(sid);context.latestScenario=stored.latestScenario||null;context.pendingProposals=(stored.proposals||[]).filter(p=>p.status==='pending').map(proposalView);context.reviewQueue=stored.reviewQueue||null;context.rememberedPreferences=((await workspace(memoryScope(bankingMode))).preferences||[]).filter(x=>x.status!=='suggested');context.automaticMemoryEnabled=(await workspace(memoryScope(bankingMode))).memoryCapture?.enabled!==false;}
        if (!/^[a-f0-9-]{36}$/.test(data.requestId || '')) throw invalid('A request identity is required.');
        if (bankingSession && !data.visual) {
          const transcript=[...history,{role:'user',text:data.prompt}];
          await mutate('_usage',ws=>reserveUsage(ws,'questions',sid+':'+data.requestId));
          const tool=await voiceClient.route({transcript,context:{demo:context},signal:AbortSignal.timeout(45000)});
          if (['prepare_saxo_order','read_app_data','propose_app_change','read_goals','read_banking_data','read_demo_context','read_transactions','create_budget_entry','calculate_banking_scenario','read_budget_suggestions','propose_budget_entries','confirm_proposal','explain_deviations','read_review','propose_review','remember_preference','forget_preference','clarify'].includes(tool.name)) {
            const reply=await bankingTool({sid,session:bankingSession,mode:bankingMode,context,tool,transcript,requestId:data.requestId,signal:AbortSignal.timeout(45000)});
            return send(res,200,{status:'answered',...reply});
          }
        }
        const before = await workspace(sid);
        const duplicate = before.runs?.find(x => x.requestId === data.requestId);
        if (duplicate) return send(res, 200, duplicate);
        if (jobs.size) throw invalid('An analysis is already running. Please wait for it to finish.', 409);
        if ((before.runs || []).some(x => x.status === 'running')) throw invalid('A previous run was interrupted. Its saved session must be checked before submitting again.', 409);
        let previous;
        if (data.artifactId) {
          const item = before.artifacts.find(x => x.id === data.artifactId);
          if (!item) throw invalid('Analysis not found in this workspace.', 404);
          if (item.revisions.length >= 30) throw invalid('This analysis reached the prototype revision limit.', 409);
          previous = item.revisions.find(x => x.revision === data.revision);
          if (!previous) throw invalid('Select a saved version first.', 400);
          if (data.state !== undefined) previous = { ...previous, state: validateArtifact({ ...previous, state: data.state }).state };
        } else if (before.artifacts.length >= 12) throw invalid('This workspace reached the 12-analysis prototype limit.', 409);
        if ((before.runs || []).length >= 10) throw invalid('This workspace reached its 10-prompt prototype limit.', 429);
        const run = { id: token(), requestId: data.requestId, prompt: data.prompt.trim(), status: 'running', phase: 'Starting the hosted agent', artifactId: data.artifactId || null, createdAt: new Date().toISOString(),snapshot:dataSnapshot(context),bankingMode:bankingSession?bankingMode:null };
        // Reserve the global slot before any awaited persistence to prevent simultaneous paid runs.
        jobs.set(run.id, true);
        const jobController = new AbortController(); jobControllers.set(run.id, jobController);
        try { await mutate('_usage',ws=>reserveUsage(ws,'analyses',sid+':'+data.requestId));await mutate(sid, ws => { ws.runs ||= []; ws.runs.push(run); }); }
        catch (e) { jobs.delete(run.id); throw e; }
        const progress = change => mutate(sid, ws => Object.assign(ws.runs.find(x => x.id === run.id), change));
        const job = (async () => {
          try {
            const result = await agentRunner({ prompt: run.prompt, demo: context, previous, history, onProgress: progress, signal: jobController.signal });
            if (jobController.signal.aborted) return;
            const artifact = validateArtifact(result.output);
            await mutate(sid, ws => {
              if (jobController.signal.aborted) return;
              let item = ws.artifacts.find(x => x.id === run.artifactId);
              if (!item) { item = { id: token(), revisions: [] }; ws.artifacts.push(item); }
              item.revisions.push({ ...artifact, revision: item.revisions.length + 1, createdAt: new Date().toISOString(), source: 'openai-agents', sessionId: result.sessionId, turnId: result.turnId, prompt: run.prompt,snapshot:run.snapshot });
              Object.assign(ws.runs.find(x => x.id === run.id), { status: 'completed', phase: 'Analysis ready', artifactId: item.id, revision: item.revisions.length, completedAt: new Date().toISOString() });
              delete ws.runs.find(x => x.id === run.id).downloadedOutput;
            });
            if(bankingSession)await archiveWorkspace(sid,bankingMode);
          } catch (e) {
            if (jobController.signal.aborted) return;
            
            const diagnostic = e instanceof Error && Number.isInteger(e.httpStatus)
              ? { httpStatus: e.httpStatus, code: e.providerCode, requestId: e.requestId, operation: e.operation } : null;
            await progress({ status: 'failed', phase: 'Analysis unavailable', error: e.safe || e.status ? e.message : 'The analysis could not finish. No automatic prompt retry was made.', diagnostic, completedAt: new Date().toISOString() });
          } finally { jobs.delete(run.id); jobControllers.delete(run.id); }
        })();
        jobs.set(run.id, job); job.catch(() => {});
        return send(res, 202, run);
      }
      if (url.pathname === '/api/artifacts' && req.method === 'POST') {
        const data = await body(req);
        const stateOnly = data?.baseRevision !== undefined;
        if (stateOnly && (typeof data.id !== 'string' || !Number.isSafeInteger(data.baseRevision) || data.baseRevision < 1)) throw invalid('Invalid saved analysis reference.');
        const supplied = stateOnly ? null : validateArtifact(data);
        const result = await mutate(sid, ws => {
          let existing = data.id ? ws.artifacts.find(x => x.id === data.id) : null;
          if (data.id && !existing) throw invalid('Artifact not found in this workspace.', 404);
          const base = stateOnly ? existing?.revisions.find(x => x.revision === data.baseRevision) : null;
          if (stateOnly && !base) throw invalid('Saved revision not found.',404);
          const artifact = stateOnly ? validateArtifact({...base,state:data.state}) : supplied;
          if (!existing) {
            if (ws.artifacts.length >= 12) throw invalid('This prototype supports 12 analyses per browser workspace.', 409);
            existing = { id: token(), revisions: [] }; ws.artifacts.push(existing);
          }
          if (existing.revisions.length >= 30) throw invalid('This prototype supports 30 revisions per analysis.', 409);
          const generated = existing.revisions.find(x => x.source === 'openai-agents' && x.content === artifact.content);
          const provenance = generated ? { source: generated.source, sessionId: generated.sessionId, turnId: generated.turnId, prompt: generated.prompt, snapshot: generated.snapshot } : {};
          existing.revisions.push({ ...artifact, ...provenance, revision: existing.revisions.length + 1, createdAt: new Date().toISOString() });
          return existing;
        }); if(bankingSession)await archiveWorkspace(sid,bankingMode);return send(res, 200, result);
      }
      if (url.pathname === '/api/theme' && req.method === 'POST') {
        const data = await body(req); if (!themes.includes(data.theme)) throw invalid('Unknown theme.');
        await mutate(sid, ws => { ws.theme = data.theme; }); return send(res, 200, { theme: data.theme });
      }
      if (url.pathname === '/api/render' && req.method === 'POST') {
        const input = await body(req);
        let source = input;
        if (input?.artifactId !== undefined) {
          if (typeof input.artifactId !== 'string' || !Number.isSafeInteger(input.revision) || input.revision < 1) throw invalid('Invalid saved analysis reference.');
          const stored = (await workspace(sid)).artifacts.find(x => x.id === input.artifactId)?.revisions.find(x => x.revision === input.revision);
          if (!stored) throw invalid('Saved analysis not found.',404);
          source = {...stored,state:input.state ?? stored.state};
        }
        const artifact = validateArtifact(source);
        for (const [key, value] of renders) if (value.expires < Date.now()) renders.delete(key);
        if ([...renders.values()].filter(x => x.sid === sid).length >= 40) throw invalid('Close unused previews and try again in a few minutes.', 429);
        if (renders.size >= 200) throw invalid('Preview capacity reached. Try again shortly.', 429);
        const id = token(); renders.set(id, { artifact, sid, expires: Date.now() + 600000 });
        return send(res, 200, { url: `${renderer}/artifact/${id}${cloudOrigin ? `?mode=${bankingMode}` : ''}` });
      }
      if (url.pathname === '/api/examples' && req.method === 'GET') {
        const definitions = [['savings', 'A faster route to your summer house', 'html'], ['allocation', 'Make room in your month', 'html'], ['explanation', 'The numbers behind this scenario', 'markdown']];
        const examples = await Promise.all(definitions.map(async ([id, title, format]) => ({ id, title, format, content: await readFile(path.join(root, `examples/${id}.${format === 'html' ? 'html' : 'md'}`), 'utf8'), fallback: 'Synthetic household: income 54,000 DKK, expenses 32,700 DKK, savings 9,300 DKK and available to spend 12,000 DKK per month. No real account data or AI service is connected.', state: {} })));
        return send(res, 200, examples);
      }
      const files = { '/voice-transcript.js': ['voice-transcript.js', 'text/javascript'], '/i18n.js': ['i18n.js', 'text/javascript'], '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/conversations.js': ['conversations.js', 'text/javascript'], '/voice.js': ['voice.js', 'text/javascript'], '/styles.css': ['styles.css', 'text/css'], '/overview-effects.js': ['overview-effects.js', 'text/javascript'], '/overview-effects.css': ['overview-effects.css', 'text/css'] };
      if (/^\/icons\/[a-z-]+\.svg$/.test(url.pathname) && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'image/svg+xml' }); return res.end(await readFile(path.join(root, 'public', url.pathname)));
      }
      if (url.pathname === '/theme.css' && req.method === 'GET') { res.writeHead(200, { 'Content-Type': 'text/css' }); return res.end(styles); }
      if (url.pathname === '/scene.webp' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'image/webp' }); return res.end(await readFile(path.join(assetRoot, 'assets/overview-evening.webp')));
      }
      if (!files[url.pathname] || req.method !== 'GET') throw invalid('Not found.', 404);
      const [file, type] = files[url.pathname]; res.writeHead(200, { 'Content-Type': type }); res.end(await readFile(path.join(root, 'public', file)));
    } catch (e) { if (!res.headersSent) send(res, e.status || 500, { error: e.status ? e.message : 'Unable to load or save this prototype. Please retry.' }); else res.end(); }
  }));
  const frame = http.createServer((req, res) => {
    headers(res);
    const csp = `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; font-src 'none'; media-src 'none'; object-src 'none'; worker-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors ${frameAncestors}; sandbox allow-scripts`;
    res.setHeader('Content-Security-Policy', csp);
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), clipboard-read=(), clipboard-write=()');
    const url = new URL(req.url, origin);
    const id = /^\/artifact\/([a-f0-9]{64})$/.exec(url.pathname)?.[1];
    const entry = id ? renders.get(id) : null;
    if (req.headers.host !== `127.0.0.1:${renderPort}` || req.method !== 'GET' || !entry || entry.expires < Date.now()) { res.writeHead(404); return res.end('Preview expired. Reopen it from the canvas.'); }
    if (cloudOrigin) {
      const session = req.headers['x-banking-session'];
      const mode = url.searchParams.get('mode');
      const scope = req.headers['x-banking-scope'];
      const expectedScope = mode === 'Live' ? 'owner-live' : mode === 'Demo' && session
        ? createHash('sha256').update(session).digest('hex') : '';
      let requestedSid;
      try { requestedSid = bankingScope(session, mode); } catch { requestedSid = null; }
      if (!session || !requestedSid || scope !== expectedScope || requestedSid !== entry.sid) {
        res.writeHead(404); return res.end('Preview unavailable. Reopen it from the current workspace.');
      }
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Demo analysis</title><style>${kit}</style><script>${bridge}</script></head><body>${entry.artifact.format === 'markdown' ? markdown(entry.artifact.content) : entry.artifact.content}</body></html>`);
  });
  await new Promise((resolve, reject) => { frame.once('error', reject); frame.listen(renderPort, '127.0.0.1', resolve); });
  try { await new Promise((resolve, reject) => { app.once('error', reject); app.listen(port, '127.0.0.1', resolve); }); }
  catch (e) { frame.close(); throw e; }
  return { origin, renderer, close: () => { closing=true;clearInterval(captureTimer);voices.close(); for (const c of jobControllers.values()) c.abort(); return Promise.all([new Promise(r => app.close(r)), new Promise(r => frame.close(r)), ...jobs.values(), ...memorySuggestions.values(), ...captureJobs.values(), ...locks.values()]); } };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.loadEnvFile(path.join(root, '../../.env')); } catch (e) { if (e.code !== 'ENOENT') throw new Error('Unable to load local advisor configuration.'); }
  const server = await startPrototype(process.env.BANKING_ADVISOR_STORAGE ? {storageRoot:process.env.BANKING_ADVISOR_STORAGE} : {});
  console.log(`Banking advisor: ${server.origin} (standalone examples; authenticated Banking goals when embedded)`);
}
