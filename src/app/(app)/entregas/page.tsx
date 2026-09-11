"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { useSesion } from "@/lib/sesion";
import { formatearMonto, formatearUsdt, formatearFechaHora } from "@/lib/format";

interface Fila {
  id: string;
  delivered_at: string;
  source_amount_received: number;
  delivered_amount: number;
  delivered_currency: string;
  usdt_spent: number;
  voided_at: string | null;
  contacts: { full_name: string } | null;
  delivery_methods: { label: string } | null;
}

/** Cuánto se trae de golpe. Se usa con datos móviles: no se traen mil filas. */
const POR_TANDA = 40;

const RANGOS = [
  { clave: "7", etiqueta: "7 días", dias: 7 },
  { clave: "30", etiqueta: "30 días", dias: 30 },
  { clave: "todo", etiqueta: "Todo", dias: null },
] as const;

export default function EntregasPage() {
  const { tenant } = useSesion();
  const moneda = tenant?.base_currency ?? "";

  const [filas, setFilas] = useState<Fila[]>([]);
  const [rango, setRango] = useState<string>("30");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hayMas, setHayMas] = useState(false);
  const [trayendoMas, setTrayendoMas] = useState(false);

  const cargar = useCallback(async (dias: number | null, hasta: number) => {
    const sb = supabase();
    let q = sb
      .from("deliveries")
      .select(
        "id, delivered_at, source_amount_received, delivered_amount, delivered_currency, usdt_spent, voided_at, contacts:client_contact_id(full_name), delivery_methods:method_id(label)"
      )
      .order("delivered_at", { ascending: false })
      .limit(hasta + 1);
    if (dias !== null) {
      const desde = new Date();
      desde.setDate(desde.getDate() - dias);
      desde.setHours(0, 0, 0, 0);
      q = q.gte("delivered_at", desde.toISOString());
    }
    const { data, error: err } = await q;
    if (err) throw err;
    const lista = (data ?? []) as unknown as Fila[];
    setHayMas(lista.length > hasta);
    setFilas(lista.slice(0, hasta));
  }, []);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setError(null);
    const dias = RANGOS.find((r) => r.clave === rango)?.dias ?? null;
    cargar(dias, POR_TANDA)
      .catch((e) => vivo && setError(e instanceof Error ? e.message : "No se pudieron cargar las entregas."))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [rango, cargar]);

  async function traerMas() {
    setTrayendoMas(true);
    const dias = RANGOS.find((r) => r.clave === rango)?.dias ?? null;
    try {
      await cargar(dias, filas.length + POR_TANDA);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar más.");
    } finally {
      setTrayendoMas(false);
    }
  }

  // Agrupadas por día: así se lee como un cuaderno, no como una lista infinita.
  const porDia = useMemo(() => {
    const mapa = new Map<string, Fila[]>();
    for (const f of filas) {
      const dia = new Date(f.delivered_at).toLocaleDateString("es", {
        weekday: "long", day: "2-digit", month: "long",
      });
      if (!mapa.has(dia)) mapa.set(dia, []);
      mapa.get(dia)!.push(f);
    }
    return Array.from(mapa.entries());
  }, [filas]);

  const vivas = filas.filter((f) => !f.voided_at);

  return (
    <>
      <h1 className="mb-3 text-xl font-semibold">Entregas</h1>

      <div className="mb-4 flex gap-2">
        {RANGOS.map((r) => (
          <button
            key={r.clave}
            type="button"
            onClick={() => setRango(r.clave)}
            aria-pressed={rango === r.clave}
            className="flex-1 rounded-full text-sm font-medium"
            style={{
              minHeight: 44,
              border: `1.5px solid ${rango === r.clave ? "var(--marca)" : "var(--linea)"}`,
              color: rango === r.clave ? "var(--marca)" : "var(--texto-suave)",
              background: rango === r.clave ? "color-mix(in srgb, var(--marca) 7%, white)" : "var(--tarjeta)",
            }}
          >
            {r.etiqueta}
          </button>
        ))}
      </div>

      {!cargando && !error && filas.length > 0 && (
        <div className="tarjeta mb-4 grid grid-cols-3 divide-x px-0 py-0" style={{ borderColor: "var(--linea)" }}>
          <Resumen titulo="Entregas" valor={String(vivas.length)} />
          <Resumen
            titulo={`Recibido ${moneda}`}
            valor={formatearMonto(vivas.reduce((s, f) => s + Number(f.source_amount_received), 0), moneda)}
          />
          <Resumen
            titulo="USDT"
            valor={formatearUsdt(vivas.reduce((s, f) => s + Number(f.usdt_spent), 0))}
          />
        </div>
      )}

      {cargando ? (
        <p className="py-6 text-center text-sm" style={{ color: "var(--texto-suave)" }}>
          Cargando…
        </p>
      ) : error ? (
        <div className="tarjeta p-5 text-center">
          <p className="mb-3 text-sm" style={{ color: "#b3261e" }}>
            {error}
          </p>
          <button className="boton-secundario mx-auto h-11" onClick={() => setRango(rango)} type="button">
            Reintentar
          </button>
        </div>
      ) : filas.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed p-6 text-center text-sm"
          style={{ borderColor: "var(--linea)", color: "var(--texto-suave)" }}
        >
          No hay entregas en este periodo.
        </div>
      ) : (
        <>
          {porDia.map(([dia, delDia]) => (
            <div key={dia} className="mb-5">
              <h2 className="mb-2 text-sm font-semibold first-letter:uppercase" style={{ color: "var(--texto-suave)" }}>
                {dia}
              </h2>
              <ul className="flex flex-col gap-2">
                {delDia.map((f) => (
                  <li key={f.id}>
                    <Link
                      href={`/entregas/${f.id}`}
                      className="tarjeta flex items-center justify-between gap-3 p-4"
                      style={{ minHeight: 56, opacity: f.voided_at ? 0.5 : 1 }}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {f.contacts?.full_name ?? "Sin cliente"}
                          {f.voided_at && (
                            <span className="ml-2 text-xs font-normal" style={{ color: "#b3261e" }}>
                              anulada
                            </span>
                          )}
                        </p>
                        <p className="truncate text-xs" style={{ color: "var(--texto-suave)" }}>
                          {f.delivery_methods?.label ?? "—"} · {formatearFechaHora(f.delivered_at)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p
                          className="mono text-sm font-semibold"
                          style={f.voided_at ? { textDecoration: "line-through" } : undefined}
                        >
                          {formatearMonto(Number(f.delivered_amount), f.delivered_currency)} {f.delivered_currency}
                        </p>
                        <p className="mono text-xs" style={{ color: "var(--texto-suave)" }}>
                          {formatearMonto(Number(f.source_amount_received), moneda)} {moneda}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {hayMas && (
            <button
              className="boton-secundario w-full justify-center"
              type="button"
              onClick={traerMas}
              disabled={trayendoMas}
            >
              {trayendoMas ? "Trayendo…" : "Ver más"}
            </button>
          )}
        </>
      )}
    </>
  );
}

function Resumen({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="px-3 py-4 text-center">
      <p className="mb-1 text-[11px]" style={{ color: "var(--texto-suave)" }}>
        {titulo}
      </p>
      <p className="mono text-base font-semibold">{valor}</p>
    </div>
  );
}
