-- ============================================================
-- 0004 — Activation RLS et politiques complètes
-- CORRIGÉ après tests : pour une policy "FOR ALL", seule la clause
-- WITH CHECK est évaluée sur INSERT (USING ne compte que pour SELECT/
-- UPDATE/DELETE). Toute policy combinant rôle + tenant DOIT donc répéter
-- la même condition dans USING **et** WITH CHECK, sinon la restriction de
-- rôle est silencieusement ignorée à l'insertion.
-- ============================================================

alter table companies           enable row level security;
alter table agencies            enable row level security;
alter table profiles            enable row level security;
alter table invitations         enable row level security;
alter table vehicle_categories  enable row level security;
alter table vehicles            enable row level security;
alter table customers           enable row level security;
alter table bookings            enable row level security;
alter table contracts           enable row level security;
alter table inspections         enable row level security;
alter table invoices            enable row level security;
alter table payments            enable row level security;
alter table maintenance_records enable row level security;
alter table demand_forecasts    enable row level security;
alter table ai_conversations    enable row level security;
alter table ai_messages         enable row level security;
alter table audit_log           enable row level security;
alter table doc_sequences       enable row level security; -- aucune policy = accès interne uniquement

-- ------------------------------------------------------------
-- companies
-- ------------------------------------------------------------
create policy "company_read" on companies for select
  using (id = auth_company_id());

-- ------------------------------------------------------------
-- profiles
-- CORRECTION #2 : profiles_update_self n'est plus "FOR ALL" implicite sur
-- toutes les colonnes sans garde-fou — la protection réelle contre le
-- changement de role/company_id est désormais assurée par le trigger
-- fn_protect_profile_privileges (0003). La policy RLS reste permissive sur
-- les autres colonnes (full_name, etc.), ce qui est l'usage normal.
-- ------------------------------------------------------------
create policy "profiles_read" on profiles for select
  using (company_id = auth_company_id());

create policy "profiles_update_self" on profiles for update
  using (id = auth.uid())
  with check (id = auth.uid() and company_id = auth_company_id());

-- CORRECTION #1 : la condition de rôle est désormais répétée dans WITH CHECK.
create policy "profiles_insert_admin" on profiles for insert
  with check (company_id = auth_company_id() and auth_role() = 'admin_societe');
create policy "profiles_update_admin" on profiles for update
  using (company_id = auth_company_id() and auth_role() = 'admin_societe')
  with check (company_id = auth_company_id() and auth_role() = 'admin_societe');
create policy "profiles_delete_admin" on profiles for delete
  using (company_id = auth_company_id() and auth_role() = 'admin_societe');

-- ------------------------------------------------------------
-- invitations (admin uniquement) — déjà correct (role dans using ET with check)
-- ------------------------------------------------------------
create policy "invitations_admin_all" on invitations for all
  using (company_id = auth_company_id() and auth_role() = 'admin_societe')
  with check (company_id = auth_company_id() and auth_role() = 'admin_societe');

-- ------------------------------------------------------------
-- agencies — CORRECTION #1
-- ------------------------------------------------------------
create policy "agencies_read" on agencies for select using (company_id = auth_company_id());
create policy "agencies_write" on agencies for all
  using (company_id = auth_company_id() and auth_role() = 'admin_societe')
  with check (company_id = auth_company_id() and auth_role() = 'admin_societe');

-- ------------------------------------------------------------
-- vehicle_categories — CORRECTION #1
-- ------------------------------------------------------------
create policy "categories_read" on vehicle_categories for select
  using (company_id = auth_company_id());
create policy "categories_write" on vehicle_categories for all
  using (company_id = auth_company_id() and auth_role() in ('admin_societe','gestionnaire_agence'))
  with check (company_id = auth_company_id() and auth_role() in ('admin_societe','gestionnaire_agence'));

-- ------------------------------------------------------------
-- vehicles — CORRECTION #1
-- ------------------------------------------------------------
create policy "vehicles_read" on vehicles for select using (company_id = auth_company_id());
create policy "vehicles_write" on vehicles for all
  using (company_id = auth_company_id() and auth_role() in ('admin_societe','gestionnaire_agence'))
  with check (company_id = auth_company_id() and auth_role() in ('admin_societe','gestionnaire_agence'));

-- ------------------------------------------------------------
-- customers — CORRECTION #1
-- ------------------------------------------------------------
create policy "customers_rw" on customers for all
  using (company_id = auth_company_id() and auth_role() in ('admin_societe','gestionnaire_agence','agent'))
  with check (company_id = auth_company_id() and auth_role() in ('admin_societe','gestionnaire_agence','agent'));
create policy "customers_read_comptable" on customers for select
  using (company_id = auth_company_id() and auth_role() = 'comptable');

