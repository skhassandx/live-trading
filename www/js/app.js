// ===== Krypto v4.1 — মূল অ্যাপ লজিক =====
(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const S = Store.s;

/* ---------- ডেটা ---------- */
const tickers = {};                 // { BTCUSDT: {s,p,h,l,q,v,chg} }
const TFS = ['1m', '5m', '15m', '1h', '4h', '1d'];
const AN_TFS = ['15m', '1h', '4h', '1d'];
const st = { sym: S.sym || 'BTCUSDT', tf: '15m', anTf: '1h', side: 'BUY', type: 'MARKET' };
let activeView = 'market';
let chart = null, cs = null, vs = null, ro = null;
let sock = null, book = null, trades = [];
let lastMini = 0, lastR = 0, payFor = null;

/* ---------- হেল্পার ---------- */
const nf = (n, d = 2) => (n == null || isNaN(n)) ? '-' : Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const pf = n => {
  if (n == null || isNaN(n)) return '-';
  const a = Math.abs(n), d = a >= 1000 ? 2 : a >= 1 ? 4 : a >= 0.01 ? 5 : 8;
  return nf(n, d);
};
const cf = n => { n = +n; if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B'; if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M'; if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K'; return n.toFixed(2); };
const pc = n => (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
const cls = n => n >= 0 ? 'up' : 'dn';
const base = s => s.replace(/USDT$/, '');
const floor8 = n => Math.floor(n * 1e8) / 1e8;
const jget = async path => { const r = await fetch(CONFIG.REST + path); if (!r.ok) throw new Error(r.status); return r.json(); };

let tt;
function toast(msg, kind = '') {
  const t = $('#toast'); t.textContent = msg; t.className = 'show ' + kind;
  clearTimeout(tt); tt = setTimeout(() => t.className = '', 3200);
}

/* ---------- প্ল্যান ---------- */
const planId = () => (S.plan.exp > Date.now() ? S.plan.id : 'free');
const plan = () => CONFIG.PLANS.find(p => p.id === planId()) || CONFIG.PLANS[0];
const can = f => !!plan()[f];
const lockHtml = what => `<div class="lock">🔒 ${what} শুধু Pro প্ল্যানে পাওয়া যায়।<br><button class="btn" data-go="sub">আপগ্রেড করুন</button></div>`;

/* ---------- মার্কেট ডেটা লোড ---------- */
async function loadTickers() {
  const d = await jget('/api/v3/ticker/24hr');
  d.forEach(t => {
    if (!t.symbol.endsWith('USDT')) return;
    tickers[t.symbol] = { s: t.symbol, p: +t.lastPrice, h: +t.highPrice, l: +t.lowPrice, q: +t.quoteVolume, v: +t.volume, chg: +t.priceChangePercent };
  });
  lastMini = Date.now();
}
function connectMini() {
  const ws = new WebSocket(CONFIG.WS + '!miniTicker@arr');
  ws.onmessage = e => {
    JSON.parse(e.data).forEach(t => {
      if (!t.s.endsWith('USDT')) return;
      const k = tickers[t.s] || (tickers[t.s] = { s: t.s });
      k.p = +t.c; k.h = +t.h; k.l = +t.l; k.q = +t.q; k.v = +t.v;
      k.chg = (+t.o) ? (+t.c - +t.o) / (+t.o) * 100 : 0;
    });
    onTick();
  };
  ws.onclose = () => setTimeout(connectMini, 3000);
  ws.onerror = () => ws.close();
}
function onTick() {
  lastMini = Date.now();
  checkOrders(); checkAlerts();
  const n = Date.now();
  if (n - lastR < 1500) return;
  lastR = n;
  renderActive();
  $('#topEquity').textContent = '$' + nf(equity(), 2);
}

/* ---------- ইকুইটি / পজিশন ---------- */
function equity() {
  let e = S.cash;
  for (const [s, p] of Object.entries(S.pos)) e += p.qty * ((tickers[s] && tickers[s].p) || p.avg);
  for (const o of S.orders) e += o.side === 'BUY' ? o.qty * o.price * (1 + CONFIG.FEE) : o.qty * ((tickers[o.sym] && tickers[o.sym].p) || o.avg);
  return e;
}
function addPos(sym, qty, price) {
  const p = S.pos[sym] || { qty: 0, avg: 0 };
  const nq = p.qty + qty;
  p.avg = (p.qty * p.avg + qty * price) / nq; p.qty = nq;
  S.pos[sym] = p;
}
function pushHist(h) { S.hist.unshift(h); if (S.hist.length > 200) S.hist.length = 200; }

/* ---------- ট্যাব ---------- */
function show(v) {
  activeView = v;
  $$('.view').forEach(x => x.classList.toggle('active', x.id === 'view-' + v));
  $$('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  if (v === 'trade') {
    if (!chart) { ensureChart(); loadChart(); } else resizeChart();
    if (!sock) connectStream();
  }
  if (v === 'advanced' && !sock) connectStream();
  if (v === 'analysis') runAnalysis();
  if (v === 'sub') renderSub();
  renderActive();
  window.scrollTo(0, 0);
}
function renderActive() {
  switch (activeView) {
    case 'market': renderMarket(); break;
    case 'trade': renderTradeHead(); renderOpenOrders(); break;
    case 'advanced': renderAdvStats(); break;
    case 'watch': renderWatch(); break;
    case 'portfolio': renderPortfolio(); break;
  }
}

/* ---------- Market ---------- */
function renderMarket() {
  const q = $('#mSearch').value.trim().toUpperCase(), sort = $('#mSort').value;
  let L = Object.values(tickers).filter(t => t.q >= CONFIG.MIN_VOL && t.p > 0);
  const big = L.filter(t => t.q >= 5e6);
  if (big.length) {
    const g = big.reduce((a, b) => b.chg > a.chg ? b : a);
    const l = big.reduce((a, b) => b.chg < a.chg ? b : a);
    const v = big.reduce((a, b) => b.q > a.q ? b : a);
    const card = (lab, t) => `<div class="card mover" data-sym="${t.s}" style="cursor:pointer"><div class="lab">${lab}</div><div class="nm">${base(t.s)}</div><div>${pf(t.p)} <span class="${cls(t.chg)}">${pc(t.chg)}</span></div></div>`;
    $('#movers').innerHTML = card('🚀 Top Gainer', g) + card('📉 Top Loser', l) + card('🔥 Top Volume', v);
  }
  if (q) L = L.filter(t => t.s.includes(q));
  const sorters = { q: (a, b) => b.q - a.q, chg: (a, b) => b.chg - a.chg, chgAsc: (a, b) => a.chg - b.chg, p: (a, b) => b.p - a.p };
  L.sort(sorters[sort]);
  $('#mTable tbody').innerHTML = L.slice(0, 100).map(t =>
    `<tr data-sym="${t.s}"><td><button class="star ${S.watch.includes(t.s) ? 'on' : ''}" data-star="${t.s}">★</button></td>` +
    `<td><b>${base(t.s)}</b><small>/USDT</small></td><td class="r">${pf(t.p)}</td><td class="r ${cls(t.chg)}">${pc(t.chg)}</td>` +
    `<td class="r hide-m">${pf(t.h)}</td><td class="r hide-m">${pf(t.l)}</td><td class="r hide-m">${cf(t.q)}</td></tr>`).join('')
    || '<tr><td colspan="7" class="muted c">কোনো ডেটা নেই</td></tr>';
}
function openTrade(sym) { setSymbol(sym); show('trade'); }
function toggleWatch(sym) {
  const i = S.watch.indexOf(sym);
  if (i >= 0) { S.watch.splice(i, 1); delete S.alerts[sym]; toast(base(sym) + ' Watchlist থেকে সরানো হয়েছে'); }
  else {
    if (S.watch.length >= plan().watch) { toast('Watchlist লিমিট (' + plan().watch + ') শেষ — আপগ্রেড করুন', 'err'); return; }
    S.watch.push(sym); toast(base(sym) + ' Watchlist-এ যোগ হয়েছে', 'ok');
  }
  Store.save(); renderActive();
}

/* ---------- সিম্বল / চার্ট / স্ট্রিম ---------- */
function setSymbol(sym) {
  sym = String(sym || '').toUpperCase().trim();
  if (Object.keys(tickers).length && !tickers[sym]) { toast('এই পেয়ার পাওয়া যায়নি', 'err'); $('#symInput').value = st.sym; return; }
  st.sym = sym; S.sym = sym; Store.save();
  $('#symInput').value = sym; $('#baseName').textContent = base(sym);
  $('#advTitle').textContent = sym; $('#anTitle').textContent = sym + ' · ' + st.anTf;
  book = null; trades = [];
  if (chart) loadChart();
  if (activeView === 'trade' || activeView === 'advanced' || sock) connectStream();
  if (activeView === 'analysis') runAnalysis();
  updateOrderPanel(); renderTradeHead();
}
function ensureChart() {
  if (chart || typeof LightweightCharts === 'undefined') return;
  const el = $('#chart');
  chart = LightweightCharts.createChart(el, {
    width: el.clientWidth, height: el.clientHeight || 400,
    layout: { background: { color: 'transparent' }, textColor: '#9aa4b2' },
    grid: { vertLines: { color: '#1b2230' }, horzLines: { color: '#1b2230' } },
    rightPriceScale: { borderColor: '#1b2230' },
    timeScale: { borderColor: '#1b2230', timeVisible: true, secondsVisible: false },
    crosshair: { mode: 0 }
  });
  cs = chart.addCandlestickSeries({ upColor: '#0ecb81', downColor: '#f6465d', borderVisible: false, wickUpColor: '#0ecb81', wickDownColor: '#f6465d' });
  vs = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: '' });
  vs.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
  ro = new ResizeObserver(resizeChart); ro.observe(el);
}
function resizeChart() { if (chart) { const el = $('#chart'); chart.applyOptions({ width: el.clientWidth, height: el.clientHeight || 400 }); } }
async function loadChart() {
  if (!chart) return;
  const sym = st.sym, tf = st.tf;
  try {
    const k = await jget(`/api/v3/klines?symbol=${sym}&interval=${tf}&limit=500`);
    if (sym !== st.sym || tf !== st.tf) return;
    cs.setData(k.map(x => ({ time: Math.floor(x[0] / 1000), open: +x[1], high: +x[2], low: +x[3], close: +x[4] })));
    vs.setData(k.map(x => ({ time: Math.floor(x[0] / 1000), value: +x[5], color: +x[4] >= +x[1] ? 'rgba(14,203,129,.4)' : 'rgba(246,70,93,.4)' })));
    chart.timeScale().fitContent();
  } catch (e) { toast('চার্ট ডেটা লোড হয়নি', 'err'); }
}
function connectStream() {
  if (sock) { const old = sock; sock = null; old.onclose = null; old.close(); }
  const s = st.sym.toLowerCase();
  const url = CONFIG.WS_COMBINED + [`${s}@kline_${st.tf}`, `${s}@depth20@1000ms`, `${s}@trade`].join('/');
  const mine = new WebSocket(url); sock = mine;
  mine.onmessage = e => {
    const m = JSON.parse(e.data), d = m.data, n = m.stream || '';
    if (n.includes('@kline')) onKline(d.k);
    else if (n.includes('@depth')) { book = d; renderBook(); }
    else if (n.includes('@trade')) onTrade(d);
  };
  mine.onclose = () => { if (sock === mine) setTimeout(() => { if (sock === mine) connectStream(); }, 3000); };
  mine.onerror = () => mine.close();
}
function onKline(k) {
  if (!cs) return;
  const t = Math.floor(k.t / 1000);
  cs.update({ time: t, open: +k.o, high: +k.h, low: +k.l, close: +k.c });
  vs.update({ time: t, value: +k.v, color: +k.c >= +k.o ? 'rgba(14,203,129,.4)' : 'rgba(246,70,93,.4)' });
}
function onTrade(d) {
  trades.unshift({ p: +d.p, q: +d.q, m: d.m, t: d.T });
  if (trades.length > 40) trades.length = 40;
  renderTrades();
}

/* ---------- Live (পেপার) Trading ---------- */
function renderTradeHead() {
  const t = tickers[st.sym]; if (!t) return;
  $('#tHead').innerHTML = `<b class="big ${cls(t.chg)}">${pf(t.p)}</b><span class="${cls(t.chg)}">${pc(t.chg)}</span><span class="muted small">H ${pf(t.h)} · L ${pf(t.l)} · Vol ${cf(t.q)}</span>`;
  updateOrderPanel();
}
function updateOrderPanel() {
  const t = tickers[st.sym];
  if (st.type === 'MARKET' && t) $('#oPrice').value = pf(t.p).replace(/,/g, '');
  $('#avail').textContent = st.side === 'BUY'
    ? nf(S.cash, 2) + ' USDT'
    : ((S.pos[st.sym] && S.pos[st.sym].qty) || 0).toFixed(6) + ' ' + base(st.sym);
  const price = st.type === 'MARKET' ? (t ? t.p : 0) : parseFloat($('#oPrice').value) || 0;
  const qty = parseFloat($('#oQty').value) || 0;
  $('#oTotal').textContent = nf(price * qty, 2);
}
function setPct(p) {
  const t = tickers[st.sym]; if (!t) return;
  const price = st.type === 'MARKET' ? t.p : (parseFloat($('#oPrice').value) || t.p);
  let q;
  if (st.side === 'BUY') q = floor8(S.cash / (price * (1 + CONFIG.FEE)) * p / 100);
  else q = floor8(((S.pos[st.sym] && S.pos[st.sym].qty) || 0) * p / 100);
  $('#oQty').value = q > 0 ? q : '';
  updateOrderPanel();
}
function placeOrder() {
  const t = tickers[st.sym]; if (!t) return toast('প্রাইস পাওয়া যায়নি', 'err');
  const qty = parseFloat($('#oQty').value);
  if (!(qty > 0)) return toast('পরিমাণ দিন', 'err');
  const side = st.side, type = st.type, fee = CONFIG.FEE;
  const pos = S.pos[st.sym];

  if (type === 'MARKET') {
    const p = t.p;
    if (side === 'BUY') {
      const cost = qty * p, f = cost * fee;
      if (cost + f > S.cash + 1e-9) return toast('যথেষ্ট USDT নেই', 'err');
      S.cash -= cost + f; addPos(st.sym, qty, p);
      pushHist({ t: Date.now(), sym: st.sym, side, price: p, qty, pnl: null });
    } else {
      if (!pos || qty > pos.qty + 1e-9) return toast('যথেষ্ট ' + base(st.sym) + ' নেই', 'err');
      const gross = qty * p, f = gross * fee, pnl = (p - pos.avg) * qty - f;
      S.cash += gross - f; S.realized += pnl;
      pos.qty -= qty; if (pos.qty < 1e-9) delete S.pos[st.sym];
      pushHist({ t: Date.now(), sym: st.sym, side, price: p, qty, pnl });
    }
    toast(`${side === 'BUY' ? 'কেনা' : 'বিক্রি'} সম্পন্ন: ${qty} ${base(st.sym)} @ ${pf(p)}`, 'ok');
  } else {
    if (!can('limit')) { toast('Limit order শুধু Pro প্ল্যানে', 'err'); return show('sub'); }
    const price = parseFloat($('#oPrice').value);
    if (!(price > 0)) return toast('প্রাইস দিন', 'err');
    const o = { id: Date.now() + '' + Math.floor(Math.random() * 1000), t: Date.now(), sym: st.sym, side, type, price, qty, avg: 0 };
    if (side === 'BUY') {
      const need = qty * price * (1 + fee);
      if (need > S.cash + 1e-9) return toast('যথেষ্ট USDT নেই', 'err');
      S.cash -= need;
    } else {
      if (!pos || qty > pos.qty + 1e-9) return toast('যথেষ্ট ' + base(st.sym) + ' নেই', 'err');
      o.avg = pos.avg; pos.qty -= qty; if (pos.qty < 1e-9) delete S.pos[st.sym];
    }
    S.orders.push(o);
    toast('Limit order বসানো হয়েছে', 'ok');
  }
  $('#oQty').value = '';
  Store.save(); updateOrderPanel(); renderOpenOrders();
  $('#topEquity').textContent = '$' + nf(equity(), 2);
}
function cancelOrder(id) {
  const o = S.orders.find(x => x.id === id); if (!o) return;
  if (o.side === 'BUY') S.cash += o.qty * o.price * (1 + CONFIG.FEE);
  else { const p = S.pos[o.sym] || { qty: 0, avg: o.avg }; p.avg = p.qty ? (p.qty * p.avg + o.qty * o.avg) / (p.qty + o.qty) : o.avg; p.qty += o.qty; S.pos[o.sym] = p; }
  S.orders = S.orders.filter(x => x.id !== id);
  Store.save(); renderOpenOrders(); updateOrderPanel(); toast('অর্ডার বাতিল হয়েছে');
}
function checkOrders() {
  if (!S.orders.length) return;
  let changed = false;
  for (const o of [...S.orders]) {
    const t = tickers[o.sym]; if (!t) continue;
    const hit = o.side === 'BUY' ? t.p <= o.price : t.p >= o.price;
    if (!hit) continue;
    S.orders = S.orders.filter(x => x.id !== o.id);
    if (o.side === 'BUY') {
      addPos(o.sym, o.qty, o.price);
      pushHist({ t: Date.now(), sym: o.sym, side: 'BUY', price: o.price, qty: o.qty, pnl: null });
    } else {
      const gross = o.qty * o.price, f = gross * CONFIG.FEE, pnl = (o.price - o.avg) * o.qty - f;
      S.cash += gross - f; S.realized += pnl;
      pushHist({ t: Date.now(), sym: o.sym, side: 'SELL', price: o.price, qty: o.qty, pnl });
    }
    toast(`Limit ${o.side} fill: ${base(o.sym)} @ ${pf(o.price)}`, 'ok');
    changed = true;
  }
  if (changed) { Store.save(); renderActive(); }
}
function renderOpenOrders() {
  $('#openOrders tbody').innerHTML = S.orders.length ? S.orders.map(o =>
    `<tr><td>${new Date(o.t).toLocaleTimeString()}</td><td>${o.sym}</td><td class="${o.side === 'BUY' ? 'up' : 'dn'}">${o.side}</td>` +
    `<td class="r">${pf(o.price)}</td><td class="r">${o.qty}</td><td class="r"><button class="mini" data-cancel="${o.id}">✕</button></td></tr>`).join('')
    : '<tr><td colspan="6" class="muted c">কোনো ওপেন অর্ডার নেই</td></tr>';
}

/* ---------- Advanced Data ---------- */
function renderAdvStats() {
  if (!can('book')) { $('#advStats').innerHTML = lockHtml('Advanced Data'); $('#book').innerHTML = ''; $('#trades').innerHTML = ''; return; }
  const t = tickers[st.sym]; if (!t) return;
  let spread = '-', imb = '-';
  if (book && book.asks && book.bids && book.asks.length && book.bids.length) {
    spread = pf(+book.asks[0][0] - +book.bids[0][0]);
    const bv = book.bids.reduce((a, x) => a + +x[1], 0), av = book.asks.reduce((a, x) => a + +x[1], 0);
    imb = (bv / (bv + av) * 100).toFixed(1) + '% Bid';
  }
  let pressure = '-';
  if (trades.length) { const buy = trades.filter(x => !x.m).reduce((a, x) => a + x.q, 0), tot = trades.reduce((a, x) => a + x.q, 0); pressure = (buy / tot * 100).toFixed(1) + '% Buy'; }
  const vol = t.l ? ((t.h - t.l) / t.l * 100).toFixed(2) + '%' : '-';
  const c = (lab, val, k = '') => `<div class="card stat"><div class="lab">${lab}</div><div class="val ${k}">${val}</div></div>`;
  $('#advStats').innerHTML =
    c('Last Price', pf(t.p)) + c('24h Change', pc(t.chg), cls(t.chg)) + c('24h High', pf(t.h)) + c('24h Low', pf(t.l)) +
    c('Volume (' + base(st.sym) + ')', cf(t.v)) + c('Volume (USDT)', cf(t.q)) + c('24h Range', vol) + c('Spread', spread) +
    c('Order Book Imbalance', imb) + c('Taker Buy Pressure', pressure);
}
function renderBook() {
  if (activeView !== 'advanced' || !can('book') || !book || !book.asks) return;
  const A = book.asks.slice(0, 12).map(x => [+x[0], +x[1]]), B = book.bids.slice(0, 12).map(x => [+x[0], +x[1]]);
  const max = Math.max(...A.map(x => x[1]), ...B.map(x => x[1])) || 1;
  const row = (x, c) => `<div class="bk ${c}"><i style="width:${x[1] / max * 100}%"></i><span>${pf(x[0])}</span><span>${x[1].toFixed(4)}</span><span>${cf(x[0] * x[1])}</span></div>`;
  $('#book').innerHTML = '<div class="bkh"><span>Price</span><span>Qty</span><span>USDT</span></div>' +
    A.slice().reverse().map(x => row(x, 'ask')).join('') +
    `<div class="mid ${tickers[st.sym] ? cls(tickers[st.sym].chg) : ''}">${pf(tickers[st.sym] && tickers[st.sym].p)}</div>` +
    B.map(x => row(x, 'bid')).join('');
  renderAdvStats();
}
function renderTrades() {
  if (activeView !== 'advanced' || !can('book')) return;
  $('#trades').innerHTML = '<div class="bkh"><span>Price</span><span>Qty</span><span>Time</span></div>' +
    trades.map(x => `<div class="tr"><span class="${x.m ? 'dn' : 'up'}">${pf(x.p)}</span><span>${x.q.toFixed(5)}</span><span class="muted">${new Date(x.t).toLocaleTimeString()}</span></div>`).join('');
}

/* ---------- Market Analysis ---------- */
async function runAnalysis() {
  if (activeView !== 'analysis') return;
  const sym = st.sym, tf = st.anTf;
  $('#anTitle').textContent = sym + ' · ' + tf;
  let k;
  try { k = await jget(`/api/v3/klines?symbol=${sym}&interval=${tf}&limit=300`); }
  catch (e) { toast('অ্যানালাইসিস ডেটা লোড হয়নি', 'err'); return; }
  if (sym !== st.sym || tf !== st.anTf) return;
  const c = k.map(x => +x[4]), h = k.map(x => +x[2]), l = k.map(x => +x[3]);
  const n = c.length - 1, price = c[n];
  const rows = [];
  const add = (name, val, sig) => rows.push({ name, val, sig });
  const L = Ind.last;

  const rsi = L(Ind.rsi(c));
  add('RSI (14)', rsi.toFixed(1), rsi < 30 ? 'Buy' : rsi > 70 ? 'Sell' : 'Neutral');
  const m = Ind.macd(c), ml = L(m.line), ms = L(m.signal), mh = L(m.hist);
  add('MACD (12,26,9)', ml.toPrecision(4) + ' / ' + ms.toPrecision(4), mh > 0 ? 'Buy' : mh < 0 ? 'Sell' : 'Neutral');
  const sk = Ind.stoch(h, l, c), K = L(sk.k);
  add('Stochastic %K (14)', K.toFixed(1), K < 20 ? 'Buy' : K > 80 ? 'Sell' : 'Neutral');
  [20, 50, 200].forEach(p => { const v = L(Ind.sma(c, p)); if (v != null) add('SMA ' + p, pf(v), price > v ? 'Buy' : 'Sell'); });
  [20, 50].forEach(p => { const v = L(Ind.ema(c, p)); if (v != null) add('EMA ' + p, pf(v), price > v ? 'Buy' : 'Sell'); });
  const bb = Ind.boll(c), up = L(bb.up), lo = L(bb.lo);
  add('Bollinger (20,2)', pf(lo) + ' – ' + pf(up), price < lo ? 'Buy' : price > up ? 'Sell' : 'Neutral');
  const atr = L(Ind.atr(h, l, c));
  add('ATR (14)', pf(atr) + ' (' + (atr / price * 100).toFixed(2) + '%)', 'Neutral');

  $('#anTable tbody').innerHTML = rows.map(r => `<tr><td>${r.name}</td><td class="r">${r.val}</td><td class="r"><span class="pill ${r.sig}">${r.sig}</span></td></tr>`).join('');

  const buys = rows.filter(r => r.sig === 'Buy').length, sells = rows.filter(r => r.sig === 'Sell').length, neu = rows.length - buys - sells;
  const score = (buys - sells) / rows.length;
  const label = score > 0.5 ? 'Strong Buy' : score > 0.15 ? 'Buy' : score < -0.5 ? 'Strong Sell' : score < -0.15 ? 'Sell' : 'Neutral';
  const sc = score > 0.15 ? 'buy' : score < -0.15 ? 'sell' : 'neu';
  $('#anSummary').innerHTML = `<div class="sig ${sc}">${label}</div><div class="gauge"><i style="left:${(score + 1) / 2 * 100}%"></i></div>` +
    `<div class="row between small"><span class="dn">Sell ${sells}</span><span class="muted">Neutral ${neu}</span><span class="up">Buy ${buys}</span></div>`;

  const pv = Ind.pivots(+k[n - 1][2], +k[n - 1][3], +k[n - 1][4]);
  const rh = Math.max(...h.slice(-50)), rl = Math.min(...l.slice(-50));
  const sr = (lab, v, c2 = '') => `<div class="sr"><span class="${c2}">${lab}</span><span>${pf(v)} <small class="muted">(${pc((v - price) / price * 100)})</small></span></div>`;
  $('#anSR').innerHTML = sr('50-candle High', rh, 'dn') + sr('Resistance 2', pv.R2, 'dn') + sr('Resistance 1', pv.R1, 'dn') +
    `<div class="sr"><b>Price</b><b>${pf(price)}</b></div>` + sr('Pivot', pv.P) + sr('Support 1', pv.S1, 'up') + sr('Support 2', pv.S2, 'up') + sr('50-candle Low', rl, 'up');
}

/* ---------- Watchlist + Alerts ---------- */
function renderWatch() {
  $('#wLimit').textContent = `${S.watch.length}/${plan().watch} ব্যবহৃত (${plan().name})`;
  $('#wTable tbody').innerHTML = S.watch.length ? S.watch.map(sym => {
    const t = tickers[sym] || { p: 0, chg: 0 }, a = S.alerts[sym];
    return `<tr data-sym="${sym}"><td><b>${base(sym)}</b><small>/USDT</small></td><td class="r">${pf(t.p)}</td><td class="r ${cls(t.chg)}">${pc(t.chg || 0)}</td>` +
      `<td class="r"><button class="mini" data-alert="${sym}">${a ? '🔔 ' + pf(a.target) : '＋ Alert'}</button></td>` +
      `<td class="r"><button class="mini" data-unwatch="${sym}">✕</button></td></tr>`;
  }).join('') : '<tr><td colspan="5" class="muted c">Watchlist খালি</td></tr>';
}
function promptAlert(sym) {
  if (!can('alerts')) { toast('Price Alert শুধু Pro প্ল্যানে', 'err'); return show('sub'); }
  const cur = S.alerts[sym];
  const v = prompt(`${sym} এর টার্গেট প্রাইস দিন (খালি রাখলে Alert মুছে যাবে):`, cur ? cur.target : '');
  if (v === null) return;
  if (v.trim() === '') { delete S.alerts[sym]; }
  else {
    const target = parseFloat(v); if (!(target > 0)) return toast('সঠিক প্রাইস দিন', 'err');
    const p = tickers[sym] ? tickers[sym].p : target;
    S.alerts[sym] = { target, dir: target >= p ? 'up' : 'down' };
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    toast('Alert সেট হয়েছে', 'ok');
  }
  Store.save(); renderWatch();
}
function checkAlerts() {
  for (const [sym, a] of Object.entries(S.alerts)) {
    const t = tickers[sym]; if (!t) continue;
    if ((a.dir === 'up' && t.p >= a.target) || (a.dir === 'down' && t.p <= a.target)) {
      const msg = `${base(sym)} ${a.dir === 'up' ? '≥' : '≤'} ${pf(a.target)} (এখন ${pf(t.p)})`;
      delete S.alerts[sym]; Store.save();
      toast('🔔 ' + msg, 'ok');
      try { if ('Notification' in window && Notification.permission === 'granted') new Notification('Krypto Alert', { body: msg }); } catch (e) {}
      if (activeView === 'watch') renderWatch();
    }
  }
}

/* ---------- Portfolio ---------- */
function renderPortfolio() {
  let posVal = 0, unreal = 0;
  const rows = Object.entries(S.pos).map(([sym, p]) => {
    const price = (tickers[sym] && tickers[sym].p) || p.avg, val = p.qty * price, pnl = (price - p.avg) * p.qty;
    posVal += val; unreal += pnl;
    return { sym, p, price, val, pnl };
  });
  const eq = equity();
  const c = (lab, val, k = '') => `<div class="card stat"><div class="lab">${lab}</div><div class="val ${k}">${val}</div></div>`;
  $('#pfStats').innerHTML = c('Total Equity', '$' + nf(eq, 2)) + c('Cash (USDT)', '$' + nf(S.cash, 2)) +
    c('Unrealized PnL', (unreal >= 0 ? '+' : '') + nf(unreal, 2), cls(unreal)) + c('Realized PnL', (S.realized >= 0 ? '+' : '') + nf(S.realized, 2), cls(S.realized));
  $('#pfTable tbody').innerHTML = rows.length ? rows.map(r =>
    `<tr data-sym="${r.sym}"><td><b>${base(r.sym)}</b></td><td class="r">${r.p.qty.toFixed(6)}</td><td class="r">${pf(r.p.avg)}</td><td class="r">${pf(r.price)}</td><td class="r">${nf(r.val, 2)}</td>` +
    `<td class="r ${cls(r.pnl)}">${nf(r.pnl, 2)} (${pc((r.price - r.p.avg) / r.p.avg * 100)})</td></tr>`).join('')
    : '<tr><td colspan="6" class="muted c">কোনো হোল্ডিং নেই — Live Trading ট্যাব থেকে কিনুন</td></tr>';
  const parts = rows.map(r => [base(r.sym), r.val]).concat([['USDT', S.cash]]).filter(x => x[1] > 0.01);
  $('#pfAlloc').innerHTML = parts.map(x => { const pct = x[1] / (posVal + S.cash) * 100; return `<div class="alloc"><div class="row between small"><span>${x[0]}</span><span>${pct.toFixed(1)}%</span></div><div class="bar"><i style="width:${pct}%"></i></div></div>`; }).join('');
  $('#histTable tbody').innerHTML = S.hist.length ? S.hist.slice(0, 50).map(h =>
    `<tr><td>${new Date(h.t).toLocaleString()}</td><td>${h.sym}</td><td class="${h.side === 'BUY' ? 'up' : 'dn'}">${h.side}</td><td class="r">${pf(h.price)}</td><td class="r">${h.qty}</td>` +
    `<td class="r ${h.pnl == null ? 'muted' : cls(h.pnl)}">${h.pnl == null ? '-' : nf(h.pnl, 2)}</td></tr>`).join('')
    : '<tr><td colspan="6" class="muted c">কোনো ট্রেড নেই</td></tr>';
}

/* ---------- Subscription ---------- */
function renderSub() {
  const cur = plan();
  const exp = S.plan.exp > Date.now() ? new Date(S.plan.exp).toLocaleDateString() : null;
  $('#subStatus').innerHTML = `<h3>বর্তমান প্ল্যান: <span class="badge on">${cur.name}</span></h3>` +
    (exp ? `<p class="muted">মেয়াদ শেষ: ${exp}</p>` : '<p class="muted">আপগ্রেড করে Limit Order, Advanced Data ও Price Alert আনলক করুন।</p>');
  $('#plans').innerHTML = CONFIG.PLANS.map(p =>
    `<div class="card plan ${p.id === cur.id ? 'cur' : ''}"><h3>${p.name}</h3>` +
    `<div class="price">${p.price ? '৳' + p.price : 'Free'}<small>${p.days ? ' / ' + p.days + ' দিন' : ''}</small></div>` +
    `<ul>${p.features.map(f => '<li>' + f + '</li>').join('')}</ul>` +
    (p.price ? `<button class="btn full" data-plan="${p.id}">Select</button>` : '') + '</div>').join('');
  $('#planBadge').textContent = cur.name.toUpperCase();
  $('#planBadge').classList.toggle('on', cur.id !== 'free');
}
function selectPlan(id) {
  const p = CONFIG.PLANS.find(x => x.id === id); if (!p) return;
  payFor = id;
  $('#payPlan').textContent = p.name; $('#payNumber').textContent = CONFIG.BKASH_NUMBER; $('#payAmount').textContent = '৳' + p.price;
  $('#payMsg').textContent = ''; $('#trxInput').value = '';
  $('#payBox').classList.remove('hidden'); $('#payBox').scrollIntoView({ behavior: 'smooth' });
}
async function verifyTrx() {
  const p = CONFIG.PLANS.find(x => x.id === payFor); if (!p) return;
  const msg = t => { $('#payMsg').textContent = t; };
  const trx = $('#trxInput').value.trim().toUpperCase();
  if (!/^[A-Z0-9]{8,12}$/.test(trx)) return msg('❌ TrxID সঠিক নয়');
  if (S.usedTrx.includes(trx)) return msg('❌ এই TrxID আগে ব্যবহার করা হয়েছে');
  $('#trxBtn').disabled = true; msg('যাচাই হচ্ছে...');
  try {
    let ok = false;
    if (CONFIG.VERIFY_URL) {
      const r = await fetch(CONFIG.VERIFY_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trx_id: trx, amount: p.price, plan: p.id }) });
      const j = await r.json(); ok = !!j.ok;
    } else if (CONFIG.DEMO_ACTIVATE) ok = true;
    if (!ok) { msg('❌ পেমেন্ট পাওয়া যায়নি। TrxID ও পরিমাণ মিলিয়ে আবার চেষ্টা করুন।'); return; }
    const from = Math.max(Date.now(), S.plan.exp || 0);
    S.plan = { id: p.id, exp: from + p.days * 864e5 };
    S.usedTrx.push(trx); Store.save();
    toast('✅ ' + p.name + ' চালু হয়েছে', 'ok');
    $('#payBox').classList.add('hidden'); renderSub();
  } catch (e) { msg('❌ সার্ভারে সমস্যা, পরে চেষ্টা করুন'); }
  finally { $('#trxBtn').disabled = false; }
}

