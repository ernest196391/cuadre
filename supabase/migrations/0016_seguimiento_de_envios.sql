-- SEGUIMIENTO DE ENVÍOS
--
-- Cuatro pasos, ni uno de relleno:
--   pedido_recibido     lo pidió por la web, todavía no ha pagado
--   recibido_en_guyana  Adonys tiene el dinero en la mano
--   listo_en_cuba       Ernesto ya lo tiene de este lado
--   entregado           la familia lo recibió
--   cancelado           no salió
--
-- Se guardan los SALTOS, no un estado en una columna. Es lo que hace que el
-- caso del USD «dando y dando» —donde los cuatro pasos ocurren en el mismo
-- minuto— sea normal y no una excepción que haya que programar. De paso quedan
-- las horas de cada paso, que es lo que convierte un estado en un seguimiento,
-- y lo que permitirá medir si se cumplen las 24-48 horas cuando se prometan.
--
-- La llave es `tracking_ref`: el identificador que nace en la web y viaja por
-- toda la cadena. El seguimiento empieza ANTES de que exista una entrega
-- registrada, así que no se puede colgar del id de la entrega.
--
-- Aplicada al proyecto real (dkiiknsfbefpkrnmbzid) vía MCP como
-- `20260913020410_seguimiento_de_envios`. Toca los dos esquemas, así que el
-- mismo SQL vive en los dos repositorios.

-- ── 1. Cerrar la cadena ─────────────────────────────────────────────────────
-- La web mandaba esta referencia a Cuadre pero no se la guardaba, así que no
-- había forma de volver del pedido al cliente que lo hizo.
alter table public.orders
  add column if not exists tracking_ref uuid;
create index if not exists orders_tracking_ref_idx on public.orders (tracking_ref);

-- Y al convertir un pedido en entrega solo quedaba una nota de texto.
alter table cuadre.deliveries
  add column if not exists inbound_order_id uuid references cuadre.inbound_orders(id);
create index if not exists deliveries_inbound_order_idx
  on cuadre.deliveries (inbound_order_id);

-- ── 2. Los saltos ───────────────────────────────────────────────────────────
create table if not exists cuadre.envio_estados (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references cuadre.tenants(id) on delete cascade,
  tracking_ref uuid not null,
  estado       text not null check (estado in
                 ('pedido_recibido','recibido_en_guyana','listo_en_cuba','entregado','cancelado')),
  nota         text,
  -- Quién lo movió. Nulo cuando lo pone el sistema al entrar el pedido.
  quien        uuid references cuadre.contacts(id),
  cuando       timestamptz not null default now()
);
create index if not exists envio_estados_ref_idx
  on cuadre.envio_estados (tracking_ref, cuando desc);

alter table cuadre.envio_estados enable row level security;

drop policy if exists envio_estados_del_operador on cuadre.envio_estados;
create policy envio_estados_del_operador on cuadre.envio_estados
  for all to authenticated
  using (tenant_id = (select p.tenant_id from cuadre.profiles p where p.id = auth.uid()))
  with check (tenant_id = (select p.tenant_id from cuadre.profiles p where p.id = auth.uid()));

-- ── 3. El primer paso se pone solo ──────────────────────────────────────────
-- En cuanto entra un pedido de la web ya hay algo que contarle al cliente.
create or replace function cuadre.marcar_pedido_recibido()
returns trigger language plpgsql security definer set search_path = cuadre as $$
declare ref uuid;
begin
  begin
    ref := (new.payload ->> 'external_ref')::uuid;
  exception when others then
    return new;  -- Referencia con otra forma: no se inventa un seguimiento.
  end;
  if ref is null then return new; end if;
  insert into cuadre.envio_estados (tenant_id, tracking_ref, estado, nota)
  values (new.tenant_id, ref, 'pedido_recibido', 'Entró por la web');
  return new;
end $$;

drop trigger if exists primer_estado on cuadre.inbound_orders;
create trigger primer_estado
  after insert on cuadre.inbound_orders
  for each row execute function cuadre.marcar_pedido_recibido();

-- ── 4. Lo que puede leer el cliente ─────────────────────────────────────────
-- Con su referencia en la mano —un UUID que solo tiene él— ve su seguimiento y
-- nada más. Ni montos de otros, ni márgenes, ni quién lo atendió.
create or replace function public.seguimiento(ref uuid)
returns table (estado text, cuando timestamptz)
language sql
stable
security definer
set search_path = cuadre, public
as $$
  select e.estado, e.cuando
    from cuadre.envio_estados e
   where e.tracking_ref = ref
   order by e.cuando asc;
$$;

revoke all on function public.seguimiento(uuid) from public;
grant execute on function public.seguimiento(uuid) to anon, authenticated;

comment on table cuadre.envio_estados is
  'Los saltos de estado de un envío, no su estado actual. El actual es el último. Guardar saltos hace normal el caso «dando y dando», donde los cuatro pasan a la vez, y deja las horas para poder medir los plazos.';
comment on function public.seguimiento(uuid) is
  'Lo único que la web puede leer del seguimiento. Hace falta la referencia del envío, que solo tiene quien lo hizo.';
