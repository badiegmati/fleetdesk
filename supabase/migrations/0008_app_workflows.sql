-- ============================================================
-- 0008 — Logique métier utilisée par l'interface web (Phase 2)
--
-- S'appuie sur 0001 → 0007 SANS les modifier. Peut être rejouée sans risque.
-- Principes :
--   * SECURITY INVOKER partout où la RLS suffit (les politiques de 0004 font foi) ;
--   * SECURITY DEFINER uniquement quand une action touche une table interdite au
--     rôle appelant (ex. un agent qui passe un véhicule en « loué »), avec contrôle
--     explicite du rôle ET de la société dans la fonction ;
--   * la FACTURE n'est PAS créée ici : elle l'est par le billing-service (PDF + e-mail).
-- Fuseau métier : Africa/Tunis (la Tunisie n'a pas d'heure d'été).
-- ============================================================

-- ------------------------------------------------------------
-- 0. CORRECTIF : onboarding et invitations
--    fn_protect_profile_privileges (0003) restaure role/company_id pour tout appelant
--    non-admin — y compris quand l'écriture vient d'une fonction de confiance
--    (create_company_and_admin, accept_invitation). Résultat : le nouvel utilisateur
--    recevait une société mais son profil restait « agent » SANS société.
--    Les fonctions de confiance posent donc un drapeau valable pour la transaction
--    en cours ; un client ne peut pas le poser (PostgREST n'expose pas set_config).
-- ------------------------------------------------------------
create or replace function public.fn_protect_profile_privileges()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null
     and coalesce(current_setting('fleetdesk.trusted_profile_write', true), '') <> '1'
     and coalesce(auth_role(), 'agent'::user_role) <> 'admin_societe' then
    new.role := old.role;
    new.company_id := old.company_id;
  end if;
  return new;
end $$;

create or replace function public.create_company_and_admin(p_company text, p_full_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_company uuid;
begin
  if auth.uid() is null then
    raise exception 'Non authentifié' using errcode = '42501';
  end if;
  if coalesce(trim(p_company), '') = '' then
    raise exception 'Nom de société requis';
  end if;
  if exists (select 1 from profiles where id = auth.uid() and company_id is not null) then
    raise exception 'Utilisateur déjà rattaché à une société';
  end if;

  perform set_config('fleetdesk.trusted_profile_write', '1', true);
  insert into companies(name) values (trim(p_company)) returning id into v_company;
  insert into profiles(id, company_id, full_name, role)
    values (auth.uid(), v_company, nullif(trim(p_full_name), ''), 'admin_societe')
    on conflict (id) do update
      set company_id = excluded.company_id, full_name = excluded.full_name, role = 'admin_societe';
  perform set_config('fleetdesk.trusted_profile_write', '', true);
  return v_company;
end $$;

-- ------------------------------------------------------------
-- 1. Réservations : dérivation et contrôles avant écriture
--    - agence = agence du véhicule (le trigger de 0007 mettrait celle de l'appelant,
--      NULL pour un admin → violation NOT NULL) ;
--    - tarif journalier par défaut = tarif de la catégorie ;
--    - véhicule et client doivent appartenir à la même société (les FK ne le vérifient pas) ;
--    - pas de réservation sur un véhicule hors service ou en maintenance sur la période.
--    Nom en « 00_ » : s'exécute AVANT trg_booking_total et trg_tenant_defaults_bookings.
-- ------------------------------------------------------------
create or replace function public.fn_prepare_booking() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v        vehicles%rowtype;
  v_rate   numeric;
  v_cust   uuid;
  v_from   date;
  v_to     date;
begin
  select * into v from vehicles where id = new.vehicle_id;
  if not found then
    raise exception 'Véhicule introuvable';
  end if;
  if new.company_id is not null and new.company_id <> v.company_id then
    raise exception 'Véhicule introuvable';
  end if;

  select company_id into v_cust from customers where id = new.customer_id;
  if v_cust is distinct from v.company_id then
    raise exception 'Client introuvable';
  end if;

  new.company_id := v.company_id;
  if tg_op = 'INSERT' or new.vehicle_id is distinct from old.vehicle_id then
    new.agency_id := v.agency_id;
  end if;

  if new.daily_rate is null then
    select daily_rate into v_rate from vehicle_categories where id = v.category_id;
    new.daily_rate := coalesce(v_rate, 0);
  end if;

  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;

  if new.status in ('pending','confirmed','active')
     and (tg_op = 'INSERT'
          or new.status is distinct from old.status
          or new.vehicle_id is distinct from old.vehicle_id
          or new.start_at is distinct from old.start_at
          or new.end_at is distinct from old.end_at) then

    if v.status = 'hors_service' then
      raise exception 'Ce véhicule est hors service';
    end if;

    v_from := (new.start_at at time zone 'Africa/Tunis')::date;
    v_to   := ((new.end_at - interval '1 second') at time zone 'Africa/Tunis')::date;
    if exists (
      select 1 from maintenance_records m
      where m.vehicle_id = new.vehicle_id
        and daterange(m.start_date, m.end_date + 1, '[)') && daterange(v_from, v_to + 1, '[)')
    ) then
      raise exception 'Ce véhicule est en maintenance sur cette période';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists trg_booking_00_prepare on bookings;
create trigger trg_booking_00_prepare
  before insert or update on bookings
  for each row execute function public.fn_prepare_booking();

-- ------------------------------------------------------------
-- 2. Disponibilité (calendrier, page Assistant, Edge Function ai-assistant)
--    Remplace la version de 0005, même signature :
--    - agence facultative (NULL = toutes) ;
--    - un véhicule « loué » aujourd'hui peut être libre la semaine prochaine :
--      seuls « hors service » et les conflits (réservations / maintenance) l'excluent ;
--    - une maintenance sans date de fin bloque indéfiniment (avant : un seul jour).
-- ------------------------------------------------------------
create or replace function public.search_available_vehicles(
  p_agency uuid, p_start timestamptz, p_end timestamptz, p_category uuid default null)
returns setof vehicles language sql stable as $$
  select v.* from vehicles v
  where (p_agency is null or v.agency_id = p_agency)
    and v.status <> 'hors_service'
    and (p_category is null or v.category_id = p_category)
    and not exists (
      select 1 from bookings b
      where b.vehicle_id = v.id
        and b.status in ('pending','confirmed','active')
        and b.period && tstzrange(p_start, p_end, '[)'))
    and not exists (
      select 1 from maintenance_records m
      where m.vehicle_id = v.id
        and daterange(m.start_date, m.end_date + 1, '[)')
            && daterange((p_start at time zone 'Africa/Tunis')::date,
                         ((p_end - interval '1 second') at time zone 'Africa/Tunis')::date + 1, '[)'))
$$;

-- ------------------------------------------------------------
-- 3. Contrats : création → signature → clôture
-- ------------------------------------------------------------
-- Création (INVOKER : la RLS « contracts_insert » limite déjà aux admin/gestionnaire/agent ;
-- contract_no et company_id sont posés par les triggers de 0003/0007).
create or replace function public.create_contract_from_booking(p_booking uuid, p_deposit numeric default 0)
returns uuid language plpgsql set search_path = public as $$
declare b bookings%rowtype; v_id uuid;
begin
  select * into b from bookings where id = p_booking;
  if not found then raise exception 'Réservation introuvable'; end if;
  if b.status not in ('pending','confirmed') then
    raise exception 'Cette réservation ne peut plus recevoir de contrat';
  end if;
  if exists (select 1 from contracts where booking_id = p_booking) then
    raise exception 'Un contrat existe déjà pour cette réservation';
  end if;

  insert into contracts (booking_id, deposit)
  values (p_booking, greatest(coalesce(p_deposit, 0), 0))
  returning id into v_id;

  update bookings set status = 'confirmed' where id = p_booking and status = 'pending';
  return v_id;
end $$;

-- Signature : le véhicule passe « loué ». DEFINER car un agent ne peut pas écrire dans vehicles.
create or replace function public.sign_contract(p_contract uuid, p_signed_by text)
returns void language plpgsql security definer set search_path = public as $$
declare c contracts%rowtype; b bookings%rowtype;
begin
  if auth_role() not in ('admin_societe','gestionnaire_agence','agent') then
    raise exception 'Action non autorisée' using errcode = '42501';
  end if;
  select * into c from contracts where id = p_contract and company_id = auth_company_id();
  if not found then raise exception 'Contrat introuvable'; end if;
  if c.signed_at is not null then raise exception 'Contrat déjà signé'; end if;
  if coalesce(trim(p_signed_by), '') = '' then raise exception 'Nom du signataire requis'; end if;

  select * into b from bookings where id = c.booking_id;
  if b.status not in ('pending','confirmed') then
    raise exception 'La réservation liée n''est plus valide';
  end if;

  update contracts set signed_at = now(), signed_by = trim(p_signed_by) where id = c.id;
  update bookings  set status = 'active' where id = b.id;
  update vehicles  set status = 'loue'   where id = b.vehicle_id;
end $$;

-- Clôture : réservation terminée, véhicule libéré (+ compteur). DEFINER pour la même raison.
-- La facture est ensuite créée par le billing-service (POST /invoices/from-contract/:id).
create or replace function public.close_contract(p_contract uuid, p_return_km int default null)
returns void language plpgsql security definer set search_path = public as $$
declare c contracts%rowtype; b bookings%rowtype;
begin
  if auth_role() not in ('admin_societe','gestionnaire_agence','agent') then
    raise exception 'Action non autorisée' using errcode = '42501';
  end if;
  select * into c from contracts where id = p_contract and company_id = auth_company_id();
  if not found then raise exception 'Contrat introuvable'; end if;
  if c.signed_at is null then raise exception 'Le contrat doit être signé avant la clôture'; end if;
  if c.closed_at is not null then raise exception 'Contrat déjà clôturé'; end if;
  if p_return_km is not null and p_return_km < 0 then raise exception 'Kilométrage invalide'; end if;

  select * into b from bookings where id = c.booking_id;
  update contracts set closed_at = now() where id = c.id;
  update bookings  set status = 'completed' where id = b.id;
  update vehicles
     set status     = case when status = 'loue' then 'disponible'::vehicle_status else status end,
         mileage_km = greatest(mileage_km, coalesce(p_return_km, mileage_km))
   where id = b.vehicle_id;
end $$;

-- ------------------------------------------------------------
-- 4. Paiements et retards
-- ------------------------------------------------------------
-- INVOKER : « payments_write » et « invoices_update » limitent déjà à admin/comptable.
create or replace function public.record_payment(p_invoice uuid, p_amount numeric, p_method payment_method)
returns numeric language plpgsql set search_path = public as $$
declare i invoices%rowtype; v_paid numeric;
begin
  if auth_role() not in ('admin_societe','comptable') then
    raise exception 'Action non autorisée' using errcode = '42501';
  end if;
  select * into i from invoices where id = p_invoice for update;
  if not found then raise exception 'Facture introuvable'; end if;
  if i.status in ('payee','annulee') then raise exception 'Cette facture n''accepte plus de paiement'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Montant invalide'; end if;

  select coalesce(sum(amount), 0) into v_paid from payments where invoice_id = i.id;
  if v_paid + p_amount > i.amount_ttc + 0.005 then
    raise exception 'Le paiement dépasse le solde restant (%)', round(i.amount_ttc - v_paid, 2);
  end if;

  insert into payments (invoice_id, amount, method) values (i.id, p_amount, p_method);
  if v_paid + p_amount >= i.amount_ttc - 0.005 then
    update invoices set status = 'payee' where id = i.id;
  end if;
  return round(i.amount_ttc - v_paid - p_amount, 2);
end $$;

-- Passe « émise » → « en retard » pour la société de l'appelant (la RLS limite l'écriture
-- à admin/comptable : pour les autres rôles, 0 ligne modifiée). Le cron du billing-service
-- fait la même chose pour toutes les sociétés.
create or replace function public.refresh_overdue_invoices() returns int
language plpgsql set search_path = public as $$
declare n int;
begin
  update invoices set status = 'en_retard'
   where status = 'emise' and due_date < (now() at time zone 'Africa/Tunis')::date;
  get diagnostics n = row_count;
  return n;
end $$;

-- Idempotence de la facturation au niveau base : une seule facture active par contrat
-- (le billing-service gère déjà le cas, ceci protège contre deux appels simultanés).
do $$
begin
  if exists (select 1 from invoices where status <> 'annulee' group by contract_id having count(*) > 1) then
    raise notice '0008 : doublons de factures existants — index unique non créé (à nettoyer d''abord).';
  else
    create unique index if not exists ux_invoices_one_active_per_contract
      on invoices (contract_id) where status <> 'annulee';
  end if;
end $$;

-- ------------------------------------------------------------
-- 5. Invitations : rattachement d'un utilisateur DÉJÀ inscrit
--    (handle_new_user de 0003 ne couvre que les inscriptions postérieures à l'invitation)
-- ------------------------------------------------------------
create or replace function public.accept_invitation() returns uuid
language plpgsql security definer set search_path = public as $$
declare inv invitations%rowtype; v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null or v_email = '' then return null; end if;
  if exists (select 1 from profiles where id = auth.uid() and company_id is not null) then return null; end if;

  select * into inv from invitations
   where lower(email) = v_email and accepted_at is null and expires_at > now()
   order by created_at desc limit 1;
  if not found then return null; end if;

  perform set_config('fleetdesk.trusted_profile_write', '1', true);
  insert into profiles (id, company_id, agency_id, full_name, role)
  values (auth.uid(), inv.company_id, inv.agency_id, split_part(v_email, '@', 1), inv.role)
  on conflict (id) do update
    set company_id = excluded.company_id, agency_id = excluded.agency_id, role = excluded.role;
  perform set_config('fleetdesk.trusted_profile_write', '', true);

  update invitations set accepted_at = now() where id = inv.id;
  return inv.company_id;
end $$;

-- ------------------------------------------------------------
-- 6. Données de démonstration pour une société VIDE (bouton « Charger la démo », admin)
--    La société « FleetDesk Demo » de seed.sql n'est pas concernée (elle a déjà des véhicules).
-- ------------------------------------------------------------
create or replace function public.seed_demo_data() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company uuid := auth_company_id();
  a_tunis uuid; a_sousse uuid;
  c_eco uuid; c_comp uuid; c_suv uuid; c_util uuid;
  r record; cid uuid; cust uuid[] := '{}';
  v_b uuid; v_c uuid; v_i uuid;
begin
  if auth_role() <> 'admin_societe' then
    raise exception 'Réservé à l''administrateur' using errcode = '42501';
  end if;
  if exists (select 1 from vehicles where company_id = v_company) then
    raise exception 'Des véhicules existent déjà : démo non chargée';
  end if;

  insert into agencies (company_id, name, city, address, phone)
    values (v_company, 'Agence Tunis Centre', 'Tunis', 'Avenue Habib Bourguiba', '+216 71 000 001') returning id into a_tunis;
  insert into agencies (company_id, name, city, address, phone)
    values (v_company, 'Agence Sousse', 'Sousse', 'Boulevard 14 Janvier', '+216 73 000 002') returning id into a_sousse;

  insert into vehicle_categories (company_id, name, daily_rate) values (v_company, 'Économique', 80)  returning id into c_eco;
  insert into vehicle_categories (company_id, name, daily_rate) values (v_company, 'Compacte',   110) returning id into c_comp;
  insert into vehicle_categories (company_id, name, daily_rate) values (v_company, 'SUV',        180) returning id into c_suv;
  insert into vehicle_categories (company_id, name, daily_rate) values (v_company, 'Utilitaire', 150) returning id into c_util;

  for r in select * from (values
    ('201 TN 4521','Peugeot','208',2023,18500,'t','e'), ('202 TN 7733','Renault','Clio',2022,32100,'t','e'),
    ('203 TN 1180','Volkswagen','Golf',2023,21400,'t','c'), ('204 TN 9042','Hyundai','Tucson',2024,9800,'t','s'),
    ('205 TN 3317','Renault','Kangoo',2021,58200,'t','u'), ('301 TN 6610','Kia','Picanto',2023,15200,'s','e'),
    ('302 TN 2285','Seat','Ibiza',2022,40800,'s','c'), ('303 TN 8154','Dacia','Duster',2023,27300,'s','s'),
    ('304 TN 5029','Toyota','Yaris',2024,6100,'s','e'), ('305 TN 7418','Citroën','Berlingo',2022,44700,'s','u')
  ) as t(plate, brand, model, yr, km, ag, cat) loop
    insert into vehicles (company_id, agency_id, category_id, plate, brand, model, year, mileage_km)
    values (v_company,
            case r.ag when 't' then a_tunis else a_sousse end,
            case r.cat when 'e' then c_eco when 'c' then c_comp when 's' then c_suv else c_util end,
            r.plate, r.brand, r.model, r.yr, r.km);
  end loop;

  for r in select * from (values
    ('Sami Ben Salah','sami.bensalah@example.com','+216 20 111 222','TN-123456'),
    ('Leïla Trabelsi','leila.trabelsi@example.com','+216 22 333 444','TN-234567'),
    ('Marc Dupont','marc.dupont@example.com','+33 6 12 34 56 78','FR-998877'),
    ('Yasmine Gharbi','yasmine.gharbi@example.com','+216 25 555 666','TN-345678'),
    ('Karim Jlassi','karim.jlassi@example.com','+216 98 777 888','TN-456789'),
    ('Emma Rossi','emma.rossi@example.com','+39 333 123 4567','IT-554433')
  ) as t(n, e, p, l) loop
    insert into customers (company_id, full_name, email, phone, license_no)
    values (v_company, r.n, r.e, r.p, r.l) returning id into cid;
    cust := cust || cid;
  end loop;

  -- 3 locations terminées : contrat clôturé + facture (payée / en retard / émise)
  insert into bookings (company_id, vehicle_id, customer_id, start_at, end_at, status)
  values (v_company, (select id from vehicles where company_id = v_company and plate = '201 TN 4521'), cust[1],
          now() - interval '25 days', now() - interval '21 days', 'completed') returning id into v_b;
  insert into contracts (company_id, booking_id, signed_at, signed_by, closed_at)
  values (v_company, v_b, now() - interval '25 days', 'Sami Ben Salah', now() - interval '21 days') returning id into v_c;
  insert into invoices (company_id, contract_id, amount_ht, amount_ttc, status, due_date)
  select v_company, v_c, total_amount, round(total_amount * 1.19, 2), 'payee', current_date - 6 from bookings where id = v_b
  returning id into v_i;
  insert into payments (company_id, invoice_id, amount, method)
  select v_company, v_i, amount_ttc, 'carte' from invoices where id = v_i;

  insert into bookings (company_id, vehicle_id, customer_id, start_at, end_at, status)
  values (v_company, (select id from vehicles where company_id = v_company and plate = '204 TN 9042'), cust[2],
          now() - interval '18 days', now() - interval '12 days', 'completed') returning id into v_b;
  insert into contracts (company_id, booking_id, signed_at, signed_by, closed_at)
  values (v_company, v_b, now() - interval '18 days', 'Leïla Trabelsi', now() - interval '12 days') returning id into v_c;
  insert into invoices (company_id, contract_id, amount_ht, amount_ttc, status, due_date)
  select v_company, v_c, total_amount, round(total_amount * 1.19, 2), 'en_retard', current_date - 2 from bookings where id = v_b;

  insert into bookings (company_id, vehicle_id, customer_id, start_at, end_at, status)
  values (v_company, (select id from vehicles where company_id = v_company and plate = '302 TN 2285'), cust[4],
          now() - interval '9 days', now() - interval '6 days', 'completed') returning id into v_b;
  insert into contracts (company_id, booking_id, signed_at, signed_by, closed_at)
  values (v_company, v_b, now() - interval '9 days', 'Yasmine Gharbi', now() - interval '6 days') returning id into v_c;
  insert into invoices (company_id, contract_id, amount_ht, amount_ttc, status, due_date)
  select v_company, v_c, total_amount, round(total_amount * 1.19, 2), 'emise', current_date + 9 from bookings where id = v_b;

  -- 2 locations en cours (dont un retour aujourd'hui)
  insert into bookings (company_id, vehicle_id, customer_id, start_at, end_at, status)
  values (v_company, (select id from vehicles where company_id = v_company and plate = '203 TN 1180'), cust[3],
          now() - interval '3 days', now() + interval '2 days', 'active') returning id into v_b;
  insert into contracts (company_id, booking_id, signed_at, signed_by, deposit) values (v_company, v_b, now() - interval '3 days', 'Marc Dupont', 300);
  update vehicles set status = 'loue' where id = (select vehicle_id from bookings where id = v_b);

  insert into bookings (company_id, vehicle_id, customer_id, start_at, end_at, status)
  values (v_company, (select id from vehicles where company_id = v_company and plate = '303 TN 8154'), cust[5],
          now() - interval '4 days', now() + interval '2 hours', 'active') returning id into v_b;
  insert into contracts (company_id, booking_id, signed_at, signed_by, deposit) values (v_company, v_b, now() - interval '4 days', 'Karim Jlassi', 400);
  update vehicles set status = 'loue' where id = (select vehicle_id from bookings where id = v_b);

  -- Réservations à venir
  insert into bookings (company_id, vehicle_id, customer_id, start_at, end_at, status) values
    (v_company, (select id from vehicles where company_id = v_company and plate = '202 TN 7733'), cust[6], now() + interval '1 day', now() + interval '4 days', 'confirmed'),
    (v_company, (select id from vehicles where company_id = v_company and plate = '301 TN 6610'), cust[1], now() + interval '2 days', now() + interval '6 days', 'confirmed'),
    (v_company, (select id from vehicles where company_id = v_company and plate = '201 TN 4521'), cust[2], now() + interval '5 days', now() + interval '9 days', 'pending'),
    (v_company, (select id from vehicles where company_id = v_company and plate = '204 TN 9042'), cust[4], now() + interval '3 days', now() + interval '8 days', 'confirmed');

  -- Véhicule en maintenance
  insert into maintenance_records (company_id, vehicle_id, type, description, start_date, end_date, cost)
  values (v_company, (select id from vehicles where company_id = v_company and plate = '305 TN 7418'),
          'preventive', 'Vidange + freins', current_date - 1, current_date + 2, 320);
  update vehicles set status = 'maintenance' where company_id = v_company and plate = '305 TN 7418';
end $$;

-- ------------------------------------------------------------
-- 7. Droits d'exécution (seuls les utilisateurs connectés ; jamais anon)
-- ------------------------------------------------------------
revoke execute on function
  public.create_contract_from_booking(uuid, numeric), public.sign_contract(uuid, text),
  public.close_contract(uuid, int), public.record_payment(uuid, numeric, payment_method),
  public.refresh_overdue_invoices(), public.accept_invitation(), public.seed_demo_data()
from public, anon;
revoke execute on function public.create_company_and_admin(text, text) from public, anon;
grant execute on function
  public.create_contract_from_booking(uuid, numeric), public.sign_contract(uuid, text),
  public.close_contract(uuid, int), public.record_payment(uuid, numeric, payment_method),
  public.refresh_overdue_invoices(), public.accept_invitation(), public.seed_demo_data(),
  public.search_available_vehicles(uuid, timestamptz, timestamptz, uuid),
  public.create_company_and_admin(text, text)
to authenticated;
