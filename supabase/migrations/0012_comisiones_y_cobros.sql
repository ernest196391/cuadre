-- Cuadre — comisiones y cobros. Ver 0013 para las funciones de pedir y pagar.
--
-- BASE DE CÁLCULO: el valor de lo entregado expresado en USD. Es la regla que
-- el negocio usa de verdad: 3 USD por cada 100 USD puestos en destino. Sobre
-- los USDT movidos daría 2,78 y no cuadraría con lo que se paga.
--
-- DOS COMISIONES: una por entregar y otra por conseguir al cliente. No siempre
-- las cobra la misma persona, y a veces el que consigue no entrega.
--
-- DOS NIVELES: el operador fija un porcentaje para todos y puede sobrescribirlo
-- persona por persona. NULL en el trabajador = hereda el del operador. Ojo con
-- la diferencia: NULL es "hereda", 0 es "esta persona no cobra". Son cosas
-- distintas, y por eso la columna admite nulos en vez de tener default 0.

-- ── El porcentaje del equipo ────────────────────────────────────────────────
alter table public.tenants
  add column commission_delivery_pct numeric(6,3) not null default 0
    check (commission_delivery_pct >= 0 and commission_delivery_pct <= 100),
  add column commission_origination_pct numeric(6,3) not null default 0
    check (commission_origination_pct >= 0 and commission_origination_pct <= 100);

comment on column public.tenants.commission_delivery_pct is
  'Porcentaje por defecto para quien entrega, sobre el valor en USD.';
comment on column public.tenants.commission_origination_pct is
  'Porcentaje por defecto para quien consigue al cliente, sobre el valor en USD.';

-- ── El porcentaje de cada persona, si tiene trato aparte ────────────────────
alter table public.workers
  add column delivery_pct numeric(6,3)
    check (delivery_pct is null or (delivery_pct >= 0 and delivery_pct <= 100)),
  add column origination_pct numeric(6,3)
    check (origination_pct is null or (origination_pct >= 0 and origination_pct <= 100));

comment on column public.workers.delivery_pct is
  'NULL = hereda el del operador. 0 = esta persona no cobra por entregar.';
comment on column public.workers.origination_pct is
  'NULL = hereda el del operador. 0 = esta persona no cobra por conseguir.';

-- ── Quién consiguió al cliente, y cuánto valía la entrega en USD ────────────
-- El que entrega y el que consigue pueden ser personas distintas. Y usd_value
-- es una foto: se calcula al registrar, con la tasa de ese momento, porque
-- mañana el USDT vale otra cosa y lo de ayer no se reescribe.
alter table public.deliveries
  add column origin_contact_id uuid references public.contacts(id) on delete restrict,
  add column usd_value numeric(18,2) check (usd_value is null or usd_value >= 0);

comment on column public.deliveries.origin_contact_id is
  'Quién consiguió al cliente. Puede ser distinto de quien entregó.';
comment on column public.deliveries.usd_value is
  'Valor de lo entregado en USD al momento de registrar. Base de la comisión.';

-- ── Lo que se ha ganado, operación por operación ────────────────────────────
-- Una fila por entrega y tipo. pct_applied y amount_usd son fotos: cambiar el
-- porcentaje hoy no reescribe lo que ya se devengó ayer.
create table public.commission_entries (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete restrict,
  delivery_id  uuid not null references public.deliveries(id) on delete restrict,
  contact_id   uuid not null references public.contacts(id) on delete restrict,
  kind         text not null check (kind in ('delivery', 'origination')),
  pct_applied  numeric(6,3) not null check (pct_applied >= 0),
  amount_usd   numeric(18,2) not null check (amount_usd >= 0),
  payout_id    uuid,
  created_at   timestamptz not null default now(),
  unique (delivery_id, kind)
);

-- ── Las solicitudes de cobro ────────────────────────────────────────────────
-- El trabajador pide, el dueño paga y anota cómo. La forma de pago es libre
-- (USDT, transferencia, efectivo) porque en la práctica cambia cada vez.
create table public.commission_payouts (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete restrict,
  contact_id     uuid not null references public.contacts(id) on delete restrict,
  status         text not null default 'requested'
                   check (status in ('requested', 'paid', 'cancelled')),
  amount_usd     numeric(18,2) not null check (amount_usd >= 0),
  paid_method    text,
  paid_currency  text,
  paid_amount    numeric(18,2) check (paid_amount is null or paid_amount >= 0),
  note           text,
  requested_at   timestamptz not null default now(),
  requested_by   uuid references auth.users(id),
  settled_at     timestamptz,
  settled_by     uuid references auth.users(id)
);

alter table public.commission_entries
  add constraint commission_entries_payout_fk
  foreign key (payout_id) references public.commission_payouts(id) on delete set null;

create index commission_pendientes_idx
  on public.commission_entries (tenant_id, contact_id, payout_id);
create index payouts_tenant_idx
  on public.commission_payouts (tenant_id, status, requested_at desc);

-- ── Permisos ────────────────────────────────────────────────────────────────
alter table public.commission_entries enable row level security;
alter table public.commission_payouts enable row level security;
revoke all on public.commission_entries from anon;
revoke all on public.commission_payouts from anon;

-- Todo el equipo ve las comisiones: el trabajador tiene que poder comprobar lo
-- suyo sin pedírselo a nadie.
create policy commission_entries_select on public.commission_entries
  for select to authenticated using (tenant_id = public.current_tenant_id());

create policy commission_entries_insert on public.commission_entries
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id());

-- Lo devengado no se edita ni se borra desde la app: es el registro de lo que
-- se ganó. Si una entrega se anula, se corrige por el lado de la entrega.
revoke update, delete on public.commission_entries from authenticated;

create policy payouts_select on public.commission_payouts
  for select to authenticated using (tenant_id = public.current_tenant_id());

create policy payouts_insert on public.commission_payouts
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and status = 'requested');

-- Solo el dueño resuelve, y solo lo que sigue abierto: una vez pagada, la
-- solicitud no se vuelve a tocar.
create policy payouts_update on public.commission_payouts
  for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_owner() and status = 'requested')
  with check (tenant_id = public.current_tenant_id());

revoke delete on public.commission_payouts from authenticated;
