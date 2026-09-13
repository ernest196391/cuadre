"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { formatearUsd } from "@/lib/comisiones";

/**
 * Quién hizo el pedido, si lo hizo con su cuenta de la web.
 *
 * Sirve para dos decisiones concretas de quien atiende: si esa persona está
 * verificada —de eso depende si se le entrega en Cuba antes de que pague— y a
 * quién hay que entregarle, con su dirección.
 *
 * El carnet no sale por aquí. Para mirarlo hay que entrar al panel de la web,
 * donde queda registrado quién lo abrió.
 */

interface Cliente {
  nombre: string | null;
  telefono: string | null;
  nivel: string;
  credito_usd: number;
  benef_nombre: string | null;
  benef_telefono: string | null;
  benef_provincia: string | null;
  benef_municipio: string | null;
  benef_zona: string | null;
  benef_direccion: string | null;
  benef_referencia: string | null;
}

const ETIQUETA: Record<string, string> = {
  sin_verificar: "Sin verificar",
  en_revision: "En revisión",
  verificado: "Verificado",
  confianza: "De confianza",
  rechazado: "No verificado",
};

export default function ClienteDeLaWeb({ referencia }: { referencia: string }) {
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [cargado, setCargado] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data } = await supabase().rpc("cliente_de_la_web", { ref: referencia });
      if (!vivo) return;
      const filas = (data ?? []) as Cliente[];
      setCliente(filas[0] ?? null);
      setCargado(true);
    })();
    return () => { vivo = false; };
  }, [referencia]);

  // Sin cuenta no hay nada que contar, y un bloque vacío solo estorba: la
  // mayoría de los pedidos seguirán entrando por WhatsApp.
  if (!cargado || !cliente) return null;

  const deFiar = cliente.nivel === "verificado" || cliente.nivel === "confianza";
  const direccion = [
    cliente.benef_municipio,
    cliente.benef_zona,
    cliente.benef_provincia,
    cliente.benef_direccion,
    cliente.benef_referencia,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="tarjeta mb-4 p-4">
      <p className="etiqueta">Tiene cuenta en la web</p>
      <div className="flex items-center gap-2">
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold"
          style={
            deFiar
              ? { background: "rgba(16,185,129,.12)", color: "#056c4d" }
              : { background: "rgba(107,114,128,.14)", color: "#4b5563" }
          }
        >
          {deFiar ? "✓ " : ""}
          {ETIQUETA[cliente.nivel] ?? cliente.nivel}
        </span>
        <p className="min-w-0 truncate text-[0.9375rem] font-semibold">{cliente.nombre ?? "—"}</p>
      </div>
      {cliente.telefono && (
        <p className="mono mt-1 text-xs" style={{ color: "var(--texto-suave)" }}>
          {cliente.telefono}
        </p>
      )}

      {Number(cliente.credito_usd) > 0 && (
        <p className="mt-2 text-sm">
          Se le puede adelantar hasta{" "}
          <strong>{formatearUsd(Number(cliente.credito_usd))} USD</strong> en Cuba antes de que
          pague allá.
        </p>
      )}

      {cliente.benef_nombre && (
        <>
          <p className="etiqueta mt-3">Quién recibe en Cuba</p>
          <p className="text-sm font-medium">{cliente.benef_nombre}</p>
          {cliente.benef_telefono && (
            <p className="mono text-xs" style={{ color: "var(--texto-suave)" }}>
              {cliente.benef_telefono}
            </p>
          )}
          {direccion && (
            <p className="mt-1 text-xs" style={{ color: "var(--texto-suave)" }}>
              {direccion}
            </p>
          )}
        </>
      )}
    </div>
  );
}
