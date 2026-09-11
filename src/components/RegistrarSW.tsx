"use client";

import { useEffect } from "react";

/**
 * Registra el service worker. Sin componente visible: solo engancha el archivo.
 *
 * En desarrollo no se registra. Un SW cacheando el armazón mientras se edita
 * código sirve pantallas viejas y hace perder horas persiguiendo fantasmas.
 */
export default function RegistrarSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    // Se espera al load para no competir por ancho de banda con la primera
    // pantalla, que es lo que la persona está esperando ver.
    const registrar = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        /* sin SW la app funciona igual, solo no se instala */
      });
    };
    if (document.readyState === "complete") registrar();
    else window.addEventListener("load", registrar, { once: true });
  }, []);

  return null;
}
