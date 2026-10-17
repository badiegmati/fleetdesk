-- ============================================================
-- VÉRIFICATION GLOBALE DU PROJET SUPABASE FLEETDESK
-- ============================================================

-- 1. Extensions (0001)
select '1. EXTENSIONS' as section, extname from pg_extension
where extname in ('btree_gist','pgcrypto','pg_cron','pg_net')
order by extname;

-- 2. Types enum (0001)
select '2. TYPES ENUM' as section, typname from pg_type
where typname in ('user_role','vehicle_status','booking_status','invoice_status','payment_method','inspection_type','maintenance_type')
order by typname;

-- 3. Tables attendues (0002)
select '3. TABLES' as section, table_name from information_schema.tables
where table_schema = 'public'
order by table_name;

-- 4. La contrainte anti-double-réservation existe bien
select '4. CONTRAINTE EXCLUDE' as section, conname, contype
from pg_constraint where conname = 'no_double_booking';

-- 5. Fonctions critiques (0003, 0005)
select '5. FONCTIONS' as section, routine_name from information_schema.routines
where routine_schema = 'public'
and routine_name in (
  'auth_company_id','auth_role','auth_agency_id',
  'fn_fill_tenant_defaults','fn_fill_company_default',
  'fn_compute_booking_total','next_document_number',
  'fn_set_contract_no','fn_set_invoice_no','fn_audit_log',
  'fn_protect_profile_privileges','create_company_and_admin',
  'create_invitation','handle_new_user',
  'search_available_vehicles','create_booking_draft'
)
order by routine_name;

-- 6. RLS activée sur TOUTES les tables (0004) — doit matcher la liste de la section 3
select '6. RLS ACTIVEE' as section, tablename, rowsecurity
from pg_tables where schemaname = 'public'
order by tablename;

-- 7. Nombre de policies par table (0004) — doit être > 0 partout sauf doc_sequences
select '7. POLICIES PAR TABLE' as section, tablename, count(*) as nb_policies
from pg_policies where schemaname = 'public'
group by tablename
order by tablename;

-- 8. Triggers actifs (0003, 0007)
select '8. TRIGGERS' as section, event_object_table, trigger_name
from information_schema.triggers
where trigger_schema = 'public'
order by event_object_table, trigger_name;

-- 9. Realtime activé sur bookings/vehicles (0006)
select '9. REALTIME' as section, schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime';

-- 10. Buckets Storage créés (0006)
select '10. STORAGE BUCKETS' as section, id, public from storage.buckets
order by id;

-- 11. Policies Storage (0006)
select '11. STORAGE POLICIES' as section, policyname, cmd
from pg_policies where schemaname = 'storage' and tablename = 'objects'
order by policyname;

-- 12. Tâche pg_cron enregistrée (si déjà configurée manuellement)
select '12. CRON JOBS' as section, jobname, schedule, active
from cron.job;

-- 13. Données de seed présentes
select '13. SEED - companies'  as section, count(*) from companies;
select '13. SEED - agencies'   as section, count(*) from agencies;
select '13. SEED - vehicles'   as section, count(*) from vehicles;
select '13. SEED - customers'  as section, count(*) from customers;
select '13. SEED - bookings'   as section, count(*) from bookings;

-- 14. Profils rattachés (après création des comptes démo)
select '14. PROFILES' as section, full_name, role, company_id is not null as a_une_societe
from profiles order by full_name;

-- 15. Aucune donnée de test RLS qui traîne (doit retourner 0)
select '15. NETTOYAGE TESTS RLS' as section, count(*) as lignes_orphelines
from profiles where id in (
  '10000000-0000-0000-0000-00000000d001',
  '10000000-0000-0000-0000-00000000d002'
);
