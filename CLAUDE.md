# Labarile Agents — Labarile English (Luc Labarile)

Agents IA de Labarile English : Instagram (DM + stories), mails + setting, support client. Tableau de bord Next.js, base Supabase, validation sur Telegram.

## Si l'outil n'est pas encore installé
Le fichier `INSTALLATION-FAITE.md` n'existe pas → **suis `PLAYBOOK.md` de bout en bout**, phase par phase, en vérifiant chaque étape avec Luc. Parle-lui en français, simplement : il n'est pas développeur.

## Règles permanentes
- **Secrets** : uniquement dans `.env.local` (ignoré par git) et dans Vercel. Jamais dans un commit, jamais recopiés dans la conversation. Si Luc colle une clé dans le chat, dis-lui de la régénérer.
- **Commits** : l'auteur est le compte GitHub de Luc (celui qui possède le projet Vercel). Pas de ligne `Co-Authored-By` : Vercel Hobby refuse sinon le déploiement.
- **Le cerveau n'est pas dans le code.** Méthode de vente, voix, offre, objections, politique support, ligne éditoriale : tout vit dans `brains/` (puis `npm run brain:push`) ou dans l'onglet Cerveaux du tableau de bord. Ne jamais écrire de méthode de vente dans `lib/`.
- **Ne jamais inventer un fait sur Labarile English** (prix, CPF, garanties, témoignages, délais) dans un cerveau : demander à Luc, sinon laisser `[À REMPLIR : …]`.
- **Sécurité des agents** : un agent démarre toujours en mode **supervisé**. Le passage en automatique est bloqué tant qu'il reste des `[À REMPLIR` dans son cerveau : ne pas contourner ce verrou. L'agent support ne décide jamais seul d'un remboursement.
- **Next.js 16** : cette version a des changements majeurs (ex. `proxy.ts` remplace `middleware.ts`, `params` est une Promise). Avant de toucher au code, lis le guide concerné dans `node_modules/next/dist/docs/`.
- **Vérifier avant de pousser** : `npm run typecheck`, `npm run lint`, `npm run build`.
- Tout le fonctionnement est décrit dans `README.md`.
