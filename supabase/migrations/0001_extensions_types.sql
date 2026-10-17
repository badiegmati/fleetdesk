-- ============================================================
-- 0001 — Extensions et types énumérés
-- ============================================================

-- btree_gist : nécessaire pour la contrainte EXCLUDE anti-chevauchement
create extension if not exists btree_gist;
create extension if not exists pgcrypto;

-- CORRECTION : ces deux extensions manquaient alors qu'elles sont utilisées
-- en section "Tâches planifiées" (pg_cron) et pour les appels HTTP sortants (pg_net).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ============================================================
-- Types énumérés
-- ============================================================
create type user_role as enum ('admin_societe','gestionnaire_agence','agent','comptable');
create type vehicle_status as enum ('disponible','loue','maintenance','hors_service');
create type booking_status as enum ('pending','confirmed','active','completed','cancelled');
create type invoice_status as enum ('brouillon','emise','payee','en_retard','annulee');
create type payment_method as enum ('especes','carte','virement','cheque');
create type inspection_type as enum ('depart','retour');
create type maintenance_type as enum ('preventive','corrective','controle_technique');