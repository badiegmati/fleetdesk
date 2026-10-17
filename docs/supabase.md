> **Note** — Document historique décrivant les migrations 0001 → 0007 et les Edge Functions. La migration **0008** (Phase 2) est décrite dans le [README racine](../README.md). Le modèle IA est configuré par les secrets `GEMINI_API_KEY` et `GEMINI_MODEL`.

# FleetDesk — Documentation du dossier `supabase/`

Ce document explique le rôle de chaque fichier, l'ordre d'exécution,
et comment les pièces s'articulent entre elles (RLS, triggers, Edge Functions).

---

## 1. Vue d'ensemble
supabase/
├── config.toml → configuration du projet pour la CLI
├── seed.sql → jeu de données de démonstration
├── verify_all.sql → script de vérification post-déploiement (outil de diagnostic)
├── migrations/ → schéma SQL, appliqué dans l'ordre numérique
│ ├── 0001_extensions_types.sql
│ ├── 0002_tables.sql
│ ├── 0003_functions_rls_helpers.sql
│ ├── 0004_rls_policies.sql
│ ├── 0005_rpc_search_availability.sql
│ ├── 0006_realtime_cron.sql
│ └── 0007_fix_tenant_defaults_trigger.sql
│   └── 0008_app_workflows.sql        (Phase 2 : RPC contrats/paiements, onboarding corrigé)
├── tests/
│ └── rls.test.sql → tests automatisés d'isolation et de sécurité
└── functions/ → Edge Functions (Deno), déployées séparément
├── _shared/
├── ai-assistant/
├── forecast-demand/
└── damage-check/

text


Tout ce dossier décrit **la base Postgres hébergée côté Supabase**. Rien
ici ne tourne en local : chaque fichier est exécuté une fois sur le
projet distant, via `supabase db push` (migrations) ou
`supabase db query -f ... --linked` (seed, tests, scripts ponctuels).

---

## 2. `config.toml`

Fichier de configuration lu par la CLI Supabase. Dans notre cas, il sert
principalement à déclarer :
- `project_id` : la référence du projet distant (`nwfzuteyhquajkwjxspb`), pour que
  `--linked` sache à quel projet se connecter.
- Les paramètres des Edge Functions : `ai-assistant` et `damage-check`
  exigent un JWT utilisateur valide (`verify_jwt = true`), car elles
  s'exécutent avec les droits de l'appelant et doivent être protégées.
  `forecast-demand` n'a **pas** de JWT utilisateur (elle est déclenchée
  par `pg_cron`), elle vérifie donc elle-même un secret dans l'en-tête
  HTTP (`x-cron-secret`), d'où `verify_jwt = false`.

Les sections `[db]`, `[studio]`, `[storage]` ne sont utiles que si tu
lances un jour un environnement **local** avec Docker — ce que le
projet n'exige pas pour fonctionner, mais que la CLI tente d'utiliser
pour certaines commandes (`db diff`, `db query` sans `--linked`),
d'où les erreurs "Docker not found" que tu as rencontrées quand une
commande oubliait `--linked`.

---

## 3. Les migrations (exécutées UNE FOIS, dans l'ordre, via `supabase db push`)

### 0001 — Extensions et types énumérés
- Active `btree_gist` (nécessaire pour la contrainte anti-chevauchement
  sur `bookings`), `pgcrypto` (génération d'UUID), `pg_cron` (tâches
  planifiées) et `pg_net` (appels HTTP sortants depuis Postgres,
  utilisés pour déclencher les Edge Functions depuis `pg_cron`).
- Déclare les 7 types `enum` du métier : rôles utilisateurs, statuts
  véhicule/réservation/facture, méthode de paiement, type d'état des
  lieux, type de maintenance.

### 0002 — Tables métier
Crée les 18 tables du schéma : `companies`, `agencies`, `profiles`,
`invitations`, `vehicle_categories`, `vehicles`, `customers`,
`bookings`, `contracts`, `inspections`, `invoices`, `payments`,
`maintenance_records`, `demand_forecasts`, `ai_conversations`,
`ai_messages`, `audit_log`, `doc_sequences`.

