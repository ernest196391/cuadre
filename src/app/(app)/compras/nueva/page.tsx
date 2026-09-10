"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useSesion } from "@/lib/sesion";
import { formatearCosto, parsearNumero } from "@/lib/format";
import CampoMonto from "@/components/CampoMonto";
import SelectorContacto, { type ContactoBreve } from "@/components/SelectorContacto";

const ULTIMO_PROVEEDOR = "cuadre.ultimo_proveedor";

export default function NuevaCompraPage() {
  const router = useRouter();
  const { tenant, perfil } = useSesion();
  const monedaOrigen = tenant?.base_currency ?? "";

  const [proveedores, setProveedores] = useState<ContactoBreve[]>([]);
  const [proveedor, setProveedor] = useState<ContactoBreve | null>(null);
  const [gastado, setGastado] = useState("");
  const [fee, setFee] = useState("");
  const [usdt, setUsdt] = useState("");
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const { data } = await supabase()
      .from("contacts")
      .select("id, full_name, phone")
      .eq("active", true)
      .order("full_name");
    const lista = (data ?? []) as ContactoBreve[];
    setProveedores(lista);
    // El proveedor casi siempre es el mismo de la vez pasada.
    try {
      const guardado = localStorage.getItem(ULTIMO_PROVEEDOR);
      const previo = lista.find((c) => c.id === guardado);
      if (previo) setProveedor(previo);
    } catch {
      /* modo privado */
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const montoGastado = parsearNumero(gastado);
  const montoFee = parsearNumero(fee);
  const usdtRecibidos = parsearNumero(usdt);
  // La misma fórmula que la columna generada de la base. Aquí solo se muestra.
  const costoPorUsdt = usdtRecibidos > 0 ? (montoGastado + montoFee) / usdtRecibidos : 0;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (montoGastado <= 0) return setError(`Escribe cuánto gastaste en ${monedaOrigen}.`);
    if (usdtRecibidos <= 0) return setError("Escribe cuántos USDT te quedaron.");
    if (!perfil || !tenant) return;

    setGuardando(true);
    setError(null);
    const { error: err } = await supabase().from("purchases").insert({
      tenant_id: tenant.id,
      source_amount: montoGastado,
      source_currency: monedaOrigen,
      fee_source_amount: montoFee,
      usdt_received: usdtRecibidos,
      supplier_contact_id: proveedor?.id ?? null,
      notes: notas.trim() || null,
      created_by: perfil.id,
    });
    setGuardando(false);

    if (err) {
      setError("No se pudo guardar: " + err.message);
      return;
    }
    if (proveedor) {
      try {
        localStorage.setItem(ULTIMO_PROVEEDOR, proveedor.id);
      } catch {
        /* modo privado */
      }
    }
    router.push("/");
  }

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Registrar compra de USDT</h1>
      <p className="mb-4 text-sm" style={{ color: "var(--texto-suave)" }}>
        El costo real por USDT lo calcula la app. No hay campo para escribirlo.
      </p>

      <form onSubmit={guardar} className="flex flex-col gap-4">
        <CampoMonto
          id="gastado"
          etiqueta={`Gastaste (${monedaOrigen})`}
          sufijo={monedaOrigen}
          valor={gastado}
          onValor={setGastado}
          autoFocus
        />

        <CampoMonto
          id="usdt"
          etiqueta="USDT que te quedaron en la wallet"
          sufijo="USDT"
          valor={usdt}
          onValor={setUsdt}
          decimal
          ayuda="Lo que llegó de verdad, ya con el fee descontado."
        />

        <CampoMonto
          id="fee"
          etiqueta={`Fee pagado aparte en ${monedaOrigen} (si hubo)`}
          sufijo={monedaOrigen}
          valor={fee}
          onValor={setFee}
        />

        <div className="rounded-2xl px-4 py-4" style={{ background: "var(--marca)", color: "#fff" }}>
          <p className="mb-1 text-xs opacity-80">Te costó cada USDT</p>
          <p className="mono text-2xl font-semibold">
            {costoPorUsdt > 0 ? `${formatearCosto(costoPorUsdt)} ${monedaOrigen}` : "—"}
          </p>
        </div>

        <SelectorContacto
          etiqueta="Proveedor"
          contactos={proveedores}
          seleccionado={proveedor}
          onSeleccionar={setProveedor}
          placeholder="Buscar proveedor"
        />

        <div>
          <label className="etiqueta" htmlFor="notas">
            Notas
          </label>
          <textarea id="notas" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
        </div>

        <button className="boton-primario mt-1" type="submit" disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar compra"}
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
