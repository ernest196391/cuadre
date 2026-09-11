-- Cuadre — pedir el cobro y marcarlo pagado.
--
-- Son dos funciones y no dos updates sueltos porque cada una toca dos tablas a
-- la vez: crear la solicitud tiene que apartar exactamente las comisiones que
-- entran en ella, en el mismo momento. Si se hiciera desde el navegador en dos
-- llamadas, una entrega registrada entremedias se quedaría colgando.
--
-- SECURITY DEFINER porque marcan filas de commission_entries, que para la app
-- es de solo lectura. Ambas vuelven a comprobar quién llama contra profiles:
-- no se fían del tenant_id que mande el cliente.

-- ── Pedir el cobro ──────────────────────────────────────────────────────────
create or replace function public.request_commission_payout(p_contact_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant  uuid;
  v_propio  uuid;
  v_dueno   boolean;
  v_total   numeric(18,2);
  v_payout  uuid;
begin
  select tenant_id, contact_id, role = 'owner'
    into v_tenant, v_propio, v_dueno
  from public.profiles where id = auth.uid() and active;

  if v_tenant is null then
    raise exception 'Tu usuario no pertenece a ningun operador activo.';
  end if;

  -- Cada quien pide lo suyo. El dueño puede pedir en nombre de cualquiera.
  if not v_dueno and p_contact_id is distinct from v_propio then
    raise exception 'Solo puedes pedir el cobro de tus propias comisiones.';
  end if;

  select coalesce(sum(amount_usd), 0) into v_total
  from public.commission_entries
  where tenant_id = v_tenant and contact_id = p_contact_id and payout_id is null;

  if v_total <= 0 then
    raise exception 'No hay comisiones pendientes de cobro.';
  end if;

  insert into public.commission_payouts (tenant_id, contact_id, amount_usd, requested_by)
  values (v_tenant, p_contact_id, v_total, auth.uid())
  returning id into v_payout;

  update public.commission_entries
     set payout_id = v_payout
   where tenant_id = v_tenant and contact_id = p_contact_id and payout_id is null;

  return v_payout;
end;
$$;

-- ── Marcarlo pagado ─────────────────────────────────────────────────────────
-- El monto y la moneda con que se pagó se anotan tal cual: a veces son USDT,
-- a veces una transferencia en CUP. La deuda se lleva en USD; cómo se saldó
-- es otra cosa y se guarda aparte.
create or replace function public.settle_commission_payout(
  p_payout_id uuid,
  p_method    text,
  p_currency  text,
  p_amount    numeric,
  p_note      text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid;
  v_filas  int;
begin
  select tenant_id into v_tenant
  from public.profiles where id = auth.uid() and active and role = 'owner';

  if v_tenant is null then
    raise exception 'Solo el dueño puede marcar una comision como pagada.';
  end if;

  update public.commission_payouts
     set status = 'paid',
         paid_method = nullif(btrim(p_method), ''),
         paid_currency = nullif(btrim(p_currency), ''),
         paid_amount = p_amount,
         note = nullif(btrim(p_note), ''),
         settled_at = now(),
         settled_by = auth.uid()
   where id = p_payout_id and tenant_id = v_tenant and status = 'requested';

  get diagnostics v_filas = row_count;
  if v_filas = 0 then
    raise exception 'Esa solicitud no existe o ya estaba resuelta.';
  end if;
end;
$$;

-- Postgres le da EXECUTE a PUBLIC en cada función nueva, y anon hereda de
-- PUBLIC: quitárselo solo a anon no basta.
revoke all on function public.request_commission_payout(uuid) from public, anon;
revoke all on function public.settle_commission_payout(uuid, text, text, numeric, text)
  from public, anon;
grant execute on function public.request_commission_payout(uuid) to authenticated;
grant execute on function public.settle_commission_payout(uuid, text, text, numeric, text)
  to authenticated;

-- ── Lo que cada quien tiene sin cobrar ──────────────────────────────────────
-- security_invoker para que la vista se lea con los permisos de quien la
-- consulta y siga respetando las políticas de commission_entries.
create view public.commission_pending
with (security_invoker = true) as
select tenant_id,
       contact_id,
       count(*)                                              as operaciones,
       sum(amount_usd)                                       as total_usd,
       sum(amount_usd) filter (where kind = 'delivery')       as por_entregar,
       sum(amount_usd) filter (where kind = 'origination')    as por_conseguir,
       min(created_at)                                        as desde
from public.commission_entries e
where payout_id is null
group by tenant_id, contact_id;

grant select on public.commission_pending to authenticated;
