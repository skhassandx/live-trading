// ===== Krypto কনফিগ — এখানে সব সেটিং বদলানো যাবে =====
const CONFIG = {
  // Binance পাবলিক মার্কেট-ডেটা (ফ্রি, API key লাগে না)
  REST: 'https://data-api.binance.vision',
  WS: 'wss://data-stream.binance.vision/ws/',
  WS_COMBINED: 'wss://data-stream.binance.vision/stream?streams=',

  START_BALANCE: 10000,   // পেপার ট্রেডিং ভার্চুয়াল ব্যালেন্স (USDT)
  FEE: 0.001,             // 0.1% ফি
  MIN_VOL: 200000,        // এর কম 24h ভলিউমের কয়েন মার্কেট লিস্টে দেখাবে না (USDT)

  // ---- Subscription / bKash ----
  BKASH_NUMBER: '01XXXXXXXXX',   // <-- আপনার bKash নম্বর বসান

  // আপনার ব্যাকএন্ডের URL (SMS দিয়ে TrxID যাচাই করার API)।
  // POST { trx_id, amount, plan }  →  রেসপন্স { "ok": true }
  VERIFY_URL: '',

  // true থাকলে VERIFY_URL ছাড়াই যেকোনো TrxID-তে প্ল্যান চালু হবে (শুধু টেস্টের জন্য!)
  // প্রোডাকশনে অবশ্যই false করুন এবং VERIFY_URL বসান।
  DEMO_ACTIVATE: true,

  PLANS: [
    { id: 'free', name: 'Free', price: 0, days: 0,
      watch: 5, limit: false, book: false, alerts: false,
      features: ['মার্কেট ডেটা ও চার্ট', 'Market order (পেপার)', 'Watchlist: ৫টি কয়েন', 'Market Analysis'] },
    { id: 'pro_m', name: 'Pro Monthly', price: 299, days: 30,
      watch: 30, limit: true, book: true, alerts: true,
      features: ['Limit order', 'Advanced Data (Order Book, Trades)', 'Price Alert নোটিফিকেশন', 'Watchlist: ৩০টি কয়েন'] },
    { id: 'pro_y', name: 'Pro Yearly', price: 2999, days: 365,
      watch: 100, limit: true, book: true, alerts: true,
      features: ['Pro Monthly-র সব ফিচার', 'Watchlist: ১০০টি কয়েন', '২ মাস সাশ্রয়'] }
  ]
};
