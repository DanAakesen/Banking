// Monogram loader: particles orbit in a flow field and assemble into the brand initial.
// Startup text follows completed requests; only the closing flourish is timed.
const copy = {
 en: { stages: ['Loading accounts', 'Preparing your overview', 'Opening workspace'], ready: 'Your workspace is ready', loading: 'Loading…' },
 da: { stages: ['Henter konti', 'Samler dit overblik', 'Åbner arbejdsområdet'], ready: 'Dit arbejdsområde er klar', loading: 'Indlæser…' }
};
const SHOW_ROUTE_AFTER = 250, MIN_ROUTE_VISIBLE = 450;

const probe = document.createElement('canvas').getContext('2d');
const token = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
function rgb(colour) { probe.fillStyle = '#000'; probe.fillStyle = colour || '#000'; const h = probe.fillStyle; return h[0] === '#' ? [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)) : h.match(/[\d.]+/g).slice(0, 3).map(Number); }
const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const ease = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
const wait = ms => new Promise(r => setTimeout(r, ms));
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// The monogram follows the wordmark, so renaming the app updates the loader.
const brandInitial = () => (document.querySelector('.brand[data-brand]')?.dataset.brand || document.querySelector('.brand')?.textContent.trim() || 'B')[0];

function sampleGlyph(letter, size) {
 const c = document.createElement('canvas'); c.width = c.height = size;
 const x = c.getContext('2d', { willReadFrequently: true });
 x.fillStyle = '#fff'; x.font = `${Math.round(size * .74)}px Georgia,"Times New Roman",serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
 x.fillText(letter, size / 2, size / 2 + size * .05);
 const data = x.getImageData(0, 0, size, size).data, pts = [];
 for (let y = 0; y < size; y++) for (let X = 0; X < size; X++) if (data[(y * size + X) * 4 + 3] > 140) pts.push([X + .5, y + .5]);
 for (let i = pts.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [pts[i], pts[j]] = [pts[j], pts[i]]; }
 return pts.length ? pts : [[size / 2, size / 2]];
}
function glyphBox(pts) {
 let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
 for (const [x, y] of pts) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
 return { minX, minY, w: maxX - minX, h: maxY - minY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

// The sidebar icon is the settled monogram, cropped to the letter. It is a white alpha mask;
// CSS paints it with the theme's accent gradient so theme changes need no repaint.
let markLetter = null;
export function ensureBrandMark() {
 const letter = brandInitial();
 if (letter === markLetter) return;
 markLetter = letter;
 const pts = sampleGlyph(letter, 112), box = glyphBox(pts), scale = 2;
 const cv = document.createElement('canvas');
 cv.width = Math.ceil((box.w + 2) * scale); cv.height = Math.ceil((box.h + 2) * scale);
 const x = cv.getContext('2d');
 x.fillStyle = '#fff';
 pts.forEach((p, i) => { if (i % 9) x.fillRect((p[0] - box.minX + .5) * scale, (p[1] - box.minY + .5) * scale, scale, scale); });
 const root = document.documentElement.style;
 root.setProperty('--brand-mark', `url("${cv.toDataURL()}")`);
 root.setProperty('--brand-mark-ratio', String(cv.width / cv.height));
}

function monogram(host, size, { small = false, reduced = false } = {}) {
 const cv = document.createElement('canvas'), d = Math.min(2, devicePixelRatio || 1);
 cv.width = cv.height = Math.round(size * d); cv.style.width = cv.style.height = `${size}px`;
 cv.style.maskImage = cv.style.webkitMaskImage = 'radial-gradient(closest-side, #000 78%, transparent)';
 host.append(cv);
 const ctx = cv.getContext('2d'); ctx.setTransform(d, 0, 0, d, 0, 0);
 const theme = document.documentElement.dataset.theme, light = theme === 'light' || theme === 'sand', a = rgb(token('--accent')), b = rgb(token('--ai-accent'));
 const cols = [0, .33, .66, 1].map(k => mix(a, b, k)), bright = light ? mix(a, [0, 0, 0], .2) : mix(a, [255, 255, 255], .75), alpha = light ? .95 : .75;
 const pts = sampleGlyph(brandInitial(), size), c = size / 2;
 const bounds = glyphBox(pts);
 let stop = () => {}, settleState = null;
 const settle = ms => {
  if (!settleState) { let done; const promise = new Promise(r => done = r); settleState = { start: performance.now(), ms, done, promise }; setTimeout(() => settleState.done?.(), ms + 150); }
  return settleState.promise;
 };
 const settleProgress = () => { if (!settleState) return 0; const k = Math.min(1, (performance.now() - settleState.start) / settleState.ms); if (k >= 1 && settleState.done) { const r = settleState.done; settleState.done = null; r(); } return k; };
 if (reduced) {
  const paint = glyph => {
   ctx.clearRect(0, 0, size, size);
   if (glyph) pts.forEach((p, i) => { ctx.fillStyle = rgba(cols[i % 4], 1); ctx.fillRect(p[0] - .5, p[1] - .5, 1, 1); });
   else for (let i = 0; i < 180; i++) { const ang = i / 180 * 6.283, r = size * (.27 + (i % 5) * .012); ctx.fillStyle = rgba(cols[i % 4], .8); ctx.fillRect(c + Math.cos(ang) * r - .7, c + Math.sin(ang) * r - .7, 1.4, 1.4); }
  };
  paint(false);
  return { canvas: cv, bounds, settle() { paint(true); return Promise.resolve(); }, destroy() { host.replaceChildren(); } };
 }
 const N = small ? 200 : 1100, dot = (small ? 1.05 : 1.35) * (light ? 1.45 : 1);
 // Loading choreography (never a letter): orbit ring -> flowing infinity ribbon -> dense core -> burst back to the ring.
 const L = 9, RIBBON = 3, CORE = 6.2, BURST = 7.4;
 const ps = Array.from({ length: N }, (_, i) => { const t = pts[i % pts.length], ang = Math.random() * 6.283, r = size * (.26 + Math.random() * .08); return { x: c + Math.cos(ang) * r, y: c + Math.sin(ang) * r, vx: 0, vy: 0, tx: t[0], ty: t[1], s: Math.random(), w: Math.random() - .5, c: i % 4 }; });
 let alive = true, last = performance.now(), t = 0, prev = 0, frame;
 const step = now => {
  if (!alive || !cv.isConnected) return;
  const dt = Math.min(.05, (now - last) / 1000); last = now; t += dt;
  const p = t % L, settling = !!settleState, k = settleProgress();
  const phase = settling ? 'glyph' : p < RIBBON ? 'ring' : p < CORE ? 'ribbon' : p < BURST ? 'core' : 'ring';
  if (!settling && prev < BURST && p >= BURST) for (const q of ps) { const dx = q.x - c, dy = q.y - c, r = Math.hypot(dx, dy) || 1, f = size * (.35 + Math.random() * .5); q.vx += dx / r * f - dy / r * f * 1.2; q.vy += dy / r * f + dx / r * f * 1.2; }
  prev = p;
  const sweep = settling ? (ease(k) - .35) / .6 : null, spin = t * 2.2, turn = .35 * Math.sin(t * .5), ct = Math.cos(turn), st = Math.sin(turn), A = size * .34;
  for (const q of ps) {
   if (phase === 'glyph') { q.vx += (95 * (q.tx - q.x) - 13 * q.vx) * dt; q.vy += (95 * (q.ty - q.y) - 13 * q.vy) * dt; }
   else if (phase === 'ribbon') {
    const th = q.s * 6.283 + t * 1.1, sn = Math.sin(th), den = 1 + sn * sn, lx = A * Math.cos(th) / den, ly = A * sn * Math.cos(th) / den + q.w * size * .05;
    const tx = c + lx * ct - ly * st, ty = c + lx * st + ly * ct;
    q.vx += (24 * (tx - q.x) - 6 * q.vx) * dt; q.vy += (24 * (ty - q.y) - 6 * q.vy) * dt;
   } else {
    const dx = q.x - c, dy = q.y - c, r = Math.hypot(dx, dy) || 1, nx = dx / r, ny = dy / r;
    const core = phase === 'core', R = core ? size * (.06 + .05 * q.s) : size * (.29 + .04 * Math.sin(q.s * 12.6 + t * 1.4)), sp = size * (core ? 1.6 + q.s : .9 + .6 * q.s), n = core ? .06 : .18;
    const wx = -ny * sp + nx * (R - r) * 3 + Math.sin(q.y * .08 + t * .9 + q.s * 6) * size * n, wy = nx * sp + ny * (R - r) * 3 + Math.cos(q.x * .08 - t * .8 + q.s * 4) * size * n, blend = Math.min(1, dt * (core ? 5 : 3.5));
    q.vx += (wx - q.vx) * blend; q.vy += (wy - q.vy) * blend;
   }
   q.x += q.vx * dt; q.y += q.vy * dt;
  }
  ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = 'rgba(0,0,0,.24)'; ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'source-over';
  // While loading, a highlight travels around the centre; when ready, a light sweep crosses the finished glyph.
  const lit = sweep !== null
   ? q => sweep > -.2 && sweep < 1.2 && Math.abs((q.x + q.y) / (2 * size) - sweep) < .07
   : q => { const a = Math.atan2(q.y - c, q.x - c) - spin; return Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < .22; };
  for (let g = 0; g < 4; g++) { ctx.fillStyle = rgba(cols[g], alpha); for (const q of ps) if (q.c === g && !lit(q)) ctx.fillRect(q.x - dot / 2, q.y - dot / 2, dot, dot); }
  ctx.fillStyle = rgba(bright, .95); for (const q of ps) if (lit(q)) ctx.fillRect(q.x - dot / 2, q.y - dot / 2, dot * 1.3, dot * 1.3);
  frame = requestAnimationFrame(step);
 };
 frame = requestAnimationFrame(step);
 stop = () => { alive = false; cancelAnimationFrame(frame); };
 return { canvas: cv, bounds, settle, destroy() { stop(); host.replaceChildren(); } };
}

// Where the monogram should land: the visible brand icon in the sidebar (or phone header), if any.
function brandTarget() {
 const mark = [...document.querySelectorAll('#app .sidebar .brand-glyph, #app .mobile-top .brand-glyph')].find(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
 const rect = mark?.getBoundingClientRect();
 return rect?.height ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, h: rect.height } : null;
}

// Arrival flourish on the brand icon; it outlives the loader layer and cleans itself up.
function landed() {
 document.body.classList.add('brand-landed');
 setTimeout(() => document.body.classList.remove('brand-landed'), 1400);
}

export function mountLoading(main, lang = 'en') {
 const words = copy[lang] || copy.en, reduced = reducedMotion();
 const layer = document.createElement('div');
 layer.className = 'data-loading';
 layer.innerHTML = '<div class="dl-glyph" aria-hidden="true"></div><p class="dl-status" role="status" aria-live="polite"></p>';
 const app = document.querySelector('#app'), wasInert = app?.inert;
 if (app) app.inert = true;
 document.body.classList.add('startup-loading');
 main.classList.add('is-data-loading');
 main.setAttribute('aria-busy', 'true');
 document.body.append(layer);
 const status = layer.querySelector('.dl-status');
 const mono = monogram(layer.querySelector('.dl-glyph'), matchMedia('(max-width:650px)').matches ? 96 : 112, { reduced });
 let stopped = false, finishing = false, progress = 0, stage = -1, flight, handover;
 const say = text => { const span = document.createElement('span'); span.textContent = text; status.replaceChildren(span); };
 const release = () => {
  main.classList.remove('is-data-loading');
  main.removeAttribute('aria-busy');
  document.body.classList.remove('startup-loading');
  if (app) app.inert = wasInert;
 };
 const cancel = () => {
  if (stopped) return;
  stopped = true;
  flight?.cancel(); handover?.cancel(); mono.destroy(); release(); layer.remove();
  document.body.classList.remove('brand-landing');
 };
 const setProgress = value => {
  if (stopped || finishing) return;
  progress = Math.max(progress, Math.min(100, Math.max(0, value)));
  const next = progress < 25 ? 0 : progress < 90 ? 1 : 2;
  if (next !== stage) { stage = next; say(words.stages[stage]); }
 };
 setProgress(0);
 return { cancel, setProgress, async finish() {
  if (stopped || finishing) return;
  finishing = true;
  say(words.ready);
  // A hidden tab never paints the flourish, so reveal immediately instead of waiting on throttled frames.
  if (reduced || document.hidden) { cancel(); return; }
  await mono.settle(800);
  if (stopped) return;
  release();
  // The settled monogram flies onto the sidebar icon, then hands over to it with a cross-fade.
  const target = brandTarget(), box = mono.canvas.getBoundingClientRect(), { cx, cy, h } = mono.bounds;
  if (target) document.body.classList.add('brand-landing');
  layer.classList.add('is-leaving');
  mono.canvas.style.transformOrigin = `${cx}px ${cy}px`;
  if (!target) {
   flight = mono.canvas.animate([{ transform: 'none', opacity: 1 }, { transform: 'scale(1.08)', opacity: 0 }], { duration: 600, easing: 'ease-out', fill: 'forwards' });
   flight.finished.then(cancel, () => {});
   return;
  }
  const end = `translate(${target.x - box.left - cx}px, ${target.y - box.top - cy}px) scale(${target.h / h})`;
  flight = mono.canvas.animate([{ transform: 'none' }, { transform: end }], { duration: 850, easing: 'cubic-bezier(.65,0,.2,1)', fill: 'forwards' });
  flight.finished.then(() => {
   if (stopped) return;
   document.body.classList.remove('brand-landing');
   landed();
   handover = mono.canvas.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 320, easing: 'ease-out', fill: 'forwards' });
   handover.finished.then(cancel, () => {});
  }, () => {});
 }};
}

// Page changes: a small monogram only when the page takes noticeably long, then a soft reveal.
export function mountRouteLoading(main, lang = 'en') {
 const words = copy[lang] || copy.en, reduced = reducedMotion();
 const host = document.createElement('div');
 host.className = 'route-loading';
 host.innerHTML = `<span class="dl-sr" role="status">${words.loading}</span>`;
 main.classList.add('is-route-loading');
 main.setAttribute('aria-busy', 'true');
 main.append(host);
 let mono = null, shownAt = 0, removed = false, finishing = false;
 const show = setTimeout(() => {
  if (removed) return;
  const glyph = document.createElement('div');
  glyph.className = 'route-glyph'; glyph.setAttribute('aria-hidden', 'true');
  host.prepend(glyph);
  mono = monogram(glyph, 52, { small: true, reduced });
  shownAt = performance.now();
 }, SHOW_ROUTE_AFTER);
 const cancel = () => {
  if (removed) return;
  removed = true;
  clearTimeout(show); mono?.destroy(); host.remove();
  main.classList.remove('is-route-loading');
  main.removeAttribute('aria-busy');
 };
 return { cancel, setProgress() {}, async finish() {
  if (removed || finishing) return;
  finishing = true;
  clearTimeout(show);
  if (mono && !reduced && !document.hidden) {
   const rest = MIN_ROUTE_VISIBLE - (performance.now() - shownAt);
   if (rest > 0) await wait(rest);
   if (removed) return;
   await mono.settle(420);
   if (removed) return;
  }
  cancel();
  if (reduced || !main.isConnected) return;
  main.classList.add('route-reveal');
  setTimeout(() => main.classList.remove('route-reveal'), 600);
 }};
}
