"use client";

import { createBrowserClient } from "@supabase/ssr";

/** El esquema de Postgres donde viven las tablas de Cuadre. */
export const ESQUEMA = "cuadre";

export function hayConfiguracion() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function crearClienteNavegador() {
  if (!hayConfiguracion()) {
    throw new Error(
      "Falta configurar NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY en el despliegue."
    );
  }
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    // Cuadre vive en su propio esquema, no en `public`. Comparte proyecto con
    // la landing de Cuyana, que ya tiene su propia `delivery_methods`; sin esto
    // cada consulta iría a la tabla de la otra app.
    { db: { schema: ESQUEMA } }
  );
}

/** Una sola instancia por pestaña: crear varias duplica los oyentes de sesión. */
let cliente: ReturnType<typeof crearClienteNavegador> | null = null;
export function supabase() {
  if (!cliente) cliente = crearClienteNavegador();
  return cliente;
}
