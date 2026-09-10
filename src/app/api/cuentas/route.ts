import { NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteServicio } from "@/lib/supabase/admin";
import { bufferAHex, cifrarPan, panEsPlausible, ultimos4 } from "@/lib/pan";

export const runtime = "nodejs";

/**
 * Alta de cuenta de destino. El número de tarjeta entra por aquí y se cifra
 * antes de tocar la base: el navegador nunca escribe en esa tabla.
 */
export async function POST(request: Request) {
  const supabase = crearClienteServidor();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  }

  const { data: perfil } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", auth.user.id)
    .single();

  if (!perfil) {
    return NextResponse.json({ error: "El usuario no pertenece a ningún operador." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.contact_id || !body?.alias) {
    return NextResponse.json({ error: "Faltan el contacto y el alias." }, { status: 400 });
  }

  const tipo: string = body.account_type ?? "card";
  let panHex: string | null = null;
  let last4: string | null = null;

  if (tipo === "card") {
    if (typeof body.pan !== "string" || !panEsPlausible(body.pan)) {
      return NextResponse.json({ error: "El número de tarjeta no es válido." }, { status: 400 });
    }
    panHex = bufferAHex(cifrarPan(body.pan, perfil.tenant_id, body.contact_id));
    last4 = ultimos4(body.pan);
  }

  const servicio = crearClienteServicio();
  const { data, error } = await servicio.rpc("create_destination_account", {
    p_actor: auth.user.id,
    p_contact_id: body.contact_id,
    p_alias: body.alias,
    p_holder_name: body.holder_name ?? null,
    p_bank: body.bank ?? null,
    p_account_type: tipo,
    p_pan_last4: last4,
    p_pan_encrypted: panHex,
  });

  if (error) {
    // El mensaje crudo puede describir la estructura interna; no sale de aquí.
    console.error("No se pudo crear la cuenta de destino", error);
    return NextResponse.json({ error: "No se pudo guardar la cuenta." }, { status: 400 });
  }

  return NextResponse.json({ id: data, pan_last4: last4 }, { status: 201 });
}
