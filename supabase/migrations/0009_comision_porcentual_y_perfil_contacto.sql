-- Cuadre — comisión porcentual y enlace perfil ↔ contacto.
--
-- La comisión real del primer operador no es un monto fijo por operación, es un
-- porcentaje: 3 USDT por cada 100 USD puestos en Cuba. El esquema solo sabía
-- guardar montos fijos, así que no cabía.
--
-- Se admiten las dos formas porque el producto se vende a varios operadores y
-- el monto fijo sigue siendo una manera legítima de pagarle a alguien.

alter table public.workers
  add column commission_kind text not null default 'fixed'
    check (commission_kind in ('fixed', 'percent')),
  add column commission_percent numeric(6,3) not null default 0
    check (commission_percent >= 0 and commission_percent <= 100),
  -- Sobre qué se aplica el porcentaje. Para "3 por cada 100 puestos en Cuba"
  -- la base natural son los USDT enviados: ya es una medida en dólares de lo
  -- que llegó allá, y está en la propia fila de la entrega, sin depender de
  -- convertir CUP a USD con una tasa que nadie fijó.
  add column commission_basis text not null default 'usdt_spent'
    check (commission_basis in ('usdt_spent', 'delivered_amount', 'source_amount'));

comment on column public.workers.commission_basis is
  'Base del porcentaje. usdt_spent = los USDT enviados a destino.';

-- deliveries.commission_applied ya guarda la foto del monto cobrado y
-- commission_currency su moneda, así que una comisión en USDT cabe sin tocar
-- nada más: lo que se cobró ayer no cambia si mañana sube el porcentaje.

-- Enlace que faltaba entre el usuario que entra y su ficha de contacto, para
-- que "atendida por" venga marcado solo en vez de elegirse en cada entrega.
alter table public.profiles
  add column contact_id uuid references public.contacts(id) on delete set null;

create index profiles_contact_idx on public.profiles (contact_id);
