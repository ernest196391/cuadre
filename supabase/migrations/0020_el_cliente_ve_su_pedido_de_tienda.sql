-- Lo que el cliente puede leer de su envío, ya sea remesa o pedido de tienda.
--
-- Antes el comprobante solo sabía buscar en `orders`: quien compraba comida o
-- un equipo no tenía dónde ver nada. La referencia de un pedido de tienda es
-- su propio `id`, que es el que viaja a Cuadre como `external_ref` y el que
-- lleva su seguimiento.
--
-- Aplicada al proyecto real (dkiiknsfbefpkrnmbzid) vía MCP. Comprobado contra
-- la base que el comprobante de un pedido de tienda NO devuelve el nombre del
-- destinatario, ni el del comprador, ni ningún teléfono.

-- ── El seguimiento, con el flujo y la nota pública ──────────────────────────
drop function if exists public.seguimiento(uuid);
create function public.seguimiento(ref uuid)
returns table (estado text, flujo text, nota_publica text, cuando timestamptz)
language sql
stable
security definer
set search_path = cuadre, public
as $$
  select e.estado, e.flujo, e.nota_publica, e.cuando
    from cuadre.envio_estados e
   where e.tracking_ref = ref
   order by e.cuando asc;
$$;

revoke all on function public.seguimiento(uuid) from public;
grant execute on function public.seguimiento(uuid) to anon, authenticated;

-- ── El comprobante, para los dos ────────────────────────────────────────────
-- Sigue saliendo lo justo: cuánto, de qué y cuándo. NO sale quién lo mandó, ni
-- su teléfono, ni a quién se le entrega. Esto se pasa por WhatsApp y acaba en
-- manos que nadie eligió; lo que no sale no se puede filtrar.
drop function if exists public.comprobante(uuid);
create function public.comprobante(ref uuid)
returns table (
  tipo       text,
  amount_gyd numeric,
  amount_cup numeric,
  method_key text,
  total_usd  numeric,
  categoria  text,
  creado     timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select 'remesa'::text, o.amount_gyd, o.amount_cup, o.method_key,
         null::numeric, null::text, o.created_at
    from public.orders o
   where o.tracking_ref = ref
  union all
  select 'tienda'::text, s.total_gyd, null::numeric, null::text,
         s.total_usd, s.category, s.created_at
    from public.store_orders s
   where s.id = ref
   limit 1;
$$;

revoke all on function public.comprobante(uuid) from public;
grant execute on function public.comprobante(uuid) to anon, authenticated;

comment on function public.comprobante(uuid) is
  'El envío visto por quien tiene su referencia, sea remesa o pedido de tienda. Sin nombres ni teléfonos de nadie: esto se comparte por WhatsApp.';
