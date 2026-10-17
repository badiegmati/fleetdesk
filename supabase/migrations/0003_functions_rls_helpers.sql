-- ============================================================
-- 0003 — Fonctions utilitaires, triggers et RPC d'administration
-- ============================================================

-- ------------------------------------------------------------
-- Helpers RLS
-- ------------------------------------------------------------
create or replace function public.auth_company_id() returns uuid
language sql stable security definer set search_path = public as $$
  select company_id from profiles where id = auth.uid()
$$;

create or replace function public.auth_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function public.auth_agency_id() returns uuid
language sql stable security definer set search_path = public as $$
  select agency_id from profiles where id = auth.uid()
$$;

-- ------------------------------------------------------------
-- Remplissage automatique de company_id / agency_id (inchangé)
-- ------------------------------------------------------------
create or replace function public.fn_fill_tenant_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb := to_jsonb(new);
begin
  if new.company_id is null then
    new.company_id := auth_company_id();
  end if;

  if (v_row ? 'agency_id') and new.agency_id is null then
    new.agency_id := auth_agency_id();
  end if;

  return new;
end;
$$;

create trigger trg_tenant_defaults_vehicle_categories
  before insert on vehicle_categories for each row execute function fn_fill_tenant_defaults();
create trigger trg_tenant_defaults_vehicles
  before insert on vehicles for each row execute function fn_fill_tenant_defaults();
create trigger trg_tenant_defaults_customers
  before insert on customers for each row execute function fn_fill_tenant_defaults();
create trigger trg_tenant_defaults_bookings
  before insert on bookings for each row execute function fn_fill_tenant_defaults();
create trigger trg_tenant_defaults_contracts
  before insert on contracts for each row execute function fn_fill_tenant_defaults();
create trigger trg_tenant_defaults_inspections
  before insert on inspections for each row execute function fn_fill_tenant_defaults();
create trigger trg_tenant_defaults_invoices
  before insert on invoices for each row execute function fn_fill_tenant_defaults();
create trigger trg_tenant_defaults_payments
  before insert on payments for each row execute function fn_fill_tenant_defaults();
create trigger trg_tenant_defaults_maintenance
  before insert on maintenance_records for each row execute function fn_fill_tenant_defaults();

-- ------------------------------------------------------------
-- Calcul automatique du montant total d'une réservation (inchangé)
-- ------------------------------------------------------------
create or replace function public.fn_compute_booking_total()
returns trigger
language plpgsql
as $$
declare
  v_days int;
begin
  v_days := greatest(1, ceil(extract(epoch from (new.end_at - new.start_at)) / 86400.0)::int);
  new.total_amount := round(new.daily_rate * v_days, 2);
  return new;
end;
$$;

create trigger trg_booking_total
  before insert or update of start_at, end_at, daily_rate on bookings
  for each row execute function fn_compute_booking_total();

