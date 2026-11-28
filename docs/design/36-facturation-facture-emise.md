# Écran 36 · Facturation · Facture émise (paiement, avoir, envoi)

> **Périmètre tranché le 22 novembre 2026 (G Q67, rappelée en fiche 33).** Même réserve que la fiche 33 : aucune route au contrat ; les routes, champs et codes ci-dessous sont ce que l'écran attend. Cadre du module, statuts et règles communes : fiche 33.

> Spécification pour agents. Maquette : `facturation/04-facture.html` ; captures : `facturation/captures/04-facture-1.png` (facture), `-2.png` (panneau de paiement), `-3.png` (avoir), `-4.png` (e-mail), variantes `-dark`. Habillage : celui de l'application, par les tokens de `src/theme/tokens.css` (les maquettes sont dessinées avec les valeurs Fluent 2, G Q59, qui ne sont pas encore sur `main` : on en reprend les noms de tokens, jamais une valeur).

## Objectif
Montrer une facture qui a son numéro, telle qu'elle a été émise, et réunir autour d'elle ce qui continue de vivre : les paiements, les envois, un éventuel avoir. La feuille ne change plus ; tout le reste se lit et se fait dans le rail.

## Route & API attendue
- Route : `/facturation/:numero` (facture `F-…` ou avoir `AV-…`). Ouverture d'un panneau dans l'URL : `?panneau=paiement | avoir | envoi`, retiré à la fermeture.
- `GET /api/invoices/by-number/{number}` → `{ id, kind, number, status, overdue, patient, recipient, lines[], total, paid, balanceDue, issuedOn, dueOn, paidOn?, sessions: [{ entryId, occurredOn, modality }], payments: [{ id, mode, reference?, receivedOn, amount, cancelledAt? }], creditNotes: [{ number, total, issuedOn }], cancels?: { number }, history: [{ kind, at, label }] }`.
- `GET /api/invoices/{id}/preview` (rendu de la feuille) ; `GET /api/invoices/{id}/pdf` ; `GET /api/payments/{id}/receipt`.
- `POST /api/invoices/{id}/payments` `{ amount, mode: cash | cheque | transfer | card | other, receivedOn, reference?, note? }` → `201` ; `POST /api/payments/{id}/cancel`.
- `POST /api/invoices/{id}/credit-notes` `{ scope: full | lines, lineIds?, reason, reasonText?, expectedNumber }` → `201 { number, total, refundDue }`.
- `POST /api/invoices/{id}/send` `{ to, subject, body, template: invoice | reminder }` → `202`.
- `POST /api/invoices/{id}/duplicate` → `201` brouillon.

## Structure
1. **Barre de la facture** (bande `surface-raised`) : retour vers la liste, numéro en titre (police à chasse fixe), statut, « {patient} · émise le … » ; à droite « Envoyer » et « Télécharger le PDF » (contour), menu *Plus* (Dupliquer, Créer un avoir).
2. **Feuille** (colonne principale, sur fond `surface-sunken`) : le rendu du PDF, en clair dans les trois thèmes. Sur une facture payée en partie, le bloc des totaux ajoute « Déjà réglé (mode, date) » et « Reste à régler ». **Payée** : titre « Facture acquittée », lignes « Réglée le … » et « Réglé par … le … », tampon « Acquittée » (`success`). **Annulée** : tampon « Annulée par AV-… ».
3. **Rail** (340 px), quatre cartes :
   - *Règlement* : Total, Réglé, barre de progression (`success`), Reste dû en grand, Échéance ; bouton plein « Enregistrer un paiement ». Payée : la barre est pleine, le bouton devient « Télécharger la facture acquittée ». Annulée ou avoir : pas de bouton.
   - *Paiements* : une ligne par paiement (icône du mode, mode et référence, date, montant, menu : Télécharger le reçu, Annuler le paiement). Un paiement annulé reste affiché, barré. Vide : « Aucun paiement enregistré ».
   - *Séances facturées* : date, modalité, lien « Ouvrir » vers la séance dans le dossier. Absente si la facture n'a que des lignes libres.
   - *Historique* : du plus récent au plus ancien, daté à la minute : paiement, envoi (avec l'adresse), émission (avec le numéro), création du brouillon (avec l'origine), avoir, annulation d'un paiement.
4. **Panneau « Enregistrer un paiement »** (panneau latéral partagé, 480 px, `role="dialog"`) : sous-titre « {numéro} · {patient} · reste dû … ». *Montant reçu* (prérempli avec le reste dû ; aide : « Le solde est proposé. Saisissez moins pour un paiement partiel. ») ; *Mode de paiement* (puces à choix unique : Espèces, Chèque, Virement, Carte, Autre ; seuls les modes acceptés dans les réglages, plus Autre) ; *Reçu le* (aujourd'hui) ; *Référence* (facultatif ; l'indication change avec le mode : numéro du chèque, libellé du virement) ; *Note pour vous* (facultatif, n'apparaît sur aucun document) ; encart de conséquence (« Après ce paiement, la facture sera payée… » ou « Il restera 60,00 € à régler. ») ; pied : « Annuler », « Enregistrer le paiement » (plein).
5. **Dialogue « Créer un avoir »** (560 px) : phrase d'explication ; deux cartes à choix unique, *Annuler toute la facture* (n séances, total) et *Annuler certaines lignes* (révèle la liste des lignes à cocher) ; *Motif* (liste : Séance annulée, facturée à tort ; Erreur de montant ; Erreur de destinataire ; Autre, qui révèle un champ de texte ; le motif figure sur l'avoir) ; encart de conséquence portant le numéro réservé, le montant, le nouveau reste dû et les séances qui reviennent dans « À facturer » ; si l'avoir dépasse le reste dû : « … sont à rembourser » ; pied : « Annuler », « Émettre l'avoir » (plein, pas rouge).
6. **Dialogue « Envoyer la facture »** (560 px) : À (adresse de la fiche, modifiable, obligatoire), Objet, Message (modèle des réglages, modifiable), pièce jointe en puce (`{numéro}.pdf`), mention « Le message part de PsyMate à votre nom ; les réponses arrivent sur votre adresse. Il ne contient aucune information de suivi. » ; pied : « Annuler », « Envoyer ». Facture en retard : le modèle de relance est proposé.

