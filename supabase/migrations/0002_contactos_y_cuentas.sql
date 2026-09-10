-- Cuadre — personas y cuentas de destino.

create table public.contacts (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete restrict,
  full_name   text not null check (length(btrim(full_name)) > 0),
  phone       text,
  notes       text,
  active      boolean not null default true,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index contacts_tenant_name_idx on public.contacts (tenant_id, full_name);
create index contacts_tenant_phone_idx on public.contacts (tenant_id, phone);

-- Un contacto puede ser varias cosas a la vez: el mismo primo que recibe
-- remesas puede hacerte de mensajero. Por eso es tabla y no una columna.
create table public.contact_roles (
  contact_id  uuid not null references public.contacts(id) on delete cascade,
  role        text not null check (role in ('client', 'usdt_supplier', 'courier', 'worker')),
  primary key (contact_id, role)
);

-- La comisión vigente del trabajador. Lo que se cobró en una entrega concreta
-- se congela en deliveries.commission_applied: subir la comisión mañana no
-- puede reescribir la ganancia de ayer.
create table public.workers (
  contact_id                uuid primary key references public.contacts(id) on delete restrict,
  tenant_id                 uuid not null references public.tenants(id) on delete restrict,
  commission_per_operation  numeric(18,2) not null default 0 check (commission_per_operation >= 0),
  commission_currency       text not null,
  active                    boolean not null default true,
  updated_by                uuid references auth.users(id),
  updated_at                timestamptz not null default now()
);
create index workers_tenant_idx on public.workers (tenant_id);

-- Cuentas de destino. El número de tarjeta se guarda completo pero CIFRADO;
-- pan_encrypted es AES-256-GCM hecho en el servidor, con el formato
-- iv(12) || tag(16) || ciphertext. La clave vive solo en el entorno del
-- servidor y nunca entra aquí. pan_last4 va en claro a propósito: es lo único
-- que necesitan las listas, así no hay que descifrar nada para pintar pantalla.
create table public.destination_accounts (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete restrict,
  contact_id     uuid not null references public.contacts(id) on delete restrict,
  alias          text not null check (length(btrim(alias)) > 0),
  holder_name    text,
  bank           text,
  account_type   text not null default 'card' check (account_type in ('card', 'bank_account', 'cash')),
  pan_last4      text check (pan_last4 ~ '^[0-9]{4}$'),
  pan_encrypted  bytea,
  key_version    smallint not null default 1,
  active         boolean not null default true,
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- Una tarjeta sin número cifrado no sirve para nada, y un número sin
  -- últimos 4 obligaría a descifrar para pintar una lista.
  constraint tarjeta_completa check (
    account_type <> 'card'
    or (pan_encrypted is not null and pan_last4 is not null)
  )
);
create index destination_accounts_contact_idx on public.destination_accounts (contact_id);
create index destination_accounts_tenant_idx on public.destination_accounts (tenant_id);

-- Lo único que el navegador puede leer de las cuentas. security_invoker para
-- que la RLS de la tabla base siga aplicando al usuario que consulta.
create view public.destination_accounts_safe
with (security_invoker = true) as
select id, tenant_id, contact_id, alias, holder_name, bank, account_type,
       pan_last4, active, created_at, updated_at
from public.destination_accounts;

-- Bitácora de revelaciones. Solo se inserta: no hay política de update ni de
-- delete en ninguna parte. Con dos personas capaces de ver un número completo,
-- esto deja de ser un extra y pasa a ser la única forma de saber quién lo vio.
create table public.pan_reveals (
  id                      bigint generated always as identity primary key,
  tenant_id               uuid not null references public.tenants(id) on delete restrict,
  destination_account_id  uuid not null references public.destination_accounts(id) on delete restrict,
  revealed_by             uuid not null references auth.users(id),
  revealed_at             timestamptz not null default now(),
  ip                      text,
  user_agent              text
);
create index pan_reveals_tenant_idx on public.pan_reveals (tenant_id, revealed_at desc);
create index pan_reveals_account_idx on public.pan_reveals (destination_account_id, revealed_at desc);

create trigger contacts_touch before update on public.contacts for each row execute function public.touch_updated_at();
create trigger workers_touch  before update on public.workers  for each row execute function public.touch_updated_at();
create trigger destination_accounts_touch before update on public.destination_accounts for each row execute function public.touch_updated_at();
