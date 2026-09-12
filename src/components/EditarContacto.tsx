"use client";

import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase/client";
import { useEnvioUnico } from "@/lib/envioUnico";

export interface ContactoEditable {
  id: string;
  full_name: string;
  phone: string | null;
  notes: string | null;
  active: boolean;
}

/**
 * Corregir los datos de una persona. Esto sí se edita en sitio: un teléfono o
 * un nombre mal escrito no son un hecho contable, son una etiqueta. Lo que no
 * se toca nunca es lo que ya pasó por caja.
 *
 * Dar de baja en vez de borrar: el contacto aparece en entregas antiguas y
 * borrarlo dejaría esas entregas sin nombre.
 */
export default function EditarContacto({
  contacto,
  onGuardado,
  onCerrar,
}: {
  contacto: ContactoEditable;
  onGuardado: () => void;
  onCerrar: () => void;
}) {
  const envio = useEnvioUnico();
  const [nombre, setNombre] = useState(contacto.full_name);
  const [telefono, setTelefono] = useState(contacto.phone ?? "");
  const [notas, setNotas] = useState(contacto.notes ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmarBaja, setConfirmarBaja] = useState(false);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (nombre.trim().length < 2) {
      setError("El nombre no puede quedar vacío.");
      return;
    }
    if (!envio.tomar()) return;
    setGuardando(true);
    setError(null);
    const { error: err } = await supabase()
      .from("contacts")
      .update({
        full_name: nombre.trim(),
        phone: telefono.trim() || null,
        notes: notas.trim() || null,
      })
      .eq("id", contacto.id);
    setGuardando(false);
    envio.soltar();
    if (err) {
      setError("No se pudo guardar. " + err.message);
      return;
    }
    onGuardado();
  }

  async function cambiarBaja() {
    if (!envio.tomar()) return;
    setGuardando(true);
    setError(null);
    const { error: err } = await supabase()
      .from("contacts")
      .update({ active: !contacto.active })
      .eq("id", contacto.id);
    setGuardando(false);
    envio.soltar();
    setConfirmarBaja(false);
    if (err) {
      setError("No se pudo cambiar. " + err.message);
      return;
    }
    onGuardado();
  }

  return (
    <form onSubmit={guardar} className="tarjeta mb-4 flex flex-col gap-4 p-4">
      <div>
        <label className="etiqueta" htmlFor="ed-nombre">
          Nombre
        </label>
        <input id="ed-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
      </div>
      <div>
        <label className="etiqueta" htmlFor="ed-telefono">
          Teléfono
        </label>
        <input
          id="ed-telefono"
          className="mono"
          type="tel"
          inputMode="tel"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          placeholder="+53 5 234 5678"
        />
      </div>
      <div>
        <label className="etiqueta" htmlFor="ed-notas">
          Notas
        </label>
        <textarea id="ed-notas" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
      </div>

      {error && (
        <p className="text-sm" style={{ color: "#b3261e" }} role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button className="boton-secundario flex-1 justify-center" type="button" onClick={onCerrar}>
          Cancelar
        </button>
        <button className="boton-primario flex-1" type="submit" disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar"}
        </button>
      </div>

      <div className="border-t pt-3" style={{ borderColor: "var(--linea)" }}>
        {confirmarBaja ? (
          <>
            <p className="mb-3 text-xs" style={{ color: "var(--texto-suave)" }}>
              {contacto.active
                ? "Deja de salir al elegir cliente o trabajador. Sus entregas antiguas se quedan como están."
                : "Vuelve a salir en las listas."}
            </p>
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
                onClick={cambiarBaja}
                disabled={guardando}
                style={contacto.active ? { background: "#b3261e" } : undefined}
              >
                {contacto.active ? "Dar de baja" : "Reactivar"}
              </button>
            </div>
          </>
        ) : (
          <button
            className="text-sm font-medium"
            type="button"
            onClick={() => setConfirmarBaja(true)}
            style={{ color: contacto.active ? "#b3261e" : "var(--marca)", minHeight: "2.75rem" }}
          >
            {contacto.active ? "Dar de baja este contacto" : "Reactivar este contacto"}
          </button>
        )}
      </div>
    </form>
  );
}
