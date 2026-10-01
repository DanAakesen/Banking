import assert from 'node:assert/strict';
import test from 'node:test';
import {categoryIcon,categoryIconPaths,goalGlyph,goalTone,demoGoalPhoto,balanceAgeDays} from '../../src/Banking.Api/wwwroot/overview.js';

test('category icons follow the category name, not its position',()=>{
 const expected={Bolig:'cat-home',Dagligvarer:'cat-cart',Transport:'cat-car',Børn:'cat-child',Restaurantbesøg:'cat-dining',Forsikring:'cat-shield',Fritid:'cat-leisure',Tøj:'cat-shirt',Gaver:'cat-gift',Ferie:'cat-plane',Abonnementer:'cat-repeat',Sundhed:'cat-health',Indkøb:'cat-bag',Groceries:'cat-cart',Housing:'cat-home','Anden indkomst':'cat-coins',Uncategorized:'cat-question'};
 for(const [name,key] of Object.entries(expected))assert.equal(categoryIcon(name),key,name);
 assert.equal(categoryIcon('Something new'),'cat-tag');
 assert.equal(categoryIcon('Andet',{other:true}),'more');
});

test('every mapped category icon has a drawable path',()=>{
 for(const name of ['Bolig','Transport','Børn','Tøj','Unknown category'])assert.ok(categoryIconPaths[categoryIcon(name)],name);
});

test('goals without photos get a name-based glyph, a stable tone and Danish/English demo photos',()=>{
 assert.equal(goalGlyph('Familieferie'),'cat-plane');assert.equal(goalGlyph('Bil'),'cat-car');assert.equal(goalGlyph('Sommerhus'),'cat-home');assert.equal(goalGlyph('Nødopsparing'),'goals');
 assert.equal(goalTone('a-goal-id'),goalTone('a-goal-id'));assert.ok(goalTone('x')>=0&&goalTone('x')<6);
 assert.equal(demoGoalPhoto('Bil'),'car');assert.equal(demoGoalPhoto('Summer house'),'summer-house');assert.equal(demoGoalPhoto('Familieferie'),null);
});

test('stale goal balances report their age from the oldest source',()=>{
 const now=Date.parse('2026-09-25T12:00:00Z');
 assert.equal(balanceAgeDays({sources:[{observedAt:'2026-09-12T08:20:00Z'},{bankTime:'2026-09-20T08:00:00Z',observedAt:'2026-09-21T08:00:00Z'}]},now),13);
 assert.equal(balanceAgeDays({sources:[]},now),null);
});
