"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useSesion } from "@/lib/sesion";
import { formatearMonto, formatearUsdt, formatearFechaHora } from "@/lib/format";
import { tasaLegible } from "@/lib/tasas";
import { formatearUsd } from "@/lib/comisiones";
import { guardarParaRepetir } from "@/lib/repetir";

interface Entrega {
  id: string;
  delivered_at: string;
  source_amount_received: number;
  source_currency: string;
  delivered_amount: number;
  delivered_currency: string;
  method_id: string | null;
  rate_applied: number | null;
  usdt_spent: number;
  usdt_rate_used: number | null;
  network_fee_usdt: number;
  usd_value: number | null;
  commission_applied: number | null;
  commission_currency: string | null;
  client_contact_id: string | null;
  destination_account_id: string | null;
  handled_by_contact_id: string | null;
  origin_contact_id: string | null;
  courier_contact_id: string | null;
  courier_fee: number | null;
  courier_fee_currency: string | null;
  notes: string | null;
  voided_at: string | null;
  void_reason: string | null;
  created_at: string;
  delivery_methods: { label: string; target_currency: string } | null;
}

interface Apunte {
  kind: string;
  contact_id: string;
  amount_usd: number;
  pct_applied: number;
  payout_id: string | null;
}

function Dato({ etiqueta, valor, fuerte }: { etiqueta: string; valor: React.ReactNode; fuerte?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <span className="shrink-0 text-sm" style={{ color: "var(--texto-suave)" }}>
        {etiqueta}
      </span>
      <span className={`mono min-w-0 text-right ${fuerte ? "text-[15px] font-semibold" : "text-sm"}`}>
        {valor}
      </span>
    </div>
  );
}

