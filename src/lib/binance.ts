export const BINANCE_REST = "https://api.binance.com/api/v3";
export const BINANCE_WS = "wss://stream.binance.com:9443/stream?streams=";

export type Market = {
  symbol: string;
  base: string;
  quote: string;
  price: number;
  changePct: number;
  quoteVolume: number;
};

export type Candle = {
  time: number; // seconds
  open: number;
  high: number;
  low: number;
  close: number;
};

export type DepthLevel = { price: number; qty: number };

export const INTERVALS = [
  "1m",
  "5m",
  "15m",
  "1h",
  "4h",
  "1d",
  "1w",
] as const;
export type Interval = (typeof INTERVALS)[number];

type RawTicker = {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  quoteVolume: string;
};

export async function fetchMarkets(): Promise<Market[]> {
  const res = await fetch(`${BINANCE_REST}/ticker/24hr`);
  if (!res.ok) throw new Error("No se pudo cargar la lista de criptomonedas");
  const data = (await res.json()) as RawTicker[];
  const quotes = ["USDT", "FDUSD", "BTC", "ETH", "EUR"];
  return data
    .map((t) => {
      const quote = quotes.find((q) => t.symbol.endsWith(q));
      if (!quote) return null;
      const base = t.symbol.slice(0, -quote.length);
      if (!base) return null;
      return {
        symbol: t.symbol,
        base,
        quote,
        price: Number(t.lastPrice),
        changePct: Number(t.priceChangePercent),
        quoteVolume: Number(t.quoteVolume),
      } satisfies Market;
    })
    .filter((m): m is Market => m !== null && m.price > 0)
    .sort((a, b) => b.quoteVolume - a.quoteVolume);
}

export async function fetchCandles(
  symbol: string,
  interval: Interval,
): Promise<Candle[]> {
  const res = await fetch(
    `${BINANCE_REST}/klines?symbol=${symbol}&interval=${interval}&limit=1000`,
  );
  if (!res.ok) throw new Error("No se pudo cargar el gráfico");
  const rows = (await res.json()) as (string | number)[][];
  return rows.map((r) => ({
    time: Math.floor(Number(r[0]) / 1000),
    open: Number(r[1]),
    high: Number(r[2]),
    low: Number(r[3]),
    close: Number(r[4]),
  }));
}

export function formatPrice(n: number) {
  if (!isFinite(n)) return "—";
  const digits = n >= 1000 ? 2 : n >= 1 ? 4 : n >= 0.01 ? 6 : 8;
  return n.toLocaleString("es-ES", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatCompact(n: number) {
  if (!isFinite(n)) return "—";
  return new Intl.NumberFormat("es-ES", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}
