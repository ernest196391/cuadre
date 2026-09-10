-- Cuadre — cerrar la ejecución pública de funciones.
--
-- Postgres concede EXECUTE a PUBLIC en toda función nueva, y anon hereda de
-- PUBLIC. Revocarle a anon directamente no sirve de nada mientras PUBLIC siga
-- teniendo el permiso: hay que quitarlo de la raíz y volver a concederlo solo
-- a quien lo necesita. (Lo detectó el linter de seguridad de Supabase; el
-- `revoke ... from anon` de la migración anterior no bastaba.)

revoke execute on function public.current_tenant_id() from public, anon;
revoke execute on function public.is_owner()          from public, anon;
revoke execute on function public.update_method_rate(uuid, numeric) from public, anon;
revoke execute on function public.touch_updated_at()  from public, anon;

-- authenticated sí las necesita: las políticas RLS las llaman durante la
-- evaluación, con los privilegios del que consulta.
grant execute on function public.current_tenant_id() to authenticated;
grant execute on function public.is_owner()          to authenticated;
grant execute on function public.update_method_rate(uuid, numeric) to authenticated;

-- search_path fijo también en la función de trigger.
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin new.updated_at = now(); return new; end;
$$;
revoke execute on function public.touch_updated_at() from public, anon;

-- Y que las próximas funciones no nazcan abiertas a PUBLIC.
alter default privileges in schema public revoke execute on routines from public;