/* ---------- UI বাইন্ডিং ---------- */
function buildSeg(el, list, cur, cb) {
  el.innerHTML = list.map(x => `<button data-v="${x}" class="${x === cur ? 'active' : ''}">${x}</button>`).join('');
  el.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    $$('button', el).forEach(x => x.classList.toggle('active', x === b)); cb(b.dataset.v);
  };
}
function bind() {
  $('#tabs').onclick = e => { const b = e.target.closest('button'); if (b) show(b.dataset.view); };
  document.addEventListener('click', e => {
    const go = e.target.closest('[data-go]'); if (go) { show(go.dataset.go); return; }
    const pl = e.target.closest('[data-plan]'); if (pl) selectPlan(pl.dataset.plan);
  });

  // market
  $('#mSearch').oninput = renderMarket; $('#mSort').onchange = renderMarket;
  $('#mTable tbody').onclick = e => {
    const s = e.target.closest('[data-star]'); if (s) { toggleWatch(s.dataset.star); return; }
    const r = e.target.closest('tr[data-sym]'); if (r) openTrade(r.dataset.sym);
  };
  $('#movers').onclick = e => { const c = e.target.closest('[data-sym]'); if (c) openTrade(c.dataset.sym); };

  // trade
  buildSeg($('#tfSeg'), TFS, st.tf, v => { st.tf = v; loadChart(); connectStream(); });
  $('#symInput').onchange = e => setSymbol(e.target.value);
  $('#sideSeg').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    st.side = b.dataset.side;
    $$('#sideSeg button').forEach(x => x.classList.toggle('active', x === b));
    const pb = $('#placeBtn'); pb.textContent = st.side === 'BUY' ? 'Buy' : 'Sell'; pb.className = 'btn full ' + (st.side === 'BUY' ? 'buy' : 'sell');
    $('#oQty').value = ''; updateOrderPanel();
  };
  $('#typeSeg').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    st.type = b.dataset.type;
    $$('#typeSeg button').forEach(x => x.classList.toggle('active', x === b));
    $('#oPrice').disabled = st.type === 'MARKET';
    if (st.type === 'LIMIT') { const t = tickers[st.sym]; if (t) $('#oPrice').value = pf(t.p).replace(/,/g, ''); }
    updateOrderPanel();
  };
  $('#pctSeg').onclick = e => { const b = e.target.closest('button'); if (b) setPct(+b.dataset.p); };
  $('#oQty').oninput = updateOrderPanel; $('#oPrice').oninput = updateOrderPanel;
  $('#placeBtn').onclick = placeOrder;
  $('#openOrders tbody').onclick = e => { const b = e.target.closest('[data-cancel]'); if (b) cancelOrder(b.dataset.cancel); };

  // analysis
  buildSeg($('#anTfSeg'), AN_TFS, st.anTf, v => { st.anTf = v; runAnalysis(); });

  // watch
  $('#wAdd').onclick = () => {
    const sym = $('#wInput').value.toUpperCase().trim();
    if (!tickers[sym]) return toast('এই পেয়ার পাওয়া যায়নি', 'err');
    if (S.watch.includes(sym)) return toast('আগে থেকেই আছে');
    toggleWatch(sym); $('#wInput').value = '';
  };
  $('#wTable tbody').onclick = e => {
    const a = e.target.closest('[data-alert]'); if (a) { promptAlert(a.dataset.alert); return; }
    const u = e.target.closest('[data-unwatch]'); if (u) { toggleWatch(u.dataset.unwatch); return; }
    const r = e.target.closest('tr[data-sym]'); if (r) openTrade(r.dataset.sym);
  };

  // portfolio
  $('#pfTable tbody').onclick = e => { const r = e.target.closest('tr[data-sym]'); if (r) openTrade(r.dataset.sym); };
  $('#resetPf').onclick = () => {
    if (confirm('পোর্টফোলিও রিসেট করে $' + CONFIG.START_BALANCE + ' থেকে শুরু করবেন?')) { Store.reset(); toast('রিসেট হয়েছে'); renderPortfolio(); }
  };

  // subscription
  $('#trxBtn').onclick = verifyTrx;
}

/* ---------- শুরু ---------- */
async function init() {
  bind(); renderSub();
  try { await loadTickers(); } catch (e) { toast('Binance ডেটা লোড হচ্ছে না — ইন্টারনেট/VPN চেক করুন', 'err'); }
  $('#symList').innerHTML = Object.values(tickers).filter(t => t.q >= CONFIG.MIN_VOL).sort((a, b) => b.q - a.q).slice(0, 300).map(t => `<option value="${t.s}">`).join('');
  connectMini();
  setInterval(() => { if (Date.now() - lastMini > 10000) loadTickers().then(onTick).catch(() => {}); }, 10000);
  setInterval(() => { if (activeView === 'analysis') runAnalysis(); }, 30000);
  setSymbol(st.sym);
  renderMarket();
  $('#topEquity').textContent = '$' + nf(equity(), 2);
}
init();
})();
