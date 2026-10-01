// Explicit local Demo-only category linking for the owner-approved family budget.
const {chromium}=require(process.env.USERPROFILE+'/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{if(!process.argv.includes('--apply'))throw Error('Pass --apply to link the Demo family budget.');const b=await chromium.launch({channel:'chrome',headless:true});try{const p=await b.newPage();await p.goto('https://localhost:5443');console.log(JSON.stringify(await p.evaluate(async()=>{
 const api=async(path,method='GET',body)=>{const r=await fetch('/api/'+path,{method,headers:{'X-Banking-Client':'web','X-Banking-Mode':'Demo','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});if(!r.ok)throw Error(path+' '+r.status);return r.status===204?null:r.json()};
 await api('browser/demo','POST');if((await api('mode')).mode!=='Demo')throw Error('DEMO_ONLY');if((await api('connections')).some(c=>!c.isDemo||c.provider!=='product-demo'))throw Error('SYNTHETIC_ONLY');
 const plan=(await api('budget-plans')).plans.find(p=>p.id==='b31c671b-df11-4b59-a879-f7184b27d240');if(!plan)throw Error('FAMILY_BUDGET_REQUIRED');const cats=await api('categories');const dining=cats.find(c=>c.name==='Dining');
 const rows=(await api('transactions?search=Coffee&limit=200')).items;let classified=0;for(const r of rows.filter(r=>r.description==='Coffee'&&!r.categoryId&&r.classification!=='Manual')){await api('transactions/'+r.id+'/category','PUT',{categoryId:dining.id,version:r.version});classified++;}
 const names={'Salary':'Income','Partner salary':'Income','Purchase refund':'Other income','Other spending':'Dining'};
 const entries=plan.entries.map(x=>{if(x.isSavings)return {...x,categoryId:null};const category=cats.find(c=>c.name===(names[x.name]||x.name));if(!category)throw Error('No category for '+x.name);return {...x,categoryId:category.id}});
 if(entries.some((x,i)=>x.categoryId!==plan.entries[i].categoryId))await api('budget-plans','POST',{...plan,entries,requestId:crypto.randomUUID()});
 const progress=await api('budget-plans/'+plan.id+'/progress');if(progress.unmappedEntries!==0)throw Error('UNMAPPED_ENTRIES');return {workspace:'Demo',linkedEntries:entries.filter(e=>e.categoryId).length,classified,progress};
})));}finally{await b.close()}})().catch(e=>{console.error(e.message);process.exitCode=1});