export default function EntregaPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { tenant, perfil } = useSesion();
  const esDueno = perfil?.role === "owner";

  const [entrega, setEntrega] = useState<Entrega | null>(null);
  const [apuntes, setApuntes] = useState<Apunte[]>([]);
  const [nombres, setNombres] = useState<Record<string, string>>({});
  const [cuenta, setCuenta] = useState<{ alias: string; pan_last4: string | null } | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const sb = supabase();
      const { data, error: err } = await sb
        .from("deliveries")
        .select(
          "id, delivered_at, source_amount_received, source_currency, delivered_amount, delivered_currency, method_id, rate_applied, usdt_spent, usdt_rate_used, network_fee_usdt, usd_value, commission_applied, commission_currency, client_contact_id, destination_account_id, handled_by_contact_id, origin_contact_id, courier_contact_id, courier_fee, courier_fee_currency, notes, voided_at, void_reason, created_at, delivery_methods:method_id(label, target_currency)"
        )
        .eq("id", params.id)
        .single();
      if (err) throw err;
      const e = data as unknown as Entrega;
      setEntrega(e);

      const [aRes, cRes, ctaRes] = await Promise.all([
        sb.from("commission_entries")
          .select("kind, contact_id, amount_usd, pct_applied, payout_id")
          .eq("delivery_id", params.id),
        sb.from("contacts").select("id, full_name"),
        e.destination_account_id
          ? sb.from("destination_accounts_safe").select("alias, pan_last4").eq("id", e.destination_account_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      setApuntes((aRes.data ?? []) as Apunte[]);
      const mapa: Record<string, string> = {};
      for (const c of cRes.data ?? []) mapa[c.id as string] = c.full_name as string;
      setNombres(mapa);
      setCuenta((ctaRes.data ?? null) as { alias: string; pan_last4: string | null } | null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la entrega.");
    } finally {
      setCargando(false);
    }
  }, [params.id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function anular() {
    if (!entrega) return;
    if (motivo.trim().length < 3) {
      setError("Escribe por qué la anulas.");
      return;
    }
    setGuardando(true);
    setError(null);
    const { error: err } = await supabase().rpc("void_delivery", {
      p_delivery_id: entrega.id,
      p_reason: motivo.trim(),
    });
    setGuardando(false);
    if (err) {
      setError(err.message);
      return;
    }
    setAnulando(false);
    setMotivo("");
    cargar();
  }

  function repetir() {
    if (!entrega) return;
    guardarParaRepetir({
      metodoId: entrega.method_id,
      recibido: String(Number(entrega.source_amount_received)),
      entregado: String(Number(entrega.delivered_amount)),
      usdt: String(Number(entrega.usdt_spent)),
      clienteId: entrega.client_contact_id,
      cuentaId: entrega.destination_account_id,
      responsableId: entrega.handled_by_contact_id,
      origenId: entrega.origin_contact_id,
      notas: entrega.notes,
    });
    router.push("/entregas/nueva");
  }

  if (cargando) {
    return (
      <p className="py-10 text-center text-sm" style={{ color: "var(--texto-suave)" }}>
        Cargando…
      </p>
    );
  }

  if (!entrega) {
    return (
      <div className="tarjeta p-5 text-center">
        <p className="mb-3 text-sm" style={{ color: "#b3261e" }}>
          {error ?? "No se encontró la entrega."}
        </p>
        <button className="boton-secundario mx-auto h-11" onClick={cargar} type="button">
          Reintentar
        </button>
      </div>
    );
  }

  const moneda = tenant?.base_currency ?? entrega.source_currency;
  const destino = entrega.delivered_currency;
  const anulada = entrega.voided_at !== null;
  // Truthy a propósito, igual que la línea de cada apunte: con `!== null` un
  // payout_id ausente contaba como cobrado y salía el aviso al revés.
  const yaCobrada = apuntes.some((a) => Boolean(a.payout_id));

  return (
    <>
      <Link
        href="/entregas"
        className="mb-3 inline-flex items-center text-sm font-medium"
        style={{ color: "var(--texto-suave)", minHeight: 44 }}
      >
        ‹ Entregas
      </Link>

      <h1 className="mb-1 text-xl font-semibold">
        {formatearMonto(Number(entrega.delivered_amount), destino)} {destino}
      </h1>
      <p className="mb-4 text-sm" style={{ color: "var(--texto-suave)" }}>
        {formatearFechaHora(entrega.delivered_at)}
        {entrega.delivery_methods?.label ? ` · ${entrega.delivery_methods.label}` : ""}
      </p>

      {anulada && (
        <div
          className="mb-4 rounded-2xl p-4"
          style={{ background: "rgba(196,61,75,.08)", border: "1.5px solid rgba(196,61,75,.35)" }}
        >
          <p className="mb-1 text-sm font-semibold" style={{ color: "#b3261e" }}>
            Anulada {formatearFechaHora(entrega.voided_at!)}
          </p>
          <p className="text-sm" style={{ color: "var(--texto-suave)" }}>
            {entrega.void_reason}
          </p>
          <p className="mt-2 text-xs" style={{ color: "var(--texto-suave)" }}>
            No cuenta en las cuentas ni en el saldo. Se queda a la vista para que se sepa que pasó.
          </p>
        </div>
      )}

      <div className="tarjeta mb-4 px-4 py-2">
        <Dato etiqueta={`Recibiste (${moneda})`} valor={`${formatearMonto(Number(entrega.source_amount_received), moneda)}`} fuerte />
        <Dato etiqueta="Entregaste" valor={`${formatearMonto(Number(entrega.delivered_amount), destino)} ${destino}`} fuerte />
        {entrega.rate_applied != null && (
          <Dato etiqueta="Tasa aplicada" valor={tasaLegible(Number(entrega.rate_applied), destino, moneda)} />
        )}
        <Dato etiqueta="USDT movidos" valor={`${formatearUsdt(Number(entrega.usdt_spent))} USDT`} />
        {Number(entrega.network_fee_usdt) > 0 && (
          <Dato etiqueta="Fee de la wallet" valor={`${formatearUsdt(Number(entrega.network_fee_usdt))} USDT`} />
        )}
        {entrega.usdt_rate_used != null && (
          <Dato
            etiqueta="USDT estaba a"
            valor={`${Number(entrega.usdt_rate_used).toLocaleString("es", { maximumFractionDigits: 4 })} ${destino}`}
          />
        )}
        {entrega.usd_value != null && (
          <Dato etiqueta="Valor entregado" valor={`${formatearUsd(Number(entrega.usd_value))} USD`} />
        )}
      </div>

      <h2 className="mb-2 text-sm font-semibold" style={{ color: "var(--texto-suave)" }}>
        Quién y a quién
      </h2>
      <div className="tarjeta mb-4 px-4 py-2">
        <Dato etiqueta="Cliente" valor={entrega.client_contact_id ? nombres[entrega.client_contact_id] ?? "—" : "Sin cliente"} />
        {cuenta && (
          <Dato etiqueta="A la cuenta" valor={`${cuenta.alias}${cuenta.pan_last4 ? ` · •••• ${cuenta.pan_last4}` : ""}`} />
        )}
        <Dato etiqueta="Atendida por" valor={entrega.handled_by_contact_id ? nombres[entrega.handled_by_contact_id] ?? "—" : "—"} />
        <Dato etiqueta="Cliente conseguido por" valor={entrega.origin_contact_id ? nombres[entrega.origin_contact_id] ?? "—" : "Nadie"} />
        {entrega.courier_contact_id && (
          <Dato
            etiqueta="Mensajero"
            valor={`${nombres[entrega.courier_contact_id] ?? "—"}${
              Number(entrega.courier_fee) > 0
                ? ` · ${formatearMonto(Number(entrega.courier_fee), entrega.courier_fee_currency ?? moneda)} ${entrega.courier_fee_currency ?? moneda}`
                : ""
            }`}
          />
        )}
      </div>

      {apuntes.length > 0 && (
        <>
          <h2 className="mb-2 text-sm font-semibold" style={{ color: "var(--texto-suave)" }}>
            Comisiones que generó
          </h2>
          <ul className="mb-4 flex flex-col gap-2">
            {apuntes.map((a, i) => (
              <li key={i} className="tarjeta flex items-baseline justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{nombres[a.contact_id] ?? "—"}</p>
                  <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
                    {a.kind === "delivery" ? "por entregar" : "por conseguir al cliente"} · {Number(a.pct_applied)}%
                    {a.payout_id ? " · ya cobrada" : " · sin cobrar"}
                  </p>
                </div>
                <span className="mono shrink-0 text-sm font-semibold">{formatearUsd(Number(a.amount_usd))} USD</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {entrega.notes && (
        <>
          <h2 className="mb-2 text-sm font-semibold" style={{ color: "var(--texto-suave)" }}>
            Notas
          </h2>
          <p className="tarjeta mb-4 p-4 text-sm">{entrega.notes}</p>
        </>
      )}

      {error && (
        <p className="mb-3 text-sm" style={{ color: "#b3261e" }} role="alert">
          {error}
        </p>
      )}

      {anulada ? (
        <button className="boton-primario" type="button" onClick={repetir}>
          Registrarla de nuevo, corregida
        </button>
      ) : esDueno ? (
        anulando ? (
          <div className="tarjeta p-4">
            <p className="mb-1 text-[15px] font-semibold">Anular esta entrega</p>
            <p className="mb-3 text-xs" style={{ color: "var(--texto-suave)" }}>
              No se borra: deja de contar en las cuentas y queda marcada con el motivo. Si generó
              comisión sin cobrar, se deshace.
            </p>
            <label className="etiqueta" htmlFor="motivo">
              Por qué la anulas
            </label>
            <input
              id="motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Me equivoqué en el monto"
              autoFocus
            />
            <div className="mt-3 flex gap-2">
              <button
                className="boton-secundario flex-1 justify-center"
                type="button"
                onClick={() => {
                  setAnulando(false);
                  setError(null);
                }}
              >
                Cancelar
              </button>
              <button
                className="boton-primario flex-1"
                type="button"
                onClick={anular}
                disabled={guardando}
                style={{ background: "#b3261e" }}
              >
                {guardando ? "Anulando…" : "Anular"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              className="boton-secundario w-full justify-center"
              type="button"
              onClick={() => setAnulando(true)}
              style={{ color: "#b3261e", borderColor: "rgba(196,61,75,.4)" }}
            >
              Anular esta entrega
            </button>
            {yaCobrada && (
              <p className="mt-2 text-xs" style={{ color: "var(--texto-suave)" }}>
                Su comisión ya entró en un cobro, así que no se podrá anular. Ajústalo con quien la
                cobró.
              </p>
            )}
          </>
        )
      ) : (
        <p className="text-center text-xs" style={{ color: "var(--texto-suave)" }}>
          Solo el dueño puede anular una entrega.
        </p>
      )}
    </>
  );
}
