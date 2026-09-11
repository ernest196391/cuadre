"use client";

import { useEffect, useState } from "react";

interface EventoInstalacion extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DESCARTADO = "cuadre.instalacion_descartada";

/**
 * Ofrecer instalar la app, sin dar la lata.
 *
 * Android manda el evento `beforeinstallprompt` y se puede abrir el diálogo del
 * sistema. iPhone no lo manda —Apple no lo implementa— así que allí lo único
 * posible es explicar dónde está la opción en el menú de compartir.
 *
 * Si ya está instalada no aparece nada, y si lo descarta una vez tampoco vuelve
 * a salir: se usa a diario, y un banner insistiendo cada mañana se convierte en
 * algo que se esquiva sin leer.
 */
export default function BotonInstalar() {
  const [evento, setEvento] = useState<EventoInstalacion | null>(null);
  const [esIos, setEsIos] = useState(false);
  const [verPasos, setVerPasos] = useState(false);
  const [oculto, setOculto] = useState(true);

  useEffect(() => {
    // Abierta desde el ícono: no hay nada que instalar.
    const instalada =
      window.matchMedia("(display-mode: standalone)").matches ||
      // Safari en iOS usa su propia bandera, fuera del estándar.
      (window.navigator as { standalone?: boolean }).standalone === true;
    if (instalada) return;

    let yaDicho = false;
    try {
      yaDicho = localStorage.getItem(DESCARTADO) === "1";
    } catch {
      /* modo privado */
    }
    if (yaDicho) return;

    const ua = window.navigator.userAgent;
    const iosSafari = /iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    if (iosSafari) {
      setEsIos(true);
      setOculto(false);
      return;
    }

    const alPoder = (e: Event) => {
      // Sin esto Chrome enseña su propia barra, que tapa la interfaz.
      e.preventDefault();
      setEvento(e as EventoInstalacion);
      setOculto(false);
    };
    window.addEventListener("beforeinstallprompt", alPoder);
    const alInstalar = () => setOculto(true);
    window.addEventListener("appinstalled", alInstalar);
    return () => {
      window.removeEventListener("beforeinstallprompt", alPoder);
      window.removeEventListener("appinstalled", alInstalar);
    };
  }, []);

  function descartar() {
    try {
      localStorage.setItem(DESCARTADO, "1");
    } catch {
      /* modo privado: volverá a salir, mala suerte */
    }
    setOculto(true);
  }

  async function instalar() {
    if (!evento) return;
    await evento.prompt();
    const { outcome } = await evento.userChoice;
    setEvento(null);
    if (outcome === "accepted") setOculto(true);
    else descartar();
  }

  if (oculto) return null;

  return (
    <div
      className="mb-4 rounded-2xl p-4"
      style={{ background: "rgba(36,87,214,.07)", border: "1.5px solid rgba(36,87,214,.3)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold">Ten Cuadre a mano</p>
          <p className="mt-0.5 text-xs" style={{ color: "var(--texto-suave)" }}>
            Se abre como una app, a pantalla completa, desde tu inicio.
          </p>
        </div>
        <button
          className="shrink-0 text-sm font-medium"
          type="button"
          onClick={descartar}
          style={{ color: "var(--texto-suave)", minHeight: 44 }}
          aria-label="No instalar"
        >
          Ahora no
        </button>
      </div>

      {esIos ? (
        verPasos ? (
          <ol className="mt-3 flex flex-col gap-1 pl-4 text-sm" style={{ listStyle: "decimal" }}>
            <li>Toca Compartir, abajo en el centro.</li>
            <li>Baja y elige «Agregar a inicio».</li>
            <li>Toca «Agregar».</li>
          </ol>
        ) : (
          <button
            className="boton-primario mt-3"
            type="button"
            onClick={() => setVerPasos(true)}
            style={{ background: "#2457D6" }}
          >
            Cómo instalarla
          </button>
        )
      ) : (
        <button
          className="boton-primario mt-3"
          type="button"
          onClick={instalar}
          style={{ background: "#2457D6" }}
        >
          Instalar app
        </button>
      )}
    </div>
  );
}
