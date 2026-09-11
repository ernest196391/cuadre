/* eslint-disable no-restricted-globals */
/**
 * Service worker de Cuadre.
 *
 * ═══ LA REGLA ═══
 * Esta app maneja dinero y datos bancarios de terceros. Un dato cacheado
 * sobrevive al cierre de sesión y se queda en el disco del teléfono. Por eso
 * aquí se trabaja con LISTA BLANCA, no con lista negra: solo se guarda lo que
 * está explícitamente reconocido como armazón estático. Todo lo demás sale del
 * manejador sin tocarse, y si mañana alguien añade una ruta nueva, por defecto
 * NO se cachea.
 *
 * Lo que se guarda:
 *   · /_next/static/*  → JS y CSS con hash en el nombre, inmutables y sin
 *                        datos de nadie dentro
 *   · /icons/*, el manifiesto y la pantalla /offline
 *
 * Lo que NUNCA se toca (ni se mira: hay un return en la primera línea):
 *   · cualquier cosa de *.supabase.co  → entregas, compras, contactos,
 *                                        comisiones, cobros
 *   · /api/*  → incluye /api/cuentas/[id]/revelar, que devuelve el número de
 *               tarjeta descifrado
 *   · todo lo que no sea GET
 *
 * Y LAS NAVEGACIONES NO SE GUARDAN NUNCA. Es la línea que impide el peor caso:
 * que alguien cierre sesión y el service worker le sirva una pantalla
 * autenticada vieja, con saldos y nombres, desde la caché. Se pide siempre a la
 * red; si no hay red, se muestra /offline, que está vacía de datos.
 */

const VERSION = "cuadre-v1";
const ARMAZON = `${VERSION}-armazon`;

/** Lo mínimo para que la app arranque y para poder avisar de que no hay red. */
const PRECARGA = [
  "/offline",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon-180.png",
  "/icons/icon.svg",
];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches
      .open(ARMAZON)
      // addAll es todo o nada: si una pieza falla, el SW no se instala a medias.
      .then((cache) => cache.addAll(PRECARGA))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) =>
        Promise.all(claves.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

/** ¿Es armazón estático, sin nada de nadie dentro? */
function esArmazon(url) {
  if (url.origin !== self.location.origin) return false;
  // Los de Next llevan hash en el nombre: cambian de nombre al cambiar, así que
  // guardarlos para siempre es seguro.
  if (url.pathname.startsWith("/_next/static/")) return true;
  if (url.pathname.startsWith("/icons/")) return true;
  return url.pathname === "/manifest.webmanifest" || url.pathname === "/favicon.ico";
}

self.addEventListener("fetch", (evento) => {
  const peticion = evento.request;

  // ─── Puerta de entrada: lo que no pase de aquí, el SW ni lo ve ───
  // Sin respondWith, el navegador hace la petición como si no existiéramos:
  // no pasa por caché, no se guarda, no queda rastro.
  if (peticion.method !== "GET") return;

  const url = new URL(peticion.url);

  // Datos. Ni tocarlos.
  if (url.hostname.endsWith(".supabase.co") || url.hostname.endsWith(".supabase.in")) return;
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) return;

  // Cualquier otro origen (una CDN, lo que sea) tampoco es asunto nuestro.
  if (url.origin !== self.location.origin) return;

  // ─── Navegaciones: red primero, y NO se guarda la respuesta ───
  if (peticion.mode === "navigate") {
    evento.respondWith(
      fetch(peticion).catch(() =>
        caches.match("/offline", { cacheName: ARMAZON }).then(
          (r) =>
            r ??
            new Response("Sin conexión.", {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            })
        )
      )
    );
    return;
  }

  // ─── Armazón estático: caché primero ───
  if (esArmazon(url)) {
    evento.respondWith(
      caches.match(peticion, { cacheName: ARMAZON }).then((guardado) => {
        if (guardado) return guardado;
        return fetch(peticion).then((respuesta) => {
          // Solo se guarda lo que salió bien y del propio sitio. Una respuesta
          // opaca o un 404 en caché es peor que no tener nada.
          if (respuesta.ok && respuesta.type === "basic") {
            const copia = respuesta.clone();
            caches.open(ARMAZON).then((cache) => cache.put(peticion, copia));
          }
          return respuesta;
        });
      })
    );
    return;
  }

  // Cualquier otra cosa del sitio: a la red, sin guardar.
});

/**
 * Al cerrar sesión, la app manda LIMPIAR. Hoy no hay nada de usuario en la
 * caché —por eso está escrito así— pero se borra igual: si alguien añade algo
 * más adelante sin darse cuenta, el cierre de sesión lo barre.
 */
self.addEventListener("message", (evento) => {
  if (evento.data === "LIMPIAR") {
    evento.waitUntil(caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k)))));
  }
});
