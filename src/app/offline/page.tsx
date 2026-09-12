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
      className="escala-envoltorio flex min-h-[100dvh] flex-col items-center justify-center text-center"
      style={{
        background: "var(--cuadre-marfil)",
        paddingInline: "1.5em",
        paddingTop: "calc(env(safe-area-inset-top) + 2em)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 2em)",
      }}
    >
      <div className="flex w-full flex-col items-center" style={{ maxWidth: "21.25em" }}>
        <div style={{ opacity: 0.4 }}>
          <SimboloCuadre tam="3em" fondo="var(--cuadre-marfil)" />
        </div>

        <h1
          className="font-semibold"
          style={{ marginTop: "1.2em", fontSize: "1.25em", color: "var(--cuadre-grafito)" }}
        >
          Sin conexión
        </h1>
        <p
          className="leading-relaxed"
          style={{ marginTop: "0.53em", fontSize: "0.94em", color: "var(--cuadre-pizarra)" }}
        >
          Cuadre necesita internet para enseñarte tus cuentas. No se guarda nada en el teléfono, así
          que en cuanto vuelva la señal lo verás todo al día.
        </p>

        <a
          className="boton-primario"
          href="/"
          style={{
            background: "var(--cuadre-azul)",
            marginTop: "1.75em",
            width: "auto",
            padding: "0 2em",
          }}
        >
          Reintentar
        </a>
      </div>
    </main>
  );
}
