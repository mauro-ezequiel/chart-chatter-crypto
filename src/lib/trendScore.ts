import type { Candle, Interval } from "./binance";
import { bollinger, ema, rsi, supertrend, vwap, type Zone } from "./indicators";

export type Whales = { buy: number; sell: number; count: number };
export type ZoneVol = Zone & { buy: number; sell: number };

export const HIGHER_TF: Record<Interval, Interval[]> = {
  "1m": ["5m", "15m"],
  "5m": ["15m", "1h"],
  "15m": ["1h", "4h"],
  "30m": ["2h", "4h"],
  "1h": ["4h", "1d"],
  "2h": ["4h", "1d"],
  "4h": ["1d", "1w"],
  "1d": ["1w"],
  "1w": [],
};

const clamp = (n: number) => Math.max(-1, Math.min(1, n));

// Lectura técnica de una temporalidad: -1 (bajista) a +1 (alcista)
export function technical(c: Candle[]): number | null {
  if (c.length < 60) return null;
  const close = c.at(-1)!.close;
  const e9 = ema(c, 9).at(-1)!.value, e21 = ema(c, 21).at(-1)!.value, e50 = ema(c, 50).at(-1)!.value;
  const st = supertrend(c, 10, 3).at(-1)!;
  const mid = bollinger(c, 20, 2).mid.at(-1)!.value;
  const r = rsi(c, 14).at(-1)!.value;
  const vw = vwap(c).at(-1)!.value;
  const votes = [
    e9 > e21 ? 1 : -1,
    e21 > e50 ? 1 : -1,
    close > e21 ? 1 : -1,
    st.up ? 1 : -1,
    close > mid ? 1 : -1,
    r > 55 ? 1 : r < 45 ? -1 : 0,
    close > vw ? 1 : -1,
  ];
  return votes.reduce((a, b) => a + b, 0) / votes.length;
}

// Zonas: flujo neto de compra/venta en zonas activas, más peso a las cercanas al precio
export function zoneScore(zs: ZoneVol[], price: number): number | null {
  if (!zs.length || !price) return null;
  let s = 0, w = 0;
  for (const z of zs) {
    const tot = z.buy + z.sell;
    if (!tot) continue;
    const mid = (z.top + z.bottom) / 2;
    const near = 1 / (1 + Math.abs(price - mid) / price * 100);
    const inside = price >= z.bottom && price <= z.top ? 1.5 : 1;
    const flow = (z.buy - z.sell) / tot;
    const side = z.long ? 0.5 : -0.5; // zona de demanda debajo apoya subida
    s += (flow + side) * near * inside; w += near * inside;
  }
  return w ? clamp(s / w) : null;
}

export function whaleScore(wh: Whales): number | null {
  const tot = wh.buy + wh.sell;
  if (wh.count < 3 || !tot) return null;
  return clamp(((wh.buy - wh.sell) / tot) * 1.5);
}

export type Factor = { label: string; value: number | null; weight: number };

export function combine(factors: Factor[]) {
  const ok = factors.filter((f) => f.value !== null);
  const w = ok.reduce((a, f) => a + f.weight, 0);
  // exige la lectura técnica + al menos otro factor para decidir
  if (ok.length < 2 || w < 0.5) return null;
  return ok.reduce((a, f) => a + f.value! * f.weight, 0) / w;
}
