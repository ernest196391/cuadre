// Convención única en todo el producto: `rate` son unidades de la moneda
// destino por 1 unidad de la moneda origen.
//   3,20 CUP por GYD   -> 3.20000000
//   275 GYD por 1 USD  -> 0.00363636

export const DECIMALES_TASA = 8;

export function redondearTasa(tasa: number) {
  const f = 10 ** DECIMALES_TASA;
  return Math.round(tasa * f) / f;
}

/**
 * Una tasa menor a 1 se lee al revés. "0,00363636 USD por GYD" no le dice nada
 * a nadie; "275 GYD = 1 USD" sí. Lo decide la magnitud, no la moneda, para que
 * siga funcionando con monedas que se agreguen después.
 */
export function seLeeInvertida(tasa: number) {
  return tasa > 0 && tasa < 1;
}

export function origenPorUnidad(tasa: number) {
  return tasa > 0 ? 1 / tasa : 0;
}

export function tasaLegible(tasa: number, monedaDestino: string, monedaOrigen: string) {
  if (!(tasa > 0)) return "—";
  if (seLeeInvertida(tasa)) {
    const porUnidad = origenPorUnidad(tasa).toLocaleString("es", { maximumFractionDigits: 2 });
    return `${porUnidad} ${monedaOrigen} = 1 ${monedaDestino}`;
  }
  const r = tasa.toLocaleString("es", { maximumFractionDigits: DECIMALES_TASA });
  return `1 ${monedaOrigen} = ${r} ${monedaDestino}`;
}
