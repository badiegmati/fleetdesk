-- ============================================================
-- 0006 — Realtime, Storage, tâches planifiées, grants explicites
-- ============================================================

-- ------------------------------------------------------------
-- Realtime
-- ------------------------------------------------------------
alter publication supabase_realtime add table bookings;
alter publication supabase_realtime add table vehicles;

-- ------------------------------------------------------------
-- Buckets Storage (privés)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values
  ('vehicle-photos', 'vehicle-photos', false),
  ('customer-docs',  'customer-docs',  false),
  ('inspections',    'inspections',    false),
  ('invoices',       'invoices',       false)
on conflict (id) do nothing;

-- Convention de chemin obligatoire : {company_id}/... (ex: {company_id}/{contract_id}/depart-1.jpg)
--
-- CORRECTION #6 : les policies sont désormais découpées par commande
-- (select / insert / update / delete) au lieu d'un "FOR ALL" unique.
-- Une policy FOR ALL n'évalue USING QUE pour select/update/delete et
-- WITH CHECK QUE pour insert/update : mettre la restriction de rôle
-- uniquement dans WITH CHECK laissait un DELETE totalement libre pour
-- n'importe quel rôle de la société.

-- ---- vehicle-photos : lecture large, écriture admin + gestionnaire ----
create policy "vehicle_photos_select" on storage.objects for select
  using (bucket_id = 'vehicle-photos'
         and (storage.foldername(name))[1] = auth_company_id()::text);

create policy "vehicle_photos_insert" on storage.objects for insert
  with check (bucket_id = 'vehicle-photos'
         and (storage.foldername(name))[1] = auth_company_id()::text
         and auth_role() in ('admin_societe','gestionnaire_agence'));

create policy "vehicle_photos_update" on storage.objects for update
  using (bucket_id = 'vehicle-photos'
         and (storage.foldername(name))[1] = auth_company_id()::text
         and auth_role() in ('admin_societe','gestionnaire_agence'))
  with check (bucket_id = 'vehicle-photos'
         and (storage.foldername(name))[1] = auth_company_id()::text
         and auth_role() in ('admin_societe','gestionnaire_agence'));

create policy "vehicle_photos_delete" on storage.objects for delete
  using (bucket_id = 'vehicle-photos'
         and (storage.foldername(name))[1] = auth_company_id()::text
         and auth_role() in ('admin_societe','gestionnaire_agence'));

-- ---- customer-docs : lecture + écriture admin/gestionnaire/agent ----
create policy "customer_docs_select" on storage.objects for select
  using (bucket_id = 'customer-docs'
         and (storage.foldername(name))[1] = auth_company_id()::text
         and auth_role() in ('admin_societe','gestionnaire_agence','agent'));

create policy "customer_docs_insert" on storage.objects for insert
  with check (bucket_id = 'customer-docs'
         and (storage.foldername(name))[1] = auth_company_id()::text
         and auth_role() in ('admin_societe','gestionnaire_agence','agent'));

create policy "customer_docs_update" on storage.objects for update
  using (bucket_id = 'customer-docs'
         and (storage.foldername(name))[1] = auth_company_id()::text
         and auth_role() in ('admin_societe','gestionnaire_agence','agent'))
  with check (bucket_id = 'customer-docs'
         and (storage.foldername(name))[1] = auth_company_id()::text
         and auth_role() in ('admin_societe','gestionnaire_agence','agent'));

create policy "customer_docs_delete" on storage.objects for delete
  using (bucket_id = 'customer-docs'
         and (storage.foldername(name))[1] = auth_company_id()::text
         and auth_role() in ('admin_societe','gestionnaire_agence'));

-- ---- inspections : lecture + écriture admin/gestionnaire/agent ----
create policy "inspections_photos_select" on storage.objects for select
  using (bucket_id = 'inspections'
         and (storage.foldername(name))[1] = auth_company_id()::text
         and auth_role() in ('admin_societe','gestionnaire_agence','agent'));

create policy "inspections_photos_insert" on storage.objects for insert
  with check (bucket_id = 'inspections'
         and (storage.foldername(name))[1] = auth_company_id()::text
         and auth_role() in ('admin_societe','gestionnaire_agence','agent'));

create policy "inspections_photos_update" on storage.objects for update
  using (bucket_id = 'inspections'
         and (storage.foldername(name))[1] = auth_company_id()::text
         and auth_role() in ('admin_societe','gestionnaire_agence','agent'))
  with check (bucket_id = 'inspections'
         and (storage.foldername(name))[1] = auth_company_id()::text
         and auth_role() in ('admin_societe','gestionnaire_agence','agent'));

create policy "inspections_photos_delete" on storage.objects for delete
  using (bucket_id = 'inspections'
         and (storage.foldername(name))[1] = auth_company_id()::text
         and auth_role() in ('admin_societe','gestionnaire_agence'));

-- ---- invoices : lecture seule pour les rôles autorisés sur la facturation.
-- L'écriture du PDF se fait côté billing-service avec service_role
-- (contourne la RLS) : aucune policy d'INSERT nécessaire ici.
create policy "invoices_bucket_select" on storage.objects for select
  using (bucket_id = 'invoices'
         and (storage.foldername(name))[1] = auth_company_id()::text
         and auth_role() in ('admin_societe','gestionnaire_agence','comptable'));

-- ------------------------------------------------------------
-- AJOUT : grants explicites (défense en profondeur).
-- Par défaut, Postgres accorde EXECUTE à PUBLIC sur toute nouvelle
-- fonction, donc ce bloc est redondant dans une installation standard —
-- mais il protège contre toute configuration Supabase qui aurait révoqué
-- les droits par défaut (ALTER DEFAULT PRIVILEGES REVOKE ...).
-- ------------------------------------------------------------
grant execute on function public.search_available_vehicles(uuid, timestamptz, timestamptz, uuid) to authenticated;
grant execute on function public.create_booking_draft(uuid, uuid, uuid, timestamptz, timestamptz, numeric, text) to authenticated;
grant execute on function public.create_company_and_admin(text, text) to authenticated;
grant execute on function public.create_invitation(text, user_role, uuid) to authenticated;

-- ------------------------------------------------------------
-- Tâches planifiées (pg_cron)
-- À exécuter UNE FOIS après avoir déployé les Edge Functions.
-- ------------------------------------------------------------
-- select cron.schedule(
--   'forecast-nightly',
--   '0 2 * * *',
--   $$
--     select net.http_post(
--       url := 'https://<PROJECT>.supabase.co/functions/v1/forecast-demand',
--       headers := jsonb_build_object(
--         'Content-Type', 'application/json',
--         'x-cron-secret', '<CRON_SECRET>'
--       ),
--       body := '{}'::jsonb
--     );
--   $$
-- );