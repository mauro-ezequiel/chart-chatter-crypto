import type { Candle } from "./binance";

export type Pt = { time: number; value: number };

export function ema(c: Candle[], p: number): Pt[] {
  const k = 2 / (p + 1);
  const out: Pt[] = [];
  let prev = 0;
  c.forEach((x, i) => {
    prev = i === 0 ? x.close : x.close * k + prev * (1 - k);
    if (i >= p - 1) out.push({ time: x.time, value: prev });
  });
  return out;
}

// VWAP con reinicio diario (sesión UTC) — ideal intradía
export function vwap(c: Candle[]): Pt[] {
  let day = -1, pv = 0, v = 0;
  return c.map((x) => {
    const d = Math.floor(x.time / 86400);
    if (d !== day) { day = d; pv = 0; v = 0; }
    const tp = (x.high + x.low + x.close) / 3;
    pv += tp * x.volume; v += x.volume;
    return { time: x.time, value: v ? pv / v : tp };
  });
}

export function bollinger(c: Candle[], p = 20, m = 2) {
  const up: Pt[] = [], mid: Pt[] = [], lo: Pt[] = [];
  for (let i = p - 1; i < c.length; i++) {
    const s = c.slice(i - p + 1, i + 1).map((x) => x.close);
    const mean = s.reduce((a, b) => a + b, 0) / p;
    const sd = Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / p);
    const t = c[i].time;
    up.push({ time: t, value: mean + m * sd });
    mid.push({ time: t, value: mean });
    lo.push({ time: t, value: mean - m * sd });
  }
  return { up, mid, lo };
}

export function rsi(c: Candle[], p = 14): Pt[] {
  const out: Pt[] = [];
  let g = 0, l = 0;
  for (let i = 1; i < c.length; i++) {
    const d = c[i].close - c[i - 1].close;
    const up = Math.max(d, 0), dn = Math.max(-d, 0);
    if (i <= p) { g += up / p; l += dn / p; }
    else { g = (g * (p - 1) + up) / p; l = (l * (p - 1) + dn) / p; }
    if (i >= p) out.push({ time: c[i].time, value: l === 0 ? 100 : 100 - 100 / (1 + g / l) });
  }
  return out;
}

// Supertrend (10, 3) — seguidor de tendencia rápido para intradía
export function supertrend(c: Candle[], p = 10, m = 3) {
  const res: { time: number; value: number; up: boolean }[] = [];
  let atr = 0, fu = 0, fl = 0, trendUp = true;
  for (let i = 0; i < c.length; i++) {
    const x = c[i];
    const tr = i === 0 ? x.high - x.low : Math.max(x.high - x.low, Math.abs(x.high - c[i - 1].close), Math.abs(x.low - c[i - 1].close));
    atr = i < p ? (atr * i + tr) / (i + 1) : (atr * (p - 1) + tr) / p;
    const hl2 = (x.high + x.low) / 2;
    const bu = hl2 + m * atr, bl = hl2 - m * atr;
    const pc = i ? c[i - 1].close : x.close;
    fu = i === 0 || bu < fu || pc > fu ? bu : fu;
    fl = i === 0 || bl > fl || pc < fl ? bl : fl;
    if (trendUp && x.close < fl) trendUp = false;
    else if (!trendUp && x.close > fu) trendUp = true;
    if (i >= p) res.push({ time: x.time, value: trendUp ? fl : fu, up: trendUp });
  }
  return res;
}

export type Zone = { from: number; top: number; bottom: number; long: boolean; to: number | null };

// Zonas de oferta/demanda: vela base + impulso fuerte. Se invalidan al cerrar al otro lado.
export function zones(c: Candle[], max = 8): Zone[] {
  const found: Zone[] = [];
  const avg = (i: number) => {
    const s = c.slice(Math.max(0, i - 20), i);
    return s.reduce((a, x) => a + Math.abs(x.close - x.open), 0) / (s.length || 1);
  };
  for (let i = 21; i < c.length - 1; i++) {
    const base = c[i], imp = c[i + 1];
    const body = Math.abs(imp.close - imp.open);
    if (body < avg(i) * 2 || Math.abs(base.close - base.open) > body * 0.5) continue;
    const long = imp.close > imp.open;
    const z: Zone = { from: base.time, top: Math.max(base.high, base.open, base.close), bottom: base.low, long, to: null };
    if (!long) { z.top = base.high; z.bottom = Math.min(base.low, base.open, base.close); }
    for (let j = i + 2; j < c.length; j++) {
      if ((long && c[j].close < z.bottom) || (!long && c[j].close > z.top)) { z.to = c[j].time; break; }
    }
    if (z.to === null) found.push(z);
  }
  return found.slice(-max);
}

export type VP = { rows: { price: number; low: number; high: number; buy: number; sell: number }[]; poc: number; vah: number; val: number; max: number };

export function volumeProfile(c: Candle[], rowsN = 24): VP | null {
  if (c.length < 2) return null;
  const hi = Math.max(...c.map((x) => x.high)), lo = Math.min(...c.map((x) => x.low));
  const step = (hi - lo) / rowsN || 1;
  const rows = Array.from({ length: rowsN }, (_, i) => ({ low: lo + i * step, high: lo + (i + 1) * step, price: lo + (i + 0.5) * step, buy: 0, sell: 0 }));
  for (const x of c) {
    const a = Math.max(0, Math.floor((x.low - lo) / step)), b = Math.min(rowsN - 1, Math.floor((x.high - lo) / step));
    const share = x.volume / (b - a + 1);
    for (let r = a; r <= b; r++) (x.close >= x.open ? (rows[r].buy += share) : (rows[r].sell += share));
  }
  const tot = rows.map((r) => r.buy + r.sell);
  let pi = tot.indexOf(Math.max(...tot));
  const all = tot.reduce((a, b) => a + b, 0);
  let lI = pi, hI = pi, acc = tot[pi];
  while (acc < all * 0.7 && (lI > 0 || hI < rowsN - 1)) {
    const dn = lI > 0 ? tot[lI - 1] : -1, up = hI < rowsN - 1 ? tot[hI + 1] : -1;
    if (up >= dn) acc += tot[++hI]; else acc += tot[--lI];
  }
  return { rows, poc: rows[pi].price, vah: rows[hI].high, val: rows[lI].low, max: tot[pi] };
}
