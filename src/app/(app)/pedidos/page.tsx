"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useSesion } from "@/lib/sesion";
import { formatearMonto, formatearFechaHora } from "@/lib/format";
import { guardarParaRepetir } from "@/lib/repetir";

interface Pedido {
  id: string;
  external_ref: string | null;
  payload: Record<string, unknown>;
  received_at: string;
  processed_at: string | null;
}

/**
 * El pedido llega como JSON libre: la web de cada operador manda lo que quiere
 * y se guarda entero. Aquí se intenta reconocer los campos del contrato del
 * README, pero SIEMPRE se puede ver el JSON tal cual: si la web manda algo con
 * otro nombre, el dato sigue estando y se lee, en vez de desaparecer.
 */
function texto(p: Record<string, unknown>, ...claves: string[]) {
  for (const k of claves) {
    const v = p[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}
function numero(p: Record<string, unknown>, ...claves: string[]) {
  for (const k of claves) {
    const v = p[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = parseFloat(v.replace(/\./g, "").replace(",", "."));
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

export default function PedidosPage() {
  const router = useRouter();
  const { tenant, metodos } = useSesion();
  const monedaBase = tenant?.base_currency ?? "";

  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [verTodos, setVerTodos] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const { data, error: err } = await supabase()
        .from("inbound_orders")
        .select("id, external_ref, payload, received_at, processed_at")
        .order("received_at", { ascending: false })
        .limit(60);
      if (err) throw err;
      setPedidos((data ?? []) as Pedido[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los pedidos.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function marcar(id: string, atendido: boolean) {
    setOcupado(id);
    const { error: err } = await supabase()
      .from("inbound_orders")
      .update({ processed_at: atendido ? new Date().toISOString() : null })
      .eq("id", id);
    setOcupado(null);
    if (err) {
      setError("No se pudo marcar. " + err.message);
      return;
    }
    cargar();
  }

  /** Pasa lo que se entendió al formulario de entrega y marca el pedido. */
  async function convertir(p: Pedido) {
    const clave = texto(p.payload, "method_key");
    const metodo = metodos.find((m) => m.key === clave);
    guardarParaRepetir({
      origen: "pedido",
      metodoId: metodo?.id ?? null,
      recibido: String(numero(p.payload, "amount_source", "monto", "amount") ?? ""),
      entregado: String(numero(p.payload, "amount_destination", "monto_destino") ?? ""),
      usdt: "",
      clienteId: null,
      cuentaId: null,
      responsableId: null,
      origenId: null,
      // El nombre y el teléfono NO se meten en las notas: van como datos, para
      // que el formulario pueda buscar a esa persona entre los contactos y, si
      // no está, darla de alta con su teléfono de un solo toque.
      clienteNombre: texto(p.payload, "customer_name", "cliente", "nombre"),
      clienteTelefono: texto(p.payload, "customer_phone", "telefono", "phone"),
      notas: `Pedido de la web${p.external_ref ? ` ${p.external_ref}` : ""}`,
    });
    await marcar(p.id, true);
    router.push("/entregas/nueva");
  }

  const pendientes = pedidos.filter((p) => !p.processed_at);
  const visibles = verTodos ? pedidos : pendientes;

  return (
    <>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h1 className="text-xl font-semibold">Pedidos de la web</h1>
        <button
          className="shrink-0 text-sm font-medium"
          type="button"
          onClick={() => setVerTodos((v) => !v)}
          style={{ color: "var(--marca)", minHeight: "2.75rem" }}
        >
          {verTodos ? "Solo pendientes" : "Ver todos"}
        </button>
      </div>
      <p className="mb-4 text-sm" style={{ color: "var(--texto-suave)" }}>
        Lo que manda tu web con una clave. Se guarda entero: nada se pierde aunque llegue con otro
        formato.
      </p>

      {error && (
        <p className="mb-3 text-sm" style={{ color: "#b3261e" }} role="alert">
          {error}
        </p>
      )}

      {cargando ? (
        <p className="py-6 text-center text-sm" style={{ color: "var(--texto-suave)" }}>
          Cargando…
        </p>
      ) : visibles.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed p-6 text-center text-sm"
          style={{ borderColor: "var(--linea)", color: "var(--texto-suave)" }}
        >
          {verTodos ? "Todavía no ha llegado ningún pedido." : "Nada pendiente. Todo atendido."}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {visibles.map((p) => {
            const nombre = texto(p.payload, "customer_name", "cliente", "nombre");
            const tel = texto(p.payload, "customer_phone", "telefono", "phone");
            const origen = numero(p.payload, "amount_source", "monto", "amount");
            const destino = numero(p.payload, "amount_destination", "monto_destino");
            const monedaDestino = texto(p.payload, "currency_destination", "moneda_destino");
            const claveMetodo = texto(p.payload, "method_key");
            const metodo = metodos.find((m) => m.key === claveMetodo);
            const atendido = p.processed_at !== null;
            const viendoJson = abierto === p.id;

            return (
              <li key={p.id} className="tarjeta p-4" style={{ opacity: atendido ? 0.6 : 1 }}>
                <div className="mb-1 flex items-start justify-between gap-3">
                  <p className="min-w-0 truncate text-[0.9375rem] font-semibold">{nombre ?? "Sin nombre"}</p>
                  {origen != null && (
                    <p className="mono shrink-0 text-sm font-semibold">
                      {formatearMonto(origen, monedaBase)} {monedaBase}
                    </p>
                  )}
                </div>

                <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
                  {formatearFechaHora(p.received_at)}
                  {p.external_ref && ` · ${p.external_ref}`}
                  {atendido && " · atendido"}
                </p>

                {(tel || destino != null || claveMetodo) && (
                  <p className="mono mt-1 text-xs" style={{ color: "var(--texto-suave)" }}>
                    {[
                      tel,
                      destino != null
                        ? `${formatearMonto(destino, monedaDestino ?? "")} ${monedaDestino ?? ""}`.trim()
                        : null,
                      metodo?.label ?? (claveMetodo ? `método «${claveMetodo}»` : null),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}

                {/* Si la web manda los campos con otros nombres, la tarjeta se
                    quedaría en blanco y parecería que no llegó nada. Se enseña
                    un adelanto de lo que sea que haya venido. */}
                {!nombre && !origen && (
                  <p className="mono mt-1 break-words text-xs" style={{ color: "var(--texto-suave)" }}>
                    {Object.entries(p.payload)
                      .slice(0, 4)
                      .map(([k, v]) => `${k}: ${typeof v === "object" ? "…" : String(v).slice(0, 24)}`)
                      .join(" · ")}
                  </p>
                )}

                {claveMetodo && !metodo && (
                  <p className="mt-1 text-xs" style={{ color: "#BB6B00" }}>
                    Ese método no existe aquí. Elígelo a mano al registrarla.
                  </p>
                )}

                <button
                  className="mt-2 text-xs font-medium"
                  type="button"
                  onClick={() => setAbierto(viendoJson ? null : p.id)}
                  style={{ color: "var(--marca)", minHeight: "2.75rem" }}
                >
                  {viendoJson ? "Ocultar lo que llegó" : "Ver lo que llegó"}
                </button>

                {viendoJson && (
                  <pre
                    className="mono mt-1 overflow-x-auto rounded-lg p-3 text-[0.6875rem]"
                    style={{ background: "var(--fondo)", border: "1px solid var(--linea)" }}
                  >
                    {JSON.stringify(p.payload, null, 2)}
                  </pre>
                )}

                <div className="mt-3 flex gap-2">
                  {!atendido ? (
                    <>
                      <button
                        className="boton-secundario flex-1 justify-center text-sm"
                        type="button"
                        onClick={() => marcar(p.id, true)}
                        disabled={ocupado === p.id}
                      >
                        Descartar
                      </button>
                      <button
                        className="boton-primario flex-1"
                        type="button"
                        onClick={() => convertir(p)}
                        disabled={ocupado === p.id}
                      >
                        Registrar entrega
                      </button>
                    </>
                  ) : (
                    <button
                      className="boton-secundario w-full justify-center text-sm"
                      type="button"
                      onClick={() => marcar(p.id, false)}
                      disabled={ocupado === p.id}
                    >
                      Devolver a pendientes
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
