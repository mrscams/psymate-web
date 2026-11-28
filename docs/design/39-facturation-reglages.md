# Écran 39 · Facturation · Réglages

> **Périmètre tranché le 22 novembre 2026 (G Q67, rappelée en fiche 33).** Contrat visé : L5 de `docs/L-plan-facturation.md` (`contract-v0.17.0`, posé par M15-12) ; la section « Route & API » le suit depuis M15-13. Le contrat fusionné (`docs/api-reference.md`, tiré par M15-14) l'emporte : l'écran note tout écart dans sa PR et corrige la fiche. Décisions qui portent sur cette fiche : les réglages sont le quatrième onglet du module, pas une page de Mon compte ; trois régimes de TVA (France, psychologues et coachs) ; aucune prestation « séance non honorée ». Les mentions de TVA et la règle de numérotation sont celles d'usage pour un cabinet en France et sont à faire relire par un expert-comptable avant d'être écrites au contrat. Cadre du module et règles communes : fiche 33.

> Spécification pour agents. Maquette : `facturation/07-reglages.html` ; captures : `facturation/captures/07-reglages-1.png` à `-8.png`, variantes `-dark` (liste en fin de fiche). Habillage : celui de l'application, par les tokens de `src/theme/tokens.css` (depuis M15-13, les maquettes en reprennent les valeurs ; un écran emploie les noms de tokens, jamais une valeur écrite en dur). Les valeurs d'exemple (ADELI, SIRET, IBAN) sont volontairement factices.

## Objectif
Fixer une fois ce qui figure sur toutes les factures et ce que le module propose par défaut : qui émet, sous quel régime de TVA, à quels tarifs, avec quelles modalités de règlement. On y passe à la première facture, puis quand un tarif change.

## Route & API
- Route : `/facturation/reglages`, quatrième onglet du module (au bout de la ligne d'onglets). Ancre de rubrique dans l'URL : `#identite | tva | numerotation | prestations | reglement | emails`.
- `GET /api/me/billing-settings` → `{ identity: { name, title, professionalNumber }, siret, addressLines, displayEmail, displayPhone, vat: { regime: health_exempt | franchise | liable, rateBp?, vatNumber?, mention }, numbering: { invoicePrefix, creditNotePrefix, nextInvoiceNumber, nextCreditNoteNumber, locked }, payment: { dueTerm: on_receipt | days_15 | days_30, chequePayee, acceptedModes[], showBankDetails, ibanLast4? }, footerNote, emailTemplates: { invoice: { subject, body }, reminder: { subject, body } }, missing: [] }`. `identity` est en lecture seule : il vient du dossier professionnel (fiche 13). Sans réglages en base : valeurs par défaut, adresse et e-mail proposés depuis le dossier. `missing` liste ce qui empêche d'émettre : `siret`, `addressLines`, `service`. Le taux est en points de base (2000 = 20 %).
- `PUT /api/me/billing-settings` (les champs modifiables) ; `422` : `SIRET_INVALID` (14 chiffres et clé de Luhn), `VAT_RATE_REQUIRED`, `VAT_NUMBER_REQUIRED` (régime `liable`), `OUT_OF_RANGE`, `INVALID_VALUE` ; `409 NUMBERING_LOCKED` si un préfixe change après une première émission.
- `PUT /api/me/billing-settings/iban` `{ iban, currentPassword }` → `204` ; `422 IBAN_INVALID` (format et clé mod 97), `403 PASSWORD_INVALID`. `DELETE` de la même route efface l'IBAN (mot de passe dans le corps).
- `GET /api/me/billing-services` → `{ services: [{ id, label, durationMin?, price, isDefault }] }` (non archivées, la prestation par défaut d'abord puis par libellé) ; `POST` `{ label, durationMin?, price, isDefault? }` → `201` (la première créée devient la prestation par défaut ; 50 au plus, `422 SERVICE_LIMIT_REACHED`) ; `PATCH /{id}` (fusion partielle ; `isDefault: true` retire le défaut de l'autre) ; `DELETE /{id}` (retrait logique, `204`, idempotent ; `409 SERVICE_IS_DEFAULT` s'il reste d'autres prestations).
- **Écarts avec la première version de cette fiche** (L5.5) : montants en centimes ; `identity` ne porte que `{ name, title, professionalNumber }` (pas de nature ADELI ou RPPS : l'étiquette du champ verrouillé reste « N° ADELI ou RPPS ») ; SIRET, adresse (`addressLines`), e-mail (`displayEmail`) et téléphone (`displayPhone`) affichés sont au premier niveau ; `vat.rate` devient `vat.rateBp` et la mention est fournie par l'API (`vat.mention`, affichée telle quelle) ; `nextCreditNoteNumber` s'ajoute ; `ibanMasked` devient `ibanLast4` (l'écran masque tout le reste) ; l'IBAN peut aussi être retiré (`DELETE`, mot de passe) ; nouveaux codes `OUT_OF_RANGE`, `INVALID_VALUE`, `SERVICE_LIMIT_REACHED`. Les modèles d'e-mail s'enregistrent par `PUT /api/me/billing-settings` : le panneau d'un modèle alimente donc la barre d'enregistrement de la page (il ne s'enregistre pas seul, à la différence des prestations).

