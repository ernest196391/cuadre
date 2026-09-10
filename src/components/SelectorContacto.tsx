"use client";

import { useMemo, useState } from "react";

export interface ContactoBreve {
  id: string;
  full_name: string;
  phone: string | null;
}

/**
 * Buscador de contactos. Filtra según se escribe y deja crear uno nuevo sin
 * salir del formulario: parar a mitad de una entrega para dar de alta a alguien
 * es justo lo que hace que no se registre la entrega.
 */
export default function SelectorContacto({
  etiqueta,
  contactos,
  seleccionado,
  onSeleccionar,
  onCrear,
  placeholder = "Buscar por nombre o teléfono",
}: {
  etiqueta: string;
  contactos: ContactoBreve[];
  seleccionado: ContactoBreve | null;
  onSeleccionar: (c: ContactoBreve | null) => void;
  onCrear?: (nombre: string) => void;
  placeholder?: string;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [abierto, setAbierto] = useState(false);

  const resultados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return contactos.slice(0, 6);
    return contactos
      .filter(
        (c) =>
          c.full_name.toLowerCase().includes(q) ||
          (c.phone ?? "").replace(/\D/g, "").includes(q.replace(/\D/g, ""))
      )
      .slice(0, 8);
  }, [busqueda, contactos]);

  if (seleccionado && !abierto) {
    return (
      <div>
        <label className="etiqueta">{etiqueta}</label>
        <button
          type="button"
          className="boton-secundario w-full justify-between"
          onClick={() => {
            setAbierto(true);
            setBusqueda("");
          }}
        >
          <span className="truncate">{seleccionado.full_name}</span>
          <span className="shrink-0 text-xs font-normal" style={{ color: "var(--texto-suave)" }}>
            Cambiar
          </span>
        </button>
      </div>
    );
  }

  return (
    <div>
      <label className="etiqueta">{etiqueta}</label>
      <input
        type="text"
        autoComplete="off"
        placeholder={placeholder}
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        onFocus={() => setAbierto(true)}
      />
      {abierto && (
        <ul className="mt-2 flex flex-col gap-1">
          {resultados.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="boton-secundario w-full justify-start text-left font-normal"
                onClick={() => {
                  onSeleccionar(c);
                  setAbierto(false);
                }}
              >
                <span className="truncate">
                  {c.full_name}
                  {c.phone && (
                    <span className="ml-2 text-xs" style={{ color: "var(--texto-suave)" }}>
                      {c.phone}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}

          {busqueda.trim().length > 1 && onCrear && (
            <li>
              <button
                type="button"
                className="boton-secundario w-full justify-start text-left"
                style={{ color: "var(--marca)" }}
                onClick={() => {
                  onCrear(busqueda.trim());
                  setAbierto(false);
                }}
              >
                + Crear «{busqueda.trim()}»
              </button>
            </li>
          )}

          {resultados.length === 0 && !onCrear && (
            <li className="px-1 py-2 text-sm" style={{ color: "var(--texto-suave)" }}>
              Sin resultados.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
