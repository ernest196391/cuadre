import { createClient } from "@supabase/supabase-js";
import { ESQUEMA } from "./esquema";

/**
 * Cliente de servicio. Es la única llave que abre las funciones de tarjeta, y
 * por eso no sale nunca de una ruta de servidor.
 *
 * Si alguna vez ves este import en un archivo con "use client", algo va muy mal.
 */
export function crearClienteServicio() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "Falta SUPABASE_SERVICE_ROLE_KEY en el entorno del servidor. Sin ella no se pueden guardar ni revelar números de tarjeta."
    );
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Mismo esquema que el cliente del navegador: `public` es de la landing.
    db: { schema: ESQUEMA },
  });
}
