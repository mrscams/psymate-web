# Écran 34 · Facturation · À facturer

> **Périmètre tranché le 22 novembre 2026 (G Q67, rappelée en fiche 33).** Contrat visé : L5 de `docs/L-plan-facturation.md` (`contract-v0.17.0`, posé par M15-12) ; la section « Route & API » le suit depuis M15-13. Le contrat fusionné (`docs/api-reference.md`, tiré par M15-14) l'emporte : l'écran note tout écart dans sa PR et corrige la fiche. Cadre du module, statuts et règles communes : fiche 33.

> Spécification pour agents. Maquette : `facturation/02-a-facturer.html` ; captures : `facturation/captures/02-a-facturer-1.png` à `-7.png`, variantes `-dark` (liste en fin de fiche). Habillage : celui de l'application, par les tokens de `src/theme/tokens.css` (depuis M15-13, les maquettes en reprennent les valeurs ; un écran emploie les noms de tokens, jamais une valeur écrite en dur).

## Objectif
Montrer les séances terminées qui n'ont pas encore de facture et permettre d'en faire des brouillons en un geste, pour un patient ou pour plusieurs. C'est l'écran de la fin de semaine ou de la fin de mois. Rien n'est jamais facturé sans un geste du praticien.

## Route & API
- Route : `/facturation/a-facturer`, deuxième onglet du module. État dans l'URL : `?vue=patient | date` (absent = `patient`), `?jusqu=AAAA-MM-JJ` (absent = aujourd'hui).
- `GET /api/billing/billable-sessions?until=&patientId=` → `{ groups: [{ patient: { id, displayName, archived }, rate?, rateSource: session | patient | service | none, openDraftCount, lastInvoice?: { number, issueDate }, sessions: [{ sessionEntryId, occurredOn, modality, durationMin?, serviceId?, serviceLabel?, amount? }] }], dismissedCount }`. État `pending` seulement ; groupes par nom affiché, séances par date ; montants en centimes. Une séance y entre quand une séance de type `session` (ni accueil, ni contact) est close dans le dossier : c'est le serveur qui le décide ; un rendez-vous de l'agenda n'en crée jamais (G Q67 point 7, Q86 de l'API).
- `GET /api/billing/billable-sessions/dismissed` : les séances écartées des 90 derniers jours, même forme sans regroupement (liste « Écartées » dépliée).
- `POST /api/invoices/batch` `{ sessionEntryIds: [] }` (200 au plus) → `201 { invoices: [{ id, patient, total }] }` : un brouillon par patient, tout ou rien. « Facturer » sur un groupe : `POST /api/invoices` `{ patientId, sessionEntryIds }` → `201` brouillon, puis l'éditeur (fiche 35).
- `POST /api/billing/billable-sessions/{sessionEntryId}/dismiss` et `/restore` (« Ne pas facturer » et son annulation ; `204`, idempotents ; `404 SESSION_NOT_BILLABLE`, `409 SESSION_ALREADY_INVOICED`) ; `PATCH /api/billing/billable-sessions/{sessionEntryId}` `{ amount?, serviceId? }` (tarif ou prestation de cette séance seulement ; `null` rend le tarif calculé).
- Le compteur de l'onglet est `billableCount` de `GET /api/billing/summary` (fiche 33).
- **Écarts avec la première version de cette fiche** (L5.5) : montants en centimes ; `entryId` devient `sessionEntryId` ; `rateSource` porte aussi `session` (montant fixé sur la séance par « Changer le tarif de cette séance ») ; `lastInvoice` est `{ number, issueDate }` (le mois affiché se forme depuis la date) ; `patient.archived` signale le groupe en lecture seule ; un rendez-vous terminé sans séance close n'entre pas dans la liste ; « Écartées » couvre les 90 derniers jours (`dismissedCount`), pas le seul mois en cours : le libellé suit le contrat fusionné. Relevé en dessinant les états (à vérifier sur le contrat fusionné par M15-19) : L5 n'a pas de paramètre de vue et renvoie les séances par patient : la vue *Par date* réordonne côté client les séances reçues (seule exception à « l'ordre de l'API »), et l'avertissement de tarif manquant y va sur la ligne ; une séance ne dit pas si son tarif a été fixé à la main (`rateSource` est sur le groupe) : « Revenir au tarif calculé » est proposé sur toute séance d'un groupe `rateSource: session` ; la liste des écartées ne dit pas où se lit le patient de chaque ligne.

