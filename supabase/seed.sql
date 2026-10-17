-- ============================================================
-- Jeu de données de démonstration
-- À exécuter APRÈS les migrations, dans le SQL Editor de Supabase
-- (ou via : supabase db query -f supabase/seed.sql --linked)
--
-- Comptes de démo suggérés (mot de passe : Demo1234!) :
--   admin@fleetdesk-demo.com        → admin_societe
--   gestionnaire@fleetdesk-demo.com → gestionnaire_agence (agence Tunis)
--   agent@fleetdesk-demo.com        → agent (agence Tunis)
--   comptable@fleetdesk-demo.com    → comptable
-- ============================================================

-- ------------------------------------------------------------
-- 1. Société et agences
-- ------------------------------------------------------------
insert into companies (id, name, currency)
values ('00000000-0000-0000-0000-000000000001', 'FleetDesk Demo', 'TND')
on conflict (id) do nothing;

insert into agencies (id, company_id, name, city, address, phone)
values
  ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-000000000001', 'Agence Tunis Centre', 'Tunis', 'Avenue Habib Bourguiba', '+216 70 000 001'),
  ('00000000-0000-0000-0000-00000000a002', '00000000-0000-0000-0000-000000000001', 'Agence Sousse',       'Sousse', 'Rue Léopold Senghor',    '+216 70 000 002')
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 2. Catégories de véhicules
-- ------------------------------------------------------------
insert into vehicle_categories (id, company_id, name, daily_rate)
values
  ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-000000000001', 'Économique', 60),
  ('00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-000000000001', 'Berline',    90),
  ('00000000-0000-0000-0000-00000000c003', '00000000-0000-0000-0000-000000000001', 'SUV',        140),
  ('00000000-0000-0000-0000-00000000c004', '00000000-0000-0000-0000-000000000001', 'Utilitaire', 110)
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 3. Véhicules (IDs corrigés : préfixe "e" au lieu de "v", invalide en hexadécimal)
-- ------------------------------------------------------------
insert into vehicles (id, company_id, agency_id, category_id, plate, brand, model, year, mileage_km, status)
values
  ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000c001', '123 TUN 2024', 'Renault', 'Clio',    2022, 32000, 'disponible'),
  ('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000c002', '124 TUN 2024', 'Peugeot', '308',     2023, 18000, 'disponible'),
  ('00000000-0000-0000-0000-00000000e003', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000c003', '125 TUN 2024', 'Hyundai', 'Tucson',  2023, 9000,  'disponible'),
  ('00000000-0000-0000-0000-00000000e004', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000a002', '00000000-0000-0000-0000-00000000c001', '126 SOU 2024', 'Dacia',   'Sandero', 2021, 54000, 'maintenance'),
  ('00000000-0000-0000-0000-00000000e005', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000a002', '00000000-0000-0000-0000-00000000c004', '127 SOU 2024', 'Fiat',    'Ducato',  2020, 88000, 'disponible')
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 4. Clients (IDs corrigés : préfixe "d00x" au lieu de "cu0x", "u" invalide en hexadécimal)
-- ------------------------------------------------------------
insert into customers (id, company_id, full_name, email, phone, license_no)
values
  ('00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-000000000001', 'Amine Ben Salah',  'amine.bensalah@example.com',  '+216 20 000 001', 'PL-001122'),
  ('00000000-0000-0000-0000-00000000d002', '00000000-0000-0000-0000-000000000001', 'Sarra Jouini',      'sarra.jouini@example.com',    '+216 20 000 002', 'PL-001123'),
  ('00000000-0000-0000-0000-00000000d003', '00000000-0000-0000-0000-000000000001', 'Karim Trabelsi',    'karim.trabelsi@example.com',  '+216 20 000 003', 'PL-001124')
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 5. Maintenance en cours (justifie le véhicule e004 "maintenance")
-- ------------------------------------------------------------
insert into maintenance_records (company_id, vehicle_id, type, description, start_date, end_date, cost)
values (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-00000000e004',
  'corrective',
  'Remplacement embrayage',
  current_date - 1,
  current_date + 2,
  450
);

-- ------------------------------------------------------------
-- 6. Réservation de démonstration (pour voir le calendrier peuplé)
-- ------------------------------------------------------------
insert into bookings (id, company_id, agency_id, vehicle_id, customer_id, start_at, end_at, status, daily_rate)
values (
  '00000000-0000-0000-0000-00000000b001',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-00000000a001',
  '00000000-0000-0000-0000-00000000e002',
  '00000000-0000-0000-0000-00000000d001',
  now() + interval '1 day',
  now() + interval '4 day',
  'confirmed',
  90
)
on conflict do nothing;

-- ============================================================
-- 7. Rattachement des comptes démo
-- À exécuter APRÈS avoir créé les 4 utilisateurs via Supabase Auth
-- (Dashboard > Authentication > Add user).
-- ============================================================
update profiles p
set company_id = '00000000-0000-0000-0000-000000000001',
    role = 'admin_societe',
    full_name = 'Admin Démo'
from auth.users u
where u.email = 'admin@fleetdesk-demo.com' and p.id = u.id;

update profiles p
set company_id = '00000000-0000-0000-0000-000000000001',
    agency_id = '00000000-0000-0000-0000-00000000a001',
    role = 'gestionnaire_agence',
    full_name = 'Gestionnaire Démo'
from auth.users u
where u.email = 'gestionnaire@fleetdesk-demo.com' and p.id = u.id;

update profiles p
set company_id = '00000000-0000-0000-0000-000000000001',
    agency_id = '00000000-0000-0000-0000-00000000a001',
    role = 'agent',
    full_name = 'Agent Démo'
from auth.users u
where u.email = 'agent@fleetdesk-demo.com' and p.id = u.id;

update profiles p
set company_id = '00000000-0000-0000-0000-000000000001',
    role = 'comptable',
    full_name = 'Comptable Démo'
from auth.users u
where u.email = 'comptable@fleetdesk-demo.com' and p.id = u.id;
