export type Liq = { ex: string; price: number; usd: number; long: boolean; time: number };

// Liquidaciones en vivo (Binance Futuros + Bybit). long=true => se liquidó una posición long.
export function connectLiquidations(symbol: string, onLiq: (l: Liq) => void) {
  const socks: WebSocket[] = [];
  const timers: number[] = [];
  if (!symbol.endsWith("USDT")) return () => {};
  const b = new WebSocket(`wss://fstream.binance.com/ws/${symbol.toLowerCase()}@forceOrder`);
  b.onmessage = (e) => {
    try {
      const o = JSON.parse(e.data).o;
      const p = +(o.ap || o.p), q = +(o.z || o.q);
      onLiq({ ex: "Binance", price: p, usd: p * q, long: o.S === "SELL", time: Date.now() });
    } catch { /* */ }
  };
  socks.push(b);
  const y = new WebSocket("wss://stream.bybit.com/v5/public/linear");
  y.onopen = () => {
    y.send(JSON.stringify({ op: "subscribe", args: [`allLiquidation.${symbol}`] }));
    timers.push(window.setInterval(() => y.readyState === 1 && y.send(JSON.stringify({ op: "ping" })), 20000));
  };
  y.onmessage = (e) => {
    try {
      const d = JSON.parse(e.data);
      if (Array.isArray(d.data)) for (const t of d.data)
        onLiq({ ex: "Bybit", price: +t.p, usd: +t.p * +t.v, long: t.S === "Buy", time: Date.now() });
    } catch { /* */ }
  };
  socks.push(y);
  return () => { timers.forEach(clearInterval); socks.forEach((s) => s.close()); };
}
