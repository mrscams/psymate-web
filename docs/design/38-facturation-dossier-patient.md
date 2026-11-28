# Écran 38 · Facturation · Factures d'un patient (liste filtrée) et points d'entrée

> **Périmètre tranché le 22 novembre 2026 (G Q67, rappelée en fiche 33).** Contrat visé : L5 de `docs/L-plan-facturation.md` (`contract-v0.17.0`, posé par M15-12) ; la section « Route & API » le suit depuis M15-13. Le contrat fusionné (`docs/api-reference.md`, tiré par M15-14) l'emporte : l'écran note tout écart dans sa PR et corrige la fiche. Tâches : `docs/L-plan-facturation.md` L6 (M15-16 pour la liste filtrée, M15-21 pour la fiche patient, M15-22 pour la clôture de séance). Décisions qui portent sur cette fiche : **le dossier patient n'a pas d'onglet Facturation** (un lien de la fiche patient ouvre la liste du module filtrée sur le patient ; l'en-tête patient n'est pas modifié) et **un rendez-vous non honoré ne se facture jamais**. Cadre du module, statuts et règles communes : fiche 33.

> Spécification pour agents. Maquette : `facturation/06-dossier-patient.html` ; captures : `facturation/captures/06-dossier-patient-1.png` à `-7.png`, variantes `-dark` (liste en fin de fiche) ; les trois points d'entrée sont dessinés en fragments sur la même page. Habillage : celui de l'application, par les tokens de `src/theme/tokens.css` (depuis M15-13, les maquettes en reprennent les valeurs ; un écran emploie les noms de tokens, jamais une valeur écrite en dur).

## Objectif
Faire croiser la facturation au praticien là où il travaille déjà, sans double saisie et sans second écran de factures : retrouver ce qu'un patient doit et ce qui lui a été facturé, déclarer une séance à facturer au moment où on la clôt, savoir depuis l'agenda si un rendez-vous terminé est facturé. Et garder les deux mondes étanches : rien de comptable ne se mêle au clinique.

