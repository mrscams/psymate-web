# Écran 33 · Facturation · Factures (liste et cadre du module)

> **Périmètre tranché par l'utilisateur le 22 novembre 2026 : G Q67**, huit points, rappelés ci-dessous et dans `facturation/index.html` (« Décisions du 22 novembre 2026 »). Contrat visé : L5 de `docs/L-plan-facturation.md` (`contract-v0.17.0`, posé par M15-12) ; la section « Route & API » le suit depuis M15-13. Le contrat fusionné (`docs/api-reference.md`, tiré par M15-14) l'emporte : l'écran note tout écart dans sa PR et corrige la fiche. Plan de réalisation (jalon M15, tâches API et web) : `docs/L-plan-facturation.md`. Décisions du web : G Q68 (feature `billing`), Q69 (montants en centimes venus de l'API, jamais additionnés à l'écran), Q70 (feuille dessinée en HTML).

> Spécification pour agents. Maquette : `facturation/01-factures.html` ; captures : `facturation/captures/01-factures-1.png` à `-7.png`, variantes `-dark` (liste en fin de fiche). Habillage : celui de l'application, par les tokens de `src/theme/tokens.css` (depuis M15-13, les maquettes en reprennent les valeurs ; un écran emploie les noms de tokens, jamais une valeur écrite en dur). La barre d'application, le rail et le panneau latéral sont les composants partagés tels qu'ils existent (fiche 00), pas ceux dessinés dans la maquette. Cette fiche porte aussi le cadre commun aux fiches 34 à 39.

## Objectif
Répondre, à l'ouverture du module, à trois questions dans cet ordre : combien ai-je encaissé ce mois-ci, qui me doit encore quelque chose, que me reste-t-il à facturer. Puis retrouver une facture et agir dessus sans l'ouvrir quand c'est possible.

## Décisions du 22 novembre 2026 (G Q67)
1. **Périmètre** : France ; psychologues et coachs qui émettent leurs propres factures (trois régimes de TVA, fiche 39).
2. **Feuilles de soins** (psychiatres, télétransmission, tiers payant) : hors périmètre, sans place réservée.
3. **Paiement en ligne** : non ; le praticien enregistre un paiement reçu par ailleurs.
4. **Envoi par e-mail au patient** : oui, depuis l'application, au nom du praticien, sans contenu clinique (fiche 36).
5. **Réglages** : quatrième onglet du module, pas une page de Mon compte (fiche 39).
6. **Dossier patient** : pas d'onglet Facturation ; un lien de la fiche patient ouvre cette liste filtrée sur le patient (fiche 38). L'en-tête patient n'est pas modifié.
7. **Rendez-vous non honoré** : jamais facturé ; aucune prestation ni action ne le propose.
8. **Carreau du rail** : libellé « Facture » inchangé ; le titre de la page est « Facturation ».

