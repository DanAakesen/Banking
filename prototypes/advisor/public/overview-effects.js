// prototypes/advisor/vendor/libraries-dev/thinking-orbs/src/engine/core.ts
function lerp(a, b, f) {
  return a + (b - a) * f;
}
function frac(x) {
  return x - Math.floor(x);
}
function vnoise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let fx = x - xi;
  let fy = y - yi;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = hashD(xi, yi);
  const b = hashD(xi + 1, yi);
  const c = hashD(xi, yi + 1);
  const d = hashD(xi + 1, yi + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
function hashD(a, b) {
  const h = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return h - Math.floor(h);
}
function fibDir(i, n) {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const y = 1 - 2 * (i + 0.5) / n;
  const rad = Math.sqrt(1 - y * y);
  const a = i * golden;
  return [rad * Math.cos(a), y, rad * Math.sin(a)];
}
function angleDelta(a, b) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}
function makeProj(yaw, tilt, cx, cy, scale) {
  const st = Math.sin(tilt);
  const ct = Math.cos(tilt);
  const sy = Math.sin(yaw);
  const cyw = Math.cos(yaw);
  return (x, y, z) => {
    const x1 = x * cyw + z * sy;
    const z1 = -x * sy + z * cyw;
    const y1 = y * ct - z1 * st;
    const z2 = y * st + z1 * ct;
    return [cx + x1 * scale, cy - y1 * scale, z2];
  };
}
function inkColor(w, alpha, dark, tint) {
  if (!tint) {
    const g = Math.round((dark ? 1 - w : w) * 255);
    return `rgba(${g},${g},${g},${alpha})`;
  }
  const ramp = (c) => Math.round(dark ? c * (1 - w) : c + (255 - c) * w);
  return `rgba(${ramp(tint.r)},${ramp(tint.g)},${ramp(tint.b)},${alpha})`;
}
function paint(ctx, dots, dark, rMin = 0.3, tint) {
  for (const d of dots) {
    const alpha = d.a ?? 1;
    const w = Math.min(1, Math.max(0, d.white));
    ctx.fillStyle = inkColor(w, alpha, dark, tint);
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    ctx.fill();
  }
}
function paintLines(ctx, lines, dark, tint) {
  for (const l of lines) {
    const alpha = l.a ?? 1;
    const w = Math.min(1, Math.max(0, l.white));
    ctx.strokeStyle = inkColor(w, alpha, dark, tint);
    ctx.lineWidth = l.w;
    ctx.beginPath();
    ctx.moveTo(l.x1, l.y1);
    ctx.lineTo(l.x2, l.y2);
    ctx.stroke();
  }
}
function finalizeFrame(dots, lines, rMin = 0.3) {
  const visible = [];
  for (const d of dots) {
    if ((d.a ?? 1) < 0.02) continue;
    d.r = Math.max(rMin, d.r);
    visible.push(d);
  }
  visible.sort((a, b) => a.z - b.z);
  return { dots: visible, lines: lines.filter((l) => (l.a ?? 1) >= 0.02) };
}
function paintFrame(ctx, frame2, dark, tint) {
  if (frame2.lines.length) paintLines(ctx, frame2.lines, dark, tint);
  paint(ctx, frame2.dots, dark, 0.3, tint);
}
function radiusScale(size, pow) {
  return (size / 300) ** pow;
}

// prototypes/advisor/vendor/libraries-dev/thinking-orbs/src/engine/braid.ts
var frameBraid = (size, t, o) => {
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 * 0.76;
  const pt = makeProj(t * 0.4, 0.3, cx, cy, 1);
  const rs = radiusScale(size, o.rsPow ?? 0.6);
  const dots = [];
  const ghostN = o.ghostN ?? 150;
  for (let i = 0; i < ghostN; i++) {
    const d = fibDir(i, ghostN);
    const [px, py, z] = pt(d[0] * R, d[1] * R, d[2] * R);
    const depth = (z / R + 1) / 2;
    dots.push({ x: px, y: py, z, r: 0.8 * rs, white: 0.78, a: 0.1 + 0.22 * depth });
  }
  const strandN = o.strandN ?? 52;
  const turns = o.turns ?? 3;
  for (let s = 0; s < 3; s++) {
    const phase = s / 3 * 2 * Math.PI;
    for (let i = 0; i < strandN; i++) {
      const u = (frac(i / strandN + t * 0.045) * 2 - 1) * 0.96;
      const surf = Math.sqrt(Math.max(0, 1 - u * u));
      const endFade = Math.min(1, (1 - Math.abs(u)) / 0.1);
      const a = u * Math.PI * turns + phase;
      const weave = 1 + 0.075 * Math.sin(u * Math.PI * turns * 2 + phase * 2 + t * 0.8);
      const rr = surf * R * weave;
      const [px, py, zr] = pt(Math.cos(a) * rr, u * R * weave, Math.sin(a) * rr);
      const depth = (zr / R + 1) / 2;
      dots.push({
        x: px,
        y: py,
        z: zr,
        r: ((o.rBase ?? 1.2) + (o.rDepth ?? 1.8) * depth) * rs,
        white: 0.55 - 0.45 * depth,
        a: endFade * (0.45 + 0.55 * depth)
      });
    }
  }
  return finalizeFrame(dots, [], o.rMin);
};

