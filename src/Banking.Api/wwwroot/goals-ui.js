import { dayScene, goalGlyph, goalTone, demoGoalPhoto, staleBalanceText } from './overview.js';

const paths={
 check:'M5 12.5 10 17 19 7',alert:'M12 8v5M12 16.5h.01M10.3 3.9 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0',
 minus:'M6 12h12',question:'M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01',clock:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7v5l3 2',
 calendar:'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',flag:'M5 21V4M5 4h11l-2 4 2 4H5',pencil:'m15 4 5 5M4 15 15 4a3.54 3.54 0 0 1 5 5L9 20l-6 1z',
 link:'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
 up:'M12 19V5M6 11l6-6 6 6',down:'M12 5v14M6 13l6 6 6-6',account:'M3 5h18v15H3zM3 9h18M15 14h3',
 spark:'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6',
 target:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10M12 11v2',list:'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
 notes:'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5',trend:'M3 17l6-6 4 4 8-8M15 7h6v6',chevron:'m6 9 6 6 6-6',trash:'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13'
};
const svg=name=>`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]}"/></svg>`;
const RING_R=94,RING_C=2*Math.PI*RING_R;
const iso=d=>d.toISOString().slice(0,10);
const addMonths=(date,n)=>{const d=new Date(date+'T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+n);return iso(d);};
function firstDue(start,day){const s=new Date(start+'T12:00:00Z'),f=new Date(Date.UTC(s.getUTCFullYear(),s.getUTCMonth(),day,12));if(f<s)f.setUTCMonth(f.getUTCMonth()+1);return iso(f);}

// Mirrors GoalService.DueCount: contribution days from the plan start through a date, inclusive.
export function dueCount(start,through,day){
 const first=firstDue(start,day);if(through<first)return 0;
 const a=new Date(first+'T12:00:00Z'),b=new Date(through+'T12:00:00Z');
 return (b.getUTCFullYear()-a.getUTCFullYear())*12+b.getUTCMonth()-a.getUTCMonth()+(b.getUTCDate()>=day?1:0);
}

// Plan-only estimate for the edit form. Actual progress and forecasts come from the booked balance via the API.
export function planPreview({target,startingBalance,monthly,planStart,deadline,day=1}){
 const ok=Number.isFinite,out={remaining:null,payments:null,reachDate:null,needed:null,onPace:null};
 if(!ok(target)||target<=0||!ok(startingBalance)||!planStart)return out;
 day=Math.min(28,Math.max(1,Math.round(ok(day)?day:1)));
 const remaining=Math.max(0,target-startingBalance);out.remaining=remaining;
 if(remaining===0){out.payments=0;out.reachDate=planStart;}
 else if(ok(monthly)&&monthly>0){const payments=Math.ceil(remaining/monthly);if(payments<=1200){out.payments=payments;out.reachDate=addMonths(firstDue(planStart,day),payments-1);}}
 if(deadline&&deadline>=planStart){const n=dueCount(planStart,deadline,day);out.needed=remaining===0?0:n>0?Math.ceil(remaining/n*100)/100:null;if(out.reachDate)out.onPace=out.reachDate<=deadline;}
 return out;
}

const DAY=864e5,toTime=d=>Date.parse(d+'T12:00:00Z'),addDays=(d,n)=>iso(new Date(toTime(d)+n*DAY));
const round=n=>Math.round(n*100)/100;
export function valueAt(points,d){let v=null;for(const p of points){if(p.date>d)break;v=p.value;}return v;}
function nextDue(after,day){const a=new Date(after+'T12:00:00Z'),n=new Date(Date.UTC(a.getUTCFullYear(),a.getUTCMonth(),day,12));if(iso(n)<=after)n.setUTCMonth(n.getUTCMonth()+1);return iso(n);}

// Goal path: stepped plan baseline from the plan start, booked balance rebuilt backwards from the current balance, and the planned-deposit projection.
export function goalPath({goal:g,journey:j,transactions=[],historyFrom=null,historyAvailable=true}){
 const today=j.to,day=Math.min(28,Math.max(1,g.contributionDay||1)),monthly=g.monthlyContribution||0;
 const hasPlan=Boolean(j.hasPlan&&g.planStart&&g.startingBalance!=null&&monthly>0&&g.planStart<=today);
 const start=hasPlan?g.planStart:j.from;
 const plan=[];let planArrival=null;
 if(hasPlan){
  let v=Math.min(g.target,g.startingBalance);plan.push({date:g.planStart,value:v});if(v>=g.target)planArrival=g.planStart;
  const first=firstDue(g.planStart,day);
  for(let i=0;i<1200&&v<g.target;i++){const d=addMonths(first,i);v=Math.min(g.target,round(v+monthly));plan.push({date:d,value:v});if(v>=g.target)planArrival=d;}
 }
 const planAt=d=>hasPlan&&d>=g.planStart?valueAt(plan,d):null;
 const actualFrom=historyFrom&&historyFrom>start?historyFrom:start;
 const actual=[],events=[];
 if(historyAvailable&&j.fresh&&j.closingBalance!=null){
  const rows=transactions.filter(x=>x.bookingDate>=actualFrom&&x.bookingDate<=today&&x.currency===g.currency);
  const days=new Map();for(const x of rows){const item=days.get(x.bookingDate)||{date:x.bookingDate,amount:0,items:[]};item.amount=round(item.amount+x.amount);item.items.push(x);days.set(x.bookingDate,item);}
  let balance=round(j.closingBalance-rows.reduce((s,x)=>s+x.amount,0));actual.push({date:actualFrom,value:balance});
  for(const item of [...days.values()].sort((a,b)=>a.date<b.date?-1:1)){balance=round(balance+item.amount);actual.push({date:item.date,value:balance});events.push({...item,value:balance});}
 }
 const projection=[];let forecast=null;
 if(hasPlan&&j.fresh&&j.closingBalance!=null){
  let v=j.closingBalance;projection.push({date:today,value:v});
  if(v>=g.target)forecast=today;
  else{const first=nextDue(today,day);let d=first;for(let i=0;i<1200&&v<g.target;i++){d=addMonths(first,i);v=Math.min(g.target,round(v+monthly));projection.push({date:d,value:v});}if(v>=g.target)forecast=d;}
 }
 const runs=[];
 if(hasPlan&&actual.length){
  const tolerance=Math.max(.5,monthly*.001);
  for(let d=actualFrom>g.planStart?actualFrom:g.planStart;d<=today;d=addDays(d,1)){
   const diff=valueAt(actual,d)-planAt(d),state=Math.abs(diff)<tolerance?'on':diff<0?'behind':'ahead',last=runs.at(-1);
   if(last&&last.state===state)last.to=d;else runs.push({state,from:d,to:d});
  }
  // A deposit booked a few days after its due day is not a deviation; the current run always stays visible.
  const merged=[];
  runs.forEach((r,i)=>{
   const brief=i<runs.length-1&&(toTime(r.to)-toTime(r.from))/DAY<6,last=merged.at(-1);
   if(brief&&last)last.to=r.to;else if(brief)runs[i+1].from=r.from;else if(last&&last.state===r.state)last.to=r.to;else merged.push({...r});
  });
  runs.splice(0,runs.length,...merged);
 }
 const diff=hasPlan&&j.fresh&&j.closingBalance!=null?round(j.closingBalance-planAt(today)):null;
 const candidates=[today,forecast,planArrival,g.deadline].filter(Boolean).sort();
 let end=candidates.at(-1);end=addDays(end,Math.max(20,Math.round((toTime(end)-toTime(start))/DAY*.04)));
 return {start,today,end,hasPlan,target:g.target,deadline:g.deadline||null,currency:g.currency,plan,planAt,actual,actualFrom,events,projection,forecast,planArrival,runs,diff,state:diff==null?null:Math.abs(diff)<Math.max(.5,monthly*.001)?'on':diff<0?'behind':'ahead'};
}

export function createGoalsUI({S,t,e,money,api,post,header,date,locale,statusName,statusClass,notice,errorText,navigate,button,icon,input,select:selectField,textArea,linkRow,currencyItems,onRoute=()=>{}}) {
 const cash=(n,c)=>money(n,c,{minimumFractionDigits:0,maximumFractionDigits:2});
 const month=d=>new Intl.DateTimeFormat(locale(),{month:'short',year:'numeric'}).format(new Date(d+'T12:00:00Z'));
 const percent=n=>new Intl.NumberFormat(locale(),{maximumFractionDigits:1}).format(n);
 const calm=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
 const demoPhoto=g=>S.mode==='Demo'&&demoGoalPhoto(g.name)?`/assets/goal-${demoGoalPhoto(g.name)}.webp`:null;
 const photo=g=>g.hasPhoto?null:demoPhoto(g);
 const glyph=name=>typeof icon==='function'?icon(goalGlyph(name||'')):svg('target');
 const visual=g=>g.hasPhoto||photo(g)?`<img src="${e(photo(g)||'/assets/overview-afternoon.webp')}" alt="" data-goal-photo="${g.id}">`:`<div class="gg-photo-default" data-tone="${goalTone(g.id)}" aria-hidden="true">${glyph(g.name)}</div>`;
 function track(p){const pct=Math.min(100,Math.max(0,p.completionPercent||0));return `<div class="gg-track" role="progressbar" aria-label="${t('Goal progress')}" aria-valuemin="0" aria-valuemax="100" ${p.completionPercent==null?'':`aria-valuenow="${pct}"`}><i data-progress="${pct}"></i><span data-position="${pct}"></span></div>`;}
 function card(g,p,selected){return `<article class="gg-card ${g.id===selected?'selected':''}" data-goal-id="${g.id}" data-status="${e(p.status)}"><div class="gg-photo">${visual(g)}<label class="gg-photo-change">${t(g.hasPhoto?'Change photo':'Add photo')}<input type="file" accept="image/jpeg,image/png,image/webp" data-photo-input="${g.id}" aria-label="${e(t('Change photo')+' · '+g.name)}"></label></div><a class="gg-card-content" href="#/goals/${g.id}" aria-labelledby="gg-name-${g.id}" ${g.id===selected?'aria-current="true"':''}><div class="gg-title"><h2 id="gg-name-${g.id}">${e(g.name)}</h2><span class="gg-status ${statusClass(p.status)}">${t(statusName(p.status))}</span></div><p class="gg-description">${e(g.description)}</p><div class="gg-amount"><strong>${cash(p.measuredBalance,g.currency)}</strong><small>${t('of')} ${cash(g.target,g.currency)}</small><b>${p.completionPercent==null?'—':percent(p.completionPercent)+'%'}</b></div>${track(p)}<div class="gg-card-plan"><div><small>${t('Remaining')}</small><strong>${cash(p.measuredBalance==null?null:Math.max(0,g.target-p.measuredBalance),g.currency)}</strong></div><div><small>${t('Monthly savings')}</small><strong>${cash(g.monthlyContribution,g.currency)}${g.monthlyContribution==null?'':`<span class="gg-per">/${t('month')}</span>`}</strong></div></div>${p.reason&&p.reason!=='NO_ACTIVE_PLAN'?`<small class="warning gg-card-warning">${e(p.reason==='STALE_BALANCE'?staleBalanceText(p,t):t('Progress unavailable'))}</small>`:''}</a></article>`;}
 function nextContribution(g,j){
  if(!j.hasPlan||!j.fresh||j.closingBalance>=g.target)return null;
  const next=new Date(j.to+'T12:00:00Z');next.setUTCDate(g.contributionDay);
  if(next.toISOString().slice(0,10)<=j.to)next.setUTCMonth(next.getUTCMonth()+1);
  return {date:next.toISOString().slice(0,10),amount:Math.min(g.monthlyContribution,g.target-j.closingBalance)};
 }
 function ring(p){
  const known=p.completionPercent!=null,pct=known?Math.min(100,Math.max(0,p.completionPercent)):0;
  const point=m=>{const a=m/100*2*Math.PI-Math.PI/2;return [(110+RING_R*Math.cos(a)).toFixed(2),(110+RING_R*Math.sin(a)).toFixed(2)];};
  const ticks=[25,50,75,100].map((m,i)=>{const [x,y]=point(m);return `<circle class="gg-ring-tick ${known&&pct>=m?'lit':''}" data-i="${i}" cx="${x}" cy="${y}" r="5"/>`;}).join('');
  const [hx,hy]=point(pct);
  return `<div class="gg-ring ${p.status==='Reached'?'reached':''}" role="img" aria-label="${e(t('Goal progress')+': '+(known?percent(p.completionPercent)+'%':'—'))}"><svg viewBox="0 0 220 220" aria-hidden="true"><circle class="gg-ring-track" cx="110" cy="110" r="${RING_R}"/>${known&&pct>0?`<circle class="gg-ring-fill" cx="110" cy="110" r="${RING_R}" transform="rotate(-90 110 110)" data-ring="${pct}"/>`:''}${ticks}${known&&pct>0&&pct<100?`<circle class="gg-ring-head" cx="${hx}" cy="${hy}" r="7"/>`:''}</svg><div class="gg-ring-center" aria-hidden="true"><strong>${known?`<span data-count="${pct}">${percent(p.completionPercent)}</span><small>%</small>`:'—'}</strong></div></div>`;
 }
 function monthPill(g,m){
  const known=m.net!=null,planned=m.planned>0;
  const state=!known?'unknown':m.status.toLowerCase();
  const badge={received:'check',partial:'alert',missing:'alert',notdue:'minus'}[state]||'question';
  const chip=known&&m.withdrawals>0?`<span class="gg-chip negative">${cash(m.withdrawals,g.currency)} ${t('withdrawn')}</span>`:known&&planned&&m.net<m.planned?`<span class="gg-chip negative">${t(m.net<=0?'Missing contribution':'Below plan')}</span>`:'';
  return `<li class="gg-month ${state}"><span class="gg-month-icon" aria-hidden="true">${svg(badge)}</span><div><time datetime="${m.month}">${month(m.month)}</time><strong><span class="sr-only">${t('Net contributed')}: </span>${cash(m.net,g.currency)}</strong><small>${planned&&known?`${t('Plan')}: ${cash(m.planned,g.currency)}`:t(!known?'Incomplete history':g.monthlyContribution>0&&m.due>=g.planStart?'Not due':'No monthly plan for this period')}</small>${chip}</div></li>`;
 }
 const compact=n=>new Intl.NumberFormat(locale(),{notation:'compact',maximumFractionDigits:1}).format(n);
 const plain=n=>`${new Intl.NumberFormat(locale(),{maximumFractionDigits:0}).format(n)} `;
 const niceStep=raw=>{const mag=10**Math.floor(Math.log10(raw||1)),n=raw/mag;return (n<=1?1:n<=2?2:n<=2.5?2.5:n<=5?5:10)*mag;};
 function geometry(m,W,view){
  const narrow=W<560,H=narrow?250:310,L=narrow?44:58,R=narrow?14:22,T=34,B=30,PW=Math.max(40,W-L-R),PH=H-T-B;
  const from=m.start;let to=m.end;
  if(view==='recent'){const span=Math.max(45,(toTime(m.today)-toTime(m.start))/DAY);to=addDays(m.today,Math.round(Math.max(21,span*.12)));if(to>m.end)to=m.end;}
  const values=[];
  for(const s of [m.plan,m.actual,m.projection]){if(!s.length)continue;const first=valueAt(s,from)??s[0].value;values.push(first);for(const p of s)if(p.date>=from&&p.date<=to)values.push(p.value);const last=valueAt(s,to);if(last!=null)values.push(last);}
  if(view!=='recent'||!values.length)values.push(m.target);
  let lo=Math.min(...values),hi=Math.max(...values);if(hi-lo<1){hi+=1;lo-=1;}
  const pad=(hi-lo)*(view==='recent'?.06:.08),floor=Math.min(...values);lo-=pad;hi+=pad;if(lo<0&&floor>=0)lo=0;
  const step=niceStep((hi-lo)/(view==='recent'?5:4));lo=Math.floor(lo/step)*step;hi=Math.ceil(hi/step)*step;
  const t0=toTime(from),t1=toTime(to);
  return {W,H,L,R,T,B,PW,PH,from,to,lo,hi,step,narrow,smooth:view!=='recent',x:d=>L+(toTime(d)-t0)/(t1-t0)*PW,y:v=>T+(hi-v)/(hi-lo)*PH,dateAt:px=>iso(new Date(t0+Math.min(1,Math.max(0,(px-L)/PW))*(t1-t0)))};
 }
 function verts(points,a,b,G,linear=false){
  if(!points.length||a>b)return [];const v0=valueAt(points,a);if(v0==null)return [];
  const out=[[G.x(a),G.y(v0)]];let prev=v0;
  for(const p of points){if(p.date<=a)continue;if(p.date>b)break;if(!linear)out.push([G.x(p.date),G.y(prev)]);out.push([G.x(p.date),G.y(p.value)]);prev=p.value;}
  out.push([G.x(b),G.y(prev)]);return out;
 }
 const line=vs=>vs.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join('');
 const area=(top,bottom)=>top.length&&bottom.length?line([...top,...bottom.reverse()])+'Z':'';
 function xTicks(G){
  const days=(toTime(G.to)-toTime(G.from))/DAY,out=[];
  if(days>900){const years=days/365,every=years>24?5:years>12?2:1;for(let y=Number(G.from.slice(0,4))+1;`${y}-01-01`<=G.to;y++)if(y%every===0)out.push([`${y}-01-01`,String(y)]);}
  else{const every=days>600?4:days>420?3:days>210?2:1;let d=G.from.slice(0,7)+'-01';if(d<G.from)d=addMonths(d,1);for(let i=0;d<=G.to&&i<40;i++,d=addMonths(d,1)){const mo=Number(d.slice(5,7))-1;if(mo%every===0)out.push([d,new Intl.DateTimeFormat(locale(),{month:'short',...(mo===0||!out.length?{year:'2-digit'}:{})}).format(new Date(d+'T12:00:00Z'))]);}}
  return G.narrow&&out.length>5?out.filter((_,i)=>i%2===0):out;
 }
 function pathSVG(m,G){
  const clip=d=>d<G.from?G.from:d>G.to?G.to:d,parts=[];
  const count=Math.round((G.hi-G.lo)/G.step);
  for(let i=0;i<=count;i++){const v=G.lo+i*G.step,y=G.y(v).toFixed(1);parts.push(`<line class="gg-p-grid" x1="${G.L}" x2="${G.W-G.R}" y1="${y}" y2="${y}"/><text class="gg-p-ylabel" x="${G.L-8}" y="${(+y+4).toFixed(1)}">${compact(v)}</text>`);}
  parts.push(xTicks(G).map(([d,label])=>`<text class="gg-p-xlabel" x="${G.x(d).toFixed(1)}" y="${G.H-8}">${e(label)}</text>`).join(''));
  if(m.target>=G.lo&&m.target<=G.hi){const y=G.y(m.target).toFixed(1);parts.push(`<line class="gg-p-target" x1="${G.L}" x2="${G.W-G.R}" y1="${y}" y2="${y}"/><text class="gg-p-target-label" x="${G.L+6}" y="${(+y+16).toFixed(1)}">${e(t('Target')+' · '+plain(m.target)+m.currency)}</text>`);}
  const bottom=G.T+G.PH;
  if(m.deadline&&m.deadline>=G.from&&m.deadline<=G.to){const x=G.x(m.deadline).toFixed(1);parts.push(`<line class="gg-p-deadline" x1="${x}" x2="${x}" y1="${G.T}" y2="${bottom}"/><text class="gg-p-deadline-label" x="${(+x-6).toFixed(1)}" y="${bottom-8}">${e(t('Deadline')+' · '+month(m.deadline))}</text>`);}
  if(m.today<=G.to){const x=G.x(m.today).toFixed(1);parts.push(`<line class="gg-p-today" x1="${x}" x2="${x}" y1="${G.T}" y2="${bottom}"/><text class="gg-p-today-label" x="${(+x+6).toFixed(1)}" y="${bottom-8}">${e(t('Today'))}</text>`);}
  const horizon=[m.forecast,m.planArrival].filter(Boolean).sort().at(-1)||G.to;
  if(m.projection.length&&m.state&&m.state!=='on'){const a=clip(m.today),b=clip(horizon);parts.push(`<path class="gg-p-area future ${m.state}" d="${area(verts(m.projection,a,b,G,G.smooth),verts(m.plan,a,b,G,G.smooth))}"/>`);}
  m.runs.forEach((r,i)=>{if(r.state==='on')return;const a=clip(r.from),b=clip(i<m.runs.length-1?m.runs[i+1].from:m.today);if(a<b)parts.push(`<path class="gg-p-area ${r.state}" d="${area(verts(m.actual,a,b,G),verts(m.plan,a,b,G))}"/>`);});
  if(m.plan.length)parts.push(`<path class="gg-p-plan" d="${line(verts(m.plan,clip(m.plan[0].date),G.to,G,G.smooth))}"/>`);
  if(m.projection.length){const b=clip(m.forecast||G.to);if(m.today<b)parts.push(`<path class="gg-p-projection ${m.state||'on'}" d="${line(verts(m.projection,clip(m.today),b,G,G.smooth))}"/>`);}
  if(m.actual.length){
   const segments=m.runs.length?m.runs.map((r,i)=>[r.state,r.from,i<m.runs.length-1?m.runs[i+1].from:m.today]):[['on',m.actualFrom,m.today]];
   if(m.runs.length&&m.actualFrom<m.runs[0].from)segments.unshift(['on',m.actualFrom,m.runs[0].from]);
   const span=Math.max(1,toTime(m.today)-toTime(m.actualFrom));
   segments.forEach(([state,a,b])=>{a=clip(a);b=clip(b);if(a<b)parts.push(`<path class="gg-p-actual ${state}" pathLength="1" data-draw="${((toTime(a)-toTime(m.actualFrom))/span).toFixed(3)},${((toTime(b)-toTime(a))/span).toFixed(3)}" d="${line(verts(m.actual,a,b,G))}"/>`);});
   m.events.filter(x=>x.date>=G.from&&x.date<=G.to).forEach((x,i)=>parts.push(`<circle class="gg-p-event ${x.amount<0?'out':'in'}" data-i="${i}" cx="${G.x(x.date).toFixed(1)}" cy="${G.y(x.value).toFixed(1)}" r="4"/>`));
  }
  const labels=[];
  if(m.planArrival&&m.planArrival<=G.to&&m.hasPlan&&m.planArrival!==m.forecast)labels.push({date:m.planArrival,cls:'plan',text:t('Plan')+' · '+month(m.planArrival)});
  if(m.forecast&&m.forecast<=G.to)labels.push({date:m.forecast,cls:m.state||'on',text:month(m.forecast),arrival:true});
  labels.sort((a,b)=>a.date<b.date?-1:1);
  const close=labels.length===2&&Math.abs(G.x(labels[1].date)-G.x(labels[0].date))<110;
  labels.forEach((l,i)=>{const x=G.x(l.date),y=G.y(Math.min(m.target,G.hi)),right=x>G.L+G.PW/2;let anchor=close?(right?'end':'start'):'middle';if(anchor==='middle'&&x>G.W-G.R-50)anchor='end';if(anchor==='middle'&&x<G.L+50)anchor='start';const dx=anchor==='end'?-9:anchor==='start'?9:0,dy=close&&l.arrival?30:14;
   parts.push(`${l.arrival?`<circle class="gg-p-beacon ${l.cls}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7"/>`:''}<circle class="gg-p-arrival ${l.cls}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${l.arrival?6:4.5}"/><text class="gg-p-arrival-label ${l.cls}" text-anchor="${anchor}" x="${(x+dx).toFixed(1)}" y="${(y-dy).toFixed(1)}">${e(l.text)}</text>`);});
  parts.push(`<g class="gg-p-guide" hidden><line x1="0" x2="0" y1="${G.T}" y2="${bottom}"/><circle class="plan" r="4.5"/><circle class="value" r="5.5"/></g><rect class="gg-p-hit" x="${G.L}" y="${G.T}" width="${G.PW}" height="${G.PH}"/>`);
  return `<svg width="${G.W}" height="${G.H}" viewBox="0 0 ${G.W} ${G.H}" aria-hidden="true">${parts.join('')}</svg>`;
 }
 function pointInfo(m,d){
  const past=d<=m.today,planV=m.planAt(d);
  const value=past?(m.actual.length&&d>=m.actualFrom?valueAt(m.actual,d):null):(m.projection.length?valueAt(m.projection,d):null);
  const diff=value!=null&&planV!=null?round(value-planV):null;
  return {d,past,planV,value,diff,event:m.events.find(x=>x.date===d)};
 }
 function tipHTML(m,info){
  const c=m.currency,{diff}=info;
  return `<strong>${date(info.d)}</strong><dl>${info.value!=null?`<div><dt>${t(info.past?'Booked balance':'Projected balance')}</dt><dd>${cash(info.value,c)}</dd></div>`:''}${info.planV!=null?`<div><dt>${t('Plan')}</dt><dd>${cash(info.planV,c)}</dd></div>`:''}${diff!=null?`<div><dt>${t('Difference')}</dt><dd class="${diff<0?'negative':diff>0?'positive':''}">${diff>0?'+':''}${cash(diff,c)}</dd></div>`:''}</dl>${info.event?`<ul>${info.event.items.slice(0,3).map(x=>`<li><span>${e(x.description)}</span><b class="${x.amount<0?'negative':'positive'}">${x.amount>0?'+':''}${cash(x.amount,c)}</b></li>`).join('')}</ul>`:''}`;
 }
 function mountPath(section,m){
  const box=section?.querySelector('[data-path-chart]');if(!box||typeof ResizeObserver!=='function')return;
  const canvas=box.querySelector('.gg-path-svg'),tip=box.querySelector('.gg-path-tip'),live=box.querySelector('[data-path-live]');
  let view='full',G=null,focus=null,width=0;
  const stops=()=>[...new Set([G.from,...m.events.map(x=>x.date),m.today,m.forecast,m.planArrival,m.deadline].filter(d=>d&&d>=G.from&&d<=G.to))].sort();
  const hide=()=>{box.querySelector('.gg-p-guide')?.setAttribute('hidden','');tip.classList.remove('visible');};
  const show=(d,announce)=>{
   const info=pointInfo(m,d),guide=box.querySelector('.gg-p-guide');if(!guide)return;const x=G.x(d);
   guide.removeAttribute('hidden');guide.querySelector('line').setAttribute('x1',x);guide.querySelector('line').setAttribute('x2',x);
   const dot=(sel,v)=>{const el=guide.querySelector(sel);if(v==null){el.setAttribute('hidden','');return;}el.removeAttribute('hidden');el.setAttribute('cx',x);el.setAttribute('cy',G.y(Math.min(G.hi,Math.max(G.lo,v))));};
   dot('.plan',info.planV);dot('.value',info.value);guide.querySelector('.value').setAttribute('class','value '+(info.diff==null||Math.abs(info.diff)<.5?'on':info.diff<0?'behind':'ahead'));
   tip.innerHTML=tipHTML(m,info);tip.classList.add('visible');
   const w=tip.offsetWidth,left=x+14+w>G.W?x-14-w:x+14;tip.style.left=Math.max(4,left)+'px';tip.style.top=Math.max(4,G.T-6)+'px';
   if(announce){const tmp=document.createElement('div');tmp.innerHTML=tip.innerHTML;live.textContent=[...tmp.querySelectorAll(':scope>strong,dt,dd,li>span,li>b')].map(n=>n.textContent.trim()).join(', ');}
  };
  const draw=animated=>{
   width=canvas.clientWidth;if(width<40)return;G=geometry(m,width,view);canvas.innerHTML=pathSVG(m,G);box.classList.toggle('settled',!animated);
   canvas.querySelectorAll('[data-draw]').forEach(el=>{const [start,length]=el.dataset.draw.split(',').map(Number);el.style.animationDelay=(.35+start*1.1).toFixed(2)+'s';el.style.animationDuration=Math.max(.25,length*1.1).toFixed(2)+'s';});
   canvas.querySelectorAll('.gg-p-event').forEach(el=>el.style.animationDelay=(.6+Number(el.dataset.i)*.12).toFixed(2)+'s');
   const hit=canvas.querySelector('.gg-p-hit');
   hit.addEventListener('pointermove',ev=>{const r=canvas.getBoundingClientRect(),px=ev.clientX-r.left;let d=G.dateAt(px);const near=m.events.find(x=>x.date>=G.from&&x.date<=G.to&&Math.abs(G.x(x.date)-px)<7);if(near)d=near.date;if(d>G.to)d=G.to;show(d,false);});
   hit.addEventListener('pointerleave',hide);
   if(focus)show(focus,false);
  };
  box.addEventListener('keydown',ev=>{
   if(!G||!['ArrowLeft','ArrowRight','Home','End'].includes(ev.key))return;ev.preventDefault();const list=stops();
   const i=focus?list.indexOf(focus):-1;focus=ev.key==='Home'?list[0]:ev.key==='End'?list.at(-1):ev.key==='ArrowRight'?list[Math.min(list.length-1,i+1)]:list[Math.max(0,i<0?0:i-1)];show(focus,true);
  });
  box.addEventListener('focus',()=>{if(!focus&&G){focus=m.today<=G.to?m.today:G.to;show(focus,true);}});
  box.addEventListener('blur',()=>{focus=null;hide();});
  section.querySelectorAll('[data-path-view]').forEach(b=>b.addEventListener('click',()=>{view=b.dataset.pathView;section.querySelectorAll('[data-path-view]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));focus=null;hide();draw(true);}));
  const observer=new ResizeObserver(()=>{if(!box.isConnected){observer.disconnect();return;}if(Math.abs(canvas.clientWidth-width)>4)draw(false);});
  observer.observe(canvas);draw(!calm());
 }
 function contributionInsight(g,j,p){
  let title,description='',tone='muted';
  if(!j.hasPlan){title=t('Set a savings plan');description=t('Add a monthly savings plan to estimate when you will reach this goal.');}
  else if(!j.fresh){title=t('Forecast unavailable');description=t('A fresh booked balance is needed for a reliable forecast.');}
  else if(!j.historyComplete){title=t('Incomplete history');description=t('Complete transaction history is needed to reconcile this period.');}
  else if(p.status==='Reached'){title=t('Goal reached');tone='positive';}
  else if(j.shortfall>0){
   title=`${cash(j.shortfall,g.currency)} ${t('below your savings plan')}`;tone='negative';
   description=j.delayMonths>0?`${t('Estimated arrival')}: <strong>${month(j.forecastDate)}</strong> · +${j.delayMonths} ${t(j.delayMonths===1?'month':'months')}. ${t('Without this shortfall')}: ${month(j.withoutShortfallDate)}.`:t('The shortfall has not changed the estimated month yet.');
  }else if(g.deadline&&j.forecastDate>g.deadline){title=t('The monthly amount is below the pace needed.');tone='negative';description=`${t('Your target')}: ${month(g.deadline)} · ${t('Estimated arrival')}: <strong>${month(j.forecastDate)}</strong>`;}
  else {
   const due=j.months.filter(m=>m.planned>0);
   const follows=due.length>0&&due.every(m=>m.net!=null&&m.net>=m.planned);
   title=t(follows?'Every due month follows the plan':'Contributions up to date');tone='positive';
   description=j.forecastDate?`${t('Estimated arrival')}: <strong>${month(j.forecastDate)}</strong>`:t('Beyond forecast range');
  }
  return `<div class="gg-contribution-insight ${tone}"><span class="gg-insight-marker" aria-hidden="true">${svg(tone==='positive'?'check':tone==='negative'?'alert':'spark')}</span><div><strong>${title}</strong>${description?`<p>${description}</p>`:''}</div></div>`;
 }
 function facts(g,j,p,next){
  const c=g.currency;
  const arrival=p.status==='Reached'?t('Goal reached'):j.hasPlan&&j.fresh&&j.forecastDate?month(j.forecastDate):t(!j.hasPlan?'Set a savings plan':!j.fresh?'Forecast unavailable':'Beyond forecast range');
  const pace=p.status!=='Reached'&&j.hasPlan&&j.fresh&&j.forecastDate&&g.deadline?(j.forecastDate<=g.deadline?`<span class="gg-pace positive">${t('On time')}</span>`:`<span class="gg-pace negative">${t('After deadline')}</span>`):'';
  return `<dl class="gg-facts"><div><dt>${svg('flag')}${t('Estimated arrival')}</dt><dd>${arrival}${pace}</dd></div><div><dt>${svg('calendar')}${t('Your target')}</dt><dd>${g.deadline?month(g.deadline):t('No deadline')}</dd></div><div><dt>${svg('clock')}${t('Next planned deposit')}</dt><dd>${next?`${cash(next.amount,c)}<small>${date(next.date)}</small>`:'—'}</dd></div></dl>`;
 }
 function detail(g,j,p,path,pathNotes=[]){
  const c=g.currency,next=nextContribution(g,j),net=j.deposits==null||j.withdrawals==null?null:j.deposits-j.withdrawals;
  const references=g.references||[],hasVisual=g.hasPhoto||Boolean(demoPhoto(g));
  const due=j.months.filter(m=>m.planned>0),met=due.filter(m=>m.net!=null&&m.net>=m.planned).length;
  const scale=Math.max(j.deposits||0,j.withdrawals||0);
  const share=n=>scale>0&&n!=null?Math.min(1,n/scale):0;
  const backdrop=hasVisual?`<img src="${e(photo(g)||'/assets/overview-afternoon.webp')}" alt="" data-goal-photo="${g.id}">`:'';
  return `<section class="gg-detail" data-status="${e(p.status)}" aria-labelledby="gg-detail-title">
   <div class="gg-journey ${hasVisual?'has-photo':''}" data-tone="${goalTone(g.id)}"><div class="gg-journey-backdrop" aria-hidden="true">${backdrop}</div>
    ${ring(p)}
    <div class="gg-journey-summary"><div class="gg-journey-title"><h2 id="gg-detail-title">${e(g.name)}</h2>    <span class="gg-status ${statusClass(p.status)}">${t(statusName(p.status))}</span><a class="gg-journey-edit" href="#/goals/${g.id}/edit">${svg('pencil')}<span>${t('Edit plan')}</span></a></div>
     <p class="gg-journey-amount"><strong>${cash(p.measuredBalance,c)}</strong> <span>${t('of')} ${cash(g.target,c)}</span></p>
     <ul class="gg-journey-meta"><li>${svg('account')}${e(j.accountName||t('Unavailable'))}</li><li>${svg('calendar')}${month(j.from)} – ${month(j.to)}</li></ul>
     ${facts(g,j,p,next)}
    </div>
   </div>
   ${contributionInsight(g,j,p)}
   <section class="gg-block gg-path" aria-labelledby="gg-path-title"><div class="gg-block-head"><h3 id="gg-path-title">${t('Path to your goal')}</h3><div class="gg-path-tools">${path.state?`<span class="gg-count ${path.state==='behind'?'negative':'positive'}">${path.state==='on'?t('On plan'):`${cash(Math.abs(path.diff),c)} ${t(path.state==='behind'?'behind plan':'ahead of plan')}`}</span>`:''}${due.length&&j.historyComplete?`<span class="gg-count ${met===due.length?'positive':'negative'}">${met}/${due.length} ${t('on plan')}</span>`:''}<div class="gg-segmented" role="group" aria-label="${t('Chart range')}"><button type="button" data-path-view="full" aria-pressed="true">${t('To goal')}</button><button type="button" data-path-view="recent" aria-pressed="false">${t('So far')}</button></div></div></div>
    <div class="gg-path-chart" data-path-chart tabindex="0" role="group" aria-label="${e(t('Path to your goal')+'. '+t('Use the arrow keys to move between dates.'))}"><div class="gg-path-svg"></div><div class="gg-path-tip" aria-hidden="true"></div><p class="sr-only" aria-live="polite" data-path-live></p></div>
    <div class="gg-path-foot"><ul class="gg-path-legend">${path.plan.length?`<li><i class="plan"></i>${t('Plan')}</li>`:''}${path.actual.length?`<li><i class="on"></i>${t('Booked balance')}</li>`:''}${path.runs.some(r=>r.state==='behind')?`<li><i class="behind"></i>${t('Behind plan')}</li>`:''}${path.runs.some(r=>r.state==='ahead')?`<li><i class="ahead"></i>${t('Ahead of plan')}</li>`:''}${path.projection.length?`<li><i class="projection ${path.state||'on'}"></i>${t('Projection')}</li>`:''}${path.events.some(x=>x.amount>0)?`<li><i class="dot in"></i>${t('Deposit')}</li>`:''}${path.events.some(x=>x.amount<0)?`<li><i class="dot out"></i>${t('Withdrawal')}</li>`:''}</ul>
    <div class="gg-path-notes">${pathNotes.map(n=>`<p class="gg-path-note warning">${n}</p>`).join('')}${path.projection.length?`<p class="gg-path-note">${t('Estimate assumes future monthly contributions, with no interest or further withdrawals.')} ${t('Planned · not a bank instruction')}</p>`:''}</div></div>
    <ol class="gg-months" aria-label="${t('Contribution by contribution')}">${j.months.map(m=>monthPill(g,m)).join('')}${next?`<li class="gg-month future"><span class="gg-month-icon" aria-hidden="true">${svg('clock')}</span><div><time datetime="${next.date}">${date(next.date)}</time><strong><span class="sr-only">${t('Next planned deposit')}: </span>${cash(next.amount,c)}</strong><small>${t('Next planned deposit')}</small></div></li>`:''}</ol>
   </section>
   <div class="gg-detail-support">
    <section class="gg-block gg-period" aria-labelledby="gg-period-title"><div class="gg-block-head"><h3 id="gg-period-title">${t('Period movements')}</h3></div><p class="gg-range">${svg('calendar')}${date(j.from)} – ${date(j.to)}</p>
     <dl><div class="gg-flow gg-deposits"><dt><span class="gg-flow-icon positive">${svg('up')}</span>${t('Deposits')}</dt><dd class="positive">${j.deposits>0?'+':''}${cash(j.deposits,c)}</dd><dd class="gg-flow-bar" aria-hidden="true"><i data-fill="${share(j.deposits)}"></i></dd></div><div class="gg-flow gg-withdrawals ${p.status!=='Reached'&&j.withdrawals!=null?'negative':''}"><dt><span class="gg-flow-icon negative">${svg('down')}</span>${t('Withdrawals')}</dt><dd>${j.withdrawals>0?'−':''}${cash(j.withdrawals,c)}</dd><dd class="gg-flow-bar" aria-hidden="true"><i data-fill="${share(j.withdrawals)}"></i></dd></div><div class="gg-total"><dt>${t('Net movement')}</dt><dd class="${net<0?'negative':''}">${net>0?'+':''}${cash(net,c)}</dd></div></dl>${!j.historyComplete?`<small class="warning">${t('Complete transaction history is needed to reconcile this period.')}</small>`:''}</section>
    <section class="gg-block gg-purpose" aria-labelledby="gg-purpose-title"><figure class="gg-purpose-visual">${visual(g)}${g.hasPhoto?`<button type="button" class="gg-remove-photo" data-remove-photo="${g.id}">${t('Remove photo')}</button>`:''}</figure><div class="gg-purpose-body"><div class="gg-block-head"><h3 id="gg-purpose-title">${t('What you are saving for')}</h3></div><p class="notes">${e(g.notes||g.description||t('Add notes and links to give your goal context.'))}</p>${references.length?`<div class="gg-reference-links">${references.map(r=>`<a href="${e(r.url)}" target="_blank" rel="noopener noreferrer">${svg('link')}<span>${e(r.label||r.url)}</span> ↗</a>`).join('')}</div>`:''}<a class="gg-edit-notes" href="#/goals/${g.id}/edit" data-goal-focus="notes">${svg('notes')}${t(references.length||g.notes?'Edit notes and links':'Add notes and links')}</a></div></section>
   </div>
   <details class="gg-evidence"><summary><span class="gg-evidence-icon">${svg('list')}</span><span>${t('Account movements and calculation basis')}</span><span class="gg-evidence-count">${j.transactionCount}</span><span class="gg-evidence-chevron">${svg('chevron')}</span></summary><div class="gg-evidence-body"><div class="gg-transactions">${j.transactions.map(x=>`<div><time>${date(x.bookingDate)}</time><span>${e(x.description)}</span><strong class="${x.amount<0?'negative':'positive'}">${x.amount>0?'+':''}${cash(x.amount,c)}</strong></div>`).join('')||`<p>${t('No recorded transactions in this period.')}</p>`}</div>${j.transactionCount>j.transactions.length?`<small>${t('Showing the latest 30 transactions.')}</small>`:''}<div class="gg-basis"><p>${t('Opening balance')}: ${cash(j.openingBalance,c)} · ${t('Current booked balance')}: ${cash(j.closingBalance,c)}</p><p>${t('Opening balance reconstructed from the closing balance and transactions.')}</p>${j.hasPlan?`<p>${t('Estimate assumes future monthly contributions, with no interest or further withdrawals.')}</p>${g.deadline?`<p>${t('Your target')}: ${date(g.deadline)}</p>`:''}`:''}</div></div></details>
  </section>`;
 }
 function countUp(el){
  const to=Number(el.dataset.count);if(!Number.isFinite(to)||calm())return;
  const start=performance.now(),duration=1300;el.textContent=percent(0);
  const step=now=>{if(!el.isConnected)return;const k=Math.min(1,(now-start)/duration);el.textContent=percent(k<1?Math.round(to*(1-Math.pow(1-k,3))*10)/10:to);if(k<1)requestAnimationFrame(step);};
  requestAnimationFrame(step);
 }
 function animate(main){
  main.querySelectorAll('[data-progress]').forEach(el=>el.style.width=el.dataset.progress+'%');main.querySelectorAll('[data-position]').forEach(el=>el.style.left=el.dataset.position+'%');
  main.querySelectorAll('[data-fill]').forEach(el=>el.style.setProperty('--fill',el.dataset.fill));
  main.querySelectorAll('[data-ring]').forEach(el=>el.style.setProperty('--ring-offset',String(RING_C*(1-Number(el.dataset.ring)/100))));
  main.querySelectorAll('.gg-detail>*,.gg-detail-support>*').forEach((el,i)=>el.style.setProperty('--i',String(i)));
  main.querySelectorAll('.gg-month').forEach((el,i)=>el.style.setProperty('--i',String(i)));
  main.querySelectorAll('.gg-card').forEach((el,i)=>el.style.setProperty('--i',String(i)));
  main.querySelectorAll('.gg-ring-tick').forEach(el=>el.style.setProperty('--i',el.dataset.i));
  main.querySelectorAll('[data-count]').forEach(countUp);
 }
 async function accountHistory(g){
  if(!g.accountId)return null;
  const now=new Date(),recent=iso(new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-2,1,12)));
  const from=g.planStart&&g.planStart<recent?g.planStart:recent,items=[];let total=0;
  for(let page=0;page<5;page++){const r=await api(`transactions?accountId=${encodeURIComponent(g.accountId)}&from=${from}&status=BOOK&limit=200&offset=${page*200}`);const list=r?.items||[];items.push(...list);total=r?.total??items.length;if(items.length>=total||!list.length)break;}
  return {items,truncated:items.length<total};
 }
 function pathFor(goal,journey,hist){
  const account=S.accounts?.find(a=>a.id===goal.accountId),start=journey.hasPlan&&goal.planStart?goal.planStart:journey.from,notes=[];
  let historyAvailable=Boolean(hist),historyFrom=null;
  if(account&&(!account.initialImportCompleted||!account.earliestTransaction))historyAvailable=false;
  else if(account&&account.earliestTransaction>start)historyFrom=account.earliestTransaction;
  if(hist?.truncated){const oldest=hist.items.at(-1)?.bookingDate;if(oldest)historyFrom=[historyFrom,addDays(oldest,1)].filter(Boolean).sort().at(-1);}
  if(!hist)notes.push(t('Balance history could not be loaded.'));
  else if(!historyAvailable)notes.push(t('Complete transaction history is needed to reconcile this period.'));
  else if(!journey.fresh)notes.push(t('The balance line appears when the booked balance is up to date.'));
  else if(historyFrom)notes.push(t('Balance history starts {date}.').replace('{date}',date(historyFrom)));
  return {model:goalPath({goal,journey,transactions:hist?.items||[],historyFrom,historyAvailable}),notes};
 }
 let view=null;
 const loadGoal=goal=>Promise.all([api(`goals/${goal.id}/journey`),accountHistory(goal).catch(err=>{if(err?.stale)throw err;return null;})]);
 function bindDetail(section,goal,seq){
  if(!section)return;
  const main=view.main;
  section.querySelectorAll('[data-goal-focus]').forEach(link=>link.addEventListener('click',()=>{S.goalFormFocus=link.dataset.goalFocus;}));
  section.querySelector('[data-remove-photo]')?.addEventListener('click',async ev=>{const b=ev.currentTarget;b.disabled=true;try{await post(`goals/${goal.id}/photo`,{dataUrl:null,version:goal.version},'PUT');if(seq===S.seq)await navigate()}catch(err){if(seq===S.seq)main.querySelector('.gg-error').textContent=errorText(err)}finally{b.disabled=false}});
  if(view.photos.has(goal.id))section.querySelectorAll(`[data-goal-photo="${goal.id}"]`).forEach(img=>img.src=view.photos.get(goal.id));
 }
 const reveal=()=>view?.main.querySelector('.gg-detail')?.scrollIntoView({block:'start',behavior:calm()?'auto':'smooth'});
 async function render(main,goals,selected){
  const seq=S.seq;selected=selected||goals[0].id;const goal=goals.find(g=>g.id===selected);if(!goal)throw{code:'GOAL_NOT_FOUND'};
  const [progress,[journey,hist]]=await Promise.all([Promise.all(goals.map(g=>api(`goals/${g.id}/progress`))),loadGoal(goal)]);
  if(seq!==S.seq)return;
  view={main,goals,progress,selected,seq,token:0,photos:new Map()};
  const path=pathFor(goal,journey,hist);
  const sums=new Map();goals.forEach((g,i)=>{const item=sums.get(g.currency)||{saved:0,planned:0,known:true,planKnown:true};item.known&&=progress[i].measuredBalance!=null;item.planKnown&&=g.monthlyContribution!=null;item.saved+=progress[i].measuredBalance||0;item.planned+=g.monthlyContribution||0;sums.set(g.currency,item)});
  const total=key=>[...sums].map(([currency,n])=>cash((key==='saved'?n.known:n.planKnown)?n[key]:null,currency)).join(' · ');
  main.classList.add('goals-main');main.insertAdjacentHTML('beforeend',header('Goals',`<a class="button-link primary" href="#/goals/new">+ ${t('Create goal')}</a>`)+`<div class="gg-gallery"><section class="gg-hero" data-scene="${dayScene()}"><div class="gg-hero-stats"><div><small>${t('Saved across goal accounts')}</small><strong>${total('saved')}</strong></div><div><small>${t('Your goals')}</small><strong>${goals.length}</strong></div><div><small>${t('Monthly savings plan')}</small><strong>${total('planned')}</strong></div></div></section><div class="gg-cards">${goals.map((g,i)=>card(g,progress[i],selected)).join('')}</div>${detail(goal,journey,progress[goals.indexOf(goal)],path.model,path.notes)}<p class="gg-error error" role="alert"></p></div>`);
  animate(main);mountPath(main.querySelector('.gg-path'),path.model);
  main.querySelectorAll('[data-photo-input]').forEach(el=>el.addEventListener('change',()=>upload(el,goals,main,seq)));
  bindDetail(main.querySelector('.gg-detail'),goal,seq);
  await Promise.all(goals.filter(g=>g.hasPhoto).map(async g=>{const p=await api(`goals/${g.id}/photo`);if(seq===S.seq&&p.dataUrl){view.photos.set(g.id,p.dataUrl);main.querySelectorAll(`[data-goal-photo="${g.id}"]`).forEach(img=>img.src=p.dataUrl)}}));
 }
 // Switches the selected goal inside the mounted gallery; the hero, cards and scroll position stay in place.
 async function select(id){
  const v=view,goal=v.goals.find(g=>g.id===id);const token=++v.token,seq=v.seq;
  v.selected=id;const cards=v.main.querySelector('.gg-cards');
  cards.querySelectorAll('.gg-card').forEach(c=>{const on=c.dataset.goalId===id;c.classList.toggle('selected',on);const link=c.querySelector('.gg-card-content');if(on)link.setAttribute('aria-current','true');else link.removeAttribute('aria-current');});
  const old=v.main.querySelector('.gg-detail');old.classList.add('is-switching');old.setAttribute('aria-busy','true');
  v.main.querySelector('.gg-error').textContent='';
  try{
   const [journey,hist]=await loadGoal(goal);
   if(token!==v.token||seq!==S.seq||!old.isConnected)return;
   const path=pathFor(goal,journey,hist),holder=document.createElement('div');
   holder.innerHTML=detail(goal,journey,v.progress[v.goals.indexOf(goal)],path.model,path.notes);
   const next=holder.firstElementChild;old.replaceWith(next);
   animate(next);mountPath(next.querySelector('.gg-path'),path.model);bindDetail(next,goal,seq);
   const top=next.getBoundingClientRect().top;if(top>innerHeight*.6||top<-next.offsetHeight/2)reveal();
  }catch(err){
   if(err?.stale||token!==v.token)return;
   old.classList.remove('is-switching');old.removeAttribute('aria-busy');v.main.querySelector('.gg-error').textContent=errorText(err);
  }
 }
 // Returns true when a goal route can be shown without re-rendering the page.
 function selectFromRoute(hash){
  const m=/^#\/goals\/([^/]+)$/.exec(hash||'');
  if(!m||!view||!view.main.isConnected||view.seq!==S.seq||!view.goals.some(g=>g.id===m[1]))return false;
  if(location.hash!==hash)history.pushState(null,'',hash);
  S.currentHash=hash;onRoute(m[1]);
  if(m[1]===view.selected){reveal();return true;}
  select(m[1]);return true;
 } async function upload(input,goals,main,seq){
  const file=input.files[0];if(!file)return;const g=goals.find(g=>g.id===input.dataset.photoInput);
  input.disabled=true;S.saving=true;const label=input.closest('label');label.classList.add('saving');
  try{
   if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024)throw{code:'Choose a JPEG, PNG or WebP image under 10 MB.'};
   const bitmap=await createImageBitmap(file);const canvas=document.createElement('canvas');const scale=Math.min(1,900/bitmap.width,600/bitmap.height);canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
   let dataUrl;for(let quality=.86;quality>=.16;quality-=.1){dataUrl=canvas.toDataURL('image/jpeg',quality);if(dataUrl.length<=58000)break}
   if(dataUrl.length>58000){const small=document.createElement('canvas');small.width=Math.round(canvas.width*.6);small.height=Math.round(canvas.height*.6);small.getContext('2d').drawImage(canvas,0,0,small.width,small.height);dataUrl=small.toDataURL('image/jpeg',.55)}
   if(dataUrl.length>58000)throw{code:'This photo is too detailed. Try a smaller image.'};
   if(seq!==S.seq)return;
   await post(`goals/${g.id}/photo`,{dataUrl,version:g.version},'PUT');if(seq===S.seq){notice('Photo saved');await navigate()}
  }catch(err){if(seq===S.seq)main.querySelector('.gg-error').textContent=errorText(err)}finally{S.saving=false;input.disabled=false;label.classList.remove('saving');input.value=''}
 }

 const legend=(glyphName,label,optional=false)=>`<legend><span class="gg-fs-icon" aria-hidden="true">${svg(glyphName)}</span><span>${t(label)}</span>${optional?`<span class="gg-fs-optional">${t('Optional')}</span>`:''}</legend>`;
 function preview(g){
  const media=g.hasPhoto||demoPhoto(g)?`<img src="${e(photo(g)||'/assets/overview-afternoon.webp')}" alt="" data-goal-photo="${g.id}">`:`<div class="gg-photo-default" data-tone="${goalTone(g.id||'new')}" aria-hidden="true" data-preview-glyph>${glyph(g.name)}</div>`;
  return `<aside class="gg-preview" aria-label="${t('Preview')}"><div class="gg-preview-card"><div class="gg-preview-media">${media}</div><div class="gg-preview-body"><strong class="gg-preview-name" data-preview="name"></strong><p class="gg-preview-description" data-preview="description"></p><div class="gg-preview-target"><small>${t('Target amount')}</small><strong data-preview="target"></strong></div><div class="gg-preview-start" aria-hidden="true"><i data-preview-fill></i></div><dl class="gg-preview-plan"><div><dt>${t('Monthly savings')}</dt><dd data-preview="monthly"></dd></div><div><dt>${t('Deadline')}</dt><dd data-preview="deadline"></dd></div><div><dt>${t('Plan reaches target')}</dt><dd data-preview="reach"></dd></div><div><dt>${t('Needed per month for the deadline')}</dt><dd data-preview="needed"></dd></div></dl><p class="gg-preview-pace" data-preview="pace" aria-live="polite"></p><small class="gg-preview-note">${t('Estimate from the plan values. Progress uses the booked balance.')}</small></div></div></aside>`;
 }
 function bindPreview(root){
  const field=id=>root.querySelector('#'+id),num=id=>{const v=field(id)?.value;return v===''||v==null?NaN:Number(v);};
  const set=(key,html)=>{const el=root.querySelector(`[data-preview="${key}"]`);if(el)el.innerHTML=html;};
  const perMonth=(n,c)=>`${cash(n,c)}<small>/${t('month')}</small>`;
  const update=()=>{
   const c=field('goal-currency')?.value||S.currency,name=field('name').value.trim(),target=num('target'),start=num('starting-balance'),monthly=num('monthly-contribution'),deadline=field('deadline').value;
   set('name',e(name||t('Your goal')));set('description',e(field('description').value.trim()));
   set('target',target>0?cash(target,c):'—');set('monthly',monthly>0?perMonth(monthly,c):'—');set('deadline',deadline?month(deadline):t('No deadline'));
   const plan=planPreview({target,startingBalance:start,monthly,planStart:field('plan-start').value,deadline,day:num('contribution-day')});
   set('reach',plan.reachDate?month(plan.reachDate):'—');set('needed',plan.needed!=null?perMonth(plan.needed,c):'—');
   const pace=root.querySelector('[data-preview="pace"]');pace.dataset.tone=plan.onPace==null?'':plan.onPace?'positive':'negative';
   pace.textContent=plan.onPace==null?'':t(plan.onPace?'The plan reaches the target before the deadline.':'The plan finishes after the deadline.');
   root.querySelector('[data-preview-fill]')?.style.setProperty('--fill',String(target>0&&Number.isFinite(start)?Math.min(1,Math.max(0,start/target)):0));
   const glyphBox=root.querySelector('[data-preview-glyph]');if(glyphBox)glyphBox.innerHTML=glyph(name);
  };
  root.addEventListener('input',update);root.addEventListener('change',update);update();
 }
 function form(main,goals,goal){
  const g=goal||{},edit=Boolean(goal);
  const available=S.accounts.filter(a=>a.accessible&&!goals.some(other=>other.id!==g.id&&other.accountId===a.id));
  main.insertAdjacentHTML('beforeend',`<div class="form-page gg-form-page"><div class="form-head"><a class="back-link" href="#/goals">← ${t('Back to goals')}</a><h1>${t(edit?'Edit goal':'Create goal')}</h1></div><form class="form gg-form" id="goal-form"><div class="gg-form-layout"><div class="gg-form-sections">
   <fieldset class="gg-fs">${legend('target','Goal')}${input('name','Name',g.name||'','text','required maxlength="120"')}${textArea('description','Description',g.description||'',2000,true)}</fieldset>
   <fieldset class="gg-fs">${legend('flag','Target')}<div class="field-row">${input('target','Target amount',g.target??'','number','required min="0.01" max="999999999999" step="0.01" inputmode="decimal"')}${selectField('goal-currency','Currency',currencyItems(),g.currency||S.currency)}</div>${input('deadline',t('Deadline')+' · '+t('Optional'),g.deadline||'','date')}</fieldset>
   <fieldset class="gg-fs">${legend('account','Account')}<div id="goal-account-field">${selectField('goal-account','Dedicated account',[['',t('Choose account')],...available.map(a=>[a.id,`${a.name} · ${a.currency}`])],g.accountId||'','data-action="goal-account" required')}</div><small>${t('One goal per account. Accounts already assigned to a goal are unavailable.')}</small>${!available.length?`<p class="muted">${t('No unassigned accounts. Connect a dedicated account to create another goal.')} <a href="#/connections">${t('Connections')} →</a></p>`:''}<small>${t('Tracks your booked balance. No money is moved.')}</small></fieldset>
   <fieldset class="gg-fs">${legend('trend','Savings pace',true)}<p class="muted">${t('Define a starting balance and deadline to track your pace.')}</p><div class="field-row">${input('plan-start','Plan start',g.planStart||'','date')}${input('starting-balance','Starting balance',g.startingBalance??'','number','step="0.01" max="999999999999" min="-999999999999" inputmode="decimal"')}</div><div class="field-row">${input('monthly-contribution','Monthly savings',g.monthlyContribution??'','number','step="0.01" min="0.01" max="999999999999" inputmode="decimal"')}${input('contribution-day','Contribution day of month',g.contributionDay||1,'number','min="1" max="28" step="1"')}</div><small>${t('Expected net deposits into this account. A starting balance, plan start and deadline are required. No transfer is scheduled.')}</small></fieldset>
   <fieldset class="gg-fs" id="goal-notes-section">${legend('notes','Notes and links',true)}${textArea('notes','Notes',g.notes||'',8000)}<div id="goal-links">${(g.references||[]).map(linkRow).join('')}</div>${button('Add link','add-link','','gg-add-link')}</fieldset>
  </div>${preview(g)}</div><div class="error" role="alert"></div><div class="form-actions">${edit?button('Delete goal','delete-goal',`data-id="${g.id}" data-version="${e(g.version)}"`,'quiet danger gg-form-delete'):''}<a href="#/goals">${t('Cancel')}</a><button class="primary" type="submit">${t(edit?'Save changes':'Create goal')}</button></div></form></div>`);
  const root=main.querySelector('#goal-form');bindPreview(root);
  if(g.hasPhoto)api(`goals/${g.id}/photo`).then(p=>{if(p.dataUrl)root.querySelectorAll(`[data-goal-photo="${g.id}"]`).forEach(img=>img.src=p.dataUrl);}).catch(()=>{});
  if(S.goalFormFocus==='notes'){S.goalFormFocus=null;requestAnimationFrame(()=>{const notes=root.querySelector('#notes');notes?.closest('fieldset')?.scrollIntoView({block:'start',behavior:calm()?'auto':'smooth'});notes?.focus({preventScroll:true});});}
  else requestAnimationFrame(()=>{const modal=root.closest('dialog');if(modal)modal.scrollTop=0;});
 }
 return {render,form,selectFromRoute};
}
