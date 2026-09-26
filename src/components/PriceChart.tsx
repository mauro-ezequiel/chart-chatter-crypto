import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import {
  BINANCE_WS,
  fetchCandles,
  INTERVALS,
  type Candle,
  type Interval,
} from "@/lib/binance";
import { cn } from "@/lib/utils";

type Props = {
  symbol: string;
  interval: Interval;
  onIntervalChange: (i: Interval) => void;
  onPrice: (p: number) => void;
};

export function PriceChart({
  symbol,
  interval,
  onIntervalChange,
  onPrice,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // create chart once
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = createChart(el, {
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
      timeScale: {
        borderColor: "rgba(148,163,184,0.15)",
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: { mode: 0 },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: true,
      },
      handleScroll: { pressedMouseMove: true, mouseWheel: true },
      autoSize: true,
      height: 380,
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
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // load history + live stream
  useEffect(() => {
    let cancelled = false;
    let ws: WebSocket | null = null;
    setLoading(true);
    setError(null);

    fetchCandles(symbol, interval)
      .then((candles: Candle[]) => {
        if (cancelled || !seriesRef.current) return;
        seriesRef.current.setData(
          candles.map((c) => ({ ...c, time: c.time as UTCTimestamp })),
        );
        chartRef.current?.timeScale().fitContent();
        const last = candles[candles.length - 1];
        if (last) onPrice(last.close);
        setLoading(false);

        ws = new WebSocket(
          `${BINANCE_WS}${symbol.toLowerCase()}@kline_${interval}`,
        );
        ws.onmessage = (ev) => {
          const msg = JSON.parse(ev.data as string);
          const k = msg?.data?.k;
          if (!k || !seriesRef.current) return;
          seriesRef.current.update({
            time: Math.floor(Number(k.t) / 1000) as UTCTimestamp,
            open: Number(k.o),
            high: Number(k.h),
            low: Number(k.l),
            close: Number(k.c),
          });
          onPrice(Number(k.c));
        };
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(e.message);
        setLoading(false);
      });

    return () => {
      cancelled = true;
      ws?.close();
    };
  }, [symbol, interval, onPrice]);

  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {INTERVALS.map((i) => (
          <button
            key={i}
            onClick={() => onIntervalChange(i)}
            className={cn(
              "rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors",
              i === interval
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground",
            )}
          >
            {i.toUpperCase()}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-muted-foreground">
          Rueda / pellizcar = zoom · arrastrar = mover
        </span>
      </div>
      <div className="relative">
        <div ref={containerRef} className="h-[380px] w-full" />
        {(loading || error) && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-card/70 text-sm text-muted-foreground">
            {error ?? "Cargando gráfico…"}
          </div>
        )}
      </div>
    </div>
  );
}
