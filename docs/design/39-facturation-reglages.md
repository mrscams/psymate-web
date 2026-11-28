# Écran 39 · Facturation · Réglages

> **Périmètre tranché le 22 novembre 2026 (G Q67, rappelée en fiche 33).** Même réserve que la fiche 33 : aucune route au contrat. Décisions qui portent sur cette fiche : les réglages sont le quatrième onglet du module, pas une page de Mon compte ; trois régimes de TVA (France, psychologues et coachs) ; aucune prestation « séance non honorée ». Les mentions de TVA et la règle de numérotation sont celles d'usage pour un cabinet en France et sont à faire relire par un expert-comptable avant d'être écrites au contrat. Cadre du module et règles communes : fiche 33.

> Spécification pour agents. Maquette : `facturation/07-reglages.html` ; capture : `facturation/captures/07-reglages-1.png` (et `-dark`). Habillage : celui de l'application, par les tokens de `src/theme/tokens.css` (les maquettes sont dessinées avec les valeurs Fluent 2, G Q59, qui ne sont pas encore sur `main` : on en reprend les noms de tokens, jamais une valeur). Les valeurs d'exemple (ADELI, SIRET, IBAN) sont volontairement factices.

## Objectif
Fixer une fois ce qui figure sur toutes les factures et ce que le module propose par défaut : qui émet, sous quel régime de TVA, à quels tarifs, avec quelles modalités de règlement. On y passe à la première facture, puis quand un tarif change.

## Route & API attendue
- Route : `/facturation/reglages`, quatrième onglet du module (au bout de la ligne d'onglets). Ancre de rubrique dans l'URL : `#identite | tva | numerotation | prestations | reglement | emails`.
- `GET /api/me/billing-settings` → `{ identity: { name, title, professionalId: { kind: adeli | rpps, value }, siret?, address, email, phone? }, vat: { regime: health_exempt | franchise | liable, rate?, vatNumber? }, numbering: { invoicePrefix, creditNotePrefix, nextInvoiceNumber, locked }, payment: { dueTerm, chequePayee?, acceptedModes[], showBankDetails, ibanMasked? }, footerNote?, emailTemplates: { invoice: { subject, body }, reminder: { subject, body } }, missing: [] }`. `name`, `title` et `professionalId` sont en lecture seule : ils viennent du dossier professionnel (fiche 13).
- `PUT /api/me/billing-settings` (les rubriques modifiables) ; `PUT /api/me/billing-settings/iban` `{ iban, currentPassword }`.
- `GET /api/me/billing-services` ; `POST`, `PATCH /{id}`, `DELETE /{id}` (retrait logique) → `{ id, label, durationMin?, price, isDefault }`.

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
6. **Règlement** : Échéance par défaut (À réception, 15 jours, 30 jours) ; Chèques à l'ordre de ; *Modes de paiement acceptés* (puces à choix multiple : Virement, Chèque, Espèces, Carte) ; interrupteur « Afficher mes coordonnées bancaires sur les factures », qui révèle l'IBAN masqué (« FR76 •••• … •12 ») et « Modifier » ; *Mention au bas de chaque facture* (facultatif, 500 caractères au plus).
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
- Interrupteur : piste 40 × 20, pastille 14 px (fiche `fluent2.md` §5).
- « Retirer » une prestation : contour neutre, texte `danger`.
- Aperçu : valeurs claires fixes.

## Accessibilité
- Le sommaire est un `<nav aria-label="Rubriques des réglages">` ; la rubrique en vue porte `aria-current="true"` ; chaque rubrique est une section titrée (`<h2>`).
- Un champ verrouillé est `readonly`, décrit par « Se modifie dans votre dossier professionnel », et reste atteignable au clavier.
- Les trois cartes de TVA forment un groupe de boutons radio ; la mention est lue comme description de chaque choix.
- La barre d'enregistrement annonce les modifications en attente (`role="status"`).
- L'IBAN masqué est lu « IBAN se terminant par 12 ».
- axe-core : 0 violation, thèmes clair et sombre.

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

## Spécifié ici, pas dessiné dans la maquette
Les champs révélés par « Assujettie à la TVA » ; les préfixes encore modifiables (la maquette les montre verrouillés, après une première facture) ; le panneau d'un modèle d'e-mail ; le dialogue de modification de l'IBAN ; le dialogue « Quitter sans enregistrer ? » ; la version sous 900 px. Le panneau de prestation est dessiné hors cadre, sans le voile. À dessiner avant de développer ces parties.

## Hors périmètre
Logo et couleurs sur la facture ; plusieurs cabinets ou plusieurs entités de facturation ; numérotation personnalisée ou reprise d'une suite existante ; plusieurs taux de TVA ; plusieurs comptes bancaires ; langue de la facture par patient ; signature d'e-mail riche.
