import type { Candle, Interval } from "@/lib/binance";
import { bollinger, ema, supertrend } from "@/lib/indicators";

export function TrendDial({ candles, interval }: { candles: Candle[]; interval: Interval }) {
  const latest = candles.at(-1);
  const e9 = ema(candles, 9).at(-1)?.value;
  const e21 = ema(candles, 21).at(-1)?.value;
  const e50 = ema(candles, 50).at(-1)?.value;
  const trend = supertrend(candles, 10, 3).at(-1);
  const bands = bollinger(candles, 20, 2);
  const middle = bands.mid.at(-1)?.value;
  const ready = latest && e9 !== undefined && e21 !== undefined && e50 !== undefined && trend && middle !== undefined;
  const score = ready
    ? (e9 > e21 ? 1 : -1) + (e21 > e50 ? 1 : -1) + (latest.close > e21 ? 1 : -1) + (trend.up ? 1 : -1) + (latest.close > middle ? 1 : -1)
    : 0;
  const state = !ready ? "Calculando" : score >= 3 ? "Alcista" : score <= -3 ? "Bajista" : "Punto medio";
  const tone = !ready || Math.abs(score) < 3 ? "text-primary" : score > 0 ? "text-bull" : "text-bear";
  const strength = ready ? Math.abs(score) / 5 : 0;

  return (
    <section className="border-t border-border py-5" aria-label="Tendencia de la criptomoneda">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">Tendencia</h2>
        <span className="text-xs text-muted-foreground">Temporalidad {interval.toUpperCase()}</span>
      </div>
      <div className="flex items-center gap-5">
        <div className={`relative size-36 shrink-0 ${tone}`} role="img" aria-label={`Tendencia ${state} en ${interval}`}>
          <svg className="size-full -rotate-90" viewBox="0 0 120 120" aria-hidden="true">
            <circle cx="60" cy="60" r="51" fill="none" stroke="var(--border)" strokeWidth="8" />
            <circle cx="60" cy="60" r="51" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${Math.max(0.08, strength) * 320} 320`} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-lg font-bold">{state}</span>
            {ready && <span className="mt-1 text-xs text-muted-foreground">{Math.round(strength * 100)}% fuerza</span>}
          </div>
        </div>
        <div className="min-w-0 text-xs leading-5 text-muted-foreground">
          <p>Lectura de EMA 9/21/50, Supertrend 10·3 y Bollinger 20·2.</p>
          <p className="mt-2">Se actualiza con las velas de {interval.toUpperCase()}.</p>
        </div>
      </div>
    </section>
  );
}