import { useEffect, useRef, useState } from "react";
import { connectLiquidations, type Liq } from "@/lib/liquidations";
import { formatPrice } from "@/lib/binance";

const COLS = 60, ROWS = 55;
type Depth = { bids: [string, string][]; asks: [string, string][] };
type Snapshot = { bids: [number, number][]; asks: [number, number][] };
const fmt = (n: number) => new Intl.NumberFormat("es-ES", { notation: "compact", maximumFractionDigits: 1 }).format(n);

export function LiquidationHeatmap({ symbol, lastPrice }: { symbol: string; lastPrice: number }) {
  const cvRef = useRef<HTMLCanvasElement>(null);
  const liqs = useRef<Liq[]>([]);
  const depth = useRef<Snapshot[]>([]);
  const range = useRef(0.004);
  const priceRef = useRef(lastPrice);
  priceRef.current = lastPrice;
  const [recent, setRecent] = useState<Liq[]>([]);
  const [tot, setTot] = useState({ l: 0, s: 0 });
  const [depthState, setDepthState] = useState("Cargando liquidez…");

  useEffect(() => {
    liqs.current = []; depth.current = []; range.current = 0.004;
    setRecent([]); setTot({ l: 0, s: 0 });
    setDepthState(symbol.endsWith("USDT") ? "Cargando liquidez…" : "Liquidez de futuros disponible en pares USDT");
    if (!symbol.endsWith("USDT")) return;
    let stopped = false;
    const loadDepth = async () => {
      try {
        const response = await fetch(`https://fapi.binance.com/fapi/v1/depth?symbol=${encodeURIComponent(symbol)}&limit=500`);
        if (!response.ok) throw new Error("No disponible");
        const data = await response.json() as Depth;
        if (stopped) return;
        const bids = data.bids.map(([p, q]) => [Number(p), Number(p) * Number(q)] as [number, number]).filter(([p, v]) => p > 0 && v > 0);
        const asks = data.asks.map(([p, q]) => [Number(p), Number(p) * Number(q)] as [number, number]).filter(([p, v]) => p > 0 && v > 0);
        if (!bids.length || !asks.length) throw new Error("Sin órdenes");
        const mid = ((bids[0]?.[0] ?? 0) + (asks[0]?.[0] ?? 0)) / 2;
        const span = Math.max((mid - (bids.at(-1)?.[0] ?? mid)) / mid, ((asks.at(-1)?.[0] ?? mid) - mid) / mid);
        range.current = Math.max(0.001, Math.min(0.02, span * 1.5));
        depth.current = [...depth.current.slice(-(COLS - 1)), { bids, asks }];
        setDepthState("Liquidez de órdenes · Binance Futuros · actualización cada 10 s");
      } catch {
        if (!stopped) setDepthState("No se pudo cargar la liquidez de este par");
      }
    };
    void loadDepth();
    const poll = window.setInterval(loadDepth, 10000);
    const stop = connectLiquidations(symbol, (l) => {
      liqs.current.push(l);
      setRecent((r) => [l, ...r].slice(0, 12));
      setTot((t) => (l.long ? { ...t, l: t.l + l.usd } : { ...t, s: t.s + l.usd }));
    });
    return () => { stopped = true; clearInterval(poll); stop(); };
  }, [symbol]);

  useEffect(() => {
    let timer = 0;
    const draw = () => {
      timer = window.setTimeout(draw, 250);
      const cv = cvRef.current; if (!cv) return;
      const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
      if (!W || !H) return;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
        cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      }
      const ctx = cv.getContext("2d"); if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const style = getComputedStyle(cv);
      const bg = style.getPropertyValue("--background").trim();
      const muted = style.getPropertyValue("--muted-foreground").trim();
      const bull = style.getPropertyValue("--bull").trim();
      const bear = style.getPropertyValue("--bear").trim();
      const accent = style.getPropertyValue("--primary").trim();
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = muted; ctx.globalAlpha = 0.16; ctx.lineWidth = 1;
      for (let i = 1; i < 5; i++) {
        ctx.beginPath(); ctx.moveTo(0, (H * i) / 5); ctx.lineTo(W - 60, (H * i) / 5); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      const P = priceRef.current; if (!P) {
        ctx.fillStyle = muted; ctx.font = "12px sans-serif";
        ctx.fillText("Esperando precio…", 12, 20);
        return;
      }
      const now = Date.now(), start = now - 10 * 60 * 1000;
      liqs.current = liqs.current.filter((l) => l.time >= start);
      const lo = P * (1 - range.current), hi = P * (1 + range.current);
      const plotW = W - 62;
      const rh = H / ROWS;
      const rows = depth.current.map((snap) => {
        const amounts = Array.from({ length: ROWS }, () => ({ bid: 0, ask: 0 }));
        for (const [price, usd] of snap.bids) {
          const row = Math.floor(((hi - price) / (hi - lo)) * ROWS);
          const cell = amounts[row];
          if (cell) cell.bid += usd;
        }
        for (const [price, usd] of snap.asks) {
          const row = Math.floor(((hi - price) / (hi - lo)) * ROWS);
          const cell = amounts[row];
          if (cell) cell.ask += usd;
        }
        return amounts;
      });
      const maxDepth = Math.max(1, ...rows.flatMap((r) => r.map((a) => Math.max(a.bid, a.ask))));
      // La última captura ocupa todo el gráfico al abrirlo; las siguientes muestran su evolución.
      for (let col = 0; col < COLS; col++) {
        const snapshot = rows[Math.max(0, rows.length - COLS + col)] ?? rows.at(-1);
        if (!snapshot) break;
        for (let row = 0; row < ROWS; row++) {
          const cell = snapshot[row];
          if (!cell) continue;
          const usd = Math.max(cell.bid, cell.ask);
          if (usd <= 0) continue;
          ctx.fillStyle = cell.bid >= cell.ask ? bull : bear;
          ctx.globalAlpha = 0.12 + 0.8 * Math.sqrt(usd / maxDepth);
          ctx.fillRect(col * plotW / COLS, row * rh, plotW / COLS + 1, rh + 1);
        }
      }
      ctx.globalAlpha = 1;
      const grid = new Map<number, number>(); let max = 0;
      for (const l of liqs.current) {
        if (l.price < lo || l.price > hi) continue;
        const c = Math.floor(((l.time - start) / (now - start)) * COLS), r = Math.floor(((hi - l.price) / (hi - lo)) * ROWS);
        if (c < 0 || c >= COLS || r < 0 || r >= ROWS) continue;
        const k = c * ROWS + r, v = (grid.get(k) ?? 0) + l.usd;
        grid.set(k, v); if (v > max) max = v;
      }
      const cw = plotW / COLS;
      for (const [k, v] of grid) {
        const c = Math.floor(k / ROWS), r = k % ROWS, a = Math.sqrt(v / max);
        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.6 + a * 0.4;
        ctx.fillRect(c * cw, r * rh, Math.max(cw, 4), Math.max(rh, 4));
      }
      ctx.globalAlpha = 1;
      const yP = ((hi - P) / (hi - lo)) * H;
      ctx.strokeStyle = accent; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(0, yP); ctx.lineTo(plotW, yP); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = muted; ctx.font = "10px sans-serif";
      for (let i = 0; i <= 4; i++) ctx.fillText(formatPrice(hi - ((hi - lo) * i) / 4), W - 56, (H * i) / 4 + (i === 0 ? 10 : i === 4 ? -2 : 4));
    };
    draw();
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className="mb-2 flex flex-wrap items-baseline gap-3">
        <h2 className="text-sm font-semibold">Mapa de calor de liquidez y liquidaciones</h2>
        <span className="text-[11px] text-muted-foreground">Órdenes: Binance Futuros · liquidaciones: Binance y Bybit</span>
        <span className="ml-auto text-[11px] tabular-nums">
          <span className="text-[#16c784]">Longs liq. ${fmt(tot.l)}</span> · <span className="text-[#ea3943]">Shorts liq. ${fmt(tot.s)}</span>
        </span>
      </div>
      <canvas ref={cvRef} className="h-[260px] w-full rounded-lg border border-border" />
      <p className="mt-2 text-[11px] text-muted-foreground"><span className="text-bull">Verde: compras</span> · <span className="text-bear">Rojo: ventas</span> · <span className="text-primary">Amarillo: liquidaciones confirmadas</span> · {depthState}</p>
      <div className="mt-2 max-h-40 space-y-0.5 overflow-auto text-[11px] tabular-nums">
        {!symbol.endsWith("USDT") && <p className="text-muted-foreground">Solo disponible para pares USDT.</p>}
        {recent.length === 0 && symbol.endsWith("USDT") && <p className="text-muted-foreground">Sin liquidaciones confirmadas aún; las órdenes de liquidez no son liquidaciones.</p>}
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
