import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuthUser, useFavorites } from "@/lib/favorites";
import { MarketSearch } from "@/components/MarketSearch";
import { PriceChart } from "@/components/PriceChart";
import { OrderBook } from "@/components/OrderBook";
import { LiquidationHeatmap } from "@/components/LiquidationHeatmap";
import { formatPrice, type Interval } from "@/lib/binance";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CriptoLive — Buscador y gráficos de criptomonedas en vivo" },
      {
        name: "description",
        content:
          "Busca cualquier criptomoneda, mira su gráfico en vivo con zoom y temporalidades, y sigue el libro de órdenes en tiempo real.",
      },
      {
        property: "og:title",
        content: "CriptoLive — Criptomonedas en vivo",
      },
      {
        property: "og:description",
        content:
          "Buscador de criptomonedas con gráfico interactivo, temporalidades y órdenes de compra en tiempo real.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [interval, setInterval] = useState<Interval>("1h");
  const [price, setPrice] = useState(0);
  const [mounted, setMounted] = useState(false);
  const { user } = useAuthUser();
  const { favorites, toggle } = useFavorites(user);

  useEffect(() => setMounted(true), []);

  const handlePrice = useCallback((p: number) => setPrice(p), []);
  const handleToggle = (s: string) => (user ? toggle(s) : navigate({ to: "/auth" }));

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-4 py-4">
        <div>
          <h1 className="text-lg font-bold tracking-tight">
            Cripto<span className="text-primary">Live</span>
          </h1>
          <p className="text-xs text-muted-foreground">
            Mercados, gráficos y órdenes en tiempo real
          </p>
        </div>
        {user ? (
          <div className="flex items-center gap-2">
            <span className="hidden max-w-[160px] truncate text-xs text-muted-foreground sm:inline">{user.email}</span>
            <Button size="sm" variant="outline" onClick={() => supabase.auth.signOut()}>Salir</Button>
          </div>
        ) : (
          <Button size="sm" asChild><Link to="/auth">Ingresar</Link></Button>
        )}
      </header>

      <div className="mx-auto grid max-w-7xl gap-4 p-4 lg:grid-cols-[320px_1fr_260px]">
        <MarketSearch
          selected={symbol}
          onSelect={setSymbol}
          favorites={favorites}
          signedIn={!!user}
          onToggleFavorite={handleToggle}
        />

        <div className="space-y-4">
          <div className="flex items-baseline gap-3 rounded-2xl border border-border bg-card px-4 py-3">
            <span className="text-base font-semibold">{symbol}</span>
            <span className="text-2xl font-bold tabular-nums">
              {price ? formatPrice(price) : "—"}
            </span>
          </div>

          {mounted && (
            <PriceChart
              symbol={symbol}
              interval={interval}
              onIntervalChange={setInterval}
              onPrice={handlePrice}
            />
          )}
          {mounted && <LiquidationHeatmap symbol={symbol} lastPrice={price} />}
        </div>

        {mounted && <OrderBook symbol={symbol} lastPrice={price} />}
      </div>
    </main>
  );
}
