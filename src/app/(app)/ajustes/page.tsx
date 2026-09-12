"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { useSesion } from "@/lib/sesion";
import { formatearFechaHora } from "@/lib/format";
import AjustesComisiones from "@/components/AjustesComisiones";

interface Clave {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export default function AjustesPage() {
  const { perfil, tenant } = useSesion();
  const [claves, setClaves] = useState<Clave[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [nombre, setNombre] = useState("");
  const [creando, setCreando] = useState(false);
  const [nueva, setNueva] = useState<string | null>(null);
  const [copiada, setCopiada] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const { data, error: err } = await supabase()
        .from("api_keys")
        .select("id, name, key_prefix, created_at, last_used_at, revoked_at")
        .order("created_at", { ascending: false });
      if (err) throw err;
      setClaves((data ?? []) as Clave[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar las claves.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function crear(e: FormEvent) {
    e.preventDefault();
    setCreando(true);
    setErrorForm(null);
    setNueva(null);
    try {
      const res = await fetch("/api/claves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nombre }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "No se pudo crear.");
      setNueva(body.clave);
      setNombre("");
      cargar();
    } catch (err) {
      setErrorForm(err instanceof Error ? err.message : "No se pudo crear.");
    } finally {
      setCreando(false);
    }
  }

  async function revocar(id: string) {
    await fetch(`/api/claves/${id}/revocar`, { method: "POST" });
    cargar();
  }

  if (perfil?.role !== "owner") {
    return (
      <p className="py-10 text-center text-sm" style={{ color: "var(--texto-suave)" }}>
        Solo el dueño puede ver los ajustes.
      </p>
    );
  }

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Ajustes</h1>
      <p className="mb-6 text-sm" style={{ color: "var(--texto-suave)" }}>
        {tenant?.brand_name}
      </p>

      <AjustesComisiones />

      <h2 className="mb-1 mt-8 text-sm font-semibold" style={{ color: "var(--texto-suave)" }}>
        Claves para recibir pedidos
      </h2>
      <p className="mb-3 text-xs" style={{ color: "var(--texto-suave)" }}>
        Una clave deja que tu web mande pedidos aquí. Funciona con cualquier sitio; el contrato está
        en el README del proyecto.
      </p>

      {/* El aviso de Hoy solo sale si hay pendientes: sin esto, atendidos todos,
          no habría forma de volver a mirar lo que llegó. */}
      <Link
        href="/pedidos"
        className="tarjeta mb-4 flex items-center justify-between gap-3 px-4"
        style={{ minHeight: "3.5rem" }}
      >
        <span className="text-[0.9375rem] font-medium">Ver los pedidos recibidos</span>
        <span className="text-sm" style={{ color: "var(--texto-suave)" }}>
          ›
        </span>
      </Link>

      {nueva && (
        <div
          className="mb-4 rounded-2xl p-4"
          style={{ background: "color-mix(in srgb, var(--marca) 7%, white)", border: "1.5px solid var(--marca)" }}
        >
          <p className="mb-2 text-sm font-semibold">Cópiala ahora</p>
          <p className="mb-3 text-xs" style={{ color: "var(--texto-suave)" }}>
            Es la única vez que se ve. No se guarda en ninguna parte: si la pierdes, se revoca y se
            hace otra.
          </p>
          <p
            className="mono mb-3 break-all rounded-lg px-3 py-2 text-xs"
            style={{ background: "var(--tarjeta)", border: "1px solid var(--linea)" }}
          >
            {nueva}
          </p>
          <button
            className="boton-primario"
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(nueva);
                setCopiada(true);
                setTimeout(() => setCopiada(false), 1800);
              } catch {
                /* portapapeles no disponible */
              }
            }}
          >
            {copiada ? "¡Copiada!" : "Copiar clave"}
          </button>
        </div>
      )}

      <form onSubmit={crear} className="tarjeta mb-5 flex flex-col gap-3 p-4">
        <div>
          <label className="etiqueta" htmlFor="nombre-clave">
            Nombre de la clave
          </label>
          <input
            id="nombre-clave"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Web de Cuyana"
            required
          />
        </div>
        <button className="boton-primario" type="submit" disabled={creando || !nombre.trim()}>
          {creando ? "Generando…" : "Generar clave"}
        </button>
        {errorForm && (
          <p className="text-sm" style={{ color: "#b3261e" }}>
            {errorForm}
          </p>
        )}
      </form>

      {cargando ? (
        <p className="py-6 text-center text-sm" style={{ color: "var(--texto-suave)" }}>
          Cargando…
        </p>
      ) : error ? (
        <div className="tarjeta p-5 text-center">
          <p className="mb-3 text-sm" style={{ color: "#b3261e" }}>
            {error}
          </p>
          <button className="boton-secundario mx-auto h-11" onClick={cargar} type="button">
            Reintentar
          </button>
        </div>
      ) : claves.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed p-6 text-center text-sm"
          style={{ borderColor: "var(--linea)", color: "var(--texto-suave)" }}
        >
          Todavía no hay claves.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {claves.map((c) => (
            <li key={c.id} className="tarjeta p-4" style={{ opacity: c.revoked_at ? 0.55 : 1 }}>
              <div className="mb-1 flex items-start justify-between gap-3">
                <p className="min-w-0 truncate text-[0.9375rem] font-medium">{c.name}</p>
                {c.revoked_at ? (
                  <span className="shrink-0 text-xs" style={{ color: "var(--texto-suave)" }}>
                    Revocada
                  </span>
                ) : (
                  <button
                    className="boton-secundario shrink-0 text-sm"
                    style={{ minHeight: "2.75rem" }}
                    onClick={() => revocar(c.id)}
                    type="button"
                  >
                    Revocar
                  </button>
                )}
              </div>
              <p className="mono text-xs" style={{ color: "var(--texto-suave)" }}>
                {c.key_prefix}…
              </p>
              <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
                Creada {formatearFechaHora(c.created_at)}
                {c.last_used_at ? ` · usada ${formatearFechaHora(c.last_used_at)}` : " · sin usar"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
