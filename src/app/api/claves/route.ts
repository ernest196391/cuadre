import { NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteServicio } from "@/lib/supabase/admin";
import { generarClave } from "@/lib/apiKeys";

export const runtime = "nodejs";

/** Genera una clave de API. Se devuelve en claro UNA sola vez. */
export async function POST(request: Request) {
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
    return NextResponse.json({ error: "Solo el dueño puede crear claves." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const nombre = typeof body?.name === "string" ? body.name.trim() : "";
  if (!nombre) {
    return NextResponse.json({ error: "Ponle un nombre para reconocerla." }, { status: 400 });
  }

  const { clave, prefijo, hash } = generarClave();
  const servicio = crearClienteServicio();
  const { data, error } = await servicio
    .from("api_keys")
    .insert({
      tenant_id: perfil.tenant_id,
      name: nombre.slice(0, 80),
      key_prefix: prefijo,
      key_hash: hash,
      created_by: auth.user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("No se pudo crear la clave", error);
    return NextResponse.json({ error: "No se pudo crear la clave." }, { status: 500 });
  }

  // La única vez que la clave sale de aquí en claro. Sin caché en ninguna capa.
  return NextResponse.json(
    { id: data.id, clave },
    { status: 201, headers: { "Cache-Control": "no-store, no-cache, must-revalidate, private" } }
  );
}