## Structure
1. **Barre d'outils** : case « Tout sélectionner » (trois états), groupe segmenté *Par patient · Par date*, à droite « Séances » et le champ de date « Jusqu'au … ».
2. **Colonne principale**, une carte par patient :
   - En-tête de groupe : case du groupe (trois états), pastille d'initiales, nom, ligne secondaire (tarif appliqué « 60,00 € la séance », puis s'il y a lieu « dernière facture : F-…, octobre » ou « 1 brouillon en cours ») ; à droite nombre de séances, total du groupe en gras et bouton à contour « Facturer » (crée le brouillon de ce patient avec toutes ses séances et ouvre l'éditeur, fiche 35).
   - Une ligne de 44 px par séance : case, date avec le jour en police à chasse fixe (« jeu. 05/11/2026 »), prestation et, en secondaire, modalité et durée, montant à droite, menu.
   - Ligne ou groupe sélectionné : fond `primary-tint`.
   - **Sans tarif** : la ligne secondaire du groupe devient un avertissement avec icône (« Aucun tarif pour ce patient ni pour une séance de couple »), le montant est « à fixer », le bouton du groupe devient le lien « Renseigner le tarif » (fiche 39), les cases sont inactives.
3. **Rail droit** (300 px) :
   - *Ce qui sera créé* : phrase « Une facture par patient, en brouillon. Vous les relisez avant de les émettre. », la liste des patients sélectionnés avec leur total, puis « n brouillons · n séances » et le total général. Vide tant que rien n'est sélectionné : « Sélectionnez des séances pour préparer leurs factures. »
   - *Écartées* : « n séances marquées « ne pas facturer » » (`dismissedCount`, 90 derniers jours) et le lien « Les afficher » (déplie la liste, chaque ligne avec « Remettre à facturer »).
4. **Barre flottante de sélection** (ombre 8, en bas de la page, visible dès qu'une case est cochée) : « n séances sélectionnées », « n patients · total », « Tout désélectionner », bouton plein « Créer n brouillons » (singulier : « Créer le brouillon »).
5. *Par date* : mêmes lignes, sans regroupement, le patient en première colonne ; le rail et la barre ne changent pas.

## Interactions
- Menu d'une séance : Changer le tarif de cette séance ; Ouvrir la séance dans le dossier ; séparateur ; Ne pas facturer.
- « Créer n brouillons » : `POST /api/invoices/batch`, puis la liste et le compteur de l'onglet sont **relus** ; un toast confirme (« 2 brouillons créés ») avec l'action « Voir les brouillons » (`/facturation?statut=draft`). Pour un seul patient, l'éditeur s'ouvre sur le brouillon.
- « Ne pas facturer » : la séance quitte la liste, toast avec « Annuler » ; elle reste sous « Écartées ».
- Erreurs : `409 SESSION_ALREADY_INVOICED` (facturée entre-temps, depuis un autre appareil) → toast et relecture ; `422 RATE_REQUIRED` sur une séance → message sur son groupe ; `409 PATIENT_ARCHIVED` → toast, le groupe passe en lecture seule.
- Trois états : chargement ; erreur avec « Réessayer » ; vide (« Tout est facturé », « Les prochaines séances terminées apparaîtront ici. »). À zéro, l'onglet ne porte pas de compteur.

## Tokens
- Sélection : `primary-tint` ; case cochée et bouton plein : `primary`. En-tête de groupe sur `surface-raised`, lignes séparées par `border-subtle`.
- Avertissement de tarif manquant : `warning` avec icône, sur la ligne secondaire ; pas de bandeau.
- Barre flottante : `surface-raised`, `border-subtle`, `radius-xl`, `shadow-8`. Menu : `radius-md`, `shadow-16`, lignes de 32 px.

## Accessibilité
- Chaque groupe est une région nommée par le patient ; la case du groupe annonce « Hélène R., 2 séances, 120 euros, cochée ».
- Les cases de séance sont nommées par la date et la prestation. « Tout sélectionner » et les cases de groupe exposent l'état mixte (`aria-checked="mixed"`).
- La barre flottante est une région `role="status"` : le nombre de séances et le total sont annoncés à chaque changement, sans prendre le focus.
- Une case inactive (sans tarif) est décrite par l'avertissement du groupe (`aria-describedby`).
- Aucune donnée clinique dans les lignes : date, modalité, durée, prestation. Ni titre de séance, ni note.
- axe-core : 0 violation, thèmes clair et sombre.

## Version arabe
Règles de `docs/design/arabe.md` dès la première tâche (M16-24 est couverte par M15-15 à M15-20) : propriétés CSS logiques seulement ; montants, numéros de facture et d'avoir, dates en chiffres, SIRET, IBAN, adresses e-mail en `dir="ltr"` (chiffres latins, `--font-mono` gardé pour numéros et dates tout en chiffres) ; dates et montants par la locale de formatage de `core/i18n` (`data/money.ts`), jamais `LOCALE_ID` ; libellés dans `messages.fr.xlf`, `messages.en.xlf` et `messages.ar.xlf` (termes : `arabe-glossaire.md`) ; flèches et chevrons retournés, colonnes des tableaux dans le sens de lecture, montants alignés du côté de fin ; rendu de `/fr/` et `/en/` inchangé. Ici : le nom du patient en `dir="auto"` (en-tête de groupe, vue par date, rail) ; dates à nom de jour (« jeu. 05/11/2026 ») en `--font-mono-text` avec chiffres tabulaires ; la barre flottante et le rail changent de côté avec la page ; le groupe segmenté *Par patient · Par date* suit la section 6 de `arabe.md`.

## Critères d'acceptation
- [ ] Clore une séance d'un patient qui a un tarif la fait apparaître ici, et le compteur de l'onglet augmente de un ; aucune facture n'est créée.
- [ ] L'ordre des groupes et des séances est celui de l'API ; le tarif affiché est celui renvoyé (`rateSource`), jamais recalculé.
- [ ] Cocher les séances de deux patients affiche « Créer 2 brouillons » et les deux lignes du rail avec leurs totaux.
- [ ] « Créer 2 brouillons » crée exactement deux brouillons, les séances quittent la liste, le compteur baisse d'autant, le toast propose « Voir les brouillons ».
- [ ] « Facturer » sur un groupe ouvre l'éditeur avec ce patient et toutes ses séances en lignes.
- [ ] Un groupe sans tarif ne peut pas être coché et mène aux réglages.
- [ ] « Ne pas facturer » retire la séance, « Annuler » la remet ; elle se retrouve sous « Écartées ».
- [ ] Une séance facturée depuis un autre onglet du navigateur entre-temps : `409`, toast, liste relue, aucun doublon.
- [ ] État vide : « Tout est facturé », pas de compteur sur l'onglet.
- [ ] axe-core 0 violation.

## États dessinés (captures)
Chaque état que la première version de cette fiche spécifiait sans le dessiner l'a été par M15-13 (28 novembre 2026), dans `facturation/02-a-facturer.html`, section « États spécifiés par la fiche ». Captures dans `facturation/captures/`, en clair et en sombre (suffixe `-dark`) :

- `02-a-facturer-1.png` : choisir, puis créer les brouillons.
- `02-a-facturer-2.png` : vue *Par date* (patient après la case ; rail et barre inchangés).
- `02-a-facturer-3.png` : rail avant toute sélection (« Sélectionnez des séances pour préparer leurs factures. »).
- `02-a-facturer-4.png` : liste « Écartées » dépliée, « Remettre à facturer » sur chaque ligne (`…/dismissed`, `…/restore`).
- `02-a-facturer-5.png` : changement du tarif d'une séance (Prestation, Montant, retour au tarif calculé par `null` ; libellés proposés).
- `02-a-facturer-6.png` : groupe en lecture seule d'un patient archivé (« Patient archivé », cases inactives, ni « Facturer » ni menu ; toast de `409 PATIENT_ARCHIVED`).
- `02-a-facturer-7.png` : sous 600 px (une carte par patient, barre de sélection en bas, « Écartées » sous la liste).

Non dessiné : rien.

Les libellés que la fiche ne donnait pas et que la maquette propose sont signalés dans la note de chaque cadre (« libellé proposé ») ; une tâche d'écran les reprend tels quels ou les corrige dans sa PR. **Maquettes complétées par M15-13 sans relecture de l'utilisateur.**

## Hors périmètre
Facturation automatique à la clôture ; règle de facturation par patient (« au mois », « à la séance ») ; facturation d'un rendez-vous non honoré (G Q67 : jamais facturé ; un rendez-vous sans séance close n'entre pas dans cette liste) ; facturation d'un rendez-vous d'invité (sans dossier).