-- ------------------------------------------------------------
-- Génération des numéros de contrat / facture
-- ------------------------------------------------------------
create or replace function public.next_document_number(p_company uuid, p_kind text, p_prefix text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next bigint;
begin
  if p_company is null then
    raise exception 'next_document_number: company_id ne peut pas être nul';
  end if;

  insert into doc_sequences(company_id, kind, last_value)
    values (p_company, p_kind, 1)
  on conflict (company_id, kind)
    do update set last_value = doc_sequences.last_value + 1
  returning last_value into v_next;

  return p_prefix || '-' || to_char(now(), 'YYYY') || '-' || lpad(v_next::text, 6, '0');
end;
$$;

-- CORRECTION #3 : on ne dépend plus de l'ordre d'exécution des triggers.
-- v_company est résolu directement ici (coalesce avec auth_company_id()),
-- au lieu de supposer que fn_fill_tenant_defaults s'est déjà exécuté avant.
create or replace function public.fn_set_contract_no()
returns trigger language plpgsql as $$
declare
  v_company uuid := coalesce(new.company_id, auth_company_id());
begin
  new.company_id := v_company;
  if new.contract_no is null or new.contract_no = '' then
    new.contract_no := public.next_document_number(v_company, 'contract', 'CT');
  end if;
  return new;
end;
$$;
create trigger trg_contract_no
  before insert on contracts
  for each row execute function fn_set_contract_no();

create or replace function public.fn_set_invoice_no()
returns trigger language plpgsql as $$
declare
  v_company uuid := coalesce(new.company_id, auth_company_id());
begin
  new.company_id := v_company;
  if new.invoice_no is null or new.invoice_no = '' then
    new.invoice_no := public.next_document_number(v_company, 'invoice', 'FA');
  end if;
  return new;
end;
$$;
create trigger trg_invoice_no
  before insert on invoices
  for each row execute function fn_set_invoice_no();

-- ------------------------------------------------------------
-- Journal d'audit automatique (inchangé)
-- ------------------------------------------------------------
create or replace function public.fn_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
begin
  v_company := coalesce(new.company_id, old.company_id);

  insert into audit_log(company_id, user_id, action, entity, entity_id, details)
  values (
    v_company,
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    coalesce(new.id, old.id),
    case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end
  );

  return coalesce(new, old);
end;
$$;

create trigger trg_audit_bookings
  after insert or update or delete on bookings
  for each row execute function fn_audit_log();
create trigger trg_audit_contracts
  after insert or update or delete on contracts
  for each row execute function fn_audit_log();
create trigger trg_audit_invoices
  after insert or update or delete on invoices
  for each row execute function fn_audit_log();
create trigger trg_audit_payments
  after insert or update or delete on payments
  for each row execute function fn_audit_log();
create trigger trg_audit_vehicles
  after insert or update or delete on vehicles
  for each row execute function fn_audit_log();

-- ------------------------------------------------------------
-- CORRECTION #2 (AJOUT) : protection contre l'auto-élévation de privilèges.
-- La policy "profiles_update_self" autorise un utilisateur à modifier SA
-- PROPRE ligne (pour changer son nom, etc.), mais RIEN n'empêchait côté RLS
-- de changer aussi son propre "role" ou "company_id" dans la même requête.
-- Ce trigger agit comme filet de sécurité supplémentaire (défense en
-- profondeur, indépendante de la RLS) : si l'appelant a un JWT utilisateur
-- (auth.uid() non nul) ET n'est pas admin_societe, on restaure de force
-- l'ancienne valeur de role/company_id, quoi qu'il essaie d'envoyer.
-- Les scripts d'administration (seed, migrations) exécutés sans JWT
-- (auth.uid() IS NULL) et le service_role (BYPASSRLS) ne sont pas affectés.
-- ------------------------------------------------------------
create or replace function public.fn_protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and coalesce(auth_role(), 'agent'::user_role) <> 'admin_societe' then
    new.role := old.role;
    new.company_id := old.company_id;
  end if;
  return new;
end;
$$;

create trigger trg_profiles_protect_privileges
  before update on profiles
  for each row execute function fn_protect_profile_privileges();

-- ------------------------------------------------------------
-- Création de société + premier admin (inchangé)
-- ------------------------------------------------------------
create or replace function public.create_company_and_admin(p_company text, p_full_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_company uuid;
begin
  if exists (select 1 from profiles where id = auth.uid() and company_id is not null) then
    raise exception 'Utilisateur déjà rattaché à une société';
  end if;
  insert into companies(name) values (p_company) returning id into v_company;
  insert into profiles(id, company_id, full_name, role)
    values (auth.uid(), v_company, p_full_name, 'admin_societe')
    on conflict (id) do update
      set company_id = excluded.company_id, full_name = excluded.full_name, role = 'admin_societe';
  return v_company;
end $$;

-- ------------------------------------------------------------
-- Création d'invitation (admin uniquement) — inchangé
-- ------------------------------------------------------------
create or replace function public.create_invitation(p_email text, p_role user_role, p_agency_id uuid default null)
returns invitations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := auth_company_id();
  v_row invitations;
begin
  if auth_role() <> 'admin_societe' then
    raise exception 'Seul un administrateur peut inviter des utilisateurs';
  end if;

  insert into invitations(company_id, agency_id, email, role, invited_by)
  values (v_company, p_agency_id, lower(p_email), p_role, auth.uid())
  on conflict (company_id, email) do update
    set role = excluded.role,
        agency_id = excluded.agency_id,
        accepted_at = null,
        expires_at = now() + interval '7 days',
        token = gen_random_uuid()
  returning * into v_row;

  return v_row;
end;
$$;

-- ------------------------------------------------------------
-- Auto-provisioning du profil à l'inscription (inchangé)
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite invitations%rowtype;
begin
  select * into v_invite
  from invitations
  where email = lower(new.email)
    and accepted_at is null
    and expires_at > now()
  order by created_at desc
  limit 1;

  if found then
    insert into profiles(id, company_id, agency_id, full_name, role)
    values (
      new.id, v_invite.company_id, v_invite.agency_id,
      coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
      v_invite.role
    )
    on conflict (id) do update
      set company_id = excluded.company_id,
          agency_id = excluded.agency_id,
          role = excluded.role;

    update invitations set accepted_at = now() where id = v_invite.id;
  else
    insert into profiles(id, full_name)
    values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
    on conflict (id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();