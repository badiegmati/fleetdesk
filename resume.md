# FleetDesk — résumé détaillé du projet

> Ce document explique **ce que fait** FleetDesk, **comment il est construit**, **pourquoi** certains choix ont été faits, et
> **comment le lancer, le tester et le déployer**. Il est publié automatiquement sur le site GitHub Pages du dépôt.

## 1. En une phrase

FleetDesk est une plateforme SaaS **multi-sociétés et multi-agences** qui permet à une société de location de véhicules de gérer
sa flotte, ses clients, ses réservations, ses contrats, sa facturation et sa maintenance, avec une couche d'intelligence artificielle
**optionnelle** (assistant, prévision de la demande, aide au contrôle des dommages).

Trois idées guident tout le projet :

1. **La base de données est la source de vérité.** Les règles critiques (pas de double réservation, isolation entre sociétés,
   droits par rôle) sont appliquées par PostgreSQL, pas seulement par l'interface. Un écran peut être contourné, pas une contrainte SQL.
2. **Tout est en ligne, sans Docker.** Supabase (base, authentification, fichiers, temps réel, fonctions), Vercel (site) et Render
   (facturation) : aucun service à installer sur sa machine.
3. **Aucun secret dans le dépôt.** Les clés vivent dans les variables d'environnement des hébergeurs.

## 2. Vue d'ensemble

```
Navigateur ──► Next.js sur Vercel ─────────────────────┐
                 │  (JWT de l'utilisateur)              │ appel serveur → serveur
                 ▼                                      ▼
        Supabase                                 billing-service (Render)
        ├─ PostgreSQL + RLS  ◄── clé service_role ──┤  PDF · e-mails · relances · cron
        ├─ Auth, Storage, Realtime                   │
        └─ Edge Functions (Deno) ──► API Gemini      └─► PDF rangé dans Storage
             ▲
        pg_cron (prévision chaque nuit)
```

| Brique | Technologie | Hébergement | Rôle |
|---|---|---|---|
| `web/` | Next.js 16, React 19, Tailwind 4, Framer Motion, Recharts | Vercel | Interface utilisateur et actions serveur |
| `billing-service/` | Node 20+, Express, TypeScript, PDFKit, Nodemailer, node-cron | Render ou Railway | Création des factures, PDF, e-mails, relances |
| `supabase/` | PostgreSQL 15, SQL, Deno | Supabase | Données, sécurité, fonctions IA |
| `site/` | HTML statique généré par Node | GitHub Pages | Site public de présentation |

### Pourquoi le site n'est pas sur GitHub Pages

GitHub Pages sert uniquement des **fichiers statiques**. L'application a besoin d'un serveur (connexion, cookies de session, actions
serveur, appels vers le service de facturation) : elle tourne donc sur **Vercel**. GitHub Pages héberge la **vitrine** (page d'accueil
et ce résumé), reconstruite automatiquement à chaque modification.

## 3. Structure du dépôt

```
fleetdesk/
├── README.md                    Installation rapide
├── resume.md                    Ce document
├── render.yaml                  Déploiement automatique du billing-service sur Render
├── .github/workflows/           CI, site Pages, déploiement des fonctions, keep-alive
├── web/                         Application Next.js
│   └── src/
│       ├── app/(auth)/          Connexion, inscription, mot de passe oublié, création de société
│       ├── app/(app)/           Dashboard, flotte, clients, réservations, contrats, factures,
│       │                        maintenance, assistant, paramètres
│       ├── components/          ui/ (boutons, cartes, modales, toasts…), motion/, layout/
│       ├── hooks/               useSession, useRealtimeRefresh, useRealtimeBookings, useReducedMotion
│       ├── lib/                 supabase/ (clients), rbac, billing, format, form, ctx, motion
│       └── proxy.ts             Rafraîchit la session Supabase (équivalent de middleware.ts)
├── billing-service/src/         server, config, middleware/, routes/, services/, jobs/
├── supabase/
│   ├── migrations/              0001 → 0008
│   ├── functions/               ai-assistant, forecast-demand, damage-check, _shared
│   ├── tests/                   rls.test.sql, workflows.test.sql, ci/ (exécution sur Postgres ordinaire)
│   └── seed.sql, seed_profiles.sql
├── scripts/                     setup_ai.ps1, test_gemini_key.ps1, test_edge_functions.ps1, publish_github.ps1
├── site/                        Générateur du site GitHub Pages
└── docs/                        Notes historiques détaillées
```

## 4. La base de données (Supabase / PostgreSQL)

### 4.1 Les 18 tables

