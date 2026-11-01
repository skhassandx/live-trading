// ===== টেকনিক্যাল ইন্ডিকেটর =====
const Ind = {
  sma(a, n) {
    const out = []; let s = 0;
    for (let i = 0; i < a.length; i++) {
      s += a[i]; if (i >= n) s -= a[i - n];
      out.push(i >= n - 1 ? s / n : null);
    }
    return out;
  },
  ema(a, n) {
    const k = 2 / (n + 1), out = []; let e = null;
    for (let i = 0; i < a.length; i++) {
      if (i < n - 1) { out.push(null); continue; }
      if (e === null) e = a.slice(0, n).reduce((x, y) => x + y, 0) / n;
      else e = a[i] * k + e * (1 - k);
      out.push(e);
    }
    return out;
  },
  rsi(c, n = 14) {
    const out = new Array(c.length).fill(null);
    if (c.length <= n) return out;
    let g = 0, l = 0;
    for (let i = 1; i <= n; i++) { const d = c[i] - c[i - 1]; if (d >= 0) g += d; else l -= d; }
    g /= n; l /= n;
    out[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    for (let i = n + 1; i < c.length; i++) {
      const d = c[i] - c[i - 1];
      g = (g * (n - 1) + (d > 0 ? d : 0)) / n;
      l = (l * (n - 1) + (d < 0 ? -d : 0)) / n;
      out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    }
    return out;
  },
  macd(c, f = 12, s = 26, sg = 9) {
    const ef = this.ema(c, f), es = this.ema(c, s);
    const line = c.map((_, i) => (ef[i] != null && es[i] != null) ? ef[i] - es[i] : null);
    const valid = line.filter(v => v != null);
    const sv = this.ema(valid, sg);
    const signal = new Array(c.length).fill(null);
    let j = 0;
    for (let i = 0; i < c.length; i++) if (line[i] != null) signal[i] = sv[j++];
    const hist = line.map((v, i) => (v != null && signal[i] != null) ? v - signal[i] : null);
    return { line, signal, hist };
  },
  boll(c, n = 20, m = 2) {
    const mid = this.sma(c, n), up = [], lo = [];
    for (let i = 0; i < c.length; i++) {
      if (mid[i] == null) { up.push(null); lo.push(null); continue; }
      let v = 0;
      for (let j = i - n + 1; j <= i; j++) v += (c[j] - mid[i]) ** 2;
      const sd = Math.sqrt(v / n);
      up.push(mid[i] + m * sd); lo.push(mid[i] - m * sd);
    }
    return { mid, up, lo };
  },
  stoch(h, l, c, n = 14, d = 3) {
    const k = [];
    for (let i = 0; i < c.length; i++) {
      if (i < n - 1) { k.push(null); continue; }
      const hh = Math.max(...h.slice(i - n + 1, i + 1));
      const ll = Math.min(...l.slice(i - n + 1, i + 1));
      k.push(hh === ll ? 50 : (c[i] - ll) / (hh - ll) * 100);
    }
    const dd = this.sma(k.map(v => v == null ? 0 : v), d)
      .map((v, i) => (k[i] == null || i < n - 1 + d - 1) ? null : v);
    return { k, d: dd };
  },
  atr(h, l, c, n = 14) {
    const tr = [];
    for (let i = 0; i < c.length; i++) {
      tr.push(i === 0 ? h[i] - l[i]
        : Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])));
    }
    const out = new Array(c.length).fill(null);
    if (c.length <= n) return out;
    let a = tr.slice(1, n + 1).reduce((x, y) => x + y, 0) / n;
    out[n] = a;
    for (let i = n + 1; i < c.length; i++) { a = (a * (n - 1) + tr[i]) / n; out[i] = a; }
    return out;
  },
  pivots(h, l, c) {
    const p = (h + l + c) / 3;
    return { R2: p + (h - l), R1: 2 * p - l, P: p, S1: 2 * p - h, S2: p - (h - l) };
  },
  last(a) { for (let i = a.length - 1; i >= 0; i--) if (a[i] != null) return a[i]; return null; }
};
if (typeof module !== 'undefined') module.exports = Ind;
