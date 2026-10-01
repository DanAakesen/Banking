// Display-only normalization plus figure verification helpers. Never change audio or the transcript sent to tools.
const units = ['nul','en','to','tre','fire','fem','seks','syv','otte','ni'];
const small = [...units,'ti','elleve','tolv','tretten','fjorten','femten','seksten','sytten','atten','nitten'];
const tens = ['','','tyve','tredive','fyrre','halvtreds','tres','halvfjerds','firs','halvfems'];
const numbers = new Map(small.map((word,n)=>[word,n]));
numbers.set('et',1);
for(let n=20;n<100;n++) numbers.set(n%10?units[n%10]+'og'+tens[Math.floor(n/10)]:tens[n/10],n);
const ordinals = ['','første','anden','tredje','fjerde','femte','sjette','syvende','ottende','niende','tiende','ellevte','tolvte','trettende','fjortende','femtende','sekstende','syttende','attende','nittende','tyvende'];
for(let n=21;n<=31;n++) ordinals[n]=n===30?'tredivte':units[n%10]+'og'+(n<30?'tyvende':'tredivte');
const months = 'januar|februar|marts|april|maj|juni|juli|august|september|oktober|november|december';
const words = [...numbers.keys(),'hundrede','tusinde','tusind','millioner','million','milliarder','milliard','og'].sort((a,b)=>b.length-a.length);
const token = new RegExp(words.join('|'),'gy');
function parseWords(value){
  const compact=value.toLowerCase().replace(/[\s-]/g,'');
  let index=0,total=0,group=0,seen=false;
  while(index<compact.length){
    token.lastIndex=index;const match=token.exec(compact);if(!match)return null;
    index=token.lastIndex;const word=match[0];
    if(word==='og')continue;
    seen=true;
    if(numbers.has(word))group+=numbers.get(word);
    else if(word.startsWith('hundred'))group=(group||1)*100;
    else {const scale=word.startsWith('tusind')?1000:word.startsWith('million')?1e6:1e9;total+=(group||1)*scale;group=0;}
  }
  return seen?total+group:null;
}
// Require a complete financial/date context; ordinary phrases such as "en konto" stay intact.
const numericToken='(?:'+words.filter(word=>word!=='og').join('|')+')';
const sequence=numericToken+'(?:[ -]*(?:og[ -]*)?'+numericToken+')*';
const money=new RegExp('(?<![\\p{L}\\d])('+sequence+')\\s+(kroner|kr\\.|DKK)(?!\\p{L})','giu');
const date=new RegExp('(?:den\\s+)?('+ordinals.slice(1).sort((a,b)=>b.length-a.length).join('|')+')\\s+('+months+')\\s+('+sequence+')(?!\\p{L})','giu');
export function formatVoiceTranscript(text){
  return String(text).replace(date,(all,day,month,year)=>{
    const n=parseWords(year);return n>=1000&&n<=9999?`${ordinals.indexOf(day.toLowerCase())}. ${month} ${n}`:all;
  }).replace(money,(all,amount,currency,offset,source)=>{
    // Never convert only the tail of an unsupported decimal/fraction.
    if (/(?:komma|halvanden|halve|kvart)\s*$/iu.test(source.slice(0,offset))) return all;
    if (/^(million|milliard)/i.test(amount)) return all;
    const n=parseWords(amount);return n===null?all:`${new Intl.NumberFormat('da-DK').format(n)} ${currency==='DKK'?'DKK':'kr.'}`;
  }).replace(/kr\.\./g,'kr.');
}

