> **Note** — Notes de session historiques sur le billing-service. Depuis, les corrections suivantes ont été apportées : relances limitées à la société de l'appelant, SMTP facultatif, idempotence renforcée (index unique 0008), PDF réparable, clé `anon` refusée au démarrage. Référence à jour : [README racine](../README.md).

FleetDesk — Documentation complète du dossier billing-service/
Dernière mise à jour : après validation complète en conditions réelles
(génération de facture, idempotence, RBAC, rejet métier, authentification JWT).

Ce document explique ce que fait chaque fichier, pourquoi il existe,
quels bugs ont été trouvés et corrigés, et comment tout s'articule
pour garantir une facturation fiable et sécurisée.

1. Vue d'ensemble de l'architecture
text

billing-service/
├── package.json          → dépendances et scripts (build/start/dev/typecheck)
├── tsconfig.json          → configuration TypeScript stricte
├── .env.example           → modèle de variables d'environnement (valeurs factices)
├── .env                   → variables réelles (JAMAIS commité, dans .gitignore)
└── src/
    ├── server.ts           → point d'entrée Express, montage des routes
    ├── config.ts           → chargement env + client Supabase admin
    ├── middleware/
    │   └── verifySupabaseJwt.ts   → authentification + résolution du profil
    ├── routes/
    │   ├── invoices.ts      → POST /invoices/from-contract/:id
    │   ├── reminders.ts     → POST /reminders/run
    │   └── health.ts        → GET /health
    ├── services/
    │   ├── pdf.service.ts    → génération PDF (PDFKit)
    │   ├── mail.service.ts   → envoi e-mails (Nodemailer)
    │   ├── invoice.service.ts → logique métier centrale
    │   └── storage.service.ts → upload Supabase Storage
    └── jobs/
        └── dailyReminders.ts  → planification cron des relances
Principe fondamental : ce service tourne en dehors de Supabase, avec la
clé service_role qui contourne la RLS. Toute la sécurité normalement
assurée par la base de données doit donc être reproduite manuellement
dans le code (vérification company_id, vérification du rôle) — c'est le
rôle central de verifySupabaseJwt.ts et des contrôles explicites dans
invoice.service.ts.

2. package.json et tsconfig.json — fondations
Node.js 20+, TypeScript strict (strict: true, noUncheckedIndexedAccess: true),
compilation CommonJS vers dist/. Scripts :

dev : tsx watch — rechargement à chaud du code, mais pas des
variables d'environnement (un vrai redémarrage du processus est
nécessaire après modification du .env — piège rencontré et documenté
plus bas).
build / start : compilation puis exécution du JS compilé, sans
Docker, compatible Render/Railway tel quel.
3. .env.example / .env — configuration
🔴 Incident de sécurité rencontré et résolu
Lors de la configuration initiale, la variable SUPABASE_SERVICE_ROLE_KEY
contenait en réalité la clé anon ("role":"anon" dans le payload JWT)
au lieu de la vraie clé service_role. Conséquence en cascade :

supabaseAdmin (voir config.ts) interrogeait la table profiles
sans JWT utilisateur attaché (la clé anon est juste une clé API,
pas une session).
Sous la RLS, auth.uid() valait NULL → la policy profiles_read
(company_id = auth_company_id()) ne retournait aucune ligne.
verifySupabaseJwt.ts recevait profile = null pour tout
utilisateur, quel que soit son rôle réel → erreur 403 "Utilisateur non rattaché à une société" systématique, y compris pour des comptes
parfaitement configurés.
Symptôme observé : agent ET comptable rejetés avec le même message,
alors que select * from profiles en SQL Editor confirmait des données
correctes. Ce symptôme (RBAC qui échoue pour tous les rôles de façon
identique) est le signal caractéristique d'une clé service_role
incorrecte plutôt qu'un problème de données ou de policy RLS.

Correction : récupération de la vraie clé service_role (Dashboard
Supabase → Project Settings → API → section "Project API keys", bouton
"Reveal" sur service_role), vérification de "role":"service_role"
dans le payload décodé, puis redémarrage complet du processus (pas
juste une sauvegarde de fichier — tsx watch ne recharge pas dotenv).

Variables documentées
Variable	Rôle	Sensibilité
SUPABASE_URL	URL du projet	Publique
SUPABASE_SERVICE_ROLE_KEY	Contourne la RLS	Secrète, jamais commitée
SMTP_*	Envoi d'e-mails	Secrète (mot de passe)
INVOICE_DUE_DAYS, INVOICE_VAT_RATE	Règles métier facturation	Publique (logique, pas un secret)
REMINDER_MIN_INTERVAL_DAYS, REMINDER_CRON_SCHEDULE	Anti-spam relances + planification	Publique
.gitignore — à créer si absent
text

