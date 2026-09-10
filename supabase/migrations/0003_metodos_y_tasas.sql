-- Cuadre — métodos de entrega y sus tasas.
--
-- Convención única de tasa en todo el producto: unidades de la moneda destino
-- por 1 unidad de la moneda origen.
--   3,20 CUP por GYD      -> rate = 3.20000000
--   275 GYD por 1 USD     -> rate = 0.00363636
-- Una sola convención, una sola fórmula. La pantalla la muestra en la
-- dirección en la que la gente la lee ("275 GYD = 1 USD").

create table public.delivery_methods (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete restrict,
  key              text not null check (key ~ '^[a-z0-9_]+$'),
  label            text not null check (length(btrim(label)) > 0),
  target_currency  text not null,
  rate             numeric(18,8) not null check (rate > 0),
  note             text,
  active           boolean not null default true,
  sort_order       integer not null default 0,
  updated_by       uuid references auth.users(id),
  updated_at       timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  unique (tenant_id, key)
);

create table public.delivery_method_rate_history (
  id          bigint generated always as identity primary key,
  tenant_id   uuid not null references public.tenants(id) on delete restrict,
  method_id   uuid not null references public.delivery_methods(id) on delete restrict,
  rate        numeric(18,8) not null check (rate > 0),
  changed_by  uuid references auth.users(id),
  changed_at  timestamptz not null default now()
);
create index rate_history_method_idx on public.delivery_method_rate_history (method_id, changed_at desc);

create trigger delivery_methods_touch before update on public.delivery_methods for each row execute function public.touch_updated_at();

-- Cambiar la tasa y dejarla registrada tienen que pasar juntas o no pasar.
-- security invoker: las políticas RLS del que llama siguen aplicando igual,
-- esta función no regala ningún permiso.
create or replace function public.update_method_rate(p_method_id uuid, p_rate numeric)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid;
  v_filas  int;
begin
  if p_rate is null or p_rate <= 0 then
    raise exception 'La tasa tiene que ser mayor que cero.';
  end if;

  select tenant_id into v_tenant from public.delivery_methods where id = p_method_id;
  if v_tenant is null then
    raise exception 'No existe ese método de entrega.';
  end if;

  insert into public.delivery_method_rate_history (tenant_id, method_id, rate, changed_by)
  values (v_tenant, p_method_id, p_rate, auth.uid());

  update public.delivery_methods
     set rate = p_rate, updated_by = auth.uid(), updated_at = now()
   where id = p_method_id;

  get diagnostics v_filas = row_count;
  if v_filas = 0 then
    raise exception 'No se pudo actualizar el método.';
  end if;
end;
$$;
