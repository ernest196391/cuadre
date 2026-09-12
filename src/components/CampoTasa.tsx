"use client";

import { formatearEntero, formatearMonto, parsearNumero, redondearMonto } from "@/lib/format";
import { origenPorUnidad, redondearTasa, seLeeInvertida } from "@/lib/tasas";

/** Monto de muestra de la previsualización: redondo y realista. */
const MUESTRA = 10000;

export type Direccion = "directa" | "invertida";

/** La dirección la sugiere la magnitud, no la moneda: así vale para cualquiera. */
export function direccionSugerida(tasa: number): Direccion {
  return seLeeInvertida(tasa) ? "invertida" : "directa";
}

/** Lo tecleado -> tasa guardable, ya redondeada a lo que la base admite. */
export function tasaDesdeTexto(texto: string, direccion: Direccion) {
  const n = parsearNumero(texto);
  if (!(n > 0)) return 0;
  return redondearTasa(direccion === "invertida" ? 1 / n : n);
}

export default function CampoTasa({
  id,
  monedaOrigen,
  monedaDestino,
  valor,
  onValor,
  direccion,
  onDireccion,
}: {
  id: string;
  monedaOrigen: string;
  monedaDestino: string;
  valor: string;
  onValor: (v: string) => void;
  direccion: Direccion;
  onDireccion: (d: Direccion) => void;
}) {
  const destino = monedaDestino || "…";
  const tasa = tasaDesdeTexto(valor, direccion);
  const recibe = redondearMonto(MUESTRA * tasa, monedaDestino);

  return (
    <div>
      <div className="mb-3 grid grid-cols-2 gap-2">
        {(["directa", "invertida"] as Direccion[]).map((d) => {
          const activa = direccion === d;
          return (
            <button
              key={d}
              type="button"
              onClick={() => onDireccion(d)}
              aria-pressed={activa}
              className="mono rounded-xl px-2 text-xs font-medium"
              style={{
                minHeight: "2.75rem",
                border: `1.5px solid ${activa ? "var(--marca)" : "var(--linea)"}`,
                color: activa ? "var(--marca)" : "var(--texto-suave)",
                background: activa ? "color-mix(in srgb, var(--marca) 7%, white)" : "var(--tarjeta)",
              }}
            >
              {d === "directa" ? `1 ${monedaOrigen} = ? ${destino}` : `? ${monedaOrigen} = 1 ${destino}`}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        {direccion === "directa" && (
          <span className="mono shrink-0 text-sm" style={{ color: "var(--texto-suave)" }}>
            1 {monedaOrigen} =
          </span>
        )}
        <input
          id={id}
          className="mono"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={valor}
          onChange={(e) => onValor(e.target.value)}
          style={{ fontSize: 20 }}
        />
        <span className="mono shrink-0 text-sm" style={{ color: "var(--texto-suave)" }}>
          {direccion === "directa" ? destino : `${monedaOrigen} = 1 ${destino}`}
        </span>
      </div>

      {/* Antes de confirmar se ve, en plata, qué recibiría un cliente. */}
      <p className="mt-2 text-xs" style={{ color: "var(--texto-suave)" }}>
        {tasa > 0 && monedaDestino ? (
          <>
            {formatearEntero(MUESTRA)} {monedaOrigen} →{" "}
            <b className="mono" style={{ color: "var(--marca)" }}>
              {formatearMonto(recibe, monedaDestino)} {monedaDestino}
            </b>
          </>
        ) : (
          `Escribe la tasa para ver cuánto recibiría un cliente.`
        )}
      </p>
    </div>
  );
}

export { origenPorUnidad };
