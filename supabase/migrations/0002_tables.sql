-- ============================================================
-- 0002 — Tables métier (fichier complet)
-- ============================================================

-- ------------------------------------------------------------
-- Structure (société / agences / utilisateurs)
-- ------------------------------------------------------------
create table companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  currency    text not null default 'TND',
  created_at  timestamptz not null default now()
);

create table agencies (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  name        text not null,
  city        text,
  address     text,
  phone       text,
  created_at  timestamptz not null default now()
);
create index on agencies(company_id);

create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  company_id  uuid references companies(id) on delete cascade,
  agency_id   uuid references agencies(id) on delete set null,
  full_name   text,
  role        user_role not null default 'agent',
  created_at  timestamptz not null default now()
);
create index on profiles(company_id);

create table invitations (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  agency_id    uuid references agencies(id) on delete set null,
  email        text not null,
  role         user_role not null default 'agent',
  invited_by   uuid references profiles(id) on delete set null,
  token        uuid not null default gen_random_uuid(),
  accepted_at  timestamptz,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '7 days'),
  unique (company_id, email)
);
create index on invitations(company_id);
create index on invitations(email);

-- ------------------------------------------------------------
-- Flotte, clients
-- ------------------------------------------------------------
create table vehicle_categories (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  name        text not null,
  daily_rate  numeric(10,2) not null check (daily_rate >= 0)
);
create index on vehicle_categories(company_id);

create table vehicles (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  agency_id     uuid not null references agencies(id) on delete restrict,
  category_id   uuid references vehicle_categories(id) on delete set null,
  plate         text not null,
  brand         text not null,
  model         text not null,
  year          int,
  mileage_km    int not null default 0 check (mileage_km >= 0),
  status        vehicle_status not null default 'disponible',
  photo_path    text,
  created_at    timestamptz not null default now(),
  unique (company_id, plate)
);
create index on vehicles(company_id, agency_id);

create table customers (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  full_name     text not null,
  email         text,
  phone         text,
  id_doc_path   text,
  license_no    text,
  created_at    timestamptz not null default now()
);
create index on customers(company_id);

-- ------------------------------------------------------------
-- Réservations (cœur du produit)
-- ------------------------------------------------------------
create table bookings (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  agency_id    uuid not null references agencies(id) on delete restrict,
  vehicle_id   uuid not null references vehicles(id) on delete restrict,
  customer_id  uuid not null references customers(id) on delete restrict,
  created_by   uuid references profiles(id) on delete set null,
  start_at     timestamptz not null,
  end_at       timestamptz not null,
  status       booking_status not null default 'pending',
  daily_rate   numeric(10,2) not null check (daily_rate >= 0),
  total_amount numeric(12,2) not null default 0,
  notes        text,
  is_ai_draft  boolean not null default false,
  created_at   timestamptz not null default now(),
  check (end_at > start_at),
  period tstzrange generated always as (tstzrange(start_at, end_at, '[)')) stored,
  constraint no_double_booking
    exclude using gist (vehicle_id with =, period with &&)
    where (status in ('pending','confirmed','active'))
);
create index on bookings(company_id, start_at);
create index on bookings(vehicle_id);

create table contracts (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  booking_id    uuid not null unique references bookings(id) on delete cascade,
  contract_no   text not null,
  signed_at     timestamptz,
  signed_by     text,
  deposit       numeric(10,2) not null default 0,
  closed_at     timestamptz,
  created_at    timestamptz not null default now(),
  unique (company_id, contract_no)
);

create table inspections (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  contract_id   uuid not null references contracts(id) on delete cascade,
  type          inspection_type not null,
  mileage_km    int,
  fuel_level    int check (fuel_level between 0 and 100),
  photo_paths   text[] not null default '{}',
  notes         text,
  ai_findings   jsonb,
  created_at    timestamptz not null default now(),
  unique (contract_id, type)
);

-- ------------------------------------------------------------
-- Facturation
-- ------------------------------------------------------------
create table invoices (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id) on delete cascade,
  contract_id       uuid not null references contracts(id) on delete restrict,
  invoice_no        text not null,
  amount_ht         numeric(12,2) not null,
  vat_rate          numeric(5,2) not null default 19,
  amount_ttc        numeric(12,2) not null,
  status            invoice_status not null default 'brouillon',
  due_date          date not null,
  pdf_path          text,
  last_reminder_at  timestamptz,
  created_at        timestamptz not null default now(),
  unique (company_id, invoice_no)
);
create index on invoices(company_id, status, due_date);

create table payments (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  invoice_id  uuid not null references invoices(id) on delete cascade,
  amount      numeric(12,2) not null check (amount > 0),
  method      payment_method not null,
  paid_at     timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Maintenance et IA
-- ------------------------------------------------------------
create table maintenance_records (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  vehicle_id    uuid not null references vehicles(id) on delete cascade,
  type          maintenance_type not null,
  description   text,
  start_date    date not null,
  end_date      date,
  cost          numeric(10,2),
  created_at    timestamptz not null default now()
);

create table demand_forecasts (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  agency_id     uuid references agencies(id) on delete cascade,
  category_id   uuid references vehicle_categories(id) on delete cascade,
  forecast_date date not null,
  predicted     numeric(8,2) not null,
  lower_bound   numeric(8,2),
  upper_bound   numeric(8,2),
  generated_at  timestamptz not null default now(),
  unique nulls not distinct (company_id, agency_id, category_id, forecast_date)
);

create table ai_conversations (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  user_id       uuid not null references profiles(id) on delete cascade,
  title         text,
  created_at    timestamptz not null default now()
);

create table ai_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references ai_conversations(id) on delete cascade,
  role            text not null check (role in ('user','assistant','tool')),
  content         text not null,
  tool_calls      jsonb,
  created_at      timestamptz not null default now()
);

create table audit_log (
  id          bigint generated always as identity primary key,
  company_id  uuid not null,
  user_id     uuid,
  action      text not null,
  entity      text not null,
  entity_id   uuid,
  details     jsonb,
  created_at  timestamptz not null default now()
);

create table doc_sequences (
  company_id  uuid not null references companies(id) on delete cascade,
  kind        text not null check (kind in ('contract','invoice')),
  last_value  bigint not null default 0,
  primary key (company_id, kind)
);