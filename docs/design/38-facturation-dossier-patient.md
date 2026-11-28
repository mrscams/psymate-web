# Écran 38 · Facturation · Factures d'un patient (liste filtrée) et points d'entrée

> **Périmètre tranché le 22 novembre 2026 (G Q67, rappelée en fiche 33).** Même réserve que la fiche 33 : aucune route au contrat ; le contrat visé et les tâches sont dans `docs/L-plan-facturation.md` (L5, L6). Décisions qui portent sur cette fiche : **le dossier patient n'a pas d'onglet Facturation** (un lien de la fiche patient ouvre la liste du module filtrée sur le patient ; l'en-tête patient n'est pas modifié) et **un rendez-vous non honoré ne se facture jamais**. Cadre du module, statuts et règles communes : fiche 33.

> Spécification pour agents. Maquette : `facturation/06-dossier-patient.html` ; capture : `facturation/captures/06-dossier-patient-1.png` (et `-dark`) ; les trois points d'entrée sont dessinés en fragments sur la même page. Habillage : celui de l'application, par les tokens de `src/theme/tokens.css` (les maquettes sont dessinées avec les valeurs Fluent 2, G Q59, qui ne sont pas encore sur `main` : on en reprend les noms de tokens, jamais une valeur).

## Objectif
Faire croiser la facturation au praticien là où il travaille déjà, sans double saisie et sans second écran de factures : retrouver ce qu'un patient doit et ce qui lui a été facturé, déclarer une séance à facturer au moment où on la clôt, savoir depuis l'agenda si un rendez-vous terminé est facturé. Et garder les deux mondes étanches : rien de comptable ne se mêle au clinique.

## Route & API attendue
- Route : `/facturation?patient=:id`. C'est l'écran de la fiche 33, même composant de page, avec un filtre de plus. Aucune route sous `/patients/:id`, aucun onglet, aucune touche de raccourci nouvelle.
- `GET /api/invoices?patientId=&status=&from=&cursor=` (fiche 33).
- `GET /api/patients/{id}/billing` → `{ patient: { id, displayName }, balanceDue, dueInvoiceCount, nextDueOn?, billableCount, rate?, rateSource: patient | service | none, recipient: { name, addressLines[] } }`.
- Fiche patient : `rate`, `billingAddress`, `billingRecipient?` lus et écrits par `PATCH /api/patients/{id}` (champs à ajouter au contrat).
- Clôture de séance et agenda : voir « Points d'entrée ».

## Structure de la liste filtrée
Tout ce qui n'est pas dit ici est celui de la fiche 33.

