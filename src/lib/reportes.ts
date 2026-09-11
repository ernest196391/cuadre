/**
 * Las cuentas del negocio. Solo registrar y sumar: nada de proyecciones ni de
 * adivinar el futuro.
 *
 * Costeo por PROMEDIO PONDERADO. El USDT se compra en bloque, así que ninguna
 * entrega tiene "su" compra: lo que cuesta un USDT es lo que costó en promedio
 * todo el que se ha comprado hasta esa fecha. Es también como lo piensa quien
 * lleva el negocio, y evita la maquinaria de ir casando lotes uno a uno.
 */

export interface CompraFila {
  purchased_at: string;
  source_amount: number;
  fee_source_amount: number;
  usdt_received: number;
}

export interface EntregaFila {
  delivered_at: string;
  source_amount_received: number;
  usdt_spent: number;
  network_fee_usdt: number;
  commission_applied: number;
  commission_currency: string | null;
  courier_fee: number;
  courier_fee_currency: string | null;
  method_id: string | null;
  handled_by_contact_id: string;
}

export interface Totales {
  entregas: number;
  ingreso: number;
  costoUsdt: number;
  comisiones: number;
  mensajeria: number;
  ganancia: number;
  usdtMovidos: number;
  /** Ganancia sobre lo recibido. Null cuando no hubo ingreso. */
  margen: number | null;
}

const CERO: Totales = {
  entregas: 0, ingreso: 0, costoUsdt: 0, comisiones: 0,
  mensajeria: 0, ganancia: 0, usdtMovidos: 0, margen: null,
};

/**
 * Lo que cuesta un USDT, en moneda origen, según todo lo comprado hasta la
 * fecha de corte. Las compras anuladas no entran.
 */
export function costoPromedioUsdt(compras: CompraFila[], hasta: Date): number {
  let gastado = 0;
  let recibidos = 0;
  for (const c of compras) {
    if (new Date(c.purchased_at) > hasta) continue;
    gastado += Number(c.source_amount) + Number(c.fee_source_amount);
    recibidos += Number(c.usdt_received);
  }
  return recibidos > 0 ? gastado / recibidos : 0;
}

/** Un monto en USDT pasado a moneda origen al costo promedio. */
function aMonedaOrigen(monto: number, moneda: string | null, costoUsdt: number): number {
  if (!monto) return 0;
  return moneda === "USDT" ? monto * costoUsdt : monto;
}

/**
 * Las cuentas de una entrega suelta. El fee de la wallet se suma al costo
 * porque son USDT que salieron y no llegaron a manos de nadie.
 */
export function cuentasDeEntrega(e: EntregaFila, costoUsdt: number) {
  const ingreso = Number(e.source_amount_received);
  const usdt = Number(e.usdt_spent) + Number(e.network_fee_usdt);
  const costo = usdt * costoUsdt;
  const comision = aMonedaOrigen(Number(e.commission_applied), e.commission_currency, costoUsdt);
  const mensajeria = aMonedaOrigen(Number(e.courier_fee), e.courier_fee_currency, costoUsdt);
  return {
    ingreso,
    costo,
    comision,
    mensajeria,
    usdt,
    ganancia: ingreso - costo - comision - mensajeria,
  };
}

export function sumar(entregas: EntregaFila[], costoUsdt: number): Totales {
  const t = { ...CERO };
  for (const e of entregas) {
    const c = cuentasDeEntrega(e, costoUsdt);
    t.entregas += 1;
    t.ingreso += c.ingreso;
    t.costoUsdt += c.costo;
    t.comisiones += c.comision;
    t.mensajeria += c.mensajeria;
    t.ganancia += c.ganancia;
    t.usdtMovidos += c.usdt;
  }
  t.margen = t.ingreso > 0 ? (t.ganancia / t.ingreso) * 100 : null;
  return t;
}

export interface Desglose<T> {
  clave: T;
  totales: Totales;
  /** Lo que deja una operación típica de este grupo. */
  gananciaPorOperacion: number;
}

function agrupar<T extends string>(
  entregas: EntregaFila[],
  costoUsdt: number,
  clave: (e: EntregaFila) => T
): Desglose<T>[] {
  const grupos = new Map<T, EntregaFila[]>();
  for (const e of entregas) {
    const k = clave(e);
    const lista = grupos.get(k);
    if (lista) lista.push(e);
    else grupos.set(k, [e]);
  }
  return Array.from(grupos.entries())
    .map(([clave, filas]) => {
      const totales = sumar(filas, costoUsdt);
      return {
        clave,
        totales,
        gananciaPorOperacion: totales.entregas > 0 ? totales.ganancia / totales.entregas : 0,
      };
    })
    .sort((a, b) => b.totales.ganancia - a.totales.ganancia);
}

/**
 * Por método. Se devuelven la ganancia acumulada Y la de una operación
 * suelta porque no responden a la misma pregunta: un método puede dejar más
 * por envío y aun así rendir menos al final del mes, o al revés.
 */
export function porMetodo(entregas: EntregaFila[], costoUsdt: number) {
  return agrupar(entregas, costoUsdt, (e) => (e.method_id ?? "sin_metodo") as string);
}

/** Por responsable. La comisión ya va descontada dentro de la ganancia. */
export function porResponsable(entregas: EntregaFila[], costoUsdt: number) {
  return agrupar(entregas, costoUsdt, (e) => e.handled_by_contact_id);
}

/** Lunes a domingo de la semana en la que cae la fecha. */
export function semanaDe(fecha: Date) {
  const inicio = new Date(fecha);
  const dia = (inicio.getDay() + 6) % 7; // lunes = 0
  inicio.setDate(inicio.getDate() - dia);
  inicio.setHours(0, 0, 0, 0);
  const fin = new Date(inicio);
  fin.setDate(fin.getDate() + 7);
  return { inicio, fin };
}

export function mesDe(fecha: Date) {
  const inicio = new Date(fecha.getFullYear(), fecha.getMonth(), 1, 0, 0, 0, 0);
  const fin = new Date(fecha.getFullYear(), fecha.getMonth() + 1, 1, 0, 0, 0, 0);
  return { inicio, fin };
}