## Route & API
- Route : `/facturation?patient=:id`. C'est l'écran de la fiche 33, même composant de page, avec un filtre de plus. Aucune route sous `/patients/:id`, aucun onglet, aucune touche de raccourci nouvelle.
- `GET /api/invoices?patientId=&status=&overdue=&kind=&from=&cursor=` (fiche 33).
- `GET /api/patients/{id}/billing` → `{ patient: { id, displayName, archived }, balanceDue, dueInvoiceCount, nextDueOn?, billableCount, rate?, rateSource: session | patient | service | none, recipient: { name, addressLines } }` (montants en centimes). `404` : patient inconnu ou d'un autre praticien.
- Fiche patient : `GET` et `PUT /api/patients/{id}/billing-profile` `{ rate?, addressLines?, thirdPartyName?, thirdPartyAddress? }` (`PUT` remplace ; `null` efface ; `409 PATIENT_ARCHIVED` en écriture). L'ancien champ `followUp.fee` (texte libre) n'est plus écrit (M15-21, L10).
- Clôture de séance : `POST /api/sessions/{id}/close` inchangé, puis, après une clôture réussie : case « Ajouter à « À facturer » » décochée → `POST /api/billing/billable-sessions/{sessionEntryId}/dismiss` ; « Réglée en séance » → `POST /api/invoices` `{ patientId, sessionEntryIds: [sessionEntryId] }` puis `POST /api/invoices/{id}/issue` `{ expectedNumber, alreadyPaid: { mode, receivedOn } }` (`expectedNumber` = `nextNumberPreview` du brouillon créé). Un échec de facturation après une clôture réussie ne défait pas la clôture : toast d'avertissement avec un lien vers « À facturer ». Tarif applicable (case cochée par défaut) : `rateSource` de `GET /api/patients/{id}/billing` différent de `none`.
- Agenda : hors M15 (voir « Points d'entrée », 3).
- **Écarts avec la première version de cette fiche** (L5.5) : montants en centimes ; **tarif et adresse du patient par `billing-profile`**, pas par `PATCH /api/patients/{id}` ; **pas de champ `billing` sur la clôture de séance** : le web appelle `dismiss`, ou crée puis émet une facture, après la clôture ; **ligne de l'agenda hors M15** ; pas de bouton « Exporter » sur la liste (aucune route, fiche 33) ; `rateSource` porte aussi `session`. Relevé en dessinant les états (à vérifier sur le contrat fusionné par M15-16 et M15-22) : la carte n'a pas de texte pour `rateSource: none` ; « Modifier dans la fiche » sur un patient archivé mène à une fiche dont l'écriture répond `409` (lien gardé, la fiche le dit) ; « Réglée en séance » cochée laisse « Ajouter à À facturer » cochée (la séance part dans la facture créée) ; le mode de paiement du panneau de clôture propose les modes acceptés des réglages plus « Autre », comme le panneau de paiement de la fiche 36.

- **Contrat `0.17.0` tagué** (`contract-v0.17.0`, M15-12 ; précisions de l'API dans `psymate-api/docs/L-plan-facturation-api.md` L5.6, reportées le 28 novembre 2026 par M15-14 ; le contrat fait foi) :
  - Toute erreur de champ arrive sous le code racine `422 VALIDATION_FAILED`, dans `errors[]` (codes de champ : `REQUIRED`, `INVALID_FORMAT`, `INVALID_VALUE`, `OUT_OF_RANGE`, `UNKNOWN_FIELD` et les codes métier propres à l'écran), toutes ensemble ; chacune s'affiche sous son champ (`shared/forms`). Un montant décimal ou en chaîne est refusé (`INVALID_FORMAT`) : le web envoie des entiers de centimes. Patient inconnu ou d'un autre praticien : `404 PATIENT_NOT_FOUND` ; identifiant illisible : `400 MALFORMED_REQUEST`.
  - `GET /api/patients/{id}/billing` : `rateSource` vaut `patient`, `service` ou `none` (jamais `session`) ; `nextDueOn` = échéance la plus ancienne d'une facture avec un reste dû (passée si une facture est en retard), `null` sans reste dû ; `recipient` = destinataire par défaut d'une nouvelle facture ; patient archivé lisible ; `404 PATIENT_NOT_FOUND`.
  - `PUT …/billing-profile` **remplace tout** (champ absent, `null` ou vide : effacé) : la fiche patient envoie toujours les quatre champs ; `GET` sans profil renvoie les quatre champs à `null` ; `rate` entier de centimes (`INVALID_FORMAT` sinon).
  - Clôture « Réglée en séance » : la création du brouillon puis l'émission peuvent répondre comme dans la fiche 35 (`BILLING_SETTINGS_INCOMPLETE`, `RATE_REQUIRED`, `MODE_NOT_ACCEPTED`, `INVOICE_NUMBER_CHANGED`…) ; la clôture reste faite, toast d'avertissement avec le lien vers « À facturer ».

## Structure de la liste filtrée
Tout ce qui n'est pas dit ici est celui de la fiche 33.

1. **Carte du patient**, à la place du bandeau de chiffres du cabinet :
   - en-tête : pastille d'initiales, nom affiché, « Factures adressées à {nom complet}, {adresse} » ; à droite le lien « Modifier dans la fiche » et le bouton à contour « Ouvrir le dossier » ;
   - trois chiffres : *Reste dû* (montant ; « n facture(s) à régler · échéance le … », ou « rien à régler ») ; *À facturer* (nombre de séances ; « tout est facturé » à zéro, sinon le lien « Voir » vers la fiche 34) ; *Tarif de la séance* (montant ; « repris de la fiche », ou « tarif par défaut » quand la fiche n'en porte pas).
2. **Barre de filtres** : en tête, la puce « Patient : {nom} » avec sa croix (à la place du champ de recherche) ; puis le groupe de statuts, sans « Brouillons » si le patient n'en a pas ; Période. (« Exporter » : hors M15, fiche 33.)
3. **Tableau** : celui de la fiche 33 sans la colonne Patient.
4. Le bouton « Nouvelle facture » de l'en-tête de module ouvre `/facturation/nouvelle?patient=:id`.

## Points d'entrée (ajouts à des écrans existants)
Chacun est une petite tâche dans sa propre feature ; aucune n'importe l'intérieur de `billing` (le lien vers le module est une simple route).

1. **Fiche patient** (fiche 16, rubrique *Suivi*, feature `patients`) :
   - le champ *Tarif de la séance*, aujourd'hui un emplacement `[TARIF]`, devient le tarif appliqué aux séances du patient (aide : « Vide : le tarif de la prestation par défaut s'applique ») ;
   - une ligne « Facturation » : « Reste dû : … » (ou « Rien à régler ») et le lien « Voir les factures », qui ouvre `/facturation?patient=:id`. **C'est le seul chemin du dossier vers le module**, et le seul montant de facturation affiché hors du module ;
   - l'adresse de facturation et un destinataire tiers facultatif.
2. **Clôture de séance** (panneau existant, `features/patient-shell/panels/close-session.panel.ts`, `POST /api/sessions/{id}/close`) : deux lignes à cases avant les boutons.
   - « Ajouter à « À facturer » », avec en secondaire la prestation et le tarif. Cochée par défaut si un tarif existe ; absente si la séance n'a pas de tarif applicable (une ligne d'aide mène aux réglages).
   - « Réglée en séance », avec « Crée la facture acquittée tout de suite ». Cochée, elle révèle le mode de paiement ; à la clôture, la facture est émise et marquée payée dans le même geste.
   - API : aucun champ sur l'appel de clôture (L5.5) ; voir « Route & API ».
3. **Agenda, détail d'un rendez-vous terminé** (fiche 15, feature `agenda`) — **hors du jalon M15** (`docs/L-plan-facturation.md` L1 : aucun rendez-vous n'est relié à une séance aujourd'hui) ; gardé ici pour plus tard : une ligne « Facturation » dit où en est la séance : « Pas encore facturée · 60,00 € » avec le bouton « Facturer » ; « Brouillon » avec « Ouvrir » ; ou le numéro et le statut de la facture en lien. Absente pour un rendez-vous à venir, annulé, non honoré ou d'invité. API attendue : `billing?: { state: none | draft | invoiced, invoiceNumber?, status?, amount? }` sur le rendez-vous.

**Rien ailleurs dans le dossier.** L'en-tête patient garde ses quatre onglets ; la timeline, le graphe, la vue d'ensemble et le Profil 360 n'affichent ni facture ni montant. Dans la liste des patients, la colonne « Attention » reste clinique : un impayé n'y apparaît pas.

## Interactions
- La croix de la puce « Patient : … » retire `?patient=` : le bandeau du cabinet et la colonne Patient reviennent, les autres filtres sont conservés.
- Le filtre ne suit pas vers les onglets *À facturer* et *Paiements* ; revenir sur *Factures* par l'onglet rend la liste entière.
- « Encaisser » au survol et au focus d'une ligne dont le reste dû est supérieur à zéro (panneau de la fiche 36). Après un paiement : la carte du patient et la liste sont relues.
- « Ouvrir le dossier » mène à `/patients/:id`.
- **Patient archivé** : la liste reste consultable et « Encaisser » reste possible sur ce qui est dû ; « Nouvelle facture » n'est pas prérempli avec ce patient et la carte le dit (« Patient archivé »). (L5 : `patient.archived` dans la carte ; un nouveau brouillon pour ce patient répond `409 PATIENT_ARCHIVED`.)
- `?patient=` inconnu ou d'un autre praticien (`404`) : la puce n'est pas posée, la liste entière s'affiche, toast « Patient introuvable ».
- Trois états par bloc (carte du patient, liste) ; liste vide : « Aucune facture pour ce patient » et « Nouvelle facture ».

## Tokens
- Ceux de la fiche 33 pour le tableau et les statuts. La carte du patient est une carte ordinaire (`surface-raised`, `border-subtle`, `radius-xl`, `shadow-2`), en-tête séparé par un filet.
- Puce de filtre : `primary-tint`, bord `primary`, texte `primary-hover`, croix de 16 px.
- Fragments des points d'entrée : cases et lignes du panneau de clôture selon ses propres styles ; les lignes « Facturation » de la fiche patient et du rendez-vous sont des lignes de détail ordinaires.
- Aucun montant, aucun statut de paiement dans l'en-tête patient : ni puce, ni couleur.

## Accessibilité
- La puce de filtre est un bouton nommé « Retirer le filtre : patient Marie D. » ; poser ou retirer le filtre est annoncé (`aria-live="polite"` : « Factures de Marie D., 4 factures »).
- La carte du patient est une région nommée par le patient ; ses trois chiffres sont une liste de termes et de valeurs (« Reste dû, 60 euros, 1 facture à régler »).
- Dans le panneau de clôture, la seconde case est décrite par sa conséquence ; révéler le mode de paiement ne déplace pas le focus.
- axe-core : 0 violation, thèmes clair et sombre.

## Version arabe
Règles de `docs/design/arabe.md` dès la première tâche (M16-24 est couverte par M15-15 à M15-20) : propriétés CSS logiques seulement ; montants, numéros de facture et d'avoir, dates en chiffres, SIRET, IBAN, adresses e-mail en `dir="ltr"` (chiffres latins, `--font-mono` gardé pour numéros et dates tout en chiffres) ; dates et montants par la locale de formatage de `core/i18n` (`data/money.ts`), jamais `LOCALE_ID` ; libellés dans `messages.fr.xlf`, `messages.en.xlf` et `messages.ar.xlf` (termes : `arabe-glossaire.md`) ; flèches et chevrons retournés, colonnes des tableaux dans le sens de lecture, montants alignés du côté de fin ; rendu de `/fr/` et `/en/` inchangé. Ici : la puce « Patient : {nom} », l'en-tête de la carte et la ligne « Facturation » de la fiche patient isolent le nom par `<bdi>` ; adresse de facturation, nom et adresse du destinataire tiers en `dir="auto"` ; champ *Tarif de la séance* en `dir="ltr"` ; dans le panneau de clôture, les deux cases suivent le sens du panneau (déjà retourné par M16-15).

## Critères d'acceptation
- [ ] L'en-tête patient a toujours quatre onglets ; aucune route `/patients/:id/facturation` n'existe.
- [ ] « Voir les factures » dans la fiche patient ouvre `/facturation?patient=:id` : puce « Patient : … », carte du patient, tableau sans colonne Patient.
- [ ] La carte affiche les valeurs de `GET /api/patients/{id}/billing`, sans calcul côté client ; la liste ne montre que les factures de ce patient.
- [ ] La croix de la puce rend la liste entière et le bandeau du cabinet ; l'URL n'a plus `?patient=`.
- [ ] Avec le filtre, « Nouvelle facture » ouvre l'éditeur avec ce patient déjà choisi.
- [ ] « Encaisser » puis l'enregistrement du solde : la ligne passe à *Payée* et *Reste dû* de la carte tombe à zéro.
- [ ] Clore une séance avec « Ajouter à « À facturer » » cochée la fait apparaître dans la fiche 34 ; décochée, elle n'y est pas.
- [ ] Clore avec « Réglée en séance » et un mode : une facture acquittée existe pour cette séance et un paiement est au journal.
- [ ] (Hors M15, L1 : gardé pour la tâche qui reliera un rendez-vous à sa séance.) Le détail d'un rendez-vous terminé montre l'état de facturation et y mène ; un rendez-vous à venir, annulé ou non honoré n'a pas cette ligne.
- [ ] Modifier le tarif dans la fiche change le tarif proposé pour les prochaines séances ; les factures émises ne changent pas.
- [ ] La liste des patients, la timeline, le graphe, la vue d'ensemble, le Profil 360 et l'en-tête patient n'affichent ni montant ni statut de paiement.
- [ ] axe-core 0 violation.

## États dessinés (captures)
Chaque état que la première version de cette fiche spécifiait sans le dessiner l'a été par M15-13 (28 novembre 2026), dans `facturation/06-dossier-patient.html`, section « États spécifiés par la fiche ». Captures dans `facturation/captures/`, en clair et en sombre (suffixe `-dark`) :

- `06-dossier-patient-1.png` : liste filtrée sur un patient (sans « Exporter ») ; fragments des points d'entrée et de l'agenda (hors M15) sur la page.
- `06-dossier-patient-2.png` : clôture de séance, « Réglée en séance » cochée : mode de paiement révélé (Espèces, Chèque, Virement, Carte, Autre).
- `06-dossier-patient-3.png` : fiche patient, rubrique *Suivi* : adresse de facturation, destinataire tiers et son adresse (`billing-profile` ; libellés proposés).
- `06-dossier-patient-4.png` : carte d'un patient archivé (« Patient archivé », « Encaisser » toujours possible, « Nouvelle facture » non prérempli).
- `06-dossier-patient-5.png` : chargement de la carte et de la liste.
- `06-dossier-patient-6.png` : erreur de la carte et de la liste, chacune avec « Réessayer ».
- `06-dossier-patient-7.png` : liste vide (« Aucune facture pour ce patient », « Nouvelle facture »).

Non dessiné : la ligne « Facturation » d'un rendez-vous dans ses états *Brouillon* et *facturée* : hors M15 (L1), une note le dit sous le fragment de l'agenda.

Les libellés que la fiche ne donnait pas et que la maquette propose sont signalés dans la note de chaque cadre (« libellé proposé ») ; une tâche d'écran les reprend tels quels ou les corrige dans sa PR. **Maquettes complétées par M15-13 sans relecture de l'utilisateur.**

## Hors périmètre
Onglet Facturation dans le dossier (G Q67) ; solde ou alerte d'impayé dans la liste des patients ou l'en-tête ; facture visible dans la timeline ou le graphe ; facturation d'un rendez-vous non honoré (G Q67) ; forfait ou carnet de séances prépayées ; partage d'une facture entre deux payeurs ; espace patient pour consulter ses factures.
