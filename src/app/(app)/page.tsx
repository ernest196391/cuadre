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
  const { tenant, metodos } = useSesion();
  const [entregas, setEntregas] = useState<EntregaReciente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [saldoUsdt, setSaldoUsdt] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const sb = supabase();
      const desde = new Date();
      desde.setHours(0, 0, 0, 0);

      const [hoyRes, compradoRes, gastadoRes] = await Promise.all([
        sb.from("deliveries")
          .select(
            "id, delivered_at, source_amount_received, delivered_amount, delivered_currency, usdt_spent, contacts:client_contact_id(full_name), delivery_methods:method_id(label)"
          )
          .is("voided_at", null)
          .gte("delivered_at", desde.toISOString())
          .order("delivered_at", { ascending: false }),
        // Saldo de la wallet: es lo primero que se mira antes de aceptar un
        // envío grande, y hasta ahora había que calcularlo de cabeza.
        sb.from("purchases").select("usdt_received").is("voided_at", null),
        sb.from("deliveries").select("usdt_spent, network_fee_usdt").is("voided_at", null),
      ]);
      if (hoyRes.error) throw hoyRes.error;
      setEntregas((hoyRes.data ?? []) as unknown as EntregaReciente[]);

      if (!compradoRes.error && !gastadoRes.error) {
        const comprado = (compradoRes.data ?? []).reduce((s, c) => s + Number(c.usdt_received), 0);
        const gastado = (gastadoRes.data ?? []).reduce(
          (s, d) => s + Number(d.usdt_spent) + Number(d.network_fee_usdt),
          0
        );
        setSaldoUsdt(comprado - gastado);
      }
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

      {saldoUsdt !== null && (
        <div
          className="mb-3 rounded-2xl px-5 py-4"
          style={{ background: "var(--marca)", color: "#fff" }}
        >
          <p className="mb-1 text-xs opacity-85">Te queda en la wallet</p>
          <p className="mono text-2xl font-semibold">{formatearUsdt(saldoUsdt)} USDT</p>
        </div>
      )}

      <div className="tarjeta mb-3 grid grid-cols-3 divide-x" style={{ borderColor: "var(--linea)" }}>
        <Resumen titulo="Entregas" valor={String(entregas.length)} />
        <Resumen titulo={`Recibido ${moneda}`} valor={formatearMonto(totalOrigen, moneda)} />
        <Resumen titulo="USDT entregados" valor={formatearUsdt(totalUsdt)} />
      </div>

      <Link
        href="/metodos"
        className="tarjeta mb-5 flex items-center justify-between gap-3 px-4"
        style={{ minHeight: 56 }}
      >
        <div className="min-w-0">
          <p className="text-[15px] font-medium">Tasas</p>
          <p className="truncate text-xs" style={{ color: "var(--texto-suave)" }}>
            {metodos.filter((m) => m.active).length} métodos activos
          </p>
        </div>
        <span className="text-sm" style={{ color: "var(--texto-suave)" }}>
          ›
        </span>
      </Link>

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
