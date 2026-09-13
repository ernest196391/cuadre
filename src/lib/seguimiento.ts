/**
 * Los pasos por los que pasa un envío.
 *
 * Cuatro, y ninguno de relleno: cada uno lo confirma una persona concreta desde
 * donde está. El segundo solo lo sabe quien recibe el dinero en Guyana; el
 * tercero y el cuarto, quien lo tiene en Cuba. Un paso que no puede confirmar
 * nadie no es un paso, es una barra moviéndose.
 *
 * En la base se guardan los SALTOS, no el estado actual: el actual es el
 * último. Así, que los cuatro ocurran en el mismo minuto —el USD «dando y
 * dando»— es normal y no una excepción, y quedan las horas de cada uno.
 */
export const PASOS = [
  "pedido_recibido",
  "recibido_en_guyana",
  "listo_en_cuba",
  "entregado",
] as const;

export type Paso = (typeof PASOS)[number];
export type Estado = Paso | "cancelado";

/** Lo que se le enseña a una persona. En la base van las claves de arriba. */
export const ETIQUETA: Record<Estado, string> = {
  pedido_recibido: "Pedido recibido",
  recibido_en_guyana: "Dinero recibido en Guyana",
  listo_en_cuba: "Dinero listo en Cuba",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

/** Quién puede decir que ese paso pasó, para que la pantalla lo explique. */
export const QUIEN_LO_CONFIRMA: Record<Paso, string> = {
  pedido_recibido: "Entró por la web",
  recibido_en_guyana: "Lo confirma quien recibe el dinero allá",
  listo_en_cuba: "Lo confirma quien lo tiene aquí",
  entregado: "Lo confirma quien lo entrega",
};

export interface Salto {
  estado: Estado;
  cuando: string;
}

/** El estado de ahora es el último salto. Sin saltos, todavía no hay nada. */
export function estadoActual(saltos: Salto[]): Estado | null {
  if (saltos.length === 0) return null;
  return saltos[saltos.length - 1].estado;
}

/**
 * Qué se puede marcar a continuación.
 *
 * Devuelve TODOS los pasos que quedan por delante, no solo el siguiente: en el
 * USD «dando y dando» se pasa de recibir el dinero en Guyana a entregarlo sin
 * nada en medio, y obligar a pulsar tres botones seguidos para contar algo que
 * pasó de una vez sería pedirle a alguien que mienta sobre las horas.
 */
export function siguientes(saltos: Salto[]): Paso[] {
  const actual = estadoActual(saltos);
  if (actual === "cancelado" || actual === "entregado") return [];
  const desde = actual ? PASOS.indexOf(actual) : -1;
  return PASOS.slice(desde + 1);
}

/** Si ya se pasó por ahí, y cuándo. Para pintar la línea de tiempo. */
export function cuandoPaso(saltos: Salto[], paso: Estado): string | null {
  return saltos.find((s) => s.estado === paso)?.cuando ?? null;
}
