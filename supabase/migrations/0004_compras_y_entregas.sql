-- Cuadre — el dinero: compras de USDT y entregas a clientes.

-- Pedidos que llegan desde la web del operador. El endpoint y sus claves se
-- construyen en la Etapa 3; la tabla existe desde ahora para que deliveries
-- pueda apuntarle sin cambiar el esquema después.
create table public.inbound_orders (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete restrict,
  external_ref  text,
  payload       jsonb not null,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz,
  unique (tenant_id, external_ref)
);

-- COMPRAS — entradas de USDT, en bloque.
--
-- usdt_received es LO QUE QUEDÓ EN LA WALLET, neto de cualquier fee que te
-- hayan descontado al recibir. Definirlo así deja una sola fórmula de costo,
-- sin ramas: si el fee se descontó en USDT ya está reflejado en lo que
-- tecleaste, y si lo pagaste aparte en moneda origen va en fee_source_amount.
create table public.purchases (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenants(id) on delete restrict,
  purchased_at         timestamptz not null default now(),

  source_amount        numeric(18,2) not null check (source_amount > 0),
  source_currency      text not null,
  fee_source_amount    numeric(18,2) not null default 0 check (fee_source_amount >= 0),
  usdt_received        numeric(18,8) not null check (usdt_received > 0),

  supplier_contact_id  uuid references public.contacts(id) on delete restrict,
  notes                text,

  -- Columna generada: Postgres la calcula, no existe formulario capaz de
  -- teclearla. El costo real por USDT no es un dato de entrada.
  cost_per_usdt        numeric(18,8) generated always as (
    case when usdt_received > 0
         then (source_amount + fee_source_amount) / usdt_received
    end
  ) stored,

  voided_at            timestamptz,
  voided_by            uuid references auth.users(id),
  void_reason          text,

  created_by           uuid references auth.users(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint anulacion_con_motivo check (
    (voided_at is null and voided_by is null and void_reason is null)
    or (voided_at is not null and voided_by is not null
        and void_reason is not null and length(btrim(void_reason)) > 0)
  )
);
create index purchases_tenant_fecha_idx on public.purchases (tenant_id, purchased_at desc);

-- ENTREGAS — salidas a clientes.
--
-- Se guardan el monto recibido y el monto entregado por separado, y la tasa
-- efectiva se deriva. Al revés (guardar uno y calcular el otro con la tasa)
-- se mete un redondeo entre lo que el cliente puso en la mano y lo que quedó
-- registrado, y esa diferencia reaparece en cada cierre de mes.
create table public.deliveries (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references public.tenants(id) on delete restrict,
  delivered_at            timestamptz not null default now(),

  source_amount_received  numeric(18,2) not null check (source_amount_received > 0),
  source_currency         text not null,

  delivered_amount        numeric(18,2) not null check (delivered_amount > 0),
  delivered_currency      text not null,

  method_id               uuid references public.delivery_methods(id) on delete restrict,
  -- Foto del momento: si negoció en un envío grande, aquí queda lo que
  -- realmente aplicó, no la tasa de lista.
  rate_applied            numeric(18,8) not null check (rate_applied > 0),

  usdt_spent              numeric(18,8) not null check (usdt_spent > 0),
  -- El fee de la wallet al enviar. Este es el que mueve el margen operación
  -- por operación, y por eso vive aquí y no en la compra.
  network_fee_usdt        numeric(18,8) not null default 0 check (network_fee_usdt >= 0),

  client_contact_id       uuid references public.contacts(id) on delete restrict,
  destination_account_id  uuid references public.destination_accounts(id) on delete restrict,

  handled_by_contact_id   uuid not null references public.contacts(id) on delete restrict,
  -- Foto del momento, igual que la tasa.
  commission_applied      numeric(18,2) not null default 0 check (commission_applied >= 0),
  commission_currency     text,

  courier_contact_id      uuid references public.contacts(id) on delete restrict,
  courier_fee             numeric(18,2) not null default 0 check (courier_fee >= 0),
  courier_fee_currency    text,

  inbound_order_id        uuid references public.inbound_orders(id) on delete restrict,
  notes                   text,

  effective_rate          numeric(18,8) generated always as (
    case when source_amount_received > 0
         then delivered_amount / source_amount_received
    end
  ) stored,

  voided_at               timestamptz,
  voided_by               uuid references auth.users(id),
  void_reason             text,

  created_by              uuid references auth.users(id),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint anulacion_con_motivo check (
    (voided_at is null and voided_by is null and void_reason is null)
    or (voided_at is not null and voided_by is not null
        and void_reason is not null and length(btrim(void_reason)) > 0)
  )
);
create index deliveries_tenant_fecha_idx on public.deliveries (tenant_id, delivered_at desc);
create index deliveries_cliente_idx on public.deliveries (client_contact_id, delivered_at desc);
create index deliveries_metodo_idx on public.deliveries (method_id, delivered_at desc);
create index deliveries_responsable_idx on public.deliveries (handled_by_contact_id, delivered_at desc);

create trigger purchases_touch  before update on public.purchases  for each row execute function public.touch_updated_at();
create trigger deliveries_touch before update on public.deliveries for each row execute function public.touch_updated_at();