- **Contrat `0.17.0` tagué** (`contract-v0.17.0`, M15-12 ; précisions de l'API dans `psymate-api/docs/L-plan-facturation-api.md` L5.6, reportées le 28 novembre 2026 par M15-14 ; le contrat fait foi) :
  - Toute erreur de champ arrive sous le code racine `422 VALIDATION_FAILED`, dans `errors[]` (codes de champ : `REQUIRED`, `INVALID_FORMAT`, `INVALID_VALUE`, `OUT_OF_RANGE`, `UNKNOWN_FIELD` et les codes métier propres à l'écran), toutes ensemble ; chacune s'affiche sous son champ (`shared/forms`). Un montant décimal ou en chaîne est refusé (`INVALID_FORMAT`) : le web envoie des entiers de centimes. Patient inconnu ou d'un autre praticien : `404 PATIENT_NOT_FOUND` ; identifiant illisible : `400 MALFORMED_REQUEST`. Codes de champ propres : `SIRET_INVALID`, `VAT_RATE_REQUIRED`, `VAT_NUMBER_REQUIRED`, `IBAN_INVALID`.
  - `PUT /api/me/billing-settings` **remplace tout** et répond `200` avec les réglages relus : l'écran envoie toujours tous les blocs, `numbering` compris (un bloc absent reprend ses valeurs par défaut, et des préfixes absents après une émission donnent `409 NUMBERING_LOCKED`) ; il retire les champs en lecture seule du `GET` (`identity`, `vat.mention`, `numbering.nextInvoiceNumber`, `numbering.nextCreditNoteNumber`, `numbering.locked`, `payment.ibanLast4`, `missing`), refusés en `UNKNOWN_FIELD`.
  - `vat.mention` vaut `null` en régime `liable` : la carte *Assujettie* et l'aperçu n'ont pas de mention (HT, TVA, TTC). `nextInvoiceNumber` et `nextCreditNoteNumber` arrivent formatés (`F-2026-0001`) ; `locked` est vrai dès une première émission ; `missing.addressLines` tient compte de l'adresse proposée par le dossier.
  - IBAN : **`429 TOO_MANY_ATTEMPTS`** (en-tête `Retry-After`) après 5 mots de passe faux en 15 minutes, `PUT` et `DELETE` confondus : message dans le dialogue ; `DELETE` répond `204` même sans IBAN.
  - Prestations : `POST` `201` ; `isDefault: false` sur la prestation par défaut → `422 INVALID_VALUE` (le bouton radio ne se décoche pas, on en choisit une autre) ; `422 SERVICE_LIMIT_REACHED` sans `errors[]` (message dans le panneau) ; `PATCH` avec `durationMin: null` efface la durée ; retirer la prestation par défaut quand elle est seule retire aussi le défaut.

## Structure
Trois colonnes : sommaire (200 px, collant), formulaire (carte), aperçu (360 px, collant).

1. **Sommaire** : Identité · TVA · Numérotation · Prestations et tarifs · Règlement · E-mails. La rubrique en vue est marquée comme le carreau courant du rail (fond `surface-sunken`, trait `primary` de 3 px à gauche).
2. **Identité sur les factures** : aide « Nom, titre et numéro professionnel viennent de votre dossier professionnel : ils se modifient là-bas. » Champs verrouillés (cadenas, fond `surface-ground`) : Nom, Titre, N° ADELI ou RPPS. Champs modifiables : N° SIRET (14 chiffres ; « Obligatoire pour émettre une facture. »), Adresse du cabinet, E-mail affiché, Téléphone affiché (facultatif).
3. **TVA** : aide « Détermine la mention portée sur chaque facture. En cas de doute, demandez à votre comptable. » Trois cartes à choix unique :
   - *Exonérée, soins à la personne* : mention « TVA non applicable, article 261-4-1° du Code général des impôts ».
   - *Franchise en base* : mention « TVA non applicable, article 293 B du Code général des impôts ».
   - *Assujettie à la TVA* : révèle Taux et N° de TVA intracommunautaire ; les factures détaillent hors taxes, TVA et toutes taxes.
   Le texte de la mention est fourni par l'application : ce n'est pas un champ libre.
4. **Numérotation** : aide « Les numéros se suivent sans trou, dans l'ordre d'émission. Le format ne se change plus après la première facture émise. » Préfixes Factures (`F-AAAA-`) et Avoirs (`AV-AAAA-`), modifiables tant qu'aucune facture n'est émise, verrouillés ensuite ; « Prochain numéro : F-2026-0148 · la suite repart à 0001 chaque 1ᵉʳ janvier ». Aucun champ ne permet de choisir le prochain numéro.
5. **Prestations et tarifs** : aide « Les désignations proposées dans une facture. Le tarif d'un patient, s'il est renseigné dans sa fiche, passe avant. » Tableau Désignation sur la facture · Durée · Tarif · Par défaut (bouton radio) · modifier. Lien « Ajouter une prestation ». Prestations de départ proposées à la première ouverture : Séance (à nommer selon la profession), Première consultation. Aucune prestation « séance non honorée » : un rendez-vous non honoré ne se facture pas.
6. **Règlement** : Échéance par défaut (À réception, 15 jours, 30 jours) ; Chèques à l'ordre de ; *Modes de paiement acceptés* (puces à choix multiple : Virement, Chèque, Espèces, Carte) ; interrupteur « Afficher mes coordonnées bancaires sur les factures », qui révèle l'IBAN masqué (ses quatre derniers caractères seulement, `ibanLast4`) et « Modifier » ; *Mention au bas de chaque facture* (facultatif, 500 caractères au plus).
7. **E-mails** : deux lignes, *Envoi d'une facture* et *Relance d'une facture en retard*, chacune avec son objet en aperçu et « Modifier » (panneau latéral : Objet, Message, variables `{numéro}`, `{montant}`, `{reste dû}`, `{échéance}`).
8. **Barre d'enregistrement** (pied de la carte) : à gauche « Modifications non enregistrées : {champs} », à droite « Annuler » et « Enregistrer » (plein). Un seul enregistrement pour la page, comme les autres pages de Mon compte.
9. **Aperçu** : une facture d'exemple réduite, en clair dans les trois thèmes, qui reflète les valeurs saisies (identité, mention de TVA, modalités), avant même l'enregistrement. Légende : « Aperçu sur une facture d'exemple ».
10. **Panneau « Ajouter / Modifier la prestation »** (panneau latéral partagé, 480 px) : Désignation sur la facture (obligatoire, 120 caractères au plus), Durée (facultatif, minutes), Tarif (obligatoire, supérieur à zéro), case « Proposer par défaut pour une nouvelle séance », encart « Le nouveau tarif s'applique aux prochaines factures. Les factures déjà émises et les brouillons en cours ne changent pas. » ; pied : « Retirer » à gauche en modification, « Annuler », « Enregistrer ».

Sous 900 px : le sommaire devient une rangée défilante au-dessus du formulaire et l'aperçu passe sous la carte.

## Interactions
- « Enregistrer » envoie les rubriques modifiées ; succès : toast « Réglages enregistrés », la barre revient à l'état neutre, **les réglages sont relus**. Quitter la page avec des modifications : dialogue « Quitter sans enregistrer ? » (dialogue partagé).
- Les réglages valent pour les factures émises ensuite : une facture émise garde l'identité, la mention et les tarifs du jour de son émission.
- Prestations : ajout, modification et retrait passent par le panneau et s'enregistrent tout de suite (hors de la barre de la page) ; puis la liste est relue. « Retirer » demande confirmation ; la prestation par défaut ne peut pas être retirée tant qu'une autre n'est pas choisie par défaut. Une prestation retirée disparaît des listes de choix ; les factures qui l'emploient gardent leur désignation.
- « Modifier » l'IBAN : dialogue qui demande le nouvel IBAN et le mot de passe du compte, comme les réglages de sécurité (fiche 18). L'IBAN n'est jamais renvoyé en clair par l'API.
- Arrivée depuis un avertissement (« Compléter les réglages », fiches 33 et 35) : la page s'ouvre sur la rubrique concernée et pose le focus sur le premier champ de `missing`.
- Erreurs : `422` par champ → sous le champ (`SIRET_INVALID`, `IBAN_INVALID`, `VAT_NUMBER_REQUIRED`…) ; `409 NUMBERING_LOCKED` (première facture émise entre-temps) → les préfixes se verrouillent, toast ; `403 PASSWORD_INVALID` sur l'IBAN → sous le mot de passe ; `409 SERVICE_IS_DEFAULT` → message dans le panneau.
- Trois états : chargement ; erreur avec « Réessayer » ; pas d'état vide (les réglages existent toujours, avec `missing` renseigné).

## Tokens
- Champ verrouillé : fond `surface-ground`, icône cadenas `text-secondary`, pas d'opacité.
- Carte de choix sélectionnée : `primary-tint`, bord `primary`. Puce de mode choisie : `primary-tint`, bord `primary`, texte `primary-hover`.
- Interrupteur : piste 40 × 20, pastille 14 px, comme les interrupteurs de l'application.
- « Retirer » une prestation : contour neutre, texte `danger`.
- Aperçu : valeurs claires fixes.

## Accessibilité
- Le sommaire est un `<nav aria-label="Rubriques des réglages">` ; la rubrique en vue porte `aria-current="true"` ; chaque rubrique est une section titrée (`<h2>`).
- Un champ verrouillé est `readonly`, décrit par « Se modifie dans votre dossier professionnel », et reste atteignable au clavier.
- Les trois cartes de TVA forment un groupe de boutons radio ; la mention est lue comme description de chaque choix.
- La barre d'enregistrement annonce les modifications en attente (`role="status"`).
- L'IBAN masqué est lu « IBAN se terminant par » suivi de ses quatre derniers caractères.
- axe-core : 0 violation, thèmes clair et sombre.

## Version arabe
Règles de `docs/design/arabe.md` dès la première tâche (M16-24 est couverte par M15-15 à M15-20) : propriétés CSS logiques seulement ; montants, numéros de facture et d'avoir, dates en chiffres, SIRET, IBAN, adresses e-mail en `dir="ltr"` (chiffres latins, `--font-mono` gardé pour numéros et dates tout en chiffres) ; dates et montants par la locale de formatage de `core/i18n` (`data/money.ts`), jamais `LOCALE_ID` ; libellés dans `messages.fr.xlf`, `messages.en.xlf` et `messages.ar.xlf` (termes : `arabe-glossaire.md`) ; flèches et chevrons retournés, colonnes des tableaux dans le sens de lecture, montants alignés du côté de fin ; rendu de `/fr/` et `/en/` inchangé. Ici : SIRET, IBAN, numéro de TVA, préfixes et prochain numéro, téléphone et e-mail affichés en `dir="ltr"` ; adresse du cabinet, ordre des chèques, mention au bas des factures, désignations des prestations, objet et message des modèles d'e-mail en `dir="auto"` ; le sommaire passe à droite ; les variables `{numéro}`, `{montant}`, `{reste dû}`, `{échéance}` gardent leur nom français. La mention de TVA vient de l'API, en français. La feuille de facture (aperçu et PDF) reste en français et de gauche à droite dans les trois langues (conteneur `lang="fr" dir="ltr"`, G Q70) ; seul l'habillage autour est traduit et retourné.

## Critères d'acceptation
- [ ] Nom, titre et numéro professionnel sont affichés verrouillés, avec les valeurs du dossier professionnel.
- [ ] Un SIRET qui n'a pas 14 chiffres est refusé sous le champ ; un SIRET valide enregistré retire « SIRET » de `missing`, et l'émission d'une facture n'est plus bloquée.
- [ ] Choisir « Franchise en base » change la mention dans l'aperçu immédiatement, et dans les factures émises après l'enregistrement ; une facture déjà émise garde sa mention.
- [ ] Après l'émission d'une première facture, les préfixes sont verrouillés ; aucun champ ne permet de saisir un numéro.
- [ ] Ajouter une prestation la rend disponible dans l'éditeur (fiche 35) ; changer son tarif ne modifie ni les factures émises ni les brouillons en cours.
- [ ] La prestation par défaut ne peut pas être retirée ; en choisir une autre par défaut déplace le bouton radio.
- [ ] Décocher « Carte » retire ce mode du panneau de paiement (fiche 36).
- [ ] « Modifier » l'IBAN demande le mot de passe ; l'IBAN n'apparaît jamais en clair après l'enregistrement.
- [ ] Quitter avec des modifications non enregistrées demande confirmation.
- [ ] axe-core 0 violation.

## États dessinés (captures)
Chaque état que la première version de cette fiche spécifiait sans le dessiner l'a été par M15-13 (28 novembre 2026), dans `facturation/07-reglages.html`, section « États spécifiés par la fiche ». Captures dans `facturation/captures/`, en clair et en sombre (suffixe `-dark`) :

- `07-reglages-1.png` : la page.
- `07-reglages-2.png` : TVA « Assujettie » : Taux et N° de TVA intracommunautaire, `422 VAT_NUMBER_REQUIRED` sous le champ.
- `07-reglages-3.png` : numérotation avant la première facture émise : préfixes modifiables (`numbering.locked` faux).
- `07-reglages-4.png` : panneau d'un modèle d'e-mail (Objet, Message, variables).
- `07-reglages-5.png` : dialogue « Modifier l'IBAN » (nouvel IBAN, mot de passe du compte, `403 PASSWORD_INVALID`, « Retirer l'IBAN » pour le `DELETE`).
- `07-reglages-6.png` : même dialogue, `422 IBAN_INVALID` sous l'IBAN.
- `07-reglages-7.png` : dialogue partagé « Quitter sans enregistrer ? ».
- `07-reglages-8.png` : version sous 900 px (sommaire en rangée défilante, aperçu sous la carte).

Non dessiné : le panneau de prestation avec son voile (il répète le panneau dessiné hors cadre) ; le toast de `409 NUMBERING_LOCKED` (la fiche ne donne pas son texte) ; la mention et l'aperçu du régime assujetti (la mention vient de l'API, `vat.mention`, et son texte n'est écrit nulle part).

Les libellés que la fiche ne donnait pas et que la maquette propose sont signalés dans la note de chaque cadre (« libellé proposé ») ; une tâche d'écran les reprend tels quels ou les corrige dans sa PR. **Maquettes complétées par M15-13 sans relecture de l'utilisateur.**

## Hors périmètre
Logo et couleurs sur la facture ; plusieurs cabinets ou plusieurs entités de facturation ; numérotation personnalisée ou reprise d'une suite existante ; plusieurs taux de TVA ; plusieurs comptes bancaires ; langue de la facture par patient ; signature d'e-mail riche.
