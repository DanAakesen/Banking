// Markets redesign concepts. A standalone, clearly labelled prototype: sample data only, no network access,
// and order actions never leave the page.
(function () {
  const M = window.MC, LC = window.LightweightCharts, main = document.getElementById('main'), overlay = document.getElementById('overlay-root');
  const hash = new URLSearchParams(location.hash.slice(1));
  const S = { concept: +hash.get('c') || 1, theme: hash.get('theme') || 'graphite', ticks: hash.get('ticks') !== 'off', open: hash.get('open') || '', q: hash.get('q') || '',
    sym: 'MSFT', range: '6M', side: 'Buy', type: 'Limit', qty: 10, limit: null, duration: 'Day', listTab: 'watchlist', dockTab: 'positions', group: 'All', alloc: 'Asset class', chartType: 'candles', ma50: true, ma200: true, compare: 'NOVO B', ticketStep: 'form' };
  let charts = [], cleanups = [], gid = 0, tickTimer;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tones = ['#7fa3e3', '#9cc27c', '#e4a86e', '#b894d8', '#7fc0b5', '#e38c92', '#d7b35a', '#8fb7d9', '#c69ac6', '#9fc7a0'];
  M.instruments.forEach((x, i) => x.tone = tones[i % tones.length]);

  const nf = (n, d = 2) => n == null || !isFinite(n) ? '—' : new Intl.NumberFormat('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
  const money = (n, c, d = 2) => n == null ? '—' : `${nf(n, d)}<span class="cur">${c}</span>`;
  const signed = (n, d = 2) => (n >= 0 ? '+' : '−') + nf(Math.abs(n), d);
  const pct = n => signed(n) + '%';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const X = s => M.by[s];
  const mono = x => (x.sym.replace(/\s.*/, '').slice(0, 4));
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const holding = s => M.holdings.find(h => h.sym === s);
  const order = s => M.orders.find(o => o.sym === s);
  const chgClass = n => n >= 0 ? 'up' : 'down';
  const feedBadge = x => x.feed === 'delayed' ? '<span class="feed" title="Delayed by 15 minutes">15m</span>' : '';

  function spark(pts, w, h, up, { base = null, fluid = false, area = true } = {}) {
    const lo = Math.min(...pts, base ?? Infinity), hi = Math.max(...pts, base ?? -Infinity), r = hi - lo || 1;
    const px = i => (i / (pts.length - 1)) * w, py = v => h - 2 - ((v - lo) / r) * (h - 4);
    const d = pts.map((v, i) => (i ? 'L' : 'M') + px(i).toFixed(1) + ' ' + py(v).toFixed(1)).join('');
    const id = 'sg' + (++gid);
    return `<svg class="spark ${up ? 'up' : 'down'} ${fluid ? 'fluid' : ''}" ${fluid ? '' : `width="${w}"`} height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">${area ? `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".3"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs><path d="${d}L${w} ${h}L0 ${h}Z" fill="url(#${id})"/>` : ''}${base != null ? `<line class="base" x1="0" x2="${w}" y1="${py(base).toFixed(1)}" y2="${py(base).toFixed(1)}" vector-effect="non-scaling-stroke"/>` : ''}<path class="ln" d="${d}" vector-effect="non-scaling-stroke"/></svg>`;
  }

  // CSP-safe pattern from the app: values travel in data attributes and are applied through CSSOM.
  function paint(root) {
    root.querySelectorAll('[data-w]').forEach(el => el.style.width = el.dataset.w + '%');
    root.querySelectorAll('[data-l]').forEach(el => el.style.left = el.dataset.l + '%');
    root.querySelectorAll('[data-tone]').forEach(el => el.style.setProperty('--tone', el.dataset.tone));
    root.querySelectorAll('[data-p]').forEach(el => el.style.setProperty('--p', el.dataset.p));
    root.querySelectorAll('[data-bg]').forEach(el => el.style.background = el.dataset.bg);
  }

  function roll(el, text) {
    if (!el) return;
    const chars = [...text];
    if (el.dataset.len !== String(chars.length) || el.dataset.shape !== text.replace(/\d/g, '0')) {
      el.dataset.len = chars.length; el.dataset.shape = text.replace(/\d/g, '0');
      el.innerHTML = chars.map(c => /\d/.test(c) ? `<span class="d"><span>${'0123456789'.split('').map(n => `<span>${n}</span>`).join('')}</span></span>` : `<span>${c}</span>`).join('');
      el.setAttribute('aria-label', text);
    }
    el.setAttribute('aria-label', text);
    let i = 0; el.querySelectorAll('.d>span').forEach(col => { while (!/\d/.test(chars[i])) i++; col.style.transform = `translateY(-${chars[i]}em)`; i++; });
  }

  // Portfolio arithmetic on the sample data.
  function portfolio() {
    const rows = M.holdings.map(h => { const x = X(h.sym), f = M.fx[x.cur]; return { h, x, value: h.qty * x.last * f, today: h.qty * (x.last - x.prev) * f, unreal: h.qty * (x.last - h.avg) * f, cost: h.qty * h.avg * f, local: h.qty * x.last }; });
    const invested = rows.reduce((s, r) => s + r.value, 0), today = rows.reduce((s, r) => s + r.today, 0), unreal = rows.reduce((s, r) => s + r.unreal, 0), cost = rows.reduce((s, r) => s + r.cost, 0);
    rows.forEach(r => r.weight = r.value / invested * 100);
    const curve = M.holdings[0] ? X(M.holdings[0].sym).spark.map((_, i) => M.holdings.reduce((s, h) => s + h.qty * X(h.sym).spark[i] * M.fx[X(h.sym).cur], 0)) : [];
    return { rows, invested, today, unreal, cost, total: invested + M.cash, curve, todayPct: today / (invested - today) * 100, unrealPct: unreal / cost * 100 };
  }

  // Shared header anatomy: title, glass controls, one headline figure and up to three glass cards.
  function scene({ controls, lead, cards }) {
    return `<header class="scene" data-scene><h1>Markets</h1><div class="scene-controls">${controls}</div><div class="scene-stage"><div class="scene-lead">${lead}</div><div class="scene-cards">${cards}</div></div></header>`;
  }
  const envSeg = () => `<div class="glass glass-seg" role="group" aria-label="Saxo environment"><button aria-pressed="false">SIM</button><button aria-pressed="true">LIVE</button></div>`;
  const statusPill = () => `<span class="glass glass-pill" role="status"><span class="live-dot" aria-hidden="true"></span>Streaming · <span class="num" data-clock>${M.clock.label}</span></span>`;
  const searchPill = () => `<button class="glass glass-pill" data-open-palette><span aria-hidden="true">⌕</span>Search instruments <kbd>/</kbd></button>`;

  function chartColors() { return { ink: css('--ink'), muted: css('--muted'), line: css('--line'), up: css('--up'), down: css('--down'), accent: css('--accent'), warn: css('--warn'), ai: css('--ai-accent') }; }
  function makeChart(node, extra = {}) {
    const c = chartColors();
    const ch = LC.createChart(node, Object.assign({ autoSize: true, layout: { background: { type: 'solid', color: 'transparent' }, textColor: c.muted, fontFamily: 'Inter, Segoe UI, sans-serif', attributionLogo: false },
      grid: { vertLines: { color: 'transparent' }, horzLines: { color: c.line + '88' } }, rightPriceScale: { borderVisible: false }, timeScale: { borderVisible: false }, crosshair: { mode: 0, vertLine: { color: c.muted, labelBackgroundColor: c.accent }, horzLine: { color: c.muted, labelBackgroundColor: c.accent } } }, extra));
    charts.push(ch); return ch;
  }
  const rangeBars = (x, r) => r === '1D' ? null : x.bars.slice(-({ '1M': 22, '3M': 64, '6M': 126, 'YTD': 187, '1Y': 252 }[r] || 126));
  const intradayData = x => x.spark.map((v, i) => ({ time: Math.floor(Date.UTC(2026, 8, 28, 7, 0) / 1000) + i * 300, value: v }));
  const sma = (bars, n) => bars.map((b, i) => i < n - 1 ? null : { time: b.time, value: bars.slice(i - n + 1, i + 1).reduce((s, x) => s + x.close, 0) / n }).filter(Boolean);

  function rangePills(active) { return `<div class="pills" role="group" aria-label="Chart period">${['1D', '1M', '3M', '6M', 'YTD', '1Y'].map(r => `<button data-range="${r}" aria-pressed="${r === active}">${r}</button>`).join('')}</div>`; }

  /* ---------- Concept 1: trading desk ---------- */
  function concept1() {
    const x = X(S.sym), h = holding(S.sym), P = portfolio();
    const dayPos = (x.last - x.low) / (x.high - x.low) * 100;
    main.innerHTML = scene({
      controls: searchPill() + envSeg() + statusPill(),
      lead: `<span class="scene-label">${esc(x.name)} · ${esc(x.sym)} · ${esc(x.exch)}</span><span class="scene-figure"><span class="roll inherit" data-roll="lead"></span><span class="cur">${x.cur}</span></span><span class="scene-tag ${chgClass(x.chg)}" data-tag="${x.sym}">${signed(x.last - x.prev)} · ${pct(x.chg)} today</span>`,
      cards: `<div class="glass scene-card"><span class="scene-card-label">Day range</span><strong class="num">${nf(x.low)} – ${nf(x.high)}</strong><span class="g-meter"><i data-w="${dayPos.toFixed(1)}"></i><b data-l="${dayPos.toFixed(1)}"></b></span><small>Open ${nf(x.open)} · Prev ${nf(x.prev)}</small></div>
        <div class="glass scene-card"><span class="scene-card-label">Bid / Ask</span><strong class="num"><span data-bid="${x.sym}">${nf(x.bid)}</span> / <span data-ask="${x.sym}">${nf(x.ask)}</span></strong><small>Spread ${nf(x.ask - x.bid)} · Size 300 × 200</small></div>
        <div class="glass scene-card"><span class="scene-card-label"><span class="ring" data-p=".11" aria-hidden="true"></span>Nasdaq open</span><strong>Closes 22:00</strong><small>5 h 48 min of trading left</small></div>`
    }) + `<div class="sticky-bar" aria-hidden="true"><span class="mono" data-tone="${x.tone}">${mono(x)}</span><strong>${esc(x.name)}</strong><span class="px" data-px="${x.sym}">${nf(x.last)}</span><span class="chg ${chgClass(x.chg)}" data-chg="${x.sym}">${pct(x.chg)}</span><span class="sp"></span><button class="btn buy" data-trade="Buy">Buy</button><button class="btn sell" data-trade="Sell">Sell</button></div>
    <div class="desk">
      <section class="panel desk-list" aria-label="Instruments">
        <div class="panel-head"><div class="pills" role="tablist"><button role="tab" data-list="watchlist" aria-selected="${S.listTab === 'watchlist'}">Watchlist<span class="count">${M.instruments.length}</span></button><button role="tab" data-list="holdings" aria-selected="${S.listTab === 'holdings'}">Holdings<span class="count">${M.holdings.length}</span></button></div><button class="icon-btn" aria-label="Add instrument" data-open-palette>+</button></div>
        <div class="list-filters">${['All', 'Owned', 'Denmark', 'US'].map(g => `<button class="chip ${S.group === g ? 'accent' : ''}" data-group="${g}">${g}</button>`).join('')}</div>
        <div class="rows" id="desk-rows"></div>
      </section>
      <section class="panel desk-chart">
        <div class="panel-head"><div class="inst-head"><span class="mono" data-tone="${x.tone}">${mono(x)}</span><h2>${esc(x.name)}</h2><span class="chip">${esc(x.exch)} · ${x.cur} · ${x.kind}</span>${x.feed === 'delayed' ? '<span class="feed">Delayed 15 min</span>' : '<span class="chip accent">Real-time</span>'}</div>
          <div class="toolbar">${rangePills(S.range)}<div class="pills" role="group" aria-label="Chart type">${[['candles', '▮▯', 'Candles'], ['line', '╱', 'Line'], ['area', '◭', 'Area']].map(([k, i, l]) => `<button data-ctype="${k}" aria-pressed="${S.chartType === k}" aria-label="${l}" title="${l}">${i}</button>`).join('')}</div><div class="pills" role="group" aria-label="Indicators"><button data-ind="ma50" aria-pressed="${S.ma50}">MA 50</button><button data-ind="ma200" aria-pressed="${S.ma200}">MA 200</button></div></div></div>
        <div class="chart-box" id="c1-chart"><div class="legend" id="c1-legend"></div></div>
        <span class="attrib">Charting by TradingView · lines show your average cost and working order</span>
        <div class="stats">
          <div class="stat"><span>Open</span><strong>${money(x.open, x.cur)}</strong></div>
          <div class="stat"><span>Previous close</span><strong>${money(x.prev, x.cur)}</strong></div>
          <div class="stat"><span>Volume</span><strong>${nf(x.volume / 1e6, 1)} M</strong><small class="muted">${nf(x.volume / x.avgVolume * 100, 0)}% of 30-day avg</small></div>
          <div class="stat"><span>1 year</span><strong class="${x.y1 >= 0 ? 'pos' : 'neg'}">${pct(x.y1)}</strong></div>
          <div class="stat"><span>52-week range</span><strong>${nf(x.w52.low, 0)} – ${nf(x.w52.high, 0)}</strong><span class="rbar"><b data-l="${((x.last - x.w52.low) / (x.w52.high - x.w52.low) * 100).toFixed(1)}"></b></span></div>
          <div class="stat"><span>Your position</span><strong>${h ? h.qty + ' · ' + `<span class="${x.last >= h.avg ? 'pos' : 'neg'}">${pct((x.last / h.avg - 1) * 100)}</span>` : '—'}</strong></div>
        </div>
      </section>
      <div class="desk-ticket">
        <section class="panel" id="ticket" aria-label="Order ticket"></section>
        <section class="panel depth-panel"><div class="panel-head"><h2>Market depth</h2><span class="chip">Level 2</span></div><div class="depth-head"><span>Size · Bid</span><span>Ask · Size</span></div><div class="depth" id="depth"></div><p class="note">Needs an exchange data subscription in Saxo. Without it, only the best bid and ask are shown.</p></section>
      </div>
      <section class="panel desk-dock"><div class="panel-head"><div class="pills" role="tablist">${[['positions', 'Positions', M.holdings.length], ['orders', 'Working orders', M.orders.length], ['activity', 'Activity', M.activity.length]].map(([k, l, n]) => `<button role="tab" data-dock="${k}" aria-selected="${S.dockTab === k}">${l}<span class="count">${n}</span></button>`).join('')}</div><span class="muted num">Account value ${money(P.total, 'DKK')} · Available ${money(M.cash, 'DKK')}</span></div><div class="table-wrap" id="dock"></div></section>
    </div>
    <div class="phone-actions"><button class="btn buy" data-trade="Buy">Buy ${esc(x.sym)}</button><button class="btn sell" data-trade="Sell">Sell</button></div>`;
    roll(main.querySelector('[data-roll=lead]'), nf(x.last));
    drawDeskRows(); drawDock(); drawTicket(main.querySelector('#ticket')); drawDepth(); drawC1Chart();
    main.querySelectorAll('[data-list]').forEach(b => b.onclick = () => { S.listTab = b.dataset.list; main.querySelectorAll('[data-list]').forEach(o => o.setAttribute('aria-selected', o === b)); drawDeskRows(); });
    main.querySelectorAll('[data-group]').forEach(b => b.onclick = () => { S.group = b.dataset.group; main.querySelectorAll('[data-group]').forEach(o => o.classList.toggle('accent', o === b)); drawDeskRows(); });
    main.querySelectorAll('[data-dock]').forEach(b => b.onclick = () => { S.dockTab = b.dataset.dock; main.querySelectorAll('[data-dock]').forEach(o => o.setAttribute('aria-selected', o === b)); drawDock(); });
    main.querySelectorAll('[data-range]').forEach(b => b.onclick = () => { S.range = b.dataset.range; main.querySelectorAll('[data-range]').forEach(o => o.setAttribute('aria-pressed', o === b)); drawC1Chart(); });
    main.querySelectorAll('[data-ctype]').forEach(b => b.onclick = () => { S.chartType = b.dataset.ctype; main.querySelectorAll('[data-ctype]').forEach(o => o.setAttribute('aria-pressed', o === b)); drawC1Chart(); });
    main.querySelectorAll('[data-ind]').forEach(b => b.onclick = () => { S[b.dataset.ind] = !S[b.dataset.ind]; b.setAttribute('aria-pressed', S[b.dataset.ind]); drawC1Chart(); });
    const bar = main.querySelector('.sticky-bar'), io = new IntersectionObserver(([e]) => { bar.classList.toggle('show', !e.isIntersecting); bar.setAttribute('aria-hidden', String(e.isIntersecting)); });
    io.observe(main.querySelector('[data-scene]')); cleanups.push(() => io.disconnect());
  }

  function filtered() {
    return M.instruments.filter(x => S.group === 'All' || (S.group === 'Owned' ? holding(x.sym) : x.region === S.group));
  }
  function drawDeskRows() {
    const out = main.querySelector('#desk-rows');
    const list = S.listTab === 'holdings' ? M.holdings.map(h => X(h.sym)).filter(x => filtered().includes(x)) : filtered();
    out.innerHTML = list.map(x => { const h = holding(x.sym); return `<button class="row ${x.sym === S.sym ? 'selected' : ''}" data-sym="${x.sym}" aria-pressed="${x.sym === S.sym}"><span class="mono" data-tone="${x.tone}">${mono(x)}</span><span class="row-name"><strong>${esc(x.name)}</strong><small>${S.listTab === 'holdings' && h ? `${h.qty} · <span class="${x.last >= h.avg ? 'pos' : 'neg'}">${pct((x.last / h.avg - 1) * 100)}</span>` : esc(x.sym)} ${feedBadge(x)}</small></span>${spark(x.spark, 70, 28, x.chg >= 0, { base: x.prev })}<span class="row-px"><span class="px" data-px="${x.sym}">${nf(x.last)}</span><span class="chg ${chgClass(x.chg)}" data-chg="${x.sym}">${pct(x.chg)}</span></span></button>`; }).join('') || '<p class="muted">Nothing in this group</p>';
    paint(out);
    out.querySelectorAll('[data-sym]').forEach(b => b.onclick = () => { S.sym = b.dataset.sym; S.limit = null; S.ticketStep = 'form'; render(); });
  }

  function drawDock() {
    const out = main.querySelector('#dock'), P = portfolio();
    if (S.dockTab === 'positions') {
      out.innerHTML = `<table class="table"><thead><tr><th>Instrument</th><th>Quantity</th><th>Avg cost</th><th>Last</th><th>Market value</th><th>Today</th><th>Unrealised</th><th>Weight</th></tr></thead><tbody>${P.rows.map(r => `<tr><td><span class="inst"><span class="mono" data-tone="${r.x.tone}">${mono(r.x)}</span>${esc(r.x.name)}</span></td><td>${r.h.qty}</td><td>${money(r.h.avg, r.x.cur)}</td><td><span class="px" data-px="${r.x.sym}">${nf(r.x.last)}</span><span class="cur">${r.x.cur}</span></td><td>${money(r.value, 'DKK')}</td><td class="${r.today >= 0 ? 'pos' : 'neg'}">${signed(r.today)}<span class="cur">DKK</span></td><td class="${r.unreal >= 0 ? 'pos' : 'neg'}">${signed(r.unreal)}<span class="cur">DKK</span> · ${pct(r.unreal / r.cost * 100)}</td><td>${nf(r.weight, 1)}%<span class="weight"><i data-w="${r.weight.toFixed(1)}"></i></span></td></tr>`).join('')}</tbody></table>`;
    } else if (S.dockTab === 'orders') {
      out.innerHTML = `<table class="table"><thead><tr><th>Instrument</th><th>Side</th><th>Quantity</th><th>Type</th><th>Limit</th><th>Distance to market</th><th>Duration</th><th>Status</th><th>Placed</th></tr></thead><tbody>${M.orders.map(o => { const x = X(o.sym), d = (o.price / x.last - 1) * 100, pos = Math.max(4, Math.min(96, 50 + d * 6)); return `<tr><td><span class="inst"><span class="mono" data-tone="${x.tone}">${mono(x)}</span>${esc(x.name)}</span></td><td class="${o.side === 'Buy' ? 'pos' : 'neg'}">${o.side}</td><td>${o.filled ? `${o.filled} of ${o.qty}` : o.qty}</td><td>${o.type}</td><td>${money(o.price, x.cur)}</td><td><span class="dist"><span class="dist-bar"><i data-l="50"></i><b data-l="${pos.toFixed(1)}"></b></span>${pct(d)}</span></td><td>${o.duration}</td><td><span class="state ${o.filled ? 'partial' : ''}">${o.state}</span></td><td class="muted">${o.placed}</td></tr>`; }).join('')}</tbody></table>`;
    } else {
      out.innerHTML = `<table class="table"><tbody>${M.activity.map(a => `<tr><td>${esc(a.text)}</td><td class="muted">${a.time}</td></tr>`).join('')}</tbody></table>`;
    }
    paint(out);
  }

  function drawDepth() {
    const x = X(S.sym), d = M.depth(x), max = Math.max(...d.flatMap(r => [r.bidSize, r.askSize]));
    const out = main.querySelector('#depth'); if (!out) return;
    out.innerHTML = d.map(r => `<div class="depth-row"><div class="depth-cell bid"><i data-w="${(r.bidSize / max * 100).toFixed(0)}"></i><span>${nf(r.bidSize, 0)}</span><span>${nf(r.bid)}</span></div><div class="depth-cell ask"><i data-w="${(r.askSize / max * 100).toFixed(0)}"></i><span>${nf(r.ask)}</span><span>${nf(r.askSize, 0)}</span></div></div>`).join('');
    paint(out);
  }

  function drawC1Chart() {
    charts.forEach(c => c.remove()); charts = [];
    const x = X(S.sym), node = main.querySelector('#c1-chart'), c = chartColors(), h = holding(S.sym), o = order(S.sym);
    const ch = makeChart(node, { timeScale: { borderVisible: false, timeVisible: S.range === '1D' } });
    let series;
    const bars = rangeBars(x, S.range);
    if (!bars) {
      series = ch.addSeries(LC.AreaSeries, { lineColor: c.accent, topColor: c.accent + '55', bottomColor: c.accent + '00', lineWidth: 2 });
      series.setData(intradayData(x));
      series.createPriceLine({ price: x.prev, color: c.muted, lineStyle: 2, lineWidth: 1, title: 'Prev close' });
    } else {
      if (S.chartType === 'candles') { series = ch.addSeries(LC.CandlestickSeries, { upColor: c.up, downColor: c.down, wickUpColor: c.up, wickDownColor: c.down, borderVisible: false }); series.setData(bars); }
      else if (S.chartType === 'line') { series = ch.addSeries(LC.LineSeries, { color: c.accent, lineWidth: 2 }); series.setData(bars.map(b => ({ time: b.time, value: b.close }))); }
      else { series = ch.addSeries(LC.AreaSeries, { lineColor: c.accent, topColor: c.accent + '55', bottomColor: c.accent + '00', lineWidth: 2 }); series.setData(bars.map(b => ({ time: b.time, value: b.close }))); }
      series.priceScale().applyOptions({ scaleMargins: { top: .08, bottom: .2 } });
      const vol = ch.addSeries(LC.HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false });
      vol.priceScale().applyOptions({ scaleMargins: { top: .84, bottom: 0 } });
      vol.setData(bars.map(b => ({ time: b.time, value: b.volume, color: (b.close >= b.open ? c.up : c.down) + '40' })));
      const first = bars[0].time;
      if (S.ma50) ch.addSeries(LC.LineSeries, { color: '#e7b75f', lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }).setData(sma(x.bars, 50).filter(p => p.time >= first));
      if (S.ma200) ch.addSeries(LC.LineSeries, { color: c.ai, lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }).setData(sma(x.bars, 200).filter(p => p.time >= first));
      if (h?.fills && LC.createSeriesMarkers) LC.createSeriesMarkers(series, h.fills.filter(f => f.time >= first).map(f => ({ time: f.time, position: 'belowBar', color: c.accent, shape: 'arrowUp', text: 'Buy ' + f.qty })));
    }
    if (h) series.createPriceLine({ price: h.avg, color: c.accent, lineStyle: 2, lineWidth: 1, title: 'Avg cost' });
    if (o) series.createPriceLine({ price: o.price, color: c.warn, lineStyle: 1, lineWidth: 1, title: `${o.side} limit · ${o.qty}` });
    ch.timeScale().fitContent();
    const legend = main.querySelector('#c1-legend'), last = bars ? bars[bars.length - 1] : null;
    const show = b => { legend.innerHTML = b ? `<span>O <b>${nf(b.open)}</b></span><span>H <b>${nf(b.high)}</b></span><span>L <b>${nf(b.low)}</b></span><span>C <b>${nf(b.close)}</b></span>${b.volume ? `<span>Vol <b>${nf(b.volume / 1e6, 1)} M</b></span>` : ''}${S.ma50 ? '<span class="ma50">MA 50</span>' : ''}${S.ma200 ? '<span class="ma200">MA 200</span>' : ''}` : `<span>Intraday · 5 min</span>`; };
    show(last);
    ch.subscribeCrosshairMove(p => { const d = p.seriesData?.get(series); if (d && d.open != null) show({ ...d, volume: bars.find(b => b.time === d.time)?.volume }); else show(last); });
    S.liveSeries = bars && S.chartType === 'candles' ? { series, bar: { ...last } } : null;
  }

  function drawTicket(host, { compact = false } = {}) {
    const x = X(S.sym), h = holding(S.sym);
    if (S.limit == null) S.limit = +(S.side === 'Buy' ? x.bid : x.ask).toFixed(2);
    const value = S.qty * S.limit, commission = x.cur === 'USD' ? Math.max(1, value * 0.0008) : x.cur === 'EUR' ? Math.max(3, value * 0.001) : Math.max(15, value * 0.001), total = S.side === 'Buy' ? value + commission : value - commission, dkk = total * M.fx[x.cur];
    const maxQty = Math.floor(M.cash / (S.limit * M.fx[x.cur] * 1.002));
    if (S.ticketStep === 'review') {
      host.innerHTML = `<div class="panel-head"><h2>Review order</h2><span class="chip">Saxo LIVE</span></div><dl class="est"><dt>Order</dt><dd>${S.side} ${S.qty} ${esc(x.name)}</dd><dt>Type</dt><dd>${S.type}${S.type !== 'Market' ? ' · ' + money(S.limit, x.cur) : ''}</dd><dt>Duration</dt><dd>${S.duration}</dd><dt>Commission (Saxo pre-check)</dt><dd>${money(commission, x.cur)}</dd><dt>FX to DKK</dt><dd>${nf(M.fx[x.cur], 4)}</dd><dt class="total">Total</dt><dd class="total">${money(dkk, 'DKK')}</dd></dl><p class="note">An accepted order works until Saxo reports a fill. Prices can move before it fills.</p><div class="toolbar"><button class="btn ghost" data-step="form">Edit</button><span class="sp"></span><button class="btn primary" data-step="placed">Place ${S.side.toLowerCase()} order</button></div>`;
    } else if (S.ticketStep === 'placed') {
      host.innerHTML = `<div class="panel-head"><h2>Order accepted</h2><span class="chip">Prototype</span></div><p>${S.side} ${S.qty} ${esc(x.name)} · ${S.type}${S.type !== 'Market' ? ' ' + money(S.limit, x.cur) : ''}</p><div class="steps"><span class="done">Placed</span><span class="now">Working</span><span>Filled</span></div><p class="note">Accepted is not filled. The order, and each fill, would appear live under Working orders. Nothing was sent: this is a prototype.</p><button class="btn wide" data-step="form">New order</button>`;
    } else {
      host.innerHTML = `${compact ? '' : `<div class="panel-head"><h2>Order ticket</h2><span class="chip">${h ? 'You own ' + h.qty : 'Not owned'}</span></div>`}
      <div class="side-seg" role="group" aria-label="Side"><button data-side="Buy" aria-pressed="${S.side === 'Buy'}">Buy</button><button data-side="Sell" aria-pressed="${S.side === 'Sell'}" ${h ? '' : 'disabled title="You have no position to sell"'}>Sell</button></div>
      <div class="field">Order type<div class="pills">${['Limit', 'Market', 'Stop', 'Stop limit'].map(t => `<button data-type="${t}" aria-pressed="${S.type === t}">${t}</button>`).join('')}</div></div>
      <label class="field">Quantity<div><button class="step" data-qty="-1" aria-label="Decrease">−</button><input class="input" type="number" min="1" value="${S.qty}" data-input="qty"><button class="step" data-qty="1" aria-label="Increase">+</button></div></label>
      <div class="quick">${[1, 5, 10, 25].map(n => `<button data-setqty="${n}" aria-pressed="${S.qty === n}">${n}</button>`).join('')}<button data-setqty="${maxQty}">Max ${maxQty}</button></div>
      ${S.type === 'Market' ? '' : `<label class="field">${S.type === 'Stop' ? 'Stop price' : 'Limit price'} · ${x.cur}<div><input class="input" type="number" step="0.01" value="${S.limit.toFixed(2)}" data-input="limit"></div></label><div class="quick"><button data-setpx="${x.bid.toFixed(2)}">Bid ${nf(x.bid)}</button><button data-setpx="${x.last.toFixed(2)}">Last ${nf(x.last)}</button><button data-setpx="${x.ask.toFixed(2)}">Ask ${nf(x.ask)}</button></div>`}
      <label class="field">Duration<div><select class="input" data-input="duration">${['Day', 'Good till cancelled', 'Good till date'].map(d => `<option ${S.duration === d ? 'selected' : ''}>${d}</option>`).join('')}</select></div></label>
      <dl class="est"><dt>Order value</dt><dd>${money(value, x.cur)}</dd><dt>Commission (estimate)</dt><dd>${money(commission, x.cur)}</dd><dt class="total">Total in DKK</dt><dd class="total">${money(dkk, 'DKK')}</dd><dt>Cash after order</dt><dd>${money(S.side === 'Buy' ? M.cash - dkk : M.cash + dkk, 'DKK')}</dd></dl>
      <button class="btn primary wide" data-step="review">Review ${S.side.toLowerCase()} order</button><p class="note">Saxo checks costs and margin before you confirm.</p>`;
    }
    const again = () => drawTicket(host, { compact });
    host.querySelectorAll('[data-side]').forEach(b => b.onclick = () => { S.side = b.dataset.side; S.limit = null; again(); });
    host.querySelectorAll('[data-type]').forEach(b => b.onclick = () => { S.type = b.dataset.type; again(); });
    host.querySelectorAll('[data-qty]').forEach(b => b.onclick = () => { S.qty = Math.max(1, S.qty + +b.dataset.qty); again(); });
    host.querySelectorAll('[data-setqty]').forEach(b => b.onclick = () => { S.qty = +b.dataset.setqty; again(); });
    host.querySelectorAll('[data-setpx]').forEach(b => b.onclick = () => { S.limit = +b.dataset.setpx; again(); });
    host.querySelectorAll('[data-step]').forEach(b => b.onclick = () => { S.ticketStep = b.dataset.step; again(); });
    host.querySelector('[data-input=qty]')?.addEventListener('change', e => { S.qty = Math.max(1, Math.round(+e.target.value || 1)); again(); });
    host.querySelector('[data-input=limit]')?.addEventListener('change', e => { S.limit = Math.max(0.01, +e.target.value || S.limit); again(); });
    host.querySelector('[data-input=duration]')?.addEventListener('change', e => { S.duration = e.target.value; });
  }

  /* ---------- Concept 2: portfolio canvas ---------- */
  function concept2() {
    const P = portfolio(), x = X(S.sym), h = holding(S.sym) || M.holdings[0];
    if (!holding(S.sym)) S.sym = h.sym;
    main.innerHTML = scene({
      controls: searchPill() + envSeg() + statusPill(),
      lead: `<span class="scene-label">Portfolio value · Saxo LIVE</span><span class="scene-figure"><span class="roll inherit" data-roll="lead"></span><span class="cur">DKK</span></span><span class="scene-tag ${chgClass(P.today)}">${signed(P.today)} DKK · ${pct(P.todayPct)} today</span>`,
      cards: `<div class="glass scene-card"><span class="scene-card-label">Today</span><strong class="${P.today >= 0 ? '' : ''} num">${signed(P.today)}<span class="cur">DKK</span></strong>${spark(P.curve, 166, 30, P.today >= 0, { area: false })}</div>
        <div class="glass scene-card"><span class="scene-card-label">Unrealised</span><strong class="num">${signed(P.unreal)}<span class="cur">DKK</span></strong><small>${pct(P.unrealPct)} on ${nf(P.cost, 0)} DKK cost</small></div>
        <div class="glass scene-card"><span class="scene-card-label">Available to trade</span><strong class="num">${nf(M.cash)}<span class="cur">DKK</span></strong><span class="g-meter"><i data-w="${(M.cash / P.total * 100).toFixed(1)}"></i></span><small>${nf(M.cash / P.total * 100, 1)}% of account value</small></div>`
    }) + `<div class="canvas">
      <section class="panel"><div class="panel-head"><h2>Holdings</h2><div class="toolbar"><div class="pills" role="group" aria-label="Colour by"><button aria-pressed="true">Today</button><button aria-pressed="false">Since purchase</button></div><span class="muted num">${M.holdings.length} positions · ${money(P.invested, 'DKK')}</span></div></div><div class="treemap" id="treemap"></div></section>
      <div class="canvas-side">
        <section class="panel"><div class="panel-head"><h2>Allocation</h2><div class="pills" role="group" aria-label="Group by">${['Asset class', 'Currency', 'Region'].map(a => `<button data-alloc="${a}" aria-pressed="${S.alloc === a}">${a}</button>`).join('')}</div></div><div id="alloc"></div></section>
        <section class="panel"><div class="panel-head"><h2>Working orders</h2><span class="chip">${M.orders.length}</span></div><div class="timeline">${M.orders.slice(0, 3).map(o => { const ox = X(o.sym), d = (o.price / ox.last - 1) * 100; return `<div class="tl-card"><div class="tl-top"><span class="inst"><span class="mono" data-tone="${ox.tone}">${mono(ox)}</span></span><strong>${o.side} ${o.filled ? o.filled + ' of ' + o.qty : o.qty} ${esc(ox.name)}</strong><span class="muted num">${money(o.price, ox.cur)}</span></div><div class="steps"><span class="done">Placed ${o.placed.slice(-5)}</span><span class="now">${o.state}</span><span>Filled</span></div><span class="dist">Limit is ${nf(Math.abs(d), 1)}% ${d < 0 ? 'below' : 'above'} the last price · ${o.duration}</span></div>`; }).join('')}</div></section>
      </div>
      <section class="panel canvas-full" id="focus"></section>
      <section class="panel canvas-full"><div class="panel-head"><h2>Watchlist</h2><div class="toolbar">${['All', 'Owned', 'Denmark', 'US'].map(g => `<button class="chip ${S.group === g ? 'accent' : ''}" data-group="${g}">${g}</button>`).join('')}</div></div><div class="carousel" id="wcards"></div></section>
    </div>`;
    roll(main.querySelector('[data-roll=lead]'), nf(P.total));
    paint(main); drawTreemap(); drawAlloc(); drawFocus(); drawWcards();
    main.querySelectorAll('[data-alloc]').forEach(b => b.onclick = () => { S.alloc = b.dataset.alloc; main.querySelectorAll('[data-alloc]').forEach(o => o.setAttribute('aria-pressed', o === b)); drawAlloc(); });
    main.querySelectorAll('[data-group]').forEach(b => b.onclick = () => { S.group = b.dataset.group; main.querySelectorAll('[data-group]').forEach(o => o.classList.toggle('accent', o === b)); drawWcards(); });
    const ro = new ResizeObserver(() => drawTreemap()); ro.observe(main.querySelector('#treemap')); cleanups.push(() => ro.disconnect());
  }

  function squarify(items, x, y, w, h) {
    const out = [], total = items.reduce((s, i) => s + i.v, 0); let rest = items.slice().sort((a, b) => b.v - a.v), scale = (w * h) / total;
    const worst = (row, len) => { const s = row.reduce((a, r) => a + r.v * scale, 0), mx = Math.max(...row.map(r => r.v * scale)), mn = Math.min(...row.map(r => r.v * scale)); return Math.max(len * len * mx / (s * s), (s * s) / (len * len * mn)); };
    while (rest.length) {
      const len = Math.min(w, h); let row = [rest[0]], i = 1;
      while (i < rest.length && worst([...row, rest[i]], len) <= worst(row, len)) row.push(rest[i++]);
      const s = row.reduce((a, r) => a + r.v * scale, 0), thick = s / len; let off = 0;
      row.forEach(r => { const size = r.v * scale / thick; out.push(w >= h ? { ...r, x, y: y + off, w: thick, h: size } : { ...r, x: x + off, y, w: size, h: thick }); off += size; });
      if (w >= h) { x += thick; w -= thick; } else { y += thick; h -= thick; }
      rest = rest.slice(row.length);
    }
    return out;
  }
  function drawTreemap() {
    const host = main.querySelector('#treemap'); if (!host) return; const P = portfolio(), W = host.clientWidth, H = host.clientHeight;
    const cells = squarify(P.rows.map(r => ({ v: r.value, r })), 0, 0, W, H);
    host.innerHTML = cells.map(c => { const x = c.r.x, small = c.w < 170 || c.h < 130, tone = Math.min(48, 12 + Math.abs(x.chg) * 11); return `<button class="tile ${small ? 'small' : ''} ${x.sym === S.sym ? 'selected' : ''}" data-sym="${x.sym}" data-box="${c.x},${c.y},${c.w},${c.h}" data-bg="color-mix(in srgb, var(${x.chg >= 0 ? '--up' : '--down'}) ${tone.toFixed(0)}%, var(--surface))" aria-pressed="${x.sym === S.sym}"><span class="tile-top"><span><strong>${esc(x.sym)}</strong><span class="tile-name">${esc(x.name)}</span></span>${feedBadge(x)}</span><span><span class="tile-chg" data-chg-text="${x.sym}">${pct(x.chg)}</span><br><span class="tile-val">${money(c.r.value, 'DKK', 0)} · ${nf(c.r.weight, 1)}%</span></span>${spark(x.spark, 200, 44, x.chg >= 0, { fluid: true })}</button>`; }).join('');
    host.querySelectorAll('[data-box]').forEach(el => { const [x, y, w, h] = el.dataset.box.split(',').map(Number); Object.assign(el.style, { left: x + 3 + 'px', top: y + 3 + 'px', width: w - 6 + 'px', height: h - 6 + 'px' }); });
    paint(host);
    host.querySelectorAll('[data-sym]').forEach(b => b.onclick = () => { S.sym = b.dataset.sym; host.querySelectorAll('.tile').forEach(t => { t.classList.toggle('selected', t === b); t.setAttribute('aria-pressed', t === b); }); drawFocus(); });
  }
  function drawAlloc() {
    const P = portfolio(), host = main.querySelector('#alloc');
    const groups = {};
    const add = (k, v) => groups[k] = (groups[k] || 0) + v;
    P.rows.forEach(r => add(S.alloc === 'Asset class' ? (r.x.kind === 'ETF' ? 'ETFs' : 'Stocks') : S.alloc === 'Currency' ? r.x.cur : (['Germany', 'Netherlands'].includes(r.x.region) ? 'Europe' : r.x.region), r.value));
    add(S.alloc === 'Asset class' ? 'Cash' : S.alloc === 'Currency' ? 'DKK' : 'Cash', M.cash);
    const entries = Object.entries(groups).sort((a, b) => b[1] - a[1]), total = P.total, R = 60, C = 2 * Math.PI * R; let off = 0;
    host.innerHTML = `<div class="donut-wrap"><div class="donut"><svg viewBox="0 0 150 150" width="100%" height="100%" aria-hidden="true"><circle cx="75" cy="75" r="${R}" fill="none" stroke="color-mix(in srgb,var(--ink) 8%,transparent)" stroke-width="16"/>${entries.map(([k, v], i) => { const len = v / total * C - 3, s = `<circle cx="75" cy="75" r="${R}" fill="none" stroke="${tones[i]}" stroke-width="16" stroke-linecap="round" stroke-dasharray="${Math.max(len, 1)} ${C}" stroke-dashoffset="${-off}"/>`; off += v / total * C; return s; }).join('')}</svg><div class="donut-center"><strong class="num">${nf(total / 1000, 0)}k</strong><small>DKK</small></div></div><div class="legend-list">${entries.map(([k, v], i) => `<div><i data-bg="${tones[i]}"></i><span>${k}</span><strong class="num">${nf(v / total * 100, 1)}%</strong></div>`).join('')}</div></div><p class="note">Cash and invested amounts reconcile with the account value, so the split is shown.</p>`;
    paint(host);
  }
  function drawFocus() {
    charts.forEach(c => c.remove()); charts = [];
    const host = main.querySelector('#focus'), x = X(S.sym), h = holding(S.sym), f = M.fx[x.cur], c = chartColors();
    const value = h.qty * x.last, unreal = h.qty * (x.last - h.avg);
    host.innerHTML = `<div class="panel-head"><div class="inst-head"><span class="mono" data-tone="${x.tone}">${mono(x)}</span><h2>${esc(x.name)}</h2><span class="chip">${esc(x.exch)} · ${x.cur}</span>${feedBadge(x)}<span class="px num" data-px="${x.sym}">${nf(x.last)}</span><span class="chg ${chgClass(x.chg)}" data-chg="${x.sym}">${pct(x.chg)}</span></div>${rangePills(S.range === '1D' ? '1Y' : S.range)}</div>
      <div class="focus"><div><div class="chart-box short" id="c2-chart"></div><span class="attrib">Charting by TradingView · dashed line is your average cost</span></div>
      <div class="facts"><div class="stat"><span>Quantity</span><strong>${h.qty}</strong></div><div class="stat"><span>Average cost</span><strong>${money(h.avg, x.cur)}</strong></div><div class="stat"><span>Market value</span><strong>${money(value, x.cur)}</strong><small class="muted">${money(value * f, 'DKK')}</small></div><div class="stat"><span>Unrealised</span><strong class="${unreal >= 0 ? 'pos' : 'neg'}">${signed(unreal)}<span class="cur">${x.cur}</span></strong><small class="muted">${pct((x.last / h.avg - 1) * 100)}</small></div><div class="stat"><span>Today</span><strong class="${x.chg >= 0 ? 'pos' : 'neg'}">${signed(h.qty * (x.last - x.prev))}<span class="cur">${x.cur}</span></strong></div><div class="stat"><span>Weight</span><strong>${nf(portfolio().rows.find(r => r.h === h).weight, 1)}%</strong></div>
      <div class="actions"><button class="btn buy" data-drawer="Buy">Buy more</button><button class="btn sell" data-drawer="Sell">Sell</button><button class="btn ghost">Price alert</button></div></div></div>`;
    paint(host);
    const ch = makeChart(host.querySelector('#c2-chart')), r = S.range === '1D' ? '1Y' : S.range, bars = rangeBars(x, r);
    const s = ch.addSeries(LC.AreaSeries, { lineColor: c.accent, topColor: c.accent + '50', bottomColor: c.accent + '00', lineWidth: 2 });
    s.setData(bars.map(b => ({ time: b.time, value: b.close })));
    s.createPriceLine({ price: h.avg, color: c.warn, lineStyle: 2, lineWidth: 1, title: 'Avg cost' });
    if (h.fills && LC.createSeriesMarkers) LC.createSeriesMarkers(s, h.fills.filter(f => f.time >= bars[0].time).map(f => ({ time: f.time, position: 'belowBar', color: c.accent, shape: 'circle', text: 'Buy ' + f.qty })));
    ch.timeScale().fitContent();
    host.querySelectorAll('[data-range]').forEach(b => b.onclick = () => { S.range = b.dataset.range; drawFocus(); });
    host.querySelectorAll('[data-drawer]').forEach(b => b.onclick = () => { S.side = b.dataset.drawer; S.limit = null; S.ticketStep = 'form'; openDrawer(); });
  }
  function drawWcards() {
    const host = main.querySelector('#wcards');
    host.innerHTML = filtered().map(x => `<button class="wcard" data-sym="${x.sym}"><span class="wcard-top"><span class="mono" data-tone="${x.tone}">${mono(x)}</span><span><strong>${esc(x.name)}</strong><small>${esc(x.sym)} · ${esc(x.exch)} ${holding(x.sym) ? '· Owned' : ''}</small></span></span>${spark(x.spark, 200, 46, x.chg >= 0, { base: x.prev, fluid: true })}<span class="wcard-px"><span><span class="px" data-px="${x.sym}">${nf(x.last)}</span><span class="cur">${x.cur}</span></span><span class="chg ${chgClass(x.chg)}" data-chg="${x.sym}">${pct(x.chg)}</span></span></button>`).join('') + `<button class="wcard add" data-open-palette><span aria-hidden="true">+</span>Add instrument</button>`;
    paint(host);
    host.querySelectorAll('.wcard[data-sym]').forEach(b => b.onclick = () => { S.sym = b.dataset.sym; S.side = 'Buy'; S.limit = null; S.ticketStep = 'form'; openDrawer(); });
    bindPalette(host);
  }
  function openDrawer() {
    const x = X(S.sym);
    overlay.innerHTML = `<div class="drawer-backdrop"><aside class="drawer" role="dialog" aria-modal="true" aria-label="Trade ${esc(x.name)}"><div class="panel-head"><div class="inst-head"><span class="mono lg" data-tone="${x.tone}">${mono(x)}</span><h2>${esc(x.name)}</h2></div><button class="icon-btn" data-close aria-label="Close">×</button></div><div class="toolbar"><span class="px num" data-px="${x.sym}">${nf(x.last)}</span><span class="cur">${x.cur}</span><span class="chg ${chgClass(x.chg)}" data-chg="${x.sym}">${pct(x.chg)}</span>${feedBadge(x)}<span class="sp"></span><span class="muted">Bid ${nf(x.bid)} · Ask ${nf(x.ask)}</span></div><div class="big-qty"><button class="step" data-bq="-1" aria-label="Fewer shares">−</button><strong class="num" data-bigqty>${S.qty}</strong><button class="step" data-bq="1" aria-label="More shares">+</button></div><p class="center muted">shares</p><div id="drawer-ticket"></div></aside></div>`;
    paint(overlay);
    const t = overlay.querySelector('#drawer-ticket'); drawTicket(t, { compact: true });
    overlay.querySelectorAll('[data-bq]').forEach(b => b.onclick = () => { S.qty = Math.max(1, S.qty + +b.dataset.bq); overlay.querySelector('[data-bigqty]').textContent = S.qty; drawTicket(t, { compact: true }); });
    const close = () => { overlay.innerHTML = ''; };
    overlay.querySelector('[data-close]').onclick = close; overlay.querySelector('.drawer-backdrop').onclick = e => { if (e.target === e.currentTarget) close(); };
    overlay.querySelector('[data-close]').focus();
  }

  /* ---------- Concept 3: focus flow ---------- */
  function concept3() {
    const x = X(S.sym), h = holding(S.sym);
    main.innerHTML = scene({
      controls: envSeg() + statusPill(),
      lead: `<button class="glass search-hero" data-open-palette><span aria-hidden="true">⌕</span><span>Search stocks, ETFs and your holdings</span><kbd>/</kbd></button>`,
      cards: M.sessions.map(s => `<div class="glass scene-card"><span class="scene-card-label"><span class="ring" data-p="${s.progress}" aria-hidden="true"></span>${s.city}</span><strong>${s.state}</strong><small>${s.detail}</small></div>`).join('')
    }) + `<div class="flow">
      <section class="panel flow-rail"><div class="panel-head"><h2>Watchlist</h2><button class="icon-btn" aria-label="Add instrument" data-open-palette>+</button></div><div class="list-filters">${['All', 'Owned', 'Denmark', 'US'].map(g => `<button class="chip ${S.group === g ? 'accent' : ''}" data-group="${g}">${g}</button>`).join('')}</div><div class="rows" id="wl"></div></section>
      <div class="flow-main">
        <section class="panel" id="stage"></section>
        <div class="flow-lower"><section class="panel" id="c3-ticket"></section><section class="panel" id="kf"></section></div>
      </div>
    </div><div class="phone-actions"><button class="btn buy" data-jump-trade="Buy">Buy ${esc(x.sym)}</button><button class="btn sell" data-jump-trade="Sell">Sell</button></div>`;
    paint(main); drawWl(); drawStage(); drawC3Ticket(); drawKf();
    main.querySelectorAll('[data-group]').forEach(b => b.onclick = () => { S.group = b.dataset.group; main.querySelectorAll('[data-group]').forEach(o => o.classList.toggle('accent', o === b)); drawWl(); });
    main.querySelectorAll('[data-jump-trade]').forEach(b => b.onclick = () => { S.side = b.dataset.jumpTrade; S.limit = null; drawC3Ticket(); main.querySelector('#c3-ticket').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' }); });
  }
  function drawWl() {
    const host = main.querySelector('#wl');
    host.innerHTML = filtered().map(x => `<button class="wl-card ${x.sym === S.sym ? 'selected' : ''}" data-sym="${x.sym}" aria-pressed="${x.sym === S.sym}"><span class="mono" data-tone="${x.tone}">${mono(x)}</span><span class="row-name"><strong>${esc(x.name)}</strong><small>${esc(x.sym)} ${holding(x.sym) ? '· Owned' : ''} ${feedBadge(x)}</small></span><span class="row-px"><span class="px" data-px="${x.sym}">${nf(x.last)}</span><span class="chg ${chgClass(x.chg)}" data-chg="${x.sym}">${pct(x.chg)}</span></span>${spark(x.spark, 240, 30, x.chg >= 0, { base: x.prev, fluid: true })}</button>`).join('');
    paint(host);
    host.querySelectorAll('[data-sym]').forEach(b => b.onclick = () => { S.sym = b.dataset.sym; S.limit = null; S.ticketStep = 'form'; if (S.compare === S.sym) S.compare = S.sym === 'NOVO B' ? 'MSFT' : 'NOVO B'; host.querySelectorAll('.wl-card').forEach(o => { o.classList.toggle('selected', o === b); o.setAttribute('aria-pressed', o === b); }); drawStage(); drawC3Ticket(); drawKf(); });
  }
  function drawStage() {
    charts.forEach(c => c.remove()); charts = [];
    const host = main.querySelector('#stage'), x = X(S.sym), h = holding(S.sym), cmp = S.compare ? X(S.compare) : null, c = chartColors();
    const r = S.range === '1D' ? '6M' : S.range, bars = rangeBars(x, r), cBars = cmp ? rangeBars(cmp, r) : null;
    const perf = b => (b[b.length - 1].close / b[0].close - 1) * 100;
    host.innerHTML = `<div class="stage-top"><div class="stage-id"><span class="mono lg" data-tone="${x.tone}">${mono(x)}</span><div><h2>${esc(x.name)}</h2><div class="stage-meta"><span class="chip">${esc(x.sym)} · ${esc(x.exch)}</span><span class="chip">${x.cur} · ${x.kind}</span>${x.feed === 'delayed' ? '<span class="feed">Delayed 15 min</span>' : '<span class="chip accent">Real-time</span>'}</div></div></div>
      <div class="stage-price"><span class="roll" data-roll="stage"></span><span class="cur">${x.cur}</span><span class="chg ${chgClass(x.chg)}" data-chg="${x.sym}">${pct(x.chg)}</span></div></div>
      ${h ? `<div class="ribbon"><span>You own <strong>${h.qty}</strong></span><span>Value <strong>${money(h.qty * x.last, x.cur)}</strong></span><span>Unrealised <strong class="${x.last >= h.avg ? 'pos' : 'neg'}">${signed(h.qty * (x.last - h.avg))} · ${pct((x.last / h.avg - 1) * 100)}</strong></span><span>Average cost <strong>${money(h.avg, x.cur)}</strong></span></div>` : ''}
      <div class="toolbar">${rangePills(r)}<span class="sp"></span><div class="compare-legend"><span class="chip"><span class="swatch" data-bg="${c.accent}"></span>${esc(x.sym)} ${pct(perf(bars))}</span>${cmp ? `<span class="chip"><span class="swatch" data-bg="${c.ai}"></span>${esc(cmp.sym)} ${pct(perf(cBars))}<button class="icon-btn" data-uncompare aria-label="Remove comparison">×</button></span>` : ''}<button class="chip accent" data-open-palette>+ Compare</button></div></div>
      <div class="chart-box" id="c3-chart"></div><span class="attrib">Charting by TradingView · compared as % change from the start of the period</span>`;
    paint(host); roll(host.querySelector('[data-roll=stage]'), nf(x.last));
    const ch = makeChart(host.querySelector('#c3-chart'), { rightPriceScale: { borderVisible: false, mode: cmp ? 2 : 0 } });
    const s = ch.addSeries(LC.AreaSeries, { lineColor: c.accent, topColor: c.accent + '55', bottomColor: c.accent + '00', lineWidth: 2.5 });
    s.setData(bars.map(b => ({ time: b.time, value: b.close })));
    if (cmp) ch.addSeries(LC.LineSeries, { color: c.ai, lineWidth: 2, lastValueVisible: true, priceLineVisible: false }).setData(cBars.map(b => ({ time: b.time, value: b.close })));
    if (!cmp && h) s.createPriceLine({ price: h.avg, color: c.warn, lineStyle: 2, lineWidth: 1, title: 'Avg cost' });
    if (h?.fills && LC.createSeriesMarkers) LC.createSeriesMarkers(s, h.fills.filter(f => f.time >= bars[0].time).map(f => ({ time: f.time, position: 'belowBar', color: c.accent, shape: 'circle', text: 'Bought ' + f.qty })));
    ch.timeScale().fitContent();
    host.querySelectorAll('[data-range]').forEach(b => b.onclick = () => { S.range = b.dataset.range; drawStage(); });
    host.querySelector('[data-uncompare]')?.addEventListener('click', () => { S.compare = null; drawStage(); });
    bindPalette(host);
  }
  function drawC3Ticket() {
    const host = main.querySelector('#c3-ticket'), x = X(S.sym), h = holding(S.sym);
    if (S.limit == null) S.limit = +(S.side === 'Buy' ? x.bid : x.ask).toFixed(2);
    const lo = x.low * 0.985, hi = x.high * 1.015, pos = v => ((v - lo) / (hi - lo) * 100).toFixed(1), diff = (S.limit / (S.side === 'Buy' ? x.ask : x.bid) - 1) * 100;
    const value = S.qty * S.limit, dkk = value * M.fx[x.cur];
    host.innerHTML = `<div class="panel-head"><h2>Trade</h2><span class="chip">${h ? 'You own ' + h.qty : 'Not owned'}</span></div>
      <div class="side-seg" role="group" aria-label="Side"><button data-side="Buy" aria-pressed="${S.side === 'Buy'}">Buy</button><button data-side="Sell" aria-pressed="${S.side === 'Sell'}" ${h ? '' : 'disabled'}>Sell</button></div>
      <div class="field">Limit price · drag or type<div class="ladder"><div class="ladder-track"></div><span class="ladder-mark bid" data-l="${pos(x.bid)}"><i></i><span>Bid</span></span><span class="ladder-mark ask" data-l="${pos(x.ask)}"><i></i><span>Ask</span></span><span class="ladder-handle" data-l="${pos(S.limit)}"><span>${nf(S.limit)} · ${pct(diff)}</span><i></i></span><input type="range" aria-label="Limit price" min="${lo.toFixed(2)}" max="${hi.toFixed(2)}" step="${x.tick}" value="${S.limit}"></div></div>
      <div class="ladder-ends"><span>Day low ${nf(x.low)}</span><span>Day high ${nf(x.high)}</span></div>
      <label class="field">Quantity<div><button class="step" data-qty="-1" aria-label="Decrease">−</button><input class="input" type="number" min="1" value="${S.qty}" data-input="qty"><button class="step" data-qty="1" aria-label="Increase">+</button><select class="input" aria-label="Duration" data-input="duration">${['Day', 'Good till cancelled'].map(d => `<option ${S.duration === d ? 'selected' : ''}>${d}</option>`).join('')}</select></div></label>
      <dl class="est"><dt>${S.qty} × ${nf(S.limit)} ${x.cur}</dt><dd>${money(value, x.cur)}</dd><dt class="total">About</dt><dd class="total">${money(dkk, 'DKK')}</dd></dl>
      <button class="btn primary wide">Review ${S.side.toLowerCase()} · ${S.qty} ${esc(x.sym)}</button><p class="note">Saxo pre-checks costs before you confirm. Accepted orders work until filled.</p>`;
    paint(host);
    host.querySelectorAll('[data-side]').forEach(b => b.onclick = () => { S.side = b.dataset.side; S.limit = null; drawC3Ticket(); });
    host.querySelectorAll('[data-qty]').forEach(b => b.onclick = () => { S.qty = Math.max(1, S.qty + +b.dataset.qty); drawC3Ticket(); });
    host.querySelector('[data-input=qty]').onchange = e => { S.qty = Math.max(1, Math.round(+e.target.value || 1)); drawC3Ticket(); };
    const range = host.querySelector('input[type=range]'), handle = host.querySelector('.ladder-handle');
    range.oninput = () => { S.limit = +(+range.value).toFixed(2); handle.style.left = pos(S.limit) + '%'; handle.querySelector('span').textContent = `${nf(S.limit)} · ${pct((S.limit / (S.side === 'Buy' ? x.ask : x.bid) - 1) * 100)}`; };
    range.onchange = () => drawC3Ticket();
  }
  function drawKf() {
    const host = main.querySelector('#kf'), x = X(S.sym), day = ((x.last - x.low) / (x.high - x.low) * 100).toFixed(1), w = ((x.last - x.w52.low) / (x.w52.high - x.w52.low) * 100).toFixed(1);
    host.innerHTML = `<div class="panel-head"><h2>Key figures</h2><span class="muted num">${M.clock.label}</span></div><div class="kf"><div class="stat"><span>Open</span><strong>${money(x.open, x.cur)}</strong></div><div class="stat"><span>Previous close</span><strong>${money(x.prev, x.cur)}</strong></div><div class="stat"><span>Day range</span><strong>${nf(x.low)} – ${nf(x.high)}</strong><span class="rbar"><b data-l="${day}"></b></span></div><div class="stat"><span>52-week range</span><strong>${nf(x.w52.low, 0)} – ${nf(x.w52.high, 0)}</strong><span class="rbar"><b data-l="${w}"></b></span></div><div class="stat"><span>Volume</span><strong>${nf(x.volume / 1e6, 1)} M</strong></div><div class="stat"><span>1 year</span><strong class="${x.y1 >= 0 ? 'pos' : 'neg'}">${pct(x.y1)}</strong></div></div>
      <div class="advisor-line"><span class="chip ai">Advisor</span><span><b>Ask about ${esc(x.name)}</b>How would buying ${S.qty} more change my technology share and cash buffer?</span></div>`;
    paint(host);
  }

  /* ---------- Command palette search ---------- */
  function bindPalette(root) { root.querySelectorAll('[data-open-palette]').forEach(b => b.onclick = () => openPalette()); }
  function openPalette(q = '') {
    overlay.innerHTML = `<div class="palette-backdrop"><div class="palette" role="dialog" aria-modal="true" aria-label="Search instruments"><div class="palette-input"><span aria-hidden="true">⌕</span><input id="pal-q" placeholder="Search by name, symbol or ISIN" autocomplete="off" value="${esc(q)}" role="combobox" aria-expanded="true" aria-controls="pal-body"><kbd>Esc</kbd></div><div class="palette-body" id="pal-body" role="listbox"></div><div class="palette-foot"><span><kbd>↑</kbd> <kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>B</kbd> buy</span><span><kbd>W</kbd> watch</span><span class="sp"></span><span>Saxo instrument search · prices stream as you type</span></div></div></div>`;
    const input = overlay.querySelector('#pal-q'), body = overlay.querySelector('#pal-body'); let active = 0, items = [];
    const draw = () => {
      const t = input.value.trim().toLowerCase();
      const pool = [...M.instruments, ...M.searchIndex.filter(s => !M.by[s.sym])];
      items = t ? pool.filter(x => x.name.toLowerCase().includes(t) || x.sym.toLowerCase().includes(t)) : M.instruments.slice(0, 5);
      const hl = s => { if (!t) return esc(s); const i = s.toLowerCase().indexOf(t); return i < 0 ? esc(s) : esc(s.slice(0, i)) + '<mark>' + esc(s.slice(i, i + t.length)) + '</mark>' + esc(s.slice(i + t.length)); };
      const top = items[0];
      body.innerHTML = `<div class="palette-group">${t ? 'Instruments' : 'Recent'}</div>${items.map((x, i) => { const live = M.by[x.sym]; const last = live ? live.last : x.last, chg = live ? live.chg : x.chg; return `<button class="pal-row ${i === active ? 'active' : ''}" role="option" aria-selected="${i === active}" data-i="${i}"><span class="mono" data-tone="${live?.tone || '#8fb7d9'}">${esc(x.sym.replace(/\s.*/, '').slice(0, 4))}</span><span class="row-name"><strong>${hl(x.name)}</strong><small>${hl(x.sym)} · ${esc(x.exch)} · ${x.kind} ${live && holding(x.sym) ? '· Owned' : live ? '· Watching' : ''}</small></span>${live ? spark(live.spark, 80, 26, chg >= 0, { base: live.prev }) : '<span></span>'}<span class="row-px"><span class="px">${money(last, x.cur)}</span><span class="chg ${chgClass(chg)}">${pct(chg)}</span></span></button>`; }).join('') || '<p class="muted">No instruments match. Try a symbol or ISIN.</p>'}
        ${top ? `<div class="palette-group">Actions for ${esc(top.name)}</div><button class="pal-action" data-act="open">Open chart<span class="k">Enter</span></button><button class="pal-action" data-act="buy">Buy ${esc(top.name)}<span class="k">B</span></button><button class="pal-action" data-act="watch">${M.by[top.sym] ? 'In watchlist' : 'Add to watchlist'}<span class="k">W</span></button><button class="pal-action" data-act="compare">Compare with ${esc(X(S.sym).name)}<span class="k">C</span></button>` : ''}`;
      paint(body);
      body.querySelectorAll('[data-i]').forEach(b => b.onclick = () => choose(items[+b.dataset.i]));
      body.querySelectorAll('[data-act]').forEach(b => b.onclick = () => act(b.dataset.act, items[active]));
    };
    const close = () => { overlay.innerHTML = ''; };
    const choose = x => { if (!x) return; if (M.by[x.sym]) { S.sym = x.sym; S.limit = null; S.ticketStep = 'form'; } close(); render(); };
    const act = (a, x) => { if (!x || !M.by[x.sym]) { close(); return; } if (a === 'compare') { S.compare = x.sym; close(); if (S.concept === 3) drawStage(); return; } if (a === 'buy') { S.sym = x.sym; S.side = 'Buy'; S.limit = null; S.ticketStep = 'form'; close(); render(); if (S.concept === 2) openDrawer(); return; } choose(x); };
    input.oninput = () => { active = 0; draw(); };
    input.onkeydown = e => { if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(items.length - 1, active + 1); draw(); } else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); draw(); } else if (e.key === 'Enter') choose(items[active]); else if (e.key === 'Escape') close(); };
    overlay.querySelector('.palette-backdrop').onclick = e => { if (e.target === e.currentTarget) close(); };
    draw(); input.focus();
  }
  document.addEventListener('keydown', e => { if (e.key === '/' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); openPalette(); } if (e.key === 'Escape' && overlay.firstChild) overlay.innerHTML = ''; });

  /* ---------- Simulated ticks (sample data only) ---------- */
  function tick() {
    const r = Math.random, picks = M.instruments.filter(() => r() < 0.35);
    picks.forEach(x => {
      const move = (r() < 0.5 ? -1 : 1) * x.tick * Math.ceil(r() * 3), old = x.last; x.last = Math.max(x.tick, +(x.last + move).toFixed(2));
      x.chg = (x.last / x.prev - 1) * 100; x.bid = x.last - x.tick; x.ask = x.last + x.tick; x.high = Math.max(x.high, x.last); x.low = Math.min(x.low, x.last);
      x.spark = [...x.spark.slice(0, -1), x.last];
      const dir = x.last >= old ? 'flash-up' : 'flash-down';
      document.querySelectorAll(`[data-px="${CSS.escape(x.sym)}"]`).forEach(el => { el.textContent = nf(x.last); el.classList.remove('flash-up', 'flash-down'); void el.offsetWidth; if (!reduced) el.classList.add(dir); setTimeout(() => el.classList.remove(dir), 450); });
      document.querySelectorAll(`[data-chg="${CSS.escape(x.sym)}"]`).forEach(el => { el.textContent = pct(x.chg); el.className = 'chg ' + chgClass(x.chg); });
      document.querySelectorAll(`[data-chg-text="${CSS.escape(x.sym)}"]`).forEach(el => el.textContent = pct(x.chg));
      document.querySelectorAll(`[data-bid="${CSS.escape(x.sym)}"]`).forEach(el => el.textContent = nf(x.bid));
      document.querySelectorAll(`[data-ask="${CSS.escape(x.sym)}"]`).forEach(el => el.textContent = nf(x.ask));
      if (x.sym === S.sym) {
        roll(main.querySelector('[data-roll=lead]'), nf(x.last)); roll(main.querySelector('[data-roll=stage]'), nf(x.last));
        const tag = main.querySelector(`[data-tag="${CSS.escape(x.sym)}"]`); if (tag) { tag.textContent = `${signed(x.last - x.prev)} · ${pct(x.chg)} today`; tag.className = 'scene-tag ' + chgClass(x.chg); }
        if (S.liveSeries) { const b = S.liveSeries.bar; b.close = x.last; b.high = Math.max(b.high, x.last); b.low = Math.min(b.low, x.last); try { S.liveSeries.series.update({ ...b }); } catch { } }
      }
    });
    if (S.concept === 2) { const P = portfolio(); roll(main.querySelector('[data-roll=lead]'), nf(P.total)); }
    const clk = document.querySelectorAll('[data-clock]'); const [hh, mm, ss] = M.clock.label.split(':').map(Number); const t = hh * 3600 + mm * 60 + ss + 1; M.clock.label = [Math.floor(t / 3600), Math.floor(t / 60) % 60, t % 60].map(n => String(n).padStart(2, '0')).join(':'); clk.forEach(el => el.textContent = M.clock.label);
  }
  function setTicks() { clearInterval(tickTimer); if (S.ticks) tickTimer = setInterval(tick, 1000); }

  /* ---------- Lab ---------- */
  function render() {
    cleanups.forEach(f => f()); cleanups = []; charts.forEach(c => c.remove()); charts = []; S.liveSeries = null;
    document.documentElement.dataset.theme = S.theme;
    document.querySelectorAll('[data-concept]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.concept === S.concept)));
    ({ 1: concept1, 2: concept2, 3: concept3 })[S.concept]();
    paint(main); bindPalette(main);
    main.querySelectorAll('[data-trade]').forEach(b => b.onclick = () => { S.side = b.dataset.trade; S.limit = null; S.ticketStep = 'form'; drawTicket(main.querySelector('#ticket')); main.querySelector('#ticket').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' }); });
  }
  document.querySelectorAll('[data-concept]').forEach(b => b.onclick = () => { S.concept = +b.dataset.concept; S.ticketStep = 'form'; S.limit = null; overlay.innerHTML = ''; render(); window.scrollTo(0, 0); });
  const themeSel = document.getElementById('lab-theme'); themeSel.value = S.theme; themeSel.onchange = () => { S.theme = themeSel.value; render(); };
  const tickBox = document.getElementById('lab-ticks'); tickBox.checked = S.ticks; tickBox.onchange = () => { S.ticks = tickBox.checked; setTicks(); };
  if (hash.get('step')) S.ticketStep = hash.get('step');
  render(); setTicks();
  if (S.open === 'palette') openPalette(S.q);
  if (S.open === 'ticket') openDrawer();
  window.__concepts = { S, render, openPalette, openDrawer };
})();
