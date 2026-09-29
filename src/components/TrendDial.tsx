import { useEffect, useState } from "react";
import { fetchCandles, formatCompact, type Candle, type Interval } from "@/lib/binance";
import { combine, HIGHER_TF, technical, whaleScore, zoneScore, type Factor, type Whales, type ZoneVol } from "@/lib/trendScore";

type Props = { symbol: string; candles: Candle[]; interval: Interval; zones: ZoneVol[]; whales: Whales };

export function TrendDial({ symbol, candles, interval, zones, whales }: Props) {
  const [higher, setHigher] = useState<{ tf: Interval; c: Candle[] }[]>([]);

  // velas de temporalidades superiores para confirmar la tendencia
  useEffect(() => {
    let off = false;
    const load = () =>
      Promise.all(HIGHER_TF[interval].map((tf) => fetchCandles(symbol, tf).then((c) => ({ tf, c })).catch(() => null)))
        .then((r) => !off && setHigher(r.filter((x): x is { tf: Interval; c: Candle[] } => !!x)));
    setHigher([]);
    load();
    const iv = window.setInterval(load, 60000);
    return () => { off = true; clearInterval(iv); };
  }, [symbol, interval]);

  const price = candles.at(-1)?.close ?? 0;
  const tech = technical(candles);
  const htf = higher.map((h) => technical(h.c)).filter((v): v is number => v !== null);
  const factors: Factor[] = [
    { label: `Técnico ${interval.toUpperCase()}`, value: tech, weight: 0.35 },
    { label: `Temporalidades mayores (${HIGHER_TF[interval].join(", ").toUpperCase() || "—"})`, value: htf.length ? htf.reduce((a, b) => a + b, 0) / htf.length : null, weight: 0.25 },
    { label: "Zonas de operaciones", value: zoneScore(zones, price), weight: 0.15 },
    { label: `Ballenas (${whales.count} órdenes ≥ 100K)`, value: whaleScore(whales), weight: 0.25 },
  ];
  const score = tech === null ? null : combine(factors);
  const state = score === null ? "Calculando" : score >= 0.35 ? "Alcista" : score <= -0.35 ? "Bajista" : "Punto medio";
  const tone = score === null || Math.abs(score) < 0.35 ? "text-primary" : score > 0 ? "text-bull" : "text-bear";
  const angle = (score ?? 0) * 90; // -90° bajista … +90° alcista

  return (
    <section className="border-t border-border py-5" aria-label="Tendencia de la criptomoneda">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">Tendencia</h2>
        <span className="text-xs text-muted-foreground">Temporalidad {interval.toUpperCase()}</span>
      </div>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className={`relative h-28 w-52 shrink-0 self-center ${tone}`} role="img" aria-label={`Tendencia ${state} en ${interval}`}>
          <svg className="size-full" viewBox="0 0 200 110" aria-hidden="true">
            <path d="M15 100 A85 85 0 0 1 72 20" fill="none" stroke="var(--bear)" strokeWidth="10" opacity="0.55" />
            <path d="M76 18 A85 85 0 0 1 124 18" fill="none" stroke="var(--primary)" strokeWidth="10" opacity="0.55" />
            <path d="M128 20 A85 85 0 0 1 185 100" fill="none" stroke="var(--bull)" strokeWidth="10" opacity="0.55" />
            <g style={{ transform: `rotate(${angle}deg)`, transformOrigin: "100px 100px", transition: "transform 0.8s ease" }}>
              <line x1="100" y1="100" x2="100" y2="28" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
            </g>
            <circle cx="100" cy="100" r="7" fill="currentColor" />
          </svg>
          <div className="absolute inset-x-0 -bottom-5 text-center">
            <span className="text-lg font-bold">{state}</span>
            {score !== null && <span className="ml-2 text-xs text-muted-foreground">{Math.round(Math.abs(score) * 100)}%</span>}
          </div>
        </div>
        <div className="mt-4 min-w-0 flex-1 space-y-2 text-xs sm:mt-0">
          {factors.map((f) => (
            <div key={f.label}>
              <div className="flex justify-between gap-2 text-muted-foreground">
                <span className="truncate">{f.label}</span>
                <span className="tabular-nums">{f.value === null ? "sin datos" : `${f.value > 0 ? "+" : ""}${Math.round(f.value * 100)}`}</span>
              </div>
              <div className="relative mt-1 h-1.5 rounded bg-secondary">
                <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
                {f.value !== null && (
                  <div
                    className={`absolute inset-y-0 rounded ${f.value >= 0 ? "bg-bull" : "bg-bear"}`}
                    style={f.value >= 0 ? { left: "50%", width: `${f.value * 50}%` } : { right: "50%", width: `${-f.value * 50}%` }}
                  />
                )}
              </div>
            </div>
          ))}
          <p className="pt-1 text-muted-foreground">
            Ballenas: compra {formatCompact(whales.buy)} · venta {formatCompact(whales.sell)} USDT. Solo marca tendencia con ±35% de confluencia.
          </p>
        </div>
      </div>
    </section>
  );
}