Deux points structurants :
- **`bookings.period`** est une colonne générée (`tstzrange`) et porte
  la contrainte `exclude using gist (vehicle_id with =, period with &&)
  where (status in (...))`. C'est **la** garantie anti-double-réservation :
  Postgres refuse nativement l'insertion d'une deuxième réservation qui
  chevauche une réservation active sur le même véhicule, même en cas de
  requêtes concurrentes (erreur `23P01`).
- **`doc_sequences`** est une table technique (compteur par société/type
  de document) qui alimente la génération des numéros de contrat/facture
  (voir 0003).

### 0003 — Fonctions utilitaires, triggers, RPC d'administration
Trois familles de fonctions :

1. **Helpers RLS** (`auth_company_id()`, `auth_role()`, `auth_agency_id()`)
   : lisent le profil de l'utilisateur courant (`auth.uid()`) et sont
   utilisées dans **toutes** les policies RLS pour comparer
   `company_id` et vérifier le rôle.

2. **Triggers automatiques** :
   - remplissage de `company_id`/`agency_id` à l'insertion si absents ;
   - calcul automatique de `total_amount` sur une réservation ;
   - génération automatique des numéros de contrat (`CT-2025-000001`)
     et de facture (`FA-2025-000001`) via `next_document_number()` ;
   - journalisation automatique dans `audit_log` sur les tables
     sensibles (bookings, contracts, invoices, payments, vehicles) ;
   - **protection anti-auto-élévation de privilège** :
     `fn_protect_profile_privileges` empêche un utilisateur non-admin
     de changer son propre `role` ou `company_id`, même s'il réussit à
     contourner la policy RLS (défense en profondeur).

3. **RPC d'administration** :
   - `create_company_and_admin(nom, nom_complet)` : crée une société et
     fait de l'appelant son premier `admin_societe` (appelée juste après
     l'inscription du tout premier utilisateur) ;
   - `create_invitation(email, role, agence)` : réservée aux admins,
     crée une invitation que `handle_new_user()` consommera
     automatiquement à l'inscription de la personne invitée ;
   - `handle_new_user()` : trigger sur `auth.users`, crée
     automatiquement un profil `public.profiles` à chaque inscription,
     en respectant une invitation en attente le cas échéant.

### 0004 — Activation de la RLS et policies
Active `row level security` sur les 18 tables, puis définit, table par
table, qui peut lire/écrire quoi. Le principe général répété partout :

