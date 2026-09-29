# PLAYBOOK — Installer Labarile Agents

> Ce guide est suivi par **Claude Code** avec **Luc**, dans le terminal **Ghostty**.
> Claude : avance phase par phase, vérifie chaque étape avant de passer à la suivante, explique simplement.
> Luc crée lui-même ses comptes et colle lui-même ses clés **dans Vercel ou dans `.env.local`**, jamais dans la conversation.
> À la fin, crée le fichier `INSTALLATION-FAITE.md` (date + ce qui est branché).

Durée : 2 à 3 heures, hors remplissage des cerveaux.

---

## Phase 0 — Préparer le Mac (une seule fois)

1. **Ghostty** : télécharger sur https://ghostty.org, installer, ouvrir.
2. **Homebrew** (si absent) : `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`
3. **Node.js et Git** : `brew install node git` puis vérifier `node -v` (≥ 20) et `git -v`.
4. **Claude Code** : `curl -fsSL https://claude.ai/install.sh | bash`, puis `claude` pour se connecter.
5. **Le projet** : dézipper `labarile-agents.zip` dans `~/Projets/`, puis :
   ```bash
   cd ~/Projets/labarile-agents
   npm install
   claude
   ```
   Et dire à Claude : « Suis le PLAYBOOK ».

✅ Vérification : `npm run build` passe.

---

## Phase 1 — Créer les comptes (au nom de Labarile English)

Utiliser une adresse commune, par exemple `agents@…`, avec Luc propriétaire.

| Service | Lien | Plan |
|---|---|---|
| GitHub | https://github.com | Gratuit |
| Supabase | https://supabase.com | Gratuit au départ |
| Vercel | https://vercel.com (se connecter avec GitHub) | Hobby, ou Pro conseillé |
| Anthropic | https://console.anthropic.com → Billing : ajouter ~50 $ de crédit | À l'usage |
| PlugKit | https://plugkit.co | Selon leur offre |
| Telegram | application sur le téléphone | Gratuit |
| Meta | https://business.facebook.com et https://developers.facebook.com | Gratuit |

Instagram doit être un **compte professionnel** (Paramètres → Type de compte).

---

## Phase 2 — Le code sur GitHub (compte de Luc)

