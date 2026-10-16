// Instrument native observers in synthetic browser tests; no product hook or replacement layout behavior.
module.exports=function trackEmployeeStockResize(){
 const add=window.addEventListener.bind(window),remove=window.removeEventListener.bind(window);window.__stockWindowListeners=[];
 window.addEventListener=function(type,listener,options){if(['scroll','resize','keydown'].includes(type)&&['positionTooltip','dismissTooltip'].includes(listener?.name))window.__stockWindowListeners.push({type,listener,capture:options===true,removed:false});return add(type,listener,options);};
 window.removeEventListener=function(type,listener,options){for(const item of window.__stockWindowListeners)if(item.type===type&&item.listener===listener&&item.capture===(options===true))item.removed=true;return remove(type,listener,options);};
 const Native=window.ResizeObserver;window.__stockObservers=[];
 window.ResizeObserver=class extends Native{
  constructor(callback){const state={target:null,calls:0,disconnected:false};super(entries=>{if(state.target)state.calls++;callback(entries);});this.stockState=state;}
  observe(target,options){if(target.id==='stock-chart'&&!this.stockState.target){this.stockState.target=target;window.__stockObservers.push(this.stockState);}super.observe(target,options);}
  disconnect(){this.stockState.disconnected=true;super.disconnect();}
 };
};
