-- Cuadre — base: operador (tenant), usuarios y funciones de contexto.
--
-- Una instalación = un operador. La columna tenant_id existe en todas las
-- tablas igual, para que consolidar varios operadores en una sola base algún
-- día sea un cambio de configuración y no un rediseño.

create table public.tenants (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,

  -- Marca del operador. El producto sale neutro; esto es lo que lo viste.
  brand_name           text not null,
  brand_logo_url       text,
  brand_primary_color  text not null default '#1F1B1D',
  brand_accent_color   text not null default '#6B7280',

  -- El corredor es dato, no código: nada de 'GYD' ni 'CUP' escritos en la app.
  base_currency        text not null,
  origin_country       text,
  destination_country  text,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Une un usuario de Supabase Auth con su operador y su rol. Sin fila aquí, un
-- usuario autenticado no pertenece a ningún tenant y no ve absolutamente nada:
-- así, que el registro público quede abierto por error no abre ninguna puerta.
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  tenant_id   uuid not null references public.tenants(id) on delete restrict,
  full_name   text not null,
  role        text not null check (role in ('owner', 'worker')),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index profiles_tenant_idx on public.profiles (tenant_id);

-- security definer porque tienen que leer profiles, que también tiene RLS; sin
-- definer, la política de profiles se llamaría a sí misma en recursión infinita.
-- search_path fijo para que nadie pueda colar un profiles falso por delante.
create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select tenant_id from public.profiles where id = auth.uid() and active;
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select role = 'owner' from public.profiles where id = auth.uid() and active),
    false
  );
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tenants_touch  before update on public.tenants  for each row execute function public.touch_updated_at();
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
