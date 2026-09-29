import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export function useAuthUser() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  return { user, ready };
}

export function useFavorites(user: User | null) {
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) {
      setFavorites(new Set());
      return;
    }
    let cancelled = false;
    supabase
      .from("favorites")
      .select("symbol")
      .order("created_at")
      .then(({ data }) => {
        if (!cancelled && data) setFavorites(new Set(data.map((r) => r.symbol)));
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const toggle = useCallback(
    async (symbol: string) => {
      if (!user) return;
      const has = favorites.has(symbol);
      setFavorites((prev) => {
        const next = new Set(prev);
        if (has) next.delete(symbol);
        else next.add(symbol);
        return next;
      });
      const { error } = has
        ? await supabase.from("favorites").delete().eq("symbol", symbol).eq("user_id", user.id)
        : await supabase.from("favorites").insert({ symbol, user_id: user.id });
      if (error) {
        setFavorites((prev) => {
          const next = new Set(prev);
          if (has) next.add(symbol);
          else next.delete(symbol);
          return next;
        });
      }
    },
    [user, favorites],
  );

  return { favorites, toggle };
}
