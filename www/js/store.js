// ===== লোকাল ডেটা স্টোর (localStorage) =====
const Store = (() => {
  const KEY = 'krypto_v41';
  const def = () => ({
    cash: CONFIG.START_BALANCE,
    pos: {},            // { BTCUSDT: {qty, avg} }
    hist: [],           // ট্রেড হিস্টোরি
    orders: [],         // ওপেন limit order
    realized: 0,
    watch: ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'],
    alerts: {},         // { BTCUSDT: {target, dir} }
    plan: { id: 'free', exp: 0 },
    usedTrx: [],
    sym: 'BTCUSDT'
  });
  let s;
  try { s = Object.assign(def(), JSON.parse(localStorage.getItem(KEY) || '{}')); }
  catch (e) { s = def(); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} };
  const reset = () => {
    const keep = { watch: s.watch, alerts: s.alerts, plan: s.plan, usedTrx: s.usedTrx, sym: s.sym };
    Object.keys(s).forEach(k => delete s[k]);
    Object.assign(s, def(), keep);
    save();
  };
  return { s, save, reset };
})();
