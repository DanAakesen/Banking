// Three loader engines. Each returns { settle(ms): Promise, destroy(), settled }.
// "settle" eases the animation into its rest pose, which doubles as the brand mark.
(() => {
const probe = document.createElement('canvas').getContext('2d');
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function rgb(c) { probe.fillStyle = '#000'; probe.fillStyle = c; const h = probe.fillStyle; return h[0] === '#' ? [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)) : h.match(/[\d.]+/g).slice(0, 3).map(Number); }
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const ease = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
function palette() { const t = document.documentElement.dataset.theme; return { a: rgb(css('--accent')), b: rgb(css('--ai-accent')), good: rgb(css('--good')), ink: rgb(css('--ink')), dark: t !== 'light' && t !== 'sand' }; }
const soften = cv => { cv.style.maskImage = cv.style.webkitMaskImage = 'radial-gradient(closest-side, #000 78%, transparent)'; };
function hidpi(cv, size) { const d = Math.min(2, devicePixelRatio || 1); cv.width = cv.height = Math.round(size * d); cv.style.width = cv.style.height = size + 'px'; cv.setAttribute('aria-hidden', 'true'); const x = cv.getContext('2d'); x.setTransform(d, 0, 0, d, 0, 0); return x; }
function loop(fn) { let alive = true, last = performance.now(), t = 0, id; const step = now => { if (!alive) return; const dt = Math.min(.05, (now - last) / 1000); last = now; t += dt; fn(t, dt); id = requestAnimationFrame(step); }; id = requestAnimationFrame(step); return () => { alive = false; cancelAnimationFrame(id); }; }
function settler() {
 let s = null;
 return {
  begin(dur) { if (!s) { let res; const p = new Promise(r => res = r); s = { start: performance.now(), dur, res, p }; } return s.p; },
  k() { if (!s) return 0; const k = Math.min(1, (performance.now() - s.start) / s.dur); if (k >= 1 && s.res) { const r = s.res; s.res = null; r(); } return k; },
  get on() { return !!s; }
 };
}
const still = (draw, host) => ({ settled: false, settle() { draw?.(); return Promise.resolve(); }, destroy() { host.replaceChildren(); } });

// 1. Untangle: braided torus knot in rotating 3D that unties into a calm ring.
function Knot(host, size, { small = false, reduced = false, rest = false } = {}) {
 const cv = document.createElement('canvas'); host.append(cv); const ctx = hidpi(cv, size); const P = palette();
 const S = small ? 4 : 9, SEG = small ? 100 : 220, B = 6, c = size / 2, sc = size / (2 * 4.2);
 const cols = Array.from({ length: S }, (_, s) => mix(P.a, P.b, S > 1 ? s / (S - 1) : 0));
 const glow = P.dark ? mix(P.a, [255, 255, 255], .55) : P.a;
 const st = settler(); let amp = rest ? 0 : 1, rz = .4;
 function draw(t) {
  ctx.globalCompositeOperation = 'source-over'; ctx.clearRect(0, 0, size, size);
  ctx.globalCompositeOperation = P.dark ? 'lighter' : 'source-over';
  const tilt = 1.05 * amp, wob = .35 * amp * Math.sin(t * .45), ct = Math.cos(tilt), stl = Math.sin(tilt), cw = Math.cos(wob), sw = Math.sin(wob), cz = Math.cos(rz), sz = Math.sin(rz);
  const tr = (small ? .46 : .38) * (.4 + .6 * amp);
  const proj = (u, phi) => {
   const rr = 2 + amp * Math.cos(3 * u); let x = rr * Math.cos(2 * u), y = rr * Math.sin(2 * u), z = -amp * Math.sin(3 * u);
   const k = tr * Math.cos(phi + t * .9 + u * 5); x += Math.cos(2 * u) * k; y += Math.sin(2 * u) * k; z += tr * Math.sin(phi + t * .9 + u * 5);
   const x1 = x * cz - y * sz, y1 = x * sz + y * cz, y2 = y1 * ct - z * stl, z2 = y1 * stl + z * ct, x3 = x1 * cw + z2 * sw, z3 = -x1 * sw + z2 * cw;
   const p = 1 / (1 - z3 * .05); return [c + x3 * sc * p, c + y2 * sc * p, z3];
  };
  for (let s = 0; s < S; s++) {
   const phi = s / S * Math.PI * 2, paths = Array.from({ length: B }, () => new Path2D()); let prev = proj(0, phi);
   for (let i = 1; i <= SEG; i++) {
    const cur = proj(i / SEG * Math.PI * 2, phi), d = Math.max(0, Math.min(B - 1, Math.floor(((prev[2] + cur[2]) / 2 + 3.4) / 6.8 * B)));
    paths[d].moveTo(prev[0], prev[1]); paths[d].lineTo(cur[0], cur[1]); prev = cur;
   }
   for (let b = 0; b < B; b++) { const k = b / (B - 1); ctx.strokeStyle = rgba(cols[s], (P.dark ? .1 : .22) + k * (P.dark ? .46 : .7)); ctx.lineWidth = (small ? .8 : 1) * (.55 + k * .9); ctx.stroke(paths[b]); }
  }
  if (reduced || rest) return;
  for (let j = 13; j >= 0; j--) { const [x, y] = proj(t * 1.2 - j * .03, 0), f = 1 - j / 14; ctx.fillStyle = rgba(glow, .85 * f); ctx.beginPath(); ctx.arc(x, y, (small ? 1.1 : 1.9) * f + .3, 0, 7); ctx.fill(); }
  const [hx, hy] = proj(t * 1.2, 0), r = size * .09, g = ctx.createRadialGradient(hx, hy, 0, hx, hy, r);
  g.addColorStop(0, rgba(glow, .5)); g.addColorStop(1, rgba(glow, 0)); ctx.fillStyle = g; ctx.fillRect(hx - r, hy - r, r * 2, r * 2);
 }
 if (reduced || rest) { draw(.6); return still(() => { amp = 0; draw(.6); }, host); }
 const stop = loop((t, dt) => { rz += dt * .5; if (st.on) amp = 1 - ease(st.k()); draw(t); });
 return { settled: false, settle(ms = 900) { this.settled = true; return st.begin(ms); }, destroy() { stop(); host.replaceChildren(); } };
}

// 2. Liquid ledger: bars with spring physics and a goo filter that melt into a coin and split again.
let uid = 0;
function Liquid(host, size, { reduced = false, rest = false } = {}) {
 const id = 'lq' + (++uid), P = palette();
 host.insertAdjacentHTML('beforeend', `<svg width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true"><defs><linearGradient id="${id}g" gradientUnits="userSpaceOnUse" x1="10" y1="90" x2="90" y2="10"><stop offset="0" stop-color="${rgba(P.a, 1)}"/><stop offset=".55" stop-color="${rgba(P.b, 1)}"/><stop offset="1" stop-color="${rgba(mix(P.a, P.good, .65), 1)}"/></linearGradient><filter id="${id}f" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur in="SourceGraphic" stdDeviation="2.4" result="b"/><feColorMatrix in="b" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 20 -8" result="g"/><feComposite in="SourceGraphic" in2="g" operator="atop"/></filter></defs><g filter="url(#${id}f)" fill="url(#${id}g)">${'<rect/>'.repeat(5)}</g></svg>`);
 const svg = host.lastElementChild, rects = [...svg.querySelectorAll('rect')], blur = svg.querySelector('feGaussianBlur'), grad = svg.querySelector('linearGradient'), group = svg.querySelector('g');
 const xs = [18, 34, 50, 66, 82], base = [44, 62, 36, 72, 54], W = 9, BOT = 84, keys = ['cx', 'cy', 'w', 'h'];
 const restT = i => ({ cx: xs[i], cy: BOT - base[i] / 2, w: W, h: base[i] });
 const body = rects.map((_, i) => ({ ...restT(i), v: { cx: 0, cy: 0, w: 0, h: 0 } }));
 const apply = () => body.forEach((b, i) => { const r = rects[i], w = Math.max(0, b.w), h = Math.max(0, b.h); r.setAttribute('x', (b.cx - w / 2).toFixed(2)); r.setAttribute('y', (b.cy - h / 2).toFixed(2)); r.setAttribute('width', w.toFixed(2)); r.setAttribute('height', h.toFixed(2)); r.setAttribute('rx', (Math.min(w, h) / 2).toFixed(2)); });
 if (reduced || rest) { group.removeAttribute('filter'); apply(); return still(null, host); }
 const st = settler();
 const target = (i, t) => {
  if (st.on) return restT(i);
  const p = t % 6.4;
  if (p > 3.2 + i * .07 && p < 4.9 + i * .05) { const br = 1 + .06 * Math.sin(t * 4.5); return { cx: 50, cy: 52, w: 30 * br, h: 30 * br }; }
  const h = base[i] * (.78 + .22 * Math.sin(t * 2.1 - i * .85)); return { cx: xs[i], cy: BOT - h / 2, w: W, h };
 };
 const stop = loop((t, dt) => {
  const k = st.on ? st.k() : 0;
  body.forEach((b, i) => { const tg = target(i, t), K = 85 + i * 9; for (const key of keys) { b.v[key] += (K * (tg[key] - b[key]) - 10 * b.v[key]) * dt; b[key] += b.v[key] * dt; } });
  blur.setAttribute('stdDeviation', (2.4 * (1 - ease(k)) + .001).toFixed(3));
  if (k >= 1) group.removeAttribute('filter');
  grad.setAttribute('gradientTransform', `rotate(${(t * 35) % 360} 50 50)`);
  apply();
 });
 return { settled: false, settle(ms = 800) { this.settled = true; return st.begin(ms); }, destroy() { stop(); host.replaceChildren(); } };
}

// 3. Monogram: particles orbit in a flow field and periodically assemble into the Banking "B".
function sampleB(size) {
 const o = document.createElement('canvas'); o.width = o.height = size; const x = o.getContext('2d', { willReadFrequently: true });
 x.fillStyle = '#fff'; x.font = `${Math.round(size * .74)}px Georgia,"Times New Roman",serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('B', size / 2, size / 2 + size * .05);
 const d = x.getImageData(0, 0, size, size).data, pts = [];
 for (let y = 0; y < size; y++) for (let X = 0; X < size; X++) if (d[(y * size + X) * 4 + 3] > 140) pts.push([X + .5, y + .5]);
 for (let i = pts.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [pts[i], pts[j]] = [pts[j], pts[i]]; }
 return pts;
}
function Monogram(host, size, { small = false, reduced = false, rest = false } = {}) {
 const cv = document.createElement('canvas'); host.append(cv); const ctx = hidpi(cv, size); const P = palette();
 if (!rest) soften(cv);
 const pts = sampleB(size), cols = [0, .33, .66, 1].map(k => mix(P.a, P.b, k)), bright = mix(P.a, [255, 255, 255], P.dark ? .75 : .6), c = size / 2;
 if (reduced || rest) { pts.forEach((p, i) => { ctx.fillStyle = rgba(cols[i % 4], 1); ctx.fillRect(p[0] - .5, p[1] - .5, 1, 1); }); return still(null, host); }
 const N = small ? 200 : 1100, dot = small ? 1.05 : 1.35;
 const ps = Array.from({ length: N }, (_, i) => { const t = pts[i % pts.length], a = Math.random() * 6.283, r = size * (.3 + Math.random() * .1); return { x: c + Math.cos(a) * r, y: c + Math.sin(a) * r, vx: 0, vy: 0, tx: t[0], ty: t[1], s: Math.random(), c: i % 4 }; });
 const st = settler(), L = 5.6; let prev = 0;
 const stop = loop((t, dt) => {
  const p = t % L, settling = st.on, k = settling ? st.k() : 0, assemble = settling || (p > 2.5 && p < 4.7);
  if (!settling && prev < 4.7 && p >= 4.7) for (const q of ps) { const dx = q.x - c, dy = q.y - c, r = Math.hypot(dx, dy) || 1, f = size * (.6 + Math.random() * 1.1); q.vx += dx / r * f - dy / r * f * .5; q.vy += dy / r * f + dx / r * f * .5; }
  prev = p;
  const sweep = settling ? (k - .35) / .6 : assemble ? (p - 3.3) / 1.2 : null;
  for (const q of ps) {
   if (assemble) { const K = settling ? 95 : 10 + 60 * Math.min(1, (p - 2.5) / .8), C = settling ? 13 : 9; q.vx += (K * (q.tx - q.x) - C * q.vx) * dt; q.vy += (K * (q.ty - q.y) - C * q.vy) * dt; }
   else {
    const dx = q.x - c, dy = q.y - c, r = Math.hypot(dx, dy) || 1, nx = dx / r, ny = dy / r, R = size * (.29 + .04 * Math.sin(q.s * 12.6 + t * 1.4)), sp = size * (.9 + .6 * q.s);
    const wx = -ny * sp + nx * (R - r) * 3 + Math.sin(q.y * .08 + t * .9 + q.s * 6) * size * .18, wy = nx * sp + ny * (R - r) * 3 + Math.cos(q.x * .08 - t * .8 + q.s * 4) * size * .18, a = Math.min(1, dt * 3.5);
    q.vx += (wx - q.vx) * a; q.vy += (wy - q.vy) * a;
   }
   q.x += q.vx * dt; q.y += q.vy * dt;
  }
  ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = 'rgba(0,0,0,.24)'; ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'source-over';
  const inBand = q => sweep !== null && sweep > -.2 && sweep < 1.2 && Math.abs((q.x + q.y) / (2 * size) - sweep) < .07;
  for (let b = 0; b < 4; b++) { ctx.fillStyle = rgba(cols[b], .75); for (const q of ps) if (q.c === b && !inBand(q)) ctx.fillRect(q.x - dot / 2, q.y - dot / 2, dot, dot); }
  ctx.fillStyle = rgba(bright, .95); for (const q of ps) if (inBand(q)) ctx.fillRect(q.x - dot / 2, q.y - dot / 2, dot * 1.3, dot * 1.3);
 });
 return { settled: false, settle(ms = 900) { this.settled = true; return st.begin(ms); }, destroy() { stop(); host.replaceChildren(); } };
}

window.LoadingConcepts = {
 knot: { name: 'Untangle', make: Knot, about: '<strong>1. Untangle.</strong> A braided torus knot made of hair-thin strands, rotating in true 3D with depth-based light and a comet travelling along it. It carries the current line-flow language into a compact 112 px glyph. When the data is ready, the knot unties into a calm ring that flies into the sidebar as the brand mark. Canvas 2D, parametric geometry and depth-bucketed strokes; no dependency.' },
 liquid: { name: 'Liquid ledger', make: Liquid, about: '<strong>2. Liquid ledger.</strong> Five bars behave like liquid: they breathe as a small chart, melt into a single coin, then split back into bars with a springy overshoot. When ready, the liquid solidifies into five crisp bars that become the mark. SVG goo filter and spring physics; the most finance-native and the lightest to render.' },
 monogram: { name: 'Monogram', make: Monogram, about: '<strong>3. Monogram.</strong> About a thousand particles orbit in a flow field with motion trails. They periodically assemble into the Banking B while a light sweep crosses it, then burst back into orbit. When ready, they lock into the B, which becomes the mark. Canvas particles with spring assembly; the strongest brand moment and the most wow.' }
};
})();
