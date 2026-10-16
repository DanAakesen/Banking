// Instrument native observers in synthetic browser tests; no product hook or replacement layout behavior.
module.exports=function trackEmployeeStockResize(){
 const Native=window.ResizeObserver;window.__stockObservers=[];
 window.ResizeObserver=class extends Native{
  constructor(callback){const state={target:null,calls:0,disconnected:false};super(entries=>{if(state.target)state.calls++;callback(entries);});this.stockState=state;}
  observe(target,options){if(target.id==='stock-chart'&&!this.stockState.target){this.stockState.target=target;window.__stockObservers.push(this.stockState);}super.observe(target,options);}
  disconnect(){this.stockState.disconnected=true;super.disconnect();}
 };
};
