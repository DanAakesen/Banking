import {createHash} from 'node:crypto';
export const libraryScope=mode=>createHash('sha256').update('banking-local-single-owner-library-v1\0'+mode).digest('hex');
export function dataSnapshot(c){
 return {context:structuredClone(c),generatedAt:c.generatedAt||new Date().toISOString(),from:c.from||null,to:c.to||null,currency:c.currency||'DKK',source:c.source,mode:c.mode,
  financials:structuredClone(c.actuals?.cashFlow||c.actuals||c.financials||null),activeBudget:structuredClone(c.budgets?.plans?.find(x=>x.isActive)?.monthly||null),
  wealth:c.wealth?{bankCash:c.wealth.bankCash,investments:c.wealth.investments,pension:c.wealth.pension,debt:c.wealth.debt,recordedNetWealth:c.wealth.recordedNetWealth}:null};
}
export function mergeLibrary(state,items){
 state.artifacts||=[];
 for(const incoming of items||[]){
  if(!incoming.revisions?.length)continue;
  let target=state.artifacts.find(x=>x.id===incoming.id);
  if(!target){target={id:incoming.id,revisions:[]};state.artifacts.push(target);}
  const key=r=>r.createdAt+'\0'+createHash('sha256').update(r.content+JSON.stringify(r.state||{})).digest('hex');
  const known=new Set(target.revisions.map(key));
  for(const revision of incoming.revisions){if(!known.has(key(revision))){target.revisions.push(structuredClone(revision));known.add(key(revision));}}
  target.revisions.sort((a,b)=>a.createdAt.localeCompare(b.createdAt));target.revisions.forEach((r,i)=>r.revision=i+1);
  target.question||=target.revisions.find(x=>x.prompt)?.prompt||target.revisions[0].title;
 }
 return state.artifacts;
}
export function librarySummary(item){const last=item.revisions.at(-1),snapshot=last.snapshot?{...last.snapshot}:null;if(snapshot)delete snapshot.context;return {id:item.id,title:last.title,question:item.question,updatedAt:last.createdAt,versions:item.revisions.length,snapshot,format:last.format};}
export function analysisSuggestions(c){
 const result=[];
 if(c.budgets?.plans?.length)result.push({id:'budget',title:'Make room in my month',reason:'Compare the income, expense and savings entries in your saved budget.',prompt:'Analyze my saved active budget. Visualize planned income, expenses, savings and available money. Show a useful expense breakdown using actual saved entries. Explain missing or stale data. Do not change any records.'});
 const goals=c.goalContext?.goals||[];
 if(goals.length)result.push({id:'goals',title:'Follow my goal journey',reason:goals.length+' saved goals to revisit with current contribution evidence.',prompt:'Analyze my saved goals and contribution history. Create a visual comparison of balances, targets and expected dates where data supports them. Distinguish stale balance observations and hypothetical forecasts. Do not create or edit goals.'});
 if(c.wealth?.pension>0)result.push({id:'wealth',title:'See my recorded wealth',reason:'You have a recorded pension statement alongside bank assets.',prompt:'Visualize my recorded wealth by asset type, separating pension from available cash and actual debt from scenarios. Clearly show statement dates and missing coverage. Do not assume returns or add missing assets.'});
 if(!result.length)result.push({id:'overview',title:'Understand my available data',reason:'Start with the financial records currently available in this workspace.',prompt:'Create a compact visual overview from my current Banking data. Keep missing data unknown, show source dates and explain what is and is not included.'});
 const priority=(c.rememberedPreferences||[]).filter(x=>x.status!=='suggested').sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''))[0];
 if(priority)result.unshift({id:'memory',title:priority.title||'Revisit my saved priority',reason:'Based on a confirmed advisor memory: '+priority.text,prompt:'Analyze how my current financial records relate to this saved priority: '+priority.text+'. Treat the memory as a stated priority, not proof of bank facts. Use actual available data, separate scenarios and show a useful visual. Do not change any records.'});
 return result.slice(0,3);
}