```sql
using (company_id = auth_company_id() and auth_role() in (...))
with check (company_id = auth_company_id() and auth_role() in (...))
Point technique important documenté dans le fichier lui-même : pour une
policy FOR ALL, seule la clause WITH CHECK est évaluée à l'INSERT
(USING ne s'applique qu'à SELECT/UPDATE/DELETE). Toutes les
policies ont donc la même condition dupliquée dans USING et
WITH CHECK, sinon une restriction de rôle pourrait être silencieusement
ignorée à la création d'une ligne.

Résumé de la matrice RBAC appliquée au niveau base (pas seulement UI) :

Table	admin_societe	gestionnaire_agence	agent	comptable
agencies	RW	R	R	R
vehicle_categories	RW	RW	R	R
vehicles	RW	RW	R	R
customers	RW	RW	RW	R
bookings	RW	RW	RW	R
contracts / inspections	RW	RW	RW	—
invoices / payments	RW	R (invoices)	—	RW
maintenance_records	RW	RW	R	R
audit_log	R	—	—	—
0005 — RPC de disponibilité et de brouillon de réservation
search_available_vehicles(agence, début, fin, catégorie?) : requête
réutilisée à la fois par le calendrier (filtrage des véhicules libres)
et par l'assistant IA (outil search_available_vehicles). Exécutée en
SECURITY INVOKER (par défaut), donc la RLS s'applique normalement
à l'appelant.
create_booking_draft(...) : point d'entrée unique pour créer un
brouillon de réservation (status='pending', is_ai_draft=true),
utilisé par l'outil IA create_booking_draft. Comme elle est aussi en
SECURITY INVOKER, la policy bookings_write et la contrainte
no_double_booking s'appliquent normalement : l'IA ne peut jamais
contourner les règles métier ni créer une réservation en conflit.
0006 — Realtime, Storage, grants, cron
Ajoute bookings et vehicles à la publication supabase_realtime
(le calendrier écoute ces deux tables pour se mettre à jour en direct).
Crée les 4 buckets Storage privés : vehicle-photos, customer-docs,
inspections, invoices, avec une convention de chemin obligatoire
{company_id}/... et des policies RLS découpées par commande
(select/insert/update/delete séparés) — évite le piège d'une policy
FOR ALL qui laisserait un DELETE libre pour tout le monde.
Ajoute des GRANT EXECUTE explicites sur les fonctions RPC (défense
en profondeur si jamais les droits par défaut de PostgreSQL ont été
révoqués sur l'instance).
Documente (en commentaire) la commande cron.schedule(...) à exécuter
une fois, manuellement, après le déploiement des Edge Functions,
pour déclencher forecast-demand chaque nuit à 2h.
0007 — Correctif de bug sur les triggers "tenant defaults"
Corrige un bug de compilation PL/pgSQL : la fonction originale
fn_fill_tenant_defaults() référençait new.agency_id même sur des
tables qui n'ont pas cette colonne (vehicle_categories, customers,
contracts, inspections, invoices, payments,
maintenance_records), ce qui provoquait l'erreur
record "new" has no field "agency_id" à l'exécution.

Solution : deux fonctions distinctes —

fn_fill_company_default() : remplit uniquement company_id, pour
les tables sans agency_id ;
fn_fill_tenant_defaults() (corrigée) : remplit company_id ET
agency_id, réservée aux tables qui ont réellement les deux colonnes
(vehicles, bookings).
4. seed.sql — jeu de données de démonstration
À exécuter après toutes les migrations, via :

PowerShell

supabase db query -f supabase/seed.sql --linked
Contenu :

Une société démo (FleetDesk Demo) et 2 agences (Tunis, Sousse).
4 catégories de véhicules avec tarifs journaliers.
5 véhicules (dont un en maintenance, pour tester le blocage).
3 clients.
Un enregistrement de maintenance en cours (justifie le statut
maintenance d'un véhicule).
Une réservation confirmée (pour voir le calendrier pré-rempli).
Une section de rattachement des comptes démo : à exécuter après
avoir créé manuellement 4 utilisateurs dans
Dashboard > Authentication > Add user
(admin@fleetdesk-demo.com, gestionnaire@..., agent@...,
comptable@..., mot de passe Demo1234!). Le trigger
handle_new_user() crée un profil "nu" à l'inscription ; cette
section complète ensuite société/agence/rôle.
⚠️ Tous les UUID de ce fichier doivent être des hexadécimaux valides
(0-9a-f uniquement) — c'est la source des erreurs 22P02 rencontrées
et corrigées (v001→e001, cu01→cd01, etc.).

5. tests/rls.test.sql — tests automatisés de sécurité
Fichier autonome et idempotent (se nettoie au début et à la fin),
à exécuter via :

PowerShell

supabase db query -f supabase/tests/rls.test.sql --linked
Mécanisme de simulation de session
Deux fonctions utilitaires définies en tête de fichier :

test_set_session(user_id) : injecte un faux JWT (request.jwt.claims)
et bascule le rôle Postgres courant sur authenticated, pour que les
policies RLS s'appliquent exactement comme pour un vrai appel HTTP
authentifié.
test_reset_session() : annule la simulation.
Les 7 tests
#	Vérifie
1	Un agent de la société A ne voit pas la société B
2	Un agent voit bien ses propres véhicules
3	Un agent ne peut pas créer de catégorie de véhicule (réservé admin/gestionnaire)
4	Un agent ne peut pas lire les factures (réservé admin/gestionnaire/comptable)
5	La contrainte no_double_booking rejette une réservation chevauchante (exclusion_violation, code 23P01)
6	Un agent ne peut pas s'auto-promouvoir admin_societe
7	Un admin de la société B ne voit pas un véhicule de la société A (l'isolation n'a pas d'exception, même pour un admin)
Chaque test utilise RAISE EXCEPTION en cas d'échec (ce qui annule la
transaction et fait remonter une erreur 400 côté CLI) et RAISE NOTICE
en cas de succès. Absence d'erreur = tous les tests ont réussi.

⚠️ Piège rencontré : RAISE NOTICE ne peut s'exécuter que dans un bloc
DO $$ ... $$; — jamais en SQL nu en dehors d'un bloc PL/pgSQL.

6. functions/ — Edge Functions (Deno), déployées séparément
Ne font pas partie des migrations : déployées via
supabase functions deploy <nom>.

_shared/
cors.ts : en-têtes CORS communs + gestion du preflight OPTIONS.
supabaseClient.ts : deux fabriques de client distinctes —
createUserClient(req) : forward le JWT de l'appelant → la RLS
s'applique normalement (utilisé par ai-assistant, damage-check) ;
createServiceClient() : clé service_role, contourne la RLS
(réservé à forecast-demand, tâche interne sans utilisateur).
Expose aussi isAiEnabled() : si GEMINI_API_KEY est absente, les
fonctions IA se désactivent proprement (503) sans casser le reste de
l'app, conformément à la contrainte "IA optionnelle".
ai-assistant/index.ts
Assistant en langage naturel avec function calling (Anthropic).

S'exécute avec le JWT de l'utilisateur → chaque outil appelé
(search_available_vehicles, get_booking, create_booking_draft)
passe par le client RLS, donc l'assistant ne voit jamais plus de
données que l'agent qui l'utilise.
Ne confirme jamais une réservation : create_booking_draft crée
uniquement un brouillon (status='pending', is_ai_draft=true).
Historique conversationnel persistant dans ai_conversations /
ai_messages.
Gère explicitement le cas de conflit (error.code === '23P01') en le
traduisant en message clair pour l'utilisateur.
forecast-demand/index.ts
Prévision de la demande par lissage exponentiel Holt-Winters
(niveau + tendance + saisonnalité hebdomadaire), déterministe (mêmes
paramètres α/β/γ fixes, pas de boîte noire). Déclenchée chaque nuit par
pg_cron (voir migration 0006, commande à activer manuellement), sans
JWT utilisateur — protégée par un secret partagé (x-cron-secret).
Écrit les résultats dans demand_forecasts avec la clé service_role.

damage-check/index.ts
Compare les photos d'état des lieux départ/retour d'un contrat via un
modèle multimodal, et écrit une suggestion (jamais une vérité
définitive) dans inspections.ai_findings. S'exécute avec le JWT de
l'appelant, donc soumise à la RLS sur inspections/contracts.

7. Ordre d'exécution complet (de zéro à un projet fonctionnel)
PowerShell

# 1. Lier le projet local au projet distant (une seule fois)
supabase link --project-ref nwfzuteyhquajkwjxspb

# 2. Appliquer toutes les migrations dans l'ordre
supabase db push

# 3. Vérifier la synchronisation
supabase migration list

# 4. Peupler les données de démo
supabase db query -f supabase/seed.sql --linked

# 5. Créer les 4 comptes démo manuellement (Dashboard > Authentication)

# 6. Rattacher ces comptes à la société démo
supabase db query -f supabase/seed_profiles.sql --linked

# 7. Valider la sécurité avant de brancher le frontend
supabase db query -f supabase/tests/rls.test.sql --linked

# 8. Déployer les Edge Functions
supabase functions deploy ai-assistant
supabase functions deploy damage-check
supabase functions deploy forecast-demand --no-verify-jwt

# 9. Poser les secrets des Edge Functions
supabase secrets set GEMINI_API_KEY=sk-xxx CRON_SECRET=xxx

# 10. Activer la tâche planifiée nocturne (une seule fois, SQL Editor ou CLI)
#     voir le commentaire en fin de 0006_realtime_cron.sql
8. État actuel du projet (constaté)
✅ Migrations 0001 → 0007 appliquées (0008 à appliquer : voir README racine) et synchronisées (local = remote)
✅ 18 tables créées, RLS activée partout
✅ Contrainte anti-double-réservation en place et testée
✅ Seed exécuté (5 véhicules, 3 clients, 1 réservation, 2 agences)
✅ 3 Edge Functions déployées et actives
✅ Secrets IA et cron configurés
✅ 7 tests RLS passés (isolation tenant, RBAC, anti-élévation de
privilège, contrainte d'exclusion)

Reste à faire avant la Phase 2 (frontend Next.js) :

Créer les 4 comptes démo via le Dashboard si ce n'est pas déjà fait
Activer manuellement cron.schedule(...) pour forecast-demand
Générer les types TypeScript : supabase gen types typescript --linked > web/src/types/database.ts
