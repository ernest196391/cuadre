import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refresca la sesión en cada petición. Sin esto, las rutas de servidor verían
 * cookies vencidas y todo parecería "sin sesión" a la media hora de trabajar.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Sin configuración no hay sesión que refrescar. Se sigue de largo en vez de
  // reventar en cada petición: un despliegue al que todavía no le han puesto
  // las variables debe enseñar su pantalla de error, no un 500 sin explicación.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  /**
   * Refrescar la sesión es una MEJORA, no un requisito. Si Supabase tarda o no
   * está, la petición sigue: más vale entrar y ver la pantalla de error de la
   * app, con su botón de reintentar, que un 504 del servidor en todas las
   * rutas a la vez.
   *
   * Esto NO abre ningún agujero: el middleware no vigila nada, solo renueva la
   * cookie. Quien decide qué se puede leer es RLS en la base, y quien manda al
   * login es el layout. Sin sesión válida no se ve un dato aunque se pase por
   * aquí de largo.
   *
   * Pasó de verdad: el proyecto de Supabase se pausó y, como este await no
   * tenía límite, cada petición se quedaba colgada hasta que Vercel la mataba.
   * La app entera devolvía MIDDLEWARE_INVOCATION_TIMEOUT.
   */
  try {
    await Promise.race([
      supabase.auth.getUser(),
      new Promise((_, rechazar) => setTimeout(() => rechazar(new Error("timeout")), 3000)),
    ]);
  } catch {
    /* se sigue con la cookie que ya traía */
  }
  return response;
}

export const config = {
  // El manifiesto y el service worker quedan fuera a propósito. Son archivos
  // estáticos sin sesión que refrescar, y hacer pasar sw.js por aquí le cambia
  // las cabeceras y puede dejarlo con un scope que no es el suyo.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)",
  ],
};
