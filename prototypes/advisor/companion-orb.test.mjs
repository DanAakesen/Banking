import test from 'node:test';
import assert from 'node:assert/strict';
import { setupCompanionOrb } from './public/overview-effects.js';

test('floating orb paints every actual preset at 112px and releases its observers',()=>{
 let dots=0,disconnected=0,cancelled=0;const transforms=[];
 const ctx={setTransform(){},clearRect(){},scale(...v){transforms.push(v);},beginPath(){},arc(){dots++;},fill(){},moveTo(){},lineTo(){},stroke(){}};
 const saved=new Map();const install=(key,value)=>{saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});};
 install('devicePixelRatio',2);install('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
 install('document',{hidden:false,documentElement:{dataset:{theme:'graphite'}},addEventListener(){},removeEventListener(){}});
 install('IntersectionObserver',class{observe(){}disconnect(){disconnected++;}});
 install('MutationObserver',class{observe(){}disconnect(){disconnected++;}});
 install('requestAnimationFrame',()=>1);install('cancelAnimationFrame',()=>cancelled++);
 try{
  const canvas={dataset:{},getContext:()=>ctx};const orb=setupCompanionOrb(canvas);
  for(const [state,toolActive,expected] of [['listening',false,'breathing'],['speaking',false,'composing'],['working',false,'solving'],['working',true,'searching'],['connecting',false,'breathing']]){
   const before=dots;orb.setVoice({active:true,state,toolActive});assert.equal(canvas.dataset.orbState,expected);assert.ok(dots>before,expected+' rendered particles');
  }
  assert.equal(canvas.width,224);assert.deepEqual(transforms[0],[1.75,1.75]);
  orb.dispose();assert.equal(disconnected,2);assert.ok(cancelled>0);
 }finally{for(const [key,descriptor] of saved)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
});
