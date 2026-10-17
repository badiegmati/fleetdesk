-- ============================================================
-- Tests des workflows applicatifs (migration 0008)
-- Exécution : supabase db query -f supabase/tests/workflows.test.sql --linked
-- S'exécute dans une transaction ANNULÉE à la fin : ne laisse aucune donnée.
-- ============================================================
begin;

create or replace function pg_temp.as_user(p_user uuid, p_email text default null) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated', 'email', p_email)::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  execute 'set local role authenticated';
end $$;

create or replace function pg_temp.as_admin() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'reset role';
end $$;

-- ------------------------------------------------------------
-- Jeu de données : sociétés W1 / W2, 4 rôles dans W1, 1 admin dans W2
-- ------------------------------------------------------------
insert into companies (id, name) values
  ('20000000-0000-0000-0000-0000000000a1', 'W1'), ('20000000-0000-0000-0000-0000000000b2', 'W2');
insert into agencies (id, company_id, name) values
  ('20000000-0000-0000-0000-00000000a101', '20000000-0000-0000-0000-0000000000a1', 'Agence W1'),
  ('20000000-0000-0000-0000-00000000b201', '20000000-0000-0000-0000-0000000000b2', 'Agence W2');
insert into vehicle_categories (id, company_id, name, daily_rate) values
  ('20000000-0000-0000-0000-00000000c101', '20000000-0000-0000-0000-0000000000a1', 'Eco', 50);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
select '00000000-0000-0000-0000-000000000000', u.id::uuid, 'authenticated', 'authenticated', u.email, 'x',
       now(), now(), now(), '{}'::jsonb, '{}'::jsonb, false, false
from (values
  ('20000000-0000-0000-0000-00000000d001', 'admin1@w.local'),
  ('20000000-0000-0000-0000-00000000d002', 'agent1@w.local'),
  ('20000000-0000-0000-0000-00000000d003', 'compta1@w.local'),
  ('20000000-0000-0000-0000-00000000d004', 'gest1@w.local'),
  ('20000000-0000-0000-0000-00000000d005', 'admin2@w.local'),
  ('20000000-0000-0000-0000-00000000d006', 'invite@w.local')) as u(id, email);
-- (handle_new_user a créé les profils sans société ; on les rattache en superuser)
update profiles set company_id = '20000000-0000-0000-0000-0000000000a1', role = 'admin_societe'
  where id = '20000000-0000-0000-0000-00000000d001';
update profiles set company_id = '20000000-0000-0000-0000-0000000000a1', role = 'agent', agency_id = '20000000-0000-0000-0000-00000000a101'
  where id = '20000000-0000-0000-0000-00000000d002';
update profiles set company_id = '20000000-0000-0000-0000-0000000000a1', role = 'comptable'
  where id = '20000000-0000-0000-0000-00000000d003';
update profiles set company_id = '20000000-0000-0000-0000-0000000000a1', role = 'gestionnaire_agence'
  where id = '20000000-0000-0000-0000-00000000d004';
update profiles set company_id = '20000000-0000-0000-0000-0000000000b2', role = 'admin_societe'
  where id = '20000000-0000-0000-0000-00000000d005';

insert into vehicles (id, company_id, agency_id, category_id, plate, brand, model, mileage_km) values
  ('20000000-0000-0000-0000-00000000e101', '20000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000a101', '20000000-0000-0000-0000-00000000c101', 'W1-A', 'Renault', 'Clio', 1000),
  ('20000000-0000-0000-0000-00000000e102', '20000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000a101', '20000000-0000-0000-0000-00000000c101', 'W1-B', 'Peugeot', '208', 2000),
  ('20000000-0000-0000-0000-00000000e201', '20000000-0000-0000-0000-0000000000b2', '20000000-0000-0000-0000-00000000b201', null, 'W2-A', 'Fiat', 'Panda', 3000);
insert into customers (id, company_id, full_name) values
  ('20000000-0000-0000-0000-00000000f101', '20000000-0000-0000-0000-0000000000a1', 'Client W1'),
  ('20000000-0000-0000-0000-00000000f201', '20000000-0000-0000-0000-0000000000b2', 'Client W2');

