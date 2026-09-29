import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Search, Star } from "lucide-react";
import {
  BINANCE_WS,
  fetchMarkets,
  formatCompact,
  formatPrice,
  type Market,
} from "@/lib/binance";
import { cn } from "@/lib/utils";

type Props = {
  selected: string;
  onSelect: (symbol: string) => void;
  favorites: Set<string>;
  signedIn: boolean;
  onToggleFavorite: (symbol: string) => void;
};

export function MarketSearch({ selected, onSelect, favorites, signedIn, onToggleFavorite }: Props) {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | "fav">("all");

  useEffect(() => {
    let cancelled = false;
    fetchMarkets()
      .then((m) => !cancelled && setMarkets(m))
      .catch((e: Error) => !cancelled && setError(e.message));

    const ws = new WebSocket(`${BINANCE_WS}!miniTicker@arr`);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data as string);
      const arr = msg?.data as { s: string; c: string; o: string }[] | undefined;
      if (!arr) return;
      const map = new Map(arr.map((t) => [t.s, t]));
      setMarkets((prev) =>
        prev.map((m) => {
          const t = map.get(m.symbol);
          if (!t) return m;
          const price = Number(t.c);
          const open = Number(t.o);
          return {
            ...m,
            price,
            changePct: open ? ((price - open) / open) * 100 : m.changePct,
          };
        }),
      );
    };
    return () => {
      cancelled = true;
      ws.close();
    };
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toUpperCase();
    let list = q
      ? markets.filter((m) => m.base.includes(q) || m.symbol.includes(q))
      : markets;
    if (tab === "fav") list = list.filter((m) => favorites.has(m.symbol));
    return list.slice(0, 60);
  }, [markets, query, tab, favorites]);

  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar cripto (BTC, ETH, SOL…)"
          className="w-full rounded-xl border border-border bg-secondary py-2.5 pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
        />
      </div>

      <div className="mt-3 flex gap-1 text-xs">
        {(["all", "fav"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-lg px-3 py-1.5 font-medium",
              tab === t ? "bg-secondary text-foreground" : "text-muted-foreground",
            )}
          >
            {t === "all" ? "Todas" : `★ Favoritas (${favorites.size})`}
          </button>
        ))}
      </div>

      <div className="mt-2 max-h-[420px] overflow-y-auto pr-1">
        {error && <p className="p-3 text-xs text-bear">{error}</p>}
        {!error && markets.length === 0 && (
          <p className="p-3 text-xs text-muted-foreground">
            Cargando mercados en vivo…
          </p>
        )}
        {tab === "fav" && !signedIn && (
          <p className="p-3 text-xs text-muted-foreground">
            <Link to="/auth" className="text-primary">Ingresá</Link> para guardar tus favoritas en todos tus dispositivos.
          </p>
        )}
        {tab === "fav" && signedIn && favorites.size === 0 && (
          <p className="p-3 text-xs text-muted-foreground">
            Tocá la ★ de una moneda para agregarla.
          </p>
        )}
        {results.map((m) => (
          <div
            key={m.symbol}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(m.symbol)}
            onKeyDown={(e) => e.key === "Enter" && onSelect(m.symbol)}
            className={cn(
              "flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left transition-colors",
              m.symbol === selected ? "bg-secondary" : "hover:bg-secondary/60",
            )}
          >
            <button
              aria-label={favorites.has(m.symbol) ? "Quitar de favoritas" : "Agregar a favoritas"}
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(m.symbol);
              }}
              className="shrink-0"
            >
              <Star
                className={cn(
                  "size-4",
                  favorites.has(m.symbol) ? "fill-primary text-primary" : "text-muted-foreground",
                )}
              />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {m.base}
                <span className="text-muted-foreground">/{m.quote}</span>
              </p>
              <p className="text-[11px] text-muted-foreground">
                Vol {formatCompact(m.quoteVolume)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm tabular-nums">{formatPrice(m.price)}</p>
              <p
                className={cn(
                  "text-[11px] tabular-nums",
                  m.changePct >= 0 ? "text-bull" : "text-bear",
                )}
              >
                {m.changePct >= 0 ? "+" : ""}
                {m.changePct.toFixed(2)}%
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
