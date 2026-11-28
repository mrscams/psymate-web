# Écran 34 · Facturation · À facturer

> **Périmètre tranché le 22 novembre 2026 (G Q67, rappelée en fiche 33).** Même réserve que la fiche 33 : aucune route au contrat ; les routes et champs ci-dessous sont ce que l'écran attend. Cadre du module, statuts et règles communes : fiche 33.

> Spécification pour agents. Maquette : `facturation/02-a-facturer.html` ; capture : `facturation/captures/02-a-facturer-1.png` (et `-dark`). Habillage : celui de l'application, par les tokens de `src/theme/tokens.css` (les maquettes sont dessinées avec les valeurs Fluent 2, G Q59, qui ne sont pas encore sur `main` : on en reprend les noms de tokens, jamais une valeur).

## Objectif
Montrer les séances terminées qui n'ont pas encore de facture et permettre d'en faire des brouillons en un geste, pour un patient ou pour plusieurs. C'est l'écran de la fin de semaine ou de la fin de mois. Rien n'est jamais facturé sans un geste du praticien.

## Route & API attendue
- Route : `/facturation/a-facturer`, deuxième onglet du module. État dans l'URL : `?vue=patient | date` (absent = `patient`), `?jusqu=AAAA-MM-JJ` (absent = aujourd'hui).
- `GET /api/billing/billable-sessions?until=` → `{ groups: [{ patient: { id, displayName }, rate?, rateSource: patient | service | none, lastInvoice?: { number, label }, openDraftCount, sessions: [{ entryId, occurredOn, modality, durationMin, serviceLabel, amount? }] }], dismissedCount }`. Une séance y entre quand elle est close dans le dossier ou quand son rendez-vous est terminé ; c'est le serveur qui le décide.
- `POST /api/invoices/batch` `{ sessionEntryIds: [] }` → `201 { invoices: [{ id, patient, total }] }` : un brouillon par patient.
- `POST /api/billing/billable-sessions/{entryId}/dismiss` et `/restore` (« Ne pas facturer » et son annulation) ; `PATCH /api/billing/billable-sessions/{entryId}` `{ amount?, serviceId? }` (tarif ou prestation de cette séance seulement).
- Le compteur de l'onglet est `billableCount` de `GET /api/billing/summary` (fiche 33).

## Structure
1. **Barre d'outils** : case « Tout sélectionner » (trois états), groupe segmenté *Par patient · Par date*, à droite « Séances » et le champ de date « Jusqu'au … ».
2. **Colonne principale**, une carte par patient :
   - En-tête de groupe : case du groupe (trois états), pastille d'initiales, nom, ligne secondaire (tarif appliqué « 60,00 € la séance », puis s'il y a lieu « dernière facture : F-…, octobre » ou « 1 brouillon en cours ») ; à droite nombre de séances, total du groupe en gras et bouton à contour « Facturer » (crée le brouillon de ce patient avec toutes ses séances et ouvre l'éditeur, fiche 35).
   - Une ligne de 44 px par séance : case, date avec le jour en police à chasse fixe (« jeu. 05/11/2026 »), prestation et, en secondaire, modalité et durée, montant à droite, menu.
   - Ligne ou groupe sélectionné : fond `primary-tint`.
   - **Sans tarif** : la ligne secondaire du groupe devient un avertissement avec icône (« Aucun tarif pour ce patient ni pour une séance de couple »), le montant est « à fixer », le bouton du groupe devient le lien « Renseigner le tarif » (fiche 39), les cases sont inactives.
3. **Rail droit** (300 px) :
   - *Ce qui sera créé* : phrase « Une facture par patient, en brouillon. Vous les relisez avant de les émettre. », la liste des patients sélectionnés avec leur total, puis « n brouillons · n séances » et le total général. Vide tant que rien n'est sélectionné : « Sélectionnez des séances pour préparer leurs factures. »
   - *Écartées* : « n séances marquées « ne pas facturer » ce mois-ci » et le lien « Les afficher » (déplie la liste, chaque ligne avec « Remettre à facturer »).
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

## Spécifié ici, pas dessiné dans la maquette
La vue *Par date* ; la liste « Écartées » dépliée ; le rail avant toute sélection ; le champ de changement de tarif d'une séance ; un groupe en lecture seule (patient archivé) ; la version sous 600 px. À dessiner avant de développer ces parties.

## Hors périmètre
Facturation automatique à la clôture ; règle de facturation par patient (« au mois », « à la séance ») ; facturation d'un rendez-vous non honoré (G Q67 : jamais facturé ; un rendez-vous sans séance close n'entre pas dans cette liste) ; facturation d'un rendez-vous d'invité (sans dossier).
