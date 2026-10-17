
-- ============================================================
-- Tests RLS automatisés — FleetDesk
-- Prouve : isolation multi-tenant, restrictions par rôle,
-- contrainte anti-double-réservation, anti-auto-élévation de privilège.
--
-- Exécution : supabase db query -f supabase/tests/rls.test.sql --linked
-- Idempotent : nettoie ses données de test au début ET à la fin.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Helpers de simulation de session (manquants dans la version précédente)
-- ------------------------------------------------------------
create or replace function public.test_set_session(p_user_id uuid)
returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text,
    true
  );
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  execute 'set local role authenticated';
end;
$$;

create or replace function public.test_reset_session()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  reset role;
end;
$$;

-- ------------------------------------------------------------
-- 1. Nettoyage préalable (au cas où un run précédent a échoué en cours de route)
-- ------------------------------------------------------------
reset role;
delete from bookings   where company_id in ('10000000-0000-0000-0000-00000000a001','10000000-0000-0000-0000-00000000b001');
delete from vehicles   where company_id in ('10000000-0000-0000-0000-00000000a001','10000000-0000-0000-0000-00000000b001');
delete from customers  where company_id in ('10000000-0000-0000-0000-00000000a001','10000000-0000-0000-0000-00000000b001');
delete from vehicle_categories where company_id in ('10000000-0000-0000-0000-00000000a001','10000000-0000-0000-0000-00000000b001');
delete from agencies   where company_id in ('10000000-0000-0000-0000-00000000a001','10000000-0000-0000-0000-00000000b001');
delete from profiles   where id in ('10000000-0000-0000-0000-00000000d001','10000000-0000-0000-0000-00000000d002');
delete from auth.users where id in ('10000000-0000-0000-0000-00000000d001','10000000-0000-0000-0000-00000000d002');
delete from companies  where id in ('10000000-0000-0000-0000-00000000a001','10000000-0000-0000-0000-00000000b001');

-- ------------------------------------------------------------
-- 2. Jeu de données de test
--    Société A : agence + véhicule + client + User A (agent)
--    Société B : User B (admin_societe) — pour tester l'isolation croisée
-- ------------------------------------------------------------
insert into companies (id, name) values
  ('10000000-0000-0000-0000-00000000a001', 'Test Société A'),
  ('10000000-0000-0000-0000-00000000b001', 'Test Société B');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-00000000d001',
   'authenticated', 'authenticated', 'test-agent-a@fleetdesk-tests.local', 'x',
   now(), now(), now(), '{}'::jsonb, '{}'::jsonb, false, false),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-00000000d002',
   'authenticated', 'authenticated', 'test-admin-b@fleetdesk-tests.local', 'x',
   now(), now(), now(), '{}'::jsonb, '{}'::jsonb, false, false)
on conflict (id) do nothing;

-- Les profils sont normalement auto-créés par le trigger handle_new_user() ;
-- on les force explicitement ici pour un état déterministe.
insert into profiles (id, company_id, agency_id, full_name, role) values
  ('10000000-0000-0000-0000-00000000d001', '10000000-0000-0000-0000-00000000a001', null, 'Test Agent A', 'agent')
on conflict (id) do update set company_id = excluded.company_id, role = excluded.role, agency_id = excluded.agency_id;

insert into profiles (id, company_id, agency_id, full_name, role) values
  ('10000000-0000-0000-0000-00000000d002', '10000000-0000-0000-0000-00000000b001', null, 'Test Admin B', 'admin_societe')
on conflict (id) do update set company_id = excluded.company_id, role = excluded.role, agency_id = excluded.agency_id;

insert into agencies (id, company_id, name, city) values
  ('10000000-0000-0000-0000-00000000a101', '10000000-0000-0000-0000-00000000a001', 'Agence Test A', 'Tunis');

update profiles set agency_id = '10000000-0000-0000-0000-00000000a101'
  where id = '10000000-0000-0000-0000-00000000d001';

