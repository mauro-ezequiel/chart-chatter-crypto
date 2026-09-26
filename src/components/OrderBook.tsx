import { useEffect, useState } from "react";
import { BINANCE_WS, formatPrice, type DepthLevel } from "@/lib/binance";

type Props = { symbol: string; lastPrice: number };

function parseLevels(raw: [string, string][]): DepthLevel[] {
  return raw
    .map(([p, q]) => ({ price: Number(p), qty: Number(q) }))
    .filter((l) => l.qty > 0);
}

export function OrderBook({ symbol, lastPrice }: Props) {
  const [bids, setBids] = useState<DepthLevel[]>([]);
  const [asks, setAsks] = useState<DepthLevel[]>([]);

  useEffect(() => {
    setBids([]);
    setAsks([]);
    const ws = new WebSocket(
      `${BINANCE_WS}${symbol.toLowerCase()}@depth20@1000ms`,
    );
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data as string);
      const d = msg?.data;
      if (!d) return;
      setBids(parseLevels(d.bids).slice(0, 12));
      setAsks(parseLevels(d.asks).slice(0, 12));
    };
    return () => ws.close();
  }, [symbol]);

  const maxQty = Math.max(
    ...bids.map((b) => b.qty),
    ...asks.map((a) => a.qty),
    0.000001,
  );
  const bestBid = bids[0]?.price ?? 0;
  const bestAsk = asks[0]?.price ?? 0;
  const spread = bestAsk && bestBid ? bestAsk - bestBid : 0;
  const spreadPct = bestBid ? (spread / bestBid) * 100 : 0;

  const Row = ({
    level,
    side,
  }: {
    level: DepthLevel;
    side: "bid" | "ask";
  }) => {
    const pct = (level.qty / maxQty) * 100;
    const isHere =
      lastPrice > 0 &&
      ((side === "bid" && level.price === bestBid) ||
        (side === "ask" && level.price === bestAsk));
    return (
      <div className="relative flex items-center justify-between px-2 py-[3px] text-xs tabular-nums">
        <div
          className={
            side === "bid"
              ? "absolute inset-y-0 right-0 bg-bull/15"
              : "absolute inset-y-0 right-0 bg-bear/15"
          }
          style={{ width: `${pct}%` }}
        />
        <span
          className={
            side === "bid"
              ? "relative font-medium text-bull"
              : "relative font-medium text-bear"
          }
        >
          {formatPrice(level.price)}
          {isHere && <span className="ml-1 text-[9px] opacity-70">◄</span>}
        </span>
        <span className="relative text-muted-foreground">
          {level.qty.toLocaleString("es-ES", { maximumFractionDigits: 4 })}
        </span>
      </div>
    );
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">Órdenes en vivo</h3>
        <span className="text-[11px] text-muted-foreground">
          Precio / Cantidad
        </span>
      </div>

      <div className="flex flex-col-reverse">
        {asks.map((a) => (
          <Row key={`a${a.price}`} level={a} side="ask" />
        ))}
      </div>

      <div className="my-1.5 flex items-center justify-between rounded-lg bg-secondary px-2 py-1.5">
        <span className="text-sm font-bold tabular-nums">
          {formatPrice(lastPrice)}
        </span>
        <span className="text-[11px] text-muted-foreground">
          spread {formatPrice(spread)} ({spreadPct.toFixed(3)}%)
        </span>
      </div>

      <div>
        {bids.map((b) => (
          <Row key={`b${b.price}`} level={b} side="bid" />
        ))}
      </div>

      {bids.length === 0 && (
        <p className="py-6 text-center text-xs text-muted-foreground">
          Conectando con el libro de órdenes…
        </p>
      )}
    </div>
  );
}
