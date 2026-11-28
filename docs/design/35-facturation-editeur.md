# Écran 35 · Facturation · Nouvelle facture (éditeur d'un brouillon)

> **Périmètre tranché le 22 novembre 2026 (G Q67, rappelée en fiche 33).** Contrat visé : L5 de `docs/L-plan-facturation.md` (`contract-v0.17.0`, posé par M15-12) ; la section « Route & API » le suit depuis M15-13. Le contrat fusionné (`docs/api-reference.md`, tiré par M15-14) l'emporte : l'écran note tout écart dans sa PR et corrige la fiche. Cadre du module, statuts et règles communes : fiche 33.

> Spécification pour agents. Maquette : `facturation/03-editeur.html` ; captures : `facturation/captures/03-editeur-1.png` à `-9.png`, variantes `-dark` (liste en fin de fiche). Habillage : celui de l'application, par les tokens de `src/theme/tokens.css` (depuis M15-13, les maquettes en reprennent les valeurs ; un écran emploie les noms de tokens, jamais une valeur écrite en dur).

## Objectif
Préparer une facture sans risque, puis l'émettre en un geste nommé et confirmé. À gauche ce que le praticien règle ; à droite la feuille telle que le patient la recevra. Tant qu'elle est en brouillon, tout se corrige ; une fois émise, plus rien.

