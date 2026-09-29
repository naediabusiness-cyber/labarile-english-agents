# Les cerveaux de Labarile Agents

Bonjour Luc,

Ce dossier contient les « cerveaux » de vos agents : ce sont les instructions, en français, que chaque agent lit avant de répondre. Le code de l'application ne contient aucune méthode de vente ni aucun texte : tout ce que disent vos agents vient d'ici. Vous pouvez donc tout modifier vous-même, sans toucher au code.

## Les quatre dossiers

| Dossier | Agent | Rôle |
|---|---|---|
| `insta/` | Agent DM Instagram | Discute avec les prospects en message privé, les qualifie et les amène à réserver un appel avec l'équipe. Il ne vend jamais l'offre et ne donne jamais de prix. |
| `mail/` | Agent boîte mail commerciale | Lit les mails entrants, les trie (prospect, question, partenariat, support, spam) et prépare des réponses. Même méthode que sur Instagram, au format mail. |
| `support/` | Agent support client | Traite les réclamations, demandes de remboursement, annulations/rétractations et problèmes techniques. Il ne décide jamais seul d'un remboursement : il collecte les informations et transmet à un humain. |
| `stories/` | Rédacteur de stories | Écrit les textes des stories Instagram qui alimentent vos modèles d'images. |

Dans chaque dossier :

- les fichiers `.md` sont les instructions et exemples, à lire comme un document normal ;
- le fichier `config.json` contient les réglages (liens, mots interdits, délais, catégories…). Modifiez uniquement ce qui est entre guillemets, sans supprimer les virgules ni les accolades.

## La convention `[À REMPLIR : …]`

Partout où une information vous concerne (prix, offre, durée de l'appel, lien de réservation, politique de remboursement, votre façon d'écrire…), nous avons mis un emplacement de ce type :

`[À REMPLIR : durée de l'appel, ex. 30 minutes]`

Remplacez tout le bloc, crochets compris, par la vraie information. Exemple :

- avant : `L'appel dure [À REMPLIR : durée de l'appel, ex. 30 minutes].`
- après : `L'appel dure 30 minutes.`

Aucune information sur Labarile English n'a été inventée : tout ce qui est un fait (tarifs, CPF, Qualiopi, garanties, témoignages, délais) doit venir de vous.

**Important : tant qu'il reste au moins un `[À REMPLIR` dans un cerveau, l'agent correspondant refuse de passer en mode automatique.** L'application vérifie cela toute seule. Vous pouvez tester en mode brouillon en attendant.

## Comment enregistrer vos modifications

Deux possibilités :

1. **Dans le tableau de bord**, onglet **« Cerveaux »** : vous modifiez le texte directement et vous enregistrez. C'est la méthode la plus simple.
2. **Dans les fichiers** de ce dossier, puis vous lancez la commande `npm run brain:push` pour envoyer les changements vers l'application.

## Par où commencer

1. `insta/03-offre.md` et `insta/02-voix.md` : votre offre, votre appel et votre façon de parler.
2. `insta/config.json` et `mail/config.json` : le lien de réservation.
3. `support/02-politique.md` : vos CGV et vos règles de remboursement.
4. `stories/config.json` : le mot-clé à envoyer en DM.
5. Ajoutez de vraies conversations dans `insta/05-exemples.md` : c'est ce qui améliore le plus la qualité des réponses.

La méthode de prise de rendez-vous est inspirée du cadre d'appointment setting d'Alex Hormozi (Acquisition.com, $100M Leads), adapté au marché français.
