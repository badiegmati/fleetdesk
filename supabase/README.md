# supabase/

| Élément | Rôle |
|---|---|
| `migrations/0001 → 0007` | Schéma, RLS, rôles, anti-double-réservation, Realtime/Storage/cron, correctif des triggers |
| `migrations/0008_app_workflows.sql` | **Phase 2** : RPC contrat/signature/clôture/paiement, validation des réservations, onboarding corrigé, invitations, démo |
| `seed.sql`, `seed_profiles.sql` | Société « FleetDesk Demo » et comptes démo |
| `tests/rls.test.sql` | 7 tests d'isolation et de rôles |
| `tests/workflows.test.sql` | 10 tests des workflows de 0008 (transaction annulée à la fin) |
| `functions/` | Edge Functions `ai-assistant`, `forecast-demand`, `damage-check` (Gemini) |
| `verify_all.sql` | Contrôle de l'état de la base |

Ordre d'application : 0001 → 0008 (SQL Editor, ou `supabase db push`). Détails et décisions : [`docs/supabase.md`](../docs/supabase.md).

## Secrets des Edge Functions

    .\scripts\setup_ai.ps1        # recommandé : teste la clé, enregistre les secrets, déploie

    # ou à la main (toujours avec --project-ref, la CLI n'est pas liée dans un dossier fraîchement copié) :
    npx supabase secrets set "GEMINI_API_KEY=<clé>" "GEMINI_MODEL=gemini-3.6-flash" "CRON_SECRET=<valeur aléatoire>" --project-ref <ref>
    npx supabase functions deploy ai-assistant forecast-demand damage-check --project-ref <ref> --use-api

`forecast-demand` **refuse de répondre sans `CRON_SECRET`** (elle n'exige pas de JWT et utilise la clé service_role).
`GEMINI_MODEL` fait foi : les modèles Gemini sont retirés régulièrement ; en cas d'erreur « modèle indisponible », change ce secret.
