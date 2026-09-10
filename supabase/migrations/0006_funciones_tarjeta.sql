-- Cuadre — el camino del número de tarjeta.
--
-- Estas dos funciones son el ÚNICO camino de entrada y de salida del número
-- completo. Se ejecutan como dueño (security definer) y solo el service_role
-- puede llamarlas, así que solo una ruta de servidor de la app llega hasta
-- aquí: el navegador no puede invocarlas ni aunque tenga sesión válida.
--
-- El cifrado y el descifrado ocurren en Node, fuera de la base. Postgres nunca
-- ve el número en claro ni la clave.

create or replace function public.create_destination_account(
  p_actor          uuid,
  p_contact_id     uuid,
  p_alias          text,
  p_holder_name    text,
  p_bank           text,
  p_account_type   text,
  p_pan_last4      text,
  p_pan_encrypted  bytea
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid;
  v_id     uuid;
begin
  select tenant_id into v_tenant
  from public.profiles where id = p_actor and active;

  if v_tenant is null then
    raise exception 'El usuario no pertenece a ningún operador activo.';
  end if;

  if not exists (
    select 1 from public.contacts
    where id = p_contact_id and tenant_id = v_tenant
  ) then
    raise exception 'Contacto no encontrado.';
  end if;

  insert into public.destination_accounts (
    tenant_id, contact_id, alias, holder_name, bank,
    account_type, pan_last4, pan_encrypted, created_by
  ) values (
    v_tenant, p_contact_id, p_alias, nullif(btrim(p_holder_name), ''), nullif(btrim(p_bank), ''),
    coalesce(nullif(p_account_type, ''), 'card'), p_pan_last4, p_pan_encrypted, p_actor
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- Devuelve el texto cifrado y deja constancia. El insert en la bitácora va
-- ANTES del return a propósito: si no se puede registrar quién lo vio, no se
-- entrega el número. Un registro de auditoría que se puede saltar no sirve.
create or replace function public.reveal_destination_account_pan(
  p_actor       uuid,
  p_account_id  uuid,
  p_ip          text default null,
  p_user_agent  text default null
)
returns table (pan_encrypted bytea, key_version smallint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid;
begin
  select tenant_id into v_tenant
  from public.profiles where id = p_actor and active;

  if v_tenant is null then
    raise exception 'El usuario no pertenece a ningún operador activo.';
  end if;

  insert into public.pan_reveals (tenant_id, destination_account_id, revealed_by, ip, user_agent)
  select da.tenant_id, da.id, p_actor, p_ip, p_user_agent
  from public.destination_accounts da
  where da.id = p_account_id
    and da.tenant_id = v_tenant
    and da.pan_encrypted is not null;

  if not found then
    raise exception 'Cuenta no encontrada o sin número guardado.';
  end if;

  return query
    select da.pan_encrypted, da.key_version
    from public.destination_accounts da
    where da.id = p_account_id and da.tenant_id = v_tenant;
end;
$$;

revoke all on function public.create_destination_account(uuid, uuid, text, text, text, text, text, bytea)
  from public, anon, authenticated;
revoke all on function public.reveal_destination_account_pan(uuid, uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.create_destination_account(uuid, uuid, text, text, text, text, text, bytea)
  to service_role;
grant execute on function public.reveal_destination_account_pan(uuid, uuid, text, text)
  to service_role;
