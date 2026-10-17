#!/usr/bin/env bash
# Applique stub + migrations 0001→0008 (deux fois pour 0008 : idempotence) puis exécute les tests SQL.
# Usage : DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres supabase/tests/ci/run-tests.sh
# La base visée doit être VIDE et jetable.
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL est requis}"
cd "$(dirname "$0")/../.."

run() { psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q "$@"; }

echo "== Environnement Supabase minimal"
run -f tests/ci/stub.sql

for f in migrations/*.sql; do
  echo "== $f"
  # pg_cron / pg_net n'existent pas sur un Postgres ordinaire : ces lignes sont retirées pour le test.
  sed -E '/create extension if not exists (pg_cron|pg_net)/d' "$f" | run -f -
done

echo "== 0008 rejouée (idempotence)"
sed -E '/create extension if not exists (pg_cron|pg_net)/d' migrations/0008_app_workflows.sql | run -f -

# Les migrations n'accordent pas les droits que Supabase pose par défaut sur le schéma public.
run -c "grant usage on schema public to anon, authenticated, service_role;
        grant all on all tables in schema public to anon, authenticated, service_role;
        grant all on all sequences in schema public to anon, authenticated, service_role;
        grant execute on all functions in schema public to anon, authenticated, service_role;"

for t in tests/rls.test.sql tests/workflows.test.sql; do
  echo "== $t"
  run -f "$t" 2>&1 | tee "/tmp/$(basename "$t").log"
done

grep -q "TOUS LES TESTS RLS SONT PASSÉS" /tmp/rls.test.sql.log
grep -q "TOUS LES TESTS WORKFLOWS" /tmp/workflows.test.sql.log
echo "OK : 7 tests RLS + 10 tests workflows réussis."
