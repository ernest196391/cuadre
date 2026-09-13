-- UNA SOLA TASA.
--
-- Hasta ahora la tasa vivía en dos tablas independientes:
-- `cuadre.delivery_methods`, con la que Cuadre calcula la entrega y la
-- ganancia, y `public.delivery_methods`, que es la que ve el cliente en la web.
-- Coincidían por costumbre, no por construcción: cambiar una no cambiaba la
-- otra. El día que se separaran, el cliente pediría a un precio y Cuadre
-- registraría otro.
--
-- La tabla de `public` NO se puede tirar: `offers.method_key` la referencia.
-- Así que en vez de eliminarla se convierte en un reflejo:
--
--   1. Cuadre manda. Lo que se escriba ahí baja sola a la web, en la misma
--      transacción.
--   2. La web no puede contradecir a Cuadre. Editar la tasa directamente en
--      `public` queda prohibido por la propia base, no por costumbre.
--
-- Aplicada al proyecto real (dkiiknsfbefpkrnmbzid) vía MCP. Este archivo es el
-- registro versionado.

-- ── 1. El espejo ────────────────────────────────────────────────────────────
create or replace function cuadre.espejar_metodos_en_la_web()
returns trigger
language plpgsql
security definer
set search_path = cuadre, public
as $$
begin
  perform set_config('cuyana.espejo', 'on', true);

  if tg_op = 'DELETE' then
    -- No se borra: `offers` puede apuntar a esa clave. Se desactiva.
    update public.delivery_methods
       set active = false, updated_at = now()
     where key = old.key;
    return old;
  end if;

  insert into public.delivery_methods
      (key, label, target_currency, rate_per_gyd, note, active, sort_order, rate_source, updated_at)
  values
      (new.key, new.label, new.target_currency, new.rate, new.note, new.active,
       new.sort_order, 'cuadre', now())
  on conflict (key) do update
     set label = excluded.label, target_currency = excluded.target_currency,
         rate_per_gyd = excluded.rate_per_gyd, note = excluded.note,
         active = excluded.active, sort_order = excluded.sort_order,
         rate_source = 'cuadre', updated_at = now();
  return new;
end $$;

drop trigger if exists espejar_en_la_web on cuadre.delivery_methods;
create trigger espejar_en_la_web
  after insert or update or delete on cuadre.delivery_methods
  for each row execute function cuadre.espejar_metodos_en_la_web();

-- ── 2. El guardián ──────────────────────────────────────────────────────────
create or replace function public.solo_cuadre_cambia_las_tasas()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('cuyana.espejo', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  raise exception
    'Las tasas se cambian en Cuadre (Tasas), no aquí. Esta tabla es un reflejo de cuadre.delivery_methods.'
    using errcode = '42501';
end $$;

drop trigger if exists solo_cuadre on public.delivery_methods;
create trigger solo_cuadre
  before insert or update or delete on public.delivery_methods
  for each row execute function public.solo_cuadre_cambia_las_tasas();

comment on table public.delivery_methods is
  'REFLEJO de cuadre.delivery_methods. No se edita a mano: la tasa se cambia en Cuadre y baja sola. Existe como tabla, y no como vista, porque offers.method_key la referencia.';