-- ------------------------------------------------------------
-- bookings — CORRECTION #1 (important : empêchait un comptable de créer
-- une réservation, ce qui est explicitement exclu par la matrice RBAC)
-- ------------------------------------------------------------
create policy "bookings_read" on bookings for select using (company_id = auth_company_id());
create policy "bookings_write" on bookings for all
  using (company_id = auth_company_id() and auth_role() in ('admin_societe','gestionnaire_agence','agent'))
  with check (company_id = auth_company_id() and auth_role() in ('admin_societe','gestionnaire_agence','agent'));

-- ------------------------------------------------------------
-- contracts (déjà correct — role répété dans chaque with check dédié)
-- ------------------------------------------------------------
create policy "contracts_read" on contracts for select
  using (company_id = auth_company_id());
create policy "contracts_insert" on contracts for insert
  with check (company_id = auth_company_id()
    and auth_role() in ('admin_societe','gestionnaire_agence','agent'));
create policy "contracts_update" on contracts for update
  using (company_id = auth_company_id()
    and auth_role() in ('admin_societe','gestionnaire_agence','agent'))
  with check (company_id = auth_company_id()
    and auth_role() in ('admin_societe','gestionnaire_agence','agent'));
create policy "contracts_delete" on contracts for delete
  using (company_id = auth_company_id() and auth_role() = 'admin_societe');

-- ------------------------------------------------------------
-- inspections (déjà correct)
-- ------------------------------------------------------------
create policy "inspections_read" on inspections for select
  using (company_id = auth_company_id());
create policy "inspections_insert" on inspections for insert
  with check (company_id = auth_company_id()
    and auth_role() in ('admin_societe','gestionnaire_agence','agent'));
create policy "inspections_update" on inspections for update
  using (company_id = auth_company_id()
    and auth_role() in ('admin_societe','gestionnaire_agence','agent'))
  with check (company_id = auth_company_id()
    and auth_role() in ('admin_societe','gestionnaire_agence','agent'));

-- ------------------------------------------------------------
-- invoices (déjà correct)
-- ------------------------------------------------------------
create policy "invoices_select" on invoices for select
  using (company_id = auth_company_id()
    and auth_role() in ('admin_societe','gestionnaire_agence','comptable'));
create policy "invoices_insert" on invoices for insert
  with check (company_id = auth_company_id()
    and auth_role() in ('admin_societe','comptable'));
create policy "invoices_update" on invoices for update
  using (company_id = auth_company_id()
    and auth_role() in ('admin_societe','comptable'))
  with check (company_id = auth_company_id()
    and auth_role() in ('admin_societe','comptable'));
create policy "invoices_delete" on invoices for delete
  using (company_id = auth_company_id() and auth_role() = 'admin_societe');

-- ------------------------------------------------------------
-- payments — CORRECTION #1
-- ------------------------------------------------------------
create policy "payments_select" on payments for select
  using (company_id = auth_company_id()
    and auth_role() in ('admin_societe','gestionnaire_agence','comptable'));
create policy "payments_write" on payments for all
  using (company_id = auth_company_id() and auth_role() in ('admin_societe','comptable'))
  with check (company_id = auth_company_id() and auth_role() in ('admin_societe','comptable'));

-- ------------------------------------------------------------
-- maintenance_records — CORRECTION #1
-- ------------------------------------------------------------
create policy "maintenance_read" on maintenance_records for select
  using (company_id = auth_company_id());
create policy "maintenance_write" on maintenance_records for all
  using (company_id = auth_company_id() and auth_role() in ('admin_societe','gestionnaire_agence'))
  with check (company_id = auth_company_id() and auth_role() in ('admin_societe','gestionnaire_agence'));

-- ------------------------------------------------------------
-- demand_forecasts (lecture seule pour les utilisateurs ; écriture via
-- service_role dans forecast-demand, qui contourne la RLS)
-- ------------------------------------------------------------
create policy "forecasts_read" on demand_forecasts for select
  using (company_id = auth_company_id());

-- ------------------------------------------------------------
-- ai_conversations / ai_messages (déjà correct)
-- ------------------------------------------------------------
create policy "ai_conv_own" on ai_conversations for all
  using (user_id = auth.uid() and company_id = auth_company_id())
  with check (user_id = auth.uid() and company_id = auth_company_id());
create policy "ai_msg_own" on ai_messages for all
  using (exists (select 1 from ai_conversations c
                 where c.id = conversation_id and c.user_id = auth.uid()))
  with check (exists (select 1 from ai_conversations c
                      where c.id = conversation_id and c.user_id = auth.uid()));

-- ------------------------------------------------------------
-- audit_log (lecture admin seulement ; écriture via trigger SECURITY
-- DEFINER uniquement — aucune policy d'INSERT pour les rôles applicatifs)
-- ------------------------------------------------------------
create policy "audit_read_admin" on audit_log for select
  using (company_id = auth_company_id() and auth_role() = 'admin_societe');