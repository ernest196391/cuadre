"use client";

/**
 * Campo de dinero. Teclado numérico siempre: se usa de pie, en la calle, y
 * obligar a cambiar de teclado en cada monto es lo que hace que la gente
 * vuelva a las notas del teléfono.
 */
/**
 * Deja en el campo solo lo que puede ser dinero: cifras, puntos de millar y
 * una coma decimal. Sin esto, "5000abc" se veía tal cual pero la app calculaba
 * 5000, y "1,5,5" se leía como 1,5 sin avisar. En una app de dinero, lo que se
 * ve y lo que se calcula tienen que ser lo mismo.
 */
export function filtrarMonto(bruto: string) {
  const limpio = bruto.replace(/[^\d.,]/g, "");
  const coma = limpio.indexOf(",");
  if (coma === -1) return limpio;
  // Una sola coma: lo de detrás son decimales, ahí no va otro separador.
  return limpio.slice(0, coma + 1) + limpio.slice(coma + 1).replace(/[.,]/g, "");
}

export default function CampoMonto({
  id,
  etiqueta,
  sufijo,
  valor,
  onValor,
  ayuda,
  autoFocus,
  decimal,
}: {
  id: string;
  etiqueta: string;
  sufijo?: string;
  valor: string;
  onValor: (v: string) => void;
  ayuda?: React.ReactNode;
  autoFocus?: boolean;
  decimal?: boolean;
}) {
  return (
    <div>
      <label className="etiqueta" htmlFor={id}>
        {etiqueta}
      </label>
      <div className="relative">
        <input
          id={id}
          className="mono"
          type="text"
          inputMode={decimal ? "decimal" : "numeric"}
          autoComplete="off"
          autoFocus={autoFocus}
          value={valor}
          onChange={(e) => onValor(filtrarMonto(e.target.value))}
          style={{ paddingRight: sufijo ? 64 : undefined, fontSize: 20 }}
        />
        {sufijo && (
          <span
            className="mono pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm"
            style={{ color: "var(--texto-suave)" }}
          >
            {sufijo}
          </span>
        )}
      </div>
      {ayuda && (
        <p className="mt-1.5 text-xs" style={{ color: "var(--texto-suave)" }}>
          {ayuda}
        </p>
      )}
    </div>
  );
}
