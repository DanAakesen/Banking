import { MODE_FRAMES, resolvePreset, paintFrame } from '../vendor/libraries-dev/thinking-orbs/src/engine/index.ts';
import { registerPulseInstance } from '../vendor/libraries-dev/border-beam/src/pulseDriver.ts';
import { configs } from './pulse-config.js';
import { overviewOrbState, isAdvisorPage } from './state.mjs';

// The floating companion uses the same pinned engine and state selection as the composer.
export function setupCompanionOrb(canvas) {
 const size = 112, dpr = Math.min(2, devicePixelRatio || 1), ctx = canvas.getContext('2d');
 canvas.width = canvas.height = size * dpr;
 const reduced = matchMedia('(prefers-reduced-motion: reduce)');
 let selection = null, visible = true, raf = 0, last = 0, disposed = false;
 function draw(t = .6) {
  if (!ctx || !selection) return;
  const preset = resolvePreset(selection.orb, 64);
  ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,size,size);
  ctx.scale(size/64,size/64);
  paintFrame(ctx, MODE_FRAMES[preset.mode](64,t*preset.speed,preset.opts), !['light','sand'].includes(document.documentElement.dataset.theme));
 }
 function loop(t) { if(t-last>=32){draw(t/1000);last=t;} raf=requestAnimationFrame(loop); }
 function sync() { if(disposed)return;cancelAnimationFrame(raf);draw();if(selection&&!selection.paused&&visible&&!document.hidden&&!reduced.matches)raf=requestAnimationFrame(loop); }
 const io=new IntersectionObserver(([e])=>{visible=e.isIntersecting;sync();});io.observe(canvas);
 const theme=new MutationObserver(sync);theme.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
 reduced.addEventListener('change',sync);document.addEventListener('visibilitychange',sync);
 return { setVoice(value){selection=overviewOrbState(value);canvas.dataset.orbState=selection?.orb||'idle';sync();return selection;},
  dispose(){disposed=true;cancelAnimationFrame(raf);io.disconnect();theme.disconnect();reduced.removeEventListener('change',sync);document.removeEventListener('visibilitychange',sync);} };
}

export function setupOverviewEffects() {
 const root = document.documentElement, shell = document.getElementById('advisor-shell');
 const composer = document.querySelector('.composer');
 const inert = { setVoice() {}, setWorking() {}, dispose() {} };
 if (!composer || !shell || parent === window || !new URLSearchParams(location.search).has('embedded')) return inert;
 const bloom = document.createElement('span');
 bloom.dataset.beamBloom = ''; bloom.setAttribute('aria-hidden', 'true');
 composer.append(bloom);
 const status = document.createElement('span');
 status.className = 'overview-orb-status'; status.hidden = true;
 const canvas = document.createElement('canvas');
 canvas.className = 'overview-thinking-orb'; canvas.setAttribute('aria-hidden', 'true');
 const label = document.createElement('span'); label.className = 'overview-orb-label';
 label.setAttribute('role', 'status'); label.setAttribute('aria-live', 'polite');
 status.append(canvas, label); document.querySelector('#advisor-activity summary').prepend(status);
 const ctx = canvas.getContext('2d');
 const dpr = Math.min(2, devicePixelRatio || 1);
 canvas.width = canvas.height = 64 * dpr;
 const reduced = matchMedia('(prefers-reduced-motion: reduce)');
 let enabled = false, visible = false, working = false, voice = {}, selection = null;
 let theme = 'dark', beamId, unregisterPulse, raf = 0, lastFrame = 0, disposed = false;

 function draw(t = .6) {
  if (!ctx || !selection) return;
  const preset = resolvePreset(selection.orb, 64);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, 64, 64);
  paintFrame(ctx, MODE_FRAMES[preset.mode](64, t * preset.speed, preset.opts), theme === 'dark');
 }
 function loop(t) {
  if (t - lastFrame >= 32) { draw(t / 1000); lastFrame = t; }
  raf = requestAnimationFrame(loop);
 }
 function stop() { unregisterPulse?.(); unregisterPulse = null; cancelAnimationFrame(raf); raf = 0; }
 function sync() {
  if (disposed) return;
  stop();
  theme = ['light', 'sand'].includes(root.dataset.theme) ? 'light' : 'dark';
  beamId = `overview-ai-${theme}`;
  if (enabled) {
   root.dataset.overviewEffects = 'true';
   composer.dataset.beam = beamId; composer.dataset.active = '';
   composer.style.setProperty('--beam-strength', '.8');
   composer.style.setProperty(`--beam-opacity-${beamId}`, '1');
  } else {
   delete root.dataset.overviewEffects; delete composer.dataset.beam; delete composer.dataset.active;
  }
  selection = enabled ? overviewOrbState({working:working || (voice.active && (voice.toolActive || voice.state==='working'))}) : null;
  status.hidden = !selection;
  if (selection) {
   canvas.dataset.orbState = selection.orb;
   if (label.textContent !== selection.label) label.textContent = selection.label;
   draw();
  } else { label.textContent = ''; delete canvas.dataset.orbState; }
  const running = enabled && visible && !document.hidden && !reduced.matches;
  if (running) unregisterPulse = registerPulseInstance(composer, configs[theme]);
  if (running && selection && !selection.paused && ctx) raf = requestAnimationFrame(loop);
 }
 const receive = event => {
  if (event.source !== parent || event.origin !== location.origin) return;
  if (event.data?.type === 'advisor:context') {
   const next = isAdvisorPage(event.data.context?.page);
   if (next !== enabled) { enabled = next; sync(); }
  }
 };
 window.addEventListener('message', receive);
 const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
 io.observe(composer);
 const themes = new MutationObserver(sync); themes.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
 reduced.addEventListener('change', sync); document.addEventListener('visibilitychange', sync);
 // The parent sends a fresh context when the advisor announces readiness.
 const dispose = () => {
  if (disposed) return; stop(); disposed = true;
  io.disconnect(); themes.disconnect(); window.removeEventListener('message', receive);
  reduced.removeEventListener('change', sync); document.removeEventListener('visibilitychange', sync);
  delete root.dataset.overviewEffects; delete composer.dataset.beam; delete composer.dataset.active;
  bloom.remove(); status.remove();
 };
 window.addEventListener('pagehide', dispose, { once: true });
 return {
  setVoice(value) {
   const next = { active: Boolean(value.active), state: value.state, toolActive: Boolean(value.toolActive) };
   if (JSON.stringify(next) !== JSON.stringify(voice)) { voice = next; sync(); }
  },
  setWorking(value) { if (working !== Boolean(value)) { working = Boolean(value); sync(); } },
  dispose
 };
}
