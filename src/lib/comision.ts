/**
 * Cálculo de la comisión del responsable de una entrega.
 *
 * El primer operador paga 3 USDT por cada 100 USD puestos en Cuba — un
 * porcentaje, no un monto fijo. La base natural de "lo puesto en Cuba" son los
 * USDT enviados: ya es una medida en dólares y ya está en la fila de la
 * entrega, sin tener que convertir CUP a USD con una tasa que nadie fijó.
 *
 * El monto que sale de aquí se congela en deliveries.commission_applied: subir
 * el porcentaje mañana no puede reescribir lo que se cobró ayer.
 */

export type TipoComision = "fixed" | "percent";
export type BaseComision = "usdt_spent" | "delivered_amount" | "source_amount";

export interface ReglaComision {
  kind: TipoComision;
  percent: number;
  basis: BaseComision;
  fixed: number;
  currency: string;
}

export interface BasesComision {
  usdt_spent: number;
  delivered_amount: number;
  source_amount: number;
}

export interface ComisionCalculada {
  monto: number;
  moneda: string;
  /** Para poder enseñar de dónde sale el número antes de guardarlo. */
  explicacion: string | null;
}

export function calcularComision(
  regla: ReglaComision | null,
  bases: BasesComision
): ComisionCalculada {
  if (!regla) return { monto: 0, moneda: "", explicacion: null };

  if (regla.kind === "fixed") {
    return { monto: regla.fixed, moneda: regla.currency, explicacion: null };
  }

  const base = bases[regla.basis] ?? 0;
  // commission_applied es numeric(18,2): no se guarda más precisión que esa,
  // así que tampoco se muestra más.
  const monto = Math.round(base * (regla.percent / 100) * 100) / 100;

  const pct = regla.percent.toLocaleString("es", { maximumFractionDigits: 3 });
  const baseTexto = base.toLocaleString("es", { maximumFractionDigits: 6 });
  return {
    monto,
    moneda: regla.currency,
    explicacion: `${pct}% de ${baseTexto} ${regla.currency}`,
  };
}
