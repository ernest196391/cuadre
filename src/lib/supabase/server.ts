import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { ESQUEMA } from "./esquema";

/**
 * Cliente con la sesión del usuario. Todo lo que pase por aquí sigue sujeto a
 * RLS: es el usuario quien consulta, el servidor solo pone el sobre.
 */
export function crearClienteServidor() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Igual que el del navegador y el de servicio. Sin esto, cada `.from()`
      // de una ruta de API va a `public`, que es donde vive la landing.
      db: { schema: ESQUEMA },
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Llamado desde un Server Component: el middleware refresca la sesión.
          }
        },
      },
    }
  );
}
