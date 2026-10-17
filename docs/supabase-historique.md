> **Note** — Notes de session historiques (copie brute, mise en forme Markdown partiellement perdue). Référence à jour : [README racine](../README.md).

# FleetDesk — Documentation complète du dossier `supabase/`

Dernière mise à jour : après validation complète de la Phase 1
(schéma, RLS, seed, comptes démo, Edge Functions avec Gemini).

Ce document explique **ce que fait chaque fichier**, **pourquoi il existe**,
et **comment les pièces s'articulent entre elles** pour garantir la sécurité
multi-tenant et le bon fonctionnement de la plateforme.

---

## 1. Vue d'ensemble de l'architecture
supabase/
├── config.toml → configuration CLI (projet lié, Edge Functions)
├── seed.sql → jeu de données de démonstration
├── seed_profiles.sql → rattachement des 4 comptes démo (créé en cours de route)
├── migrations/ → schéma SQL, appliqué UNE FOIS, dans l'ordre
│ ├── 0001_extensions_types.sql
│ ├── 0002_tables.sql
│ ├── 0003_functions_rls_helpers.sql
│ ├── 0004_rls_policies.sql
│ ├── 0005_rpc_search_availability.sql
│ ├── 0006_realtime_cron.sql
│ └── 0007_realtime_cron.sql (correctif d'un bug de trigger)
├── tests/
│ └── rls.test.sql → 7 tests automatisés de sécurité (tous passés ✅)
└── functions/ → Edge Functions (Deno), déployées séparément
├── _shared/
│ ├── cors.ts
│ └── supabaseClient.ts
├── ai-assistant/index.ts → assistant conversationnel (Gemini, testé ✅)
├── forecast-demand/index.ts → prévision Holt-Winters (pg_cron, sans IA)
└── damage-check/index.ts → comparaison photos (Gemini, code prêt)

text


**Principe fondamental** : rien ici ne tourne en local. Chaque fichier
SQL est exécuté une fois sur la base Postgres **hébergée** par Supabase
(via `supabase db push` ou `supabase db query -f ... --linked`), et chaque
Edge Function est déployée indépendamment (`supabase functions deploy`).
Docker n'est jamais nécessaire pour faire fonctionner le projet en
production — seule la commande `supabase db diff` (non utilisée ici)
l'exigerait.

---

## 2. `config.toml` — configuration de la CLI

Référence le projet distant (`project_id`) pour que les commandes avec
`--linked` sachent où se connecter. Déclare aussi, pour chaque Edge
Function, si elle exige un JWT utilisateur valide :

| Fonction | `verify_jwt` | Raison |
|---|---|---|
| `ai-assistant` | `true` | s'exécute avec les droits de l'agent connecté |
| `damage-check` | `true` | idem, lit des inspections soumises à la RLS |
| `forecast-demand` | `false` | appelée par `pg_cron`, pas d'utilisateur ; protégée par un secret `x-cron-secret` à la place |

---

## 3. Les migrations — schéma de base, dans l'ordre d'exécution

### `0001_extensions_types.sql`
**Rôle** : poser les fondations techniques avant toute table.
- `btree_gist` : extension **indispensable** à la contrainte anti-double-
  réservation (permet `EXCLUDE USING gist` sur une colonne `uuid` combinée
  à une plage de temps).
- `pgcrypto` : génération des UUID (`gen_random_uuid()`).
- `pg_cron` : permet de planifier `forecast-demand` chaque nuit.
- `pg_net` : permet à Postgres de faire des appels HTTP sortants
  (nécessaire pour que `pg_cron` déclenche une Edge Function).
- 7 types `enum` qui structurent tout le métier : rôles, statuts véhicule/
  réservation/facture, méthode de paiement, type d'état des lieux, type
  de maintenance. Les enums garantissent qu'aucune valeur incohérente
  (ex: `status = 'en_cours'` au lieu de `'active'`) ne peut être stockée.

### `0002_tables.sql`
**Rôle** : créer les 18 tables du modèle de données.

Groupes logiques :
- **Structure** : `companies` (le tenant), `agencies`, `profiles`
  (utilisateurs liés à `auth.users`), `invitations`.
- **Flotte & clients** : `vehicle_categories`, `vehicles`, `customers`.
- **Cœur transactionnel** : `bookings`, `contracts`, `inspections`.
- **Facturation** : `invoices`, `payments`.
- **Exploitation** : `maintenance_records`.
- **IA** : `demand_forecasts`, `ai_conversations`, `ai_messages`.
- **Gouvernance** : `audit_log`, `doc_sequences` (compteurs internes).

**Point le plus important du fichier** — la table `bookings` :
```sql
period tstzrange generated always as (tstzrange(start_at, end_at, '[)')) stored,
constraint no_double_booking
  exclude using gist (vehicle_id with =, period with &&)
  where (status in ('pending','confirmed','active'))
period est une colonne calculée automatiquement par Postgres à
partir de start_at/end_at. La contrainte EXCLUDE dit : "pour un
même vehicle_id, deux lignes actives ne peuvent jamais avoir des
period qui se chevauchent (&&)". C'est la garantie contre les
doubles réservations, appliquée au niveau base de données — donc valable
même si deux agents cliquent "réserver" exactement en même temps sur
deux machines différentes. Toute tentative en conflit lève l'erreur
Postgres 23P01 (exclusion_violation), que l'application traduit en
message clair.

0003_functions_rls_helpers.sql
Rôle : toute la logique automatique qui tourne "derrière" les requêtes.

a) Helpers RLS — utilisés dans toutes les policies :

SQL

auth_company_id()  -- renvoie la société de l'utilisateur connecté
auth_role()        -- renvoie son rôle
auth_agency_id()   -- renvoie son agence
Chacune lit profiles en filtrant sur auth.uid() (l'identité du JWT
courant). security definer leur permet de lire profiles même si la
RLS sur cette table serait autrement restrictive pour l'appelant.

b) Triggers de remplissage automatique (corrigés en 0007, voir plus
bas) : évitent que le frontend ait à préciser manuellement company_id
à chaque insertion — il est déduit automatiquement de l'utilisateur
connecté.

c) Calcul automatique du montant d'une réservation :

SQL

fn_compute_booking_total()
Recalcule total_amount = daily_rate × nombre_de_jours à chaque
insertion/modification de bookings — impossible d'oublier de le faire
côté frontend, impossible aussi de le falsifier depuis le client.

d) Génération des numéros de document :

SQL

next_document_number(company, kind, prefix) → "CT-2025-000001" / "FA-2025-000001"
Utilise la table doc_sequences comme compteur atomique par société et
par type (contract/invoice), avec ON CONFLICT ... DO UPDATE pour
éviter les doublons même en cas d'insertions concurrentes.

e) Audit automatique :

SQL

fn_audit_log()
À chaque INSERT/UPDATE/DELETE sur bookings, contracts,
invoices, payments, vehicles, une ligne est ajoutée dans
audit_log avec l'auteur (auth.uid()), l'action, et le contenu complet
de la ligne (to_jsonb). Impossible à contourner depuis l'application,
car c'est un trigger serveur, pas un appel explicite.

f) Protection anti-élévation de privilège :

SQL

fn_protect_profile_privileges()
Défense en profondeur : même si une faille RLS permettait à un agent de
lancer un UPDATE sur son propre profil pour changer role ou
company_id, ce trigger annule silencieusement ce changement en
restaurant l'ancienne valeur — sauf si l'appelant est déjà
admin_societe. Testé et validé (Test 6 de rls.test.sql).

g) RPC d'onboarding :

create_company_and_admin(nom, nom_complet) : crée la société et fait
de l'appelant son premier admin. Appelée juste après l'inscription du
tout premier utilisateur (page /onboarding côté frontend).
create_invitation(email, role, agence) : réservée aux admins, crée
une invitation en attente.
handle_new_user() : trigger sur auth.users — à chaque
inscription (même via le Dashboard, comme on l'a fait pour les
comptes démo), un profil public.profiles est créé automatiquement.
S'il existe une invitation en attente pour cet email, le profil hérite
directement de la bonne société/agence/rôle ; sinon il reste "nu"
(company_id = null) jusqu'à ce qu'il soit rattaché manuellement
(c'est exactement ce qu'on a fait avec seed_profiles.sql).
0004_rls_policies.sql
Rôle : activer ROW LEVEL SECURITY sur les 18 tables et définir,
table par table, la matrice des permissions.

Règle technique cruciale, documentée en tête du fichier : pour une
policy FOR ALL, PostgreSQL n'évalue USING que pour
SELECT/UPDATE/DELETE, et WITH CHECK que pour INSERT/UPDATE.
Si on ne met la restriction de rôle que dans USING, un INSERT n'est
jamais vérifié — faille silencieuse. Toutes les policies dupliquent
donc la même condition dans les deux clauses :

SQL

using (company_id = auth_company_id() and auth_role() in (...))
with check (company_id = auth_company_id() and auth_role() in (...))
Matrice RBAC appliquée (vérifiée par les tests) :

Table	admin_societe	gestionnaire_agence	agent	comptable
companies	lecture seule (sa société)	—	—	—
agencies	RW	lecture	lecture	lecture
vehicle_categories	RW	RW	lecture	lecture
vehicles	RW	RW	lecture	lecture
customers	RW	RW	RW	lecture
bookings	RW	RW	RW	lecture
contracts / inspections	RW	RW	RW	—
invoices	RW	lecture	—	RW
payments	RW	lecture	—	RW
maintenance_records	RW	RW	lecture	lecture
audit_log	lecture seule	—	—	—
ai_conversations / ai_messages	propriétaire uniquement, quel que soit le rôle			
Isolation absolue : chaque policy compare systématiquement
company_id = auth_company_id(). Confirmé par les tests : même un
admin_societe d'une société B ne voit jamais une ligne de la
société A (Test 7).

0005_rpc_search_availability.sql
Rôle : exposer deux fonctions métier réutilisables à la fois par le
frontend (calendrier) et par l'IA (function calling).

SQL

search_available_vehicles(agence, début, fin, catégorie?)
Renvoie les véhicules d'une agence qui sont : status = 'disponible',
sans réservation active chevauchant la période demandée, et sans
maintenance planifiée sur cette période. Exécutée en SECURITY
INVOKER (comportement par défaut) : la RLS de l'appelant s'applique
normalement — confirmé en production lors du test de ai-assistant
(seuls les véhicules de la bonne société sont jamais retournés).

SQL

create_booking_draft(agence, véhicule, client, début, fin, tarif, notes?)
Point d'entrée unique pour créer un brouillon de réservation
(status='pending', is_ai_draft=true). Comme elle est aussi en
SECURITY INVOKER, la contrainte no_double_booking et la policy
bookings_write s'appliquent normalement — l'assistant IA ne peut
jamais créer une réservation en conflit ni contourner le RBAC, même s'il
"voulait" le faire.

0006_realtime_cron.sql
Rôle : activer les fonctionnalités transverses.

Realtime : bookings et vehicles ajoutées à la publication
supabase_realtime → le calendrier frontend peut s'abonner et voir les
changements en direct sans recharger la page.
Storage : 4 buckets privés créés (vehicle-photos, customer-docs,
inspections, invoices), chacun avec des policies découpées par
commande (select/insert/update/delete séparés — une policy FOR ALL
aurait laissé un DELETE totalement libre pour n'importe quel rôle,
faille identifiée et corrigée dès l'écriture). Convention de chemin :
{company_id}/..., vérifiée par (storage.foldername(name))[1].
Grants explicites : GRANT EXECUTE sur les fonctions RPC pour le
rôle authenticated — défense en profondeur si jamais les droits par
défaut avaient été révoqués sur l'instance.
Commande cron.schedule(...) (en commentaire, à activer
manuellement une fois les Edge Functions déployées) : déclenche
forecast-demand chaque nuit à 2h via un appel HTTP signé par
CRON_SECRET.
0007_realtime_cron.sql — correctif de bug
Pourquoi il existe : la première version de
fn_fill_tenant_defaults() référençait new.agency_id sur toutes les
tables qui l'utilisaient en trigger — y compris des tables qui n'ont
pas cette colonne (vehicle_categories, customers, contracts,
inspections, invoices, payments, maintenance_records). Résultat :
erreur de compilation PL/pgSQL (record "new" has no field "agency_id")
dès la première tentative d'insertion sur ces tables — découverte lors
de l'exécution du seed.

Correctif : séparation en deux fonctions :

fn_fill_company_default() → uniquement company_id, pour les tables
sans agency_id ;
fn_fill_tenant_defaults() (corrigée) → company_id et
agency_id, réservée à vehicles et bookings qui ont réellement
les deux colonnes.
Les anciens triggers sont DROP, les nouveaux sont recréés avec la
bonne fonction sur la bonne table. Validé : le seed s'exécute
maintenant sans erreur.

4. seed.sql — jeu de données de démonstration
Exécuté une fois après les migrations. Contenu, dans l'ordre :

1 société (FleetDesk Demo), 2 agences (Tunis, Sousse).
4 catégories de véhicules avec tarifs.
5 véhicules, dont 1 explicitement en maintenance (pour tester le
blocage de disponibilité — confirmé fonctionnel : le test IA l'a
exclu automatiquement des résultats).
3 clients.
1 enregistrement de maintenance en cours (justifie le véhicule
maintenance).
1 réservation confirmée (peuple le calendrier dès le premier
chargement du frontend).
Piège rencontré et corrigé : tous les UUID doivent être des
hexadécimaux valides (0-9a-f uniquement). Les identifiants
mnémotechniques v001, cu01, ag01, ve01, cl01, u001 contenaient
des lettres (u, v, g, l) invalides en hexadécimal, provoquant
l'erreur Postgres 22P02: invalid input syntax for type uuid. Corrigés
en e00x, cd0x, a10x, a20x, a30x, d00x respectivement.

4bis. seed_profiles.sql — rattachement des comptes démo
Fichier créé en cours de route (absent du plan initial, ajouté car
nécessaire). Les 4 comptes de démonstration doivent être créés via le
Dashboard (Authentication → Add user, avec Auto Confirm User
coché — sinon email_confirmed_at reste NULL et le login échoue
silencieusement avec invalid_credentials). Le trigger
handle_new_user() crée alors un profil "nu" (company_id = null).
Ce script complète ensuite chaque profil avec la bonne société, agence
et rôle :

Email	Rôle	Agence
admin@fleetdesk-demo.com	admin_societe	—
gestionnaire@fleetdesk-demo.com	gestionnaire_agence	Tunis Centre
agent@fleetdesk-demo.com	agent	Tunis Centre
comptable@fleetdesk-demo.com	comptable	—
Mot de passe pour les 4 : Demo1234!. Validé : ces 4 comptes sont
créés, confirmés et correctement rattachés.

5. tests/rls.test.sql — 7 tests automatisés, tous passés ✅
Fichier autonome et idempotent : nettoie ses données au début et à
la fin, peut être relancé à volonté sans effet de bord.

Mécanisme central
SQL

test_set_session(user_id)   -- simule "je suis connecté en tant que X"
test_reset_session()        -- annule la simulation
test_set_session injecte un faux JWT via set_config('request.jwt.claims', ...)
et bascule le rôle Postgres sur authenticated (set local role authenticated) — exactement les conditions dans lesquelles s'exécute
une vraie requête HTTP authentifiée. Sans ce bascule de rôle, les
policies RLS ne s'appliqueraient pas (le rôle postgres/service_role
les contourne par défaut).

Les 7 tests et ce qu'ils prouvent
#	Test	Preuve apportée
1	Isolation sociétés	Un agent de la société A ne lit aucune ligne de companies concernant la société B
2	Visibilité normale	Un agent voit bien ses propres véhicules (pas de sur-restriction accidentelle)
3	RBAC écriture	Un agent ne peut pas créer de vehicle_categories (réservé admin/gestionnaire)
4	RBAC lecture	Un agent ne peut pas lire la table invoices (réservé admin/gestionnaire/comptable)
5	Anti-double-réservation	Deux réservations chevauchantes sur le même véhicule → la seconde lève exclusion_violation (code 23P01)
6	Anti-élévation de privilège	Un agent qui tente de passer son propre role à admin_societe voit ce changement annulé par le trigger
7	Isolation même pour un admin	Un admin_societe de la société B ne voit jamais un véhicule de la société A — l'isolation n'a aucune exception
Résultat obtenu en production : exécution complète sans erreur
(RAISE EXCEPTION aurait stoppé la transaction au premier échec),
confirmée par 15. NETTOYAGE TESTS RLS → 0 ligne orpheline.

6. functions/ — Edge Functions Deno, déployées séparément
_shared/cors.ts
Gère le preflight CORS (OPTIONS) et fournit jsonResponse() pour
standardiser le format des réponses (headers JSON + CORS cohérents sur
les 3 fonctions).

_shared/supabaseClient.ts
Deux fabriques de client, séparation stricte des responsabilités :

TypeScript

createUserClient(req)    // forward le JWT de l'appelant → RLS appliquée
createServiceClient()    // clé service_role → contourne la RLS
createUserClient est utilisé par ai-assistant et damage-check :
validé en production, l'assistant IA n'a jamais pu voir ou modifier
autre chose que les données de la société de l'agent connecté.
createServiceClient est réservé à forecast-demand, qui n'a pas
d'utilisateur (tâche planifiée) et doit écrire dans demand_forecasts
pour toutes les sociétés.

TypeScript

isAiEnabled()   // true si une clé de modèle IA est configurée
getAiConfig()   // { apiKey, model }
Garantit la dégradation gracieuse exigée par le cahier des charges : si
aucune clé n'est configurée, ai-assistant/damage-check répondent
503 {"error":"ai_disabled"} sans jamais faire planter le reste de
l'application.

Note d'implémentation : le projet utilise finalement l'API
Google Gemini (variable GEMINI_API_KEY, modèle
gemini-flash-latest) plutôt qu'Anthropic, initialement prévu — décision
prise pour des raisons de coût/accessibilité, documentée ici comme
l'exige le cahier des charges ("si une décision n'est pas couverte,
choisis l'option la plus simple et note-la").

ai-assistant/index.ts — ✅ testé et validé en production
Assistant conversationnel avec function calling natif Gemini.

Flux d'exécution :

Décode le sub (user id) directement depuis le JWT (évite de
dépendre d'une session interne au client Supabase, qui n'existe pas
puisque persistSession: false).
Récupère/crée la conversation dans ai_conversations.
Charge l'historique récent (20 derniers messages) pour donner du
contexte au modèle.
Boucle jusqu'à 5 tours : envoie contents + la liste des
functionDeclarations à Gemini ; si le modèle répond par un
functionCall, exécute l'outil correspondant côté Supabase (avec la
RLS de l'utilisateur), renvoie le résultat au modèle (role: "user"
— correction appliquée après qu'un role: "function" ait été
rejeté par l'API avec INVALID_ARGUMENT), puis recommence.
Persiste la réponse finale dans ai_messages et retourne le tout
avec ai_label: "Suggestion IA".
3 outils exposés :

search_available_vehicles → appelle le RPC du même nom.
get_booking → lecture simple d'une réservation (soumise à la RLS).
create_booking_draft → ne confirme jamais une réservation,
crée uniquement un brouillon (is_ai_draft=true, status='pending'),
et traduit explicitement l'erreur 23P01 en message de conflit clair.
Preuve de bon fonctionnement obtenue en test réel : à la question
"Quelles voitures sont disponibles à l'agence Tunis Centre du 20 au 25
décembre 2025 ?", l'assistant a correctement extrait les paramètres,
appelé search_available_vehicles, reçu exactement les 3 véhicules
disponible de cette agence (en excluant celui en maintenance), et
formulé une réponse claire en français rappelant que la validation finale
revient à un agent humain.

forecast-demand/index.ts — pas besoin d'IA
Lissage exponentiel Holt-Winters (niveau + tendance + saisonnalité
hebdomadaire) sur l'historique des réservations, par agence et par
catégorie. Paramètres fixes et documentés (ALPHA=0.3, BETA=0.1,
GAMMA=0.2) — volontairement déterministe, pas de boîte noire,
conforme à l'exigence du cahier des charges ("règles simples et
déterministes"). Fallback en moyenne mobile + écart-type si
l'historique est insuffisant (< 2 × 7 jours).

Appelée par pg_cron sans JWT utilisateur ; protégée par comparaison
du header x-cron-secret avec la variable d'environnement
CRON_SECRET. Utilise createServiceClient() car elle doit écrire des
prévisions pour toutes les sociétés, pas une seule.

damage-check/index.ts — code prêt, pas encore testé en conditions réelles
Compare les photos d'état des lieux départ/retour d'un contrat via le
modèle multimodal Gemini. Contrairement à Anthropic (qui accepte des
URLs d'image directement), Gemini exige les images encodées en
base64 (inlineData) — le code télécharge donc chaque photo signée
depuis Storage (createSignedUrl, TTL 5 minutes) avant de l'envoyer.

Demande une réponse strictement JSON
(generationConfig.responseMimeType: "application/json") contenant une
liste de findings (zone, description, niveau de confiance). Le
résultat est écrit uniquement dans le champ inspections.ai_findings
(jamais dans les champs officiels de l'état des lieux) avec le label
"Suggestion IA" — une validation humaine reste nécessaire avant toute
action. Soumis à la RLS via createUserClient : un agent ne peut
déclencher cette analyse que sur un contrat de sa propre société.

7. Comment tout s'articule — exemple de flux complet
Scénario : un agent demande à l'assistant de créer un brouillon de
réservation.

text

1. Frontend → POST /functions/v1/ai-assistant
   Header: Authorization: Bearer <JWT agent>

2. ai-assistant décode le JWT → user_id
   → createUserClient(req) : le client Supabase hérite du JWT

3. Gemini décide d'appeler l'outil create_booking_draft
   → exécution de supabase.rpc('create_booking_draft', {...})
   → cette RPC est SECURITY INVOKER : elle s'exécute AVEC les droits
     de l'agent, donc :
       a) la policy "bookings_write" vérifie que l'agent a le bon rôle
          et la bonne company_id
       b) la contrainte "no_double_booking" vérifie qu'il n'y a pas
          de chevauchement
   → si conflit : erreur 23P01, remontée à l'agent avec un message clair
   → si OK : ligne insérée avec status='pending', is_ai_draft=true

4. Le trigger fn_compute_booking_total() calcule automatiquement
   total_amount

5. Le trigger fn_audit_log() journalise l'insertion dans audit_log

6. Realtime : la table bookings est publiée → le calendrier d'un
   gestionnaire connecté en parallèle voit apparaître le brouillon
   instantanément

7. Un agent humain doit ensuite valider manuellement ce brouillon
   dans l'interface (changer son status) — l'IA ne l'a jamais fait
   elle-même.
Ce flux illustre pourquoi l'architecture repose sur la base de données
comme unique source de vérité pour la sécurité : que la requête
vienne du frontend, de l'assistant IA, ou d'un futur client mobile, les
mêmes contraintes et policies s'appliquent systématiquement.

8. Séquence complète d'installation (de zéro à fonctionnel)
PowerShell

# 1. Lier le projet local au projet distant
npx supabase link --project-ref nwfzuteyhquajkwjxspb

# 2. Appliquer toutes les migrations
npx supabase db push

# 3. Vérifier la synchronisation
npx supabase migration list

# 4. Peupler les données de démo
npx supabase db query -f supabase/seed.sql --linked

# 5. Créer les 4 comptes démo via Dashboard > Authentication > Add user
#    (cocher "Auto Confirm User", mot de passe Demo1234!)

# 6. Rattacher ces comptes à la société démo
npx supabase db query -f supabase/seed_profiles.sql --linked

# 7. Valider la sécurité
npx supabase db query -f supabase/tests/rls.test.sql --linked

# 8. Déployer les Edge Functions
npx supabase functions deploy ai-assistant
npx supabase functions deploy damage-check
npx supabase functions deploy forecast-demand --no-verify-jwt

# 9. Poser les secrets (sans --linked, pas supporté par cette sous-commande)
npx supabase secrets set GEMINI_API_KEY="<ta clé>"
npx supabase secrets set GEMINI_MODEL="gemini-flash-latest"
npx supabase secrets set CRON_SECRET="<secret aléatoire>"

# 10. Activer la tâche planifiée nocturne (une seule fois, SQL Editor)
#     voir commentaire en fin de 0006_realtime_cron.sql
9. État réellement validé à ce jour
Élément	État
7 migrations SQL	✅ Appliquées, local = remote
18 tables, RLS activée partout	✅ Confirmé par requête pg_tables
Contrainte anti-double-réservation	✅ Testée (Test 5), rejette bien les chevauchements
Isolation multi-tenant	✅ Testée (Tests 1, 2, 7), aucune fuite inter-société
RBAC par rôle	✅ Testé (Tests 3, 4)
Anti-élévation de privilège	✅ Testé (Test 6)
Seed de démonstration	✅ Peuplé sans erreur
4 comptes démo	✅ Créés, confirmés, rattachés aux bons rôles
ai-assistant (Gemini)	✅ Testé de bout en bout avec succès réel (function calling + RLS + garde-fou)
forecast-demand	✅ Déployée, logique indépendante de l'IA
damage-check	⚠️ Code adapté à Gemini, déployé, pas encore testé (nécessite contrat + inspections avec vraies photos)
Frontend Next.js	⏳ Phase 2, pas commencée
Service de facturation Node.js	⏳ Phase 4, pas commencée
10. Dette technique connue / points d'attention pour la suite
Clés API exposées pendant le développement : la clé secrète
Supabase et la clé Gemini ont transité dans les échanges de debug —
à régénérer avant tout déploiement en production réelle.
damage-check non testé : à valider dès que des contrats avec
photos d'inspection réelles existeront (probablement après la Phase 3
du frontend, qui implémente la capture de photos).
cron.schedule(...) pas encore activé : la prévision nocturne ne
tourne pas automatiquement tant que cette commande n'a pas été
exécutée manuellement une fois dans le SQL Editor.
Décision technique à documenter dans le README final du projet :
changement d'Anthropic vers Google Gemini pour les fonctions IA
(raison : accessibilité/coût), avec adaptation du format de
function calling (tool_use/tool_result → functionCall/
functionResponse) et du format image (URL → base64 inline).
text


Ce fichier est prêt à être sauvegardé comme `supabase/README.md`. Veux-tu que j'enchaîne maintenant sur la **Phase 2** (initialisation du frontend Next.js) ?
