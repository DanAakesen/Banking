import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source=(await readFile(new URL('../../src/Banking.Api/wwwroot/overview-advisor.js',import.meta.url),'utf8'))
 .replace(/^import .*;\r?\n/,'').replaceAll('export ','');
function harness(){
 const listeners={},nodes=new Map(),states=[];
 const node=()=>({hidden:false,textContent:'',dataset:{},style:{},getAttribute(){return null;},querySelectorAll(){return [];},setAttribute(){},classList:{toggle(){},remove(){}},getBoundingClientRect:()=>({right:700,bottom:600})});
 const pill=node();pill.querySelector=selector=>{if(!nodes.has(selector))nodes.set(selector,node());return nodes.get(selector);};
 const frame={contentWindow:{postMessage(){}}};
 const context=vm.createContext({fixture:{pill,frame,host:node(),orb:{setVoice(value){states.push(value);return {label:'Listening'};}}},
  window:{addEventListener:(name,fn)=>listeners[name]=fn},document:{documentElement:{dataset:{}}},location:{origin:'https://local.test'},
  localStorage:{getItem(){return null;},setItem(){}},MutationObserver:class{observe(){}},requestAnimationFrame:()=>1,cancelAnimationFrame(){}});
 vm.runInContext(source+'\nhost=fixture.host;frame=fixture.frame;pill=fixture.pill;orb=fixture.orb;presentation="mini";updateCompanion();',context);
 return {pill,nodes,states,
  send(data,origin='https://local.test',sender=frame.contentWindow){listeners.message({source:sender,origin,data});},
  open(){vm.runInContext('present("panel")',context);},
  minimize(){vm.runInContext('present("mini")',context);},
  voice(value){vm.runInContext(`active=${value};lastVoice={state:'listening'};updateCompanion();`,context);},
  get label(){return nodes.get('.companion-state').textContent;},get badge(){return nodes.get('.companion-unread');}
 };
}
test('minimized text goes Ready -> Working -> unread reply; opening clears it',()=>{
 const h=harness();assert.equal(h.label,'Ready');assert.equal(h.badge.hidden,true);
 h.send({type:'advisor:working',working:true});assert.equal(h.label,'Working');assert.equal(h.states.at(-1).state,'working');
 h.send({type:'advisor:reply'});assert.equal(h.label,'Working');
 h.send({type:'advisor:working',working:false});assert.equal(h.label,'Reply ready');assert.equal(h.badge.hidden,false);
 h.open();h.minimize();assert.equal(h.label,'Ready');assert.equal(h.badge.hidden,true);
});
test('failures have a distinct unread state, and open-chat replies stay read',()=>{
 const h=harness();h.send({type:'advisor:reply',error:true});assert.equal(h.label,'Check chat');assert.equal(h.badge.textContent,'!');
 h.open();h.send({type:'advisor:reply'});h.minimize();assert.equal(h.label,'Ready');assert.equal(h.badge.hidden,true);
});
test('foreign frame events are ignored and active voice keeps its own status',()=>{
 const h=harness();h.send({type:'advisor:working',working:true},'https://other.test');
 h.send({type:'advisor:reply'},'https://local.test',{});assert.equal(h.label,'Ready');
 h.voice(true);h.send({type:'advisor:working',working:true});h.send({type:'advisor:reply'});
 assert.equal(h.label,'Listening');assert.equal(h.badge.hidden,true);
});
