import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Claves de API para la entrada de pedidos.
 *
 * De la clave solo se guarda su hash SHA-256. No hay forma de recuperarla:
 * se enseña una vez al generarla y, si se pierde, se revoca y se hace otra.
 * Una tabla de claves robada no sirve para entrar.
 *
 * SHA-256 a secas (y no bcrypt/argon2) porque esto no es una contraseña de
 * persona: son 32 bytes aleatorios, no hay diccionario que probar y el hash se
 * verifica en cada petición entrante, donde un KDF lento sería el cuello de
 * botella del endpoint.
 */

const PREFIJO = "cuadre_";

export interface ClaveGenerada {
  clave: string;
  prefijo: string;
  hash: string;
}

export function generarClave(): ClaveGenerada {
  const secreto = randomBytes(32).toString("base64url");
  const clave = PREFIJO + secreto;
  return {
    clave,
    // Lo justo para reconocerla en una lista sin que sirva de nada.
    prefijo: clave.slice(0, PREFIJO.length + 6),
    hash: hashDeClave(clave),
  };
}

export function hashDeClave(clave: string): string {
  return createHash("sha256").update(clave, "utf8").digest("hex");
}

/** Comparación en tiempo constante: la duración no debe filtrar el hash. */
export function hashesIguales(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** Acepta `Authorization: Bearer <clave>` o `X-Api-Key: <clave>`. */
export function claveDeLaPeticion(headers: Headers): string | null {
  const auth = headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    const v = auth.slice(7).trim();
    if (v) return v;
  }
  const directa = headers.get("x-api-key");
  return directa?.trim() || null;
}
