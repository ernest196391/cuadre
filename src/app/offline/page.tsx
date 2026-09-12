import type { Metadata } from "next";
import { SimboloCuadre } from "@/components/LogoCuadre";

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
    <main
      className="flex min-h-[100dvh] flex-col items-center justify-center px-6 text-center"
      style={{
        background: "var(--cuadre-marfil)",
        paddingTop: "calc(env(safe-area-inset-top) + 32px)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 32px)",
      }}
    >
      <div className="flex w-full max-w-[340px] flex-col items-center">
        <div style={{ opacity: 0.4 }}>
          <SimboloCuadre tam={48} fondo="var(--cuadre-marfil)" />
        </div>

        <h1 className="mt-6 text-xl font-semibold" style={{ color: "var(--cuadre-grafito)" }}>
          Sin conexión
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed" style={{ color: "var(--cuadre-pizarra)" }}>
          Cuadre necesita internet para enseñarte tus cuentas. No se guarda nada en el teléfono, así
          que en cuanto vuelva la señal lo verás todo al día.
        </p>

        <a
          className="boton-primario mt-7"
          href="/"
          style={{ background: "var(--cuadre-azul)", minHeight: 52, width: "auto", padding: "0 32px" }}
        >
          Reintentar
        </a>
      </div>
    </main>
  );
}