| Table | Contenu |
|---|---|
| `companies` | Les sociétés clientes du SaaS (le « tenant ») : nom, devise |
| `agencies` | Agences d'une société |
| `profiles` | Utilisateurs (liés à `auth.users`) : société, agence, rôle |
| `invitations` | Invitations d'utilisateurs (jeton, rôle, agence, expiration 7 jours) |
| `vehicle_categories` | Catégories et tarif journalier de base |
| `vehicles` | Véhicules : plaque, marque, kilométrage, statut |
| `customers` | Clients loueurs |
| `bookings` | Réservations, avec la contrainte anti-chevauchement |
| `contracts` | Un contrat par réservation : numéro `CT-AAAA-nnnnnn`, signature, clôture |
| `inspections` | États des lieux départ / retour : kilométrage, carburant, photos, résultat IA |
| `invoices` | Factures : numéro `FA-…`, HT, TVA, TTC, statut, chemin du PDF |
| `payments` | Paiements (partiels possibles) |
| `maintenance_records` | Entretiens et immobilisations |
| `demand_forecasts` | Prévisions de la demande (écrites par l'Edge Function) |
| `ai_conversations`, `ai_messages` | Historique de l'assistant, privé à chaque utilisateur |
| `audit_log` | Journal des actions sensibles, lisible par l'administrateur seulement |
| `doc_sequences` | Compteurs pour la numérotation des contrats et factures |

Énumérations : `user_role`, `vehicle_status`, `booking_status`, `invoice_status`, `payment_method`, `inspection_type`, `maintenance_type`.

### 4.2 Les mécanismes de sécurité

- **Row Level Security (RLS)** sur toutes les tables (36 politiques). Les fonctions `auth_company_id()`, `auth_role()` et
  `auth_agency_id()` donnent à chaque politique la société et le rôle de l'utilisateur connecté. Résultat : une requête ne renvoie
  que les lignes de **sa** société, même si le code de l'application se trompait.
- **Anti-double-réservation** : la contrainte `no_double_booking` (`EXCLUDE USING gist`) interdit deux réservations actives
  (`pending`, `confirmed`, `active`) qui se chevauchent sur le même véhicule. Même avec deux requêtes simultanées, PostgreSQL en refuse une
  avec l'erreur `23P01`, que l'interface transforme en message clair.
- **Anti-élévation de privilèges** : le trigger `fn_protect_profile_privileges` empêche un utilisateur de se donner un rôle ou de
  changer de société.
- **Journal d'audit** : un trigger enregistre les opérations sensibles.
- **Valeurs par défaut de société** : à l'insertion, `company_id` est rempli automatiquement depuis l'utilisateur connecté.

### 4.3 Les migrations

| Fichier | Rôle |
|---|---|
| `0001` | Extensions (`btree_gist`, `pgcrypto`, `pg_cron`, `pg_net`) et types |
| `0002` | Création des 18 tables et index |
| `0003` | Fonctions d'aide RLS, triggers, `create_company_and_admin`, `create_invitation`, `handle_new_user` |
| `0004` | Les 36 politiques RLS, par table et par rôle |
| `0005` | `search_available_vehicles` (disponibilités) |
| `0006` | Realtime, buckets Storage privés et leurs politiques, modèle de tâche `pg_cron` |
| `0007` | Correctif des triggers de valeurs par défaut |
| **`0008`** | **Logique métier de l'interface** (voir ci-dessous). Rejouable sans risque. |

### 4.4 La migration 0008 en détail

- `fn_prepare_booking` (trigger sur `bookings`) : déduit l'agence depuis le véhicule, applique le tarif de la catégorie, vérifie que
  véhicule et client appartiennent à la **même société**, et refuse un véhicule hors service ou en maintenance sur la période.
- `search_available_vehicles` améliorée : agence facultative ; un véhicule « loué » aujourd'hui peut être libre la semaine
  prochaine ; une maintenance sans date de fin bloque indéfiniment.
- `create_contract_from_booking` → crée le contrat et confirme la réservation.
- `sign_contract` → signature horodatée, réservation « en cours », véhicule « loué ».
- `close_contract` → contrat clôturé, réservation « terminée », véhicule « disponible », kilométrage mis à jour.
- `record_payment` → enregistre un paiement, refuse le surpaiement, passe la facture à « payée » quand le solde est nul.
- `refresh_overdue_invoices` → « émise » devient « en retard » quand l'échéance est dépassée.
- `accept_invitation` → rattache un utilisateur déjà inscrit à la société qui l'a invité.
- `seed_demo_data` → charge un jeu de démonstration dans une société vide (bouton du Dashboard).
- **Correctif de l'onboarding** : `create_company_and_admin` renvoyait une société mais le trigger anti-élévation annulait le
  rattachement du profil. Un drapeau de transaction réservé aux fonctions de confiance le corrige, sans affaiblir la protection.
- Index unique : une seule facture active par contrat (protège contre deux appels simultanés).

Les fonctions « SECURITY INVOKER » laissent la RLS s'appliquer. Les fonctions « SECURITY DEFINER » (`sign_contract`, `close_contract`)
ne servent que lorsqu'un agent doit modifier une table qui lui est normalement interdite (`vehicles`) ; elles vérifient elles-mêmes
le rôle **et** la société.

## 5. Les rôles

| Rôle | Peut faire | Ne peut pas |
|---|---|---|
| `admin_societe` | Tout, y compris agences, tarifs, utilisateurs, invitations | — |
| `gestionnaire_agence` | Flotte, maintenance, clients, réservations, contrats ; lire les factures et rapports | Gérer utilisateurs et agences |
| `agent` | Clients, réservations, contrats, états des lieux | Voir les factures ou les paiements |
| `comptable` | Factures et paiements ; lire les réservations et clients | Modifier la flotte |

Ces règles existent à deux endroits : dans les politiques RLS (qui font foi) et dans `web/src/lib/rbac.ts` (qui sert à masquer les
boutons inutiles).

## 6. L'application web

Next.js 16 (App Router). Les pages lisent la base **côté serveur** avec le jeton de l'utilisateur, donc avec la RLS. Les modifications
passent par des **Server Actions** validées avec Zod.

| Page | Fonctions |
|---|---|
| **Dashboard** | Indicateurs animés (occupation, CA du mois, retours du jour, maintenance), courbe d'occupation, courbe « demande réelle vs prévue » avec intervalle, bouton « Charger la démo » |
| **Flotte** et fiche véhicule | Recherche, filtres par statut et agence, création / modification, historique des locations et de la maintenance |
| **Clients** | Recherche, création, modification, nombre de locations |
| **Réservations** | Calendrier de 14 jours par véhicule, mise à jour en direct (Supabase Realtime), création par clic sur une case, secousse animée en cas de conflit, brouillons IA à valider |
| **Contrats** | Liste filtrable, signature, états des lieux départ / retour, **photos** dans Storage, contrôle des dommages par IA, clôture |
| **Factures** | Totaux, filtres, paiements, annulation, PDF, génération des factures manquantes, relance des retards |
| **Maintenance** | Planification, blocage du véhicule, alertes (> 10 000 km et aucune préventive depuis 180 jours) |
| **Assistant** | Chat en langage naturel, recherche de disponibilités, tarif suggéré par règles simples |
| **Paramètres** | Agences, tarifs par catégorie, utilisateurs et rôles, invitations |

Design : thème sombre, cartes en verre dépoli, animations Framer Motion courtes (transform et opacité uniquement), squelettes de
chargement, respect de `prefers-reduced-motion`, navigation au clavier et libellés ARIA.

Si une table ou une fonction SQL manque, chaque page affiche un message d'erreur explicite plutôt qu'une page blanche.

## 7. Le service de facturation

Un service Express séparé, car il a besoin de la clé `service_role` (accès total) qui ne doit jamais atteindre le navigateur.

| Route | Rôles | Effet |
|---|---|---|
| `GET /health` | Public | État du service |
| `POST /invoices/from-contract/:id` | Les 4 rôles | Crée la facture d'un contrat clôturé, génère le PDF, le range dans Storage, envoie l'e-mail |
| `POST /reminders/run` | admin, comptable | Relance les factures en retard **de la société de l'appelant** |

Comment il se protège :

1. Il vérifie le **JWT** auprès de Supabase, puis charge le profil (société, rôle).
2. Comme la clé `service_role` contourne la RLS, il **refait lui-même** les contrôles : le contrat doit appartenir à la société de
   l'appelant, et il répond « introuvable » (jamais « interdit ») pour ne pas révéler l'existence d'une ressource d'une autre société.
3. Il refuse de démarrer si on lui donne une clé `anon` à la place de la clé `service_role`.

Comment il facture :

- Montants : HT = total de la réservation ; TVA 19 % (configurable) ; échéance à 15 jours (configurable).
- **Idempotent** : relancer ne crée jamais de doublon, même avec deux appels simultanés. Si une facture existe sans PDF (échec
  précédent), le PDF est régénéré.
- Une facture annulée n'empêche pas d'en émettre une nouvelle.
- L'e-mail ne fait jamais échouer la facturation. **Le SMTP est facultatif** : sans lui, factures et PDF sont créés sans e-mail.
- Un travail quotidien (`node-cron`, 8 h par défaut) passe les factures échues en retard et relance les clients, au plus tous les 3 jours.

## 8. Les fonctions d'intelligence artificielle

Trois Edge Functions (Deno) appellent l'API Gemini. La clé reste dans les secrets Supabase.

| Fonction | Rôle | Sécurité |
|---|---|---|
| `ai-assistant` | Chat avec outils : chercher des véhicules, lire une réservation, **créer un brouillon**. L'IA ne confirme jamais une réservation | Exécutée avec le JWT de l'utilisateur : la RLS s'applique |
| `forecast-demand` | Lissage exponentiel de type Holt-Winters par agence, chaque nuit via `pg_cron` ; résultats dans `demand_forecasts` | Exige l'en-tête `x-cron-secret` ; **refuse de répondre si `CRON_SECRET` n'est pas défini** |
| `damage-check` | Compare les photos de départ et de retour, liste les dommages probables avec un niveau de confiance | Suggestion à valider par un humain |

Toute sortie d'IA est étiquetée « Suggestion IA », journalisée, et ne modifie jamais une donnée sans validation. Sans clé, tout
fonctionne et les fonctions IA sont simplement masquées. Les modèles Gemini étant retirés régulièrement, le secret `GEMINI_MODEL`
fait foi (défaut : `gemini-3.6-flash`).

## 9. Un parcours complet, de bout en bout

1. **Réservation** : l'agent clique sur une case du calendrier. La base vérifie qu'aucun conflit n'existe (sinon `23P01`), que le
   véhicule n'est pas en maintenance, et calcule le total.
2. **Contrat** : « Créer le contrat » (numéro `CT-…`), la réservation passe en « confirmée ».
3. **Signature** : le client accepte, la signature est horodatée, le véhicule passe « loué ».
4. **États des lieux** : kilométrage, carburant, observations et photos au départ et au retour.
5. **Clôture** : le véhicule redevient « disponible » (compteur mis à jour), puis le web appelle le billing-service.
6. **Facture** : numéro `FA-…`, montants, PDF dans Storage, e-mail au client. Si le service est indisponible, le contrat reste clôturé
   et la facture se génère plus tard depuis la page Factures.
7. **Paiement** : le comptable enregistre un ou plusieurs paiements ; la facture passe « payée » quand le solde est nul.
8. **Retard** : au-delà de l'échéance, la facture passe « en retard » et des relances partent automatiquement.

## 10. Sécurité : l'essentiel

- `.env` et `.env.local` sont dans `.gitignore`. Un test de la CI échoue si une clé (JWT, Gemini, `sb_secret`) apparaît dans le dépôt.
- La clé `service_role` n'existe que dans le billing-service. La clé Gemini n'existe que dans les secrets Supabase.
- **Une clé collée dans un chat, un ticket ou un e-mail est compromise : il faut la régénérer.**
- `forecast-demand` est ouverte (pas de JWT) : elle est protégée par un secret et **échoue fermée** s'il manque.
- Les dates sont interprétées au fuseau `Africa/Tunis`.

## 11. Tests et intégration continue

| Test | Où | Contenu |
|---|---|---|
| `supabase/tests/rls.test.sql` | SQL | 7 tests : isolation entre sociétés, rôles, anti-double-réservation, anti-élévation |
| `supabase/tests/workflows.test.sql` | SQL | 10 tests : dérivation des réservations, maintenance, cycle de contrat, rôles des fonctions, paiements, invitation, onboarding, démo (transaction annulée à la fin) |

GitHub Actions (`.github/workflows/`) :

| Workflow | Déclencheur | Action |
|---|---|---|
| `ci.yml` | Push et pull request | Typage + build de `web` et `billing-service` ; migrations 0001→0008 et tests SQL sur un Postgres 15 ; lint Deno ; détection de secrets |
| `pages.yml` | Push sur `main` (site, résumé) | Construit et publie le site sur GitHub Pages |
| `functions-deploy.yml` | Modification de `supabase/functions/` | Redéploie les Edge Functions (si le jeton Supabase est configuré) |
| `keepalive.yml` | Toutes les 10 minutes | Réveille le billing-service et Supabase (offres gratuites) |

Les migrations SQL ne sont **pas** poussées automatiquement : appliquées à la main dans le SQL Editor, elles n'ont pas d'historique
côté Supabase et un `db push` tenterait de les rejouer.

## 12. Déploiement

1. **Supabase** : exécuter les migrations 0001 → 0008 dans le SQL Editor ; puis `scripts/setup_ai.ps1` pour les fonctions IA.
2. **Render** : *New → Blueprint*, choisir le dépôt (`render.yaml` configure tout). Saisir `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `CORS_ORIGIN` ; SMTP facultatif. Redéploiement automatique à chaque push.
3. **Vercel** : importer le dépôt, *Root Directory* = `web`, variables `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   `NEXT_PUBLIC_SITE_URL`, `BILLING_SERVICE_URL`. Redéploiement automatique à chaque push.
4. **Supabase Auth** : ajouter l'URL Vercel dans *Authentication → URL Configuration* (Site URL et `…/auth/callback`).
5. **GitHub** : *Settings → Pages → Source = GitHub Actions*. Variables du dépôt : `APP_URL` (lien du bouton « Ouvrir l'application »),
   `BILLING_URL`, `SUPABASE_URL`, `SUPABASE_PROJECT_REF` ; secrets : `SUPABASE_ACCESS_TOKEN`, `SUPABASE_ANON_KEY`.

Le pas-à-pas détaillé avec les commandes est dans [`docs/PUBLIER.md`](docs/PUBLIER.md).

## 13. Variables d'environnement

| Où | Variable | Secret |
|---|---|---|
| `web/.env.local` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (clé anon), `NEXT_PUBLIC_SITE_URL` | Non |
| `web/.env.local` | `BILLING_SERVICE_URL` (serveur uniquement) | Non |
| `billing-service/.env` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | **Oui** |
| `billing-service/.env` | `SMTP_HOST/PORT/USER/PASSWORD`, `CORS_ORIGIN`, `INVOICE_DUE_DAYS`, `INVOICE_VAT_RATE`, `REMINDER_*`, `BUSINESS_TIMEZONE` | SMTP : oui |
| Secrets Supabase | `GEMINI_API_KEY`, `GEMINI_MODEL`, `CRON_SECRET` | **Oui** |

## 14. Problèmes trouvés et corrigés

| Problème | Conséquence | Correction |
|---|---|---|
| Trigger anti-élévation trop strict | Nouvel utilisateur sans société après l'onboarding | Drapeau de transaction pour les fonctions de confiance (0008) |
| `.env.example` avec une clé `anon` dans `SERVICE_ROLE_KEY` | Écritures qui échouent silencieusement | Valeurs factices + refus de démarrer avec une clé `anon` |
| Relances sans filtre de société | Un comptable relançait les clients d'autres sociétés | Filtre sur la société de l'appelant |
| `forecast-demand` sans `CRON_SECRET` | Fonction ouverte à tout Internet | Échec fermé (503) |
| Modèle Gemini retiré | Erreurs 404 de l'assistant | `GEMINI_MODEL` configurable, message d'erreur clair |
| Historique du chat : 20 premiers messages | L'IA oubliait le contexte récent | 20 derniers messages |
| Réservation avec véhicule d'une autre société | Lien entre sociétés possible | Validation par trigger |
| Flèche « → » dans le PDF | Caractère illisible | Remplacée par « au » |
| Aucune facture si le PDF échoue | Facture sans PDF définitivement | Réparation automatique au rappel |

## 15. Limites connues et pistes

- Le calendrier se crée par clic (pas de glisser-déposer).
- L'assistant répond en un bloc (pas de streaming).
- Envoi des pièces d'identité clients non branché (bucket et politiques prêts).
- L'agent a accès à toute sa société (la RLS d'origine ne le restreint pas à son agence).
- Les offres gratuites ont des limites : le service Render met quelques secondes à se réveiller ; un projet Supabase gratuit est mis en
  pause après environ une semaine d'inactivité (le keep-alive limite ce risque).

## 16. Glossaire

- **RLS** (Row Level Security) : règles PostgreSQL qui filtrent les lignes visibles selon l'utilisateur.
- **Tenant / multi-tenant** : une société cliente / plusieurs sociétés isolées dans la même base.
- **JWT** : jeton signé qui prouve l'identité de l'utilisateur et porte son rôle.
- **`service_role`** : clé Supabase à accès total, contourne la RLS. Serveur uniquement.
- **`anon`** : clé publique, inoffensive tant que la RLS est active.
- **Edge Function** : petite fonction exécutée par Supabase (Deno).
- **`23P01`** : code d'erreur PostgreSQL « violation de contrainte d'exclusion » (conflit de réservation).
- **Idempotent** : répéter l'opération produit le même résultat, sans doublon.
- **CI/CD** : vérification et déploiement automatiques à chaque modification du code.
