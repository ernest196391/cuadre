import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sin conexión · Cuadre" };

/**
 * Lo que se ve cuando se abre la app sin red.
 *
 * Está vacía a propósito: es la ÚNICA página que el service worker guarda, así
 * que no puede contener ni un dato. Ni saldos, ni nombres, ni la última
 * entrega. Solo dice qué pasa y cómo salir de ahí.
 */
export default function OfflinePage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-semibold">Sin conexión</h1>
      <p className="text-sm leading-relaxed" style={{ color: "var(--texto-suave)" }}>
        Cuadre necesita internet para enseñarte tus cuentas. No se guarda nada en el teléfono, así
        que en cuanto vuelva la señal lo verás todo al día.
      </p>
      <a className="boton-secundario h-11 px-6" href="/">
        Reintentar
      </a>
    </div>
  );
}
