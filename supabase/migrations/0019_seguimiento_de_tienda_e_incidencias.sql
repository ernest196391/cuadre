-- EL SEGUIMIENTO, COMPLETO: TIENDA E INCIDENCIAS
--
-- Hasta ahora `envio_estados` solo sabía contar una remesa. Un pedido de la
-- tienda no pasa por Guyana ni se «entrega en Cuba» de la misma manera: se
-- cobra, se le compra al proveedor, se prepara, sale y llega. Meterlo por los
-- pasos de la remesa sería contarle al cliente algo que no está pasando.
--
-- Y faltaba la otra mitad de un seguimiento de verdad: lo que sale mal. Un
-- retraso, una sustitución o una cancelación no son un paso hacia adelante;
-- son otra cosa, y el Blueprint (§7.1) las pide aparte.
--
-- Aplicada al proyecto real (dkiiknsfbefpkrnmbzid) vía MCP y comprobada dentro
-- de una transacción que se deshace: los pasos de cada flujo valen en el suyo,
-- NO en el otro, las incidencias valen en los dos, un estado inventado no
-- entra, y la función pública devuelve el flujo y la nota pública pero nunca
-- la interna. Toca los dos esquemas: vive en los dos repositorios.

-- ── 1. De qué flujo es cada salto ───────────────────────────────────────────
alter table cuadre.envio_estados
  add column if not exists flujo text not null default 'remesa';

-- ── 2. Las notas: lo que ve el cliente y lo que no ──────────────────────────
-- §7.6 pide nota pública y nota interna separadas. Tenerlas en un solo campo
-- obliga a elegir entre no escribir nada operativo o escribírselo al cliente.
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema='cuadre' and table_name='envio_estados' and column_name='nota')
     and not exists (select 1 from information_schema.columns
              where table_schema='cuadre' and table_name='envio_estados' and column_name='nota_publica')
  then
    alter table cuadre.envio_estados rename column nota to nota_publica;
  end if;
end $$;

alter table cuadre.envio_estados
  add column if not exists nota_interna text;

-- ── 3. Qué estados existen, y cuáles valen para cada flujo ──────────────────
-- La comprobación va en la base y no solo en la app: un «recibido en Guyana»
-- colgado de un pedido de comida no tiene arreglo posterior, y la app no es
-- el único sitio desde el que se puede escribir aquí.
alter table cuadre.envio_estados drop constraint if exists envio_estados_estado_check;
alter table cuadre.envio_estados drop constraint if exists envio_estados_estado_valido;
alter table cuadre.envio_estados add constraint envio_estados_estado_valido check (
  flujo in ('remesa', 'tienda')
  and (
    -- Incidencias: valen en los dos flujos, y no avanzan nada.
    estado in ('requiere_info', 'sustitucion_pendiente', 'retrasado', 'cancelado', 'reembolsado')
    -- El primero y el último son comunes: todo empieza con un pedido y
    -- termina, si va bien, entregado.
    or estado in ('pedido_recibido', 'entregado')
    or (flujo = 'remesa' and estado in ('recibido_en_guyana', 'listo_en_cuba'))
    or (flujo = 'tienda' and estado in ('pago_confirmado', 'comprando', 'preparado', 'en_camino'))
  )
);

-- ── 4. El primer paso sabe de qué flujo es ──────────────────────────────────
create or replace function cuadre.marcar_pedido_recibido()
returns trigger language plpgsql security definer set search_path = cuadre as $$
declare
  ref uuid;
  cual text;
begin
  begin
    ref := (new.payload ->> 'external_ref')::uuid;
  exception when others then
    return new;  -- Referencia con otra forma: no se inventa un seguimiento.
  end;
  if ref is null then return new; end if;

  -- La web manda `tipo` en el pedido. Si no viene, es una remesa: es lo que
  -- había antes de que existiera la tienda y lo que sigue llegando así.
  cual := case when (new.payload ->> 'tipo') = 'tienda' then 'tienda' else 'remesa' end;

  insert into cuadre.envio_estados (tenant_id, tracking_ref, estado, flujo, nota_publica)
  values (new.tenant_id, ref, 'pedido_recibido', cual, 'Entró por la web');
  return new;
end $$;

comment on column cuadre.envio_estados.flujo is
  'De qué cadena es este salto. Una remesa y un pedido de tienda no pasan por los mismos sitios, y contarlos con los mismos pasos sería mentirle al cliente.';
comment on column cuadre.envio_estados.nota_interna is
  'Lo que NO ve el cliente. Separada de nota_publica a propósito: con un solo campo hay que elegir entre no anotar nada operativo o contárselo todo a quien compró.';