## Route & API
- Routes : `/facturation/nouvelle` (aucun brouillon côté serveur tant qu'aucun patient n'est choisi ; `?patient=:id` préremplit le patient) et `/facturation/brouillons/:id`. Dès la première écriture réussie, l'URL devient `/facturation/brouillons/:id` (remplacement, pas d'entrée d'historique).
- `POST /api/invoices` `{ patientId, sessionEntryIds?, lines? }` → `201` brouillon (une ligne par séance, désignation et prix calculés par le serveur) ; `409 PATIENT_ARCHIVED`, `409 SESSION_ALREADY_INVOICED`, `422 RATE_REQUIRED`.
- `GET /api/invoices/{id}` → `Invoice` (L5.3) ; pour un brouillon : `status: draft`, `patient`, `issuer` (réglages du moment : nom, titre, numéro professionnel, SIRET, adresse, e-mail et téléphone affichés, `vatMention`, `vatRateBp?`, `vatNumber?`, `chequePayee`, `acceptedModes[]`, `bankDetailsShown`), `recipient: { name, addressLines, patientName? }`, `lines: [{ id, position, occurredOn?, serviceId?, label, quantity, unitPrice, amount, sessionEntryId?, credited }]`, `issueDate`, `dueTerm`, `dueOn?`, `footerNote?`, `subtotal`, `vat`, `total`, `nextNumberPreview`, `updatedAt`. Montants en centimes.
- `PATCH /api/invoices/{id}` : fusion partielle de `patientId` (tant qu'aucune ligne de séance), `recipient`, `issueDate`, `dueTerm` (`on_receipt`, `days_15`, `days_30`, `date`), `dueOn`, `footerNote` et `lines` (remplacement complet, 100 au plus ; une ligne de séance retirée rend la séance à « À facturer ») → la facture relue ; `409 INVOICE_ISSUED`. `DELETE /api/invoices/{id}` → `204`.
- « Aperçu PDF » : `GET /api/invoices/{id}/pdf` (brouillon rendu à la demande, filigrane « Brouillon »).
- `POST /api/invoices/{id}/issue` `{ expectedNumber, alreadyPaid?: { mode, receivedOn, reference? } }` → `200` la facture émise ; `409 INVOICE_NUMBER_CHANGED` (`nextNumber` dans le problème), `422 BILLING_SETTINGS_INCOMPLETE` (`errors[]`, un par réglage manquant), `422 EMPTY_INVOICE`, `422` par champ.
- « Envoyer aussi par e-mail » : après une émission réussie, `POST /api/invoices/{id}/send` (fiche 36) avec le modèle « Envoi d'une facture » des réglages ; un envoi refusé laisse la facture émise et se refait depuis la fiche 36.
- Listes de choix : `GET /api/patients` (existant) ; `GET /api/me/billing-services` (fiche 39) ; `GET /api/billing/billable-sessions?patientId=` (« Ajouter une séance », fiche 34). Adresse de facturation : `recipient` du brouillon, repris du profil de facturation du patient (`billing-profile`, fiche 38).
- **Écarts avec la première version de cette fiche** (L5.5) : montants en centimes ; **pas de route d'aperçu** : la feuille est du HTML dessiné par le web depuis `GET /api/invoices/{id}` (G Q70) ; **pas de `sendByEmail`** à l'émission : le web enchaîne émission puis envoi ; `alreadyPaid` part avec la demande d'émission (la case « Déjà réglée » est un état de l'écran, pas un champ du brouillon) ; `date` d'une ligne devient `occurredOn` ; `discount` n'existe pas : **une remise est une ligne à prix unitaire négatif, en montant seulement** (le contrat n'a pas de pourcentage). Relevé en dessinant les états (à vérifier sur le contrat fusionné par M15-17) : L5 ne marque pas une ligne comme remise, le contrôle de forme « prix négatif refusé hors remise » vise donc les lignes de séance ou de prestation (`sessionEntryId` ou `serviceId`) et laisse passer une ligne libre ; `409 SESSION_ALREADY_INVOICED` vaut aussi pour `PATCH` (mêmes règles de lignes que `POST`, L5.6) ; l'éditeur vide de `/facturation/nouvelle` (aucun brouillon) dessine l'en-tête de la feuille depuis `GET /api/me/billing-settings`.

- **Contrat `0.17.0` tagué** (`contract-v0.17.0`, M15-12 ; précisions de l'API dans `psymate-api/docs/L-plan-facturation-api.md` L5.6, reportées le 28 novembre 2026 par M15-14 ; le contrat fait foi) :
  - Toute erreur de champ arrive sous le code racine `422 VALIDATION_FAILED`, dans `errors[]` (codes de champ : `REQUIRED`, `INVALID_FORMAT`, `INVALID_VALUE`, `OUT_OF_RANGE`, `UNKNOWN_FIELD` et les codes métier propres à l'écran), toutes ensemble ; chacune s'affiche sous son champ (`shared/forms`). Un montant décimal ou en chaîne est refusé (`INVALID_FORMAT`) : le web envoie des entiers de centimes. Patient inconnu ou d'un autre praticien : `404 PATIENT_NOT_FOUND` ; identifiant illisible : `400 MALFORMED_REQUEST`.
  - `POST /api/invoices` répond `201` avec la facture complète ; un brouillon vide est permis (`EMPTY_INVOICE` n'arrive qu'à l'émission). **Ligne envoyée** (POST et PATCH) : `{ sessionEntryId?, serviceId?, label, occurredOn?, quantity? (1 à 999), unitPrice }`, `unitPrice` entier de −10 000 000 à 10 000 000 centimes (négatif pour une remise) ; `id`, `position`, `amount`, `credited` sont refusés (`UNKNOWN_FIELD`) : l'écran les retire avant l'envoi. **Les lignes sont recréées à chaque `PATCH` (nouveaux `id`)** : l'état d'écran d'une ligne (focus, erreur) se repère par sa position, jamais par son `id`. 100 lignes libres et 200 lignes de séance au plus (`lines` `OUT_OF_RANGE`).
  - Ligne de séance créée par le serveur : désignation « {prestation retenue} du JJ/MM/AAAA » (ou « Séance du JJ/MM/AAAA »), en français. Destinataire par défaut : le tiers payeur du profil de facturation, sinon le patient avec l'adresse du profil ; `recipient: null` dans un `PATCH` rend ce destinataire par défaut ; `recipient.patientName` (prénom et nom du patient quand ils diffèrent du destinataire) donne la mention « Pour : … ».
  - `PATCH` : `patientId`, `issueDate`, `dueTerm`, `lines` à `null` → `REQUIRED` ; changer de patient alors qu'une ligne de séance de l'ancien reste → `patientId` `INVALID_VALUE` ; `dueTerm: date` exige `dueOn` (`REQUIRED`), `dueOn` avant `issueDate` → `OUT_OF_RANGE` ; `409 INVOICE_ISSUED` aussi pour une facture annulée ou un avoir.
  - Émission, ordre des contrôles du serveur : forme du corps ; `409 INVOICE_ISSUED` ; `422 BILLING_SETTINGS_INCOMPLETE` (`errors[]` : `siret`, `addressLines`, `service`, code `REQUIRED`) ; `422 EMPTY_INVOICE` (aucune ligne, ou sous-total nul ou négatif) ; `422 RATE_REQUIRED` avec `sessionEntryId` (ligne de séance à prix nul ou négatif : la ligne est signalée) ; puis, ensemble sous `VALIDATION_FAILED` : `issueDate` `OUT_OF_RANGE` (date future) ou `INVALID_VALUE` (antérieure à la dernière facture émise de la même suite), `recipient.name` `REQUIRED`, `alreadyPaid.mode` `MODE_NOT_ACCEPTED` (code de champ, « Autre » toujours accepté), `alreadyPaid.receivedOn` `OUT_OF_RANGE` (future) ; enfin `409 INVOICE_NUMBER_CHANGED` avec `nextNumber`, qui dit que tout le reste est bon. `500 PDF_UNAVAILABLE` : rien n'est émis (message d'erreur générique, « Réessayer »).
  - `nextNumberPreview` est dans la suite de l'année de la date d'émission prévue. PDF du brouillon : fichier `facture-brouillon.pdf`. L'aperçu de la feuille en régime assujetti montre HT, TVA et TTC ; `issuer.vatMention` y vaut `null` (pas de mention).

## Structure
1. **Barre de l'éditeur** (bande `surface-raised`) : bouton retour vers la liste, titre « Nouvelle facture », statut *Brouillon*, « Enregistré à 14:32 » ; à droite « Supprimer le brouillon » (contour, texte `danger`), « Aperçu PDF » (contour), « Émettre la facture » (plein).
2. **Colonne de saisie** (carte de 610 px, quatre rubriques séparées par un filet) :
   - **Patient** : liste à saisie assistée (pastille, nom complet). Dessous : « Adresse de facturation : … · Modifier dans la fiche ». Interrupteur « Adresser la facture à une autre personne (parent, employeur, organisme) » : activé, il révèle Nom et Adresse du destinataire ; le patient reste indiqué sur la feuille (« Pour : … »).
   - **Prestations** : tableau de lignes Date · Désignation (liste des prestations des réglages, saisie libre possible) · Qté · Prix unitaire · Montant · retirer. Ligne « Total ». Dessous : « Ajouter une séance » (ouvre la liste des séances non facturées de ce patient), « Ligne libre », « Remise » (une ligne à prix négatif, en montant ; pas de pourcentage au contrat). Aide : d'où viennent les lignes ; retirer une ligne de séance renvoie la séance dans « À facturer ».
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

## Version arabe
Règles de `docs/design/arabe.md` dès la première tâche (M16-24 est couverte par M15-15 à M15-20) : propriétés CSS logiques seulement ; montants, numéros de facture et d'avoir, dates en chiffres, SIRET, IBAN, adresses e-mail en `dir="ltr"` (chiffres latins, `--font-mono` gardé pour numéros et dates tout en chiffres) ; dates et montants par la locale de formatage de `core/i18n` (`data/money.ts`), jamais `LOCALE_ID` ; libellés dans `messages.fr.xlf`, `messages.en.xlf` et `messages.ar.xlf` (termes : `arabe-glossaire.md`) ; flèches et chevrons retournés, colonnes des tableaux dans le sens de lecture, montants alignés du côté de fin ; rendu de `/fr/` et `/en/` inchangé. Ici : nom du patient, désignations, nom et adresse du destinataire et mention au bas de la facture sont du contenu saisi, en `dir="auto"` dans les champs ; champs de prix et de quantité en `dir="ltr"` ; l'état « Enregistré à 14:32 » met l'heure en forme par `core/i18n`. La feuille de facture (aperçu et PDF) reste en français et de gauche à droite dans les trois langues (conteneur `lang="fr" dir="ltr"`, G Q70) ; seul l'habillage autour est traduit et retourné.

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

## États dessinés (captures)
Chaque état que la première version de cette fiche spécifiait sans le dessiner l'a été par M15-13 (28 novembre 2026), dans `facturation/03-editeur.html`, section « États spécifiés par la fiche ». Captures dans `facturation/captures/`, en clair et en sombre (suffixe `-dark`) :

- `03-editeur-1.png` : le brouillon.
- `03-editeur-2.png` : dialogue « Émettre la facture ? ».
- `03-editeur-3.png` : facture adressée à une autre personne : Nom et Adresse du destinataire, « Pour : … » sur la feuille (`recipient.patientName`).
- `03-editeur-4.png` : « Déjà réglée » cochée : Mode de paiement, Reçu le, Référence (facultatif) (`alreadyPaid` de `/issue`).
- `03-editeur-5.png` : liste « Ajouter une séance » (séances non facturées du patient, `billable-sessions?patientId=`).
- `03-editeur-6.png` : ligne de remise, en montant (pas de pourcentage au contrat).
- `03-editeur-7.png` : état « Non enregistré » avec « Réessayer ».
- `03-editeur-8.png` : éditeur vide de `/facturation/nouvelle` (aucun patient, rien d'envoyé ; Supprimer, Aperçu PDF et Ajouter une séance inactifs).
- `03-editeur-9.png` : version sous 900 px (aperçu replié derrière « Voir l'aperçu »).

Non dessiné : Chargement, erreur et « Ce brouillon n'existe plus » du brouillon chargé par son identifiant : décrits dans « Interactions », dessinés par les états partagés (fiche 29).

Les libellés que la fiche ne donnait pas et que la maquette propose sont signalés dans la note de chaque cadre (« libellé proposé ») ; une tâche d'écran les reprend tels quels ou les corrige dans sa PR. **Maquettes complétées par M15-13 sans relecture de l'utilisateur.**

## Hors périmètre
Modèles de facture multiples ; logo et mise en page personnalisés ; acompte ; facture en plusieurs échéances ; devis transformé en facture ; lignes avec des taux de TVA différents ; pièces jointes.