// prototypes/advisor/vendor/libraries-dev/thinking-orbs/src/engine/lattice.ts
function solveCycle(time, count, slotDur, rest) {
  const cyc = 2 * count * slotDur + rest;
  const tc = time % cyc;
  const amount = new Array(count).fill(0);
  let active = -1;
  if (tc < 2 * count * slotDur) {
    const slot = Math.floor(tc / slotDur);
    const p = (tc - slot * slotDur) / slotDur;
    const cl = Math.min(1, p / 0.7);
    const ep = 1 - (1 - cl) ** 3;
    if (slot < count) {
      for (let i = 0; i < slot; i++) amount[i] = 1;
      amount[slot] = ep;
      active = slot;
    } else {
      const u = 2 * count - 1 - slot;
      for (let i = 0; i < u; i++) amount[i] = 1;
      amount[u] = 1 - ep;
      active = u;
    }
  }
  return { amount, active };
}
function applyMoves(pt3, moves, sc) {
  let [x, y, z] = pt3;
  let inActive = false;
  for (let i = 0; i < moves.length; i++) {
    if (sc.amount[i] <= 0) continue;
    const mv = moves[i];
    const coord = mv.axis === 0 ? x : mv.axis === 1 ? y : z;
    if (coord < mv.lo || coord >= mv.hi) continue;
    if (i === sc.active) inActive = true;
    const a = mv.ang * sc.amount[i];
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    if (mv.axis === 0) {
      const y2 = y * ca - z * sa;
      z = y * sa + z * ca;
      y = y2;
    } else if (mv.axis === 1) {
      const x2 = x * ca + z * sa;
      z = -x * sa + z * ca;
      x = x2;
    } else {
      const x2 = x * ca - y * sa;
      y = x * sa + y * ca;
      x = x2;
    }
  }
  return [x, y, z, inActive];
}
function makeMoves(count) {
  const moves = [];
  for (let i = 0; i < count; i++) {
    const axis = Math.min(2, Math.floor(hashD(i, 2.3) * 3));
    const lo = -1 + 0.5 * Math.min(3, Math.floor(hashD(i, 5.9) * 4));
    const dir = hashD(i, 7.7) < 0.5 ? 1 : -1;
    moves.push({ axis, lo, hi: lo + 0.5, ang: dir * Math.PI / 2 });
  }
  return moves;
}
var frameGlobe = (size, t, o) => {
  const spin = 0.5;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 * 0.82;
  const tilt = 0.4 + 0.06 * Math.sin(t * 0.35);
  const pt = makeProj(t * spin, tilt, cx, cy, radius);
  const scan = t * (spin + (1.7 - spin) * (o.scanMul ?? 1));
  const rs = radiusScale(size, o.rsPow ?? 0.6);
  const dimBase = o.dimBase ?? 1;
  const dots = [];
  const latRings = o.latRings ?? 17;
  const lonDensity = o.lonDensity ?? 44;
  for (let li = 0; li <= latRings; li++) {
    const lat = -Math.PI / 2 + li / latRings * Math.PI;
    const cosLat = Math.cos(lat);
    const sinLat = Math.sin(lat);
    const lonCount = Math.max(1, Math.round(Math.abs(cosLat) * lonDensity));
    for (let lj = 0; lj < lonCount; lj++) {
      const lon = lj / lonCount * 2 * Math.PI;
      const [px, py, z] = pt(cosLat * Math.cos(lon), sinLat, cosLat * Math.sin(lon));
      const depth = (z + 1) / 2;
      const d = angleDelta(lon + t * spin, scan);
      const boost = Math.exp(-(d * d) / 0.18) * Math.max(0, z);
      dots.push({
        x: px,
        y: py,
        z,
        r: ((o.rBase ?? 0.6) + (o.rDepth ?? 1.7) * depth + (o.rBoost ?? 1) * boost) * rs,
        white: (o.inkFar ?? 0.62) - (o.inkSpan ?? 0.54) * depth,
        // dimBase < 1 fades un-scanned dots so the meridian reads clearly
        a: dimBase + (1 - dimBase) * Math.min(1, boost)
      });
    }
  }
  return finalizeFrame(dots, [], o.rMin);
};
var frameRubik = (size, t, o) => {
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 * 0.82;
  const pt = makeProj(t * 0.55, 0.35 + 0.1 * Math.sin(t * 0.9), cx, cy, R);
  const rs = radiusScale(size, o.rsPow ?? 0.6);
  const moveCount = o.moveCount ?? 14;
  const moves = makeMoves(moveCount);
  const sc = solveCycle(t, moveCount, 0.42, 1.2);
  const dots = [];
  const latRings = o.latRings ?? 15;
  const lonDensity = o.lonDensity ?? 40;
  for (let li = 0; li <= latRings; li++) {
    const lat = -Math.PI / 2 + li / latRings * Math.PI;
    const cosLat = Math.cos(lat);
    const sinLat = Math.sin(lat);
    const lonCount = Math.max(1, Math.round(Math.abs(cosLat) * lonDensity));
    for (let lj = 0; lj < lonCount; lj++) {
      const lon = lj / lonCount * 2 * Math.PI;
      const [x, y, z, inActive] = applyMoves([cosLat * Math.cos(lon), sinLat, cosLat * Math.sin(lon)], moves, sc);
      const [px, py, zr] = pt(x, y, z);
      const depth = (zr + 1) / 2;
      dots.push({
        x: px,
        y: py,
        z: zr,
        r: ((o.rBase ?? 0.6) + (o.rDepth ?? 1.7) * depth + (inActive ? o.rActive ?? 0.3 : 0)) * rs,
        white: (o.inkFar ?? 0.62) - (o.inkSpan ?? 0.54) * depth - (inActive ? 0.14 : 0)
      });
    }
  }
  return finalizeFrame(dots, [], o.rMin);
};
var frameWave = (size, t, o) => {
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 * 0.874;
  const pt = makeProj(t * 0.18, 0.38, cx, cy, 1);
  const rs = radiusScale(size, o.rsPow ?? 0.6);
  const dots = [];
  const rings = o.rings ?? 15;
  const lonDensity = o.lonDensity ?? 40;
  for (let ri = 0; ri <= rings; ri++) {
    const lat = -Math.PI / 2 + ri / rings * Math.PI;
    const cosLat = Math.cos(lat);
    const sinLat = Math.sin(lat);
    const w = 0.62 * Math.sin(t * 2.1 - ri * 0.52) + 0.38 * Math.sin(t * 1.27 + ri * 0.83);
    const rr = R * (0.88 + 0.105 * w);
    const lonCount = Math.max(1, Math.round(Math.abs(cosLat) * lonDensity));
    for (let lj = 0; lj < lonCount; lj++) {
      const lon = lj / lonCount * 2 * Math.PI;
      const [px, py, z] = pt(cosLat * Math.cos(lon) * rr, sinLat * rr, cosLat * Math.sin(lon) * rr);
      const depth = (z / R + 1) / 2;
      const crest = Math.max(0, w);
      dots.push({
        x: px,
        y: py,
        z,
        r: ((o.rBase ?? 0.6) + (o.rDepth ?? 1.7) * depth) * (1 + 0.4 * crest) * rs,
        white: 0.66 - 0.56 * depth - 0.1 * crest
      });
    }
  }
  return finalizeFrame(dots, [], o.rMin);
};

