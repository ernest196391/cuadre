"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { useSesion } from "@/lib/sesion";
import { useEnvioUnico } from "@/lib/envioUnico";

interface Contacto {
  id: string;
  full_name: string;
  phone: string | null;
  contact_roles: { role: string }[];
}

const ROLES = [
  { valor: "client", etiqueta: "Cliente" },
  { valor: "usdt_supplier", etiqueta: "Proveedor USDT" },
  { valor: "courier", etiqueta: "Mensajero" },
  { valor: "worker", etiqueta: "Trabajador" },
];

export default function ContactosPage() {
  const { tenant, perfil } = useSesion();
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");

  const [formAbierto, setFormAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [roles, setRoles] = useState<string[]>(["client"]);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const { data, error: err } = await supabase()
        .from("contacts")
        .select("id, full_name, phone, contact_roles(role)")
        .eq("active", true)
        .order("full_name");
      if (err) throw err;
      setContactos((data ?? []) as unknown as Contacto[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los contactos.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return contactos;
    const soloDigitos = q.replace(/\D/g, "");
    return contactos.filter(
      (c) =>
        c.full_name.toLowerCase().includes(q) ||
        (soloDigitos.length > 0 && (c.phone ?? "").replace(/\D/g, "").includes(soloDigitos))
    );
  }, [busqueda, contactos]);

  const envioContacto = useEnvioUnico();

  async function crear(e: FormEvent) {
    e.preventDefault();
    if (nombre.trim().length < 2) return setErrorForm("Escribe el nombre.");
    if (!perfil || !tenant) return;
    if (!envioContacto.tomar()) return;

    setGuardando(true);
    setErrorForm(null);
    const sb = supabase();
    const { data, error: err } = await sb
      .from("contacts")
      .insert({
        tenant_id: tenant.id,
        full_name: nombre.trim(),
        phone: telefono.trim() || null,
        created_by: perfil.id,
      })
      .select("id")
      .single();

    if (err || !data) {
      envioContacto.soltar();
      setGuardando(false);
      setErrorForm("No se pudo crear: " + (err?.message ?? "error desconocido"));
      return;
    }

    if (roles.length > 0) {
      await sb.from("contact_roles").insert(roles.map((role) => ({ contact_id: data.id, role })));
    }

    envioContacto.soltar();
    setGuardando(false);
    setNombre("");
    setTelefono("");
    setRoles(["client"]);
    setFormAbierto(false);
    cargar();
  }

  function alternarRol(valor: string) {
    setRoles((prev) => (prev.includes(valor) ? prev.filter((r) => r !== valor) : [...prev, valor]));
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Contactos</h1>
        <button
          className="boton-secundario"
          style={{ color: "var(--marca)" }}
          onClick={() => setFormAbierto((v) => !v)}
          type="button"
        >
          {formAbierto ? "Cancelar" : "+ Nuevo"}
        </button>
      </div>

      {formAbierto && (
        <form onSubmit={crear} className="tarjeta mb-4 flex flex-col gap-4 p-4">
          <div>
            <label className="etiqueta" htmlFor="nombre">
              Nombre
            </label>
            <input id="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus required />
          </div>
          <div>
            <label className="etiqueta" htmlFor="telefono">
              WhatsApp
            </label>
            <input
              id="telefono"
              type="tel"
              inputMode="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
            />
          </div>
          <div>
            <label className="etiqueta">Etiquetas</label>
            <div className="flex flex-wrap gap-2">
              {ROLES.map((r) => {
                const activo = roles.includes(r.valor);
                return (
                  <button
                    key={r.valor}
                    type="button"
                    onClick={() => alternarRol(r.valor)}
                    aria-pressed={activo}
                    className="rounded-full px-4 text-sm font-medium"
                    style={{
                      minHeight: "2.75rem",
                      border: `1.5px solid ${activo ? "var(--marca)" : "var(--linea)"}`,
                      color: activo ? "var(--marca)" : "var(--texto-suave)",
                      background: activo ? "color-mix(in srgb, var(--marca) 7%, white)" : "var(--tarjeta)",
                    }}
                  >
                    {r.etiqueta}
                  </button>
                );
              })}
            </div>
          </div>
          <button className="boton-primario" type="submit" disabled={guardando}>
            {guardando ? "Creando…" : "Crear contacto"}
          </button>
          {errorForm && (
            <p className="text-sm" style={{ color: "#b3261e" }}>
              {errorForm}
            </p>
          )}
        </form>
      )}

      <input
        type="search"
        className="mb-4"
        placeholder="Buscar por nombre o teléfono"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
      />

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
      ) : filtrados.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed p-6 text-center text-sm"
          style={{ borderColor: "var(--linea)", color: "var(--texto-suave)" }}
        >
          {contactos.length === 0 ? "Aún no hay contactos." : "Ninguno coincide con la búsqueda."}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtrados.map((c) => (
            <li key={c.id}>
              <Link
                href={`/contactos/${c.id}`}
                className="tarjeta flex items-center justify-between gap-3 p-4"
                style={{ minHeight: "4rem" }}
              >
                <div className="min-w-0">
                  <p className="truncate text-[0.9375rem] font-medium">{c.full_name}</p>
                  <p className="truncate text-xs" style={{ color: "var(--texto-suave)" }}>
                    {c.contact_roles.map((r) => ROLES.find((x) => x.valor === r.role)?.etiqueta).filter(Boolean).join(" · ") ||
                      "Sin etiquetar"}
                  </p>
                </div>
                <span className="shrink-0 text-sm" style={{ color: "var(--texto-suave)" }}>
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
