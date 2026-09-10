"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useSesion } from "@/lib/sesion";

export default function LoginPage() {
  const router = useRouter();
  const { usuario, cargando } = useSesion();
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [entrando, setEntrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cargando && usuario) router.replace("/");
  }, [cargando, usuario, router]);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setEntrando(true);
    setError(null);
    const { error: err } = await supabase().auth.signInWithPassword({
      email: email.trim(),
      password: clave,
    });
    setEntrando(false);
    if (err) {
      setError(
        err.message === "Invalid login credentials"
          ? "Correo o contraseña incorrectos."
          : err.message
      );
      return;
    }
    router.replace("/");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-12">
      <h1 className="mb-1 text-2xl font-semibold">Cuadre</h1>
      <p className="mb-8 text-sm" style={{ color: "var(--texto-suave)" }}>
        Entra para registrar el día.
      </p>

      <form onSubmit={entrar} className="flex flex-col gap-4">
        <div>
          <label className="etiqueta" htmlFor="email">
            Correo
          </label>
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="etiqueta" htmlFor="clave">
            Contraseña
          </label>
          <input
            id="clave"
            type="password"
            autoComplete="current-password"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            required
          />
        </div>

        <button className="boton-primario mt-2" type="submit" disabled={entrando}>
          {entrando ? "Entrando…" : "Entrar"}
        </button>

        {error && (
          <p className="text-sm" style={{ color: "#b3261e" }} role="alert">
            {error}
          </p>
        )}
      </form>
    </main>
  );
}