-- ------------------------------------------------------------
-- TEST 8 : un agent crée une réservation SANS agence ni tarif → dérivés du véhicule
-- ------------------------------------------------------------
do $$
declare b bookings;
begin
  perform pg_temp.as_user('20000000-0000-0000-0000-00000000d002');
  insert into bookings (id, vehicle_id, customer_id, start_at, end_at, status)
  values ('20000000-0000-0000-0000-0000000b0001', '20000000-0000-0000-0000-00000000e101',
          '20000000-0000-0000-0000-00000000f101', now() + interval '2 days', now() + interval '5 days', 'confirmed')
  returning * into b;
  perform pg_temp.as_admin();
  if b.agency_id <> '20000000-0000-0000-0000-00000000a101' then raise exception 'TEST 8 ÉCHOUÉ : agence non dérivée du véhicule'; end if;
  if b.daily_rate <> 50 or b.total_amount <> 150 then
    raise exception 'TEST 8 ÉCHOUÉ : tarif/total incorrects (% / %)', b.daily_rate, b.total_amount;
  end if;
  raise notice 'TEST 8 RÉUSSI : agence, tarif (50) et total (150) dérivés automatiquement';
end $$;

-- ------------------------------------------------------------
-- TEST 9 : impossible de réserver le véhicule ou le client d'une AUTRE société
-- ------------------------------------------------------------
do $$
begin
  perform pg_temp.as_user('20000000-0000-0000-0000-00000000d002');
  begin
    insert into bookings (vehicle_id, customer_id, start_at, end_at)
    values ('20000000-0000-0000-0000-00000000e201', '20000000-0000-0000-0000-00000000f101', now() + interval '10 days', now() + interval '11 days');
    perform pg_temp.as_admin();
    raise exception 'TEST 9 ÉCHOUÉ : réservation d''un véhicule d''une autre société acceptée';
  exception when raise_exception then
    if sqlerrm like 'TEST 9%' then raise; end if;
  end;
  begin
    insert into bookings (vehicle_id, customer_id, start_at, end_at)
    values ('20000000-0000-0000-0000-00000000e101', '20000000-0000-0000-0000-00000000f201', now() + interval '10 days', now() + interval '11 days');
    perform pg_temp.as_admin();
    raise exception 'TEST 9 ÉCHOUÉ : client d''une autre société accepté';
  exception when raise_exception then
    if sqlerrm like 'TEST 9%' then raise; end if;
  end;
  perform pg_temp.as_admin();
  raise notice 'TEST 9 RÉUSSI : véhicule et client d''une autre société refusés';
end $$;

-- ------------------------------------------------------------
-- TEST 10 : maintenance → réservation refusée + véhicule absent de la recherche
-- ------------------------------------------------------------
do $$
declare n int;
begin
  insert into maintenance_records (company_id, vehicle_id, type, start_date, end_date)
  values ('20000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000e102', 'preventive',
          (now() + interval '20 days')::date, (now() + interval '22 days')::date);
  perform pg_temp.as_user('20000000-0000-0000-0000-00000000d002');
  begin
    insert into bookings (vehicle_id, customer_id, start_at, end_at)
    values ('20000000-0000-0000-0000-00000000e102', '20000000-0000-0000-0000-00000000f101', now() + interval '21 days', now() + interval '23 days');
    perform pg_temp.as_admin();
    raise exception 'TEST 10 ÉCHOUÉ : réservation acceptée pendant une maintenance';
  exception when raise_exception then
    if sqlerrm like 'TEST 10%' then raise; end if;
  end;
  select count(*) into n from search_available_vehicles('20000000-0000-0000-0000-00000000a101',
         now() + interval '21 days', now() + interval '23 days');
  perform pg_temp.as_admin();
  if n <> 1 then raise exception 'TEST 10 ÉCHOUÉ : la recherche renvoie % véhicule(s) (attendu 1 : W1-A)', n; end if;
  raise notice 'TEST 10 RÉUSSI : maintenance bloque la réservation et la disponibilité';
end $$;

