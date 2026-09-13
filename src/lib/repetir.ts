"use client";

/**
 * Traspaso de datos al formulario de una entrega nueva.
 *
 * Dos cosas distintas llegan por aquí, y el formulario tiene que poder
 * distinguirlas porque lo que le dice a la persona no es lo mismo:
 *
 * - `anulada`: se anuló una entrega y se vuelve a registrar corregida. Volver
 *   a teclearlo todo de memoria es justo donde se cuela el segundo error.
 * - `pedido`: llegó de la web del operador y nadie lo ha tecleado nunca.
 *
 * Va por sessionStorage y no por la URL a propósito: son montos y personas, y
 * no tienen por qué quedar en el historial del navegador ni en un enlace que
 * se pueda compartir sin querer.
 */
const CLAVE = "cuadre.repetir_entrega";

export interface EntregaRepetible {
  /** De dónde salen estos datos. Cambia el aviso de la pantalla. */
  origen: "anulada" | "pedido";
  metodoId: string | null;
  recibido: string;
  entregado: string;
  usdt: string;
  clienteId: string | null;
  cuentaId: string | null;
  responsableId: string | null;
  origenId: string | null;
  notas: string | null;
  /** Solo en los pedidos de la web: quien pidió todavía no existe como
   *  contacto. Se arrastran sus datos para no copiarlos del pedido a mano. */
  clienteNombre?: string | null;
  clienteTelefono?: string | null;
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

/**
 * De qué pedido de la web salió la entrega que se está registrando.
 *
 * Va aparte de `EntregaRepetible` porque no es un dato que se rellene en el
 * formulario: es la costura entre lo que pidió el cliente y lo que se le
 * entregó, y es lo que deja que él pueda seguir su envío.
 */
const CLAVE_PEDIDO = "cuadre.pedido_de_origen";

export function guardarPedidoDeOrigen(id: string) {
  try {
    sessionStorage.setItem(CLAVE_PEDIDO, id);
  } catch {
    /* modo privado: la entrega se guarda igual, solo sin la costura */
  }
}

/** Se lee una sola vez, como el resto del traspaso. */
export function tomarPedidoDeOrigen(): string | null {
  try {
    const v = sessionStorage.getItem(CLAVE_PEDIDO);
    if (v) sessionStorage.removeItem(CLAVE_PEDIDO);
    return v;
  } catch {
    return null;
  }
}
