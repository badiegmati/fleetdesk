-- ============================================================
-- 0007 — Correction du bug de compilation PL/pgSQL dans
-- fn_fill_tenant_defaults() : l'accès statique à new.agency_id
-- échoue à la compilation sur les tables qui n'ont pas cette colonne
-- (vehicle_categories, customers, contracts, inspections, invoices,
-- payments, maintenance_records). Seules vehicles et bookings ont
-- réellement une colonne agency_id.
-- Solution : deux fonctions séparées, chacune utilisée uniquement
-- sur les tables où le champ référencé existe réellement.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Supprimer les triggers défaillants sur les tables SANS agency_id
-- ------------------------------------------------------------
drop trigger if exists trg_tenant_defaults_vehicle_categories on vehicle_categories;
drop trigger if exists trg_tenant_defaults_customers on customers;
drop trigger if exists trg_tenant_defaults_contracts on contracts;
drop trigger if exists trg_tenant_defaults_inspections on inspections;
drop trigger if exists trg_tenant_defaults_invoices on invoices;
drop trigger if exists trg_tenant_defaults_payments on payments;
drop trigger if exists trg_tenant_defaults_maintenance on maintenance_records;

-- Les triggers sur vehicles et bookings restent en place pour l'instant,
-- on les recréera proprement ci-dessous avec la fonction corrigée.
drop trigger if exists trg_tenant_defaults_vehicles on vehicles;
drop trigger if exists trg_tenant_defaults_bookings on bookings;

-- ------------------------------------------------------------
-- 2. Nouvelle fonction : company_id uniquement
-- (pour les tables sans colonne agency_id)
-- ------------------------------------------------------------
create or replace function public.fn_fill_company_default()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.company_id is null then
    new.company_id := auth_company_id();
  end if;
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 3. Fonction corrigée : company_id + agency_id
-- (pour les tables qui ont réellement les deux colonnes)
-- ------------------------------------------------------------
create or replace function public.fn_fill_tenant_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.company_id is null then
    new.company_id := auth_company_id();
  end if;
  if new.agency_id is null then
    new.agency_id := auth_agency_id();
  end if;
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 4. Rattacher les triggers corrects à chaque table
-- ------------------------------------------------------------

-- Tables SANS agency_id → fn_fill_company_default
create trigger trg_company_default_vehicle_categories
  before insert on vehicle_categories for each row execute function fn_fill_company_default();
create trigger trg_company_default_customers
  before insert on customers for each row execute function fn_fill_company_default();
create trigger trg_company_default_contracts
  before insert on contracts for each row execute function fn_fill_company_default();
create trigger trg_company_default_inspections
  before insert on inspections for each row execute function fn_fill_company_default();
create trigger trg_company_default_invoices
  before insert on invoices for each row execute function fn_fill_company_default();
create trigger trg_company_default_payments
  before insert on payments for each row execute function fn_fill_company_default();
create trigger trg_company_default_maintenance
  before insert on maintenance_records for each row execute function fn_fill_company_default();

-- Tables AVEC agency_id → fn_fill_tenant_defaults (corrigée)
create trigger trg_tenant_defaults_vehicles
  before insert on vehicles for each row execute function fn_fill_tenant_defaults();
create trigger trg_tenant_defaults_bookings
  before insert on bookings for each row execute function fn_fill_tenant_defaults();