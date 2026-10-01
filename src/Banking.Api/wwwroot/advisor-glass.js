import { createLiquidGlass } from './vendor/liquid-glass/liquid-glass.js';

// Backdrop filters cannot sample across an iframe. Decorative parent-page
// panes follow the same-origin chat geometry, underneath the actual controls.
export function createAdvisorGlass(host, frame) {
 const layer=document.createElement('div');layer.className='advisor-glass-layer';layer.setAttribute('aria-hidden','true');host.prepend(layer);
 const surfaces=new Map(),observed=new Set();
 const selector='.message-content,.advisor-activity,.budget-proposal,.canvas-panel,.heading-actions,.composer,.starters button';
 let doc,observer,raf=0,disposed=false;
 const reduced=matchMedia('(prefers-reduced-transparency: reduce)');
 const schedule=()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(sync);};
 const resize=new ResizeObserver(schedule);resize.observe(host);
 function remove(element){const item=surfaces.get(element);if(!item)return;item.glass.destroy();item.pane.remove();surfaces.delete(element);resize.unobserve(element);observed.delete(element);}
 function sync(){
  if(disposed||!doc)return;
  const enabled=document.documentElement.dataset.aiGlass==='true';
  if(doc.documentElement.dataset.aiGlass!==String(enabled))doc.documentElement.dataset.aiGlass=String(enabled);
  const visible=enabled&&!host.hidden&&!reduced.matches;
  layer.hidden=!visible;
  if(!visible){for(const el of surfaces.keys())remove(el);return;}
  const elements=new Set();
  for(const el of doc.querySelectorAll(selector)){
   if(elements.size>=32||el.closest('[hidden],[inert]'))continue;
   const view=doc.defaultView,r=el.getBoundingClientRect(),style=view.getComputedStyle(el);
   if(!r.width||!r.height||style.visibility==='hidden'||style.display==='none')continue;
   let top=Math.max(0,r.top),left=Math.max(0,r.left),right=Math.min(frame.clientWidth,r.right),bottom=Math.min(frame.clientHeight,r.bottom);
   for(let parent=el.parentElement;parent&&parent!==doc.body;parent=parent.parentElement){
    const css=view.getComputedStyle(parent),p=parent.getBoundingClientRect();
    if(/auto|scroll|hidden|clip/.test(css.overflowY)){top=Math.max(top,p.top);bottom=Math.min(bottom,p.bottom);}
    if(/auto|scroll|hidden|clip/.test(css.overflowX)){left=Math.max(left,p.left);right=Math.min(right,p.right);}
   }
   if(bottom<=top||right<=left)continue;
   elements.add(el);
   let item=surfaces.get(el);
   if(!item){const pane=document.createElement('div');pane.className='advisor-glass-pane';layer.append(pane);item={pane,glass:null};surfaces.set(el,item);}
   Object.assign(item.pane.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px',borderRadius:style.borderRadius,clipPath:`inset(${top-r.top}px ${r.right-right}px ${r.bottom-bottom}px ${left-r.left}px)`});
   // Match the chat's top fade on the separate parent-page optical surface.
   const scroller=el.closest('.conversation-scroll');
   const fadeStart=scroller?scroller.getBoundingClientRect().top-r.top:0;
   const fade=scroller&&scroller.scrollTop>1?`linear-gradient(to bottom,transparent ${fadeStart}px,#000 ${fadeStart+28}px)`:'none';
   item.pane.style.maskImage=fade;item.pane.style.webkitMaskImage=fade;
   if(!item.glass){try{item.glass=createLiquidGlass(item.pane,{borderRadius:parseFloat(style.borderRadius)||18,scale:-72,aberration:[0,1,2],blur:3,border:.14,alpha:1,displaceBlur:2,saturation:1.08,fallbackFilter:'blur(12px) saturate(1.1)'});}catch{item.glass={destroy(){}};item.pane.style.backdropFilter='blur(12px)';}}
   if(!observed.has(el)){resize.observe(el);observed.add(el);}
  }
  for(const el of surfaces.keys())if(!elements.has(el))remove(el);
 }
 function disconnect(){observer?.disconnect();doc?.removeEventListener('scroll',schedule,true);doc?.removeEventListener('toggle',schedule,true);for(const el of surfaces.keys())remove(el);}
 function connect(){
  disconnect();
  try{doc=frame.contentDocument;if(!doc?.body)return;}catch{return;}
  observer=new MutationObserver(schedule);observer.observe(doc.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden','class','open']});
  doc.addEventListener('scroll',schedule,true);doc.addEventListener('toggle',schedule,true);schedule();
 }
 const settings=new MutationObserver(schedule);settings.observe(document.documentElement,{attributes:true,attributeFilter:['data-ai-glass','data-theme']});
 const visibility=new MutationObserver(schedule);visibility.observe(host,{attributes:true,attributeFilter:['hidden','data-presentation']});
 frame.addEventListener('load',connect);reduced.addEventListener('change',schedule);
 if(frame.contentDocument?.readyState==='complete')connect();
 return {destroy(){disposed=true;cancelAnimationFrame(raf);disconnect();settings.disconnect();visibility.disconnect();resize.disconnect();frame.removeEventListener('load',connect);reduced.removeEventListener('change',schedule);layer.remove();}};
}
