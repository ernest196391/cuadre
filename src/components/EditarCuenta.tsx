"use client";

import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase/client";
import { useEnvioUnico } from "@/lib/envioUnico";

export interface CuentaEditable {
  id: string;
  alias: string;
  holder_name: string | null;
  bank: string | null;
  pan_last4: string | null;
}

/**
 * Corregir una cuenta de destino.
 *
 * EL NÚMERO NO SE EDITA, y es a propósito: una entrega pasada apunta a esta
 * cuenta, así que cambiarle el número reescribiría a dónde se mandó aquel
 * dinero. Si entró con un dígito mal, se da de baja y se añade la correcta;
 * queda entonces claro qué se usó cada vez.
 *
 * La base lo respalda: `authenticated` solo tiene permiso de escritura sobre
 * alias, titular, banco y active. pan_encrypted no se puede tocar desde aquí
 * ni queriendo.
 */
export default function EditarCuenta({
  cuenta,
  onGuardado,
  onCerrar,
}: {
  cuenta: CuentaEditable;
  onGuardado: () => void;
  onCerrar: () => void;
}) {
  const envio = useEnvioUnico();
  const [alias, setAlias] = useState(cuenta.alias);
  const [titular, setTitular] = useState(cuenta.holder_name ?? "");
  const [banco, setBanco] = useState(cuenta.bank ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmarBaja, setConfirmarBaja] = useState(false);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (alias.trim().length < 2) {
      setError("Ponle un nombre para reconocerla.");
      return;
    }
    if (!envio.tomar()) return;
    setGuardando(true);
    setError(null);
    const { error: err } = await supabase()
      .from("destination_accounts")
      .update({
        alias: alias.trim(),
        holder_name: titular.trim() || null,
        bank: banco.trim() || null,
      })
      .eq("id", cuenta.id);
    setGuardando(false);
    envio.soltar();
    if (err) {
      setError("No se pudo guardar. " + err.message);
      return;
    }
    onGuardado();
  }

  async function darDeBaja() {
    if (!envio.tomar()) return;
    setGuardando(true);
    setError(null);
    const { error: err } = await supabase()
      .from("destination_accounts")
      .update({ active: false })
      .eq("id", cuenta.id);
    setGuardando(false);
    envio.soltar();
    setConfirmarBaja(false);
    if (err) {
      setError("No se pudo dar de baja. " + err.message);
      return;
    }
    onGuardado();
  }

  return (
    <form onSubmit={guardar} className="mt-3 border-t pt-3" style={{ borderColor: "var(--linea)" }}>
      <div className="flex flex-col gap-3">
        <div>
          <label className="etiqueta" htmlFor={`ec-alias-${cuenta.id}`}>
            Cómo la llamas
          </label>
          <input
            id={`ec-alias-${cuenta.id}`}
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="etiqueta" htmlFor={`ec-titular-${cuenta.id}`}>
            Titular
          </label>
          <input
            id={`ec-titular-${cuenta.id}`}
            value={titular}
            onChange={(e) => setTitular(e.target.value)}
          />
        </div>
        <div>
          <label className="etiqueta" htmlFor={`ec-banco-${cuenta.id}`}>
            Banco
          </label>
          <input id={`ec-banco-${cuenta.id}`} value={banco} onChange={(e) => setBanco(e.target.value)} />
        </div>
      </div>

      <p className="mt-2 text-xs" style={{ color: "var(--texto-suave)" }}>
        El número (•••• {cuenta.pan_last4 ?? "····"}) no se cambia. Si está mal, da de baja esta y
        añade la correcta: así se sabe con cuál se hizo cada entrega.
      </p>

      {error && (
        <p className="mt-2 text-sm" style={{ color: "#b3261e" }} role="alert">
          {error}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button className="boton-secundario flex-1 justify-center" type="button" onClick={onCerrar}>
          Cancelar
        </button>
        <button className="boton-primario flex-1" type="submit" disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar"}
        </button>
      </div>

      <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--linea)" }}>
        {confirmarBaja ? (
          <div className="flex gap-2">
            <button
              className="boton-secundario flex-1 justify-center"
              type="button"
              onClick={() => setConfirmarBaja(false)}
            >
              Cancelar
            </button>
            <button
              className="boton-primario flex-1"
              type="button"
              onClick={darDeBaja}
              disabled={guardando}
              style={{ background: "#b3261e" }}
            >
              Sí, dar de baja
            </button>
          </div>
        ) : (
          <button
            className="text-sm font-medium"
            type="button"
            onClick={() => setConfirmarBaja(true)}
            style={{ color: "#b3261e", minHeight: 44 }}
          >
            Dar de baja esta tarjeta
          </button>
        )}
      </div>
    </form>
  );
}
