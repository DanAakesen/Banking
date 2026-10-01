import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=(await readFile(new URL('../../src/Banking.Api/wwwroot/overview-advisor.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/,'').replaceAll('export ','');
function bottom({mobile=true,navTop=740,navHeight=104,viewportHeight=844,offset=0,height=160}={}){
 const scope=vm.createContext({visualViewport:{width:390,height:viewportHeight,offsetTop:offset},innerWidth:390,innerHeight:844,
  matchMedia:()=>({matches:mobile}),document:{documentElement:{},querySelector:()=>({getBoundingClientRect:()=>({top:navTop,height:navHeight,width:390})})},
  localStorage:{getItem:()=>null},window:{addEventListener(){}},MutationObserver:class{observe(){}}});
 vm.runInContext(source,scope);
 return vm.runInContext(`clamp({x:12,y:9999},300,${height}).y+${height}`,scope);
}
test('mobile chat and minimized companion stop above the measured navigation including safe-area height',()=>{
 for(const height of [112,160,184])assert.equal(bottom({height}),728);
 assert.equal(bottom({navTop:700,navHeight:144}),688);
});
test('desktop retains its existing viewport boundary',()=>assert.equal(bottom({mobile:false}),832));
test('keyboard viewport and pages without bottom navigation use the visible viewport boundary',()=>{
 assert.equal(bottom({viewportHeight:400}),388);
 assert.equal(bottom({navHeight:0}),832);
 assert.equal(bottom({viewportHeight:400,offset:100}),488);
});
