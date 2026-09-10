import { NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteServicio } from "@/lib/supabase/admin";
import { descifrarPan, hexABuffer } from "@/lib/pan";

export const runtime = "nodejs";

/**
 * Revelar el número completo. Es una acción explícita del usuario, nunca parte
 * de cargar una pantalla, y la función de base de datos deja constancia antes
 * de entregar el dato.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = crearClienteServidor();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  }

  const servicio = crearClienteServicio();
  const { data, error } = await servicio.rpc("reveal_destination_account_pan", {
    p_actor: auth.user.id,
    p_account_id: params.id,
    p_ip:
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip"),
    p_user_agent: request.headers.get("user-agent"),
  });

  const fila = Array.isArray(data) ? data[0] : data;
  if (error || !fila) {
    console.error("No se pudo revelar el número", error);
    return NextResponse.json({ error: "No se pudo revelar el número." }, { status: 404 });
  }

  try {
    const pan = descifrarPan(hexABuffer(fila.pan_encrypted), fila.tenant_id, fila.contact_id);
    // Sin caché en ninguna capa: este dato no se guarda en ningún sitio.
    return NextResponse.json(
      { pan },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, private" } }
    );
  } catch (err) {
    console.error("Fallo al descifrar", err);
    return NextResponse.json({ error: "No se pudo descifrar el número." }, { status: 500 });
  }
}
