export type Trade = { ex: string; price: number; qty: number; buy: boolean };
export type ExStatus = Record<string, { on: boolean; buy: number; sell: number }>;

// Conecta a los trades en vivo de varias plataformas y clasifica cada operación
// como compra agresiva (long) o venta agresiva (short).
export function connectTrades(symbol: string, onTrade: (t: Trade) => void, onStatus: (ex: string, on: boolean) => void) {
  const sockets: WebSocket[] = [];
  const timers: number[] = [];
  const usdt = symbol.endsWith("USDT");
  const base = usdt ? symbol.slice(0, -4) : "";
  const open = (ex: string, url: string, onOpen: (ws: WebSocket) => void, onMsg: (d: any, ws: WebSocket) => void, gzip = false) => {
    try {
      const ws = new WebSocket(url);
      if (gzip) ws.binaryType = "blob";
      ws.onopen = () => { onStatus(ex, true); onOpen(ws); };
      ws.onclose = () => onStatus(ex, false);
      ws.onerror = () => onStatus(ex, false);
      ws.onmessage = async (ev) => {
        try {
          let txt: string;
          if (typeof ev.data === "string") txt = ev.data;
          else {
            const s = (ev.data as Blob).stream().pipeThrough(new DecompressionStream("gzip"));
            txt = await new Response(s).text();
          }
          if (txt === "Ping") { ws.send("Pong"); return; }
          if (txt === "pong") return;
          onMsg(JSON.parse(txt), ws);
        } catch { /* ignorar */ }
      };
      sockets.push(ws);
    } catch { onStatus(ex, false); }
  };
  const s = symbol.toLowerCase();

  open("Binance", `wss://stream.binance.com:9443/ws/${s}@aggTrade`, () => {}, (d) => {
    if (d.p) onTrade({ ex: "Binance", price: +d.p, qty: +d.q, buy: !d.m });
  });

  if (usdt) {
    open("Binance Futuros", `wss://fstream.binance.com/ws/${s}@aggTrade`, () => {}, (d) => {
      if (d.p) onTrade({ ex: "Binance Futuros", price: +d.p, qty: +d.q, buy: !d.m });
    });
    open("BingX", "wss://open-api-swap.bingx.com/swap-market", (ws) => {
      ws.send(JSON.stringify({ id: "1", reqType: "sub", dataType: `${base}-USDT@trade` }));
    }, (d) => {
      if (Array.isArray(d.data)) for (const t of d.data) onTrade({ ex: "BingX", price: +t.p, qty: +t.q, buy: !t.m });
    }, true);
    open("Bybit", "wss://stream.bybit.com/v5/public/linear", (ws) => {
      ws.send(JSON.stringify({ op: "subscribe", args: [`publicTrade.${symbol}`] }));
      timers.push(window.setInterval(() => ws.readyState === 1 && ws.send(JSON.stringify({ op: "ping" })), 20000));
    }, (d) => {
      if (Array.isArray(d.data)) for (const t of d.data) onTrade({ ex: "Bybit", price: +t.p, qty: +t.v, buy: t.S === "Buy" });
    });
    open("OKX", "wss://ws.okx.com:8443/ws/v5/public", (ws) => {
      ws.send(JSON.stringify({ op: "subscribe", args: [{ channel: "trades", instId: `${base}-USDT` }] }));
      timers.push(window.setInterval(() => ws.readyState === 1 && ws.send("ping"), 20000));
    }, (d) => {
      if (Array.isArray(d.data)) for (const t of d.data) onTrade({ ex: "OKX", price: +t.px, qty: +t.sz, buy: t.side === "buy" });
    });
  }

  return () => { timers.forEach(clearInterval); sockets.forEach((w) => { w.onclose = null; w.close(); }); };
}
