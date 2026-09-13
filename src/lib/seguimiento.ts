/**
 * Los pasos por los que pasa un envío, y lo que sale mal.
 *
 * Dos cadenas, porque son dos cosas distintas. Una remesa sale de Guyana y se
 * entrega en Cuba. Un pedido de tienda se cobra, se le compra al proveedor, se
 * prepara y sale a la calle. La base comprueba que un paso de un flujo no se
 * cuelgue del otro: un «recibido en Guyana» colgado de un pedido de comida no
 * tiene arreglo posterior.
 *
 * En la base se guardan los SALTOS, no el estado actual: el actual es el
 * último. Así, que los cuatro de una remesa ocurran en el mismo minuto —el USD
 * «dando y dando»— es normal y no una excepción, y quedan las horas de cada
 * uno.
 *
 * Las etiquetas de aquí son para quien opera. El cliente lee otras, en
 * cuyana-app: a Ernesto le sirve «Dinero recibido en Guyana» y al cliente le
 * sirve «Recibimos tu dinero».
 */

export type Flujo = "remesa" | "tienda";

export const PASOS_REMESA = [
  "pedido_recibido",
  "recibido_en_guyana",
  "listo_en_cuba",
  "entregado",
] as const;

export const PASOS_TIENDA = [
  "pedido_recibido",
  "pago_confirmado",
  "comprando",
  "preparado",
  "en_camino",
  "entregado",
] as const;

/** Lo que sale mal. No avanza la cadena; se anota cuando pasa. */
export const INCIDENCIAS = [
  "requiere_info",
  "sustitucion_pendiente",
  "retrasado",
  "cancelado",
  "reembolsado",
] as const;

export type Paso = (typeof PASOS_REMESA)[number] | (typeof PASOS_TIENDA)[number];
export type Incidencia = (typeof INCIDENCIAS)[number];
export type Estado = Paso | Incidencia;

export function pasosDe(flujo: Flujo): readonly Paso[] {
  return flujo === "tienda" ? PASOS_TIENDA : PASOS_REMESA;
}

export function esIncidencia(estado: string): estado is Incidencia {
  return (INCIDENCIAS as readonly string[]).includes(estado);
}

/** Lo que ve quien opera. En la base van las claves de arriba. */
export const ETIQUETA: Record<Estado, string> = {
  pedido_recibido: "Pedido recibido",
  recibido_en_guyana: "Dinero recibido en Guyana",
  listo_en_cuba: "Dinero listo en Cuba",
  pago_confirmado: "Pago confirmado",
  comprando: "Comprando al proveedor",
  preparado: "Preparado",
  en_camino: "En camino",
  entregado: "Entregado",
  requiere_info: "Falta un dato",
  sustitucion_pendiente: "Sustitución pendiente",
  retrasado: "Retrasado",
  cancelado: "Cancelado",
  reembolsado: "Reembolsado",
};

/** Quién puede decir que ese paso pasó, para que la pantalla lo explique. */
export const QUIEN_LO_CONFIRMA: Record<Paso, string> = {
  pedido_recibido: "Entró por la web",
  recibido_en_guyana: "Lo confirma quien recibe el dinero allá",
  listo_en_cuba: "Lo confirma quien lo tiene aquí",
  pago_confirmado: "Lo confirma quien cobra en Guyana",
  comprando: "Lo confirma quien le compra al proveedor",
  preparado: "Lo confirma quien lo tiene listo",
  en_camino: "Lo confirma quien lo manda con el mensajero",
  entregado: "Lo confirma quien lo entrega",
};

export interface Salto {
  estado: Estado;
  flujo?: Flujo;
  nota_publica?: string | null;
  nota_interna?: string | null;
  cuando: string;
}

/** El estado de ahora es el último salto. Sin saltos, todavía no hay nada. */
export function estadoActual(saltos: Salto[]): Estado | null {
  if (saltos.length === 0) return null;
  return saltos[saltos.length - 1].estado;
}

/** De qué flujo es. Lo trae el primer salto desde la base; no se adivina. */
export function flujoDe(saltos: Salto[], porDefecto: Flujo = "remesa"): Flujo {
  return saltos.find((s) => s.flujo)?.flujo ?? porDefecto;
}

/**
 * Qué se puede marcar a continuación.
 *
 * Devuelve TODOS los pasos que quedan por delante, no solo el siguiente: en el
 * USD «dando y dando» se pasa de recibir el dinero en Guyana a entregarlo sin
 * nada en medio, y obligar a pulsar tres botones seguidos para contar algo que
 * pasó de una vez sería pedirle a alguien que mienta sobre las horas.
 *
 * Una incidencia no corta la cadena: después de un retraso el envío sigue por
 * donde iba, así que se miran los PASOS dados, no el último salto.
 */
export function siguientes(saltos: Salto[], flujo?: Flujo): Paso[] {
  const pasos = pasosDe(flujo ?? flujoDe(saltos));
  const dados = pasos.filter((p) => saltos.some((s) => s.estado === p));
  if (dados.includes("entregado")) return [];
  if (saltos.some((s) => s.estado === "cancelado" || s.estado === "reembolsado")) return [];
  const ultimo = dados.length ? pasos.indexOf(dados[dados.length - 1]) : -1;
  return [...pasos.slice(ultimo + 1)];
}

/** Si ya se pasó por ahí, y cuándo. Para pintar la línea de tiempo. */
export function cuandoPaso(saltos: Salto[], paso: Estado): string | null {
  return saltos.find((s) => s.estado === paso)?.cuando ?? null;
}

/** Las incidencias anotadas, en orden. Se enseñan aparte de la cadena. */
export function incidenciasDe(saltos: Salto[]): Salto[] {
  return saltos.filter((s) => esIncidencia(s.estado));
}
