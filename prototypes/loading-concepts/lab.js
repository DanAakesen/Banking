// Prototype controller. Response times are simulated; no data is requested.
(() => {
const C = window.LoadingConcepts, $ = s => document.querySelector(s);
const routes = ['Overview', 'Accounts', 'Budgets', 'Goals', 'Markets'];
const stages = ['Loading accounts', 'Preparing your overview', 'Opening workspace'];
const SHOW_AFTER = 250, MIN_VISIBLE = 450;
const state = { concept: 'knot', delay: 3000, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, route: 'Overview' };
let run = 0, boot = null, bootInst = null, markInst = null, inline = null, inlineEl = null, inlineShownAt = 0;
const wait = ms => new Promise(r => setTimeout(r, ms));
const make = (host, size, opts = {}) => C[state.concept].make(host, size, { reduced: state.reduced, ...opts });
const frame = $('#frame'), main = $('#main'), content = $('#content'), mark = $('#mark');

function renderPage(route) {
 content.innerHTML = `<h2>${route}</h2><p>Placeholder page content. No financial data.</p><div class="ph" aria-hidden="true"><span></span><span></span><span></span><span></span></div>`;
 document.querySelectorAll('#nav button').forEach(b => b.textContent === route ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
}
function renderMark() { markInst?.destroy(); markInst = make(mark, 26, { small: true, rest: true }); }
function transition(update) {
 if (!document.startViewTransition || state.reduced) { update(); return Promise.resolve(); }
 return document.startViewTransition(update).finished.catch(() => {});
}
function clearInline() { inline?.destroy(); inlineEl?.remove(); inline = inlineEl = null; content.classList.remove('is-stale'); }
function clearBoot() { bootInst?.destroy(); boot?.remove(); boot = bootInst = null; mark.style.visibility = ''; }
function setStatus(text) { const s = boot?.querySelector('.boot-status'); if (s) s.innerHTML = `<span>${text}</span>`; }

async function startup() {
 const r = ++run; clearInline(); clearBoot(); renderMark(); renderPage(state.route);
 boot = document.createElement('div'); boot.className = 'boot';
 boot.innerHTML = `<div class="boot-glyph"></div><p class="boot-status" role="status"></p>`;
 frame.append(boot); setStatus(stages[0]); mark.style.visibility = 'hidden';
 const glyph = boot.querySelector('.boot-glyph');
 bootInst = make(glyph, matchMedia('(max-width:700px)').matches ? 96 : 112);
 // In the app these stages would follow completed requests, not timers.
 setTimeout(() => r === run && setStatus(stages[1]), state.delay * .35);
 setTimeout(() => r === run && setStatus(stages[2]), state.delay * .75);
 await wait(state.delay); if (r !== run) return;
 setStatus('Your workspace is ready');
 await bootInst.settle(); if (r !== run) return;
 glyph.style.viewTransitionName = 'mark';
 await transition(() => { clearBoot(); mark.style.viewTransitionName = 'mark'; });
 mark.style.viewTransitionName = '';
}

async function go(route) {
 if (boot) return;
 const r = ++run; state.route = route;
 if (inline?.settled) clearInline();
 const show = setTimeout(() => {
  if (r !== run || inline) return;
  content.classList.add('is-stale');
  inlineEl = document.createElement('div'); inlineEl.className = 'inline-loader';
  inlineEl.innerHTML = '<div></div><span class="sr-only" role="status">Loading…</span>';
  main.append(inlineEl); inline = make(inlineEl.firstChild, 52, { small: true }); inlineShownAt = performance.now();
 }, SHOW_AFTER);
 await wait(state.delay); clearTimeout(show); if (r !== run) return;
 if (inline) {
  const rest = MIN_VISIBLE - (performance.now() - inlineShownAt);
  if (rest > 0) { await wait(rest); if (r !== run) return; }
  await inline.settle(420); if (r !== run) return;
 }
 await transition(() => { clearInline(); renderPage(route); });
}

$('#nav').innerHTML = routes.map(n => `<li><button type="button">${n}</button></li>`).join('');
$('#nav').addEventListener('click', e => { const b = e.target.closest('button'); if (b && b.textContent !== state.route) go(b.textContent); });
$('#concepts').innerHTML = Object.entries(C).map(([k, v]) => `<button type="button" data-k="${k}" aria-pressed="${k === state.concept}">${v.name}</button>`).join('');
$('#concepts').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; state.concept = b.dataset.k; document.querySelectorAll('#concepts button').forEach(x => x.setAttribute('aria-pressed', x === b)); $('#about').innerHTML = C[state.concept].about; startup(); });
$('#delay').addEventListener('change', e => state.delay = +e.target.value);
$('#theme').addEventListener('change', e => { const v = e.target.value; v ? document.documentElement.dataset.theme = v : delete document.documentElement.dataset.theme; startup(); });
$('#reduced').checked = state.reduced;
$('#reduced').addEventListener('change', e => { state.reduced = e.target.checked; document.documentElement.classList.toggle('reduce', state.reduced); startup(); });
$('#play').addEventListener('click', startup);
document.documentElement.classList.toggle('reduce', state.reduced);
$('#about').innerHTML = C[state.concept].about;
startup();
})();
