"use client";

/**
 * Traspaso de una entrega anulada al formulario de una nueva.
 *
 * Anular y volver a teclearlo todo de memoria es justo donde se cuela el
 * segundo error. Se pasa por sessionStorage y no por la URL a propósito: son
 * montos y personas, y no tienen por qué quedar en el historial del navegador
 * ni en un enlace que se pueda compartir sin querer.
 */
const CLAVE = "cuadre.repetir_entrega";

export interface EntregaRepetible {
  metodoId: string | null;
  recibido: string;
  entregado: string;
  usdt: string;
  clienteId: string | null;
  cuentaId: string | null;
  responsableId: string | null;
  origenId: string | null;
  notas: string | null;
}

export function guardarParaRepetir(datos: EntregaRepetible) {
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify(datos));
  } catch {
    /* modo privado: se teclea a mano, que no es el fin del mundo */
  }
}

/** Se lee una sola vez: si no, cada visita al formulario saldría rellena. */
export function tomarParaRepetir(): EntregaRepetible | null {
  try {
    const bruto = sessionStorage.getItem(CLAVE);
    if (!bruto) return null;
    sessionStorage.removeItem(CLAVE);
    return JSON.parse(bruto) as EntregaRepetible;
  } catch {
    return null;
  }
}
