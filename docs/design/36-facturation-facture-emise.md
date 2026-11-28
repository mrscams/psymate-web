# Écran 36 · Facturation · Facture émise (paiement, avoir, envoi)

> **Périmètre tranché le 22 novembre 2026 (G Q67, rappelée en fiche 33).** Contrat visé : L5 de `docs/L-plan-facturation.md` (`contract-v0.17.0`, posé par M15-12) ; la section « Route & API » le suit depuis M15-13. Le contrat fusionné (`docs/api-reference.md`, tiré par M15-14) l'emporte : l'écran note tout écart dans sa PR et corrige la fiche. Cadre du module, statuts et règles communes : fiche 33.

> Spécification pour agents. Maquette : `facturation/04-facture.html` ; captures : `facturation/captures/04-facture-1.png` à `-11.png`, variantes `-dark` (liste en fin de fiche). Habillage : celui de l'application, par les tokens de `src/theme/tokens.css` (depuis M15-13, les maquettes en reprennent les valeurs ; un écran emploie les noms de tokens, jamais une valeur écrite en dur).

## Objectif
Montrer une facture qui a son numéro, telle qu'elle a été émise, et réunir autour d'elle ce qui continue de vivre : les paiements, les envois, un éventuel avoir. La feuille ne change plus ; tout le reste se lit et se fait dans le rail.