// prototypes/advisor/vendor/libraries-dev/thinking-orbs/src/engine/morph.ts
function smoothE(x) {
  return x * x * (3 - 2 * x);
}
function polyPath(verts) {
  const V = verts.length;
  const L = [];
  let total = 0;
  for (let i = 0; i < V; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % V];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    L.push(l);
    total += l;
  }
  return (f) => {
    let target = f * total;
    let i = 0;
    while (target > L[i] && i < V - 1) {
      target -= L[i];
      i++;
    }
    const a = verts[i];
    const b = verts[(i + 1) % V];
    const ff = L[i] ? Math.min(1, target / L[i]) : 0;
    return [a[0] + (b[0] - a[0]) * ff, a[1] + (b[1] - a[1]) * ff];
  };
}
var CIRCLE = (f) => {
  const a = -Math.PI / 2 + f * 2 * Math.PI;
  return [Math.cos(a) * 0.24, Math.sin(a) * 0.24];
};
var TRIANGLE = polyPath([
  [0, -0.26],
  [0.24, 0.16],
  [-0.24, 0.16]
]);
var SQUARE = polyPath([
  [0, -0.2],
  [0.2, -0.2],
  [0.2, 0.2],
  [-0.2, 0.2],
  [-0.2, -0.2]
]);
var CYCLE = [CIRCLE, TRIANGLE, SQUARE];
function morphN(d) {
  return Math.max(6, Math.round(34 * d));
}
var HOLD = 1.4;
var MORPH = 0.9;
var SEG = HOLD + MORPH;
var frameMorph = (size, t, o) => {
  const K = CYCLE.length;
  const tc = t % (SEG * K);
  const held = o.shape != null && o.shape >= 0 && o.shape < K ? Math.floor(o.shape) : -1;
  const k = held >= 0 ? held : Math.floor(tc / SEG);
  const local = held >= 0 ? t % SEG : tc - k * SEG;
  const m = held >= 0 ? 0 : local > HOLD ? smoothE((local - HOLD) / MORPH) : 0;
  const sprd = o.spread ?? 1;
  const pA = CYCLE[k];
  const pB = held >= 0 ? pA : CYCLE[(k + 1) % K];
  const M = 160;
  const pts = [];
  for (let i = 0; i < M; i++) {
    const f = i / M;
    const a = pA(f);
    const b = pB(f);
    pts.push([(a[0] + (b[0] - a[0]) * m) * sprd, (a[1] + (b[1] - a[1]) * m) * sprd]);
  }
  const L = [];
  let total = 0;
  for (let i = 0; i < M; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % M];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    L.push(l);
    total += l;
  }
  const n = morphN(o.iconD ?? 1);
  const re = (o.rDot ?? 0.021) * 1.35 * sprd;
  const pulse = 1 + 0.02 * Math.sin(local * 3.1);
  const dots = [];
  const c2 = size / 2;
  let seg = 0;
  let acc = 0;
  for (let k2 = 0; k2 < n; k2++) {
    const target = k2 / n * total;
    while (acc + L[seg] < target && seg < M - 1) {
      acc += L[seg];
      seg++;
    }
    const a = pts[seg];
    const b = pts[(seg + 1) % M];
    const f = L[seg] ? Math.min(1, (target - acc) / L[seg]) : 0;
    const x = (a[0] + (b[0] - a[0]) * f) * pulse;
    const y = (a[1] + (b[1] - a[1]) * f) * pulse;
    dots.push({
      x: c2 + x * size,
      y: c2 + y * size,
      z: 0,
      r: Math.max(0.35, re * size),
      white: 0.1
    });
  }
  return finalizeFrame(dots, [], o.rMin);
};

// prototypes/advisor/vendor/libraries-dev/thinking-orbs/src/engine/orbits.ts
var frameOrbits = (size, t, o) => {
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 * 0.82;
  const pt = makeProj(t * 0.12, 0.3, cx, cy, 1);
  const rs = radiusScale(size, o.rsPow ?? 0.6);
  const dots = [];
  const orbitN = o.orbitN ?? 12;
  const ghostN = o.ghostN ?? 40;
  const particles = o.particles ?? 3;
  for (let orb = 0; orb < orbitN; orb++) {
    const h1 = hashD(orb, 1.7);
    const h2 = hashD(orb, 5.2);
    const h3 = hashD(orb, 8.9);
    const ro = R * (0.45 + 0.52 * h1);
    const th = h1 * 2 * Math.PI;
    const phi = Math.acos(2 * h2 - 1);
    const nx = Math.sin(phi) * Math.cos(th);
    const ny = Math.cos(phi);
    const nz = Math.sin(phi) * Math.sin(th);
    let ux = -ny;
    let uy = nx;
    const uz = 0;
    const ul = Math.max(1e-6, Math.sqrt(ux * ux + uy * uy));
    ux /= ul;
    uy /= ul;
    const vx = ny * uz - nz * uy;
    const vy = nz * ux - nx * uz;
    const vz = nx * uy - ny * ux;
    const speed = (0.25 + 0.55 * h3) * (h3 > 0.5 ? 1 : -1);
    for (let k = 0; k < ghostN; k++) {
      const a = k / ghostN * 2 * Math.PI;
      const [px, py, z] = pt(
        (ux * Math.cos(a) + vx * Math.sin(a)) * ro,
        (uy * Math.cos(a) + vy * Math.sin(a)) * ro,
        (uz * Math.cos(a) + vz * Math.sin(a)) * ro
      );
      const depth = (z / ro + 1) / 2;
      dots.push({
        x: px,
        y: py,
        z,
        r: (o.ghostR ?? 0.9) * rs,
        white: 0.72,
        a: (o.ghostA ?? 0.5) * (0.4 + 0.6 * depth)
      });
    }
    for (let m = 0; m < particles; m++) {
      const a = t * speed + m / particles * 2 * Math.PI + h2 * 6;
      const [px, py, z] = pt(
        (ux * Math.cos(a) + vx * Math.sin(a)) * ro,
        (uy * Math.cos(a) + vy * Math.sin(a)) * ro,
        (uz * Math.cos(a) + vz * Math.sin(a)) * ro
      );
      const depth = (z / ro + 1) / 2;
      dots.push({
        x: px,
        y: py,
        z,
        r: ((o.partR ?? 1.2) + (o.partRDepth ?? 1.6) * depth) * rs,
        white: 0.3 - 0.22 * depth
      });
    }
  }
  return finalizeFrame(dots, [], o.rMin);
};

