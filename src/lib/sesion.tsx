"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { hayConfiguracion, supabase } from "./supabase/client";

export interface Tenant {
  id: string;
  brand_name: string;
  brand_logo_url: string | null;
  brand_primary_color: string;
  brand_accent_color: string;
  base_currency: string;
}

export interface Perfil {
  id: string;
  tenant_id: string;
  full_name: string;
  role: "owner" | "worker";
  /** Su ficha de contacto: con esto "atendida por" viene marcado solo. */
  contact_id: string | null;
}

export interface Metodo {
  id: string;
  key: string;
  label: string;
  target_currency: string;
  rate: number;
  note: string | null;
  active: boolean;
  sort_order: number;
}

interface Estado {
  cargando: boolean;
  error: string | null;
  usuario: User | null;
  perfil: Perfil | null;
  tenant: Tenant | null;
  metodos: Metodo[];
  recargar: () => void;
  salir: () => Promise<void>;
}

const Ctx = createContext<Estado | null>(null);

/** Timeout para que un cuelgue de red termine en un error visible y no en un spinner eterno. */
function conTimeout<T>(p: PromiseLike<T>, ms = 8000): Promise<T> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error("La conexión tardó demasiado.")), ms)),
  ]);
}

export function SesionProvider({ children }: { children: React.ReactNode }) {
  const [estado, setEstado] = useState<Omit<Estado, "recargar" | "salir">>({
    cargando: true,
    error: null,
    usuario: null,
    perfil: null,
    tenant: null,
    metodos: [],
  });

  const cargar = useCallback(async () => {
    setEstado((e) => ({ ...e, cargando: true, error: null }));
    try {
      const sb = supabase();
      const { data: auth } = await conTimeout(sb.auth.getUser());
      if (!auth.user) {
        setEstado({ cargando: false, error: null, usuario: null, perfil: null, tenant: null, metodos: [] });
        return;
      }

      const { data: perfil, error: ePerfil } = await conTimeout(
        sb.from("profiles").select("id, tenant_id, full_name, role, contact_id").eq("id", auth.user.id).maybeSingle()
      );
      if (ePerfil) throw ePerfil;

      if (!perfil) {
        // Autenticado pero sin operador: RLS no le deja ver nada, y así debe ser.
        setEstado({
          cargando: false,
          error: "Tu usuario todavía no está asignado a ningún operador. Pídeselo al dueño.",
          usuario: auth.user, perfil: null, tenant: null, metodos: [],
        });
        return;
      }

      const [tRes, mRes] = await Promise.all([
        conTimeout(
          sb.from("tenants")
            .select("id, brand_name, brand_logo_url, brand_primary_color, brand_accent_color, base_currency")
            .eq("id", perfil.tenant_id).single()
        ),
        conTimeout(
          sb.from("delivery_methods")
            .select("id, key, label, target_currency, rate, note, active, sort_order")
            .order("sort_order", { ascending: true })
        ),
      ]);
      if (tRes.error) throw tRes.error;
      if (mRes.error) throw mRes.error;

      setEstado({
        cargando: false,
        error: null,
        usuario: auth.user,
        perfil: perfil as Perfil,
        tenant: tRes.data as Tenant,
        metodos: (mRes.data ?? []).map((m) => ({ ...m, rate: Number(m.rate) })) as Metodo[],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido.";
      setEstado((e) => ({
        ...e,
        cargando: false,
        error: /failed to fetch|networkerror|load failed/i.test(msg)
          ? "No se pudo conectar con el servidor. Revisa tu conexión."
          : msg,
      }));
    }
  }, []);

  useEffect(() => {
    cargar();
    if (!hayConfiguracion()) return;
    const { data: sub } = supabase().auth.onAuthStateChange((evento) => {
      if (evento === "SIGNED_IN" || evento === "SIGNED_OUT") cargar();
    });
    return () => sub.subscription.unsubscribe();
  }, [cargar]);

  const salir = useCallback(async () => {
    await supabase().auth.signOut();
  }, []);

  return <Ctx.Provider value={{ ...estado, recargar: cargar, salir }}>{children}</Ctx.Provider>;
}

export function useSesion() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSesion tiene que usarse dentro de SesionProvider.");
  return ctx;
}