1. **Carte du patient**, à la place du bandeau de chiffres du cabinet :
   - en-tête : pastille d'initiales, nom affiché, « Factures adressées à {nom complet}, {adresse} » ; à droite le lien « Modifier dans la fiche » et le bouton à contour « Ouvrir le dossier » ;
   - trois chiffres : *Reste dû* (montant ; « n facture(s) à régler · échéance le … », ou « rien à régler ») ; *À facturer* (nombre de séances ; « tout est facturé » à zéro, sinon le lien « Voir » vers la fiche 34) ; *Tarif de la séance* (montant ; « repris de la fiche », ou « tarif par défaut » quand la fiche n'en porte pas).
2. **Barre de filtres** : en tête, la puce « Patient : {nom} » avec sa croix (à la place du champ de recherche) ; puis le groupe de statuts, sans « Brouillons » si le patient n'en a pas ; Période ; Exporter.
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
   - API attendue : champ `billing: { billable, paidNow?: { mode } }` sur l'appel de clôture.
3. **Agenda, détail d'un rendez-vous terminé** (fiche 15, feature `agenda`) — **hors du jalon M15** (`docs/L-plan-facturation.md` L1 : aucun rendez-vous n'est relié à une séance aujourd'hui) ; gardé ici pour plus tard : une ligne « Facturation » dit où en est la séance : « Pas encore facturée · 60,00 € » avec le bouton « Facturer » ; « Brouillon » avec « Ouvrir » ; ou le numéro et le statut de la facture en lien. Absente pour un rendez-vous à venir, annulé, non honoré ou d'invité. API attendue : `billing?: { state: none | draft | invoiced, invoiceNumber?, status?, amount? }` sur le rendez-vous.

**Rien ailleurs dans le dossier.** L'en-tête patient garde ses quatre onglets ; la timeline, le graphe, la vue d'ensemble et le Profil 360 n'affichent ni facture ni montant. Dans la liste des patients, la colonne « Attention » reste clinique : un impayé n'y apparaît pas.

## Interactions
- La croix de la puce « Patient : … » retire `?patient=` : le bandeau du cabinet et la colonne Patient reviennent, les autres filtres sont conservés.
- Le filtre ne suit pas vers les onglets *À facturer* et *Paiements* ; revenir sur *Factures* par l'onglet rend la liste entière.
- « Encaisser » au survol et au focus d'une ligne dont le reste dû est supérieur à zéro (panneau de la fiche 36). Après un paiement : la carte du patient et la liste sont relues.
- « Ouvrir le dossier » mène à `/patients/:id`.
- **Patient archivé** : la liste reste consultable et « Encaisser » reste possible sur ce qui est dû ; « Nouvelle facture » n'est pas prérempli avec ce patient et la carte le dit (« Patient archivé »). (À confirmer avec le contrat.)
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

## Critères d'acceptation
- [ ] L'en-tête patient a toujours quatre onglets ; aucune route `/patients/:id/facturation` n'existe.
- [ ] « Voir les factures » dans la fiche patient ouvre `/facturation?patient=:id` : puce « Patient : … », carte du patient, tableau sans colonne Patient.
- [ ] La carte affiche les valeurs de `GET /api/patients/{id}/billing`, sans calcul côté client ; la liste ne montre que les factures de ce patient.
- [ ] La croix de la puce rend la liste entière et le bandeau du cabinet ; l'URL n'a plus `?patient=`.
- [ ] Avec le filtre, « Nouvelle facture » ouvre l'éditeur avec ce patient déjà choisi.
- [ ] « Encaisser » puis l'enregistrement du solde : la ligne passe à *Payée* et *Reste dû* de la carte tombe à zéro.
- [ ] Clore une séance avec « Ajouter à « À facturer » » cochée la fait apparaître dans la fiche 34 ; décochée, elle n'y est pas.
- [ ] Clore avec « Réglée en séance » et un mode : une facture acquittée existe pour cette séance et un paiement est au journal.
- [ ] Le détail d'un rendez-vous terminé montre l'état de facturation et y mène ; un rendez-vous à venir, annulé ou non honoré n'a pas cette ligne.
- [ ] Modifier le tarif dans la fiche change le tarif proposé pour les prochaines séances ; les factures émises ne changent pas.
- [ ] La liste des patients, la timeline, le graphe, la vue d'ensemble, le Profil 360 et l'en-tête patient n'affichent ni montant ni statut de paiement.
- [ ] axe-core 0 violation.

## Spécifié ici, pas dessiné dans la maquette
La ligne « Facturation » du rendez-vous dans ses états *Brouillon* et *facturée* (seul « Pas encore facturée » est dessiné) ; le mode de paiement révélé par « Réglée en séance » ; l'adresse de facturation et le destinataire tiers dans la fiche patient ; la carte d'un patient archivé ; les états de chargement, d'erreur et vide. À dessiner avant de développer ces parties.

## Hors périmètre
Onglet Facturation dans le dossier (G Q67) ; solde ou alerte d'impayé dans la liste des patients ou l'en-tête ; facture visible dans la timeline ou le graphe ; facturation d'un rendez-vous non honoré (G Q67) ; forfait ou carnet de séances prépayées ; partage d'une facture entre deux payeurs ; espace patient pour consulter ses factures.
