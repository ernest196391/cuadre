"use client";

import { useRef } from "react";

/**
 * Un cerrojo para que dos toques seguidos no manden el mismo formulario dos
 * veces.
 *
 * `disabled={guardando}` no basta: poner el estado no repinta el botón hasta
 * después del evento, y en esa rendija —medida en unos 150-300 ms, justo la
 * separación de un doble toque nervioso— el segundo clic entra y el manejador
 * corre otra vez. Con dinero de por medio eso es una compra duplicada, o una
 * entrega con su comisión duplicada: alguien cobra dos veces por un solo envío.
 *
 * El ref se lee y se escribe en el mismo turno, sin esperar a React, así que
 * cierra la rendija entera.
 */
export function useEnvioUnico() {
  const enVuelo = useRef(false);
  return {
    /** true si toca mandar; false si ya hay uno en marcha. */
    tomar() {
      if (enVuelo.current) return false;
      enVuelo.current = true;
      return true;
    },
    soltar() {
      enVuelo.current = false;
    },
  };
}
