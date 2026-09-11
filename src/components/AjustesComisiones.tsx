"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase/client";
import { useSesion } from "@/lib/sesion";
import { esHeredado, porcentajeDe, type ReglaPersona, type TipoComision } from "@/lib/comisiones";
import { filtrarMonto } from "@/components/CampoMonto";

interface Persona extends ReglaPersona {
  contact_id: string;
  full_name: string;
  active: boolean;
}

function formatearPct(n: number) {
  return n.toLocaleString("es", { maximumFractionDigits: 3 });
}
function parsearPct(texto: string) {
  const n = parseFloat(texto.replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Quién cobra cuánto. Un porcentaje para todos, y el de cada persona encima si
 * hace falta. Sin valor propio, hereda: así subir el estándar cambia a todo el
 * equipo de una vez, y quien tenga trato aparte no se ve arrastrado.
 */
export default function AjustesComisiones() {
  const { tenant, perfil, refrescar } = useSesion();

  const [personas, setPersonas] = useState<Persona[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [gEntregar, setGEntregar] = useState("");
  const [gConseguir, setGConseguir] = useState("");
  const [guardandoGlobal, setGuardandoGlobal] = useState(false);

  const [editando, setEditando] = useState<string | null>(null);
  const [pEntregar, setPEntregar] = useState("");
  const [pConseguir, setPConseguir] = useState("");
  const [guardandoPersona, setGuardandoPersona] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const { data, error: err } = await supabase()
        .from("workers")
        .select("contact_id, delivery_pct, origination_pct, active, contacts:contact_id(full_name)");
      if (err) throw err;
      const lista = (data ?? []).map((w) => {
        const fila = w as unknown as {
          contact_id: string;
          delivery_pct: number | null;
          origination_pct: number | null;
          active: boolean;
          contacts: { full_name: string } | null;
        };
        return {
          contact_id: fila.contact_id,
          full_name: fila.contacts?.full_name ?? "—",
          delivery_pct: fila.delivery_pct === null ? null : Number(fila.delivery_pct),
          origination_pct: fila.origination_pct === null ? null : Number(fila.origination_pct),
          active: fila.active,
        };
      });
      lista.sort((a, b) => a.full_name.localeCompare(b.full_name));
      setPersonas(lista);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar las comisiones.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (tenant) {
      setGEntregar(formatearPct(tenant.commission_delivery_pct));
      setGConseguir(formatearPct(tenant.commission_origination_pct));
    }
  }, [tenant]);

  async function guardarGlobal(e: FormEvent) {
    e.preventDefault();
    const a = parsearPct(gEntregar);
    const b = parsearPct(gConseguir);
    if (!Number.isFinite(a) || a < 0 || a > 100 || !Number.isFinite(b) || b < 0 || b > 100) {
      setError("Los porcentajes van de 0 a 100.");
      return;
    }
    if (!tenant) return;
    setGuardandoGlobal(true);
    setError(null);
    const { error: err } = await supabase()
      .from("tenants")
      .update({ commission_delivery_pct: a, commission_origination_pct: b })
      .eq("id", tenant.id);
    setGuardandoGlobal(false);
    if (err) {
      setError("No se pudo guardar. " + err.message);
      return;
    }
    setAviso("Comisiones del equipo guardadas.");
    refrescar();
  }

  async function guardarPersona(e: FormEvent, p: Persona) {
    e.preventDefault();
    // Vacío significa heredar, que es distinto de cobrar 0.
    const a = pEntregar.trim() === "" ? null : parsearPct(pEntregar);
    const b = pConseguir.trim() === "" ? null : parsearPct(pConseguir);
    if ((a !== null && (!Number.isFinite(a) || a < 0 || a > 100)) ||
        (b !== null && (!Number.isFinite(b) || b < 0 || b > 100))) {
      setError("Los porcentajes van de 0 a 100. Déjalo vacío para que herede.");
      return;
    }
    setGuardandoPersona(true);
    setError(null);
    const { error: err } = await supabase()
      .from("workers")
      .update({ delivery_pct: a, origination_pct: b, updated_by: perfil?.id ?? null })
      .eq("contact_id", p.contact_id);
    setGuardandoPersona(false);
    if (err) {
      setError("No se pudo guardar. " + err.message);
      return;
    }
    setEditando(null);
    setAviso(`Comisión de ${p.full_name} guardada.`);
    cargar();
  }

  if (perfil?.role !== "owner") return null;

  return (
    <>
      <h2 className="mb-1 text-sm font-semibold" style={{ color: "var(--texto-suave)" }}>
        Comisiones
      </h2>
      <p className="mb-3 text-xs" style={{ color: "var(--texto-suave)" }}>
        Se calculan sobre el valor entregado en USD.
      </p>

      {aviso && (
        <p
          className="mb-3 rounded-xl px-4 py-3 text-sm"
          style={{ background: "rgba(30,122,75,.1)", color: "#1E7A4B" }}
          role="status"
        >
          {aviso}
        </p>
      )}
      {error && (
        <p className="mb-3 text-sm" style={{ color: "#b3261e" }} role="alert">
          {error}
        </p>
      )}

      <form onSubmit={guardarGlobal} className="tarjeta mb-4 p-4">
        <p className="mb-3 text-[15px] font-semibold">Para todo el equipo</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="etiqueta" htmlFor="g-entregar">
              Por entregar
            </label>
            <div className="flex items-center gap-2">
              <input
                id="g-entregar"
                className="mono"
                inputMode="decimal"
                value={gEntregar}
                onChange={(e) => setGEntregar(filtrarMonto(e.target.value))}
              />
              <span className="mono shrink-0 text-sm" style={{ color: "var(--texto-suave)" }}>
                %
              </span>
            </div>
          </div>
          <div>
            <label className="etiqueta" htmlFor="g-conseguir">
              Por conseguir
            </label>
            <div className="flex items-center gap-2">
              <input
                id="g-conseguir"
                className="mono"
                inputMode="decimal"
                value={gConseguir}
                onChange={(e) => setGConseguir(filtrarMonto(e.target.value))}
              />
              <span className="mono shrink-0 text-sm" style={{ color: "var(--texto-suave)" }}>
                %
              </span>
            </div>
          </div>
        </div>
        <button className="boton-primario mt-4" type="submit" disabled={guardandoGlobal}>
          {guardandoGlobal ? "Guardando…" : "Guardar"}
        </button>
      </form>

      <p className="mb-2 text-[15px] font-semibold">Persona por persona</p>

      {cargando ? (
        <p className="py-4 text-center text-sm" style={{ color: "var(--texto-suave)" }}>
          Cargando…
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {personas.map((p) => {
            const abierto = editando === p.contact_id;
            const entregar = porcentajeDe("delivery" as TipoComision, p, tenant);
            const conseguir = porcentajeDe("origination" as TipoComision, p, tenant);
            return (
              <li key={p.contact_id} className="tarjeta p-4" style={p.active ? undefined : { opacity: 0.6 }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-medium">{p.full_name}</p>
                    <p className="mono text-xs" style={{ color: "var(--texto-suave)" }}>
                      entregar {formatearPct(entregar)}%
                      {esHeredado("delivery", p) && " (del equipo)"} · conseguir {formatearPct(conseguir)}%
                      {esHeredado("origination", p) && " (del equipo)"}
                    </p>
                  </div>
                  {!abierto && (
                    <button
                      className="boton-secundario shrink-0 text-sm"
                      style={{ minHeight: 44 }}
                      type="button"
                      onClick={() => {
                        setEditando(p.contact_id);
                        setPEntregar(p.delivery_pct === null ? "" : formatearPct(p.delivery_pct));
                        setPConseguir(p.origination_pct === null ? "" : formatearPct(p.origination_pct));
                      }}
                    >
                      Cambiar
                    </button>
                  )}
                </div>

                {abierto && (
                  <form
                    onSubmit={(e) => guardarPersona(e, p)}
                    className="mt-3 border-t pt-3"
                    style={{ borderColor: "var(--linea)" }}
                  >
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="etiqueta" htmlFor={`e-${p.contact_id}`}>
                          Por entregar
                        </label>
                        <input
                          id={`e-${p.contact_id}`}
                          className="mono"
                          inputMode="decimal"
                          placeholder="vacío = del equipo"
                          value={pEntregar}
                          onChange={(e) => setPEntregar(filtrarMonto(e.target.value))}
                        />
                      </div>
                      <div>
                        <label className="etiqueta" htmlFor={`c-${p.contact_id}`}>
                          Por conseguir
                        </label>
                        <input
                          id={`c-${p.contact_id}`}
                          className="mono"
                          inputMode="decimal"
                          placeholder="vacío = del equipo"
                          value={pConseguir}
                          onChange={(e) => setPConseguir(filtrarMonto(e.target.value))}
                        />
                      </div>
                    </div>
                    <p className="mt-2 text-xs" style={{ color: "var(--texto-suave)" }}>
                      Déjalo vacío para que use el del equipo. Escribe 0 si esta persona no cobra.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        className="boton-secundario flex-1 justify-center"
                        type="button"
                        onClick={() => setEditando(null)}
                      >
                        Cancelar
                      </button>
                      <button className="boton-primario flex-1" type="submit" disabled={guardandoPersona}>
                        {guardandoPersona ? "Guardando…" : "Guardar"}
                      </button>
                    </div>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
