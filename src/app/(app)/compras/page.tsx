"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { useSesion } from "@/lib/sesion";
import { formatearMonto, formatearCosto, formatearUsdt, formatearFechaHora } from "@/lib/format";

interface Compra {
  id: string;
  purchased_at: string;
  source_amount: number;
  source_currency: string;
  fee_source_amount: number;
  usdt_received: number;
  cost_per_usdt: number | null;
  supplier_contact_id: string | null;
  notes: string | null;
  voided_at: string | null;
  void_reason: string | null;
}

export default function ComprasPage() {
  const { tenant, perfil } = useSesion();
  const moneda = tenant?.base_currency ?? "";
  const esDueno = perfil?.role === "owner";

  const [compras, setCompras] = useState<Compra[]>([]);
  const [nombres, setNombres] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [anulando, setAnulando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const sb = supabase();
      const [cRes, nRes] = await Promise.all([
        sb.from("purchases")
          .select("id, purchased_at, source_amount, source_currency, fee_source_amount, usdt_received, cost_per_usdt, supplier_contact_id, notes, voided_at, void_reason")
          .order("purchased_at", { ascending: false })
          .limit(60),
        sb.from("contacts").select("id, full_name"),
      ]);
      if (cRes.error) throw cRes.error;
      setCompras((cRes.data ?? []) as Compra[]);
      const mapa: Record<string, string> = {};
      for (const c of nRes.data ?? []) mapa[c.id as string] = c.full_name as string;
      setNombres(mapa);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar las compras.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function anular(id: string) {
    if (motivo.trim().length < 3) {
      setError("Escribe por qué la anulas.");
      return;
    }
    setGuardando(true);
    setError(null);
    const { error: err } = await supabase().rpc("void_purchase", {
      p_purchase_id: id,
      p_reason: motivo.trim(),
    });
    setGuardando(false);
    if (err) {
      setError(err.message);
      return;
    }
    setAnulando(null);
    setMotivo("");
    cargar();
  }

  const vivas = compras.filter((c) => !c.voided_at);
  const totalGastado = vivas.reduce((s, c) => s + Number(c.source_amount) + Number(c.fee_source_amount), 0);
  const totalUsdt = vivas.reduce((s, c) => s + Number(c.usdt_received), 0);
  // Promedio ponderado: lo que de verdad cuesta cada USDT en la wallet.
  const promedio = totalUsdt > 0 ? totalGastado / totalUsdt : 0;

  return (
    <>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h1 className="text-xl font-semibold">Compras</h1>
        <Link href="/compras/nueva" className="flex items-center text-sm font-medium"
              style={{ color: "var(--marca)", minHeight: "2.75rem" }}>
          + Nueva
        </Link>
      </div>

      {!cargando && !error && vivas.length > 0 && (
        <div className="tarjeta mb-4 grid grid-cols-3 divide-x" style={{ borderColor: "var(--linea)" }}>
          <Resumen titulo={`Gastado ${moneda}`} valor={formatearMonto(totalGastado, moneda)} />
          <Resumen titulo="USDT comprados" valor={formatearUsdt(totalUsdt)} />
          <Resumen titulo={`Costo medio`} valor={formatearCosto(promedio)} />
        </div>
      )}

      {error && (
        <p className="mb-3 text-sm" style={{ color: "#b3261e" }} role="alert">
          {error}
        </p>
      )}

      {cargando ? (
        <p className="py-6 text-center text-sm" style={{ color: "var(--texto-suave)" }}>
          Cargando…
        </p>
      ) : compras.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed p-6 text-center text-sm"
          style={{ borderColor: "var(--linea)", color: "var(--texto-suave)" }}
        >
          Todavía no has comprado USDT.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {compras.map((c) => {
            const abierto = anulando === c.id;
            const anulada = c.voided_at !== null;
            return (
              <li key={c.id} className="tarjeta p-4" style={{ opacity: anulada ? 0.55 : 1 }}>
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <p className="mono text-[0.9375rem] font-semibold"
                     style={anulada ? { textDecoration: "line-through" } : undefined}>
                    {formatearUsdt(Number(c.usdt_received))} USDT
                  </p>
                  <p className="mono text-sm">
                    {formatearMonto(Number(c.source_amount) + Number(c.fee_source_amount), moneda)} {moneda}
                  </p>
                </div>
                <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
                  {formatearFechaHora(c.purchased_at)}
                  {c.cost_per_usdt != null && ` · 1 USDT = ${formatearCosto(Number(c.cost_per_usdt))} ${moneda}`}
                  {c.supplier_contact_id && ` · ${nombres[c.supplier_contact_id] ?? "—"}`}
                </p>
                {Number(c.fee_source_amount) > 0 && (
                  <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
                    Incluye {formatearMonto(Number(c.fee_source_amount), moneda)} {moneda} de fee
                  </p>
                )}
                {c.notes && <p className="mt-1 text-xs">{c.notes}</p>}

                {anulada ? (
                  <p className="mt-2 text-xs" style={{ color: "#b3261e" }}>
                    Anulada {formatearFechaHora(c.voided_at!)} · {c.void_reason}
                  </p>
                ) : esDueno && !abierto ? (
                  <button
                    className="boton-secundario mt-3 w-full justify-center text-sm"
                    type="button"
                    onClick={() => {
                      setAnulando(c.id);
                      setMotivo("");
                      setError(null);
                    }}
                    style={{ color: "#b3261e", borderColor: "rgba(196,61,75,.4)" }}
                  >
                    Anular
                  </button>
                ) : null}

                {abierto && (
                  <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--linea)" }}>
                    <p className="mb-2 text-xs" style={{ color: "var(--texto-suave)" }}>
                      No se borra: deja de contar en el saldo de la wallet y queda con el motivo.
                    </p>
                    <label className="etiqueta" htmlFor={`motivo-${c.id}`}>
                      Por qué la anulas
                    </label>
                    <input
                      id={`motivo-${c.id}`}
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      placeholder="La apunté dos veces"
                      autoFocus
                    />
                    <div className="mt-3 flex gap-2">
                      <button
                        className="boton-secundario flex-1 justify-center"
                        type="button"
                        onClick={() => setAnulando(null)}
                      >
                        Cancelar
                      </button>
                      <button
                        className="boton-primario flex-1"
                        type="button"
                        onClick={() => anular(c.id)}
                        disabled={guardando}
                        style={{ background: "#b3261e" }}
                      >
                        {guardando ? "Anulando…" : "Anular"}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function Resumen({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="px-2 py-4 text-center">
      <p className="mb-1 text-[0.6875rem]" style={{ color: "var(--texto-suave)" }}>
        {titulo}
      </p>
      <p className="mono text-sm font-semibold">{valor}</p>
    </div>
  );
}
