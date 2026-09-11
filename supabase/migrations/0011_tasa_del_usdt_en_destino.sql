-- Cuadre — la segunda tasa del negocio: a cuánto se vende el USDT en destino.
--
-- El operador compra USDT con la moneda de origen (eso ya vive en purchases) y
-- lo vende en destino a un precio de mercado que cambia todos los días: hoy 955
-- CUP por USDT, mañana 900. Sin este número la app no puede saber cuántos USDT
-- hace falta mover para entregar un monto, ni cuánto se ganó de verdad.
--
-- Es una serie histórica, no un valor único: cada fila es "a esta hora el USDT
-- valía esto". La vigente es la última de cada moneda.

create table public.usdt_market_rates (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete restrict,
  currency     text not null,
  -- Unidades de esa moneda por 1 USDT. 955 CUP/USDT · 1.08 USD/USDT.
  rate         numeric(18,8) not null check (rate > 0),
  note         text,
  recorded_at  timestamptz not null default now(),
  created_by   uuid references auth.users(id)
);
create index usdt_rates_actual_idx on public.usdt_market_rates (tenant_id, currency, recorded_at desc);

alter table public.usdt_market_rates enable row level security;
revoke all on public.usdt_market_rates from anon;

-- La escribe cualquiera del equipo, no solo el dueño: quien ve el precio de
-- mercado es el que está en el país de destino, no el que compra fuera.
create policy usdt_rates_select on public.usdt_market_rates
  for select to authenticated using (tenant_id = public.current_tenant_id());

create policy usdt_rates_insert on public.usdt_market_rates
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and created_by = auth.uid());

-- Es historia: no se corrige, se añade una fila nueva.
revoke update, delete on public.usdt_market_rates from authenticated;

-- Foto del precio al que se movió ESTA entrega. Igual que rate_applied y
-- commission_applied: si mañana cambia el mercado, lo de ayer no se reescribe.
alter table public.deliveries
  add column usdt_rate_used numeric(18,8) check (usdt_rate_used is null or usdt_rate_used > 0);

comment on column public.deliveries.usdt_rate_used is
  'Unidades de delivered_currency por 1 USDT en el momento de la entrega.';

-- La tasa vigente de cada moneda, lista para consultar de un tirón.
create view public.usdt_rates_current
with (security_invoker = true) as
select distinct on (tenant_id, currency)
       tenant_id, currency, rate, recorded_at, created_by
from public.usdt_market_rates
order by tenant_id, currency, recorded_at desc;

grant select on public.usdt_rates_current to authenticated;
