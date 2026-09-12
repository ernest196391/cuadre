"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { hayConfiguracion, supabase } from "@/lib/supabase/client";
import { useSesion } from "@/lib/sesion";
import LogoCuadre from "@/components/LogoCuadre";

/**
 * La puerta de entrada.
 *
 * Es la única pantalla que lleva la marca de CUADRE y no la del operador: aquí
 * todavía no se sabe quién va a entrar, así que no hay `tenants` del que sacar
 * colores. En cuanto entra, manda la marca de su negocio.
 */
export default function LoginPage() {
  const router = useRouter();
  const { usuario, cargando } = useSesion();
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [verClave, setVerClave] = useState(false);
  const [entrando, setEntrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cargando && usuario) router.replace("/");
  }, [cargando, usuario, router]);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    if (!hayConfiguracion()) {
      setError("Este despliegue todavía no tiene configurada la conexión con la base de datos.");
      return;
    }
    setEntrando(true);
    setError(null);
    const { error: err } = await supabase().auth.signInWithPassword({
      email: email.trim(),
      password: clave,
    });
    setEntrando(false);
    if (err) {
      setError(
        err.message === "Invalid login credentials"
          ? "Correo o contraseña incorrectos."
          : /network|fetch/i.test(err.message)
            ? "No se pudo conectar. Revisa tu conexión e inténtalo otra vez."
            : err.message
      );
      return;
    }
    router.replace("/");
  }

  return (
    /* `escala-envoltorio`: el tamaño base crece con el ancho de la pantalla y
       todo aquí dentro se mide en `em` contra él. Hay teléfonos que reportan
       ~1000px de viewport, y ahí una composición clavada a 380px se ve
       diminuta y perdida en medio del marfil. */
    <main
      className="escala-envoltorio flex min-h-[100dvh] flex-col items-center justify-center"
      style={{
        background: "var(--cuadre-marfil)",
        paddingInline: "1.5em",
        // Que el notch y la barra de gestos no se coman nada.
        paddingTop: "calc(env(safe-area-inset-top) + 2em)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 2em)",
      }}
    >
      <div className="flex w-full flex-col items-center" style={{ maxWidth: "23.75em" }}>
        <LogoCuadre tam="3.75em" fondo="var(--cuadre-marfil)" />

        <p
          className="text-center leading-relaxed"
          style={{ marginTop: "0.75em", fontSize: "0.94em", color: "var(--cuadre-pizarra)" }}
        >
          Entra para registrar el día.
        </p>

        <form
          onSubmit={entrar}
          className="w-full"
          style={{
            marginTop: "2em",
            padding: "1.5em",
            borderRadius: "1em",
            background: "#FFFFFF",
            border: "1px solid var(--cuadre-niebla)",
            // Sombra muy corta: da relieve sin que parezca una caja flotando.
            boxShadow: "0 1px 2px rgba(23,32,42,.04), 0 8px 24px -12px rgba(23,32,42,.10)",
            // El foco de los campos, aquí en azul de Cuadre y no en el del
            // operador, que en esta pantalla todavía no existe.
            ["--marca" as string]: "var(--cuadre-azul)",
          }}
        >
          <div className="flex flex-col" style={{ gap: "1.25em" }}>
            <div>
              <label className="etiqueta" htmlFor="email">
                Correo
              </label>
              <input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="tucorreo@ejemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              {/* La zona tocable llega a 44px como en el resto de la app; el
                  margen vertical negativo la deja sobresalir sin que la fila
                  crezca y descuadre el ritmo con el campo de arriba. */}
              <div
                className="flex items-center justify-between"
                style={{
                  gap: "0.75em",
                  marginBottom: "0.4em",
                  ["--alto-ver" as string]: "max(44px, 2.6em)",
                }}
              >
                {/* En línea porque `.etiqueta` se declara después de las
                    utilidades de Tailwind y le ganaría a un `mb-0`. */}
                <label className="etiqueta" htmlFor="clave" style={{ marginBottom: 0 }}>
                  Contraseña
                </label>
                <button
                  type="button"
                  onClick={() => setVerClave((v) => !v)}
                  className="font-medium"
                  style={{
                    color: "var(--cuadre-azul)",
                    fontSize: "0.82em",
                    minHeight: "var(--alto-ver)",
                    paddingInline: "0.15em",
                    marginInline: "-0.15em",
                    marginBlock: "calc((1.25em - var(--alto-ver)) / 2)",
                  }}
                >
                  {verClave ? "Ocultar" : "Ver"}
                </button>
              </div>
              <input
                id="clave"
                type={verClave ? "text" : "password"}
                autoComplete="current-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                required
              />
            </div>

            {error && (
              <p
                className="leading-relaxed"
                style={{
                  fontSize: "0.88em",
                  padding: "0.85em 1.15em",
                  borderRadius: "0.85em",
                  background: "rgba(196,61,75,.07)",
                  border: "1px solid rgba(196,61,75,.25)",
                  color: "#A32B38",
                }}
                role="alert"
              >
                {error}
              </p>
            )}

            {/* No se deshabilita por campos vacíos: un botón descolorido nada
                más abrir parece averiado, y los campos ya son `required`, así
                que el navegador se encarga de señalar el que falta. */}
            <button
              className="boton-primario"
              type="submit"
              disabled={entrando}
              style={{ background: "var(--cuadre-azul)" }}
            >
              {entrando ? "Entrando…" : "Entrar"}
            </button>
          </div>
        </form>

        <p
          className="text-center leading-relaxed"
          style={{
            // Los `em` de un margen se miden contra la fuente del propio
            // elemento, no contra la base: 2,66 × 0,75 = 2 tamaños base.
            marginTop: "2.66em",
            fontSize: "0.75em",
            color: "var(--cuadre-pizarra)",
            opacity: 0.75,
          }}
        >
          Software operativo para negocios de remesas
        </p>
      </div>
    </main>
  );
}
