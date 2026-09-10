import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Cifrado de números de tarjeta. AES-256-GCM, en Node, del lado del servidor.
 *
 * Por qué aquí y no en Postgres: pgcrypto obliga a pasar la clave dentro de la
 * sentencia SQL, así que termina en los logs y en pg_stat_statements; Vault la
 * guarda en la propia base de datos. Haciéndolo en la aplicación, la base nunca
 * ve la clave ni el número en claro — solo un blob que no sabe interpretar.
 *
 * GCM y no CBC porque es cifrado autenticado: alterar el texto cifrado hace que
 * el descifrado falle en vez de devolver un número equivocado en silencio, y en
 * una tarjeta a la que se manda dinero esa diferencia es un envío perdido.
 *
 * Formato guardado: iv(12) || tag(16) || ciphertext
 */

const IV_BYTES = 12;
const TAG_BYTES = 16;

/** Versión de clave que se escribe en las filas nuevas. Permite rotar sin migrar. */
export const KEY_VERSION = 1;

function claveMaestra(): Buffer {
  const raw = process.env.PAN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "Falta PAN_ENCRYPTION_KEY en el entorno del servidor. Sin clave no se cifra ni se descifra nada."
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("PAN_ENCRYPTION_KEY tiene que ser de 32 bytes codificados en base64.");
  }
  return key;
}

/**
 * Datos asociados: atan el texto cifrado a la fila donde vive. Copiar el blob a
 * otro contacto o a otro operador lo vuelve indescifrable en vez de dejarlo
 * funcionando en el lugar equivocado.
 */
function datosAsociados(tenantId: string, contactId: string): Buffer {
  return Buffer.from(`${tenantId}:${contactId}`, "utf8");
}

/** Deja solo dígitos: la gente escribe la tarjeta con espacios o guiones. */
export function normalizarPan(pan: string): string {
  return pan.replace(/\D/g, "");
}

export function panEsPlausible(pan: string): boolean {
  const d = normalizarPan(pan);
  return d.length >= 12 && d.length <= 19;
}

export function ultimos4(pan: string): string {
  return normalizarPan(pan).slice(-4);
}

/** Para mostrar en listas sin descifrar nada. */
export function enmascarar(last4: string): string {
  return `•••• •••• •••• ${last4}`;
}

export function cifrarPan(pan: string, tenantId: string, contactId: string): Buffer {
  const digitos = normalizarPan(pan);
  if (!panEsPlausible(digitos)) {
    throw new Error("El número de tarjeta no tiene una cantidad de dígitos válida.");
  }
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", claveMaestra(), iv);
  cipher.setAAD(datosAsociados(tenantId, contactId));
  const cifrado = Buffer.concat([cipher.update(digitos, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), cifrado]);
}

export function descifrarPan(blob: Buffer, tenantId: string, contactId: string): string {
  if (blob.length <= IV_BYTES + TAG_BYTES) {
    throw new Error("El dato cifrado está incompleto.");
  }
  const iv = blob.subarray(0, IV_BYTES);
  const tag = blob.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const cifrado = blob.subarray(IV_BYTES + TAG_BYTES);

  const decipher = createDecipheriv("aes-256-gcm", claveMaestra(), iv);
  decipher.setAAD(datosAsociados(tenantId, contactId));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(cifrado), decipher.final()]).toString("utf8");
}

/** Postgres devuelve bytea como '\x...' por PostgREST. */
export function hexABuffer(hex: string): Buffer {
  return Buffer.from(hex.startsWith("\\x") ? hex.slice(2) : hex, "hex");
}

export function bufferAHex(buf: Buffer): string {
  return `\\x${buf.toString("hex")}`;
}
