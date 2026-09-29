import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Ingresar — CriptoLive" },
      { name: "description", content: "Ingresá a CriptoLive para guardar tus criptomonedas favoritas en todos tus dispositivos." },
      { property: "og:title", content: "Ingresar — CriptoLive" },
      { property: "og:description", content: "Guardá tus monedas favoritas y consultalas desde cualquier dispositivo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMsg("Email o contraseña incorrectos.");
      else navigate({ to: "/" });
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      setMsg(error ? error.message : "Revisá tu email para confirmar la cuenta.");
    }
    setBusy(false);
  };

  const google = async () => {
    const res = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (res.error) setMsg("No se pudo ingresar con Google.");
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-card p-6">
        <Link to="/" className="text-lg font-bold">
          Cripto<span className="text-primary">Live</span>
        </Link>
        <p className="text-sm text-muted-foreground">
          {mode === "in" ? "Ingresá para ver tus favoritas" : "Creá tu cuenta"}
        </p>
        <Button variant="outline" className="w-full" onClick={google}>
          Continuar con Google
        </Button>
        <form onSubmit={submit} className="space-y-3">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email"
            className="w-full rounded-xl border border-border bg-secondary px-3 py-2.5 text-sm outline-none focus:border-primary" />
          <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Contraseña"
            className="w-full rounded-xl border border-border bg-secondary px-3 py-2.5 text-sm outline-none focus:border-primary" />
          <Button type="submit" className="w-full" disabled={busy}>
            {mode === "in" ? "Ingresar" : "Crear cuenta"}
          </Button>
        </form>
        {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
        <button className="text-xs text-primary" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "¿No tenés cuenta? Registrate" : "¿Ya tenés cuenta? Ingresá"}
        </button>
      </div>
    </main>
  );
}
