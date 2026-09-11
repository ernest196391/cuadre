import { NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteServicio } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** Revoca una clave. No se borra: su rastro en los pedidos ya recibidos vale. */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const supabase = crearClienteServidor();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  }

  const { data: perfil } = await supabase
    .from("profiles")
    .select("tenant_id, role")
    .eq("id", auth.user.id)
    .single();

  if (!perfil || perfil.role !== "owner") {
    return NextResponse.json({ error: "Solo el dueño puede revocar claves." }, { status: 403 });
  }

  const servicio = crearClienteServicio();
  const { error } = await servicio
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", params.id)
    .eq("tenant_id", perfil.tenant_id)
    .is("revoked_at", null);

  if (error) {
    console.error("No se pudo revocar la clave", error);
    return NextResponse.json({ error: "No se pudo revocar." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
