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
    <main
      className="flex min-h-[100dvh] flex-col items-center justify-center px-6"
      style={{
        background: "var(--cuadre-marfil)",
        // Que el notch y la barra de gestos no se coman nada.
        paddingTop: "calc(env(safe-area-inset-top) + 32px)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 32px)",
      }}
    >
      <div className="flex w-full max-w-[380px] flex-col items-center">
        <LogoCuadre tam={60} fondo="var(--cuadre-marfil)" />

        <p
          className="mt-3 text-center text-[15px] leading-relaxed"
          style={{ color: "var(--cuadre-pizarra)" }}
        >
          Entra para registrar el día.
        </p>

        <form
          onSubmit={entrar}
          className="mt-8 w-full rounded-2xl p-6"
          style={{
            background: "#FFFFFF",
            border: "1px solid var(--cuadre-niebla)",
            // Sombra muy corta: da relieve sin que parezca una caja flotando.
            boxShadow: "0 1px 2px rgba(23,32,42,.04), 0 8px 24px -12px rgba(23,32,42,.10)",
            // El foco de los campos, aquí en azul de Cuadre y no en el del
            // operador, que en esta pantalla todavía no existe.
            ["--marca" as string]: "var(--cuadre-azul)",
          }}
        >
          <div className="flex flex-col gap-5">
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
                  margen negativo evita que por eso la fila crezca y descuadre
                  el ritmo con el campo de arriba. */}
              <div className="mb-1.5 flex items-center justify-between gap-3">
                {/* En línea porque `.etiqueta` se declara después de las
                    utilidades de Tailwind y le ganaría a un `mb-0`. */}
                <label className="etiqueta" htmlFor="clave" style={{ marginBottom: 0 }}>
                  Contraseña
                </label>
                <button
                  type="button"
                  onClick={() => setVerClave((v) => !v)}
                  className="text-xs font-medium"
                  style={{
                    color: "var(--cuadre-azul)",
                    minHeight: 44,
                    padding: "0 2px",
                    margin: "-14px -2px",
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
                className="rounded-xl px-4 py-3 text-sm leading-relaxed"
                style={{
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
              style={{ background: "var(--cuadre-azul)", minHeight: 52 }}
            >
              {entrando ? "Entrando…" : "Entrar"}
            </button>
          </div>
        </form>

        <p
          className="mt-8 text-center text-xs leading-relaxed"
          style={{ color: "var(--cuadre-pizarra)", opacity: 0.75 }}
        >
          Software operativo para negocios de remesas
        </p>
      </div>
    </main>
  );
}
