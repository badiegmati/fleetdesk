-- ============================================================
-- 0005 — RPC de disponibilité et de création de brouillon de réservation
-- ============================================================

-- Recherche de véhicules disponibles (utilisée par le calendrier ET par
-- l'assistant IA via function calling). SQL "invoker" par défaut :
-- s'exécute avec les droits de l'appelant, donc la RLS s'applique normalement.
create or replace function public.search_available_vehicles(
  p_agency uuid, p_start timestamptz, p_end timestamptz, p_category uuid default null)
returns setof vehicles language sql stable as $$
  select v.* from vehicles v
  where v.agency_id = p_agency
    and v.status = 'disponible'
    and (p_category is null or v.category_id = p_category)
    and not exists (
      select 1 from bookings b
      where b.vehicle_id = v.id
        and b.status in ('pending','confirmed','active')
        and b.period && tstzrange(p_start, p_end, '[)'))
    and not exists (
      select 1 from maintenance_records m
      where m.vehicle_id = v.id
        and daterange(m.start_date, coalesce(m.end_date, m.start_date), '[]')
            && daterange(p_start::date, p_end::date, '[]'))
$$;

-- ------------------------------------------------------------
-- CORRECTION / AJOUT : point d'entrée unique pour créer un brouillon
-- de réservation, utilisé à la fois par l'assistant IA (outil
-- "create_booking_draft") et potentiellement par l'UI.
-- SECURITY INVOKER (par défaut) : la RLS "bookings_write" + la contrainte
-- no_double_booking s'appliquent normalement, l'assistant ne peut donc
-- jamais contourner les règles métier.
-- ------------------------------------------------------------
create or replace function public.create_booking_draft(
  p_agency_id   uuid,
  p_vehicle_id  uuid,
  p_customer_id uuid,
  p_start_at    timestamptz,
  p_end_at      timestamptz,
  p_daily_rate  numeric,
  p_notes       text default null
)
returns bookings
language plpgsql
set search_path = public
as $$
declare
  v_row bookings;
begin
  insert into bookings (
    agency_id, vehicle_id, customer_id, start_at, end_at,
    daily_rate, status, is_ai_draft, notes
  ) values (
    p_agency_id, p_vehicle_id, p_customer_id, p_start_at, p_end_at,
    p_daily_rate, 'pending', true,
    coalesce(p_notes, 'Brouillon créé par l''assistant IA — à valider par un agent.')
  )
  returning * into v_row;

  return v_row;
end;
$$;