// Figure verification: a monetary amount in an answer must trace to Banking evidence.
// Amounts use digits (Danish words are normalized first); 3-digit groups after . , or a space are thousands.
const amountPattern=/(?<![\p{L}\d.,:\/*#-])([-−]?)(\d{1,3}(?:[.,\u00a0\u202f ]\d{3})+|\d+)(?:[.,](\d{1,2}))?(?![\d.,]*\d)(\s*(?:k|t|tusinde?|thousand|mio\.?|millioner|millions?|mia\.?|milliarder|milliards?|billions?)(?!\p{L}))?(\s*(?:%|procent|percent|pct\.?)(?!\p{L}))?(\s*(?:kr\.?|kroner|DKK|USD|EUR|SEK|NOK)(?!\p{L}))?/giu;
const normalize=text=>formatVoiceTranscript(String(text??'').replace(/(\d)\s+(tusinde?|thousand)(?!\p{L})/giu,'$1 k'));
const isYear=(whole,currency,scaleWord)=>!currency&&!scaleWord&&/^\d{4}$/.test(whole)&&+whole>=1900&&+whole<=2100;
function scale(word){const w=String(word||'').trim().toLowerCase();return !w?1:/^(k|t|tusind|tusinde|thousand)$/.test(w)?1e3:/^(mio\.?|millioner|millions?)$/.test(w)?1e6:1e9;}
function scan(text,minimum){
 const out=[];
 for(const m of normalize(text).matchAll(amountPattern)){
  const [raw,,whole,fraction,scaleWord,percent,currency]=m;
  // Percentages and bare years are not amounts.
  if(percent||isYear(whole,currency,scaleWord))continue;
  const value=(Number(whole.replace(/[.,\u00a0\u202f ]/g,''))+(fraction?Number('0.'+fraction):0))*scale(scaleWord);
  if(Number.isFinite(value)&&value>=minimum)out.push({value,raw:raw.trim()});
 }
 return out;
}
export function extractAmounts(text){return scan(text,100);}
// Every number in the evidence, as absolute values; strings are scanned as well (answers, labels).
export function evidenceValues(...sources){
 const values=new Set(),seen=new Set();
 const add=v=>values.add(Math.abs(Math.round(v*100)/100));
 const walk=value=>{
  if(values.size>=6000||value==null)return;
  if(typeof value==='number'){if(Number.isFinite(value))add(value);return;}
  if(typeof value==='string'){for(const {value:v} of scan(value,0))add(v);return;}
  if(typeof value!=='object'||seen.has(value))return;seen.add(value);
  for(const item of Array.isArray(value)?value:Object.values(value))walk(item);
 };
 sources.forEach(walk);return [...values];
}
function matches(value,e){
 if(Math.abs(value-e)<0.006)return true;
 // Allow spoken rounding (75,000 for 75,388) while keeping at least two significant digits.
 for(let step=1;step<=Math.max(1,e)/10;step*=10)if(value%step===0&&Math.abs(value-e)<=step/2)return true;
 return false;
}
export function isGrounded(value,evidence){
 if(evidence.some(e=>matches(value,e)))return true;
 // Monthly equivalents and simple totals or differences of two recorded figures are derivable, not invented.
 if(evidence.some(e=>[3,6,12].some(n=>Math.abs(value-e/n)<=0.5||Math.abs(value-e*n)<=0.5)))return true;
 const pool=evidence.filter(e=>e>=1).slice(0,160);
 for(let i=0;i<pool.length;i++)for(let j=i+1;j<pool.length;j++)if(Math.abs(pool[i]+pool[j]-value)<=0.5||Math.abs(Math.abs(pool[i]-pool[j])-value)<=0.5)return true;
 return false;
}
export function ungroundedAmounts(text,evidence){
 const found=[];for(const {value,raw} of extractAmounts(text))if(!isGrounded(value,evidence)&&!found.includes(raw))found.push(raw);
 return found;
}
// Earlier conversation may contain unverified figures; strip them before giving it to the voice model as context.
export function redactAmounts(text){
 return normalize(text).replace(amountPattern,(raw,sign,whole,fraction,scaleWord,percent,currency)=>percent||isYear(whole,currency,scaleWord)||Number(whole.replace(/[.,\u00a0\u202f ]/g,''))*scale(scaleWord)<100?raw:'[amount]');
}