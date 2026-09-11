"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase/client";
import { useSesion } from "@/lib/sesion";
import { useEnvioUnico } from "@/lib/envioUnico";
import { formatearFechaHora } from "@/lib/format";
import { formatearUsd } from "@/lib/comisiones";
import ConfirmarDialogo from "@/components/ConfirmarDialogo";
import { filtrarMonto } from "@/components/CampoMonto";

interface Pendiente {
  contact_id: string;
  operaciones: number;
  total_usd: number;
  por_entregar: number | null;
  por_conseguir: number | null;
  desde: string;
}

interface Solicitud {
  id: string;
  contact_id: string;
  status: "requested" | "paid" | "cancelled";
  amount_usd: number;
  paid_method: string | null;
  paid_currency: string | null;
  paid_amount: number | null;
  note: string | null;
  requested_at: string;
  settled_at: string | null;
}

const FORMAS = ["USDT", "Efectivo", "Transferencia"];

export default function CobrosPage() {
  const { perfil, refrescar } = useSesion();
  const esDueno = perfil?.role === "owner";
  const miContacto = perfil?.contact_id ?? null;

  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [nombres, setNombres] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const envioPedir = useEnvioUnico();
  const envioPagar = useEnvioUnico();
  const [confirmarPedir, setConfirmarPedir] = useState<Pendiente | null>(null);
  const [pidiendo, setPidiendo] = useState(false);

  const [pagando, setPagando] = useState<Solicitud | null>(null);
  const [forma, setForma] = useState(FORMAS[0]);
  const [moneda, setMoneda] = useState("USDT");
  const [monto, setMonto] = useState("");
  const [nota, setNota] = useState("");
  const [guardandoPago, setGuardandoPago] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const sb = supabase();
      const [pRes, sRes, cRes] = await Promise.all([
        sb.from("commission_pending").select("contact_id, operaciones, total_usd, por_entregar, por_conseguir, desde"),
        sb.from("commission_payouts")
          .select("id, contact_id, status, amount_usd, paid_method, paid_currency, paid_amount, note, requested_at, settled_at")
          .order("requested_at", { ascending: false })
          .limit(20),
        sb.from("contacts").select("id, full_name"),
      ]);
      if (pRes.error) throw pRes.error;
      if (sRes.error) throw sRes.error;
      setPendientes((pRes.data ?? []) as Pendiente[]);
      setSolicitudes((sRes.data ?? []) as Solicitud[]);
      const mapa: Record<string, string> = {};
      for (const c of cRes.data ?? []) mapa[c.id as string] = c.full_name as string;
      setNombres(mapa);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los cobros.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function pedirCobro(p: Pendiente) {
    if (!envioPedir.tomar()) return;
    setPidiendo(true);
    setAviso(null);
    const { error: err } = await supabase().rpc("request_commission_payout", { p_contact_id: p.contact_id });
    setPidiendo(false);
    envioPedir.soltar();
    setConfirmarPedir(null);
    if (err) {
      setError("No se pudo pedir el cobro. " + err.message);
      return;
    }
    setAviso("Cobro pedido. Le queda pendiente al dueño.");
    cargar();
  }

  async function marcarPagado(e: FormEvent) {
    e.preventDefault();
    if (!pagando) return;
    if (!envioPagar.tomar()) return;
    setGuardandoPago(true);
    const { error: err } = await supabase().rpc("settle_commission_payout", {
      p_payout_id: pagando.id,
      p_method: forma,
      p_currency: moneda.trim() || null,
      p_amount: monto ? Number(monto.replace(",", ".")) : pagando.amount_usd,
      p_note: nota.trim() || null,
    });
    setGuardandoPago(false);
    envioPagar.soltar();
    if (err) {
      setError("No se pudo marcar como pagado. " + err.message);
      return;
    }
    setPagando(null);
    setMonto("");
    setNota("");
    setAviso("Pagado.");
    cargar();
    refrescar();
  }

  // Un trabajador solo ve lo suyo. El dueño ve a todo el mundo.
  const misPendientes = esDueno ? pendientes : pendientes.filter((p) => p.contact_id === miContacto);
  const misSolicitudes = esDueno ? solicitudes : solicitudes.filter((s) => s.contact_id === miContacto);
  const porResolver = misSolicitudes.filter((s) => s.status === "requested");
  const resueltas = misSolicitudes.filter((s) => s.status !== "requested");

  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">Cobros</h1>

      {aviso && (
        <p
          className="mb-4 rounded-xl px-4 py-3 text-sm"
          style={{ background: "rgba(30,122,75,.1)", color: "#1E7A4B" }}
          role="status"
        >
          {aviso}
        </p>
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
        <>
          <h2 className="mb-2 text-sm font-semibold" style={{ color: "var(--texto-suave)" }}>
            Pendiente de cobrar
          </h2>
          {misPendientes.length === 0 ? (
            <div
              className="mb-6 rounded-2xl border border-dashed p-6 text-center text-sm"
              style={{ borderColor: "var(--linea)", color: "var(--texto-suave)" }}
            >
              Nada pendiente ahora mismo.
            </div>
          ) : (
            <ul className="mb-6 flex flex-col gap-2">
              {misPendientes.map((p) => (
                <li key={p.contact_id} className="tarjeta p-4">
                  <div className="mb-2 flex items-baseline justify-between gap-3">
                    <p className="text-[15px] font-semibold">{nombres[p.contact_id] ?? "—"}</p>
                    <p className="mono text-xl font-semibold" style={{ color: "var(--marca)" }}>
                      {formatearUsd(Number(p.total_usd))} USD
                    </p>
                  </div>
                  <p className="mb-3 text-xs" style={{ color: "var(--texto-suave)" }}>
                    {p.operaciones} {p.operaciones === 1 ? "operación" : "operaciones"}
                    {Number(p.por_entregar ?? 0) > 0 && ` · por entregar ${formatearUsd(Number(p.por_entregar))}`}
                    {Number(p.por_conseguir ?? 0) > 0 && ` · por conseguir ${formatearUsd(Number(p.por_conseguir))}`}
                    {` · desde ${formatearFechaHora(p.desde)}`}
                  </p>
                  <button className="boton-primario" type="button" onClick={() => setConfirmarPedir(p)}>
                    Quiero cobrar
                  </button>
                </li>
              ))}
            </ul>
          )}

          {porResolver.length > 0 && (
            <>
              <h2 className="mb-2 text-sm font-semibold" style={{ color: "var(--texto-suave)" }}>
                {esDueno ? "Te han pedido cobrar" : "Pedido, esperando pago"}
              </h2>
              <ul className="mb-6 flex flex-col gap-2">
                {porResolver.map((s) => (
                  <li key={s.id} className="tarjeta p-4">
                    <div className="mb-1 flex items-baseline justify-between gap-3">
                      <p className="text-[15px] font-semibold">{nombres[s.contact_id] ?? "—"}</p>
                      <p className="mono text-lg font-semibold">{formatearUsd(Number(s.amount_usd))} USD</p>
                    </div>
                    <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
                      Pedido {formatearFechaHora(s.requested_at)}
                    </p>

                    {esDueno && pagando?.id !== s.id && (
                      <button
                        className="boton-primario mt-3"
                        type="button"
                        onClick={() => {
                          setPagando(s);
                          setMonto(String(Number(s.amount_usd)));
                        }}
                      >
                        Marcar como pagado
                      </button>
                    )}

                    {esDueno && pagando?.id === s.id && (
                      <form onSubmit={marcarPagado} className="mt-3 border-t pt-3" style={{ borderColor: "var(--linea)" }}>
                        <label className="etiqueta">Cómo le pagaste</label>
                        <div className="mb-3 flex flex-wrap gap-2">
                          {FORMAS.map((f) => (
                            <button
                              key={f}
                              type="button"
                              onClick={() => {
                                setForma(f);
                                setMoneda(f === "USDT" ? "USDT" : moneda);
                              }}
                              aria-pressed={forma === f}
                              className="rounded-full px-4 text-sm font-medium"
                              style={{
                                minHeight: 44,
                                border: `1.5px solid ${forma === f ? "var(--marca)" : "var(--linea)"}`,
                                color: forma === f ? "var(--marca)" : "var(--texto-suave)",
                                background: forma === f ? "color-mix(in srgb, var(--marca) 7%, white)" : "var(--tarjeta)",
                              }}
                            >
                              {f}
                            </button>
                          ))}
                        </div>

                        <div className="mb-3 grid grid-cols-2 gap-2">
                          <div>
                            <label className="etiqueta" htmlFor={`monto-${s.id}`}>
                              Cuánto
                            </label>
                            <input
                              id={`monto-${s.id}`}
                              className="mono"
                              inputMode="decimal"
                              value={monto}
                              onChange={(e) => setMonto(filtrarMonto(e.target.value))}
                            />
                          </div>
                          <div>
                            <label className="etiqueta" htmlFor={`moneda-${s.id}`}>
                              En qué
                            </label>
                            <input
                              id={`moneda-${s.id}`}
                              value={moneda}
                              maxLength={6}
                              onChange={(e) => setMoneda(e.target.value.toUpperCase())}
                            />
                          </div>
                        </div>

                        <div className="mb-3">
                          <label className="etiqueta" htmlFor={`nota-${s.id}`}>
                            Nota
                          </label>
                          <input id={`nota-${s.id}`} value={nota} onChange={(e) => setNota(e.target.value)} />
                        </div>

                        <div className="flex gap-2">
                          <button
                            className="boton-secundario flex-1 justify-center"
                            type="button"
                            onClick={() => setPagando(null)}
                          >
                            Cancelar
                          </button>
                          <button className="boton-primario flex-1" type="submit" disabled={guardandoPago}>
                            {guardandoPago ? "Guardando…" : "Confirmar pago"}
                          </button>
                        </div>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}

          {resueltas.length > 0 && (
            <>
              <h2 className="mb-2 text-sm font-semibold" style={{ color: "var(--texto-suave)" }}>
                Ya cobrado
              </h2>
              <ul className="flex flex-col gap-2">
                {resueltas.map((s) => (
                  <li key={s.id} className="tarjeta flex items-baseline justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{nombres[s.contact_id] ?? "—"}</p>
                      <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
                        {s.settled_at ? formatearFechaHora(s.settled_at) : ""}
                        {s.paid_method ? ` · ${s.paid_method}` : ""}
                        {s.paid_amount != null ? ` · ${formatearUsd(Number(s.paid_amount))} ${s.paid_currency ?? ""}` : ""}
                      </p>
                    </div>
                    <span className="mono shrink-0 text-sm" style={{ color: "#1E7A4B" }}>
                      pagado
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      <ConfirmarDialogo
        abierto={confirmarPedir !== null}
        titulo="Pedir el cobro"
        mensaje={
          confirmarPedir
            ? `Se juntan ${confirmarPedir.operaciones} ${
                confirmarPedir.operaciones === 1 ? "operación" : "operaciones"
              } en una solicitud de ${formatearUsd(Number(confirmarPedir.total_usd))} USD. Quedan apartadas hasta que se pague.`
            : ""
        }
        etiquetaConfirmar={pidiendo ? "Pidiendo…" : "Pedir cobro"}
        onConfirmar={() => confirmarPedir && pedirCobro(confirmarPedir)}
        onCancelar={() => setConfirmarPedir(null)}
      />
    </>
  );
}