1. Sur GitHub : **New repository** → nom `labarile-agents` → **Private** → sans README → Create.
2. Dans Ghostty, dans le dossier du projet :
   ```bash
   git init -b main
   git config user.name "<nom GitHub de Luc>"
   git config user.email "<email du compte GitHub de Luc>"
   git add -A
   git commit -m "Labarile Agents : installation"
   git remote add origin https://github.com/<compte-de-luc>/labarile-agents.git
   git push -u origin main
   ```
   (Claude : l'auteur des commits doit être Luc, sans ligne `Co-Authored-By`.)

✅ Vérification : le code apparaît sur GitHub, sans fichier `.env.local`.

---

## Phase 3 — Supabase (la base)

1. **New project** → nom `labarile-agents` → région **Europe (Paris ou Frankfurt)** → noter le mot de passe de la base dans un gestionnaire de mots de passe.
2. **Database → Extensions** : vérifier que `pg_cron` et `pg_net` sont disponibles (le script les active).
3. **SQL Editor** → New query → coller tout le contenu de `supabase/install.sql` → **Run**.
4. **Settings → API** : noter l'**URL du projet** et la clé **service_role** (secrète).

✅ Vérification : Table Editor montre `settings`, `brains`, `drafts`… et Storage montre les buckets `stories` et `photos`.

---

## Phase 4 — Vercel (l'app en ligne)

1. **Add New → Project** → importer `labarile-agents` depuis GitHub.
2. **Environment Variables** : ajouter au minimum
   - `ADMIN_PASSWORD` : un mot de passe long, choisi par Luc
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - `ANTHROPIC_API_KEY` (console.anthropic.com → API Keys)
3. **Deploy**. Noter l'adresse, par exemple `https://labarile-agents.vercel.app`.
4. En local, créer `.env.local` (Claude peut le créer, **Luc colle lui-même les valeurs**) :
   ```
   APP_URL=https://labarile-agents.vercel.app
   ADMIN_PASSWORD=...
   SUPABASE_URL=...
   SUPABASE_SERVICE_ROLE_KEY=...
   ```
   (`APP_URL` + `ADMIN_PASSWORD` servent à `npm run brain:push` ; les deux Supabase à `npm run photos:push`.)

✅ Vérification : ouvrir l'adresse → page de connexion → entrer avec `ADMIN_PASSWORD`.
Aller dans **Installation** → étapes 1 et 2 cochées → **étape 3 : Enregistrer** l'adresse de l'app.

---

## Phase 5 — Les cerveaux

1. Les cerveaux sont déjà remplis avec les vrais éléments de Labarile English (site, FAQ, CGV, avis Trustpilot,
   lien de réservation iClosed, pas de CPF) : voir `brains/SOURCES-labarile.md`. **Relire avec Luc** et corriger si besoin.
   Il reste 9 `[À REMPLIR : …]` :
   1. la durée de l'entretien de candidature (`insta/03-offre.md`, `insta/01-methode.md`, `mail/03-reponses-types.md`) ;
   2. de **vrais DM de Luc** (`insta/02-voix.md`) et de vraies conversations annotées (`insta/05-exemples.md`) ;
   3. de vrais mails de l'équipe (`mail/02-voix.md`) ;
   4. le mot-clé que les gens envoient en DM après une story (`stories/config.json` → `ctaKeyword`).
2. Pousser : `npm run brain:push`
3. On peut aussi tout modifier ensuite dans **Cerveaux** du tableau de bord.

> Il n'est pas nécessaire que tout soit rempli pour commencer en **supervisé** : l'agent ne cite jamais une info `[À REMPLIR]`.
> Le mode **automatique** reste bloqué tant qu'il en reste.

✅ Vérification : Installation → étape 4 cochée.

---

## Phase 6 — Telegram

1. Dans Telegram, parler à **@BotFather** → `/newbot` → nom « Labarile Agents » → copier le **token**.
2. Créer deux groupes : **« Labarile – Validation »** (Luc, et qui valide) et **« Labarile – Setting »** (l'équipe qui rappelle). Ajouter le bot dans les deux.
3. Vercel → Environment Variables : `TELEGRAM_BOT_TOKEN` → **Redeploy**.
4. Tableau de bord → Installation → **Connecter le bot**.
5. Dans chaque groupe, écrire `/id` : le bot répond l'identifiant (un nombre négatif).
6. Vercel : `TELEGRAM_VALIDATION_CHAT_ID` et `TELEGRAM_SETTING_CHAT_ID` → **Redeploy**.
7. Installation → **Envoyer un message test**.

✅ Vérification : les deux groupes reçoivent « ✅ Labarile Agents est connecté ».

---

## Phase 7 — Instagram DM (PlugKit)

1. PlugKit → connecter le compte Instagram de Labarile (OAuth).
2. Récupérer la **clé API** (`sk_…`) et l'**id du compte Instagram dans PlugKit**.
3. Vercel : `PLUGKIT_API_KEY`, `PLUGKIT_ACCOUNT_ID` → Redeploy.
4. Tableau de bord → Vue d'ensemble → Instagram DM → **Supervisé**.
5. Installation → **Lancer un tour maintenant**.

> Au premier passage, les conversations existantes sont marquées « Luc » (l'agent ne relance pas l'historique).
> Pour confier une conversation existante à l'agent : Instagram → la conversation → « 🤖 Confier à l'agent ».

✅ Vérification : envoyer un DM de test depuis un autre compte → une proposition arrive dans le groupe Validation dans les 3 minutes.

---

## Phase 8 — Les boîtes mail (MAIL et SUPPORT)

**Gmail / Google Workspace** (le plus simple) :
1. Activer la validation en deux étapes sur le compte.
2. https://myaccount.google.com/apppasswords → créer un **mot de passe d'application** « Labarile Agents ».
3. Vercel :
   - boîte commerciale : `MAIL_IMAP_HOST=imap.gmail.com`, `MAIL_IMAP_PORT=993`, `MAIL_SMTP_HOST=smtp.gmail.com`, `MAIL_SMTP_PORT=465`, `MAIL_USER=<adresse>`, `MAIL_PASSWORD=<mot de passe d'application>`
   - boîte support (celle de l'amie) : les mêmes avec le préfixe `SUPPORT_`.
4. Redeploy → Vue d'ensemble → Mails et Support → **Supervisé**.

Autres fournisseurs (OVH, Ionos, Zoho…) : utiliser leurs adresses IMAP/SMTP. Outlook/Microsoft 365 bloque souvent ce mode de connexion : dans ce cas, créer une redirection vers une boîte Gmail.

> Au premier passage, l'agent part de « maintenant » : il ne répond pas aux anciens mails.

✅ Vérification :
- envoyer un mail de test à la boîte commerciale **avec un numéro de téléphone** → alerte 📞 dans le groupe Setting + brouillon de réponse dans Validation ;
- envoyer une demande de remboursement à la boîte support → accusé de réception en brouillon + carte « Décision à prendre » (✅ Accorder / ❌ Refuser).

---

## Phase 9 — Stories (publication Instagram)

1. **Identité graphique** : la charte v2.0 est déjà intégrée (couleurs, Bebas Neue / Roboto / Roboto Mono).
   Il reste à ajouter le **logo** : deux PNG transparents (version foncée et version blanche), à déposer dans
   Supabase → Storage → bucket `photos` → dossier `logo/`, puis coller leurs adresses publiques dans Réglages.
2. **Photos de Luc** : télécharger le dossier Google Drive des photos (clic droit → Télécharger), le dézipper, puis :
   ```bash
   npm run photos:push -- ~/Downloads/<dossier-des-photos>
   ```
   (il faut `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` dans `.env.local`). Chaque photo est recadrée au format
   story et compressée. Les gabarits « citation » et « appel » en utilisent une au hasard, avec le voile de la charte.
3. **Accès Meta** (connexion Instagram) :
   1. https://developers.facebook.com → **Create App** → type « Business ».
   2. Ajouter le produit **Instagram** → « API setup with Instagram login ».
   3. Ajouter le compte Instagram de Labarile → **Generate token** (permissions `instagram_business_basic` et `instagram_business_content_publish`).
   4. Copier le **jeton** et l'**Instagram user ID** affichés.
4. Vercel : `META_IG_USER_ID`, `META_ACCESS_TOKEN` (laisser `META_GRAPH_HOST=graph.instagram.com`) → Redeploy.
   Le jeton est renouvelé automatiquement chaque semaine. Si Telegram signale un échec de renouvellement, régénérer le jeton et le remettre dans Vercel.
5. Vue d'ensemble → Stories → **Supervisé**. Stories → **✨ Générer** pour un premier essai → **🚀 Publier**.

✅ Vérification : la story apparaît sur le compte Instagram.

---

## Phase 10 — Rodage (1 à 2 semaines)

- Tout reste en **supervisé**. Luc valide, modifie (✏️), demande une autre version (🔁).
- Chaque correction récurrente → l'ajouter dans le cerveau (onglet Cerveaux), pas dans le code.
- Quand les propositions sont justes et les `[À REMPLIR]` remplis : passer un agent en **Auto** (Vue d'ensemble ou `/mode insta auto` sur Telegram).
- Les remboursements, escalades et messages hors fenêtre 24 h restent toujours humains.

---

## Fin

Créer `INSTALLATION-FAITE.md` avec la date, l'adresse de l'app, et la liste de ce qui est branché. Commit + push.

## En cas de souci

| Symptôme | Où regarder |
|---|---|
| Rien ne se passe | Installation → étape 10 (dernier tour) ; Supabase → Database → Cron Jobs |
| « Crédits Anthropic épuisés » | console.anthropic.com → Billing |
| Pas de message Telegram | Installation → Connecter le bot ; vérifier les ids de groupes |
| Mails non lus | mot de passe d'application ; IMAP activé dans Gmail |
| Story non publiée | Journal (Vue d'ensemble) ; jeton Meta |