// prototypes/advisor/vendor/libraries-dev/thinking-orbs/src/engine/ribbon.ts
var frameRibbon = (size, t, o) => {
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 * 0.78;
  const spin = o.spin ?? 1;
  const camTilt = 0.3;
  const pt = makeProj(t * 0.1 * spin, camTilt, cx, cy, 1);
  const rs = radiusScale(size, o.rsPow ?? 0.6);
  const dots = [];
  const ghostN = o.ghostN ?? 150;
  for (let i = 0; i < ghostN; i++) {
    const d = fibDir(i, ghostN);
    const [px, py, z] = pt(d[0] * R, d[1] * R, d[2] * R);
    const depth = (z / R + 1) / 2;
    dots.push({ x: px, y: py, z, r: 0.8 * rs, white: 0.78, a: 0.1 + 0.22 * depth });
  }
  const ya = t * 0.24 * spin;
  const ta = o.faceOn ? -camTilt : 0.55 + 0.3 * Math.sin(t * 0.18) * spin;
  const ux = Math.cos(ya);
  const uy = 0;
  const uz = Math.sin(ya);
  const vx = -uz * Math.sin(ta);
  const vy = Math.cos(ta);
  const vz = ux * Math.sin(ta);
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const wobAmp = 0.23 * (o.wobMul ?? 1);
  const baseR = o.faceOn ? R / (1 + 0.85 * wobAmp) : R;
  const baseLanes = o.lanes ?? 5;
  const segs = o.segs ?? 88;
  const lanes = Math.max(1, Math.round(baseLanes * (o.bandMul ?? 1)));
  for (let w = 0; w < lanes; w++) {
    const laneOff = (w - (lanes - 1) / 2) * 0.075;
    const edge = Math.abs(w - (lanes - 1) / 2) / Math.max(1, (lanes - 1) / 2);
    for (let k = 0; k < segs; k++) {
      const a = k / segs * 2 * Math.PI;
      const wob = (0.16 * Math.sin(a * 3 - t * 1.7 + w * 0.22) + 0.07 * Math.sin(a * 5 + t * 1.1)) * (o.wobMul ?? 1);
      const radial = o.faceOn ? 1 + wob : 1;
      const off = o.faceOn ? laneOff : laneOff + wob;
      const x = ux * Math.cos(a) + vx * Math.sin(a) + nx * off;
      const y = uy * Math.cos(a) + vy * Math.sin(a) + ny * off;
      const z = uz * Math.cos(a) + vz * Math.sin(a) + nz * off;
      const l = Math.sqrt(x * x + y * y + z * z);
      const rr = baseR * radial;
      const [px, py, zr] = pt(x / l * rr, y / l * rr, z / l * rr);
      const depth = (zr / R + 1) / 2;
      dots.push({
        x: px,
        y: py,
        z: zr,
        r: ((o.rBase ?? 1.1) + (o.rDepth ?? 1.7) * depth) * (1 - 0.25 * edge) * rs,
        white: 0.52 - 0.44 * depth + 0.18 * edge,
        a: 0.4 + 0.6 * depth
      });
    }
  }
  return finalizeFrame(dots, [], o.rMin);
};

// prototypes/advisor/vendor/libraries-dev/thinking-orbs/src/engine/web.ts
var frameWeb = (size, t, o) => {
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 * 0.8 * (o.spread ?? 1);
  const pt = makeProj(t * 0.12, 0.32, cx, cy, R);
  const rs = radiusScale(size, o.rsPow ?? 0.6);
  const nodeN = o.nodeN ?? 30;
  const thr = o.thr ?? 0.72;
  const nodeR = o.nodeR ?? 1.4;
  const nodeRDepth = o.nodeRDepth ?? 1.8;
  const nodes = [];
  for (let i = 0; i < nodeN; i++) {
    const d = fibDir(i, nodeN);
    const x = d[0] + 0.3 * (vnoise(i * 0.31 + 9, t * 0.24) - 0.5) * 2;
    const y = d[1] + 0.3 * (vnoise(i * 0.53 + 27, t * 0.21) - 0.5) * 2;
    const z = d[2] + 0.3 * (vnoise(i * 0.77 + 55, t * 0.27) - 0.5) * 2;
    const l = Math.sqrt(x * x + y * y + z * z);
    nodes.push([x / l, y / l, z / l]);
  }
  const lines = [];
  const dots = [];
  for (let i = 0; i < nodeN; i++) {
    for (let j = i + 1; j < nodeN; j++) {
      const dx = nodes[i][0] - nodes[j][0];
      const dy = nodes[i][1] - nodes[j][1];
      const dz = nodes[i][2] - nodes[j][2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist >= thr) continue;
      const [x1, y1, z1] = pt(nodes[i][0], nodes[i][1], nodes[i][2]);
      const [x2, y2, z2] = pt(nodes[j][0], nodes[j][1], nodes[j][2]);
      const depth = ((z1 + z2) / 2 + 1) / 2;
      lines.push({
        x1,
        y1,
        x2,
        y2,
        white: 0.42,
        a: (1 - dist / thr) * (0.3 + 0.55 * depth),
        w: Math.max(0.6, (o.lineW ?? 0.8) * rs)
      });
    }
  }
  for (let i = 0; i < nodeN; i++) {
    const [px, py, z] = pt(nodes[i][0], nodes[i][1], nodes[i][2]);
    const depth = (z + 1) / 2;
    const pulse = 1 + 0.25 * Math.sin(t * 1.4 + i * 2.7);
    dots.push({
      x: px,
      y: py,
      z,
      r: (nodeR + nodeRDepth * depth) * pulse * rs,
      white: 0.55 - 0.45 * depth
    });
  }
  const signals = o.signals ?? 5;
  for (let s = 0; s < signals; s++) {
    const seg = Math.floor(t * 0.55 + s * 7.31);
    const a = Math.floor(hashD(seg, s * 3.1 + 1.7) * nodeN);
    const b = Math.floor(hashD(seg, s * 5.7 + 4.2) * nodeN);
    if (a === b) continue;
    const f = frac(t * 0.55 + s * 7.31);
    const x = lerp(nodes[a][0], nodes[b][0], f);
    const y = lerp(nodes[a][1], nodes[b][1], f);
    const z = lerp(nodes[a][2], nodes[b][2], f);
    const l = Math.max(1e-6, Math.sqrt(x * x + y * y + z * z));
    const [px, py, zr] = pt(x / l, y / l, z / l);
    const depth = (zr + 1) / 2;
    dots.push({
      x: px,
      y: py,
      z: zr,
      r: (nodeR * 1.5 + nodeRDepth * depth) * rs,
      white: 0.05,
      a: 0.5 + 0.5 * depth
    });
  }
  return finalizeFrame(dots, lines, o.rMin);
};

