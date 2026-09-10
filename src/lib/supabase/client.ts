"use client";

import { createBrowserClient } from "@supabase/ssr";

export function crearClienteNavegador() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/** Una sola instancia por pestaña: crear varias duplica los oyentes de sesión. */
let cliente: ReturnType<typeof crearClienteNavegador> | null = null;
export function supabase() {
  if (!cliente) cliente = crearClienteNavegador();
  return cliente;
}