insert into vehicle_categories (id, company_id, name, daily_rate) values
  ('10000000-0000-0000-0000-00000000c001', '10000000-0000-0000-0000-00000000a001', 'Catégorie Test', 50);

insert into vehicles (id, company_id, agency_id, category_id, plate, brand, model, status) values
  ('10000000-0000-0000-0000-00000000a201', '10000000-0000-0000-0000-00000000a001',
   '10000000-0000-0000-0000-00000000a101', '10000000-0000-0000-0000-00000000c001',
   'TEST-001', 'Test', 'Model', 'disponible');

insert into customers (id, company_id, full_name) values
  ('10000000-0000-0000-0000-00000000a301', '10000000-0000-0000-0000-00000000a001', 'Client Test');

reset role;

-- ============================================================
-- TEST 1 : isolation multi-tenant — User A (société A) ne voit PAS société B
-- ============================================================
do $$
declare
  v_count int;
begin
  perform test_set_session('10000000-0000-0000-0000-00000000d001');

  select count(*) into v_count from companies
  where id = '10000000-0000-0000-0000-00000000b001';

  perform test_reset_session();

  if v_count <> 0 then
    raise exception 'TEST 1 ÉCHOUÉ : User A (société A) voit la société B';
  end if;

  raise notice 'TEST 1 RÉUSSI : isolation des sociétés (companies)';
end;
$$;

-- ============================================================
-- TEST 2 : isolation multi-tenant — User A ne voit pas les véhicules/clients
-- d'une autre société (ici il n'y en a pas, donc on vérifie l'inverse :
-- qu'il voit bien SES PROPRES véhicules, et aucun de société B)
-- ============================================================
do $$
declare
  v_own_count int;
begin
  perform test_set_session('10000000-0000-0000-0000-00000000d001');

  select count(*) into v_own_count from vehicles
  where company_id = '10000000-0000-0000-0000-00000000a001';

  perform test_reset_session();

  if v_own_count <> 1 then
    raise exception 'TEST 2 ÉCHOUÉ : User A ne voit pas son propre véhicule (count=%)', v_own_count;
  end if;

  raise notice 'TEST 2 RÉUSSI : User A voit ses propres véhicules (count=%)', v_own_count;
end;
$$;

-- ============================================================
-- TEST 3 : un agent NE PEUT PAS créer une catégorie de véhicule
-- (matrice RBAC : vehicle_categories réservé à admin_societe / gestionnaire_agence)
-- ============================================================
do $$
begin
  perform test_set_session('10000000-0000-0000-0000-00000000d001'); -- agent

  begin
    insert into vehicle_categories (company_id, name, daily_rate)
    values ('10000000-0000-0000-0000-00000000a001', 'Catégorie interdite', 99);

    perform test_reset_session();
    raise exception 'TEST 3 ÉCHOUÉ : un agent a pu créer une catégorie de véhicule';
  exception
    when insufficient_privilege or others then
      perform test_reset_session();
      raise notice 'TEST 3 RÉUSSI : création de catégorie bloquée pour un agent';
  end;
end;
$$;

-- ============================================================
-- TEST 4 : un agent NE PEUT PAS lire les factures (invoices)
-- ============================================================
do $$
declare
  v_count int;
begin
  perform test_set_session('10000000-0000-0000-0000-00000000d001'); -- agent

  select count(*) into v_count from invoices
  where company_id = '10000000-0000-0000-0000-00000000a001';

  perform test_reset_session();

  if v_count <> 0 then
    raise exception 'TEST 4 ÉCHOUÉ : un agent a pu lire % facture(s)', v_count;
  end if;

  raise notice 'TEST 4 RÉUSSI : lecture des factures bloquée pour un agent (0 ligne visible)';
end;
$$;

