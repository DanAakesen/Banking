// Illustrative sample data for the Markets concepts. Every price, position and order here is invented for
// layout review. Nothing is read from Saxo or Yahoo, and nothing should be mistaken for a market observation.
(function () {
  const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const gauss = r => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

  // Sample clock: Monday 28 September 2026, 16:12 Copenhagen time.
  const clock = { label: '16:12:08', date: '2026-09-28' };

  const tradingDays = n => {
    const out = [], d = new Date(Date.UTC(2026, 8, 28));
    while (out.length < n) { const w = d.getUTCDay(); if (w && w < 6) out.unshift(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() - 1); }
    return out;
  };

  function dailyBars(last, n, vol, seed, drift) {
    const r = rng(seed), days = tradingDays(n); let c = 100; const raw = [];
    for (let i = 0; i < n; i++) {
      const ret = drift + vol * gauss(r), o = c * (1 + vol * 0.25 * gauss(r)); c = c * (1 + ret);
      const hi = Math.max(o, c) * (1 + Math.abs(gauss(r)) * vol * 0.55), lo = Math.min(o, c) * (1 - Math.abs(gauss(r)) * vol * 0.55);
      raw.push({ time: days[i], open: o, high: hi, low: lo, close: c, volume: (0.6 + r() * 0.8 + Math.abs(ret) * 18) * 1e6 });
    }
    const k = last / raw[raw.length - 1].close;
    return raw.map(b => ({ time: b.time, open: b.open * k, high: b.high * k, low: b.low * k, close: b.close * k, volume: b.volume }));
  }

  function intraday(prev, last, n, vol, seed) {
    const r = rng(seed); const pts = [prev]; let p = prev;
    for (let i = 1; i < n; i++) { const pull = (last - p) / (n - i + 2); p = p + pull + p * vol * 0.12 * gauss(r); pts.push(p); }
    pts[n - 1] = last; return pts;
  }

  const I = [
    { sym: 'MSFT', name: 'Microsoft Corp.', exch: 'NASDAQ', cur: 'USD', kind: 'Stock', last: 516.17, chg: 1.24, vol: 0.013, seed: 11, drift: 0.0011, tick: 0.01, feed: 'live', region: 'US', sector: 'Technology' },
    { sym: 'NOVO B', name: 'Novo Nordisk B', exch: 'Copenhagen', cur: 'DKK', kind: 'Stock', last: 412.30, chg: -2.18, vol: 0.019, seed: 23, drift: -0.0009, tick: 0.05, feed: 'live', region: 'Denmark', sector: 'Health care' },
    { sym: 'GMAB', name: 'Genmab', exch: 'Copenhagen', cur: 'DKK', kind: 'Stock', last: 2285.00, chg: 0.64, vol: 0.017, seed: 31, drift: 0.0004, tick: 1, feed: 'live', region: 'Denmark', sector: 'Health care' },
    { sym: 'VWS', name: 'Vestas Wind Systems', exch: 'Copenhagen', cur: 'DKK', kind: 'Stock', last: 200.50, chg: 3.12, vol: 0.022, seed: 47, drift: 0.0012, tick: 0.05, feed: 'live', region: 'Denmark', sector: 'Industrials' },
    { sym: 'SIE', name: 'Siemens AG', exch: 'XETRA', cur: 'EUR', kind: 'Stock', last: 279.75, chg: 0.41, vol: 0.012, seed: 53, drift: 0.0007, tick: 0.05, feed: 'delayed', region: 'Germany', sector: 'Industrials' },
    { sym: 'NVDA', name: 'NVIDIA Corp.', exch: 'NASDAQ', cur: 'USD', kind: 'Stock', last: 181.40, chg: -0.87, vol: 0.024, seed: 67, drift: 0.0015, tick: 0.01, feed: 'live', region: 'US', sector: 'Technology' },
    { sym: 'ASML', name: 'ASML Holding', exch: 'Amsterdam', cur: 'EUR', kind: 'Stock', last: 842.60, chg: 1.95, vol: 0.018, seed: 71, drift: 0.0006, tick: 0.1, feed: 'delayed', region: 'Netherlands', sector: 'Technology' },
    { sym: 'DSV', name: 'DSV A/S', exch: 'Copenhagen', cur: 'DKK', kind: 'Stock', last: 1602.00, chg: -0.33, vol: 0.014, seed: 83, drift: 0.0003, tick: 0.5, feed: 'live', region: 'Denmark', sector: 'Industrials' },
    { sym: 'IWDA', name: 'iShares Core MSCI World', exch: 'Amsterdam', cur: 'EUR', kind: 'ETF', last: 108.42, chg: 0.52, vol: 0.008, seed: 97, drift: 0.0005, tick: 0.01, feed: 'delayed', region: 'Global', sector: 'Global equity' },
    { sym: 'MAERSK B', name: 'A.P. Møller-Mærsk B', exch: 'Copenhagen', cur: 'DKK', kind: 'Stock', last: 12450, chg: -1.10, vol: 0.02, seed: 101, drift: 0.0002, tick: 5, feed: 'live', region: 'Denmark', sector: 'Industrials' },
  ];
  const fx = { DKK: 1, USD: 6.3842, EUR: 7.4608 };

  I.forEach(x => {
    x.prev = x.last / (1 + x.chg / 100);
    x.bars = dailyBars(x.last, 260, x.vol, x.seed, x.drift);
    x.bars[x.bars.length - 1].close = x.last;
    x.spark = intraday(x.prev, x.last, 64, x.vol, x.seed + 5);
    x.high = Math.max(...x.spark) * 1.001; x.low = Math.min(...x.spark) * 0.999;
    x.open = x.spark[1];
    const spread = x.tick * (x.feed === 'live' ? 2 : 4);
    x.bid = x.last - spread / 2; x.ask = x.last + spread / 2;
    const closes = x.bars.map(b => b.close);
    x.w52 = { low: Math.min(...x.bars.map(b => b.low)), high: Math.max(...x.bars.map(b => b.high)) };
    x.y1 = (x.last / closes[closes.length - 252] - 1) * 100;
    x.volume = x.bars[x.bars.length - 1].volume; x.avgVolume = x.bars.slice(-30).reduce((s, b) => s + b.volume, 0) / 30;
  });
  const by = Object.fromEntries(I.map(x => [x.sym, x]));

  // Sample fills for Microsoft sit on the generated series so chart markers and average cost agree.
  const msftBars = by.MSFT.bars, fillAt = [180, 122, 64];
  const msftFills = [{ i: msftBars.length - fillAt[0], qty: 5 }, { i: msftBars.length - fillAt[1], qty: 4 }, { i: msftBars.length - fillAt[2], qty: 3 }]
    .map(f => ({ time: msftBars[f.i].time, qty: f.qty, price: +msftBars[f.i].close.toFixed(2) }));
  const msftAvg = msftFills.reduce((s, f) => s + f.qty * f.price, 0) / msftFills.reduce((s, f) => s + f.qty, 0);

  const holdings = [
    { sym: 'MSFT', qty: 12, avg: msftAvg, fills: msftFills },
    { sym: 'NOVO B', qty: 40, avg: 455.00 },
    { sym: 'IWDA', qty: 150, avg: 92.10 },
    { sym: 'VWS', qty: 60, avg: 168.30 },
    { sym: 'ASML', qty: 5, avg: 690.00 },
    { sym: 'DSV', qty: 8, avg: 1480.00 },
  ];
  const cash = 84250.40;

  const orders = [
    { id: '5021 8841', sym: 'MSFT', side: 'Buy', qty: 3, filled: 0, type: 'Limit', price: 505.00, duration: 'Good till cancelled', state: 'Working', placed: '28 Sept 09:31' },
    { id: '5021 9310', sym: 'NVDA', side: 'Buy', qty: 5, filled: 0, type: 'Limit', price: 172.00, duration: 'Day', state: 'Working', placed: '28 Sept 15:36' },
    { id: '5021 7702', sym: 'VWS', side: 'Sell', qty: 20, filled: 0, type: 'Limit', price: 215.00, duration: 'Good till cancelled', state: 'Working', placed: '25 Sept 09:12' },
    { id: '5021 9022', sym: 'GMAB', side: 'Buy', qty: 3, filled: 1, type: 'Limit', price: 2280.00, duration: 'Day', state: 'Partially filled', placed: '28 Sept 10:05' },
  ];

  const activity = [
    { time: '28 Sept 10:41', text: 'Partial fill · Buy 1 of 3 Genmab at 2,280.00 DKK' },
    { time: '28 Sept 10:05', text: 'Order placed · Buy 3 Genmab, limit 2,280.00 DKK, Day' },
    { time: '28 Sept 09:31', text: 'Order placed · Buy 3 Microsoft, limit 505.00 USD, Good till cancelled' },
    { time: '25 Sept 09:12', text: 'Order placed · Sell 20 Vestas, limit 215.00 DKK, Good till cancelled' },
  ];

  const sessions = [
    { city: 'Copenhagen', state: 'Open', detail: 'Closes 17:00', progress: 0.9 },
    { city: 'Frankfurt', state: 'Open', detail: 'Closes 17:30', progress: 0.85 },
    { city: 'New York', state: 'Open', detail: 'Closes 22:00', progress: 0.11 },
  ];

  const depth = (x, n = 6) => {
    const r = rng(x.seed + 9), out = [];
    for (let i = 0; i < n; i++) out.push({ bid: x.bid - i * x.tick, bidSize: Math.round((200 + r() * 900) / 10) * 10, ask: x.ask + i * x.tick, askSize: Math.round((200 + r() * 900) / 10) * 10 });
    return out;
  };

  const searchIndex = [
    { sym: 'NOVO B', name: 'Novo Nordisk B', exch: 'Copenhagen', cur: 'DKK', kind: 'Stock', inList: true },
    { sym: 'NSIS B', name: 'Novonesis B', exch: 'Copenhagen', cur: 'DKK', kind: 'Stock', last: 452.80, chg: 0.71 },
    { sym: 'NVO', name: 'Novo Nordisk ADR', exch: 'NYSE', cur: 'USD', kind: 'Stock', last: 64.62, chg: -2.05 },
  ];

  window.MC = { instruments: I, by, fx, holdings, cash, orders, activity, sessions, depth, clock, searchIndex, rng, gauss, intraday };
})();
