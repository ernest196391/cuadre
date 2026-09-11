/**
 * Comisiones.
 *
 * BASE: el valor de lo entregado expresado en USD. Es la regla real del
 * negocio — 3 USD por cada 100 USD puestos en destino. Calculada sobre los USDT
 * movidos daría 2,78 en vez de 3, y no cuadraría con lo que se paga.
 *
 * DOS TIPOS: por entregar y por conseguir al cliente. No siempre las cobra la
 * misma persona, y a veces quien consigue no entrega.
 *
 * DOS NIVELES: el operador fija un porcentaje para todos; cada persona puede
 * tener el suyo. Sin valor propio, hereda.
 */

export type TipoComision = "delivery" | "origination";

export interface PoliticaOperador {
  commission_delivery_pct: number;
  commission_origination_pct: number;
}

export interface ReglaPersona {
  delivery_pct: number | null;
  origination_pct: number | null;
}

/** El porcentaje que le toca a una persona, propio o heredado. */
export function porcentajeDe(
  tipo: TipoComision,
  persona: ReglaPersona | null | undefined,
  operador: PoliticaOperador | null | undefined
): number {
  const propio = tipo === "delivery" ? persona?.delivery_pct : persona?.origination_pct;
  if (propio !== null && propio !== undefined) return Number(propio);
  const global = tipo === "delivery"
    ? operador?.commission_delivery_pct
    : operador?.commission_origination_pct;
  return Number(global ?? 0);
}

/** Si el porcentaje es heredado o propio — para poder decirlo en pantalla. */
export function esHeredado(tipo: TipoComision, persona: ReglaPersona | null | undefined): boolean {
  const propio = tipo === "delivery" ? persona?.delivery_pct : persona?.origination_pct;
  return propio === null || propio === undefined;
}

/**
 * Cuánto vale en USD lo que se entregó.
 *
 * Se pasa por el USDT, que es el puente real entre las dos monedas: los CUP
 * entregados se convierten a USDT al precio de mercado y de ahí a USD. Cuando
 * se entrega en USD la fórmula se cancela sola y devuelve el monto entregado,
 * que es exactamente lo que se quiere.
 */
export function valorEnUsd(
  montoEntregado: number,
  monedaEntregada: string,
  tasaDeSuMoneda: number | undefined,
  tasaUsdPorUsdt: number | undefined
): number | null {
  if (!(montoEntregado > 0)) return 0;
  if (monedaEntregada === "USD") return redondear(montoEntregado);
  if (!tasaDeSuMoneda || tasaDeSuMoneda <= 0) return null;
  const usdt = montoEntregado / tasaDeSuMoneda;
  // Sin tasa USD/USDT se toma el USDT como dólar, que es como se habla en la
  // calle. Es una aproximación y por eso se guarda el valor ya calculado.
  return redondear(usdt * (tasaUsdPorUsdt && tasaUsdPorUsdt > 0 ? tasaUsdPorUsdt : 1));
}

export function comisionDe(valorUsd: number | null, pct: number): number {
  if (!valorUsd || valorUsd <= 0 || pct <= 0) return 0;
  return redondear((valorUsd * pct) / 100);
}

function redondear(n: number) {
  return Math.round(n * 100) / 100;
}

export function formatearUsd(n: number) {
  return n.toLocaleString("es", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
