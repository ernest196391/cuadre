"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useSesion } from "@/lib/sesion";
import { useEnvioUnico } from "@/lib/envioUnico";
import { formatearMonto, formatearUsdt, parsearNumero, redondearMonto } from "@/lib/format";
import { redondearTasa, tasaLegible } from "@/lib/tasas";
import CampoMonto from "@/components/CampoMonto";
import SelectorContacto, { type ContactoBreve } from "@/components/SelectorContacto";
import { comisionDe, formatearUsd, porcentajeDe, valorEnUsd, type ReglaPersona } from "@/lib/comisiones";
import { tomarParaRepetir, tomarPedidoDeOrigen } from "@/lib/repetir";

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
  const { tenant, perfil, metodos, tasasUsdt } = useSesion();
  const monedaOrigen = tenant?.base_currency ?? "";

  const [clientes, setClientes] = useState<ContactoBreve[]>([]);
  const [trabajadores, setTrabajadores] = useState<ContactoBreve[]>([]);
  const [reglas, setReglas] = useState<Record<string, ReglaPersona>>({});
  const [cuentas, setCuentas] = useState<CuentaBreve[]>([]);

  const activos = useMemo(() => metodos.filter((m) => m.active), [metodos]);
  const [metodoId, setMetodoId] = useState<string | null>(null);
  const [recibido, setRecibido] = useState("");
  const [entregadoTocado, setEntregadoTocado] = useState(false);
  const [entregado, setEntregado] = useState("");
  const [usdt, setUsdt] = useState("");
  const [usdtTocado, setUsdtTocado] = useState(false);
  const [cliente, setCliente] = useState<ContactoBreve | null>(null);
  const [cuentaId, setCuentaId] = useState<string>("");
  const [responsableId, setResponsableId] = useState<string>("");
  const [origenId, setOrigenId] = useState<string>("");

  const [masDetalles, setMasDetalles] = useState(false);
  const [feeRed, setFeeRed] = useState("");
  const [mensajeroId, setMensajeroId] = useState<string>("");
  const [feeMensajeria, setFeeMensajeria] = useState("");
  const [notas, setNotas] = useState("");

  const envio = useEnvioUnico();
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCliente, setErrorCliente] = useState<string | null>(null);

  /**
   * Dar de alta al cliente sin salir de aquí. Obligar a abandonar una entrega a
   * medias para ir a Contactos es lo que hace que la entrega no se registre.
   */
  async function crearClienteAlVuelo(nombre: string, telefono?: string | null) {
    if (!tenant || !perfil) return;
    setErrorCliente(null);
    const sb = supabase();
    const { data, error: err } = await sb
      .from("contacts")
      .insert({
        tenant_id: tenant.id,
        full_name: nombre,
        // Viniendo de un pedido de la web llega el teléfono. Perderlo obligaría
        // a ir a buscarlo al pedido para poder llamar a esta persona.
        phone: telefono?.trim() || null,
        created_by: perfil.id,
      })
      .select("id, full_name, phone")
      .single();

    if (err || !data) {
      setErrorCliente("No se pudo crear el contacto. " + (err?.message ?? ""));
      return;
    }
    await sb.from("contact_roles").insert({ contact_id: data.id, role: "client" });
    const nuevo = data as ContactoBreve;
    setClientes((prev) => [...prev, nuevo].sort((a, b) => a.full_name.localeCompare(b.full_name)));
    setCliente(nuevo);
    setClienteSugerido(null);
  }

  const cargarListas = useCallback(async () => {
    const sb = supabase();
    const [cRes, wRes] = await Promise.all([
      sb.from("contacts").select("id, full_name, phone").eq("active", true).order("full_name"),
      sb
        .from("workers")
        .select(
          "contact_id, delivery_pct, origination_pct, contacts:contact_id(id, full_name, phone)"
        )
        .eq("active", true),
    ]);
    if (cRes.data) setClientes(cRes.data as ContactoBreve[]);
    if (wRes.data) {
      const lista: ContactoBreve[] = [];
      const mapa: Record<string, ReglaPersona> = {};
      for (const w of wRes.data as unknown as Array<{ contact_id: string; delivery_pct: number | null; origination_pct: number | null; contacts: ContactoBreve | null }>) {
        if (w.contacts) lista.push(w.contacts);
        mapa[w.contact_id] = { delivery_pct: w.delivery_pct, origination_pct: w.origination_pct };
      }
      setTrabajadores(lista);
      setReglas(mapa);
    }
  }, []);

  useEffect(() => {
    cargarListas();
  }, [cargarListas]);

  /**
   * Se llega aquí con datos puestos de dos maneras: anulando una entrega para
   * corregirla, o convirtiendo un pedido de la web. Volver a teclearlo de
   * memoria es justo donde se cuela el segundo error, que es el que ya nadie
   * revisa.
   */
  const [vengoDe, setVengoDe] = useState<"anulada" | "pedido" | null>(null);
  const [clientePendiente, setClientePendiente] = useState<string | null>(null);
  const [entregadoPendiente, setEntregadoPendiente] = useState<string | null>(null);
  const [clienteSugerido, setClienteSugerido] = useState<{ nombre: string; telefono: string | null } | null>(null);
  /**
   * Ref y no estado a propósito: se lee en el efecto de más abajo que pone el
   * método por defecto, y los dos corren en la MISMA pasada. Un estado ahí
   * todavía valdría lo de antes, y el método por defecto pisaría el del pedido
   * —que es exactamente el fallo que esto viene a cerrar: un pedido de CUP en
   * efectivo quedaba registrado como transferencia, con otra tasa y otra
   * ganancia.
   */
  const metodoImpuesto = useRef<string | null>(null);
  /** De qué pedido de la web salió esta entrega, si salió de uno. Es lo que
   *  deja que el cliente pueda seguir su envío después de registrarla. */
  const pedidoDeOrigen = useRef<string | null>(null);
  useEffect(() => {
    // Solo se asigna si hay algo. Se lee UNA vez y se borra, así que una
    // segunda pasada de este efecto —React los ejecuta dos veces en
    // desarrollo, y cualquier remontaje puede hacerlo— leería vacío y
    // machacaría la referencia con nulo, dejando la entrega sin atar.
    const origen = tomarPedidoDeOrigen();
    if (origen) pedidoDeOrigen.current = origen;
    const r = tomarParaRepetir();
    if (!r) return;
    setVengoDe(r.origen ?? "anulada");
    if (r.metodoId) {
      metodoImpuesto.current = r.metodoId;
      setMetodoId(r.metodoId);
    }
    if (r.recibido) setRecibido(r.recibido);
    if (r.responsableId) setResponsableId(r.responsableId);
    if (r.origenId) setOrigenId(r.origenId);
    if (r.notas) {
      setNotas(r.notas);
      setMasDetalles(true);
    }
    if (r.clienteNombre) {
      setClienteSugerido({ nombre: r.clienteNombre, telefono: r.clienteTelefono ?? null });
    }
    if (r.clienteId) setClientePendiente(r.clienteId);
    // El monto entregado se decide abajo, cuando ya se sabe la tasa. NO se fija
    // aquí: dejarlo "tocado" congela el número, y entonces corregir lo recibido
    // ya no lo recalcula — que es exactamente el error que se venía a arreglar.
    if (r.entregado) setEntregadoPendiente(r.entregado);
    // Los USDT no se arrastran nunca: son los que se van a mover ahora, y salen
    // del precio de mercado de hoy, no del de la entrega vieja.
  }, []);

  /**
   * Solo se respeta el monto entregado de la entrega vieja si estaba negociado,
   * es decir, si no salía de la tasa. Si salía de la tasa, se deja que se
   * recalcule solo con lo que se corrija.
   */
  useEffect(() => {
    if (entregadoPendiente === null) return;
    const m = activos.find((x) => x.id === metodoId);
    if (!m) return;
    const viejo = parsearNumero(entregadoPendiente);
    const deLaTasa = redondearMonto(parsearNumero(recibido) * m.rate, m.target_currency);
    if (viejo > 0 && Math.abs(viejo - deLaTasa) > 0.005) {
      setEntregadoTocado(true);
      setEntregado(entregadoPendiente);
    }
    setEntregadoPendiente(null);
  }, [entregadoPendiente, activos, metodoId, recibido]);

  // El cliente se ata cuando la lista ya llegó, no antes.
  useEffect(() => {
    if (!clientePendiente || clientes.length === 0) return;
    const c = clientes.find((x) => x.id === clientePendiente);
    if (c) setCliente(c);
    setClientePendiente(null);
  }, [clientePendiente, clientes]);

  /**
   * El cliente que viene en un pedido de la web no es un contacto todavía:
   * llega como nombre y teléfono sueltos. Si ya está dado de alta se engancha
   * solo —por el teléfono antes que por el nombre, que se escribe de mil
   * maneras—; si no, queda propuesto para crearlo de un toque.
   */
  useEffect(() => {
    if (!clienteSugerido || cliente) return;
    const soloDigitos = (t: string | null) => (t ?? "").replace(/\D/g, "");
    const tel = soloDigitos(clienteSugerido.telefono);
    // Los últimos 8 dígitos: el mismo número se guarda con y sin prefijo de país.
    const cola = tel.length >= 8 ? tel.slice(-8) : null;
    const yaEsta =
      (cola && clientes.find((c) => soloDigitos(c.phone).endsWith(cola))) ||
      clientes.find(
        (c) => c.full_name.trim().toLowerCase() === clienteSugerido.nombre.trim().toLowerCase()
      );
    if (yaEsta) {
      setCliente(yaEsta);
      setClienteSugerido(null);
    }
  }, [clienteSugerido, clientes, cliente]);

  // Preselección: lo último que usó, si sigue existiendo. Nunca por encima del
  // método que trae un pedido o una entrega anulada: ese ya está decidido.
  useEffect(() => {
    if (metodoImpuesto.current) return;
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
  // Segunda tasa del negocio: a cuánto se vende el USDT en destino. Con ella
  // los USDT de la entrega salen solos en vez de calcularse de cabeza.
  const tasaUsdt = metodo ? tasasUsdt.find((t) => t.currency === metodo.target_currency) ?? null : null;
  const montoRecibido = parsearNumero(recibido);

  // El monto entregado se calcula solo, pero se puede sobreescribir: si negoció
  // en un envío grande, manda lo que realmente entregó, no la tasa de lista.
  const sugerido = metodo ? redondearMonto(montoRecibido * metodo.rate, metodo.target_currency) : 0;
  const montoEntregado = entregadoTocado ? parsearNumero(entregado) : sugerido;
  const tasaAplicada = montoRecibido > 0 ? redondearTasa(montoEntregado / montoRecibido) : 0;
  const usdtSugerido =
    tasaUsdt && montoEntregado > 0 ? Math.round((montoEntregado / tasaUsdt.rate) * 1e6) / 1e6 : 0;
  const usdtUsados = usdtTocado ? parsearNumero(usdt) : usdtSugerido;
  const negociado = entregadoTocado && metodo != null && Math.abs(montoEntregado - sugerido) > 0.005;

  // Base de las dos comisiones: lo entregado valorado en USD. Es la regla real
  // del negocio -- 3 USD por cada 100 puestos en destino.
  const tasaUsdPorUsdt = tasasUsdt.find((t) => t.currency === "USD")?.rate;
  const valorUsd = metodo
    ? valorEnUsd(montoEntregado, metodo.target_currency, tasaUsdt?.rate, tasaUsdPorUsdt)
    : 0;

  const pctEntrega = porcentajeDe("delivery", reglas[responsableId], tenant);
  const comisionEntrega = comisionDe(valorUsd, pctEntrega);
  const pctOrigen = origenId ? porcentajeDe("origination", reglas[origenId], tenant) : 0;
  const comisionOrigen = origenId ? comisionDe(valorUsd, pctOrigen) : 0;

  function validar(): string | null {
    if (!metodo) return "Elige un método de entrega.";
    if (montoRecibido <= 0) return "Escribe cuánto recibiste.";
    if (montoEntregado <= 0) return "El monto entregado tiene que ser mayor que cero.";
    if (usdtUsados <= 0) return "Escribe cuántos USDT entregaste.";
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
    if (!envio.tomar()) return;

    setGuardando(true);
    setError(null);

    const sb = supabase();
    const { data: creada, error: err } = await sb.from("deliveries").insert({
      tenant_id: tenant.id,
      source_amount_received: montoRecibido,
      source_currency: monedaOrigen,
      delivered_amount: montoEntregado,
      delivered_currency: metodo.target_currency,
      method_id: metodo.id,
      rate_applied: tasaAplicada,
      usdt_spent: usdtUsados,
      usdt_rate_used: tasaUsdt?.rate ?? null,
      network_fee_usdt: parsearNumero(feeRed),
      client_contact_id: cliente?.id ?? null,
      inbound_order_id: pedidoDeOrigen.current,
      destination_account_id: cuentaId || null,
      handled_by_contact_id: responsableId,
      origin_contact_id: origenId || null,
      usd_value: valorUsd,
      commission_applied: comisionEntrega,
      commission_currency: "USD",
      courier_contact_id: mensajeroId || null,
      courier_fee: parsearNumero(feeMensajeria),
      courier_fee_currency: monedaOrigen,
      notes: notas.trim() || null,
      created_by: perfil.id,
    }).select("id").single();

    if (err || !creada) {
      envio.soltar();
      setGuardando(false);
      setError("No se pudo guardar: " + (err?.message ?? ""));
      return;
    }

    // El libro de comisiones: una fila por comisión ganada. Es lo que después
    // se cobra, y por eso se escribe aquí y no se recalcula más tarde.
    const apuntes = [];
    if (comisionEntrega > 0)
      apuntes.push({ tenant_id: tenant.id, delivery_id: creada.id, contact_id: responsableId,
                     kind: "delivery", pct_applied: pctEntrega, amount_usd: comisionEntrega });
    if (origenId && comisionOrigen > 0)
      apuntes.push({ tenant_id: tenant.id, delivery_id: creada.id, contact_id: origenId,
                     kind: "origination", pct_applied: pctOrigen, amount_usd: comisionOrigen });
    if (apuntes.length > 0) await sb.from("commission_entries").insert(apuntes);

    setGuardando(false);

    recordar(ULTIMO_METODO, metodo.id);
    recordar(ULTIMO_RESPONSABLE, responsableId);
    router.push("/");
  }

  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">Registrar entrega</h1>

      {vengoDe && (
        <p
          className="mb-4 rounded-xl px-4 py-3 text-sm"
          style={{ background: "rgba(36,107,206,.08)", color: "#246BCE" }}
          role="status"
        >
          {vengoDe === "pedido"
            ? "Vienen del pedido de tu web. Revísalos y guarda la entrega."
            : "Están los datos de la entrega que anulaste. Corrige lo que estaba mal y guárdala."}
        </p>
      )}

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
                    minHeight: "3.25rem",
                    border: `1.5px solid ${activa ? "var(--marca)" : "var(--linea)"}`,
                    background: activa ? "color-mix(in srgb, var(--marca) 7%, white)" : "var(--tarjeta)",
                  }}
                >
                  <span className="text-[0.9375rem] font-semibold">{m.label}</span>
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
          etiqueta="Monto entregado"
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
              : "Cámbialo solo si negociaste otra tasa."
          }
        />

        <CampoMonto
          id="usdt"
          etiqueta="USDT entregados"
          sufijo="USDT"
          valor={usdtTocado ? usdt : usdtSugerido > 0 ? formatearUsdt(usdtSugerido) : ""}
          onValor={(v) => {
            setUsdtTocado(true);
            setUsdt(v);
          }}
          decimal
          ayuda={
            tasaUsdt
              ? `Salen de 1 USDT = ${tasaUsdt.rate.toLocaleString("es", { maximumFractionDigits: 4 })} ${metodo?.target_currency ?? ""}. Cámbialos si moviste otra cantidad.`
              : "Pon a cuánto está el USDT en Tasas y se calculan solos."
          }
        />

        <SelectorContacto
          etiqueta="Cliente"
          contactos={clientes}
          seleccionado={cliente}
          onSeleccionar={setCliente}
          onCrear={crearClienteAlVuelo}
          propuesto={clienteSugerido}
        />
        {errorCliente && (
          <p className="-mt-2 text-sm" style={{ color: "#b3261e" }}>
            {errorCliente}
          </p>
        )}

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
                const suya = comisionDe(valorUsd, porcentajeDe("delivery", reglas[t.id], tenant));
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setResponsableId(t.id)}
                    aria-pressed={activa}
                    className="flex flex-col items-start gap-0.5 rounded-xl px-3 py-2.5 text-left"
                    style={{
                      minHeight: "3.75rem",
                      border: `1.5px solid ${activa ? "var(--marca)" : "var(--linea)"}`,
                      background: activa ? "color-mix(in srgb, var(--marca) 7%, white)" : "var(--tarjeta)",
                    }}
                  >
                    <span className="truncate text-[0.9375rem] font-semibold">{t.full_name}</span>
                    <span className="mono text-xs" style={{ color: "var(--texto-suave)" }}>
                      {suya > 0 ? `comisión ${formatearUsd(suya)} USD` : "sin comisión"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {valorUsd !== null && valorUsd > 0 && (
            <p className="mt-1.5 text-xs" style={{ color: "var(--texto-suave)" }}>
              Entregas {formatearUsd(valorUsd)} USD de valor
              {comisionEntrega > 0 && ` · comisión ${pctEntrega}% = ${formatearUsd(comisionEntrega)} USD`}
            </p>
          )}
        </div>

        <div>
          <label className="etiqueta" htmlFor="origen">
            Quién consiguió al cliente
          </label>
          <select id="origen" value={origenId} onChange={(e) => setOrigenId(e.target.value)}>
            <option value="">Nadie / lo trajo el negocio</option>
            {trabajadores.map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name}
              </option>
            ))}
          </select>
          {origenId && comisionOrigen > 0 && (
            <p className="mt-1.5 text-xs" style={{ color: "var(--texto-suave)" }}>
              Se lleva {pctOrigen}% = {formatearUsd(comisionOrigen)} USD por conseguirlo.
            </p>
          )}
          {origenId && comisionOrigen === 0 && (
            <p className="mt-1.5 text-xs" style={{ color: "var(--texto-suave)" }}>
              Sin comisión por conseguir clientes. Se cambia en Ajustes.
            </p>
          )}
        </div>

        <button
          type="button"
          className="text-left text-sm font-medium"
          style={{ color: "var(--marca)", minHeight: "2.75rem" }}
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