## Interactions
- Aucun champ sur la page : une facture émise ne se modifie pas et n'a ni « Modifier » ni « Supprimer ».
- Paiement : montant supérieur au reste dû refusé sur le champ (« Le reste dû est de 120,00 € ») ; zéro ou négatif refusé. Succès : le panneau se ferme, **la facture est relue**, toast « Paiement enregistré », le focus revient au bouton d'origine.
- Annuler un paiement : dialogue de confirmation partagé (« Annuler ce paiement de 120,00 € ? Il restera visible, barré, dans l'historique. ») ; puis relecture.
- Avoir : « Émettre l'avoir » → `201`, relecture, toast « Avoir AV-… émis » avec « Ouvrir l'avoir ». Avoir total : la facture devient *Annulée*. Un avoir ouvert à sa propre route montre sa feuille et, dans le rail, la facture qu'il annule ; il n'a ni paiement ni avoir.
- Envoi : succès → toast « Facture envoyée à … », ligne dans l'historique.
- Erreurs : `422` par champ → sous le champ ; `409 INVOICE_ALREADY_PAID` ou `409 AMOUNT_EXCEEDS_BALANCE` (payée entre-temps) → message dans le panneau et relecture ; `409 CREDIT_NOTE_NUMBER_CHANGED` → le dialogue affiche le nouveau numéro et redemande la confirmation ; `409 INVOICE_VOID` → toast et relecture ; `422 EMAIL_INVALID` → sous « À » ; envoi impossible (`502`/`503`) → message dans le dialogue, rien dans l'historique.
- Trois états : chargement (squelette de la feuille et du rail) ; erreur avec « Réessayer » ; introuvable (« Cette facture n'existe pas », lien vers la liste).

## Tokens
- Barre de progression : `success` sur `surface-sunken`. Reste dû : Subtitle 2 (16 / 22, 600).
- Une seule action pleine sur la page : le bouton de la carte *Règlement*. Dans chaque panneau ou dialogue : son bouton de pied.
- Puces de mode : contour `border-strong` ; choisie : `primary-tint`, bord `primary`, texte `primary-hover`.
- Encarts de conséquence : `success-bg` (facture soldée), `surface-ground` (information), `warning-bg` (remboursement à faire) ; texte neutre, statut porté par le fond et l'icône.
- Feuille : valeurs claires fixes. Tampon « Acquittée » : `success`.

## Accessibilité
- Titre de page : le numéro, lu avec le statut (« Facture F-2026-0144, payée en partie »).
- La barre de progression est une image nommée (« 120 euros réglés sur 240 »).
- Panneau et dialogues : modaux, Échap ferme, le focus revient au déclencheur ; focus initial sur *Montant reçu* (paiement), sur le premier choix (avoir), sur *À* (envoi).
- Les puces de mode forment un groupe de boutons radio ; les cartes de portée de l'avoir aussi. La liste des lignes de l'avoir est un groupe de cases nommé.
- L'encart de conséquence est relié au bouton de pied (`aria-describedby`) : le lecteur d'écran entend ce que le geste va produire.
- L'historique est une liste ordonnée ; chaque entrée lit l'action puis la date.
- axe-core : 0 violation, thèmes clair et sombre.

## Critères d'acceptation
- [ ] Une facture émise n'expose aucun champ, aucun « Modifier », aucun « Supprimer ».
- [ ] La feuille affichée est le rendu de l'API, en clair en thème sombre.
- [ ] « Enregistrer un paiement » propose le reste dû ; l'enregistrer rend la facture *Payée*, la feuille devient « Facture acquittée » et le bouton devient « Télécharger la facture acquittée ».
- [ ] Un paiement partiel laisse la facture *Payée en partie* ; le reste dû affiché est celui de l'API.
- [ ] Un montant supérieur au reste dû est refusé sur le champ, sans appel réseau.
- [ ] Annuler un paiement demande confirmation ; le paiement reste visible, barré ; le reste dû remonte.
- [ ] Avoir partiel sur une ligne : l'avoir porte un numéro `AV-…`, le reste dû baisse du montant, la séance revient dans « À facturer ».
- [ ] Avoir total : la facture devient *Annulée* et reste dans la liste, numéro barré.
- [ ] « Envoyer » avec une adresse valide inscrit l'envoi dans l'historique ; sans adresse dans la fiche, le champ « À » est vide et bloque l'envoi.
- [ ] `?panneau=paiement` ouvre le panneau directement ; Échap le ferme et retire le paramètre.
- [ ] axe-core 0 violation, panneau et dialogues ouverts compris.

## Spécifié ici, pas dessiné dans la maquette
La page entière d'une facture *Payée* (seule sa feuille acquittée est dessinée) et d'une facture *Annulée* ; la page d'un avoir ; un paiement annulé dans le rail ; le cas « à rembourser » de l'avoir ; le dialogue d'envoi avec le modèle de relance ; la version sous 900 px (rail sous la feuille). À dessiner avant de développer ces parties.

## Hors périmètre
Modifier une facture émise ; supprimer une facture ou un avoir ; paiement en ligne et lien de paiement ; rapprochement bancaire automatique ; relances programmées ; envoi par SMS ; signature électronique.
