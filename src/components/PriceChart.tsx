import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type SeriesType,
  type UTCTimestamp,
} from "lightweight-charts";
import {
  BINANCE_WS,
  fetchCandles,
  INTERVALS,
  type Candle,
  type Interval,
} from "@/lib/binance";
import {
  bollinger,
  ema,
  rsi,
  supertrend,
  volumeProfile,
  vwap,
  zones,
  type Pt,
} from "@/lib/indicators";
import { cn } from "@/lib/utils";

type Props = {
  symbol: string;
  interval: Interval;
  onIntervalChange: (i: Interval) => void;
  onPrice: (p: number) => void;
};

const IND = [
  { id: "vp", label: "Perfil de volumen (rango)" },
  { id: "zones", label: "Zonas Long/Short" },
  { id: "ema", label: "EMA 9/21/50" },
  { id: "vwap", label: "VWAP diario" },
  { id: "st", label: "Supertrend 10·3" },
  { id: "bb", label: "Bollinger 20·2" },
  { id: "rsi", label: "RSI 14" },
] as const;
type IndId = (typeof IND)[number]["id"];

const t = (p: Pt[]) => p.map((x) => ({ time: x.time as UTCTimestamp, value: x.value }));

export function PriceChart({ symbol, interval, onIntervalChange, onPrice }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const indSeries = useRef<ISeriesApi<SeriesType>[]>([]);
  const candlesRef = useRef<Candle[]>([]);
  const [active, setActive] = useState<Set<IndId>>(new Set(["vp", "zones", "ema"]));
  const activeRef = useRef(active);
  activeRef.current = active;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dataVer, setDataVer] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = createChart(el, {
      localization: { locale: "es-ES" },
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "rgba(226,232,240,0.7)",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "rgba(148,163,184,0.08)" },
        horzLines: { color: "rgba(148,163,184,0.08)" },
      },
      rightPriceScale: { borderColor: "rgba(148,163,184,0.15)" },
      timeScale: { borderColor: "rgba(148,163,184,0.15)", timeVisible: true, secondsVisible: false, rightOffset: 8 },
      crosshair: { mode: 0 },
      autoSize: true,
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#16c784",
      downColor: "#ea3943",
      borderVisible: false,
      wickUpColor: "#16c784",
      wickDownColor: "#ea3943",
    });
    chartRef.current = chart;
    seriesRef.current = series;

    // overlay: volume profile + zones
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const cv = canvasRef.current, wrap = containerRef.current;
      if (!cv || !wrap) return;
      const dpr = window.devicePixelRatio || 1;
      const W = wrap.clientWidth, H = wrap.clientHeight;
      if (cv.width !== W * dpr || cv.height !== H * dpr) {
        cv.width = W * dpr; cv.height = H * dpr;
        cv.style.width = W + "px"; cv.style.height = H + "px";
      }
      const ctx = cv.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const candles = candlesRef.current;
      if (!candles.length) return;
      const ts = chart.timeScale();
      const pw = ts.width();
      const ph = chart.panes()[0]?.getHeight() ?? H;
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, pw, ph); ctx.clip();
      const y = (p: number) => series.priceToCoordinate(p);
      const x = (tm: number) => ts.timeToCoordinate(tm as UTCTimestamp);
      const act = activeRef.current;

      if (act.has("zones")) {
        for (const z of zones(candles)) {
          const x1 = x(z.from) ?? 0, y1 = y(z.top), y2 = y(z.bottom);
          if (y1 == null || y2 == null) continue;
          ctx.fillStyle = z.long ? "rgba(22,199,132,0.18)" : "rgba(234,57,67,0.18)";
          ctx.strokeStyle = z.long ? "rgba(22,199,132,0.8)" : "rgba(234,57,67,0.8)";
          ctx.fillRect(x1, y1, pw - x1, y2 - y1);
          ctx.strokeRect(x1, y1, pw - x1, y2 - y1);
          ctx.fillStyle = z.long ? "#16c784" : "#ea3943";
          ctx.font = "bold 10px sans-serif";
          ctx.fillText(z.long ? "LONG" : "SHORT", x1 + 4, Math.min(y1, y2) + 11);
        }
      }

      if (act.has("vp")) {
        const r = ts.getVisibleLogicalRange();
        if (r) {
          const vis = candles.slice(Math.max(0, Math.floor(r.from)), Math.ceil(r.to) + 1);
          const vp = volumeProfile(vis, 30);
          if (vp) {
            const maxW = pw * 0.28;
            for (const row of vp.rows) {
              const yt = y(row.high), yb = y(row.low);
              if (yt == null || yb == null) continue;
              const h = Math.max(1, yb - yt - 1);
              const inVA = row.low >= vp.val - 1e-12 && row.high <= vp.vah + 1e-12;
              const wb = (row.buy / vp.max) * maxW, ws = (row.sell / vp.max) * maxW;
              ctx.fillStyle = inVA ? "rgba(22,199,132,0.45)" : "rgba(22,199,132,0.18)";
              ctx.fillRect(pw - wb - ws, yt, wb, h);
              ctx.fillStyle = inVA ? "rgba(234,57,67,0.45)" : "rgba(234,57,67,0.18)";
              ctx.fillRect(pw - ws, yt, ws, h);
            }
            const line = (p: number, c: string, lbl: string, dash: number[]) => {
              const yy = y(p); if (yy == null) return;
              ctx.setLineDash(dash); ctx.strokeStyle = c; ctx.lineWidth = 1;
              ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(pw, yy); ctx.stroke();
              ctx.setLineDash([]); ctx.fillStyle = c; ctx.font = "bold 10px sans-serif";
              ctx.fillText(lbl, 4, yy - 3);
            };
            line(vp.poc, "#f5c542", "POC", []);
            line(vp.vah, "rgba(148,163,184,0.8)", "VAH", [4, 4]);
            line(vp.val, "rgba(148,163,184,0.8)", "VAL", [4, 4]);
          }
        }
      }
      ctx.restore();
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      indSeries.current = [];
    };
  }, []);

  // line indicators (throttled rebuild)
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    indSeries.current.forEach((s) => { try { chart.removeSeries(s); } catch { /* noop */ } });
    indSeries.current = [];
    const c = candlesRef.current;
    if (!c.length) return;
    const add = (data: Pt[], color: string, width = 1, pane = 0) => {
      const s = chart.addSeries(LineSeries, { color, lineWidth: width as 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, pane);
      s.setData(t(data));
      indSeries.current.push(s);
      return s;
    };
    if (active.has("ema")) { add(ema(c, 9), "#38bdf8"); add(ema(c, 21), "#f59e0b"); add(ema(c, 50), "#a78bfa", 2); }
    if (active.has("vwap")) add(vwap(c), "#f472b6", 2);
    if (active.has("bb")) { const b = bollinger(c); add(b.up, "rgba(148,163,184,0.6)"); add(b.mid, "rgba(148,163,184,0.35)"); add(b.lo, "rgba(148,163,184,0.6)"); }
    if (active.has("st")) {
      const st = supertrend(c);
      const s = chart.addSeries(LineSeries, { lineWidth: 2, priceLineVisible: false, lastValueVisible: false }, 0);
      s.setData(st.map((p) => ({ time: p.time as UTCTimestamp, value: p.value, color: p.up ? "#16c784" : "#ea3943" })));
      indSeries.current.push(s);
    }
    if (active.has("rsi")) {
      const r = add(rsi(c), "#eab308", 1, 1);
      r.createPriceLine({ price: 70, color: "rgba(234,57,67,0.6)", lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: "" });
      r.createPriceLine({ price: 30, color: "rgba(22,199,132,0.6)", lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: "" });
      chart.panes()[1]?.setHeight(110);
    }
  }, [active, dataVer]);

  useEffect(() => {
    let cancelled = false;
    let ws: WebSocket | null = null;
    let lastRebuild = 0;
    setLoading(true);
    setError(null);

    fetchCandles(symbol, interval)
      .then((candles) => {
        if (cancelled || !seriesRef.current) return;
        candlesRef.current = candles;
        seriesRef.current.setData(candles.map((c) => ({ ...c, time: c.time as UTCTimestamp })));
        chartRef.current?.timeScale().setVisibleLogicalRange({ from: candles.length - 150, to: candles.length + 8 });
        const last = candles[candles.length - 1];
        if (last) onPrice(last.close);
        setDataVer((v) => v + 1);
        setLoading(false);

        ws = new WebSocket(`${BINANCE_WS}${symbol.toLowerCase()}@kline_${interval}`);
        ws.onmessage = (ev) => {
          const k = JSON.parse(ev.data as string)?.data?.k;
          if (!k || !seriesRef.current) return;
          const c: Candle = {
            time: Math.floor(Number(k.t) / 1000),
            open: Number(k.o), high: Number(k.h), low: Number(k.l), close: Number(k.c), volume: Number(k.v),
          };
          const arr = candlesRef.current;
          if (arr.length && arr[arr.length - 1]!.time === c.time) arr[arr.length - 1] = c;
          else arr.push(c);
          seriesRef.current.update({ ...c, time: c.time as UTCTimestamp });
          onPrice(c.close);
          const now = Date.now();
          if (now - lastRebuild > 3000) { lastRebuild = now; setDataVer((v) => v + 1); }
        };
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(e.message);
        setLoading(false);
      });

    return () => { cancelled = true; ws?.close(); };
  }, [symbol, interval, onPrice]);

  const toggle = (id: IndId) =>
    setActive((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div ref={wrapRef} className="rounded-2xl border border-border bg-card p-3">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {INTERVALS.map((i) => (
          <button
            key={i}
            onClick={() => onIntervalChange(i)}
            className={cn(
              "rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors",
              i === interval ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground",
            )}
          >
            {i.toUpperCase()}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-muted-foreground">Rueda / pellizcar = zoom · arrastrar = mover</span>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
        <span className="mr-1 text-[11px] font-semibold uppercase text-muted-foreground">Indicadores</span>
        {IND.map((d) => (
          <button
            key={d.id}
            onClick={() => toggle(d.id)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
              active.has(d.id) ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {d.label}
          </button>
        ))}
      </div>
      <div className="relative">
        <div ref={containerRef} className={cn("w-full", active.has("rsi") ? "h-[500px]" : "h-[420px]")} />
        <canvas ref={canvasRef} className="pointer-events-none absolute left-0 top-0" />
        {(loading || error) && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-card/70 text-sm text-muted-foreground">
            {error ?? "Cargando gráfico…"}
          </div>
        )}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Ajustado para 30M–1D. El perfil de volumen se calcula sobre el rango visible: haz zoom o desplázate para cambiar el rango.
      </p>
    </div>
  );
}
