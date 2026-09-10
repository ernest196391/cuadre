-- Cuadre — seguridad.
--
-- Regla de la casa: sin sesión no se lee nada. anon no aparece en el `to` de
-- ninguna política y además se le revocan los permisos que Supabase le concede
-- por defecto, así que un usuario no autenticado no obtiene "cero filas":
-- obtiene permiso denegado.

revoke all on all tables    in schema public from anon;
revoke all on all routines  in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on routines  from anon;
alter default privileges in schema public revoke all on sequences from anon;

alter table public.tenants                      enable row level security;
alter table public.profiles                     enable row level security;
alter table public.contacts                     enable row level security;
alter table public.contact_roles                enable row level security;
alter table public.workers                      enable row level security;
alter table public.destination_accounts         enable row level security;
alter table public.pan_reveals                  enable row level security;
alter table public.delivery_methods             enable row level security;
alter table public.delivery_method_rate_history enable row level security;
alter table public.purchases                    enable row level security;
alter table public.deliveries                   enable row level security;
alter table public.inbound_orders               enable row level security;

-- ---------- operador y usuarios ----------

create policy tenants_select on public.tenants
  for select to authenticated using (id = public.current_tenant_id());

create policy tenants_update on public.tenants
  for update to authenticated
  using (id = public.current_tenant_id() and public.is_owner())
  with check (id = public.current_tenant_id());

create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or tenant_id = public.current_tenant_id());

-- ---------- contactos ----------

create policy contacts_select on public.contacts
  for select to authenticated using (tenant_id = public.current_tenant_id());

create policy contacts_insert on public.contacts
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and created_by = auth.uid());

create policy contacts_update on public.contacts
  for update to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

create policy contact_roles_all on public.contact_roles
  for all to authenticated
  using (exists (
    select 1 from public.contacts c
    where c.id = contact_roles.contact_id and c.tenant_id = public.current_tenant_id()))
  with check (exists (
    select 1 from public.contacts c
    where c.id = contact_roles.contact_id and c.tenant_id = public.current_tenant_id()));

-- ---------- trabajadores ----------
-- Todos ven las comisiones; solo el dueño las fija.

create policy workers_select on public.workers
  for select to authenticated using (tenant_id = public.current_tenant_id());

create policy workers_insert on public.workers
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.is_owner());

create policy workers_update on public.workers
  for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_owner())
  with check (tenant_id = public.current_tenant_id());

-- ---------- métodos y tasas ----------

create policy delivery_methods_select on public.delivery_methods
  for select to authenticated using (tenant_id = public.current_tenant_id());

create policy delivery_methods_insert on public.delivery_methods
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.is_owner());

create policy delivery_methods_update on public.delivery_methods
  for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_owner())
  with check (tenant_id = public.current_tenant_id());

create policy rate_history_select on public.delivery_method_rate_history
  for select to authenticated using (tenant_id = public.current_tenant_id());

create policy rate_history_insert on public.delivery_method_rate_history
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.is_owner());

-- ---------- compras y entregas ----------
-- Ambos roles registran y consultan. Solo el dueño anula, y una vez anulada la
-- fila queda fuera del `using` del update: nadie la vuelve a tocar.

create policy purchases_select on public.purchases
  for select to authenticated using (tenant_id = public.current_tenant_id());

create policy purchases_insert on public.purchases
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and created_by = auth.uid());

create policy purchases_update on public.purchases
  for update to authenticated
  using (tenant_id = public.current_tenant_id() and voided_at is null)
  with check (tenant_id = public.current_tenant_id()
              and (voided_at is null or public.is_owner()));

create policy deliveries_select on public.deliveries
  for select to authenticated using (tenant_id = public.current_tenant_id());

create policy deliveries_insert on public.deliveries
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and created_by = auth.uid());

create policy deliveries_update on public.deliveries
  for update to authenticated
  using (tenant_id = public.current_tenant_id() and voided_at is null)
  with check (tenant_id = public.current_tenant_id()
              and (voided_at is null or public.is_owner()));

create policy inbound_orders_select on public.inbound_orders
  for select to authenticated using (tenant_id = public.current_tenant_id());

-- Ninguna tabla de dinero tiene política de DELETE. Corregir es anular con
-- motivo; un registro financiero que se puede borrar sin rastro no es un
-- registro. Se revoca además el privilegio, por si algún día alguien añade
-- una política sin pensarlo dos veces.
revoke delete on public.purchases, public.deliveries,
                 public.delivery_method_rate_history, public.pan_reveals
  from authenticated;

-- ---------- tarjetas ----------
-- La tabla base no es legible por el navegador ni siquiera CON sesión: se le
-- conceden solo las columnas seguras, y las cifradas quedan fuera de su
-- alcance. Cifrar bien y dejar el texto cifrado al alcance del cliente sería
-- cifrar para nada.

revoke all on public.destination_accounts from anon, authenticated;

grant select (id, tenant_id, contact_id, alias, holder_name, bank,
              account_type, pan_last4, active, created_at, updated_at)
  on public.destination_accounts to authenticated;

grant select on public.destination_accounts_safe to authenticated;

create policy destination_accounts_select on public.destination_accounts
  for select to authenticated using (tenant_id = public.current_tenant_id());

-- La bitácora la lee solo el dueño. Con dos personas capaces de revelar un
-- número, este registro es el único control que queda.
create policy pan_reveals_select on public.pan_reveals
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_owner());