// prototypes/advisor/vendor/libraries-dev/thinking-orbs/src/engine/registry.ts
var MODE_FRAMES = {
  orbits: frameOrbits,
  globe: frameGlobe,
  rubik: frameRubik,
  wave: frameWave,
  web: frameWeb,
  braid: frameBraid,
  ribbon: frameRibbon,
  // ring shares ribbon's geometry — the `faceOn` profile flag switches it
  ring: frameRibbon,
  morph: frameMorph
};
var MODE_DRAWS = Object.fromEntries(
  Object.entries(MODE_FRAMES).map(([key, frame2]) => [
    key,
    ((ctx, size, t, dark, opts) => paintFrame(ctx, frame2(size, t, opts), dark))
  ])
);

// prototypes/advisor/vendor/libraries-dev/thinking-orbs/src/engine/profiles.ts
var COUNT_PAIRS = [
  ["latRings", "lonDensity"],
  ["rings", "lonDensity"],
  ["lanes", "segs"]
];
var COUNT_KEYS = ["orbitN", "ghostN", "nodeN", "strandN", "signals"];
var ICON_DENSITY_KEYS = ["iconD"];
var RADIUS_KEYS = [
  "rBase",
  "rDepth",
  "rActive",
  "rDot",
  "ghostR",
  "partR",
  "partRDepth",
  "nodeR",
  "nodeRDepth"
];
function scaleCounts(opts, scale) {
  const out = { ...opts };
  const done = /* @__PURE__ */ new Set();
  const rt = Math.sqrt(scale);
  for (const [a, b] of COUNT_PAIRS) {
    const va = out[a];
    const vb = out[b];
    if (va != null && vb != null && !done.has(a) && !done.has(b)) {
      out[a] = Math.max(2, Math.round(va * rt));
      out[b] = Math.max(2, Math.round(vb * rt));
      done.add(a);
      done.add(b);
    }
  }
  for (const k of COUNT_KEYS) {
    const v = out[k];
    if (v != null && v !== 0 && !done.has(k)) out[k] = Math.max(1, Math.round(v * scale));
  }
  for (const k of ICON_DENSITY_KEYS) {
    const v = out[k];
    if (v != null) out[k] = Math.max(0.02, v * scale);
  }
  return out;
}
function scaleRadii(opts, scale) {
  const out = { ...opts };
  for (const k of RADIUS_KEYS) {
    const v = out[k];
    if (v != null) out[k] = v * scale;
  }
  out.rSizeMul = (out.rSizeMul ?? 1) * scale;
  return out;
}
var BASE_PROFILES = {
  globe: {
    latRings: 17,
    lonDensity: 44,
    rBase: 0.6,
    rDepth: 1.7,
    rBoost: 1,
    inkFar: 0.62,
    inkSpan: 0.54,
    rsPow: 0.6,
    rMin: 0.3
  },
  orbits: {
    orbitN: 12,
    ghostN: 40,
    ghostR: 0.9,
    ghostA: 0.5,
    particles: 3,
    partR: 1.2,
    partRDepth: 1.6,
    rsPow: 0.6,
    rMin: 0.3
  },
  rubik: {
    latRings: 15,
    lonDensity: 40,
    moveCount: 14,
    rBase: 0.6,
    rDepth: 1.7,
    rActive: 0.3,
    inkFar: 0.62,
    inkSpan: 0.54,
    rsPow: 0.6,
    rMin: 0.3
  },
  wave: {
    rings: 15,
    lonDensity: 40,
    rBase: 0.6,
    rDepth: 1.7,
    rsPow: 0.6,
    rMin: 0.3
  },
  web: {
    nodeN: 30,
    thr: 0.72,
    signals: 5,
    nodeR: 1.4,
    nodeRDepth: 1.8,
    lineW: 0.8,
    rsPow: 0.6,
    rMin: 0.3
  },
  braid: {
    strandN: 52,
    turns: 3,
    ghostN: 150,
    rBase: 1.2,
    rDepth: 1.8,
    rsPow: 0.6,
    rMin: 0.3
  },
  ribbon: {
    lanes: 5,
    segs: 88,
    ghostN: 150,
    rBase: 1.1,
    rDepth: 1.7,
    rsPow: 0.6,
    rMin: 0.3
  },
  // ring shares ribbon's painter; faceOn cancels the camera tilt and moves
  // the undulation onto the radius, and there is no ghost sphere behind it
  ring: {
    lanes: 5,
    segs: 88,
    ghostN: 0,
    faceOn: 1,
    rBase: 1.1,
    rDepth: 1.7,
    rsPow: 0.6,
    rMin: 0.3
  },
  morph: {
    rDot: 0.021,
    iconD: 1,
    rMin: 0.25
  }
};