-- ------------------------------------------------------------
-- TEST 11 : cycle de contrat par un agent (création → signature → clôture)
-- ------------------------------------------------------------
do $$
declare v_c uuid; v_no text; v_vs vehicle_status; v_bs booking_status; v_km int; n int;
begin
  perform pg_temp.as_user('20000000-0000-0000-0000-00000000d002');
  v_c := create_contract_from_booking('20000000-0000-0000-0000-0000000b0001', 100);
  select contract_no into v_no from contracts where id = v_c;
  if v_no not like 'CT-%' then raise exception 'TEST 11 ÉCHOUÉ : numéro de contrat inattendu (%)', v_no; end if;

  perform sign_contract(v_c, 'Client W1');
  perform pg_temp.as_admin();
  select status into v_vs from vehicles where id = '20000000-0000-0000-0000-00000000e101';
  select status into v_bs from bookings where id = '20000000-0000-0000-0000-0000000b0001';
  if v_vs <> 'loue' or v_bs <> 'active' then raise exception 'TEST 11 ÉCHOUÉ : après signature véhicule=% réservation=%', v_vs, v_bs; end if;

  perform pg_temp.as_user('20000000-0000-0000-0000-00000000d002');
  perform close_contract(v_c, 1450);
  select count(*) into n from invoices;       -- l'agent ne voit aucune facture (RLS)
  perform pg_temp.as_admin();
  select status into v_vs from vehicles where id = '20000000-0000-0000-0000-00000000e101';
  select mileage_km into v_km from vehicles where id = '20000000-0000-0000-0000-00000000e101';
  select status into v_bs from bookings where id = '20000000-0000-0000-0000-0000000b0001';
  if v_vs <> 'disponible' or v_km <> 1450 or v_bs <> 'completed' then
    raise exception 'TEST 11 ÉCHOUÉ : après clôture véhicule=% km=% réservation=%', v_vs, v_km, v_bs;
  end if;
  if n <> 0 then raise exception 'TEST 11 ÉCHOUÉ : l''agent voit % facture(s)', n; end if;
  raise notice 'TEST 11 RÉUSSI : contrat %, signature → loué, clôture → disponible (1450 km)', v_no;
end $$;

-- ------------------------------------------------------------
-- TEST 12 : contrôles de rôle sur les RPC
-- ------------------------------------------------------------
do $$
declare v_c uuid;
begin
  select id into v_c from contracts where booking_id = '20000000-0000-0000-0000-0000000b0001';
  perform pg_temp.as_user('20000000-0000-0000-0000-00000000d003');             -- comptable
  begin
    perform sign_contract(v_c, 'x');
    perform pg_temp.as_admin();
    raise exception 'TEST 12 ÉCHOUÉ : un comptable a pu signer un contrat';
  exception when insufficient_privilege then null; end;

  perform pg_temp.as_user('20000000-0000-0000-0000-00000000d002');             -- agent
  begin
    perform record_payment(gen_random_uuid(), 10, 'carte');
    perform pg_temp.as_admin();
    raise exception 'TEST 12 ÉCHOUÉ : un agent a pu enregistrer un paiement';
  exception when insufficient_privilege then null; end;

  perform pg_temp.as_user('20000000-0000-0000-0000-00000000d005');             -- admin d'une AUTRE société
  begin
    perform close_contract(v_c, 1);
    perform pg_temp.as_admin();
    raise exception 'TEST 12 ÉCHOUÉ : un admin d''une autre société a atteint le contrat';
  exception when raise_exception then
    if sqlerrm like 'TEST 12%' then raise; end if;   -- « Contrat introuvable » attendu
  end;
  perform pg_temp.as_admin();
  raise notice 'TEST 12 RÉUSSI : rôles et isolation de société respectés par les RPC';
end $$;

