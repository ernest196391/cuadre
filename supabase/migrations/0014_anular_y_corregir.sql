-- Cuadre — anular lo que se registró mal, y corregir lo que sí se puede.
--
-- CRITERIO: en un libro de cuentas no se borra ni se reescribe, se anula y se
-- vuelve a apuntar. Por eso no hay "editar entrega": queda la anulada, con su
-- motivo y su firma, y al lado la buena. Si se pudiera editar el monto de
-- ayer, el resumen del mes pasado cambiaría solo y nadie sabría por qué.
--
-- LO QUE SÍ SE CORRIGE EN SITIO: los datos de una persona o el alias de una
-- tarjeta. No son hechos contables, son etiquetas.
--
-- EL NÚMERO DE TARJETA NO SE EDITA. Una entrega pasada apunta a la cuenta con
-- la que se hizo; cambiarle el número reescribiría a dónde se mandó aquel
-- dinero. Si entró mal, se da de baja y se añade la correcta.

-- ── Anular una entrega ──────────────────────────────────────────────────────
-- Devuelve la comisión que generó, si todavía no se ha cobrado. Sin esto,
-- anular dejaba el apunte en pie y alguien cobraba por un envío que no existe.
create or replace function public.void_delivery(p_delivery_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant   uuid;
  v_cobradas int;
  v_filas    int;
begin
  select tenant_id into v_tenant
  from public.profiles where id = auth.uid() and active and role = 'owner';

  if v_tenant is null then
    raise exception 'Solo el dueño puede anular una entrega.';
  end if;

  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Escribe por qué la anulas.';
  end if;

  -- Si la comisión ya entró en un cobro, esto deja de ser una corrección y
  -- pasa a ser dinero que cambió de manos. Se para aquí a propósito.
  select count(*) into v_cobradas
  from public.commission_entries
  where delivery_id = p_delivery_id and tenant_id = v_tenant and payout_id is not null;

  if v_cobradas > 0 then
    raise exception 'No se puede anular: su comisión ya entró en un cobro. Ajústalo con el trabajador.';
  end if;

  delete from public.commission_entries
  where delivery_id = p_delivery_id and tenant_id = v_tenant;

  update public.deliveries
     set voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason)
   where id = p_delivery_id and tenant_id = v_tenant and voided_at is null;

  get diagnostics v_filas = row_count;
  if v_filas = 0 then
    raise exception 'Esa entrega no existe o ya estaba anulada.';
  end if;
end;
$$;

-- ── Anular una compra ───────────────────────────────────────────────────────
create or replace function public.void_purchase(p_purchase_id uuid, p_reason text)
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
    raise exception 'Solo el dueño puede anular una compra.';
  end if;

  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Escribe por qué la anulas.';
  end if;

  update public.purchases
     set voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason)
   where id = p_purchase_id and tenant_id = v_tenant and voided_at is null;

  get diagnostics v_filas = row_count;
  if v_filas = 0 then
    raise exception 'Esa compra no existe o ya estaba anulada.';
  end if;
end;
$$;

-- Postgres da EXECUTE a PUBLIC en cada función nueva y anon hereda de PUBLIC.
revoke all on function public.void_delivery(uuid, text) from public, anon;
revoke all on function public.void_purchase(uuid, text) from public, anon;
grant execute on function public.void_delivery(uuid, text) to authenticated;
grant execute on function public.void_purchase(uuid, text) to authenticated;

-- Anular pasa por la función y solo por ahí: si se pudiera tocar voided_at con
-- un update suelto, se anularía la entrega dejando viva su comisión.
--
-- Se revoca la tabla entera, no esas tres columnas: revocar por columna no
-- hace nada mientras haya un GRANT de tabla completa por encima. Para la app
-- las entregas y las compras solo se añaden; anular es cosa de la función, que
-- al ser security definer no necesita este permiso.
revoke update on public.deliveries from authenticated;
revoke update on public.purchases  from authenticated;

-- ── Corregir una tarjeta (sin tocar el número) ──────────────────────────────
create policy destination_accounts_update on public.destination_accounts
  for update to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- Solo las etiquetas y la baja. pan_encrypted y pan_last4 se quedan fuera: el
-- número solo lo escribe el servidor, al crearla, y nadie lo reescribe después.
grant update (alias, holder_name, bank, active, updated_at)
  on public.destination_accounts to authenticated;

-- ── Marcar procesado un pedido de la web ────────────────────────────────────
create policy inbound_orders_update on public.inbound_orders
  for update to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- El pedido que mandó la web es un hecho: solo se marca atendido, no se edita.
revoke update on public.inbound_orders from authenticated;
grant update (processed_at) on public.inbound_orders to authenticated;
