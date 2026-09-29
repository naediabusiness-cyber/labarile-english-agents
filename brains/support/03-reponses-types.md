# Réponses types du support

L'agent **personnalise toujours** ces modèles (prénom, reprise de la situation). Ils fonctionnent par mail comme par message ; en message privé, raccourcir et retirer les formules de politesse longues.

Variables :
- `{prénom}` : prénom du client ;
- `{situation}` : une phrase qui reprend précisément ce que le client a décrit ;
- `{délai}` : le `responseDelay` de `config.json` ;
- `[signature]` : la `signature` de `config.json`.

---

## 1. Accusé de réception (premier message)

> Bonjour {prénom},
>
> Merci pour votre message. {situation : ex. « Je comprends que vous n'arriviez plus à accéder à votre espace depuis lundi, alors que vous aviez prévu de reprendre vos cours cette semaine. »} Je suis désolé(e) pour ce désagrément.
>
> Je m'occupe de votre demande et je vous tiens informé(e) de la suite.
>
> Bien à vous,
> [signature]

## 2. Demande d'informations complémentaires

> Bonjour {prénom},
>
> Merci pour votre message, et désolé(e) pour la gêne occasionnée. Pour que l'équipe puisse traiter votre demande rapidement, pourriez-vous me préciser :
>
> - vos nom et prénom ;
> - l'adresse email utilisée lors de votre achat ;
> - la date approximative de votre achat ;
> - la formule concernée ;
> - en quelques mots, le motif de votre demande.
>
> (Ne demander que les éléments manquants.)
>
> Dès réception, je transmets votre dossier.
>
> Bien à vous,
> [signature]

## 3. Transmission à l'équipe (message au client)

> Bonjour {prénom},
>
> Merci pour ces informations. Votre dossier est complet et je l'ai transmis à l'équipe, qui étudie votre demande et vous répondra sous {délai}.
>
> Je reste disponible si vous souhaitez ajouter un élément d'ici là.
>
> Bien à vous,
> [signature]

## 4. Fiche de transmission (interne, pour l'équipe)

```
Type : reclamation / remboursement / annulation / technique / autre
Client : {nom}, {email d'achat}
Date d'achat : {date}
Formule : {formule}
Motif (résumé factuel) : {motif}
Ce que le client demande : {attente exprimée}
Pistes à vérifier : {ex. achat de moins de 14 jours, accès déjà utilisé ou non, paiement en plusieurs fois}
Ton du client : calme / mécontent / en colère
Alerte : aucune / menace juridique / chargeback / avis négatif / détresse
Historique des échanges : {lien ou résumé}
```

## 5. Décision acceptée (à envoyer uniquement après validation humaine)

> Bonjour {prénom},
>
> Merci pour votre patience. Après étude de votre demande, l'équipe a validé {décision exacte validée par l'équipe : ex. le remboursement de votre formule / l'annulation de votre abonnement}.
>
> {modalités exactes validées : montant, moyen, délai d'exécution — uniquement ce que l'équipe a confirmé}
>
> Nous vous remercions pour votre confiance et restons à votre disposition.
>
> Bien à vous,
> [signature]

## 6. Décision refusée, avec alternative (à envoyer uniquement après validation humaine)

> Bonjour {prénom},
>
> Merci pour votre patience et pour les éléments transmis.
>
> Après étude de votre demande, l'équipe n'est pas en mesure d'y donner une suite favorable, pour la raison suivante : {motif exact validé par l'équipe, en référence aux CGV si pertinent}.
>
> Nous comprenons que cette réponse puisse vous décevoir. Pour autant, nous souhaitons trouver une solution avec vous, et l'équipe vous propose : {alternative validée : ex. une pause de votre formule, un report de vos séances, un changement de formule}.
>
> Dites-moi si cette proposition vous convient, ou si vous souhaitez en échanger directement avec l'équipe.
>
> Bien à vous,
> [signature]

## 7. Problème technique : premières vérifications

> Bonjour {prénom},
>
> Désolé(e) pour ce souci d'accès, voyons ça ensemble. Pouvez-vous essayer les étapes suivantes :
>
> [À REMPLIR : étapes de dépannage de base, ex. lien de réinitialisation du mot de passe, vérifier les spams, essayer un autre navigateur]
>
> Si le problème persiste, indiquez-moi l'appareil utilisé et le message qui s'affiche : je transmets aussitôt à l'équipe technique.
>
> Bien à vous,
> [signature]

## 8. Client en colère (désamorçage)

> Bonjour {prénom},
>
> Je comprends votre colère, et je suis désolé(e) que votre expérience ne soit pas à la hauteur de ce que vous attendiez. Votre message est pris au sérieux.
>
> Voici ce que je fais maintenant : je transmets votre demande à l'équipe en priorité, avec tous les éléments que vous m'avez donnés. Vous aurez une réponse sous {délai}.
>
> Bien à vous,
> [signature]

## 9. Escalade immédiate (menace juridique, chargeback, avis négatif, détresse)

> Bonjour {prénom},
>
> J'ai bien reçu votre message. Je le transmets immédiatement à un membre de l'équipe, qui reviendra vers vous personnellement.
>
> Bien à vous,
> [signature]

(Ne rien ajouter : pas de commentaire sur la menace, pas de justification, pas d'engagement.)

## 10. Rétractation : réponse d'attente

> Bonjour {prénom},
>
> Merci pour votre message, votre demande de rétractation est bien enregistrée à la date d'aujourd'hui.
>
> L'équipe vérifie votre situation au regard de nos conditions générales de vente ([À REMPLIR : lien vers les CGV]) et vous répond sous {délai}.
>
> Bien à vous,
> [signature]

## 11. Clôture d'un dossier

> Bonjour {prénom},
>
> Je me permets de clôturer votre demande, puisque tout semble réglé. Si vous avez la moindre question, il vous suffit de répondre à ce message.
>
> Belle journée,
> [signature]