## Cadre du module (commun aux fiches 33 à 39)
- Feature Angular `billing`, chargée à la demande, avec son `index.ts` ; habillage praticien ; `contentWidth: 'full'`. `admin` ne l'importe jamais.
- Entrée : carreau « Facture » du rail (`shared/ui/nav-rail`), actif sur `/facturation/**`. Lui donner sa route est une tâche de socle dédiée. Le libellé du carreau ne change pas ; le titre de la page est « Facturation ».
- **En-tête de module** : bande `surface-raised` identique à l'en-tête patient. Titre « Facturation », bouton plein « Nouvelle facture » (touche `N`) à droite, puis une ligne d'onglets (même dessin que ceux de l'en-tête patient) : **Factures** (`/facturation`), **À facturer** (`/facturation/a-facturer`, fiche 34, avec un compteur si supérieur à zéro), **Paiements** (`/facturation/paiements`, fiche 37) et, au bout de la ligne à droite, **Réglages** (`/facturation/reglages`, fiche 39). Sur Réglages, pas de bouton « Nouvelle facture ».
- Autres routes : `/facturation/nouvelle` et `/facturation/brouillons/:id` (éditeur, fiche 35) ; `/facturation/:numero` (facture émise ou avoir, fiche 36), déclarée après les routes fixes. Aucune route sous le dossier patient : `/facturation?patient=:id` en tient lieu (fiche 38).
- **Statuts** (une icône et un mot, jamais la couleur seule) :

| Statut affiché | Quand | Tokens |
| --- | --- | --- |
| Brouillon | créée, non émise, sans numéro | `surface-sunken`, `text-secondary`, cercle pointillé |
| À régler | émise, aucun paiement, échéance non dépassée | `info-bg`, `info`, horloge |
| Payée en partie | au moins un paiement, reste dû supérieur à zéro | `info-bg`, `info`, demi-disque |
| Payée | reste dû à zéro | `success-bg`, `success`, coche |
| En retard | échéance dépassée, reste dû supérieur à zéro ; décidé par le serveur | `warning-bg`, `warning`, triangle |
| Annulée | annulée en totalité par un avoir | `surface-sunken`, `text-secondary`, cercle barré ; numéro barré |
| Avoir | le document d'avoir lui-même | contour `border-strong`, `text-secondary`, flèche de retour |

- **Règles communes.** Rien de clinique sur un document comptable (une ligne porte une date et une désignation). Rien de comptable dans le clinique (aucun montant ni statut de paiement hors du module ; seule exception, la ligne « Facturation » de la fiche patient, fiche 38). Une facture émise ne se modifie ni ne se supprime : elle se corrige par un avoir. Numéro, date d'émission, totaux, reste dû, statut et chiffres du bandeau viennent du serveur. Après une écriture, on relit ; on ne recalcule pas.
- Montants : centimes entiers de l'API (G Q69), affichés par `data/money.ts` (`Intl.NumberFormat` avec la locale de formatage de `core/i18n`), devise EUR, alignés à droite, chiffres tabulaires. Numéros et dates : police à chasse fixe. Dates en UTC en transit.

## Route & API
- Route : `/facturation`. État dans l'URL : `?statut=draft | due | late | paid | credit` (absent = toutes), `?q=`, `?depuis=AAAA-MM`, `?patient=:id` (liste filtrée sur un patient : puce de filtre, carte du patient à la place du bandeau, colonne Patient masquée ; détail en fiche 38). Passage à l'API : `draft`, `due`, `paid` → `status=` ; `late` → `overdue=true` ; `credit` → `kind=credit_note` ; `?depuis=` → `from=` (premier jour du mois) ; `?patient=` → `patientId=` ; `?q=` → `q=` (deux caractères au moins, numéro ou nom affiché).
- `GET /api/billing/summary` → `{ month, collected, paymentCount, outstanding, outstandingCount, overdue, overdueCount, oldestOverdueDays?, billableCount, billableAmount, billableWithoutRate }` (montants en centimes ; `month` nomme le mois de « Encaissé en {mois} »).
- `GET /api/invoices?status=&overdue=&kind=&patientId=&q=&from=&cursor=` → `{ items: [InvoiceSummary], nextCursor? }`, avec `InvoiceSummary = { id, kind: invoice | credit_note, number?, status: draft | due | partial | paid | void (issued pour un avoir), overdue, overdueDays?, patient: { id, displayName }, issueDate, dueOn?, subject: { sessionCount, firstOn?, lastOn?, label? }, total, balanceDue, lastPaymentMode?, creditNoteNumber?, cancelsNumber? }`. Ordre du serveur : brouillons d'abord, puis date d'émission décroissante. **Le client ne retrie pas.**
- Statut affiché (table ci-dessus) : `kind = credit_note` → Avoir ; `draft` → Brouillon ; `void` → Annulée ; `overdue = true` → En retard (avec `overdueDays`) ; sinon `due` → À régler, `partial` → Payée en partie, `paid` → Payée (avec `lastPaymentMode`). Objet : « n séances · dates » depuis `subject.sessionCount`, `firstOn`, `lastOn`, ou `subject.label` ; avoir : « Avoir · annule {cancelsNumber} » ; annulée : `creditNoteNumber` à côté du statut.
- Actions de ligne : `DELETE /api/invoices/{id}` (brouillon seulement, `204`, ses séances reviennent dans « À facturer » ; `409 INVOICE_ISSUED` sinon) ; `GET /api/invoices/{id}/pdf` (brouillon : filigrane « Brouillon ») ; `POST /api/invoices/{id}/duplicate` (`201`, brouillon) ; les panneaux de la fiche 36 (paiement, avoir, envoi).
- **Écarts avec la première version de cette fiche** (L5.5) : montants en centimes entiers ; `collectedThisMonth` devient `collected` et `month` ; `issuedOn` devient `issueDate` ; `paidWith` devient `lastPaymentMode` ; `subject` est un objet ; **le contrat n'a aucune route d'export de la liste des factures** : le bouton « Exporter » n'est pas réalisé en M15 (retiré des maquettes).

- **Contrat `0.17.0` tagué** (`contract-v0.17.0`, M15-12 ; précisions de l'API dans `psymate-api/docs/L-plan-facturation-api.md` L5.6, reportées le 28 novembre 2026 par M15-14 ; le contrat fait foi) :
  - Toute erreur de champ arrive sous le code racine `422 VALIDATION_FAILED`, dans `errors[]` (codes de champ : `REQUIRED`, `INVALID_FORMAT`, `INVALID_VALUE`, `OUT_OF_RANGE`, `UNKNOWN_FIELD` et les codes métier propres à l'écran), toutes ensemble ; chacune s'affiche sous son champ (`shared/forms`). Un montant décimal ou en chaîne est refusé (`INVALID_FORMAT`) : le web envoie des entiers de centimes. Patient inconnu ou d'un autre praticien : `404 PATIENT_NOT_FOUND` ; identifiant illisible : `400 MALFORMED_REQUEST`.
  - `GET /api/invoices` : `limit` (1 à 100, 50 par défaut) ; `q` de 2 à 100 caractères, sans casse ni accents, cherche aussi dans le nom du destinataire ; `status` n'a que les cinq valeurs (un avoir se filtre par `kind=credit_note`) ; ordre : brouillons, date d'émission décroissante, identifiant. `patient` porte aussi `archived` ; `dueOn` est l'échéance effective, brouillon compris ; `balanceDue` vaut le total pour un brouillon (la colonne garde « — ») et 0 pour un avoir ; **le total d'un avoir est négatif** (affiché « − 60,00 € », signe écrit) ; `subject.label` = désignation de la première ligne quand aucune ligne n'est une séance.
  - `GET /api/billing/summary` : `month` vaut `AAAA-MM` (mois du jour à Paris) ; `collected` = paiements du mois moins remboursements du mois ; `oldestOverdueDays` est `null` sans retard ; les séances à facturer des patients archivés sont comptées.
  - `DELETE` d'un brouillon : `204`, puis `404 INVOICE_NOT_FOUND`. `duplicate` : `409 CREDIT_NOTE_NOT_DUPLICABLE` pour un avoir (l'entrée « Dupliquer » n'est pas proposée sur un avoir), `409 PATIENT_ARCHIVED`.

## Structure
1. **Bandeau de chiffres** (carte, quatre cellules séparées par un filet) : *Encaissé en {mois}* (montant, nombre de paiements) ; *À encaisser* (montant, nombre de factures émises) ; *Dont en retard* (montant, nombre, ancienneté de la plus ancienne en jours) ; *À facturer* (nombre de séances, montant estimé, « n sans tarif » s'il y en a, lien « Voir » vers la fiche 34). Bloc de données à part : son squelette et son erreur ne bloquent pas la liste.
2. **Barre de filtres** : champ « N° de facture ou patient… » (deux caractères au moins, temporisé) ; groupe segmenté *Toutes · Brouillons · À régler · En retard · Payées · Avoirs*, avec un compteur sur Brouillons, À régler et En retard ; à droite « Période » (liste « Depuis {mois} »). Pas de bouton « Exporter » en M15 : le contrat n'a pas de route d'export de la liste.
3. **Tableau** dans une carte, colonnes : Numéro · Patient (pastille d'initiales, nom) · Émise le · Objet (« 2 séances · 12 et 19 nov. ») · Échéance · Montant · Reste dû · Statut · actions. Lignes de 52 px.
   - Brouillon : « Brouillon » en `text-secondary` à la place du numéro, tirets pour les dates et le reste dû.
   - Payée : reste dû « 0,00 € » en `text-secondary`, mode du dernier paiement à côté du statut.
   - En retard : nombre de jours à côté du statut.
   - Avoir : montant négatif, objet « Avoir · annule F-… ».
   - Annulée : numéro barré, ligne en `text-secondary`, numéro de l'avoir à côté du statut.
   - « Reste dû » est en gras quand il est supérieur à zéro : c'est la seule valeur en gras de la ligne.
4. **Pied** : « n factures affichées », rappel des touches, « Précédent · Suivant » par pile de curseurs (comme la liste des patients ; ni numéros de page ni total).
5. **Sous 600 px** : cartes à la place du tableau (pastille, nom, numéro et date, montant ou « reste … », statut) ; bandeau réduit à deux chiffres (Encaissé, À encaisser avec « dont … en retard ») ; onglets Factures, À facturer, Paiements sur toute la largeur ; « Nouvelle facture » en barre du bas ; Réglages dans le menu du compte.

## Interactions
- Toute la ligne est un lien : vers `/facturation/brouillons/:id` pour un brouillon, vers `/facturation/:numero` sinon. `↑` `↓` choisissent, `Entrée` ouvre, `N` ouvre `/facturation/nouvelle`, `/` va au champ de filtre.
- Actions révélées au survol et au focus de la ligne : « Encaisser » (si reste dû supérieur à zéro : ouvre le panneau de paiement de la fiche 36), « Télécharger le PDF », puis le menu : Envoyer par e-mail, Dupliquer, Créer un avoir ; pour un brouillon, Supprimer (dialogue de confirmation partagé).
- Après un paiement, une suppression ou un avoir : la liste et le bandeau sont relus.
- « Exporter » la liste : hors M15 (aucune route au contrat, L5). Le journal des encaissements, lui, s'exporte (fiche 37).
- Trois états (`shared/ui/state`) : chargement (squelette de lignes) ; erreur avec « Réessayer », la liste déjà affichée restant visible sous un bandeau ; vide. **Vide à la première ouverture** : « Aucune facture pour l'instant », puis la liste de ce qui manque aux réglages (nom et adresse, SIRET, tarif d'une séance), chaque ligne menant à la fiche 39. « Nouvelle facture » reste actif. Vide sous filtre : « Aucune facture pour ce filtre » et « Tout afficher ».

## Tokens
- Carte : `surface-raised`, `border-subtle`, `radius-xl`, `shadow-2`. Survol de ligne : `primary-tint` à 45 %.
- Une seule action pleine par zone : « Nouvelle facture ». « Encaisser » est à contour.
- « En retard » en `warning`, jamais en `danger` : le rouge reste aux erreurs et aux actions destructrices. Aucun token nouveau.

## Accessibilité
- Vrai `<table>` avec en-têtes de colonnes ; le lien de ligne est le numéro (ou « Brouillon de {patient} ») et s'étend à la ligne ; l'anneau de focus entoure la ligne.
- Le statut est lu en clair avec son complément (« En retard, 4 jours ») ; l'icône est décorative.
- Les montants négatifs sont lus « moins 60 euros » (signe écrit, pas seulement la couleur).
- Le groupe segmenté est un groupe de boutons `aria-pressed` ; le compteur est lu avec le libellé.
- axe-core : 0 violation, thèmes clair et sombre.

## Version arabe
Règles de `docs/design/arabe.md` dès la première tâche (M16-24 est couverte par M15-15 à M15-20) : propriétés CSS logiques seulement ; montants, numéros de facture et d'avoir, dates en chiffres, SIRET, IBAN, adresses e-mail en `dir="ltr"` (chiffres latins, `--font-mono` gardé pour numéros et dates tout en chiffres) ; dates et montants par la locale de formatage de `core/i18n` (`data/money.ts`), jamais `LOCALE_ID` ; libellés dans `messages.fr.xlf`, `messages.en.xlf` et `messages.ar.xlf` (termes : `arabe-glossaire.md`) ; flèches et chevrons retournés, colonnes des tableaux dans le sens de lecture, montants alignés du côté de fin ; rendu de `/fr/` et `/en/` inchangé. Ici : le nom du patient en `dir="auto"` (dans la ligne, la puce de filtre et la carte du patient) ; le groupe segmenté et les touches ↑ ↓ suivent la section 6 de `arabe.md` ; le pied « Précédent · Suivant » retourne ses chevrons. La feuille de facture (aperçu et PDF) reste en français et de gauche à droite dans les trois langues (conteneur `lang="fr" dir="ltr"`, G Q70) ; seul l'habillage autour est traduit et retourné.

## Critères d'acceptation
- [ ] Le carreau « Facture » du rail ouvre `/facturation` ; l'onglet Factures est courant ; `N` ouvre l'éditeur.
- [ ] Le bandeau affiche les quatre chiffres de `GET /api/billing/summary`, sans calcul côté client ; son erreur n'empêche pas la liste de s'afficher.
- [ ] L'ordre des lignes est exactement celui de l'API ; un brouillon n'affiche aucun numéro.
- [ ] Chaque statut du tableau ci-dessus s'affiche avec son icône et son mot ; « En retard » n'emploie pas `danger`.
- [ ] Une facture annulée reste dans la liste, numéro barré, avec le numéro de son avoir.
- [ ] Filtrer sur « En retard » met `?statut=late` dans l'URL ; recharger la page garde le filtre.
- [ ] « Encaisser » n'apparaît que sur une ligne dont le reste dû est supérieur à zéro et ouvre le panneau de paiement ; après l'enregistrement, la ligne et le bandeau sont à jour sans rechargement manuel.
- [ ] Supprimer un brouillon demande confirmation ; « Supprimer » n'existe sur aucune facture émise.
- [ ] Compte sans facture : état vide avec la liste des réglages manquants.
- [ ] Sous 600 px : cartes, deux chiffres, « Nouvelle facture » en bas d'écran ; aucun défilement horizontal de la page.
- [ ] axe-core 0 violation.

## États dessinés (captures)
Chaque état que la première version de cette fiche spécifiait sans le dessiner l'a été par M15-13 (28 novembre 2026), dans `facturation/01-factures.html`, section « États spécifiés par la fiche ». Captures dans `facturation/captures/`, en clair et en sombre (suffixe `-dark`) :

- `01-factures-1.png` : la liste (sans « Exporter », aucune route au contrat).
- `01-factures-2.png` : mobile, sous 600 px.
- `01-factures-3.png` : menu de ligne ouvert sur une facture émise (Envoyer par e-mail, Dupliquer, Créer un avoir).
- `01-factures-4.png` : menu de ligne ouvert sur un brouillon (Dupliquer, Supprimer ; envoi et avoir absents : `409 INVOICE_NOT_ISSUED`, un avoir ne corrige qu'une facture émise).
- `01-factures-5.png` : dialogue de confirmation « Supprimer le brouillon ? » (`DELETE /api/invoices/{id}`, les séances reviennent dans « À facturer »).
- `01-factures-6.png` : vide sous filtre (« Aucune facture pour ce filtre », « Tout afficher »).
- `01-factures-7.png` : erreur du seul bandeau de chiffres, la liste reste affichée (libellé repris de l'erreur de la liste).

Non dessiné : l'export de la liste : aucune route au contrat (L5), hors M15.

Les libellés que la fiche ne donnait pas et que la maquette propose sont signalés dans la note de chaque cadre (« libellé proposé ») ; une tâche d'écran les reprend tels quels ou les corrige dans sa PR. **Maquettes complétées par M15-13 sans relecture de l'utilisateur.**

## Hors périmètre
Feuilles de soins, télétransmission, tiers payant ; paiement en ligne ; facturation d'un rendez-vous non honoré ; onglet Facturation dans le dossier patient ; devis ; factures récurrentes automatiques ; relances automatiques ; plusieurs devises ; statistiques au-delà du bandeau ; export vers un logiciel comptable autre qu'un fichier.