// prototypes/advisor/vendor/libraries-dev/thinking-orbs/src/presets.ts
var STATE_TO_MODE = {
  working: "orbits",
  searching: "globe",
  solving: "rubik",
  listening: "wave",
  connecting: "web",
  weaving: "braid",
  composing: "ribbon",
  breathing: "ring",
  shaping: "morph"
};
var PRESETS = {
  orbits: {
    64: { speed: 1.885, count: 1, size: 1 },
    32: { speed: 2.9072, count: 0.4251, size: 1.6849 },
    20: { speed: 3.9, count: 0.238, size: 2.4 }
  },
  globe: {
    64: { speed: 2.015, count: 0.42, size: 1.15, extra: { scanMul: 4.08, dimBase: 0.45 } },
    32: { speed: 2.3803, count: 0.1839, size: 1.4769, extra: { scanMul: 4.2301, dimBase: 0.45 } },
    20: { speed: 2.665, count: 0.105, size: 1.75, extra: { scanMul: 4.335, dimBase: 0.45 } }
  },
  rubik: {
    64: { speed: 1.82, count: 0.35, size: 1.05 },
    32: { speed: 1.8964, count: 0.1537, size: 1.4951 },
    20: { speed: 1.95, count: 0.088, size: 1.9 }
  },
  wave: {
    64: { speed: 4.388, count: 0.341, size: 1 },
    32: { speed: 4.1512, count: 0.169, size: 1.3232 },
    20: { speed: 3.998, count: 0.105, size: 1.6 }
  },
  web: {
    64: { speed: 3.315, count: 1.35, size: 0.95 },
    32: { speed: 5.0104, count: 0.4942, size: 1.2571 },
    20: { speed: 6.63, count: 0.25, size: 1.52 }
  },
  braid: {
    64: { speed: 1.625, count: 0.5, size: 1 },
    32: { speed: 2.2234, count: 0.2056, size: 1.2011 },
    20: { speed: 2.75, count: 0.1125, size: 1.36 }
  },
  ribbon: {
    64: { speed: 2.34, count: 0.25, size: 0.85, extra: { spin: 0, bandMul: 3.9, wobMul: 1 } },
    32: { speed: 2.7776, count: 0.0969, size: 0.9766, extra: { spin: 0, bandMul: 4.49, wobMul: 1 } },
    20: { speed: 3.12, count: 0.051, size: 1.073, extra: { spin: 0, bandMul: 4.94, wobMul: 1 } }
  },
  ring: {
    64: { speed: 3.24, count: 0.25, size: 0.956, extra: { spin: 0, bandMul: 3.627, wobMul: 0.368 } },
    32: { speed: 3.5517, count: 0.0678, size: 1.31, extra: { spin: 0, bandMul: 3.8265, wobMul: 0.4751 } },
    20: { speed: 3.78, count: 0.028, size: 1.622, extra: { spin: 0, bandMul: 3.968, wobMul: 0.565 } }
  },
  morph: {
    64: { speed: 2.405, count: 0.702, size: 0.395, extra: { spread: 1.45 } },
    32: { speed: 2.2057, count: 0.5937, size: 0.6916, extra: { spread: 1.45 } },
    20: { speed: 2.08, count: 0.53, size: 1.011, extra: { spread: 1.45 } }
  }
};
var cache = /* @__PURE__ */ new Map();
function resolvePreset(state, size) {
  const key = `${state}-${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const mode = STATE_TO_MODE[state];
  const preset = PRESETS[mode][size];
  let opts = { ...BASE_PROFILES[mode] };
  if (preset.count !== 1) opts = scaleCounts(opts, preset.count);
  if (preset.size !== 1) opts = scaleRadii(opts, preset.size);
  if (preset.extra) opts = { ...opts, ...preset.extra };
  const resolved = { mode, speed: preset.speed, opts };
  cache.set(key, resolved);
  return resolved;
}

// prototypes/advisor/vendor/libraries-dev/border-beam/src/pulseDriver.ts
var instances = /* @__PURE__ */ new Set();
var rafId = null;
var lastFrame = 0;
var FRAME_INTERVAL = 1e3 / 30 - 2;
var TWO_PI = Math.PI * 2;
function pingPong(phase) {
  return (1 - Math.cos(TWO_PI * phase)) / 2;
}
function frame(ts) {
  rafId = requestAnimationFrame(frame);
  if (ts - lastFrame < FRAME_INTERVAL) return;
  lastFrame = ts;
  const tSec = ts / 1e3;
  instances.forEach(({ el, config }) => {
    for (const osc of config.oscillators) {
      const phase = (tSec - osc.delay) / osc.period;
      const value = osc.a + (osc.b - osc.a) * pingPong(phase);
      el.style.setProperty(
        osc.prop,
        osc.unit === "px" ? `${value.toFixed(2)}px` : value.toFixed(4)
      );
    }
    if (config.hue) {
      const { prop, range, period, continuous } = config.hue;
      const value = continuous ? tSec / period % 1 * range : -range + 2 * range * pingPong(tSec / period);
      el.style.setProperty(prop, `${value.toFixed(2)}deg`);
    }
  });
}
function startLoop() {
  if (rafId == null) {
    lastFrame = 0;
    rafId = requestAnimationFrame(frame);
  }
}
function stopLoopIfIdle() {
  if (instances.size === 0 && rafId != null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}
function registerPulseInstance(el, config) {
  const instance = { el, config };
  instances.add(instance);
  startLoop();
  return () => {
    instances.delete(instance);
    stopLoopIfIdle();
  };
}

// prototypes/advisor/overview-effects/pulse-config.js
var configs = { "dark": { "oscillators": [{ "prop": "--bw1-overview-ai-dark", "a": 0.72, "b": 1.308, "period": 2.3400000000000003, "delay": 0, "unit": "" }, { "prop": "--bh1-overview-ai-dark", "a": 1.252, "b": 0.762, "period": 3.2760000000000002, "delay": 0, "unit": "" }, { "prop": "--bx1-overview-ai-dark", "a": -33, "b": 29.7, "period": 3.04, "delay": 0, "unit": "px" }, { "prop": "--by1-overview-ai-dark", "a": 18.150000000000002, "b": -23.099999999999998, "period": 3.04, "delay": 0, "unit": "px" }, { "prop": "--bw2-overview-ai-dark", "a": 1.28, "b": 0.762, "period": 2.8600000000000003, "delay": 0, "unit": "" }, { "prop": "--bh2-overview-ai-dark", "a": 0.776, "b": 1.294, "period": 2.1060000000000003, "delay": 0, "unit": "" }, { "prop": "--bx2-overview-ai-dark", "a": 26.400000000000002, "b": -29.7, "period": 3.5719999999999996, "delay": 0, "unit": "px" }, { "prop": "--by2-overview-ai-dark", "a": -33, "b": 21.45, "period": 3.5719999999999996, "delay": 0, "unit": "px" }, { "prop": "--bw3-overview-ai-dark", "a": 0.832, "b": 1.322, "period": 2.548, "delay": 0, "unit": "" }, { "prop": "--bh3-overview-ai-dark", "a": 1.21, "b": 0.72, "period": 3.6399999999999997, "delay": 0, "unit": "" }, { "prop": "--bx3-overview-ai-dark", "a": -19.8, "b": 33, "period": 2.755, "delay": 0, "unit": "px" }, { "prop": "--by3-overview-ai-dark", "a": -28.05, "b": 14.85, "period": 2.755, "delay": 0, "unit": "px" }, { "prop": "--bgh-overview-ai-dark", "a": 0.6599999999999999, "b": 1.34, "period": 2.4, "delay": 0, "unit": "" }, { "prop": "--bop-tl-overview-ai-dark", "a": 0.52, "b": 1, "period": 1.9, "delay": 0, "unit": "" }, { "prop": "--bop-tr-overview-ai-dark", "a": 0.52, "b": 1, "period": 2.508, "delay": 0.532, "unit": "" }, { "prop": "--bop-bl-overview-ai-dark", "a": 0.52, "b": 1, "period": 1.5959999999999999, "delay": 1.045, "unit": "" }, { "prop": "--bop-br-overview-ai-dark", "a": 0.52, "b": 1, "period": 3.002, "delay": 1.577, "unit": "" }], "hue": { "prop": "--beam-hue-overview-ai-dark", "range": 360, "period": 16, "continuous": true } }, "light": { "oscillators": [{ "prop": "--bw1-overview-ai-light", "a": 0.72, "b": 1.308, "period": 4.14, "delay": 0, "unit": "" }, { "prop": "--bh1-overview-ai-light", "a": 1.252, "b": 0.762, "period": 5.795999999999999, "delay": 0, "unit": "" }, { "prop": "--bx1-overview-ai-light", "a": -40, "b": 36, "period": 4.16, "delay": 0, "unit": "px" }, { "prop": "--by1-overview-ai-light", "a": 22, "b": -28, "period": 4.16, "delay": 0, "unit": "px" }, { "prop": "--bw2-overview-ai-light", "a": 1.28, "b": 0.762, "period": 5.06, "delay": 0, "unit": "" }, { "prop": "--bh2-overview-ai-light", "a": 0.776, "b": 1.294, "period": 3.726, "delay": 0, "unit": "" }, { "prop": "--bx2-overview-ai-light", "a": 32, "b": -36, "period": 4.888, "delay": 0, "unit": "px" }, { "prop": "--by2-overview-ai-light", "a": -40, "b": 26, "period": 4.888, "delay": 0, "unit": "px" }, { "prop": "--bw3-overview-ai-light", "a": 0.832, "b": 1.322, "period": 4.508, "delay": 0, "unit": "" }, { "prop": "--bh3-overview-ai-light", "a": 1.21, "b": 0.72, "period": 6.4399999999999995, "delay": 0, "unit": "" }, { "prop": "--bx3-overview-ai-light", "a": -24, "b": 40, "period": 3.77, "delay": 0, "unit": "px" }, { "prop": "--by3-overview-ai-light", "a": -34, "b": 18, "period": 3.77, "delay": 0, "unit": "px" }, { "prop": "--bgh-overview-ai-light", "a": 0.78, "b": 1.22, "period": 5.5, "delay": 0, "unit": "" }, { "prop": "--bop-tl-overview-ai-light", "a": 0.55, "b": 1, "period": 2.6, "delay": 0, "unit": "" }, { "prop": "--bop-tr-overview-ai-light", "a": 0.55, "b": 1, "period": 3.4320000000000004, "delay": 0.7280000000000001, "unit": "" }, { "prop": "--bop-bl-overview-ai-light", "a": 0.55, "b": 1, "period": 2.184, "delay": 1.4300000000000002, "unit": "" }, { "prop": "--bop-br-overview-ai-light", "a": 0.55, "b": 1, "period": 4.1080000000000005, "delay": 2.158, "unit": "" }], "hue": { "prop": "--beam-hue-overview-ai-light", "range": 360, "period": 16, "continuous": true } } };

// prototypes/advisor/overview-effects/state.mjs
function overviewOrbState({ active = false, state = "idle", toolActive = false, working = false } = {}) {
  if (active && state === "ending") return { orb: "breathing", label: "Stopping", paused: true };
  if (active && state === "speaking") return { orb: "composing", label: "Speaking" };
  if (active && toolActive) return { orb: "searching", label: "Using tools" };
  if (working || active && state === "working") return { orb: "solving", label: "Working" };
  if (active && state === "connecting") return { orb: "breathing", label: "Connecting", paused: true };
  if (active) return { orb: "breathing", label: "Listening" };
  return null;
}
function isAdvisorPage(page) {
  return typeof page === "string" && /^#\/?[a-z][a-z0-9-]*(?:[/?]|$)/.test(page);
}

// prototypes/advisor/overview-effects/index.js
function setupCompanionOrb(canvas) {
  const size = 112, dpr = Math.min(2, devicePixelRatio || 1), ctx = canvas.getContext("2d");
  canvas.width = canvas.height = size * dpr;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let selection = null, visible = true, raf = 0, last = 0, disposed = false;
  function draw(t = 0.6) {
    if (!ctx || !selection) return;
    const preset = resolvePreset(selection.orb, 64);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.scale(size / 64, size / 64);
    paintFrame(ctx, MODE_FRAMES[preset.mode](64, t * preset.speed, preset.opts), !["light", "sand"].includes(document.documentElement.dataset.theme));
  }
  function loop(t) {
    if (t - last >= 32) {
      draw(t / 1e3);
      last = t;
    }
    raf = requestAnimationFrame(loop);
  }
  function sync() {
    if (disposed) return;
    cancelAnimationFrame(raf);
    draw();
    if (selection && !selection.paused && visible && !document.hidden && !reduced.matches) raf = requestAnimationFrame(loop);
  }
  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    sync();
  });
  io.observe(canvas);
  const theme = new MutationObserver(sync);
  theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  reduced.addEventListener("change", sync);
  document.addEventListener("visibilitychange", sync);
  return {
    setVoice(value) {
      selection = overviewOrbState(value);
      canvas.dataset.orbState = selection?.orb || "idle";
      sync();
      return selection;
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      io.disconnect();
      theme.disconnect();
      reduced.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
    }
  };
}
function setupOverviewEffects() {
  const root = document.documentElement, shell = document.getElementById("advisor-shell");
  const composer = document.querySelector(".composer");
  const inert = { setVoice() {
  }, setWorking() {
  }, dispose() {
  } };
  if (!composer || !shell || parent === window || !new URLSearchParams(location.search).has("embedded")) return inert;
  const bloom = document.createElement("span");
  bloom.dataset.beamBloom = "";
  bloom.setAttribute("aria-hidden", "true");
  composer.append(bloom);
  const status = document.createElement("span");
  status.className = "overview-orb-status";
  status.hidden = true;
  const canvas = document.createElement("canvas");
  canvas.className = "overview-thinking-orb";
  canvas.setAttribute("aria-hidden", "true");
  const label = document.createElement("span");
  label.className = "overview-orb-label";
  label.setAttribute("role", "status");
  label.setAttribute("aria-live", "polite");
  status.append(canvas, label);
  document.querySelector("#advisor-activity summary").prepend(status);
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = canvas.height = 64 * dpr;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let enabled = false, visible = false, working = false, voice = {}, selection = null;
  let theme = "dark", beamId, unregisterPulse, raf = 0, lastFrame2 = 0, disposed = false;
  function draw(t = 0.6) {
    if (!ctx || !selection) return;
    const preset = resolvePreset(selection.orb, 64);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, 64, 64);
    paintFrame(ctx, MODE_FRAMES[preset.mode](64, t * preset.speed, preset.opts), theme === "dark");
  }
  function loop(t) {
    if (t - lastFrame2 >= 32) {
      draw(t / 1e3);
      lastFrame2 = t;
    }
    raf = requestAnimationFrame(loop);
  }
  function stop() {
    unregisterPulse?.();
    unregisterPulse = null;
    cancelAnimationFrame(raf);
    raf = 0;
  }
  function sync() {
    if (disposed) return;
    stop();
    theme = ["light", "sand"].includes(root.dataset.theme) ? "light" : "dark";
    beamId = `overview-ai-${theme}`;
    if (enabled) {
      root.dataset.overviewEffects = "true";
      composer.dataset.beam = beamId;
      composer.dataset.active = "";
      composer.style.setProperty("--beam-strength", ".8");
      composer.style.setProperty(`--beam-opacity-${beamId}`, "1");
    } else {
      delete root.dataset.overviewEffects;
      delete composer.dataset.beam;
      delete composer.dataset.active;
    }
    selection = enabled ? overviewOrbState({ working: working || voice.active && (voice.toolActive || voice.state === "working") }) : null;
    status.hidden = !selection;
    if (selection) {
      canvas.dataset.orbState = selection.orb;
      if (label.textContent !== selection.label) label.textContent = selection.label;
      draw();
    } else {
      label.textContent = "";
      delete canvas.dataset.orbState;
    }
    const running = enabled && visible && !document.hidden && !reduced.matches;
    if (running) unregisterPulse = registerPulseInstance(composer, configs[theme]);
    if (running && selection && !selection.paused && ctx) raf = requestAnimationFrame(loop);
  }
  const receive = (event) => {
    if (event.source !== parent || event.origin !== location.origin) return;
    if (event.data?.type === "advisor:context") {
      const next = isAdvisorPage(event.data.context?.page);
      if (next !== enabled) {
        enabled = next;
        sync();
      }
    }
  };
  window.addEventListener("message", receive);
  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    sync();
  });
  io.observe(composer);
  const themes = new MutationObserver(sync);
  themes.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  reduced.addEventListener("change", sync);
  document.addEventListener("visibilitychange", sync);
  const dispose = () => {
    if (disposed) return;
    stop();
    disposed = true;
    io.disconnect();
    themes.disconnect();
    window.removeEventListener("message", receive);
    reduced.removeEventListener("change", sync);
    document.removeEventListener("visibilitychange", sync);
    delete root.dataset.overviewEffects;
    delete composer.dataset.beam;
    delete composer.dataset.active;
    bloom.remove();
    status.remove();
  };
  window.addEventListener("pagehide", dispose, { once: true });
  return {
    setVoice(value) {
      const next = { active: Boolean(value.active), state: value.state, toolActive: Boolean(value.toolActive) };
      if (JSON.stringify(next) !== JSON.stringify(voice)) {
        voice = next;
        sync();
      }
    },
    setWorking(value) {
      if (working !== Boolean(value)) {
        working = Boolean(value);
        sync();
      }
    },
    dispose
  };
}
export {
  setupCompanionOrb,
  setupOverviewEffects
};
