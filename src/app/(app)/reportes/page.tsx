"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useSesion } from "@/lib/sesion";
import { formatearCosto, formatearMonto, formatearUsdt } from "@/lib/format";
import {
  costoPromedioUsdt, mesDe, porMetodo, porResponsable, semanaDe, sumar,
  type CompraFila, type EntregaFila,
} from "@/lib/reportes";

type Periodo = "semana" | "mes";

export default function ReportesPage() {
  const { tenant, metodos } = useSesion();
  const moneda = tenant?.base_currency ?? "";

  const [periodo, setPeriodo] = useState<Periodo>("semana");
  const [desplazamiento, setDesplazamiento] = useState(0);
  const [compras, setCompras] = useState<CompraFila[]>([]);
  const [entregas, setEntregas] = useState<EntregaFila[]>([]);
  const [nombres, setNombres] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const rango = useMemo(() => {
    const ancla = new Date();
    if (periodo === "semana") ancla.setDate(ancla.getDate() + desplazamiento * 7);
    else ancla.setMonth(ancla.getMonth() + desplazamiento);
    return periodo === "semana" ? semanaDe(ancla) : mesDe(ancla);
  }, [periodo, desplazamiento]);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const sb = supabase();
      const [pRes, dRes, cRes] = await Promise.all([
        // Todas las compras hasta el final del período: el promedio ponderado
        // se calcula con todo lo comprado hasta esa fecha, no solo con lo del
        // período, porque el USDT de este mes pudo comprarse el mes pasado.
        sb.from("purchases")
          .select("purchased_at, source_amount, fee_source_amount, usdt_received")
          .is("voided_at", null)
          .lt("purchased_at", rango.fin.toISOString()),
        sb.from("deliveries")
          .select(
            "delivered_at, source_amount_received, usdt_spent, network_fee_usdt, commission_applied, commission_currency, courier_fee, courier_fee_currency, method_id, handled_by_contact_id"
          )
          .is("voided_at", null)
          .gte("delivered_at", rango.inicio.toISOString())
          .lt("delivered_at", rango.fin.toISOString()),
        sb.from("contacts").select("id, full_name"),
      ]);
      if (pRes.error) throw pRes.error;
      if (dRes.error) throw dRes.error;
      if (cRes.error) throw cRes.error;

      setCompras((pRes.data ?? []) as CompraFila[]);
      setEntregas((dRes.data ?? []) as EntregaFila[]);
      const mapa: Record<string, string> = {};
      for (const c of cRes.data ?? []) mapa[c.id as string] = c.full_name as string;
      setNombres(mapa);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar las cuentas.");
    } finally {
      setCargando(false);
    }
  }, [rango]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const costoUsdt = costoPromedioUsdt(compras, rango.fin);
  const totales = sumar(entregas, costoUsdt);
  const metodosOrdenados = porMetodo(entregas, costoUsdt);
  const responsables = porResponsable(entregas, costoUsdt);

  const etiquetaRango =
    periodo === "semana"
      ? `${rango.inicio.toLocaleDateString("es", { day: "2-digit", month: "short" })} – ${new Date(
          rango.fin.getTime() - 1
        ).toLocaleDateString("es", { day: "2-digit", month: "short" })}`
      : rango.inicio.toLocaleDateString("es", { month: "long", year: "numeric" });

  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">Cuentas</h1>

      <div className="mb-3 grid grid-cols-2 gap-2">
        {(["semana", "mes"] as Periodo[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => {
              setPeriodo(p);
              setDesplazamiento(0);
            }}
            aria-pressed={periodo === p}
            className="rounded-xl text-[15px] font-semibold capitalize"
            style={{
              minHeight: 44,
              border: `1.5px solid ${periodo === p ? "var(--marca)" : "var(--linea)"}`,
              color: periodo === p ? "var(--marca)" : "var(--texto-suave)",
              background: periodo === p ? "color-mix(in srgb, var(--marca) 7%, white)" : "var(--tarjeta)",
            }}
          >
            {p === "semana" ? "Esta semana" : "Este mes"}
          </button>
        ))}
      </div>

      <div className="mb-5 flex items-center justify-between gap-2">
        <button
          className="boton-secundario px-4"
          style={{ minHeight: 44 }}
          onClick={() => setDesplazamiento((d) => d - 1)}
          type="button"
          aria-label="Período anterior"
        >
          ‹
        </button>
        <span className="text-sm font-medium capitalize">{etiquetaRango}</span>
        <button
          className="boton-secundario px-4"
          style={{ minHeight: 44, opacity: desplazamiento >= 0 ? 0.4 : 1 }}
          onClick={() => setDesplazamiento((d) => Math.min(0, d + 1))}
          disabled={desplazamiento >= 0}
          type="button"
          aria-label="Período siguiente"
        >
          ›
        </button>
      </div>

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
      ) : totales.entregas === 0 ? (
        <div
          className="rounded-2xl border border-dashed p-6 text-center text-sm"
          style={{ borderColor: "var(--linea)", color: "var(--texto-suave)" }}
        >
          No hay entregas registradas en este período.
        </div>
      ) : (
        <>
          <div className="mb-4 rounded-2xl px-5 py-5" style={{ background: "var(--marca)", color: "#fff" }}>
            <p className="mb-1 text-xs opacity-80">Ganancia neta</p>
            <p className="mono mb-1 text-3xl font-semibold">
              {formatearMonto(totales.ganancia, moneda)} {moneda}
            </p>
            <p className="text-xs opacity-80">
              {totales.entregas} {totales.entregas === 1 ? "entrega" : "entregas"}
              {totales.margen !== null &&
                ` · ${totales.margen.toLocaleString("es", { maximumFractionDigits: 1 })}% de lo recibido`}
            </p>
          </div>

          <div className="tarjeta mb-5 divide-y" style={{ borderColor: "var(--linea)" }}>
            <Linea etiqueta="Recibido de clientes" valor={`${formatearMonto(totales.ingreso, moneda)} ${moneda}`} />
            <Linea
              etiqueta="Costo del USDT"
              valor={`−${formatearMonto(totales.costoUsdt, moneda)} ${moneda}`}
              nota={`${formatearUsdt(totales.usdtMovidos)} USDT a ${formatearCosto(costoUsdt)} ${moneda}`}
            />
            <Linea etiqueta="Comisiones" valor={`−${formatearMonto(totales.comisiones, moneda)} ${moneda}`} />
            {totales.mensajeria > 0 && (
              <Linea etiqueta="Mensajería" valor={`−${formatearMonto(totales.mensajeria, moneda)} ${moneda}`} />
            )}
            <Linea
              etiqueta="Ganancia"
              valor={`${formatearMonto(totales.ganancia, moneda)} ${moneda}`}
              fuerte
            />
          </div>

          <h2 className="mb-1 text-sm font-semibold" style={{ color: "var(--texto-suave)" }}>
            Por método
          </h2>
          <p className="mb-2 text-xs" style={{ color: "var(--texto-suave)" }}>
            Lo que deja cada envío y lo que deja acumulado: no siempre gana el mismo.
          </p>
          <ul className="mb-5 flex flex-col gap-2">
            {metodosOrdenados.map((g) => (
              <li key={g.clave} className="tarjeta p-4">
                <p className="mb-2 text-[15px] font-medium">
                  {metodos.find((m) => m.id === g.clave)?.label ?? "Sin método"}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Mini
                    titulo="Por envío"
                    valor={`${formatearMonto(g.gananciaPorOperacion, moneda)} ${moneda}`}
                  />
                  <Mini
                    titulo={`Acumulado (${g.totales.entregas})`}
                    valor={`${formatearMonto(g.totales.ganancia, moneda)} ${moneda}`}
                  />
                </div>
              </li>
            ))}
          </ul>

          <h2 className="mb-1 text-sm font-semibold" style={{ color: "var(--texto-suave)" }}>
            Por responsable
          </h2>
          <p className="mb-2 text-xs" style={{ color: "var(--texto-suave)" }}>
            La ganancia ya lleva su comisión descontada.
          </p>
          <ul className="flex flex-col gap-2">
            {responsables.map((g) => (
              <li key={g.clave} className="tarjeta flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-medium">{nombres[g.clave] ?? "—"}</p>
                  <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
                    {g.totales.entregas} {g.totales.entregas === 1 ? "entrega" : "entregas"} · comisión{" "}
                    {formatearMonto(g.totales.comisiones, moneda)} {moneda}
                  </p>
                </div>
                <p className="mono shrink-0 text-sm font-semibold">
                  {formatearMonto(g.totales.ganancia, moneda)} {moneda}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function Linea({
  etiqueta, valor, nota, fuerte,
}: { etiqueta: string; valor: string; nota?: string; fuerte?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className={`text-sm ${fuerte ? "font-semibold" : ""}`}>{etiqueta}</p>
        {nota && (
          <p className="mono text-xs" style={{ color: "var(--texto-suave)" }}>
            {nota}
          </p>
        )}
      </div>
      <p className={`mono shrink-0 text-sm ${fuerte ? "font-semibold" : ""}`}>{valor}</p>
    </div>
  );
}

function Mini({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div>
      <p className="text-[11px]" style={{ color: "var(--texto-suave)" }}>
        {titulo}
      </p>
      <p className="mono text-sm font-semibold">{valor}</p>
    </div>
  );
}
