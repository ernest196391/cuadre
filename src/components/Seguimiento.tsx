"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useSesion } from "@/lib/sesion";
import { formatearFechaHora } from "@/lib/format";
import {
  ETIQUETA,
  PASOS,
  QUIEN_LO_CONFIRMA,
  cuandoPaso,
  estadoActual,
  siguientes,
  type Paso,
  type Salto,
} from "@/lib/seguimiento";

/**
 * Por dónde va un envío, y el botón para moverlo.
 *
 * Se apoya en la referencia que nace en la web y cruza toda la cadena, y no en
 * el id de la entrega: el seguimiento empieza cuando entra el pedido, que es
 * antes de que exista ninguna entrega registrada.
 */
export default function Seguimiento({ referencia }: { referencia: string }) {
  const { tenant, perfil } = useSesion();
  const [saltos, setSaltos] = useState<Salto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const { data, error: err } = await supabase()
      .from("envio_estados")
      .select("estado, cuando")
      .eq("tracking_ref", referencia)
      .order("cuando", { ascending: true });
    if (err) setError("No se pudo leer el seguimiento.");
    setSaltos((data ?? []) as Salto[]);
    setCargando(false);
  }, [referencia]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function marcar(paso: Paso) {
    if (!tenant) return;
    setGuardando(paso);
    setError(null);
    const { error: err } = await supabase().from("envio_estados").insert({
      tenant_id: tenant.id,
      tracking_ref: referencia,
      estado: paso,
      quien: perfil?.contact_id ?? null,
    });
    setGuardando(null);
    if (err) {
      setError("No se pudo guardar. " + err.message);
      return;
    }
    cargar();
  }

  const actual = estadoActual(saltos);
  const porDelante = siguientes(saltos);

  if (cargando) {
    return (
      <p className="py-3 text-sm" style={{ color: "var(--texto-suave)" }}>
        Cargando el seguimiento…
      </p>
    );
  }

  return (
    <div>
      <p className="etiqueta">Por dónde va</p>

      <ol className="flex flex-col gap-0">
        {PASOS.map((paso, i) => {
          const cuando = cuandoPaso(saltos, paso);
          const hecho = cuando !== null;
          const ultimo = i === PASOS.length - 1;
          return (
            <li key={paso} className="flex gap-3">
              {/* La línea de tiempo: el punto y el hilo que lo une al siguiente. */}
              <div className="flex flex-col items-center">
                <span
                  className="mt-1 block rounded-full"
                  style={{
                    width: "0.7rem",
                    height: "0.7rem",
                    background: hecho ? "var(--marca)" : "var(--linea)",
                  }}
                />
                {/* El hilo une un punto con el siguiente. Después del último no
                    hay siguiente, y una línea que sale de «Entregado» hacia
                    abajo insinúa que todavía queda algo. */}
                {!ultimo && (
                  <span
                    className="w-px flex-1"
                    style={{ background: hecho ? "var(--marca)" : "var(--linea)", minHeight: "1.2rem" }}
                  />
                )}
              </div>
              <div className="pb-2">
                <p
                  className="text-sm"
                  style={{
                    color: hecho ? "var(--texto)" : "var(--texto-suave)",
                    fontWeight: hecho ? 600 : 400,
                  }}
                >
                  {ETIQUETA[paso]}
                </p>
                <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
                  {cuando ? formatearFechaHora(cuando) : QUIEN_LO_CONFIRMA[paso]}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      {actual === "cancelado" && (
        <p className="mt-2 text-sm" style={{ color: "#b3261e" }}>
          Este envío está cancelado.
        </p>
      )}

      {/* Se ofrecen TODOS los pasos que quedan, no solo el siguiente: cuando el
          dinero se cambia en mano, los cuatro ocurren a la vez, y obligar a
          pulsar tres botones seguidos sería falsear las horas. */}
      {porDelante.length > 0 && (
        <div className="mt-2 flex flex-col gap-2">
          {porDelante.map((paso) => (
            <button
              key={paso}
              type="button"
              className="boton-secundario w-full justify-center text-sm"
              disabled={guardando !== null}
              onClick={() => marcar(paso)}
            >
              {guardando === paso ? "Guardando…" : `Marcar «${ETIQUETA[paso]}»`}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="mt-2 text-sm" style={{ color: "#b3261e" }} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
