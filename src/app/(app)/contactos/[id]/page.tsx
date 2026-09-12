"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { useSesion } from "@/lib/sesion";
import { useEnvioUnico } from "@/lib/envioUnico";
import EditarContacto from "@/components/EditarContacto";
import EditarCuenta from "@/components/EditarCuenta";
import { formatearFecha, formatearMonto } from "@/lib/format";

interface Contacto {
  id: string;
  full_name: string;
  phone: string | null;
  notes: string | null;
  active: boolean;
}

interface Cuenta {
  id: string;
  alias: string;
  holder_name: string | null;
  bank: string | null;
  account_type: string;
  pan_last4: string | null;
}

/** Cuánto aguanta un número de tarjeta en pantalla antes de taparse solo. */
const SEGUNDOS_VISIBLE = 30;

interface Entrega {
  id: string;
  delivered_at: string;
  source_amount_received: number;
  delivered_amount: number;
  delivered_currency: string;
  delivery_methods: { label: string } | null;
}

export default function ContactoPage({ params }: { params: { id: string } }) {
  const { tenant } = useSesion();
  const monedaOrigen = tenant?.base_currency ?? "";

  const [contacto, setContacto] = useState<Contacto | null>(null);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [revelado, setRevelado] = useState<Record<string, string>>({});
  const [segundos, setSegundos] = useState<Record<string, number>>({});
  const [revelando, setRevelando] = useState<string | null>(null);
  const [errorRevelar, setErrorRevelar] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [copiadoCuenta, setCopiadoCuenta] = useState<string | null>(null);

  const envioCuenta = useEnvioUnico();
  const [editandoContacto, setEditandoContacto] = useState(false);
  const [copiadoTel, setCopiadoTel] = useState(false);
  const [editandoCuenta, setEditandoCuenta] = useState<string | null>(null);
  const [formCuenta, setFormCuenta] = useState(false);
  const [alias, setAlias] = useState("");
  const [titular, setTitular] = useState("");
  const [banco, setBanco] = useState("");
  const [numero, setNumero] = useState("");
  const [guardandoCuenta, setGuardandoCuenta] = useState(false);
  const [errorCuenta, setErrorCuenta] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const sb = supabase();
      const [cRes, aRes, eRes] = await Promise.all([
        sb.from("contacts").select("id, full_name, phone, notes, active").eq("id", params.id).single(),
        sb
          .from("destination_accounts_safe")
          .select("id, alias, holder_name, bank, account_type, pan_last4")
          .eq("contact_id", params.id)
          .eq("active", true)
          .order("created_at"),
        sb
          .from("deliveries")
          .select("id, delivered_at, source_amount_received, delivered_amount, delivered_currency, delivery_methods:method_id(label)")
          .eq("client_contact_id", params.id)
          .is("voided_at", null)
          .order("delivered_at", { ascending: false })
          .limit(5),
      ]);
      if (cRes.error) throw cRes.error;
      setContacto(cRes.data as Contacto);
      setCuentas((aRes.data ?? []) as Cuenta[]);
      setEntregas((eRes.data ?? []) as unknown as Entrega[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el contacto.");
    } finally {
      setCargando(false);
    }
  }, [params.id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  /**
   * El número se tapa solo. De nada sirve cifrarlo en la base si luego se queda
   * a la vista en un teléfono, en la calle: la pantalla es el eslabón débil.
   */
  useEffect(() => {
    if (Object.keys(segundos).length === 0) return;
    const t = setInterval(() => {
      setSegundos((prev) => {
        const siguiente: Record<string, number> = {};
        const agotadas: string[] = [];
        for (const [id, s] of Object.entries(prev)) {
          if (s <= 1) agotadas.push(id);
          else siguiente[id] = s - 1;
        }
        if (agotadas.length > 0) {
          setRevelado((r) => {
            const copia = { ...r };
            for (const id of agotadas) delete copia[id];
            return copia;
          });
        }
        return siguiente;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [segundos]);

  /** El número completo se pide a propósito; no viaja al cargar la pantalla. */
  async function revelar(cuentaId: string) {
    setRevelando(cuentaId);
    setErrorRevelar(null);
    try {
      const res = await fetch(`/api/cuentas/${cuentaId}/revelar`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "No se pudo revelar.");
      setRevelado((prev) => ({ ...prev, [cuentaId]: body.pan }));
      setSegundos((prev) => ({ ...prev, [cuentaId]: SEGUNDOS_VISIBLE }));
    } catch (err) {
      setErrorRevelar(err instanceof Error ? err.message : "No se pudo revelar.");
    } finally {
      setRevelando(null);
    }
  }

  function ocultar(cuentaId: string) {
    const quitar = <T,>(m: Record<string, T>) => {
      const copia = { ...m };
      delete copia[cuentaId];
      return copia;
    };
    setRevelado(quitar);
    setSegundos(quitar);
  }

  async function crearCuenta(e: FormEvent) {
    e.preventDefault();
    if (!envioCuenta.tomar()) return;
    setGuardandoCuenta(true);
    setErrorCuenta(null);
    try {
      const res = await fetch("/api/cuentas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: params.id,
          alias: alias.trim(),
          holder_name: titular.trim(),
          bank: banco.trim(),
          account_type: "card",
          pan: numero,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "No se pudo guardar.");
      setAlias("");
      setTitular("");
      setBanco("");
      setNumero("");
      setFormCuenta(false);
      cargar();
    } catch (err) {
      setErrorCuenta(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      envioCuenta.soltar();
      setGuardandoCuenta(false);
    }
  }

  const ultima = entregas[0];
  const resumen = ultima
    ? `${contacto?.full_name ?? ""}: envío del ${formatearFecha(ultima.delivered_at)}. ` +
      `Recibimos ${formatearMonto(Number(ultima.source_amount_received), monedaOrigen)} ${monedaOrigen} ` +
      `y se entregaron ${formatearMonto(Number(ultima.delivered_amount), ultima.delivered_currency)} ` +
      `${ultima.delivered_currency} por ${ultima.delivery_methods?.label ?? "entrega"}.`
    : "";

  async function copiarResumen() {
    try {
      await navigator.clipboard.writeText(resumen);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      /* portapapeles no disponible */
    }
  }

  if (cargando) {
    return (
      <p className="py-10 text-center text-sm" style={{ color: "var(--texto-suave)" }}>
        Cargando…
      </p>
    );
  }

  if (error || !contacto) {
    return (
      <div className="tarjeta p-5 text-center">
        <p className="mb-3 text-sm" style={{ color: "#b3261e" }}>
          {error ?? "Contacto no encontrado."}
        </p>
        <button className="boton-secundario mx-auto h-11" onClick={cargar} type="button">
          Reintentar
        </button>
      </div>
    );
  }

  const wa = contacto.phone ? `https://wa.me/${contacto.phone.replace(/\D/g, "")}` : null;

  return (
    <>
      <Link
        href="/contactos"
        className="mb-1 -ml-1 inline-flex items-center px-1 text-sm"
        style={{ color: "var(--texto-suave)", minHeight: "2.75rem" }}
      >
        ‹ Contactos
      </Link>
      <div className="mb-1 flex items-start justify-between gap-3">
        <h1 className="min-w-0 text-xl font-semibold">{contacto.full_name}</h1>
        {!editandoContacto && (
          <button
            className="shrink-0 text-sm font-medium"
            type="button"
            onClick={() => setEditandoContacto(true)}
            style={{ color: "var(--marca)", minHeight: "2.75rem" }}
          >
            Editar
          </button>
        )}
      </div>

      {contacto.phone && !editandoContacto && (
        <div className="mb-4 flex items-center gap-3">
          <p className="mono text-sm" style={{ color: "var(--texto-suave)" }}>
            {contacto.phone}
          </p>
          <button
            className="text-xs font-medium"
            type="button"
            style={{ color: "var(--marca)", minHeight: "2.75rem" }}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(contacto.phone ?? "");
                setCopiadoTel(true);
                setTimeout(() => setCopiadoTel(false), 1800);
              } catch {
                /* portapapeles no disponible */
              }
            }}
          >
            {copiadoTel ? "¡Copiado!" : "Copiar"}
          </button>
        </div>
      )}

      {!contacto.active && !editandoContacto && (
        <p
          className="mb-4 rounded-xl px-4 py-3 text-sm"
          style={{ background: "rgba(187,107,0,.1)", color: "#BB6B00" }}
        >
          Dado de baja. No sale al elegir cliente ni trabajador.
        </p>
      )}

      {editandoContacto && (
        <EditarContacto
          contacto={contacto}
          onCerrar={() => setEditandoContacto(false)}
          onGuardado={() => {
            setEditandoContacto(false);
            cargar();
          }}
        />
      )}

      <div className="mb-6 grid grid-cols-2 gap-2">
        {wa ? (
          <a className="boton-primario" href={wa} target="_blank" rel="noopener noreferrer">
            WhatsApp
          </a>
        ) : (
          <span
            className="boton-secundario justify-center"
            style={{ color: "var(--texto-suave)", opacity: 0.6 }}
          >
            Sin teléfono
          </span>
        )}
        <button
          className="boton-secundario justify-center"
          type="button"
          onClick={copiarResumen}
          disabled={!resumen}
          style={{ opacity: resumen ? 1 : 0.5 }}
        >
          {copiado ? "¡Copiado!" : "Copiar resumen"}
        </button>
      </div>

      {resumen && (
        <p
          className="mb-6 rounded-xl px-4 py-3 text-sm"
          style={{ background: "var(--tarjeta)", border: "1px solid var(--linea)", color: "var(--texto-suave)" }}
        >
          {resumen}
        </p>
      )}

      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold" style={{ color: "var(--texto-suave)" }}>
          Cuentas de destino
        </h2>
        <button
          className="text-sm font-medium"
          style={{ color: "var(--marca)", minHeight: "2.75rem" }}
          onClick={() => setFormCuenta((v) => !v)}
          type="button"
        >
          {formCuenta ? "Cancelar" : "+ Añadir"}
        </button>
      </div>

      {formCuenta && (
        <form onSubmit={crearCuenta} className="tarjeta mb-4 flex flex-col gap-4 p-4">
          <div>
            <label className="etiqueta" htmlFor="alias">
              Cómo la llamas
            </label>
            <input
              id="alias"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="tarjeta de la mamá"
              required
            />
          </div>
          <div>
            <label className="etiqueta" htmlFor="titular">
              Titular
            </label>
            <input id="titular" value={titular} onChange={(e) => setTitular(e.target.value)} />
          </div>
          <div>
            <label className="etiqueta" htmlFor="banco">
              Banco
            </label>
            <input id="banco" value={banco} onChange={(e) => setBanco(e.target.value)} />
          </div>
          <div>
            <label className="etiqueta" htmlFor="numero">
              Número de tarjeta
            </label>
            <input
              id="numero"
              className="mono"
              inputMode="numeric"
              autoComplete="off"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              required
            />
            <p className="mt-1.5 text-xs" style={{ color: "var(--texto-suave)" }}>
              Solo se verán los últimos 4 dígitos.
            </p>
          </div>
          <button className="boton-primario" type="submit" disabled={guardandoCuenta}>
            {guardandoCuenta ? "Guardando…" : "Guardar cuenta"}
          </button>
          {errorCuenta && (
            <p className="text-sm" style={{ color: "#b3261e" }}>
              {errorCuenta}
            </p>
          )}
        </form>
      )}

      {cuentas.length === 0 ? (
        <div
          className="mb-6 rounded-2xl border border-dashed p-6 text-center text-sm"
          style={{ borderColor: "var(--linea)", color: "var(--texto-suave)" }}
        >
          Aún no hay cuentas de destino.
        </div>
      ) : (
        <ul className="mb-6 flex flex-col gap-2">
          {cuentas.map((c) => (
            <li key={c.id} className="tarjeta p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 text-[0.9375rem] font-medium">{c.alias}</p>
                {editandoCuenta !== c.id && (
                  <button
                    className="shrink-0 text-sm font-medium"
                    type="button"
                    onClick={() => setEditandoCuenta(c.id)}
                    style={{ color: "var(--marca)", minHeight: "2.75rem" }}
                  >
                    Editar
                  </button>
                )}
              </div>
              <p className="mb-2 text-xs" style={{ color: "var(--texto-suave)" }}>
                {[c.holder_name, c.bank].filter(Boolean).join(" · ") || "Sin titular"}
              </p>
              <div className="flex items-center justify-between gap-3">
                <span className="mono text-sm">
                  {revelado[c.id]
                    ? revelado[c.id].replace(/(.{4})/g, "$1 ").trim()
                    : `•••• •••• •••• ${c.pan_last4 ?? "····"}`}
                </span>
                {revelado[c.id] ? (
                  <button
                    className="boton-secundario shrink-0 text-sm"
                    style={{ minHeight: "2.75rem" }}
                    onClick={() => ocultar(c.id)}
                    type="button"
                  >
                    Ocultar {segundos[c.id] ?? 0}s
                  </button>
                ) : (
                  <button
                    className="boton-secundario shrink-0 text-sm"
                    style={{ minHeight: "2.75rem" }}
                    onClick={() => revelar(c.id)}
                    disabled={revelando === c.id}
                    type="button"
                  >
                    {revelando === c.id ? "…" : "Ver número"}
                  </button>
                )}
              </div>
              {revelado[c.id] && (
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
                    Esta consulta quedó registrada con tu nombre y la hora.
                  </p>
                  <button
                    className="shrink-0 text-xs font-medium"
                    style={{ color: "var(--marca)", minHeight: "2.75rem" }}
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(revelado[c.id]);
                        setCopiadoCuenta(c.id);
                        setTimeout(() => setCopiadoCuenta(null), 1800);
                      } catch {
                        /* portapapeles no disponible */
                      }
                    }}
                  >
                    {copiadoCuenta === c.id ? "¡Copiado!" : "Copiar número"}
                  </button>
                </div>
              )}

              {editandoCuenta === c.id && (
                <EditarCuenta
                  cuenta={c}
                  onCerrar={() => setEditandoCuenta(null)}
                  onGuardado={() => {
                    setEditandoCuenta(null);
                    cargar();
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {errorRevelar && (
        <p className="mb-6 text-sm" style={{ color: "#b3261e" }} role="alert">
          {errorRevelar}
        </p>
      )}

      <h2 className="mb-2 text-sm font-semibold" style={{ color: "var(--texto-suave)" }}>
        Últimas entregas
      </h2>
      {entregas.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed p-6 text-center text-sm"
          style={{ borderColor: "var(--linea)", color: "var(--texto-suave)" }}
        >
          Todavía no tiene entregas registradas.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {entregas.map((e) => (
            <li key={e.id} className="tarjeta flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="text-sm">{formatearFecha(e.delivered_at)}</p>
                <p className="truncate text-xs" style={{ color: "var(--texto-suave)" }}>
                  {e.delivery_methods?.label ?? "—"}
                </p>
              </div>
              <p className="mono shrink-0 text-sm font-semibold">
                {formatearMonto(Number(e.delivered_amount), e.delivered_currency)} {e.delivered_currency}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
