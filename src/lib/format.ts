// Formato latinoamericano en todo el producto: punto para miles, coma para
// decimales (10.000 · 3,20). Nunca el formato inglés.

/** Monedas sin céntimos en la práctica: los decimales serían ruido. */
const SIN_DECIMALES = new Set(["CUP", "GYD", "COP", "CLP", "PYG", "JPY"]);

export function decimalesDe(moneda: string) {
  return SIN_DECIMALES.has(moneda.toUpperCase()) ? 0 : 2;
}

/** Lo que se teclea en formato latino -> número. */
export function parsearNumero(texto: string) {
  const limpio = texto.replace(/[^0-9.,-]/g, "");
  const normalizado = limpio.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(normalizado);
  return Number.isFinite(n) ? n : 0;
}

export function formatearMonto(n: number, moneda: string) {
  const d = decimalesDe(moneda);
  return n.toLocaleString("es", { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function formatearEntero(n: number) {
  return Math.round(n).toLocaleString("es");
}

/**
 * Precio unitario (lo que cuesta 1 USDT). SIEMPRE con decimales, aunque la
 * moneda no los use para el dinero en la mano: un costo de 245,12 mostrado
 * como "245" esconde justo lo que el fee le está comiendo al margen.
 */
export function formatearCosto(n: number) {
  return n.toLocaleString("es", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

/** USDT lleva más precisión que el dinero de la calle. */
export function formatearUsdt(n: number) {
  return n.toLocaleString("es", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

export function redondearMonto(n: number, moneda: string) {
  const f = 10 ** decimalesDe(moneda);
  return Math.round(n * f) / f;
}

export function formatearFecha(iso: string) {
  return new Date(iso).toLocaleDateString("es", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatearFechaHora(iso: string) {
  return new Date(iso).toLocaleString("es", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}
