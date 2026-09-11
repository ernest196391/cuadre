"use client";

import { useMemo, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase/client";
import { useSesion } from "@/lib/sesion";
import { formatearFechaHora, parsearNumero } from "@/lib/format";

/**
 * A cuánto se vende el USDT en destino. Es la segunda tasa del negocio y la que
 * más se mueve: con el mismo envío, 955 o 900 son cientos de diferencia.
 *
 * La pone cualquiera del equipo, no solo el dueño: quien ve el precio real es
 * el que está en el país de destino.
 */
export default function TasasUsdt() {
  const { tenant, perfil, metodos, tasasUsdt, refrescar } = useSesion();

  const [editando, setEditando] = useState<string | null>(null);
  const [valor, setValor] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Una tasa por cada moneda en la que se entrega de verdad.
  const monedas = useMemo(() => {
    const s = new Set(metodos.filter((m) => m.active).map((m) => m.target_currency));
    return Array.from(s);
  }, [metodos]);

  function formatearTasa(n: number) {
    return n.toLocaleString("es", { maximumFractionDigits: 4 });
  }

  async function guardar(e: FormEvent, moneda: string) {
    e.preventDefault();
    const nueva = parsearNumero(valor);
    if (!(nueva > 0)) return setError("Escribe a cuánto está el USDT.");
    if (!tenant || !perfil) return;

    setGuardando(true);
    setError(null);
    const { error: err } = await supabase().from("usdt_market_rates").insert({
      tenant_id: tenant.id,
      currency: moneda,
      rate: nueva,
      created_by: perfil.id,
    });
    setGuardando(false);
    if (err) {
      setError("No se pudo guardar. " + err.message);
      return;
    }
    setEditando(null);
    setValor("");
    refrescar();
  }

  if (monedas.length === 0) return null;

  return (
    <>
      <h2 className="mb-1 mt-6 text-sm font-semibold" style={{ color: "var(--texto-suave)" }}>
        A cuánto está el USDT
      </h2>
      <p className="mb-2 text-xs" style={{ color: "var(--texto-suave)" }}>
        Lo que te dan por 1 USDT en destino. Con esto la app calcula sola cuántos hacen falta.
      </p>

      <ul className="flex flex-col gap-2">
        {monedas.map((moneda) => {
          const actual = tasasUsdt.find((t) => t.currency === moneda);
          const abierto = editando === moneda;
          return (
            <li key={moneda} className="tarjeta p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="mono text-lg font-semibold" style={{ color: "var(--marca)" }}>
                    {actual ? `1 USDT = ${formatearTasa(actual.rate)} ${moneda}` : `Sin tasa de ${moneda}`}
                  </p>
                  <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
                    {actual ? `Puesta ${formatearFechaHora(actual.recorded_at)}` : "Hace falta para calcular los USDT"}
                  </p>
                </div>
                {!abierto && (
                  <button
                    className="boton-secundario shrink-0 text-sm"
                    style={{ minHeight: 44 }}
                    onClick={() => {
                      setEditando(moneda);
                      setValor("");
                      setError(null);
                    }}
                    type="button"
                  >
                    {actual ? "Cambiar" : "Poner"}
                  </button>
                )}
              </div>

              {abierto && (
                <form onSubmit={(e) => guardar(e, moneda)} className="mt-3 border-t pt-3" style={{ borderColor: "var(--linea)" }}>
                  <label className="etiqueta" htmlFor={`usdt-${moneda}`}>
                    1 USDT = ? {moneda}
                  </label>
                  <input
                    id={`usdt-${moneda}`}
                    className="mono"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    autoFocus
                    value={valor}
                    onChange={(e) => setValor(e.target.value)}
                    style={{ fontSize: 20 }}
                  />
                  <div className="mt-3 flex gap-2">
                    <button
                      className="boton-secundario flex-1 justify-center"
                      type="button"
                      onClick={() => setEditando(null)}
                    >
                      Cancelar
                    </button>
                    <button className="boton-primario flex-1" type="submit" disabled={guardando}>
                      {guardando ? "Guardando…" : "Guardar"}
                    </button>
                  </div>
                  {error && (
                    <p className="mt-2 text-sm" style={{ color: "#b3261e" }}>
                      {error}
                    </p>
                  )}
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
