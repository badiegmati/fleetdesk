# FleetDesk

Plateforme SaaS multi-agences de gestion de flotte de location : agences, véhicules, clients, réservations
(calendrier anti-chevauchement), contrats, facturation (PDF + e-mails + relances), maintenance, et une couche IA
optionnelle (assistant, prévision de la demande, contrôle des dommages).

100 % en ligne, **sans Docker** : Supabase (Postgres, Auth, Storage, Realtime, Edge Functions) · Next.js sur Vercel ·
service de facturation Node.js sur Render ou Railway.

```
fleetdesk/
├── web/               Next.js 16 · React 19 · Tailwind 4 · Framer Motion · Recharts       → Vercel
├── billing-service/   Node 20 · Express · PDFKit · Nodemailer · node-cron                 → Render / Railway
├── supabase/          migrations 0001→0008, seed, tests SQL, Edge Functions (Deno)        → Supabase
├── scripts/           tests PowerShell (clé Gemini, Edge Functions)
└── docs/              notes détaillées (Supabase, billing-service)
```

## Démarrage rapide

### 1. Base de données (Supabase)

Dans le **SQL Editor**, exécute dans l'ordre `supabase/migrations/0001` → `0008` (ou `supabase db push`).
La migration **0008 est indispensable** à l'interface : sans elle, contrats, paiements et onboarding échouent.
Elle est rejouable sans risque. Les buckets Storage privés (`vehicle-photos`, `customer-docs`, `inspections`, `invoices`)
sont créés par la migration 0006.

Contrôle : `supabase/tests/rls.test.sql` (7 tests) et `supabase/tests/workflows.test.sql` (10 tests).

### 2. Application web

```powershell
cd web
npm install
copy .env.example .env.local     # puis renseigne les valeurs
npm run dev                      # http://localhost:3000
```

Inscris-toi, crée ta société (onboarding), puis sur le **Dashboard** clique sur « Charger la démo »
(ou utilise les comptes de `supabase/seed_profiles.sql` : `admin@`, `gestionnaire@`, `agent@`, `comptable@fleetdesk-demo.com`).

### 3. Service de facturation

```powershell
cd billing-service
npm install
copy .env.example .env           # SUPABASE_URL + clé service_role
npm run dev                      # http://localhost:4000/health
```

Puis dans `web/.env.local` : `BILLING_SERVICE_URL=http://localhost:4000`. Sans cette variable, l'interface reste
fonctionnelle mais n'émet pas de factures (un bandeau l'indique). Sans SMTP, les factures et PDF sont créés, sans e-mail.

### 4. Fonctions IA (facultatif)

```powershell
npx supabase login                      # une fois
.\scripts\setup_ai.ps1                 # teste la clé, enregistre les secrets, déploie les 3 fonctions
```

