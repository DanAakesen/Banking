import {randomUUID,createHash} from 'node:crypto';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export function memoryScope(mode){
 if(!['Demo','Live'].includes(mode))throw fail('Invalid memory workspace.');
 return createHash('sha256').update('banking-local-single-owner-preferences-v1\0'+mode).digest('hex');
}
export function memoryView(item){return {...item,title:item.title||item.text.slice(0,65),origin:item.origin||'User',status:item.status||'confirmed',version:item.version||1,links:item.links||[]};}
export function savePreference(state,input,provenance={origin:'User',status:'confirmed',source:'User-confirmed preference'}){
 if(typeof input.text!=='string'||!input.text.trim()||input.text.length>500)throw fail('A remembered priority must contain 1–500 characters.');
 state.preferences||=[];
 // A new AI inference must never rename or mutate an existing user memory,
 // even when the provider happens to repeat exactly the same wording.
 let item=input.id?state.preferences.find(x=>x.id===input.id):provenance.origin==='AI'&&provenance.status==='suggested'?undefined:state.preferences.find(x=>x.text===input.text.trim());
 if(input.id&&!item)throw fail('Remembered priority not found.',404);
 if(item&&input.version!==undefined&&input.version!==(item.version||1))throw fail('This memory changed. Reload before editing.',409);
 const nextVersion=item?(item.version||1)+1:1;
 const title=input.title??item?.title??input.text.slice(0,65);
 if(typeof title!=='string'||!title.trim()||title.length>80)throw fail('Use a title of 1–80 characters.');
 const links=input.links??item?.links??[];
 if(!Array.isArray(links)||links.length>20||links.some(l=>!l||l.id===item?.id||!state.preferences.some(x=>x.id===l.id)||typeof l.label!=='string'||!l.label.trim()||l.label.length>60)||new Set(links.map(l=>l.id)).size!==links.length)throw fail('Choose existing, distinct linked memories and short relationship labels.');
 if(!item){if(state.preferences.length>=100)throw fail('Keep at most 100 memories. Edit or remove an existing one first.');item={id:randomUUID(),createdAt:new Date().toISOString(),origin:provenance.origin,status:provenance.status,source:provenance.source};state.preferences.push(item);}
 item.origin||='User';item.status=input.confirm===true?'confirmed':item.status||'confirmed';
 item.title=title.trim();item.text=input.text.trim();item.links=links.map(l=>({id:l.id,label:l.label.trim()}));item.updatedAt=new Date().toISOString();item.version=nextVersion;
 return memoryView(item);
}
export function positionMemory(state,input){
 const item=state.preferences?.find(x=>x.id===input.id);if(!item)throw fail('Memory not found.',404);
 if(!Number.isFinite(input.x)||!Number.isFinite(input.y)||input.x<0||input.x>1200||input.y<0||input.y>900)throw fail('Invalid graph position.');
 item.position={x:input.x,y:input.y};return item.position;
}
export function deletePreference(state,id,version){
 const index=state.preferences?.findIndex(x=>x.id===id)??-1;if(index<0)throw fail('Remembered priority not found.',404);
 if(version!==undefined&&version!==(state.preferences[index].version||1))throw fail('This memory changed. Reload before deleting.',409);
 const removed=state.preferences[index];state.memoryCapture||={enabled:true,jobs:[],seen:{},rejected:[]};
 state.memoryCapture.rejected.push(createHash('sha256').update(removed.text.trim().toLowerCase().replace(/\s+/g,' ')).digest('hex'));
 if(removed.evidenceKey)state.memoryCapture.rejected.push(removed.evidenceKey);
 state.preferences.splice(index,1);for(const item of state.preferences){if(item.links?.some(l=>l.id===id)){item.links=item.links.filter(l=>l.id!==id);item.version=(item.version||1)+1;}}
 return {deleted:true,id};
}
