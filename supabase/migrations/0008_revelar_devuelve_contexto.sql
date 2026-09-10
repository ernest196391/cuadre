-- Cuadre — la revelación devuelve también el contexto de la fila.
--
-- El texto cifrado está atado a (tenant_id, contact_id) por los datos asociados
-- de GCM, así que para poder descifrarlo hay que devolverlos junto con el blob.

drop function if exists public.reveal_destination_account_pan(uuid, uuid, text, text);

create or replace function public.reveal_destination_account_pan(
  p_actor uuid, p_account_id uuid, p_ip text default null, p_user_agent text default null
)
returns table (pan_encrypted bytea, key_version smallint, tenant_id uuid, contact_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid;
begin
  select p.tenant_id into v_tenant from public.profiles p where p.id = p_actor and p.active;
  if v_tenant is null then
    raise exception 'El usuario no pertenece a ningun operador activo.';
  end if;

  -- El registro va ANTES de entregar el dato: si no se puede dejar constancia
  -- de quién lo vio, no se entrega. Una auditoría que se puede saltar no sirve.
  insert into public.pan_reveals (tenant_id, destination_account_id, revealed_by, ip, user_agent)
  select da.tenant_id, da.id, p_actor, p_ip, p_user_agent
  from public.destination_accounts da
  where da.id = p_account_id and da.tenant_id = v_tenant and da.pan_encrypted is not null;

  if not found then
    raise exception 'Cuenta no encontrada o sin numero guardado.';
  end if;

  return query
    select da.pan_encrypted, da.key_version, da.tenant_id, da.contact_id
    from public.destination_accounts da
    where da.id = p_account_id and da.tenant_id = v_tenant;
end;
$$;

revoke all on function public.reveal_destination_account_pan(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.reveal_destination_account_pan(uuid, uuid, text, text)
  to service_role;
