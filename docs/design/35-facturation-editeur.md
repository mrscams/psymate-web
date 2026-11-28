# Écran 35 · Facturation · Nouvelle facture (éditeur d'un brouillon)

> **Périmètre tranché le 22 novembre 2026 (G Q67, rappelée en fiche 33).** Même réserve que la fiche 33 : aucune route au contrat ; les routes, champs et codes ci-dessous sont ce que l'écran attend. Cadre du module, statuts et règles communes : fiche 33.

> Spécification pour agents. Maquette : `facturation/03-editeur.html` ; captures : `facturation/captures/03-editeur-1.png` (brouillon), `-2.png` (confirmation d'émission), variantes `-dark`. Habillage : celui de l'application, par les tokens de `src/theme/tokens.css` (les maquettes sont dessinées avec les valeurs Fluent 2, G Q59, qui ne sont pas encore sur `main` : on en reprend les noms de tokens, jamais une valeur).

## Objectif
Préparer une facture sans risque, puis l'émettre en un geste nommé et confirmé. À gauche ce que le praticien règle ; à droite la feuille telle que le patient la recevra. Tant qu'elle est en brouillon, tout se corrige ; une fois émise, plus rien.

## Route & API attendue
- Routes : `/facturation/nouvelle` (aucun brouillon côté serveur tant qu'aucun patient n'est choisi ; `?patient=:id` préremplit le patient) et `/facturation/brouillons/:id`. Dès la première écriture réussie, l'URL devient `/facturation/brouillons/:id` (remplacement, pas d'entrée d'historique).
- `POST /api/invoices` `{ patientId, sessionEntryIds?, lines? }` → `201` brouillon.
- `GET /api/invoices/{id}` → `{ id, status: draft, patient, recipient: { name, addressLines[] }, lines: [{ id, date?, serviceId?, label, quantity, unitPrice, amount, sessionEntryId? }], discount?, issueDate, dueTerm, footerNote?, alreadyPaid?: { mode, receivedOn }, total, nextNumberPreview, updatedAt }`.
- `PATCH /api/invoices/{id}` (fusion partielle) ; `DELETE /api/invoices/{id}` ; `GET /api/invoices/{id}/preview` (le même rendu que le PDF, tampon « Brouillon »).
- `POST /api/invoices/{id}/issue` `{ expectedNumber, sendByEmail? }` → `200` facture émise `{ number, status, … }`.
- Listes de choix : `GET /api/patients` (existant) ; `GET /api/me/billing-services` (fiche 39) ; `GET /api/billing/billable-sessions?patientId=` (fiche 34).

## Structure
1. **Barre de l'éditeur** (bande `surface-raised`) : bouton retour vers la liste, titre « Nouvelle facture », statut *Brouillon*, « Enregistré à 14:32 » ; à droite « Supprimer le brouillon » (contour, texte `danger`), « Aperçu PDF » (contour), « Émettre la facture » (plein).
2. **Colonne de saisie** (carte de 610 px, quatre rubriques séparées par un filet) :
   - **Patient** : liste à saisie assistée (pastille, nom complet). Dessous : « Adresse de facturation : … · Modifier dans la fiche ». Interrupteur « Adresser la facture à une autre personne (parent, employeur, organisme) » : activé, il révèle Nom et Adresse du destinataire ; le patient reste indiqué sur la feuille (« Pour : … »).
   - **Prestations** : tableau de lignes Date · Désignation (liste des prestations des réglages, saisie libre possible) · Qté · Prix unitaire · Montant · retirer. Ligne « Total ». Dessous : « Ajouter une séance » (ouvre la liste des séances non facturées de ce patient), « Ligne libre », « Remise » (une ligne négative, en montant ou en pourcentage). Aide : d'où viennent les lignes ; retirer une ligne de séance renvoie la séance dans « À facturer ».
   - **Date et règlement** : Date de la facture (aujourd'hui par défaut) ; Échéance (À réception, 15 jours, 30 jours, date choisie ; défaut des réglages). Case « Déjà réglée · le patient a payé en séance » : cochée, elle révèle Mode de paiement et Reçu le, et la facture sera émise acquittée.
   - **Mention au bas de la facture** (facultatif, 500 caractères au plus), puis l'encart neutre : « Rien de clinique n'est repris sur la facture : seules la date et la désignation de la prestation y figurent. »
3. **Aperçu** (colonne droite, collante) : la feuille sur fond `surface-sunken`, mise à jour à chaque enregistrement. En-tête praticien (nom, titre, adresse, numéro ADELI ou RPPS, SIRET), « Facture », « N° attribué à l'émission », destinataire, date et échéance, lignes, total, mention de TVA des réglages, modalités de règlement, tampon « Brouillon », pied. **La feuille reste en clair dans les trois thèmes.** Légende : « Aperçu. Le numéro est attribué à l'émission. »
4. **Dialogue « Émettre la facture ? »** (dialogue partagé, rayon 8, ombre 64) : phrase portant le numéro réservé, la date, le total et le destinataire ; encart d'avertissement « Une facture émise ne peut plus être modifiée ni supprimée. Pour la corriger, vous créerez un avoir. » ; case « Envoyer aussi par e-mail à … » (absente si le patient n'a pas d'adresse) ; « Annuler », « Émettre » (plein).

## Interactions
- **Enregistrement automatique** : chaque champ valide est envoyé à la sortie du champ (temporisé pour le texte) ; « Enregistré à … » se met à jour ; en cas d'échec, « Non enregistré » et « Réessayer » à la même place. Pas de bouton « Enregistrer ».
- Choisir une prestation remplit le prix unitaire ; le prix reste modifiable. Si le patient a un tarif dans sa fiche, il remplace celui de la prestation par défaut.
- « Émettre la facture » ouvre le dialogue ; « Émettre » appelle `/issue`. Succès : navigation vers `/facturation/:numero` (fiche 36), toast « Facture F-… émise ».
- Erreurs :
  - forme, vérifiée avant l'envoi : patient absent, aucune ligne, prix à zéro ou négatif hors remise, quantité inférieure à un → message sous le champ ;
  - `422` par champ → message sous le même champ (`shared/forms`) ;
  - `422 BILLING_SETTINGS_INCOMPLETE` (SIRET, adresse…) → bandeau d'avertissement en tête de l'éditeur, avec le nom de ce qui manque et « Compléter les réglages » ; le brouillon est conservé ;
  - `409 INVOICE_NUMBER_CHANGED` (un autre appareil a émis entre-temps) → le dialogue reste ouvert, affiche le nouveau numéro et redemande la confirmation ;
  - `409 SESSION_ALREADY_INVOICED` → la ligne concernée est signalée, « Retirer la ligne » ;
  - `409 INVOICE_ISSUED` (brouillon déjà émis ailleurs) → redirection vers la facture, toast.
- « Supprimer le brouillon » : dialogue de confirmation partagé ; les séances reviennent dans « À facturer » ; retour à la liste.
- Quitter l'éditeur ne demande rien : tout est enregistré. Un brouillon sans patient n'existe pas côté serveur et se perd sans avertissement.
- Trois états pour le brouillon chargé par son identifiant : chargement ; erreur avec « Réessayer » ; introuvable (« Ce brouillon n'existe plus », lien vers la liste).

## Tokens
- Champs Material à contour, 40 px, `radius-md` ; dans le tableau de lignes, champs de 32 px. Focus : bord `primary` de 2 px.
- Une seule action pleine dans la barre : « Émettre la facture ». « Supprimer le brouillon » : contour neutre, texte `danger` (action destructrice sur un document, pas sur un patient).
- Encart d'avertissement du dialogue : `warning-bg`, icône `warning`, texte neutre. Encart « Rien de clinique… » : `surface-ground`, icône cadenas `text-secondary`.
- Feuille : valeurs claires fixes, `shadow-4` ; tampon « Brouillon » en `text-secondary`.

## Accessibilité
- Le tableau de lignes est un `<table>` ; chaque champ est nommé par sa colonne et le rang de la ligne (« Prix unitaire, ligne 2 »). « Retirer la ligne » nomme la ligne.
- L'état d'enregistrement est une région `role="status"` (« Enregistré à 14 h 32 »).
- L'aperçu est une image de la facture pour un lecteur d'écran : région nommée « Aperçu de la facture », contenu lisible (texte réel, pas un bitmap), hors de l'ordre de tabulation.
- Dialogue d'émission : modal, focus initial sur « Annuler », Échap ferme, le focus revient à « Émettre la facture ». Le numéro est lu dans la phrase.
- Sous 900 px : l'aperçu passe sous la saisie, replié derrière « Voir l'aperçu ».
- axe-core : 0 violation, thèmes clair et sombre.

## Critères d'acceptation
- [ ] `/facturation/nouvelle` n'envoie aucun `POST` tant qu'aucun patient n'est choisi ; le choisir crée le brouillon et l'URL devient `/facturation/brouillons/:id`.
- [ ] Ouvert depuis « À facturer », l'éditeur montre le patient et une ligne par séance, datée, au tarif renvoyé par l'API.
- [ ] Modifier un prix unitaire met à jour le montant de la ligne, le total et la feuille après l'enregistrement ; le total affiché est celui de l'API.
- [ ] Retirer une ligne de séance la fait réapparaître dans « À facturer ».
- [ ] « Émettre la facture » ouvre le dialogue avec le numéro `nextNumberPreview` ; « Annuler » ne change rien.
- [ ] « Émettre » : la facture porte un numéro, l'écran devient la fiche 36, plus aucun champ n'est modifiable.
- [ ] Case « Déjà réglée » cochée : après l'émission, la facture est *Payée* et un paiement existe dans le journal avec le mode choisi.
- [ ] Réglages incomplets : l'émission affiche le bandeau, nomme ce qui manque, et le brouillon est intact.
- [ ] Erreur `422` sur un champ : le message s'affiche sous ce champ.
- [ ] La feuille reste en clair en thème sombre ; aucune donnée du dossier autre que la date et la désignation n'y figure.
- [ ] Supprimer le brouillon demande confirmation et renvoie les séances dans « À facturer ».
- [ ] axe-core 0 violation.

## Spécifié ici, pas dessiné dans la maquette
Les champs du destinataire tiers et la mention « Pour : … » sur la feuille ; les champs révélés par « Déjà réglée » ; la liste « Ajouter une séance » ; la ligne de remise ; l'état « Non enregistré » ; l'éditeur vide de `/facturation/nouvelle` ; la version sous 900 px. À dessiner avant de développer ces parties.

## Hors périmètre
Modèles de facture multiples ; logo et mise en page personnalisés ; acompte ; facture en plusieurs échéances ; devis transformé en facture ; lignes avec des taux de TVA différents ; pièces jointes.
