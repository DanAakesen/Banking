import test from 'node:test';
import assert from 'node:assert/strict';
import { overviewOrbState, isAdvisorPage } from './overview-effects/state.mjs';

test('Overview voice maps listening, speech, processing and tool requests to the selected orbs', () => {
 assert.equal(overviewOrbState({ active:true, state:'listening' }).orb, 'breathing');
 assert.equal(overviewOrbState({ active:true, state:'speaking' }).orb, 'composing');
 assert.equal(overviewOrbState({ active:true, state:'working' }).orb, 'solving');
 assert.equal(overviewOrbState({ active:true, state:'working', toolActive:true }).orb, 'searching');
 assert.equal(overviewOrbState({ working:true }).orb, 'solving');
});
test('actual speech takes priority over background work; stopped voice cannot leave a searching orb', () => {
 assert.equal(overviewOrbState({ active:true, state:'speaking', toolActive:true, working:true }).orb, 'composing');
 assert.equal(overviewOrbState({ active:true, state:'ending', toolActive:true }).paused, true);
 assert.equal(overviewOrbState({ active:false, state:'idle', toolActive:true }), null);
 assert.equal(overviewOrbState({ active:true, state:'connecting' }).label, 'Connecting');
});
test('shared advisor effects follow every Banking page and nested detail route', () => {
 for (const page of ['overview','accounts','review','budgets','goals','advisor','investments','pension','markets','loans','analysis','memory','settings','connections','activity','categories','transfers']) {
  assert.equal(isAdvisorPage('#/'+page), true, page);
  assert.equal(isAdvisorPage('#/'+page+'/detail'), true, page+' detail');
 }
 assert.equal(isAdvisorPage('#overview'), true);
 for (const page of ['', undefined, null, 'https://example.com', '#', '#/']) assert.equal(isAdvisorPage(page), false);
});
