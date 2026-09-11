import { NextResponse } from "next/server";
import { crearClienteServicio } from "@/lib/supabase/admin";
import { claveDeLaPeticion, hashDeClave, hashesIguales } from "@/lib/apiKeys";

export const runtime = "nodejs";

/**
 * Entrada de pedidos desde la web del operador.
 *
 * Funciona con CUALQUIER sitio: se autentica con una clave y acepta un JSON
 * genérico. El contrato está documentado en el README para que lo pueda
 * conectar alguien que no tenga nada que ver con nosotros.
 *
 * El cuerpo entero se guarda tal cual en `payload`: un pedido que llega mal
 * formado es mejor tenerlo guardado y poder mirarlo que haberlo rechazado sin
 * dejar rastro.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Api-Key",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(request: Request) {
  const clave = claveDeLaPeticion(request.headers);
  if (!clave) {
    return NextResponse.json(
      { error: "Falta la clave. Manda 'Authorization: Bearer <clave>' o 'X-Api-Key: <clave>'." },
      { status: 401, headers: CORS }
    );
  }

  let servicio;
  try {
    servicio = crearClienteServicio();
  } catch {
    console.error("SUPABASE_SERVICE_ROLE_KEY no está configurada.");
    return NextResponse.json({ error: "Servicio no disponible." }, { status: 503, headers: CORS });
  }

  const { data: fila } = await servicio
    .from("api_keys")
    .select("id, tenant_id, key_hash, revoked_at")
    .eq("key_hash", hashDeClave(clave))
    .maybeSingle();

  // Mismo mensaje para clave inexistente y para clave revocada: quien prueba
  // claves no debe poder distinguir "no existe" de "existió y la quitaron".
  if (!fila || fila.revoked_at || !hashesIguales(fila.key_hash, hashDeClave(clave))) {
    return NextResponse.json({ error: "Clave no válida." }, { status: 401, headers: CORS });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "El cuerpo tiene que ser JSON." }, { status: 400, headers: CORS });
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json({ error: "El cuerpo tiene que ser un objeto JSON." }, { status: 400, headers: CORS });
  }

  const cuerpo = payload as Record<string, unknown>;
  const ref = typeof cuerpo.external_ref === "string" && cuerpo.external_ref.trim()
    ? cuerpo.external_ref.trim().slice(0, 200)
    : null;

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip");

  const { data: creado, error } = await servicio
    .from("inbound_orders")
    .insert({
      tenant_id: fila.tenant_id,
      external_ref: ref,
      payload: cuerpo,
      api_key_id: fila.id,
      source_ip: ip,
    })
    .select("id")
    .single();

  // Reenviar el mismo pedido no lo duplica: la web puede reintentar tranquila.
  if (error?.code === "23505" && ref) {
    const { data: previo } = await servicio
      .from("inbound_orders")
      .select("id")
      .eq("tenant_id", fila.tenant_id)
      .eq("external_ref", ref)
      .single();
    return NextResponse.json(
      { id: previo?.id, duplicated: true },
      { status: 200, headers: CORS }
    );
  }

  if (error || !creado) {
    console.error("No se pudo guardar el pedido entrante", error);
    return NextResponse.json({ error: "No se pudo guardar el pedido." }, { status: 500, headers: CORS });
  }

  await servicio.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", fila.id);

  return NextResponse.json({ id: creado.id, duplicated: false }, { status: 201, headers: CORS });
}
