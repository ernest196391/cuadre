-- Cuadre — claves de API para la entrada de pedidos.
--
-- Se guarda solo el hash SHA-256, nunca la clave. Si alguien se lleva esta
-- tabla no se lleva ninguna llave utilizable, y si el operador pierde la suya
-- no hay forma de recuperarla: se revoca y se genera otra. El prefijo visible
-- existe solo para poder distinguirlas en una lista.

create table public.api_keys (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete restrict,
  name         text not null check (length(btrim(name)) > 0),
  key_prefix   text not null,
  key_hash     text not null unique,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
create index api_keys_tenant_idx on public.api_keys (tenant_id);

alter table public.api_keys enable row level security;

-- Las claves son cosa del dueño. Y ni él ve el hash desde el navegador:
-- se le conceden solo las columnas con las que se administra una lista.
revoke all on public.api_keys from anon, authenticated;

grant select (id, tenant_id, name, key_prefix, created_at, last_used_at, revoked_at)
  on public.api_keys to authenticated;

create policy api_keys_select on public.api_keys
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_owner());

-- El alta y la revocación pasan por el servidor, que es quien genera la clave
-- y calcula el hash; por eso no hay política de insert ni de update.

-- Pedidos entrantes: quién los trajo y desde dónde.
alter table public.inbound_orders
  add column api_key_id uuid references public.api_keys(id) on delete set null,
  add column source_ip text;