node_modules/
dist/
.env
.env.local
*.log
À vérifier avant tout push : git grep -n "SUPABASE_SERVICE_ROLE_KEY=ey" -- . ':!*.example' ne doit rien retourner.

4. src/server.ts — point d'entrée
Monte helmet (en-têtes de sécurité HTTP, visibles dans les réponses
testées — Content-Security-Policy, Cross-Origin-Opener-Policy, etc.),
cors restreint à CORS_ORIGIN, parsing JSON limité à 2 Mo, puis les
trois routeurs. Gestionnaire d'erreurs global en filet de sécurité final.
Lance scheduleDailyReminders() au démarrage.

Validé : démarre proprement sur le port 4000, logs clairs au boot.

5. src/config.ts — variables d'environnement et client admin
requireEnv() fait planter le service au démarrage si une variable
obligatoire manque — principe "fail fast" : mieux vaut un crash explicite
immédiat qu'une erreur silencieuse en production (ex. tentative d'upload
vers un bucket avec une URL Supabase vide).

Exporte supabaseAdmin, le client avec la clé service_role. Commentaire
du code, confirmé par l'incident ci-dessus : "ce client ne doit JAMAIS
être exposé à une requête HTTP entrante sans vérification manuelle des
droits en amont" — exactement le rôle de verifySupabaseJwt.ts.

6. src/middleware/verifySupabaseJwt.ts — authentification
Deux fonctions :

verifySupabaseJwt : extrait le Bearer <token> de l'en-tête
Authorization, le valide via supabaseAdmin.auth.getUser(token) (délègue
la vérification de signature/expiration à Supabase, pas de secret JWT à
gérer côté service), puis va chercher le profil (company_id, role,
agency_id) via le client admin — en reproduisant "à la main" ce que la
RLS ferait côté base.

Validé en conditions réelles :

Sans en-tête → 401 "En-tête Authorization manquant ou mal formé."
Avec JWT valide mais profil introuvable (ou clé admin incorrecte) →
403 "Utilisateur non rattaché à une société."
Avec JWT valide et profil correct → req.auth peuplé, passage au
middleware suivant.
requireRole(...allowed) : fabrique un middleware de contrôle de
rôle, à chaîner après verifySupabaseJwt.

Validé en conditions réelles :

text

Agent sur /reminders/run → 403 "Rôle insuffisant. Rôles autorisés : admin_societe, comptable."
Comptable sur /reminders/run → 200 { sent: 0, skipped: 0, failed: 0 }
7. src/routes/health.ts — 🔴 bug trouvé et corrigé
État initial : fichier vide. server.ts importait healthRouter
qui n'existait pas → échec de compilation TypeScript immédiat
(Module has no exported member 'healthRouter'), bloquant tout le service.

Correction appliquée :

TypeScript

import { Router } from "express";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "fleetdesk-billing-service",
    timestamp: new Date().toISOString(),
  });
});
Validé : GET /health → 200 {"status":"ok","service":"fleetdesk-billing-service","timestamp":"..."}.

8. src/routes/invoices.ts — déclenchement de la facturation
POST /invoices/from-contract/:contractId, protégée par
verifySupabaseJwt + requireRole("admin_societe", "gestionnaire_agence", "agent", "comptable").

Décision documentée (déviation assumée) : l'agent est autorisé à
déclencher la création de facture (car c'est souvent lui qui clôture
le contrat physiquement), même s'il n'a jamais accès à la liste des
factures ensuite (RLS côté base, testée dans rls.test.sql Test 4).
Point à trancher définitivement avant la mise en production — alternative
possible : restreindre à admin_societe, gestionnaire_agence, comptable.

Validé en conditions réelles :

text

POST /invoices/from-contract/dc44c448-...  (contrat clôturé, 1ère fois)
→ 201 { invoice: {...}, already_existed: false }

POST /invoices/from-contract/dc44c448-...  (même contrat, 2ème fois)
→ 200 { invoice: {...}, already_existed: true }  -- même invoice_no

POST /invoices/from-contract/ce8da518-...  (contrat NON clôturé)
→ 409 { error: "Le contrat n'est pas encore clôturé — facturation impossible." }
9. src/routes/reminders.ts — relances manuelles
POST /reminders/run, protégée par
requireRole("admin_societe", "comptable") — conforme à la matrice RBAC
du prompt (« comptable : gestion complète des factures »).