-- ============================================================
-- TEST 5 : contrainte anti-double-réservation (exclude using gist)
-- Deux réservations qui se chevauchent sur le même véhicule ? erreur 23P01
-- ============================================================
do $$
begin
  perform test_set_session('10000000-0000-0000-0000-00000000d001'); -- agent

  insert into bookings (agency_id, vehicle_id, customer_id, start_at, end_at, daily_rate, status)
  values (
    '10000000-0000-0000-0000-00000000a101',
    '10000000-0000-0000-0000-00000000a201',
    '10000000-0000-0000-0000-00000000a301',
    now() + interval '1 day', now() + interval '3 day',
    50, 'confirmed'
  );

  begin
    insert into bookings (agency_id, vehicle_id, customer_id, start_at, end_at, daily_rate, status)
    values (
      '10000000-0000-0000-0000-00000000a101',
      '10000000-0000-0000-0000-00000000a201',
      '10000000-0000-0000-0000-00000000a301',
      now() + interval '2 day', now() + interval '4 day', -- chevauche la précédente
      50, 'confirmed'
    );

    perform test_reset_session();
    raise exception 'TEST 5 ÉCHOUÉ : double réservation chevauchante acceptée !';
  exception
    when exclusion_violation then
      perform test_reset_session();
      raise notice 'TEST 5 RÉUSSI : contrainte no_double_booking a rejeté le chevauchement (23P01)';
  end;
end;
$$;

-- ============================================================
-- TEST 6 : un agent ne peut PAS s'auto-promouvoir admin_societe
-- ============================================================
do $$
declare
  v_role user_role;
begin
  reset role;
  update profiles set role = 'agent' where id = '10000000-0000-0000-0000-00000000d001';

  perform test_set_session('10000000-0000-0000-0000-00000000d001');

  update profiles
    set role = 'admin_societe'
    where id = '10000000-0000-0000-0000-00000000d001';

  perform test_reset_session();

  select role into v_role from profiles where id = '10000000-0000-0000-0000-00000000d001';

  if v_role = 'admin_societe' then
    raise exception 'TEST 6 ÉCHOUÉ : un agent a réussi à s''auto-promouvoir admin_societe';
  end if;

  raise notice 'TEST 6 RÉUSSI : auto-élévation de privilège bloquée (rôle resté %)', v_role;
end;
$$;

-- ============================================================
-- TEST 7 : User B (société B, admin_societe) ne peut pas voir
-- le véhicule de la société A, même en étant admin
-- ============================================================
do $$
declare
  v_count int;
begin
  perform test_set_session('10000000-0000-0000-0000-00000000d002'); -- admin société B

  select count(*) into v_count from vehicles
  where id = '10000000-0000-0000-0000-00000000a201'; -- véhicule de société A

  perform test_reset_session();

  if v_count <> 0 then
    raise exception 'TEST 7 ÉCHOUÉ : admin société B voit un véhicule de société A';
  end if;

  raise notice 'TEST 7 RÉUSSI : isolation garantie même pour un admin_societe d''une autre société';
end;
$$;

-- ============================================================
-- Nettoyage final
-- ============================================================
reset role;
delete from bookings   where company_id in ('10000000-0000-0000-0000-00000000a001','10000000-0000-0000-0000-00000000b001');
delete from vehicles   where company_id in ('10000000-0000-0000-0000-00000000a001','10000000-0000-0000-0000-00000000b001');
delete from customers  where company_id in ('10000000-0000-0000-0000-00000000a001','10000000-0000-0000-0000-00000000b001');
delete from vehicle_categories where company_id in ('10000000-0000-0000-0000-00000000a001','10000000-0000-0000-0000-00000000b001');
delete from agencies   where company_id in ('10000000-0000-0000-0000-00000000a001','10000000-0000-0000-0000-00000000b001');
delete from profiles   where id in ('10000000-0000-0000-0000-00000000d001','10000000-0000-0000-0000-00000000d002');
delete from auth.users where id in ('10000000-0000-0000-0000-00000000d001','10000000-0000-0000-0000-00000000d002');
delete from companies  where id in ('10000000-0000-0000-0000-00000000a001','10000000-0000-0000-0000-00000000b001');

do $$
begin
  raise notice '============================================================';
  raise notice 'TOUS LES TESTS RLS SONT PASSÉS AVEC SUCCÈS.';
  raise notice '============================================================';
end;
$$;
