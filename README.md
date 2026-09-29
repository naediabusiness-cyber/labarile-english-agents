# Labarile Agents

Les agents IA de **Labarile English** (Luc Labarile). Quatre agents, un tableau de bord, une validation sur Telegram.

| Agent | Ce qu'il fait | Ce qui reste humain |
|---|---|---|
| 📸 **Insta DM** | Lit les DM Instagram (PlugKit), répond avec la méthode de setting (inspirée d'Hormozi, version empathique adaptée à la France) pour amener à **réserver un appel** | Tout en mode supervisé ; en auto : escalades, messages hors fenêtre 24 h, heures de silence |
| 🎨 **Stories** | Chaque matin à 7 h, écrit les stories du jour, les met aux couleurs de Labarile, les envoie à Luc, puis les publie à l'heure prévue | La validation (bouton ✅ Programmer), sauf en mode auto |
| ✉️ **Mail** | Trie les mails de la boîte commerciale, rédige les réponses, **envoie tout numéro de téléphone au groupe Telegram « Setting »** pour un rappel immédiat (bouton ✋ Je prends) | Partenariats, cas inhabituels |
| 🛟 **Support** | Réclamations, remboursements, annulations : suit le script, rassemble les infos, accuse réception | **Toute décision** (✅ Accorder / ❌ Refuser), le mail de décision est toujours validé |

## Comment ça tourne

```
Instagram ── PlugKit (DM) ─────┐
Instagram ── Meta Graph (stories)┤
Boîtes mail ── IMAP / SMTP ────┤──  Cette app (Next.js sur Vercel)  ──  Claude (Anthropic)
Telegram ── bot (validation) ──┘          │   tableau de bord · agents · garde-fous
                                          │
                              Supabase (base + stockage des images)
                              └── pg_cron : réveille l'app toutes les 3 minutes
```

Chaque compte (Supabase, Vercel, Anthropic, PlugKit, Meta, Telegram) est **au nom de Labarile English**.

## Les modes

Chaque agent a trois modes (tableau de bord → Vue d'ensemble, ou Telegram `/mode insta auto`) :
- **Coupé** : l'agent ne fait rien.
- **Supervisé** (par défaut) : il prépare, rien ne part sans un clic (Telegram ou onglet « À valider »).
- **Auto** : il envoie seul ce qui est simple. Bloqué tant que son cerveau contient des `[À REMPLIR]`.

## Prise de rendez-vous (iClosed)

Avec `ICLOSED_API_KEY` dans Vercel, l'agent Insta/Messenger ne donne plus le lien de réservation : il lit les créneaux libres des closers
(page de réservation du `bookingLink` du cerveau), propose les **2 premiers dans les 48 h** (au moins 2 h à l'avance) **à l'heure du prospect**
(il demande où il vit si besoin), puis demande prénom, nom et email. La réservation est faite dans iClosed **au moment où le message de confirmation part**
(donc après ton ✅ en mode supervisé). Si le créneau vient d'être pris, rien ne part, la conversation passe en « je reprends » et tu es alerté.
Sans clé, ou sans créneau libre, l'agent envoie le lien comme avant.

## Les cerveaux

Dossier `brains/` : un sous-dossier par agent (documents `.md` + `config.json`). On les modifie dans le dossier puis
`npm run brain:push`, ou directement dans l'onglet **Cerveaux** du tableau de bord. Voir `brains/README.md`.

## Telegram

- Groupe **Validation** (Luc) : brouillons avec ✅ Envoyer · ✏️ Modifier · 🔁 Autre version · 🙋 Je reprends ; stories ; décisions support ; alertes.
- Groupe **Setting** (équipe) : numéros à rappeler avec ✋ Je prends · ✅ Appelé.
- Commandes : `/statut`, `/mode <insta|mail|support|stories> <off|supervise|auto>`, `/id`.

## Installer

Suivre **`PLAYBOOK.md`** (avec Claude Code, dans le terminal Ghostty). Compter 2 à 3 heures hors remplissage des cerveaux.

## Structure

```
app/admin/          le tableau de bord (vue d'ensemble, à valider, instagram, mails, support, stories, cerveaux, réglages, installation)
app/api/cron        la boucle (appelée par Supabase toutes les 3 min)
app/api/telegram    le webhook du bot
app/api/stories     l'image d'une story (aperçu)
app/api/admin/brain lecture / écriture d'un cerveau (npm run brain:push)
lib/agents/         insta.ts · mail.ts · support.ts · stories.ts
lib/                claude.ts (modèle) · drafts.ts (brouillons) · guardrails.ts (garde-fous) · telegram.ts · plugkit.ts · instagram.ts · mail.ts · phone.ts
brains/             les cerveaux (à remplir par Luc)
supabase/install.sql les tables, le stockage, la boucle pg_cron
scripts/push-brain.mjs
```

## Coûts indicatifs (par mois)

Vercel Hobby 0 € (Pro 20 $ conseillé) · Supabase 0 € au départ (Pro 25 $) · Anthropic selon le volume (≈ 30–100 $) · PlugKit selon leur offre · Telegram 0 €.
