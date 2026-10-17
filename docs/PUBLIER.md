# Publier FleetDesk sur GitHub et le mettre en ligne

Résultat : le code sur GitHub, un **site public** `https://<utilisateur>.github.io/fleetdesk/` (présentation + résumé), l'**application**
sur Vercel, le **service de facturation** sur Render, et des **vérifications automatiques** à chaque `git push`.

> GitHub Pages ne sert que des fichiers statiques : il héberge la vitrine, pas l'application (qui a besoin d'un serveur). Voir `resume.md`, section 2.

## 0. Avant de commencer

- Installe **Git** : https://git-scm.com/download/win
- Crée un compte **GitHub**, ainsi qu'un compte **Vercel** et un compte **Render** (connexion avec GitHub, plans gratuits).
- **Régénère toute clé déjà partagée** (clé `service_role` Supabase, clé Gemini). Le script de publication refuse d'envoyer un dépôt contenant une clé.
- Pour des Pages gratuites, le dépôt doit être **public**.

## 1. Créer le dépôt GitHub (vide)

github.com → **New repository** → nom `fleetdesk`, **Public**, sans README, sans .gitignore, sans licence → *Create*.

## 2. Envoyer le code

```powershell
cd C:\...\fleetdesk
.\scripts\publish_github.ps1 -GitHubUser <ton-utilisateur-github>
```

Le script vérifie qu'aucune clé n'est présente, crée le commit et pousse sur `main`. Les fichiers `.env` ne sont jamais envoyés (`.gitignore`).

## 3. Activer le site public

Dépôt → **Settings → Pages → Build and deployment → Source : GitHub Actions**.
Puis onglet **Actions** → workflow *Site public (GitHub Pages)* → *Run workflow* (ou fais un nouveau push).
Après 1 à 2 minutes : `https://<utilisateur>.github.io/fleetdesk/`.

## 4. Service de facturation sur Render

1. render.com → **New → Blueprint** → choisis le dépôt (`render.yaml` configure tout).
2. Renseigne : `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (la **nouvelle** clé), `CORS_ORIGIN` (URL Vercel, à compléter à l'étape 5).
   Les `SMTP_*` sont facultatifs.
3. Quand c'est déployé, note l'URL (`https://fleetdesk-billing.onrender.com`) et teste `…/health`.

## 5. Application sur Vercel

1. vercel.com → **Add New → Project** → importe le dépôt → **Root Directory : `web`**.
2. Variables d'environnement :
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (clé **anon**)
   - `NEXT_PUBLIC_SITE_URL` = l'URL Vercel (ex. `https://fleetdesk.vercel.app`)
   - `BILLING_SERVICE_URL` = l'URL Render
3. **Deploy**. Puis retourne dans Render et mets `CORS_ORIGIN` = l'URL Vercel.
4. Supabase → **Authentication → URL Configuration** : *Site URL* = l'URL Vercel ; *Redirect URLs* : `https://<ton-site>.vercel.app/auth/callback`.

## 6. Variables et secrets GitHub (pour l'automatisation)

Dépôt → **Settings → Secrets and variables → Actions**.

| Type | Nom | Valeur | Sert à |
|---|---|---|---|
| Variable | `APP_URL` | URL Vercel | Bouton « Ouvrir l'application » du site Pages |
| Variable | `BILLING_URL` | URL Render | Keep-alive du service de facturation |
| Variable | `SUPABASE_URL` | `https://<ref>.supabase.co` | Keep-alive Supabase |
| Variable | `SUPABASE_PROJECT_REF` | ex. `nwfzuteyhquajkwjxspb` | Déploiement des Edge Functions |
| Secret | `SUPABASE_ANON_KEY` | clé **anon** | Keep-alive Supabase |
| Secret | `SUPABASE_ACCESS_TOKEN` | Supabase → Account → Access Tokens | Déploiement des Edge Functions |

Tout est facultatif : un workflow dont les variables manquent s'ignore sans erreur. Après avoir défini `APP_URL`, relance le workflow *Site public*.

## 7. Ce qui tourne ensuite automatiquement

| Quand | Quoi |
|---|---|
| Chaque `git push` / pull request | **CI** : typage et build du web et du billing, migrations + 17 tests SQL, lint Deno, détection de secrets |
| Push sur `main` (site, `resume.md`) | Reconstruction du site GitHub Pages |
| Push sur `main` (`supabase/functions/`) | Redéploiement des Edge Functions |
| Push sur `main` | Vercel et Render redéploient l'application et le service |
| Toutes les 10 minutes | Keep-alive (Render ne s'endort plus, Supabase reste actif) |

Les migrations SQL restent **manuelles** (SQL Editor) : elles n'ont pas d'historique côté Supabase, un déploiement automatique les rejouerait.
GitHub désactive les workflows planifiés après 60 jours sans activité sur le dépôt : un simple push les réactive.

## 8. Problèmes fréquents

| Symptôme | Cause / solution |
|---|---|
| `git push` refusé | Le dépôt n'existe pas, n'est pas vide, ou tu n'es pas connecté : relance après connexion à GitHub |
| Le site Pages affiche 404 | Source de Pages non réglée sur *GitHub Actions*, ou workflow pas encore exécuté |
| CI « sql » en échec | Lis le journal : l'erreur indique la migration ou le test concerné |
| CI « secrets » en échec | Une clé est dans le code : retire-la, **régénère-la**, puis pousse un nouveau commit |
| Vercel : build qui échoue | Variables `NEXT_PUBLIC_*` manquantes, ou *Root Directory* différent de `web` |
| La première facture met longtemps | Render gratuit se réveille en 30 à 60 s ; le keep-alive évite cela |