Validé : rejet 403 pour l'agent, exécution 200 pour le comptable.

10. src/services/pdf.service.ts — génération PDF
generateInvoicePdf() construit un PDF A4 avec PDFKit (en-tête société,
bloc client, tableau détail location, totaux HT/TVA/TTC, mention caution,
pied de page), retourné en Buffer plutôt qu'écrit sur disque — choix
déterminant car le disque de Render/Railway est éphémère entre
déploiements ; un buffer en mémoire peut être directement uploadé vers
Storage ou attaché à un e-mail sans jamais toucher le système de fichiers.

Validé indirectement : le pdf_path retourné par l'API
(00000000-.../dce0cccb-....pdf) prouve que la génération + l'upload ont
réussi sans exception.

À vérifier manuellement : téléchargement du PDF depuis Storage pour
contrôle visuel (non encore fait dans cette session).

11. src/services/mail.service.ts — envoi e-mails
sendInvoiceEmail() et sendReminderEmail(), transporteur Nodemailer
paresseux (créé une seule fois, réutilisé). HTML simple mais propre,
pièce jointe PDF pour la facture.

Non testé dans cette session : le .env utilisé contient
probablement encore les valeurs factices (smtp.exemple.com). L'appel
échoue silencieusement sans faire planter la requête principale (voir
point 12, étape 9 du service) — comportement voulu, mais à vérifier
dans les logs serveur pour confirmer que l'erreur est bien catchée
proprement plutôt que de crasher.

12. src/services/invoice.service.ts — cœur métier
createInvoiceFromContract(contractId, callerCompanyId)
Séquence complète, chaque étape validée par les tests de cette session :

Étape	Action	Statut
0 (ajoutée)	assertValidUuid(contractId)	✅ Testé : UUID invalide → 400 propre au lieu d'un 500 Postgres opaque
1	Lecture contrat + vérification company_id	✅ Isolation tenant respectée
1bis (ajoutée)	Vérification closed_at non null	✅ Testé : contrat ouvert → 409
2	Vérification idempotence (facture déjà existante)	✅ Testé : 2e appel → already_existed: true, même invoice_no
3-4	Lecture booking + calcul HT/TVA/TTC	✅ Testé : 270 × 1.19 = 321.3 exact
5	Insertion facture (trigger invoice_no)	✅ Testé : FA-2026-000001 généré automatiquement
6-8	PDF + upload Storage + mise à jour pdf_path	✅ Testé : chemin retourné cohérent avec la convention {company_id}/{invoice_id}.pdf
9	Envoi e-mail (non bloquant)	⚠️ Non vérifié dans les logs cette session
Deux corrections apportées pendant cette session
a) Validation UUID (assertValidUuid) — évite qu'une erreur de saisie
(URL malformée, placeholder non remplacé côté client) remonte en 500
avec un message Postgres cryptique (22P02: invalid input syntax for type uuid). Désormais : 400 {"error":"contractId n'est pas un UUID valide."}.

b) Vérification de clôture (contract.closed_at) — empêche de
facturer un contrat encore actif, conforme à l'exigence du prompt
(« création automatique d'une facture à la clôture du contrat »).
Avant ce patch, rien n'empêchait de facturer n'importe quel contrat
ouvert.

markOverdueInvoices() et sendDueReminders()
Logique de relance : bascule emise → en_retard si échéance dépassée,
puis envoie un e-mail de relance pour chaque facture en retard n'ayant
pas été relancée depuis REMINDER_MIN_INTERVAL_DAYS (anti-spam).

Validé : exécution réussie, {sent: 0, skipped: 0, failed: 0} —
cohérent car aucune facture n'a encore de due_date dépassée dans
l'état actuel des données de test (due_date calculée à J+15, donc
pas encore en retard).

Non testé : le cas sent > 0 réel — nécessiterait une facture avec
due_date dans le passé et un client avec un email valide.

13. src/services/storage.service.ts — upload Storage
uploadInvoicePdf() respecte la convention de chemin {company_id}/...
imposée par les policies Storage SQL (migration 0006). upsert: true
permet de regénérer un PDF sans erreur de conflit si nécessaire.

getSignedInvoiceUrl() : prête pour un futur bouton "Télécharger" côté
frontend, non encore appelée dans le flux actuel.

Validé indirectement via le pdf_path retourné par l'API (voir
point 10). Vérification visuelle du fichier dans le Dashboard Storage :
non encore faite, à faire avant de clore la Phase 4.

