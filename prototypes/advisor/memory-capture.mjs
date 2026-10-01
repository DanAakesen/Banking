import {createHash,randomUUID} from 'node:crypto';
import {savePreference} from './memory.mjs';

export const memoryIdleMs=10*60*1000;
const fail=message=>Object.assign(Error(message),{status:400});
export const fingerprint=text=>createHash('sha256').update(text.trim().toLowerCase().replace(/\s+/g,' ')).digest('hex');
const capture=state=>state.memoryCapture||={enabled:true,jobs:[],seen:{},rejected:[]};
export function captureView(state){
 const c=capture(state);
 return {enabled:c.enabled,idleMinutes:10,pending:c.jobs.filter(j=>j.status==='pending'||j.status==='processing').length,
  failed:c.jobs.filter(j=>j.status==='failed').map(j=>({id:j.id,title:j.title,error:j.error})),lastCompletedAt:c.lastCompletedAt||null};
}
export function configureCapture(state,enabled){
 if(typeof enabled!=='boolean')throw fail('Choose whether automatic memory is enabled.');
 const c=capture(state);c.enabled=enabled;
 if(!enabled){for(const j of c.jobs){if(['pending','failed','processing'].includes(j.status)){c.seen[j.chatId]||={};for(const m of j.messages)c.seen[j.chatId][m.id]=fingerprint(m.text);j.status='cancelled';j.messages=[];}}}
 return captureView(state);
}
export function queueCapture(state,input,now=Date.now(),idleMs=memoryIdleMs){
 if(typeof input.chatId!=='string'||!/^[a-f0-9-]{36}$/.test(input.chatId)||typeof input.title!=='string'||input.title.length>100||!['activity','new-chat','voice-ended','pagehide'].includes(input.reason)||typeof input.busy!=='boolean')throw fail('Invalid conversation capture.');
 if(!Array.isArray(input.messages)||input.messages.length>40||JSON.stringify(input.messages).length>24000||input.messages.some(m=>!m||typeof m.id!=='string'||!/^[a-f0-9-]{36}$/.test(m.id)||typeof m.text!=='string'||m.text.length>5000||m.role!=='user'))throw fail('Invalid memory source messages.');
 const c=capture(state);c.seen[input.chatId]||={};
 if(!c.enabled){for(const m of input.messages)c.seen[input.chatId][m.id]=fingerprint(m.text);return {status:'disabled'};}
 const fresh=input.messages.filter(m=>m.text.trim()&&c.seen[input.chatId][m.id]!==fingerprint(m.text)&&!c.jobs.some(j=>j.chatId===input.chatId&&['processing','failed'].includes(j.status)&&j.messages.some(x=>x.id===m.id&&x.text===m.text)));
 if(!fresh.length)return {status:'unchanged'};
 let job=c.jobs.find(j=>j.chatId===input.chatId&&j.status==='pending');
 if(job&&job.reason!=='activity'&&input.reason==='activity'&&fresh.every(m=>job.messages.some(x=>x.id===m.id&&x.text===m.text)))return {status:'pending',id:job.id,dueAt:job.dueAt};
 if(!job){if(c.jobs.filter(j=>['pending','processing','failed'].includes(j.status)).length>=30)throw fail('Too many pending conversations. Review automatic memory on the Memory page.');job={id:randomUUID(),chatId:input.chatId,title:input.title,status:'pending',messages:[]};c.jobs.push(job);}
 const merged=new Map(job.messages.map(m=>[m.id,m]));for(const m of fresh)merged.set(m.id,{id:m.id,role:'user',text:m.text});
 job.messages=[...merged.values()].slice(-40);while(JSON.stringify(job.messages).length>24000)job.messages.shift();
 job.title=input.title;job.reason=input.reason;job.dueAt=now+(input.reason==='activity'?idleMs:0);job.busy=input.busy;job.updatedAt=now;
 // A disconnected voice tab cannot leave a job permanently busy.
 job.busyUntil=input.busy?now+idleMs:0;
 return {status:'pending',id:job.id,dueAt:job.dueAt};
}
export function claimCapture(state,now=Date.now()){
 const c=capture(state);if(!c.enabled)return null;
 const job=c.jobs.find(j=>j.status==='pending'&&j.dueAt<=now&&(!j.busy||j.busyUntil<=now));if(!job)return null;
 job.status='processing';job.startedAt=now;return structuredClone(job);
}
export function completeCapture(state,job,candidates,now=Date.now()){
 const c=capture(state),stored=c.jobs.find(j=>j.id===job.id);
 if(!c.enabled||stored?.status!=='processing')return [];
 if(!Array.isArray(candidates)||candidates.length>3)throw Error('The memory response was invalid.');
 const checked=candidates.map(x=>{
  const source=job.messages.find(m=>m.id===x.messageId);
  if(!source||!['explicit','inferred'].includes(x.kind)||typeof x.quote!=='string'||!x.quote.trim()||x.quote.length>500||!source.text.includes(x.quote)||typeof x.text!=='string'||!x.text.trim()||x.text.length>500||typeof x.title!=='string'||!x.title.trim()||x.title.length>80||!Array.isArray(x.links)||x.links.length>5)throw Error('The memory response did not have valid user evidence.');
  if(x.kind==='explicit'&&x.text!==x.quote)throw Error('Explicit memories must preserve the exact user statement.');
  return {...x,links:x.links.filter(l=>state.preferences?.some(p=>p.id===l.id)&&typeof l.label==='string'&&l.label.length>0&&l.label.length<=60)};
 });
 const saved=[];
 for(const x of checked){
  const key=fingerprint(x.text),evidenceKey=fingerprint(job.chatId+'|'+x.messageId+'|'+x.quote);
  if(c.rejected.includes(key)||c.rejected.includes(evidenceKey)||state.preferences?.some(p=>fingerprint(p.text)===key||p.evidenceKey===evidenceKey))continue;
  if((state.preferences?.length||0)>=100)throw Error('Memory is full. Remove a memory before retrying.');
  const value=savePreference(state,{title:x.title,text:x.text,links:x.links},{origin:'AI',status:x.kind==='explicit'?'confirmed':'suggested',source:x.kind==='explicit'?'Automatically remembered from your explicit statement':'AI interpretation of your conversation; review before using'});
  const item=state.preferences.find(p=>p.id===value.id);Object.assign(item,{evidenceKey,evidence:{chatId:job.chatId,chatTitle:job.title,messageId:x.messageId,quote:x.quote},captureKind:x.kind});saved.push(item);
 }
 c.seen[job.chatId]||={};for(const m of job.messages)c.seen[job.chatId][m.id]=fingerprint(m.text);
 stored.status='completed';stored.messages=[];stored.completedAt=new Date(now).toISOString();c.lastCompletedAt=stored.completedAt;
 c.jobs=c.jobs.filter(j=>!['completed','cancelled'].includes(j.status)).concat(c.jobs.filter(j=>['completed','cancelled'].includes(j.status)).slice(-30));
 return saved;
}
export function failCapture(state,id,message){const j=capture(state).jobs.find(j=>j.id===id);if(j?.status==='processing'){j.status='failed';j.error=message;}}
export function retryCapture(state,id){const c=capture(state),j=c.jobs.find(j=>j.id===id);if(!c.enabled||j?.status!=='failed')throw fail('Enable automatic memory and choose a failed conversation.');j.id=randomUUID();j.status='pending';j.dueAt=0;j.busy=false;delete j.error;return {status:'pending'};}