## Route & API
- Route : `/facturation/:numero` (facture `F-…` ou avoir `AV-…`), déclarée après les routes fixes. Ouverture d'un panneau dans l'URL : `?panneau=paiement | avoir | envoi`, retiré à la fermeture.
- `GET /api/invoices/by-number/{number}` → `Invoice` (L5.3) : `{ id, kind, number, status, overdue, overdueDays?, patient, issueDate, dueOn?, subject, total, balanceDue, issuer, recipient, lines: [{ id, position, occurredOn?, serviceId?, label, quantity, unitPrice, amount, sessionEntryId?, credited }], dueTerm, footerNote?, subtotal, vat, paid, credited, refundDue, payments: [Payment], creditNotes: [{ id, number, total, issueDate }], cancels?: { id, number }, history: [{ kind, at, detail }], updatedAt }`, avec `Payment = { id, invoiceId, invoiceNumber, kind: payment | refund, mode, amount, receivedOn, reference?, note?, cancelledAt? }`. Pour un document émis, `issuer` est l'instantané pris à l'émission. Montants en centimes. Historique : `kind` ∈ `draft_created`, `issued`, `sent`, `payment_recorded`, `payment_cancelled`, `credit_note_issued`, `voided` ; l'écran nomme chaque événement et lit le reste dans `detail`.
- `GET /api/invoices/{id}/pdf` (le fichier rangé à l'émission) ; `?variant=receipted` : facture acquittée (`409 INVOICE_NOT_PAID` si elle ne l'est pas) ; `GET /api/payments/{id}/receipt` (reçu d'un paiement).
- `POST /api/invoices/{id}/payments` `{ amount, mode: cash | cheque | transfer | card | other, receivedOn, reference?, note? }` → `201 Payment` ; sur un avoir dont `refundDue > 0`, le paiement est un remboursement (`kind: refund`), plafonné à `refundDue`. `409 AMOUNT_EXCEEDS_BALANCE`, `409 INVOICE_NOT_PAYABLE`, `422 MODE_NOT_ACCEPTED` (« Autre » toujours accepté), `422` sur une date future. `POST /api/payments/{id}/cancel` → `200`, idempotent.
- `POST /api/invoices/{id}/credit-notes` `{ scope: full | lines, lineIds?, reasonCode: session_cancelled | wrong_amount | wrong_recipient | other, reasonText?, expectedNumber }` → `201` l'avoir (`refundDue` compris) ; `409 CREDIT_NOTE_NUMBER_CHANGED`, `409 LINE_ALREADY_CREDITED`, `409 INVOICE_VOID`, `422 REASON_TEXT_REQUIRED` (motif `other`).
- `POST /api/invoices/{id}/send` `{ to, subject, body, template: invoice | reminder }` → `202` ; `422 EMAIL_INVALID`, `409 INVOICE_NOT_ISSUED`, `429` (30 envois par heure) ; objet 200 caractères au plus, message 5 000.
- `POST /api/invoices/{id}/duplicate` → `201` brouillon (mêmes lignes, sans leurs séances).
- **Écarts avec la première version de cette fiche** (L5.5) : montants en centimes ; **pas de route d'aperçu** : la feuille est du HTML dessiné par le web depuis la réponse (G Q70) ; **`reasonCode` au lieu d'un libellé** : l'écran traduit les quatre motifs (Séance annulée, facturée à tort ; Erreur de montant ; Erreur de destinataire ; Autre, avec `reasonText`) ; `issuedOn` devient `issueDate` ; `paidOn` n'existe pas (« Réglée le » se lit dans `payments`) ; `sessions` n'existe pas : la carte *Séances facturées* se lit dans les lignes qui portent `sessionEntryId` (date `occurredOn` et désignation ; la modalité n'est pas au contrat, elle n'est connue que par la désignation) ; `409 INVOICE_ALREADY_PAID` n'existe pas (`409 AMOUNT_EXCEEDS_BALANCE` couvre la facture payée entre-temps) ; les codes `502` et `503` de l'envoi ne sont pas au contrat : toute erreur d'envoi autre que `422`, `409` ou `429` s'affiche dans le dialogue, rien dans l'historique.

- **Contrat `0.17.0` tagué** (`contract-v0.17.0`, M15-12 ; précisions de l'API dans `psymate-api/docs/L-plan-facturation-api.md` L5.6, reportées le 28 novembre 2026 par M15-14 ; le contrat fait foi) :
  - Toute erreur de champ arrive sous le code racine `422 VALIDATION_FAILED`, dans `errors[]` (codes de champ : `REQUIRED`, `INVALID_FORMAT`, `INVALID_VALUE`, `OUT_OF_RANGE`, `UNKNOWN_FIELD` et les codes métier propres à l'écran), toutes ensemble ; chacune s'affiche sous son champ (`shared/forms`). Un montant décimal ou en chaîne est refusé (`INVALID_FORMAT`) : le web envoie des entiers de centimes. Patient inconnu ou d'un autre praticien : `404 PATIENT_NOT_FOUND` ; identifiant illisible : `400 MALFORMED_REQUEST`.
  - **`history` arrive du plus ancien au plus récent** : l'écran l'affiche dans l'ordre inverse (du plus récent au plus ancien), sans rien recalculer. `detail` : `draft_created` `{ sessionCount, batch, duplicateOf? }`, `issued` `{ number, cancels? }`, `payment_recorded` et `payment_cancelled` `{ paymentId, mode }` (sans montant), `sent` `{ to, template }`, `credit_note_issued` et `voided` `{ creditNoteId, number }`. `payments` arrive du plus ancien au plus récent.
  - **Avoir** : `Invoice` porte `reasonCode` et `reasonText` (`null` pour une facture). Montants **négatifs** : lignes (`unitPrice` et `amount` opposés à la ligne annulée), `subtotal`, `vat`, `total`, et `creditNotes[].total` sur la facture ; `credited` de la facture, `refundDue` et `paid` de l'avoir restent positifs ; `balanceDue` d'un avoir vaut 0. La TVA du dernier avoir d'une facture peut être de signe inverse (arrondis) : l'écran affiche les valeurs reçues. Feuille d'un avoir : « Avoir », « N° AV-… », destinataire, date, « Annule la facture » et son numéro, « Motif » (libellé du code puis texte ; pour `other`, le texte seul), lignes, « Total » négatif, « À rembourser » quand `refundDue` est positif, mention de TVA, mention de bas de page ; **ni modalités de règlement (`chequePayee`, `acceptedModes` de l'instantané), ni IBAN, ni tampon**.
  - Paiement : `409 INVOICE_NOT_PAYABLE` (brouillon, facture annulée, avoir sans remboursement dû) ; `mode` `MODE_NOT_ACCEPTED` et `receivedOn` `OUT_OF_RANGE` (future) sont des codes de champ ; un remboursement n'est pas soumis aux modes acceptés ; `409 AMOUNT_EXCEEDS_BALANCE` porte `balanceDue` (ou `refundDue` pour un avoir), même sur une facture déjà soldée. Annulation : `404 PAYMENT_NOT_FOUND` ; **`409 PAYMENT_NOT_CANCELLABLE`** pour un paiement d'une facture qui porte un avoir : message dans le dialogue de confirmation, rien ne change ; un paiement annulé garde son reçu (filigrane « Annulé »).
  - Avoir : `409 INVOICE_NOT_ISSUED` (brouillon), `409 CREDIT_NOTE_NOT_CREDITABLE` (un avoir comme cible), `409 INVOICE_VOID`, `409 LINE_ALREADY_CREDITED` avec `lineId`, `reasonText` `REASON_TEXT_REQUIRED` (code de champ), `lineIds` `INVALID_VALUE` (avoir partiel de sous-total non positif ou qui dépasserait le total) ; `expectedNumber` = `numbering.nextCreditNoteNumber` de `GET /api/me/billing-settings`, `409 CREDIT_NOTE_NUMBER_CHANGED` avec `nextNumber` dit que tout le reste est bon. `201` : l'avoir complet.
  - Envoi : `202` sans corps ; `to` `EMAIL_INVALID` (code de champ, aussi pour une adresse vide), `subject` `INVALID_VALUE` (saut de ligne) ; `409 INVOICE_NOT_ISSUED` pour un brouillon seulement : **une facture annulée et un avoir s'envoient** ; **`429 TOO_MANY_EMAILS`** (en-tête `Retry-After`) ; **`503 EMAIL_NOT_SENT`** (rien n'est inscrit) ; `500 PDF_UNAVAILABLE`. Variables remplacées par le serveur : `{numéro}`, `{montant}`, `{reste dû}`, `{échéance}`.
  - PDF : `{numéro}.pdf`, `{numéro}-acquittee.pdf` (`variant=receipted`, `409 INVOICE_NOT_PAID` pour tout ce qui n'est pas une facture `paid`) ; reçu `recu-{numéro}-{AAAA-MM-JJ}.pdf`. `duplicate` : `409 CREDIT_NOTE_NOT_DUPLICABLE` (pas de « Dupliquer » sur un avoir), `409 PATIENT_ARCHIVED`.

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
- Erreurs : `422` par champ → sous le champ ; `409 AMOUNT_EXCEEDS_BALANCE` (payée entre-temps) ou `409 INVOICE_NOT_PAYABLE` → message dans le panneau et relecture ; `409 CREDIT_NOTE_NUMBER_CHANGED` → le dialogue affiche le nouveau numéro et redemande la confirmation ; `409 INVOICE_VOID` → toast et relecture ; `422 EMAIL_INVALID` → sous « À » ; `429` (plafond d'envois) ou envoi impossible → message dans le dialogue, rien dans l'historique.
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

## Version arabe
Règles de `docs/design/arabe.md` dès la première tâche (M16-24 est couverte par M15-15 à M15-20) : propriétés CSS logiques seulement ; montants, numéros de facture et d'avoir, dates en chiffres, SIRET, IBAN, adresses e-mail en `dir="ltr"` (chiffres latins, `--font-mono` gardé pour numéros et dates tout en chiffres) ; dates et montants par la locale de formatage de `core/i18n` (`data/money.ts`), jamais `LOCALE_ID` ; libellés dans `messages.fr.xlf`, `messages.en.xlf` et `messages.ar.xlf` (termes : `arabe-glossaire.md`) ; flèches et chevrons retournés, colonnes des tableaux dans le sens de lecture, montants alignés du côté de fin ; rendu de `/fr/` et `/en/` inchangé. Ici : le numéro en titre en `dir="ltr"` ; adresse « À », objet et message du dialogue d'envoi en `dir="auto"` (le modèle est en français tant que le praticien ne le change pas) ; motif libre de l'avoir et note d'un paiement en `dir="auto"` ; le rail passe à gauche de la feuille ; l'historique met dates et heures en forme par `core/i18n`. La feuille de facture (aperçu et PDF) reste en français et de gauche à droite dans les trois langues (conteneur `lang="fr" dir="ltr"`, G Q70) ; seul l'habillage autour est traduit et retourné. Le PDF, la facture acquittée, l'avoir et le reçu restent en français quelle que soit la langue du praticien (L6.1).

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

## États dessinés (captures)
Chaque état que la première version de cette fiche spécifiait sans le dessiner l'a été par M15-13 (28 novembre 2026), dans `facturation/04-facture.html`, section « États spécifiés par la fiche ». Captures dans `facturation/captures/`, en clair et en sombre (suffixe `-dark`) :

- `04-facture-1.png` : facture F-2026-0144 payée en partie.
- `04-facture-2.png` : panneau « Enregistrer un paiement ».
- `04-facture-3.png` : dialogue « Créer un avoir ».
- `04-facture-4.png` : dialogue « Envoyer la facture ».
- `04-facture-5.png` : page d'une facture *Payée* (feuille acquittée, « Télécharger la facture acquittée »).
- `04-facture-6.png` : page d'une facture *Annulée* (tampon « Annulée par AV-… », aucun bouton de règlement).
- `04-facture-7.png` : page d'un avoir (`/facturation/AV-…`, motif tiré de `reasonCode`, facture annulée dans le rail, remboursement `kind: refund` dans les paiements).
- `04-facture-8.png` : paiement annulé dans le rail (barré, « Annulé le … », `cancelledAt`).
- `04-facture-9.png` : dialogue « Créer un avoir » avec un montant à rembourser (`refundDue`, encart `warning-bg`).
- `04-facture-10.png` : dialogue d'envoi sur une facture en retard, modèle de relance (`template: reminder`).
- `04-facture-11.png` : version sous 900 px (rail sous la feuille).

Non dessiné : le geste qui enregistre un remboursement sur un avoir : ni cette fiche ni L5 ne disent d'où il part (L5 : `POST /api/invoices/{id}/payments` sur un avoir dont `refundDue > 0`) ; seule la page d'avoir après remboursement est dessinée. Proposition du couloir web (M15-14), non relue par l'utilisateur, à confirmer ou remplacer par M15-18 : sur la page d'un avoir dont `refundDue` est positif, la carte *Règlement* porte le bouton plein « Enregistrer un remboursement », qui ouvre le même panneau (montant prérempli avec `refundDue`, modes sans filtre des réglages) ; le serveur range le paiement en `kind: refund`.

Les libellés que la fiche ne donnait pas et que la maquette propose sont signalés dans la note de chaque cadre (« libellé proposé ») ; une tâche d'écran les reprend tels quels ou les corrige dans sa PR. **Maquettes complétées par M15-13 sans relecture de l'utilisateur.**

## Hors périmètre
Modifier une facture émise ; supprimer une facture ou un avoir ; paiement en ligne et lien de paiement ; rapprochement bancaire automatique ; relances programmées ; envoi par SMS ; signature électronique.