Le script demande la clé en saisie masquée (jamais dans la commande ni dans l'historique), vise le projet
`nwfzuteyhquajkwjxspb` par défaut (`-ProjectRef <ref>` pour un autre) et affiche le `CRON_SECRET` généré.
`.\scripts\test_gemini_key.ps1` teste seulement la clé. Ne colle jamais une clé dans un chat ou un ticket.

Planifie la prévision nocturne (commande `cron.schedule` en fin de `0006_realtime_cron.sql`). Sans clé IA, l'application
fonctionne normalement et le chat affiche « IA désactivée ».

## Résumé, site public et automatisation

- [`resume.md`](resume.md) : explication détaillée de tout le projet (architecture, base, sécurité, flux, tests, déploiement).
- [`docs/PUBLIER.md`](docs/PUBLIER.md) : pas-à-pas pour publier sur GitHub, obtenir le site public `…github.io/fleetdesk/`, et déployer
  l'application (Vercel) et le service de facturation (Render).
- `.github/workflows/` : CI (typage, builds, 17 tests SQL, détection de secrets), publication du site, déploiement des Edge Functions, keep-alive.
- GitHub Pages ne sert que des fichiers statiques : il héberge la vitrine ; l'application tourne sur Vercel.

## Variables d'environnement

| Où | Variable | Secret ? |
|---|---|---|
| `web/.env.local` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (clé **anon**), `NEXT_PUBLIC_SITE_URL` | Non (protégées par la RLS) |
| `web/.env.local` | `BILLING_SERVICE_URL` | Non, mais serveur uniquement |
| `billing-service/.env` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | **Oui** |
| `billing-service/.env` | `SMTP_*` (facultatif), `CORS_ORIGIN`, `INVOICE_*`, `REMINDER_*` | SMTP : oui |
| Secrets Edge Functions | `GEMINI_API_KEY`, `GEMINI_MODEL`, `CRON_SECRET` | **Oui** |

Voir `.env.example` (valeurs factices uniquement).

## Déploiement

1. **Supabase** : migrations 0001→0008, `supabase functions deploy`, secrets, `cron.schedule`.
2. **Render / Railway** : service Node sur `billing-service/` — build `npm install && npm run build`, start `npm start`.
   Variables : `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CORS_ORIGIN=https://<ton-site>.vercel.app`, `SMTP_*`.
3. **Vercel** : importer le dépôt, *Root Directory* = `web`, variables `NEXT_PUBLIC_*` + `BILLING_SERVICE_URL=https://<service>.onrender.com`.
   Ajouter l'URL Vercel dans Supabase → Authentication → URL Configuration (Site URL et Redirect URLs `…/auth/callback`).

## Sécurité — à lire

- **Aucune clé réelle dans le dépôt.** `.env` et `.env.local` sont dans `.gitignore`. La clé `service_role` n'existe que dans
  `billing-service/.env` / les variables Render, et la clé Gemini que dans les secrets Supabase.
- La clé `service_role` contourne toute la RLS : le billing-service reproduit lui-même les contrôles (JWT + société + rôle) et
  refuse de démarrer si on lui donne une clé `anon` par erreur.
- **Clés partagées dans une conversation = clés compromises.** Si une clé `service_role` ou Gemini a été collée dans un chat,
  un ticket ou un e-mail, régénère-la (Supabase → Settings → API ; Google AI Studio) puis mets à jour `.env` / les secrets.
- `forecast-demand` n'exige pas de JWT : elle refuse de répondre tant que `CRON_SECRET` n'est pas défini.

## Rôles (appliqués par la base, pas seulement par l'interface)

| Rôle | Accès |
|---|---|
| `admin_societe` | Tout, y compris agences, tarifs, utilisateurs, invitations |
| `gestionnaire_agence` | Flotte, maintenance, clients, réservations, contrats ; lecture des factures |
| `agent` | Clients, réservations, contrats, états des lieux ; **aucun accès aux factures** |
| `comptable` | Lecture des réservations ; factures et paiements ; **ne modifie pas la flotte** |

## Correspondance avec l'arborescence cible

L'application est construite avec des choix plus récents que le plan initial ; tout est livré, parfois sous un autre nom :

| Prévu | Réalisé |
|---|---|
| Next.js 15 | Next.js **16** : `src/proxy.ts` remplace `middleware.ts` (même rôle : rafraîchir la session Supabase) |
| `tailwind.config.ts` | Tailwind **4** : les tokens (couleurs, ombres, animations) sont dans `src/app/globals.css` (`@theme`) |
| `components/<module>/…` | Composants propres à chaque page, à côté d'elle (`*Client.tsx`, `Timeline.tsx`, `ChatPanel.tsx`, `ContractPanel.tsx`…) ; composants partagés dans `components/ui`, `components/motion`, `components/layout` |
| `lib/queries` (TanStack Query) | Lecture côté serveur (Server Components) + Server Actions : pas de couche client à synchroniser |
| `lib/validators` (Zod) | Schémas Zod dans les `actions.ts` de chaque module |
| `types/database.ts` | `types/db.ts` (écrit à la main) ; `npm run gen:types` génère les types complets |
| `useRealtimeBookings`, `useSession`, `useReducedMotion` | Présents dans `src/hooks/` |

## Limites connues

- Le calendrier se crée par clic sur une case (pas de glisser-déposer).
- L'assistant IA répond en un bloc (pas de streaming) ; la prévision est calculée par l'Edge Function, pas dans l'interface.
- Pièces d'identité clients (`customer-docs`) : le bucket et ses politiques existent, l'envoi depuis la fiche client n'est pas encore branché.
- Les périodes de maintenance et les dates sont interprétées au fuseau `Africa/Tunis`.
- L'agent n'est pas restreint à *son* agence par la RLS (accès à toute la société, comme dans les migrations d'origine).
