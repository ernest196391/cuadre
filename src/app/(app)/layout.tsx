"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSesion } from "@/lib/sesion";

const PESTANAS = [
  { href: "/", etiqueta: "Hoy", icono: "M4 5h16v14H4zM4 10h16" },
  { href: "/entregas/nueva", etiqueta: "Entrega", icono: "M5 12h14M13 6l6 6-6 6" },
  { href: "/compras/nueva", etiqueta: "Compra", icono: "M19 12H5M11 6l-6 6 6 6" },
  { href: "/contactos", etiqueta: "Contactos", icono: "M4 20c0-3.3 2.7-6 6-6s6 2.7 6 6M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7" },
  { href: "/reportes", etiqueta: "Cuentas", icono: "M4 19h16M7 16V9M12 16V5M17 16v-4" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { cargando, usuario, perfil, tenant, error, salir, recargar } = useSesion();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!cargando && !usuario) router.replace("/login");
  }, [cargando, usuario, router]);

  if (cargando) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 text-sm" style={{ color: "var(--texto-suave)" }}>
        Cargando…
      </div>
    );
  }

  if (!usuario) return null;

  if (error || !perfil || !tenant) {
    return (
      <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-6">
        <p className="text-sm" style={{ color: "#b3261e" }}>
          {error ?? "No se pudo cargar tu operador."}
        </p>
        <button className="boton-secundario h-11" onClick={recargar} type="button">
          Reintentar
        </button>
        <button className="text-sm underline" onClick={salir} type="button">
          Salir
        </button>
      </div>
    );
  }

  return (
    <div
      style={
        {
          "--marca": tenant.brand_primary_color,
          "--acento": tenant.brand_accent_color,
        } as React.CSSProperties
      }
    >
      <header
        className="flex items-center justify-between gap-3 px-5 py-3"
        style={{ background: "var(--tarjeta)", borderBottom: "1px solid var(--linea)" }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-6 w-1.5 shrink-0 rounded-full" style={{ background: "var(--marca)" }} />
          <span className="truncate text-base font-semibold">{tenant.brand_name}</span>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {perfil.role === "owner" && (
            <Link
              href="/ajustes"
              className="flex items-center text-sm font-medium"
              style={{ color: "var(--texto-suave)", minHeight: 44 }}
            >
              Ajustes
            </Link>
          )}
          <button
            className="text-sm font-medium"
            style={{ color: "var(--marca)", minHeight: 44 }}
            onClick={salir}
            type="button"
          >
            Salir
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-5 pb-28 pt-5">{children}</main>

      <nav
        className="fixed inset-x-0 bottom-0 z-20 flex"
        style={{
          background: "var(--tarjeta)",
          borderTop: "1px solid var(--linea)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
        aria-label="Navegación"
      >
        {PESTANAS.map((p) => {
          const activa = pathname === p.href;
          return (
            <Link
              key={p.href}
              href={p.href}
              className="flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium"
              style={{ minHeight: 56, color: activa ? "var(--marca)" : "var(--texto-suave)" }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
                   strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <path d={p.icono} />
              </svg>
              {p.etiqueta}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
