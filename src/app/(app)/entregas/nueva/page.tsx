"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useSesion } from "@/lib/sesion";
import { formatearMonto, parsearNumero, redondearMonto } from "@/lib/format";
import { redondearTasa, tasaLegible } from "@/lib/tasas";
import { calcularComision, type ReglaComision } from "@/lib/comision";
import CampoMonto from "@/components/CampoMonto";
import SelectorContacto, { type ContactoBreve } from "@/components/SelectorContacto";

interface CuentaBreve {
  id: string;
  alias: string;
  pan_last4: string | null;
  account_type: string;
}

/** Lo último que usó, recordado en el teléfono: casi siempre es lo mismo otra vez. */
const ULTIMO_METODO = "cuadre.ultimo_metodo";
const ULTIMO_RESPONSABLE = "cuadre.ultimo_responsable";

function recordar(clave: string, valor: string) {
  try {
    localStorage.setItem(clave, valor);
  } catch {
    /* modo privado: seguimos sin recordar */
  }
}
function recordado(clave: string) {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
}

export default function NuevaEntregaPage() {
  const router = useRouter();
  const { tenant, perfil, metodos } = useSesion();
  const monedaOrigen = tenant?.base_currency ?? "";

  const [clientes, setClientes] = useState<ContactoBreve[]>([]);
  const [trabajadores, setTrabajadores] = useState<ContactoBreve[]>([]);
  const [reglas, setReglas] = useState<Record<string, ReglaComision>>({});
  const [cuentas, setCuentas] = useState<CuentaBreve[]>([]);

  const activos = useMemo(() => metodos.filter((m) => m.active), [metodos]);
  const [metodoId, setMetodoId] = useState<string | null>(null);
  const [recibido, setRecibido] = useState("");
  const [entregadoTocado, setEntregadoTocado] = useState(false);
  const [entregado, setEntregado] = useState("");
  const [usdt, setUsdt] = useState("");
  const [cliente, setCliente] = useState<ContactoBreve | null>(null);
  const [cuentaId, setCuentaId] = useState<string>("");
  const [responsableId, setResponsableId] = useState<string>("");

  const [masDetalles, setMasDetalles] = useState(false);
  const [feeRed, setFeeRed] = useState("");
  const [mensajeroId, setMensajeroId] = useState<string>("");
  const [feeMensajeria, setFeeMensajeria] = useState("");
  const [notas, setNotas] = useState("");

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargarListas = useCallback(async () => {
    const sb = supabase();
    const [cRes, wRes] = await Promise.all([
      sb.from("contacts").select("id, full_name, phone").eq("active", true).order("full_name"),
      sb
        .from("workers")
        .select(
          "contact_id, commission_kind, commission_percent, commission_basis, commission_per_operation, commission_currency, contacts:contact_id(id, full_name, phone)"
        )
        .eq("active", true),
    ]);
    if (cRes.data) setClientes(cRes.data as ContactoBreve[]);
    if (wRes.data) {
      const lista: ContactoBreve[] = [];
      const mapa: Record<string, ReglaComision> = {};
      for (const w of wRes.data as unknown as Array<{
        contact_id: string;
        commission_kind: "fixed" | "percent";
        commission_percent: number;
        commission_basis: ReglaComision["basis"];
        commission_per_operation: number;
        commission_currency: string;
        contacts: ContactoBreve | null;
      }>) {
        if (w.contacts) lista.push(w.contacts);
        mapa[w.contact_id] = {
          kind: w.commission_kind,
          percent: Number(w.commission_percent),
          basis: w.commission_basis,
          fixed: Number(w.commission_per_operation),
          currency: w.commission_currency,
        };
      }
      setTrabajadores(lista);
      setReglas(mapa);
    }
  }, []);

  useEffect(() => {
    cargarListas();
  }, [cargarListas]);

  // Preselección: lo último que usó, si sigue existiendo.
  useEffect(() => {
    if (metodoId === null && activos.length > 0) {
      const guardado = recordado(ULTIMO_METODO);
      setMetodoId(activos.find((m) => m.id === guardado)?.id ?? activos[0].id);
    }
  }, [activos, metodoId]);

  // Manda lo último usado, no quién tiene el teléfono: el que entrega en Cuba
  // hace la mayor parte, y muchas veces quien teclea no es quien entregó.
  useEffect(() => {
    if (!responsableId && trabajadores.length > 0) {
      const guardado = trabajadores.find((t) => t.id === recordado(ULTIMO_RESPONSABLE));
      const propia = trabajadores.find((t) => t.id === perfil?.contact_id);
      setResponsableId((guardado || propia || trabajadores[0]).id);
    }
  }, [trabajadores, responsableId, perfil]);

  // Las cuentas de destino son del cliente elegido, no de todo el mundo.
  useEffect(() => {
    if (!cliente) {
      setCuentas([]);
      setCuentaId("");
      return;
    }
    let vivo = true;
    supabase()
      .from("destination_accounts_safe")
      .select("id, alias, pan_last4, account_type")
      .eq("contact_id", cliente.id)
      .eq("active", true)
      .then(({ data }) => {
        if (!vivo) return;
        const lista = (data ?? []) as CuentaBreve[];
        setCuentas(lista);
        setCuentaId(lista.length === 1 ? lista[0].id : "");
      });
    return () => {
      vivo = false;
    };
  }, [cliente]);

  const metodo = activos.find((m) => m.id === metodoId) ?? null;
  const montoRecibido = parsearNumero(recibido);

  // El monto entregado se calcula solo, pero se puede sobreescribir: si negoció
  // en un envío grande, manda lo que realmente entregó, no la tasa de lista.
  const sugerido = metodo ? redondearMonto(montoRecibido * metodo.rate, metodo.target_currency) : 0;
  const montoEntregado = entregadoTocado ? parsearNumero(entregado) : sugerido;
  const tasaAplicada = montoRecibido > 0 ? redondearTasa(montoEntregado / montoRecibido) : 0;
  const negociado = entregadoTocado && metodo != null && Math.abs(montoEntregado - sugerido) > 0.005;

  const comision = calcularComision(reglas[responsableId] ?? null, {
    usdt_spent: parsearNumero(usdt),
    delivered_amount: montoEntregado,
    source_amount: montoRecibido,
  });

  function validar(): string | null {
    if (!metodo) return "Elige un método de entrega.";
    if (montoRecibido <= 0) return "Escribe cuánto recibiste.";
    if (montoEntregado <= 0) return "El monto entregado tiene que ser mayor que cero.";
    if (parsearNumero(usdt) <= 0) return "Escribe cuántos USDT usaste.";
    if (!responsableId) return "Elige quién atendió la entrega.";
    return null;
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    const problema = validar();
    if (problema) {
      setError(problema);
      return;
    }
    if (!metodo || !perfil || !tenant) return;

    setGuardando(true);
    setError(null);

    const { error: err } = await supabase().from("deliveries").insert({
      tenant_id: tenant.id,
      source_amount_received: montoRecibido,
      source_currency: monedaOrigen,
      delivered_amount: montoEntregado,
      delivered_currency: metodo.target_currency,
      method_id: metodo.id,
      rate_applied: tasaAplicada,
      usdt_spent: parsearNumero(usdt),
      network_fee_usdt: parsearNumero(feeRed),
      client_contact_id: cliente?.id ?? null,
      destination_account_id: cuentaId || null,
      handled_by_contact_id: responsableId,
      commission_applied: comision.monto,
      commission_currency: comision.moneda || monedaOrigen,
      courier_contact_id: mensajeroId || null,
      courier_fee: parsearNumero(feeMensajeria),
      courier_fee_currency: monedaOrigen,
      notes: notas.trim() || null,
      created_by: perfil.id,
    });

    setGuardando(false);
    if (err) {
      setError("No se pudo guardar: " + err.message);
      return;
    }

    recordar(ULTIMO_METODO, metodo.id);
    recordar(ULTIMO_RESPONSABLE, responsableId);
    router.push("/");
  }

  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">Registrar entrega</h1>

      <form onSubmit={guardar} className="flex flex-col gap-4">
        <CampoMonto
          id="recibido"
          etiqueta={`Recibiste del cliente (${monedaOrigen})`}
          sufijo={monedaOrigen}
          valor={recibido}
          onValor={setRecibido}
          autoFocus
        />

        <div>
          <label className="etiqueta">Método de entrega</label>
          <div className="flex flex-col gap-2">
            {activos.map((m) => {
              const activa = m.id === metodoId;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setMetodoId(m.id);
                    setEntregadoTocado(false);
                  }}
                  aria-pressed={activa}
                  className="flex w-full flex-col items-start gap-0.5 rounded-xl px-4 py-2.5 text-left"
                  style={{
                    minHeight: 52,
                    border: `1.5px solid ${activa ? "var(--marca)" : "var(--linea)"}`,
                    background: activa ? "color-mix(in srgb, var(--marca) 7%, white)" : "var(--tarjeta)",
                  }}
                >
                  <span className="text-[15px] font-semibold">{m.label}</span>
                  <span className="mono text-xs" style={{ color: "var(--texto-suave)" }}>
                    {tasaLegible(m.rate, m.target_currency, monedaOrigen)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div
          className="rounded-2xl px-4 py-4"
          style={{ background: "var(--marca)", color: "#fff" }}
        >
          <p className="mb-1 text-xs opacity-80">Tu cliente recibe</p>
          <p className="mono text-2xl font-semibold">
            {metodo && montoRecibido > 0
              ? `${formatearMonto(montoEntregado, metodo.target_currency)} ${metodo.target_currency}`
              : "—"}
          </p>
        </div>

        <CampoMonto
          id="entregado"
          etiqueta="Monto entregado (si negociaste, corrígelo)"
          sufijo={metodo?.target_currency}
          valor={entregadoTocado ? entregado : sugerido > 0 && metodo ? formatearMonto(sugerido, metodo.target_currency) : ""}
          onValor={(v) => {
            setEntregadoTocado(true);
            setEntregado(v);
          }}
          decimal
          ayuda={
            negociado
              ? `Tasa que estás aplicando: ${tasaLegible(tasaAplicada, metodo!.target_currency, monedaOrigen)}`
              : "Sale de la tasa del método. Cámbialo solo si negociaste."
          }
        />

        <CampoMonto
          id="usdt"
          etiqueta="USDT puestos en Cuba"
          sufijo="USDT"
          valor={usdt}
          onValor={setUsdt}
          decimal
          ayuda="Lo que llegó a destino. El fee de la wallet va aparte, en Más detalles."
        />

        <SelectorContacto
          etiqueta="Cliente"
          contactos={clientes}
          seleccionado={cliente}
          onSeleccionar={setCliente}
        />

        {cuentas.length > 0 && (
          <div>
            <label className="etiqueta" htmlFor="cuenta">
              Cuenta de destino
            </label>
            <select id="cuenta" value={cuentaId} onChange={(e) => setCuentaId(e.target.value)}>
              <option value="">Sin cuenta (efectivo)</option>
              {cuentas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.alias}
                  {c.pan_last4 ? ` · •••• ${c.pan_last4}` : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="etiqueta">Atendida por</label>
          {trabajadores.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--texto-suave)" }}>
              Nadie dado de alta todavía.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {trabajadores.map((t) => {
                const activa = t.id === responsableId;
                // Cada opción enseña lo que cuesta EN ESTA entrega: quién
                // atiende cambia la ganancia, y eso no puede quedar escondido
                // detrás de un desplegable.
                const suya = calcularComision(reglas[t.id] ?? null, {
                  usdt_spent: parsearNumero(usdt),
                  delivered_amount: montoEntregado,
                  source_amount: montoRecibido,
                });
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setResponsableId(t.id)}
                    aria-pressed={activa}
                    className="flex flex-col items-start gap-0.5 rounded-xl px-3 py-2.5 text-left"
                    style={{
                      minHeight: 60,
                      border: `1.5px solid ${activa ? "var(--marca)" : "var(--linea)"}`,
                      background: activa ? "color-mix(in srgb, var(--marca) 7%, white)" : "var(--tarjeta)",
                    }}
                  >
                    <span className="truncate text-[15px] font-semibold">{t.full_name}</span>
                    <span className="mono text-xs" style={{ color: "var(--texto-suave)" }}>
                      {suya.monto > 0
                        ? `−${formatearMonto(suya.monto, suya.moneda)} ${suya.moneda}`
                        : "no cobra"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {comision.explicacion && comision.monto > 0 && (
            <p className="mt-1.5 text-xs" style={{ color: "var(--texto-suave)" }}>
              Comisión: {comision.explicacion}
            </p>
          )}
        </div>

        <button
          type="button"
          className="text-left text-sm font-medium"
          style={{ color: "var(--marca)", minHeight: 44 }}
          onClick={() => setMasDetalles((v) => !v)}
        >
          {masDetalles ? "− Menos detalles" : "+ Más detalles (fees, mensajero, notas)"}
        </button>

        {masDetalles && (
          <div className="flex flex-col gap-4">
            <CampoMonto
              id="fee-red"
              etiqueta="Fee de la wallet al enviar"
              sufijo="USDT"
              valor={feeRed}
              onValor={setFeeRed}
              decimal
              ayuda="Este es el que mueve el margen de esta operación."
            />

            <div>
              <label className="etiqueta" htmlFor="mensajero">
                Mensajero
              </label>
              <select id="mensajero" value={mensajeroId} onChange={(e) => setMensajeroId(e.target.value)}>
                <option value="">Ninguno</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name}
                  </option>
                ))}
              </select>
            </div>

            <CampoMonto
              id="fee-mensajeria"
              etiqueta="Fee de mensajería"
              sufijo={monedaOrigen}
              valor={feeMensajeria}
              onValor={setFeeMensajeria}
            />

            <div>
              <label className="etiqueta" htmlFor="notas">
                Notas
              </label>
              <textarea id="notas" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
            </div>
          </div>
        )}

        <button className="boton-primario mt-1" type="submit" disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar entrega"}
        </button>

        {error && (
          <p className="text-sm" style={{ color: "#b3261e" }} role="alert">
            {error}
          </p>
        )}
      </form>
    </>
  );
}
