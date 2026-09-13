"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useSesion } from "@/lib/sesion";
import { formatearFechaHora } from "@/lib/format";
import {
  ETIQUETA,
  INCIDENCIAS,
  QUIEN_LO_CONFIRMA,
  cuandoPaso,
  esIncidencia,
  estadoActual,
  flujoDe,
  incidenciasDe,
  pasosDe,
  siguientes,
  type Estado,
  type Flujo,
  type Paso,
  type Salto,
} from "@/lib/seguimiento";

/**
 * Por dónde va un envío, y los botones para moverlo.
 *
 * Se apoya en la referencia que nace en la web y cruza toda la cadena, y no en
 * el id de la entrega: el seguimiento empieza cuando entra el pedido, que es
 * antes de que exista ninguna entrega registrada.
 *
 * El flujo —remesa o tienda— lo trae el primer salto desde la base. Se puede
 * pasar `flujo` como respaldo para cuando todavía no hay ningún salto, pero
 * nunca manda sobre lo que diga la base.
 */
export default function Seguimiento({ referencia, flujo }: { referencia: string; flujo?: Flujo }) {
  const { tenant, perfil } = useSesion();
  const [saltos, setSaltos] = useState<Salto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [anotando, setAnotando] = useState<Estado | null>(null);
  const [notaPublica, setNotaPublica] = useState("");
  const [notaInterna, setNotaInterna] = useState("");

  const cargar = useCallback(async () => {
    const { data, error: err } = await supabase()
      .from("envio_estados")
      .select("estado, flujo, nota_publica, nota_interna, cuando")
      .eq("tracking_ref", referencia)
      .order("cuando", { ascending: true });
    if (err) setError("No se pudo leer el seguimiento.");
    setSaltos((data ?? []) as Salto[]);
    setCargando(false);
  }, [referencia]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function guardar(estado: Estado, publica?: string, interna?: string) {
    if (!tenant) return;
    setGuardando(estado);
    setError(null);
    const { error: err } = await supabase().from("envio_estados").insert({
      tenant_id: tenant.id,
      tracking_ref: referencia,
      estado,
      flujo: elFlujo,
      quien: perfil?.contact_id ?? null,
      nota_publica: publica?.trim() || null,
      nota_interna: interna?.trim() || null,
    });
    setGuardando(null);
    if (err) {
      setError("No se pudo guardar. " + err.message);
      return;
    }
    setAnotando(null);
    setNotaPublica("");
    setNotaInterna("");
    cargar();
  }

  const elFlujo = flujoDe(saltos, flujo);
  const pasos = pasosDe(elFlujo);
  const actual = estadoActual(saltos);
  const porDelante = siguientes(saltos, elFlujo);
  const incidencias = incidenciasDe(saltos);
  const cerrado = saltos.some((s) => s.estado === "cancelado" || s.estado === "reembolsado");

  if (cargando) {
    return (
      <p className="py-3 text-sm" style={{ color: "var(--texto-suave)" }}>
        Cargando el seguimiento…
      </p>
    );
  }

  return (
    <div>
      <p className="etiqueta">
        Por dónde va{elFlujo === "tienda" ? " · pedido de tienda" : ""}
      </p>

      <ol className="flex flex-col gap-0">
        {pasos.map((paso, i) => {
          const cuando = cuandoPaso(saltos, paso);
          const hecho = cuando !== null;
          const ultimo = i === pasos.length - 1;
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
                {/* Del último no sale hilo: una línea que baja de «Entregado»
                    insinúa que todavía queda algo. */}
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
                  {cuando ? formatearFechaHora(cuando) : QUIEN_LO_CONFIRMA[paso as Paso]}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      {/* Las incidencias, aparte de la cadena: no son un paso hacia adelante. */}
      {incidencias.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {incidencias.map((s, i) => (
            <li
              key={`${s.estado}-${i}`}
              className="rounded-lg px-3 py-2 text-xs"
              style={{
                background: s.estado === "cancelado" ? "rgba(196,61,75,.08)" : "rgba(245,158,11,.10)",
                color: s.estado === "cancelado" ? "#b3261e" : "#8a5a00",
              }}
            >
              <strong>{ETIQUETA[s.estado]}</strong> · {formatearFechaHora(s.cuando)}
              {s.nota_publica && <span> — {s.nota_publica}</span>}
              {s.nota_interna && (
                <span style={{ opacity: 0.75 }}> · interno: {s.nota_interna}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {cerrado && (
        <p className="mt-2 text-sm" style={{ color: "#b3261e" }}>
          Este envío está cerrado. No se puede seguir moviendo.
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
              onClick={() => guardar(paso)}
            >
              {guardando === paso ? "Guardando…" : `Marcar «${ETIQUETA[paso]}»`}
            </button>
          ))}
        </div>
      )}

      {/* Anotar lo que sale mal. Con dos notas: la que lee el cliente y la que
          no. Con un solo campo hay que elegir entre no apuntar nada operativo
          o contárselo todo a quien compró. */}
      {!cerrado && (
        <div className="mt-3">
          {anotando ? (
            <div
              className="rounded-lg p-3"
              style={{ background: "var(--fondo)", border: "1px solid var(--linea)" }}
            >
              <p className="text-sm font-semibold">{ETIQUETA[anotando]}</p>
              <label className="etiqueta mt-2" htmlFor="nota-publica">
                Lo que verá el cliente
              </label>
              <input
                id="nota-publica"
                value={notaPublica}
                onChange={(e) => setNotaPublica(e.target.value)}
                placeholder="Hay demora con el proveedor"
              />
              <label className="etiqueta mt-2" htmlFor="nota-interna">
                Nota interna (no la ve)
              </label>
              <input
                id="nota-interna"
                value={notaInterna}
                onChange={(e) => setNotaInterna(e.target.value)}
                placeholder="Probar con el proveedor B"
              />
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  className="boton-secundario flex-1 justify-center text-sm"
                  onClick={() => { setAnotando(null); setNotaPublica(""); setNotaInterna(""); }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="boton-primario flex-1"
                  disabled={guardando !== null}
                  onClick={() => guardar(anotando, notaPublica, notaInterna)}
                >
                  {guardando ? "Guardando…" : "Anotar"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {INCIDENCIAS.filter(
                // Una sustitución solo tiene sentido cuando hay algo que sustituir.
                (inc) => inc !== "sustitucion_pendiente" || elFlujo === "tienda",
              ).map((inc) => (
                <button
                  key={inc}
                  type="button"
                  className="text-xs font-medium"
                  style={{ color: "var(--texto-suave)", minHeight: "2.75rem" }}
                  onClick={() => setAnotando(inc)}
                >
                  {ETIQUETA[inc]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {actual && esIncidencia(actual) && !cerrado && (
        <p className="mt-2 text-xs" style={{ color: "var(--texto-suave)" }}>
          Lo último anotado es una incidencia. El envío sigue por donde iba.
        </p>
      )}

      {error && (
        <p className="mt-2 text-sm" style={{ color: "#b3261e" }} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
