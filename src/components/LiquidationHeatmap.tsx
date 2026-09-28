import { useEffect, useRef, useState } from "react";
import { connectLiquidations, type Liq } from "@/lib/liquidations";
import { formatPrice } from "@/lib/binance";

const COLS = 120, COL_MS = 5000, ROWS = 50, RANGE = 0.02;
const fmt = (n: number) => new Intl.NumberFormat("es-ES", { notation: "compact", maximumFractionDigits: 1 }).format(n);

export function LiquidationHeatmap({ symbol, lastPrice }: { symbol: string; lastPrice: number }) {
  const cvRef = useRef<HTMLCanvasElement>(null);
  const liqs = useRef<Liq[]>([]);
  const priceRef = useRef(lastPrice);
  priceRef.current = lastPrice;
  const [recent, setRecent] = useState<Liq[]>([]);
  const [tot, setTot] = useState({ l: 0, s: 0 });

  useEffect(() => {
    liqs.current = []; setRecent([]); setTot({ l: 0, s: 0 });
    const stop = connectLiquidations(symbol, (l) => {
      liqs.current.push(l);
      setRecent((r) => [l, ...r].slice(0, 12));
      setTot((t) => (l.long ? { ...t, l: t.l + l.usd } : { ...t, s: t.s + l.usd }));
    });
    return stop;
  }, [symbol]);

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const cv = cvRef.current; if (!cv) return;
      const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
      if (!W || !H) return;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
        cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      }
      const ctx = cv.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#111827"; ctx.fillRect(0, 0, W, H);
      // rejilla de fondo para que el mapa sea visible aunque no haya datos
      ctx.strokeStyle = "rgba(148,163,184,0.12)"; ctx.lineWidth = 1;
      for (let i = 1; i < 5; i++) {
        ctx.beginPath(); ctx.moveTo(0, (H * i) / 5); ctx.lineTo(W - 60, (H * i) / 5); ctx.stroke();
      }
      const P = priceRef.current; if (!P) {
        ctx.fillStyle = "rgba(226,232,240,0.6)"; ctx.font = "12px sans-serif";
        ctx.fillText("Esperando precio…", 12, 20);
        return;
      }
      const now = Date.now(), start = now - COLS * COL_MS;
      liqs.current = liqs.current.filter((l) => l.time >= start);
      const lo = P * (1 - RANGE), hi = P * (1 + RANGE);
      const grid = new Map<number, number>(); let max = 0;
      for (const l of liqs.current) {
        if (l.price < lo || l.price > hi) continue;
        const c = Math.floor((l.time - start) / COL_MS), r = Math.floor(((hi - l.price) / (hi - lo)) * ROWS);
        const k = c * ROWS + r, v = (grid.get(k) ?? 0) + l.usd;
        grid.set(k, v); if (v > max) max = v;
      }
      const cw = (W - 60) / COLS, rh = H / ROWS;
      for (const [k, v] of grid) {
        const c = Math.floor(k / ROWS), r = k % ROWS, a = Math.sqrt(v / max);
        ctx.fillStyle = `hsl(${60 - a * 60} 100% ${25 + a * 35}%)`;
        ctx.globalAlpha = 0.35 + a * 0.65;
        ctx.fillRect(c * cw, r * rh, Math.max(cw, 3), Math.max(rh, 3));
      }
      ctx.globalAlpha = 1;
      const yP = ((hi - P) / (hi - lo)) * H;
      ctx.strokeStyle = "#f5c542"; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(0, yP); ctx.lineTo(W - 60, yP); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = "rgba(226,232,240,0.7)"; ctx.font = "10px sans-serif";
      for (let i = 0; i <= 4; i++) ctx.fillText(formatPrice(hi - ((hi - lo) * i) / 4), W - 56, (H * i) / 4 + (i === 0 ? 10 : i === 4 ? -2 : 4));
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className="mb-2 flex flex-wrap items-baseline gap-3">
        <h2 className="text-sm font-semibold">Mapa de calor de liquidaciones en vivo</h2>
        <span className="text-[11px] text-muted-foreground">Binance Futuros + Bybit · últimos 10 min · ±2% del precio</span>
        <span className="ml-auto text-[11px] tabular-nums">
          <span className="text-[#16c784]">Longs liq. ${fmt(tot.l)}</span> · <span className="text-[#ea3943]">Shorts liq. ${fmt(tot.s)}</span>
        </span>
      </div>
      <canvas ref={cvRef} className="h-[260px] w-full rounded-lg border border-border" />
      <div className="mt-2 max-h-40 space-y-0.5 overflow-auto text-[11px] tabular-nums">
        {!symbol.endsWith("USDT") && <p className="text-muted-foreground">Solo disponible para pares USDT.</p>}
        {recent.length === 0 && symbol.endsWith("USDT") && <p className="text-muted-foreground">Esperando liquidaciones… (pueden tardar según el movimiento del mercado)</p>}
        {recent.map((l, i) => (
          <div key={i} className="flex justify-between">
            <span className={l.long ? "text-[#16c784]" : "text-[#ea3943]"}>{l.long ? "Long liquidado" : "Short liquidado"} · {l.ex}</span>
            <span>{formatPrice(l.price)} · ${fmt(l.usd)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
