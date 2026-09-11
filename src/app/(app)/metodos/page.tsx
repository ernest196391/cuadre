"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase/client";
import { useSesion, type Metodo } from "@/lib/sesion";
import { formatearFechaHora } from "@/lib/format";
import { tasaLegible } from "@/lib/tasas";
import { slugifyUnico } from "@/lib/slug";
import ConfirmarDialogo from "@/components/ConfirmarDialogo";
import CampoTasa, { direccionSugerida, tasaDesdeTexto, type Direccion } from "@/components/CampoTasa";

interface MetodoFila extends Metodo {
  updated_at: string;
  updated_by: string | null;
}

interface CambioTasa {
  id: number;
  method_id: string;
  rate: number;
  changed_at: string;
}

export default function MetodosPage() {
  const { tenant, perfil, recargar } = useSesion();
  const monedaOrigen = tenant?.base_currency ?? "";
  const esDueno = perfil?.role === "owner";

  const [metodos, setMetodos] = useState<MetodoFila[]>([]);
  const [historial, setHistorial] = useState<CambioTasa[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);

  const [editando, setEditando] = useState<string | null>(null);
  const [textoTasa, setTextoTasa] = useState("");
  const [direccion, setDireccion] = useState<Direccion>("directa");
  const [confirmarTasa, setConfirmarTasa] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const [confirmarBaja, setConfirmarBaja] = useState<MetodoFila | null>(null);
  const [cambiandoEstado, setCambiandoEstado] = useState<string | null>(null);

  const [formAbierto, setFormAbierto] = useState(false);
  const [nEtiqueta, setNEtiqueta] = useState("");
  const [nMoneda, setNMoneda] = useState("");
  const [nTasa, setNTasa] = useState("");
  const [nDireccion, setNDireccion] = useState<Direccion>("directa");
  const [nNota, setNNota] = useState("");
  const [creando, setCreando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const sb = supabase();
      const [mRes, hRes] = await Promise.all([
        sb.from("delivery_methods")
          .select("id, key, label, target_currency, rate, note, active, sort_order, updated_at, updated_by")
          .order("sort_order", { ascending: true }),
        sb.from("delivery_method_rate_history")
          .select("id, method_id, rate, changed_at")
          .order("changed_at", { ascending: false })
          .limit(12),
      ]);
      if (mRes.error) throw mRes.error;
      if (hRes.error) throw hRes.error;
      setMetodos(((mRes.data ?? []) as MetodoFila[]).map((m) => ({ ...m, rate: Number(m.rate) })));
      setHistorial(((hRes.data ?? []) as CambioTasa[]).map((h) => ({ ...h, rate: Number(h.rate) })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los métodos.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const enEdicion = metodos.find((m) => m.id === editando) ?? null;
  const tasaNueva = tasaDesdeTexto(textoTasa, direccion);

  function abrirEdicion(m: MetodoFila) {
    setErrorAccion(null);
    setEditando(m.id);
    // Campo vacío: si apareciera la tasa vigente escrita, bastaría con no
    // tocarla para "guardar" un cambio que nadie decidió.
    setTextoTasa("");
    setDireccion(direccionSugerida(m.rate));
  }

  async function guardarTasa() {
    if (!enEdicion) return;
    setGuardando(true);
    setErrorAccion(null);
    const { error: err } = await supabase().rpc("update_method_rate", {
      p_method_id: enEdicion.id,
      p_rate: tasaNueva,
    });
    setGuardando(false);
    setConfirmarTasa(false);
    if (err) {
      setErrorAccion("No se pudo guardar la tasa. " + err.message);
      return;
    }
    setEditando(null);
    setTextoTasa("");
    await cargar();
    recargar();
  }

  async function cambiarEstado(m: MetodoFila) {
    setCambiandoEstado(m.id);
    setErrorAccion(null);
    const { error: err } = await supabase()
      .from("delivery_methods")
      .update({ active: !m.active, updated_by: perfil?.id ?? null })
      .eq("id", m.id);
    setCambiandoEstado(null);
    setConfirmarBaja(null);
    if (err) {
      setErrorAccion("No se pudo cambiar el estado. " + err.message);
      return;
    }
    await cargar();
    recargar();
  }

  const claves = metodos.map((m) => m.key);
  const nClave = slugifyUnico(nEtiqueta, claves);
  const nMonedaLimpia = nMoneda.trim().toUpperCase();
  const nTasaValor = tasaDesdeTexto(nTasa, nDireccion);
  const puedeCrear = nClave !== "" && nMonedaLimpia !== "" && nTasaValor > 0 && !creando;

  async function crearMetodo(e: FormEvent) {
    e.preventDefault();
    if (!puedeCrear || !tenant || !perfil) return;
    setCreando(true);
    setErrorForm(null);

    const sb = supabase();
    const orden = metodos.reduce((max, m) => Math.max(max, m.sort_order), 0) + 1;
    const { data, error: err } = await sb
      .from("delivery_methods")
      .insert({
        tenant_id: tenant.id,
        key: nClave,
        label: nEtiqueta.trim(),
        target_currency: nMonedaLimpia,
        rate: nTasaValor,
        note: nNota.trim() || null,
        active: true,
        sort_order: orden,
        updated_by: perfil.id,
      })
      .select("id")
      .single();

    if (err || !data) {
      setCreando(false);
      setErrorForm(
        err?.code === "23505" ? "Ya existe un método con ese nombre." : "No se pudo crear. " + (err?.message ?? "")
      );
      return;
    }

    // La tasa de arranque también queda en el historial: no debería empezar en
    // el primer cambio, sino en el primer valor.
    await sb.from("delivery_method_rate_history").insert({
      tenant_id: tenant.id,
      method_id: data.id,
      rate: nTasaValor,
      changed_by: perfil.id,
    });

    setCreando(false);
    setNEtiqueta("");
    setNMoneda("");
    setNTasa("");
    setNNota("");
    setFormAbierto(false);
    await cargar();
    recargar();
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Tasas</h1>
        {esDueno && (
          <button
            className="boton-secundario"
            style={{ color: "var(--marca)" }}
            onClick={() => {
              setFormAbierto((v) => !v);
              setErrorForm(null);
            }}
            type="button"
          >
            {formAbierto ? "Cancelar" : "+ Nuevo método"}
          </button>
        )}
      </div>

      {formAbierto && (
        <form onSubmit={crearMetodo} className="tarjeta mb-4 flex flex-col gap-4 p-4">
          <div>
            <label className="etiqueta" htmlFor="m-etiqueta">
              Nombre que ve el cliente
            </label>
            <input
              id="m-etiqueta"
              value={nEtiqueta}
              onChange={(e) => setNEtiqueta(e.target.value)}
              placeholder="CUP por transferencia"
              autoFocus
              required
            />
          </div>

          <div>
            <label className="etiqueta" htmlFor="m-moneda">
              Moneda que recibe
            </label>
            <input
              id="m-moneda"
              value={nMoneda}
              maxLength={5}
              onChange={(e) => setNMoneda(e.target.value.toUpperCase())}
              placeholder="CUP"
              required
            />
          </div>

          <div>
            <label className="etiqueta">Tasa</label>
            <CampoTasa
              id="m-tasa"
              monedaOrigen={monedaOrigen}
              monedaDestino={nMonedaLimpia}
              valor={nTasa}
              onValor={setNTasa}
              direccion={nDireccion}
              onDireccion={setNDireccion}
            />
          </div>

          <div>
            <label className="etiqueta" htmlFor="m-nota">
              Nota para el cliente
            </label>
            <input
              id="m-nota"
              value={nNota}
              onChange={(e) => setNNota(e.target.value)}
              placeholder="Disponible en toda la isla"
            />
          </div>

          <button className="boton-primario" type="submit" disabled={!puedeCrear}>
            {creando ? "Creando…" : "Crear método"}
          </button>
          {errorForm && (
            <p className="text-sm" style={{ color: "#b3261e" }}>
              {errorForm}
            </p>
          )}
        </form>
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
          <button className="boton-secundario mx-auto h-11" onClick={cargar} type="button">
            Reintentar
          </button>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {metodos.map((m) => {
            const abierto = editando === m.id;
            return (
              <li
                key={m.id}
                className="tarjeta p-4"
                style={m.active ? undefined : { borderStyle: "dashed", opacity: 0.62 }}
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold">{m.label}</p>
                    {m.note && (
                      <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
                        {m.note}
                      </p>
                    )}
                  </div>
                  {esDueno && (
                    <button
                      className="shrink-0 rounded-full px-3 text-xs font-semibold"
                      style={{
                        minHeight: 44,
                        border: `1.5px solid ${m.active ? "#1E7A4B" : "var(--linea)"}`,
                        color: m.active ? "#1E7A4B" : "var(--texto-suave)",
                        background: m.active ? "rgba(30,122,75,.09)" : "var(--tarjeta)",
                      }}
                      disabled={cambiandoEstado === m.id}
                      onClick={() => (m.active ? setConfirmarBaja(m) : cambiarEstado(m))}
                      type="button"
                    >
                      {m.active ? "Activo" : "Inactivo"}
                    </button>
                  )}
                </div>

                <p className="mono text-xl font-semibold" style={{ color: "var(--marca)" }}>
                  {tasaLegible(m.rate, m.target_currency, monedaOrigen)}
                </p>
                <p className="mt-0.5 text-xs" style={{ color: "var(--texto-suave)" }}>
                  Cambiada {formatearFechaHora(m.updated_at)}
                </p>

                {esDueno &&
                  (abierto ? (
                    <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--linea)" }}>
                      <CampoTasa
                        id={`tasa-${m.id}`}
                        monedaOrigen={monedaOrigen}
                        monedaDestino={m.target_currency}
                        valor={textoTasa}
                        onValor={setTextoTasa}
                        direccion={direccion}
                        onDireccion={setDireccion}
                      />
                      <div className="mt-3 flex gap-2">
                        <button
                          className="boton-secundario flex-1 justify-center"
                          onClick={() => setEditando(null)}
                          type="button"
                        >
                          Cancelar
                        </button>
                        <button
                          className="boton-primario flex-1"
                          disabled={!(tasaNueva > 0) || guardando}
                          onClick={() => setConfirmarTasa(true)}
                          type="button"
                        >
                          Guardar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      className="boton-secundario mt-3 w-full justify-center"
                      onClick={() => abrirEdicion(m)}
                      type="button"
                    >
                      Cambiar tasa
                    </button>
                  ))}
              </li>
            );
          })}
        </ul>
      )}

      {errorAccion && (
        <p className="mt-3 text-sm" style={{ color: "#b3261e" }} role="alert">
          {errorAccion}
        </p>
      )}

      {!cargando && !error && historial.length > 0 && (
        <>
          <h2 className="mb-2 mt-6 text-sm font-semibold" style={{ color: "var(--texto-suave)" }}>
            Últimos cambios
          </h2>
          <ul className="tarjeta divide-y" style={{ borderColor: "var(--linea)" }}>
            {historial.map((h) => {
              const m = metodos.find((x) => x.id === h.method_id);
              return (
                <li key={h.id} className="flex items-baseline justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm">{m?.label ?? "Método retirado"}</p>
                    <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
                      {formatearFechaHora(h.changed_at)}
                    </p>
                  </div>
                  <span className="mono shrink-0 text-sm font-semibold">
                    {m ? tasaLegible(h.rate, m.target_currency, monedaOrigen) : h.rate}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <ConfirmarDialogo
        abierto={confirmarTasa && enEdicion !== null}
        titulo="Cambiar la tasa"
        mensaje={
          enEdicion
            ? `«${enEdicion.label}» pasa de ${tasaLegible(
                enEdicion.rate,
                enEdicion.target_currency,
                monedaOrigen
              )} a ${tasaLegible(tasaNueva, enEdicion.target_currency, monedaOrigen)}. Afecta a lo que reciben los clientes desde ahora.`
            : ""
        }
        etiquetaConfirmar={guardando ? "Guardando…" : "Cambiar tasa"}
        onConfirmar={guardarTasa}
        onCancelar={() => setConfirmarTasa(false)}
      />

      <ConfirmarDialogo
        abierto={confirmarBaja !== null}
        titulo="Desactivar el método"
        mensaje={
          confirmarBaja
            ? `«${confirmarBaja.label}» dejará de aparecer al registrar entregas. No se borra nada: puedes volver a activarlo cuando quieras.`
            : ""
        }
        etiquetaConfirmar={cambiandoEstado ? "Desactivando…" : "Desactivar"}
        onConfirmar={() => confirmarBaja && cambiarEstado(confirmarBaja)}
        onCancelar={() => setConfirmarBaja(null)}
      />
    </>
  );
}