-- ------------------------------------------------------------
-- TEST 13 : paiements partiels, dépassement refusé, statut « payée », unicité de facture
-- ------------------------------------------------------------
do $$
declare v_c uuid; v_i uuid; v_left numeric; v_st invoice_status;
begin
  select id into v_c from contracts where booking_id = '20000000-0000-0000-0000-0000000b0001';
  insert into invoices (company_id, contract_id, amount_ht, amount_ttc, status, due_date)
  values ('20000000-0000-0000-0000-0000000000a1', v_c, 168.07, 200, 'emise', current_date + 10) returning id into v_i;

  begin   -- une 2e facture active sur le même contrat est refusée (si l'index a pu être créé)
    insert into invoices (company_id, contract_id, amount_ht, amount_ttc, status, due_date)
    values ('20000000-0000-0000-0000-0000000000a1', v_c, 1, 1, 'emise', current_date);
    raise exception 'TEST 13 ÉCHOUÉ : deux factures actives pour un même contrat';
  exception when unique_violation then null; end;

  perform pg_temp.as_user('20000000-0000-0000-0000-00000000d003');             -- comptable
  v_left := record_payment(v_i, 120, 'virement');
  if v_left <> 80 then raise exception 'TEST 13 ÉCHOUÉ : solde % (attendu 80)', v_left; end if;
  begin
    perform record_payment(v_i, 100, 'carte');
    perform pg_temp.as_admin();
    raise exception 'TEST 13 ÉCHOUÉ : surpaiement accepté';
  exception when raise_exception then
    if sqlerrm like 'TEST 13%' then raise; end if;
  end;
  v_left := record_payment(v_i, 80, 'especes');
  perform pg_temp.as_admin();
  select status into v_st from invoices where id = v_i;
  if v_st <> 'payee' or v_left <> 0 then raise exception 'TEST 13 ÉCHOUÉ : statut % solde %', v_st, v_left; end if;
  raise notice 'TEST 13 RÉUSSI : paiements partiels → payée, surpaiement et doublon de facture refusés';
end $$;

-- ------------------------------------------------------------
-- TEST 14 : refresh_overdue_invoices (comptable) ne touche que sa société
-- ------------------------------------------------------------
do $$
declare v_c uuid; v_i uuid; n int; v_st invoice_status;
begin
  insert into bookings (id, company_id, agency_id, vehicle_id, customer_id, start_at, end_at, status, daily_rate)
  values ('20000000-0000-0000-0000-0000000b0002', '20000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000a101',
          '20000000-0000-0000-0000-00000000e102', '20000000-0000-0000-0000-00000000f101', now() - interval '9 days', now() - interval '6 days', 'completed', 50);
  insert into contracts (company_id, booking_id, signed_at, closed_at)
  values ('20000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000b0002', now() - interval '9 days', now() - interval '6 days') returning id into v_c;
  insert into invoices (company_id, contract_id, amount_ht, amount_ttc, status, due_date)
  values ('20000000-0000-0000-0000-0000000000a1', v_c, 100, 119, 'emise', current_date - 3) returning id into v_i;

  perform pg_temp.as_user('20000000-0000-0000-0000-00000000d003');
  n := refresh_overdue_invoices();
  perform pg_temp.as_admin();
  select status into v_st from invoices where id = v_i;
  if n <> 1 or v_st <> 'en_retard' then raise exception 'TEST 14 ÉCHOUÉ : % facture(s) mises à jour, statut %', n, v_st; end if;
  raise notice 'TEST 14 RÉUSSI : facture échue passée « en retard »';
end $$;

-- ------------------------------------------------------------
-- TEST 15 : invitation → rattachement d'un utilisateur déjà inscrit
-- ------------------------------------------------------------
do $$
declare v_company uuid; v_role user_role; v_acc timestamptz;
begin
  perform pg_temp.as_user('20000000-0000-0000-0000-00000000d001');            -- admin W1
  perform create_invitation('invite@w.local', 'comptable', null);
  perform pg_temp.as_admin();
  -- l'invité s'était inscrit avant l'invitation : profil sans société
  perform pg_temp.as_user('20000000-0000-0000-0000-00000000d006', 'invite@w.local');
  v_company := accept_invitation();
  perform pg_temp.as_admin();
  select role, company_id into v_role, v_company from profiles where id = '20000000-0000-0000-0000-00000000d006';
  select accepted_at into v_acc from invitations where lower(email) = 'invite@w.local';
  if v_company is distinct from '20000000-0000-0000-0000-0000000000a1' or v_role <> 'comptable' or v_acc is null then
    raise exception 'TEST 15 ÉCHOUÉ : société=% rôle=% accepted_at=%', v_company, v_role, v_acc;
  end if;
  raise notice 'TEST 15 RÉUSSI : invité rattaché à W1 avec le rôle comptable';
end $$;

-- ------------------------------------------------------------
-- TEST 16 : seed_demo_data — admin d'une société vide seulement, une seule fois
-- ------------------------------------------------------------
do $$
declare nv int; ni int;
begin
  perform pg_temp.as_user('20000000-0000-0000-0000-00000000d005');            -- admin W2 (1 véhicule déjà) 
  begin
    perform seed_demo_data();
    perform pg_temp.as_admin();
    raise exception 'TEST 16 ÉCHOUÉ : démo chargée dans une société non vide';
  exception when raise_exception then
    if sqlerrm like 'TEST 16%' then raise; end if;
  end;
  perform pg_temp.as_admin();
  delete from vehicles where company_id = '20000000-0000-0000-0000-0000000000b2';
  delete from customers where company_id = '20000000-0000-0000-0000-0000000000b2';

  perform pg_temp.as_user('20000000-0000-0000-0000-00000000d005');
  perform seed_demo_data();
  perform pg_temp.as_admin();
  select count(*) into nv from vehicles where company_id = '20000000-0000-0000-0000-0000000000b2';
  select count(*) into ni from invoices where company_id = '20000000-0000-0000-0000-0000000000b2';
  if nv <> 10 or ni <> 3 then raise exception 'TEST 16 ÉCHOUÉ : % véhicules, % factures', nv, ni; end if;

  perform pg_temp.as_user('20000000-0000-0000-0000-00000000d002');            -- agent W1
  begin
    perform seed_demo_data();
    perform pg_temp.as_admin();
    raise exception 'TEST 16 ÉCHOUÉ : un agent a chargé la démo';
  exception when insufficient_privilege then null; end;
  perform pg_temp.as_admin();
  raise notice 'TEST 16 RÉUSSI : démo chargée (10 véhicules, 3 factures), refusée aux non-admins / sociétés non vides';
end $$;

-- ------------------------------------------------------------
-- TEST 17 : onboarding — create_company_and_admin rattache VRAIMENT le profil
--           (et un simple agent ne peut toujours PAS s'auto-promouvoir : cf. rls.test.sql TEST 6)
-- ------------------------------------------------------------
do $$
declare v_co uuid; v_role user_role; v_cid uuid;
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
  values ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-00000000d007', 'authenticated', 'authenticated',
          'nouveau@w.local', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb, false, false);
  perform pg_temp.as_user('20000000-0000-0000-0000-00000000d007', 'nouveau@w.local');
  v_co := create_company_and_admin('Société Onboarding', 'Nouvel Admin');
  perform pg_temp.as_admin();
  select role, company_id into v_role, v_cid from profiles where id = '20000000-0000-0000-0000-00000000d007';
  if v_cid is distinct from v_co or v_role <> 'admin_societe' then
    raise exception 'TEST 17 ÉCHOUÉ : société=% rôle=% (attendu % / admin_societe)', v_cid, v_role, v_co;
  end if;

  -- un second appel (déjà rattaché) est refusé
  perform pg_temp.as_user('20000000-0000-0000-0000-00000000d007');
  begin
    perform create_company_and_admin('Autre', 'x');
    perform pg_temp.as_admin();
    raise exception 'TEST 17 ÉCHOUÉ : seconde création de société acceptée';
  exception when raise_exception then
    if sqlerrm like 'TEST 17%' then raise; end if;
  end;
  perform pg_temp.as_admin();
  raise notice 'TEST 17 RÉUSSI : le nouvel utilisateur devient admin_societe de sa société';
end $$;

do $$ begin
  raise notice '============================================================';
  raise notice 'TOUS LES TESTS WORKFLOWS (8 → 17) SONT PASSÉS AVEC SUCCÈS.';
  raise notice '============================================================';
end $$;

rollback;
