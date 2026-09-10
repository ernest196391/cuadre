"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { useSesion } from "@/lib/sesion";
import { formatearMonto, formatearUsdt, formatearFechaHora } from "@/lib/format";

interface EntregaReciente {
  id: string;
  delivered_at: string;
  source_amount_received: number;
  delivered_amount: number;
  delivered_currency: string;
  usdt_spent: number;
  contacts: { full_name: string } | null;
  delivery_methods: { label: string } | null;
}

export default function HoyPage() {
  const { tenant } = useSesion();
  const [entregas, setEntregas] = useState<EntregaReciente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const desde = new Date();
      desde.setHours(0, 0, 0, 0);
      const { data, error: err } = await supabase()
        .from("deliveries")
        .select(
          "id, delivered_at, source_amount_received, delivered_amount, delivered_currency, usdt_spent, contacts:client_contact_id(full_name), delivery_methods:method_id(label)"
        )
        .is("voided_at", null)
        .gte("delivered_at", desde.toISOString())
        .order("delivered_at", { ascending: false });
      if (err) throw err;
      setEntregas((data ?? []) as unknown as EntregaReciente[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el día.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const moneda = tenant?.base_currency ?? "";
  const totalOrigen = entregas.reduce((s, e) => s + Number(e.source_amount_received), 0);
  const totalUsdt = entregas.reduce((s, e) => s + Number(e.usdt_spent), 0);

  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">Hoy</h1>

      <div className="mb-5 grid grid-cols-3 gap-2">
        <Link href="/entregas/nueva" className="boton-primario boton-primario-alto" style={{ minHeight: 64 }}>
          + Entrega
        </Link>
        <Link
          href="/compras/nueva"
          className="boton-secundario"
          style={{ minHeight: 64 }}
        >
          + Compra
        </Link>
        <Link href="/contactos" className="boton-secundario" style={{ minHeight: 64 }}>
          Contactos
        </Link>
      </div>

      <div className="tarjeta mb-5 grid grid-cols-3 divide-x" style={{ borderColor: "var(--linea)" }}>
        <Resumen titulo="Entregas" valor={String(entregas.length)} />
        <Resumen titulo={`Recibido ${moneda}`} valor={formatearMonto(totalOrigen, moneda)} />
        <Resumen titulo="USDT usados" valor={formatearUsdt(totalUsdt)} />
      </div>

      <h2 className="mb-2 text-sm font-semibold" style={{ color: "var(--texto-suave)" }}>
        Entregas de hoy
      </h2>

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
      ) : entregas.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed p-6 text-center text-sm"
          style={{ borderColor: "var(--linea)", color: "var(--texto-suave)" }}
        >
          Todavía no has registrado nada hoy.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {entregas.map((e) => (
            <li key={e.id} className="tarjeta flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{e.contacts?.full_name ?? "Sin cliente"}</p>
                <p className="truncate text-xs" style={{ color: "var(--texto-suave)" }}>
                  {e.delivery_methods?.label ?? "—"} · {formatearFechaHora(e.delivered_at)}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="mono text-sm font-semibold">
                  {formatearMonto(Number(e.delivered_amount), e.delivered_currency)} {e.delivered_currency}
                </p>
                <p className="mono text-xs" style={{ color: "var(--texto-suave)" }}>
                  {formatearMonto(Number(e.source_amount_received), moneda)} {moneda}
                </p>
              </div>
            </li>
          ))}
        </ul>
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