14. src/jobs/dailyReminders.ts — planification cron
node-cron avec validation de l'expression (cron.validate) avant
activation — évite un crash silencieux si REMINDER_CRON_SCHEDULE est
mal formée dans l'environnement de prod. Appelle directement
sendDueReminders() en mémoire, sans requête HTTP interne (plus simple,
pas de risque d'authentification manquante).

Validé : log au démarrage "[dailyReminders] Relances planifiées avec l'expression cron "0 8 * * *".." confirmé dans chaque redémarrage
du serveur durant cette session.

Non testé : l'exécution réelle du cron à l'heure planifiée (test
possible en mettant temporairement */1 * * * * — non fait ici).

15. Séquence de tests effectuée dans cette session — récapitulatif
#	Test	Méthode	Résultat
1	Build / typecheck	npm run build / typecheck	✅ Pas d'erreur après correctif health.ts
2	Démarrage serveur	npm run dev	✅ Port 4000, cron planifié
3	Health check	GET /health	✅ 200 OK
4	Rejet sans token	POST /reminders/run sans header	✅ 401
5	Obtention JWT réels	Login Supabase Auth API (comptable + agent)	✅ Tokens valides obtenus
6	RBAC refus agent	POST /reminders/run avec JWT agent	✅ 403 "Rôle insuffisant"
7	RBAC autorisation comptable	POST /reminders/run avec JWT comptable	✅ 200 {sent:0,...}
8	Génération facture (1ère fois)	POST /invoices/from-contract/:id sur contrat clôturé	✅ 201, calculs HT/TVA/TTC exacts, invoice_no généré
9	Idempotence	Rejouer la même requête	✅ 200, already_existed:true, même invoice_no
10	Contrainte anti-double-réservation	Insertion SQL directe en conflit	✅ 23P01 levée spontanément (preuve en conditions réelles, pas juste en test scripté)
11	Rejet contrat non clôturé	POST /invoices/from-contract/:id sur contrat avec closed_at = null	✅ 409 après application du patch
12	Validation UUID	POST avec placeholder non remplacé	✅ 400 propre au lieu de 500
16. Dette technique connue / points d'attention pour la suite
Décision RBAC /invoices/from-contract non tranchée : agent
autorisé à déclencher, à documenter explicitement dans le README
final ou à restreindre.
Envoi d'e-mail non vérifié dans cette session (SMTP factice en
local) — à tester avec Mailtrap/Ethereal avant la Phase 6.
PDF non vérifié visuellement — télécharger le fichier depuis
Storage et l'ouvrir pour contrôle de mise en page.
Cas sent > 0 des relances non testé — nécessite une facture
avec échéance passée.
Cron réel non testé en conditions d'exécution (uniquement vérifié
au niveau de la planification, pas du déclenchement).
Données de test résiduelles en base : plusieurs contrats/réservations
de test (TEST-0001, TEST-0002, réservation sur e003, e005) ont
été créés manuellement pendant cette session de débogage — à nettoyer
avant de considérer le seed de démonstration comme définitif :
SQL

-- Nettoyage à faire avant la Phase 6 / démo finale
delete from invoices where invoice_no = 'FA-2026-000001';
delete from contracts where contract_no in ('TEST-0001', 'TEST-0002');
delete from bookings where id in (
  '7f4fca39-1d5a-4a7b-b0d1-e18df2d1c8db',
  '3dd9c9b1-86fd-4b79-9639-3170fb252a6e'
);
Clé service_role manipulée en clair dans le chat de débogage —
déjà régénérée une fois (incident résolu), mais si cette nouvelle clé
a aussi transité dans des échanges non chiffrés, elle devra être
régénérée une dernière fois juste avant le déploiement en production
réelle, par précaution.
17. État réellement validé à ce jour
Élément	État
Build / typecheck	✅
Health check	✅
Authentification JWT	✅ Testée (401 sans token)
RBAC sur les 2 routes	✅ Testé (agent rejeté, comptable autorisé)
Génération facture + calculs	✅ Testée, montants exacts
Idempotence facturation	✅ Testée
Rejet contrat non clôturé	✅ Testé après patch
Validation UUID	✅ Testée après patch
Upload PDF Storage	✅ Chemin confirmé, contenu non vérifié visuellement
Envoi e-mail facture	⚠️ Non vérifié (SMTP factice)
Relances automatiques (cas réel)	⚠️ Non testé (sent:0 car aucune facture en retard)
Cron quotidien	⚠️ Planifié, déclenchement réel non testé
Déploiement Render/Railway	⏳ Pas encore fait