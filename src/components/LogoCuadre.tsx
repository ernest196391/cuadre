/**
 * El símbolo de Cuadre: dos corchetes que encajan dejando un hueco exacto en
 * el centro. Viene tal cual de `brand/cuadre-symbol.svg`.
 *
 * El hueco central NO es transparente: se pinta del color del fondo sobre el
 * que va. Así el símbolo no arrastra un cuadrado claro cuando el fondo cambia,
 * que es justo lo que la guía llama «deformar el logo».
 */
export function SimboloCuadre({
  tam = 48,
  fondo = "var(--cuadre-marfil)",
  claro = false,
}: {
  tam?: number;
  /** Color del hueco central. Tiene que ser el del fondo real. */
  fondo?: string;
  /** Para fondo oscuro: el corchete derecho pasa a blanco, como en el kit. */
  claro?: boolean;
}) {
  return (
    <svg
      width={tam}
      height={tam}
      viewBox="0 0 128 128"
      role="img"
      aria-label="Cuadre"
      style={{ display: "block" }}
    >
      <path d="M54 12H12v104h42V92H36V36h18z" fill="#2457D6" />
      <path d="M68 12h48v104H68V92h24V36H68z" fill={claro ? "#FFFFFF" : "#17202A"} />
      <rect x="50" y="50" width="30" height="30" rx="2" fill={fondo} />
    </svg>
  );
}

/**
 * Símbolo y nombre, en vertical. El aire entre los dos es el que pide la guía:
 * igual al ancho del vacío central del símbolo.
 */
export default function LogoCuadre({
  tam = 56,
  fondo = "var(--cuadre-marfil)",
}: {
  tam?: number;
  fondo?: string;
}) {
  return (
    <div className="flex flex-col items-center">
      <SimboloCuadre tam={tam} fondo={fondo} />
      <span
        className="mt-3 font-semibold tracking-tight"
        style={{ fontSize: tam * 0.5, lineHeight: 1, color: "var(--cuadre-grafito)" }}
      >
        Cuadre
      </span>
    </div>
  );
}
