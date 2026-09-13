-- Lo que Cuadre necesita saber del cliente de la web, y nada más.
--
-- Quien atiende una entrega tiene que poder ver dos cosas: si esa persona está
-- verificada —porque de eso depende si se le adelanta el dinero en Cuba— y a
-- quién hay que entregárselo. El carnet NO: para mirarlo hay que entrar al
-- panel, donde queda escrito quién lo abrió.
--
-- Va como función y no como vista porque las dos tablas viven en `public` con
-- políticas pensadas para el cliente (cada quien lo suyo). Un operador de
-- Cuadre no es ninguno de esos clientes; es otra puerta, y se abre aquí, con
-- su propia comprobación.
--
-- Aplicada al proyecto real (dkiiknsfbefpkrnmbzid) vía MCP. Comprobada dentro
-- de una transacción que se deshace: un operador de Cuadre ve al cliente, su
-- nivel, su crédito y a su familiar; alguien con sesión que no trabaja en
-- Cuadre recibe un 42501; y una referencia desconocida no devuelve nada en vez
-- de inventarlo. Toca los dos esquemas: vive en los dos repositorios.
create or replace function cuadre.cliente_de_la_web(ref uuid)
returns table (
  nombre        text,
  telefono      text,
  nivel         text,
  credito_usd   numeric,
  benef_nombre  text,
  benef_telefono text,
  benef_provincia text,
  benef_municipio text,
  benef_zona    text,
  benef_direccion text,
  benef_referencia text
)
language plpgsql
stable
security definer
set search_path = cuadre, public
as $$
begin
  -- Solo quien trabaja en Cuadre. Sin esto, una función con definer sería una
  -- puerta abierta a los datos de todos los clientes para cualquiera con
  -- sesión en cualquiera de las dos webs.
  if not exists (select 1 from cuadre.profiles p where p.id = auth.uid() and p.active) then
    raise exception 'Solo el equipo de Cuadre puede consultar esto.'
      using errcode = '42501';
  end if;

  return query
  select p.full_name, p.phone, p.nivel, p.credito_usd,
         b.full_name, b.phone, b.provincia, b.municipio, b.zona, b.direccion, b.referencia
    from public.orders o
    join public.customer_profiles p on p.id = o.customer_id
    -- El familiar más reciente que haya puesto. Si no puso ninguno, el cliente
    -- sale igual: saber que está verificado ya sirve para algo.
    left join lateral (
      select * from public.customer_beneficiaries cb
       where cb.customer_id = p.id
       order by cb.created_at desc
       limit 1
    ) b on true
   where o.tracking_ref = ref
   limit 1;
end $$;

revoke all on function cuadre.cliente_de_la_web(uuid) from public;
grant execute on function cuadre.cliente_de_la_web(uuid) to authenticated;

comment on function cuadre.cliente_de_la_web(uuid) is
  'Si el pedido lo hizo alguien con cuenta: cómo se llama, si está verificado, cuánto se le puede adelantar y a quién hay que entregarle. El carnet no sale por aquí: eso se mira en el panel, y queda registrado.';
