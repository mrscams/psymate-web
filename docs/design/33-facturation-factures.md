# Écran 33 · Facturation · Factures (liste et cadre du module)

> **Périmètre tranché par l'utilisateur le 22 novembre 2026 : G Q67**, huit points, rappelés ci-dessous et dans `facturation/index.html` (« Décisions du 22 novembre 2026 »). Le contrat (`contract-v0.14.0`) n'a aucune route de facturation : les routes, champs et codes d'erreur écrits ici sont ce que l'écran attend ; le contrat, une fois écrit, l'emportera. Rien de cette fiche ne s'implémente avant lui. Plan de réalisation (jalon M15, contrat visé, tâches API et web) : `docs/L-plan-facturation.md` ; là où L5 et cette fiche diffèrent (L5.5), L5 l'emporte.

> Spécification pour agents. Maquette : `facturation/01-factures.html` ; captures : `facturation/captures/01-factures-1.png` (liste), `-2.png` (mobile), variantes `-dark`. Habillage : celui de l'application, par les tokens de `src/theme/tokens.css` (les maquettes sont dessinées avec les valeurs Fluent 2, G Q59, qui ne sont pas encore sur `main` : on en reprend les noms de tokens, jamais une valeur). La barre d'application, le rail et le panneau latéral sont les composants partagés tels qu'ils existent (fiche 00), pas ceux dessinés dans la maquette. Cette fiche porte aussi le cadre commun aux fiches 34 à 39.

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
- **En-tête de module** : bande `surface-raised` identique à l'en-tête patient. Titre « Facturation », bouton plein « Nouvelle facture » (touche `N`) à droite, puis une ligne d'onglets Fluent : **Factures** (`/facturation`), **À facturer** (`/facturation/a-facturer`, fiche 34, avec un compteur si supérieur à zéro), **Paiements** (`/facturation/paiements`, fiche 37) et, au bout de la ligne à droite, **Réglages** (`/facturation/reglages`, fiche 39). Sur Réglages, pas de bouton « Nouvelle facture ».
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
- Montants : `Intl.NumberFormat` de la locale, devise EUR, alignés à droite, chiffres tabulaires. Numéros et dates : police à chasse fixe. Dates en UTC en transit.

## Route & API attendue
- Route : `/facturation`. État dans l'URL : `?statut=draft | due | late | paid | credit` (absent = toutes), `?q=`, `?depuis=AAAA-MM`, `?patient=:id` (liste filtrée sur un patient : puce de filtre, carte du patient à la place du bandeau, colonne Patient masquée ; détail en fiche 38).
- `GET /api/billing/summary` → `{ collectedThisMonth, paymentCount, outstanding, outstandingCount, overdue, overdueCount, oldestOverdueDays, billableCount, billableAmount, billableWithoutRate }`.
- `GET /api/invoices?status=&q=&from=&patientId=&cursor=` → `{ items: [{ id, kind: invoice | credit_note, number?, status, overdue, overdueDays?, patient: { id, displayName }, issuedOn?, dueOn?, subject, total, balanceDue, paidWith?, creditNoteNumber?, cancelsNumber? }], nextCursor? }`. Ordre du serveur : brouillons d'abord, puis par date d'émission décroissante. **Le client ne retrie pas.**
- Actions de ligne : `DELETE /api/invoices/{id}` (brouillon seulement), `GET /api/invoices/{id}/pdf`, et les panneaux des fiches 35 et 36.

## Structure
1. **Bandeau de chiffres** (carte, quatre cellules séparées par un filet) : *Encaissé en {mois}* (montant, nombre de paiements) ; *À encaisser* (montant, nombre de factures émises) ; *Dont en retard* (montant, nombre, ancienneté de la plus ancienne en jours) ; *À facturer* (nombre de séances, montant estimé, « n sans tarif » s'il y en a, lien « Voir » vers la fiche 34). Bloc de données à part : son squelette et son erreur ne bloquent pas la liste.
2. **Barre de filtres** : champ « N° de facture ou patient… » (deux caractères au moins, temporisé) ; groupe segmenté *Toutes · Brouillons · À régler · En retard · Payées · Avoirs*, avec un compteur sur Brouillons, À régler et En retard ; à droite « Période » (liste « Depuis {mois} ») et bouton à contour « Exporter ».
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
- « Exporter » : fichier produit par l'API pour les filtres courants (même mécanisme que la fiche 19).
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

## Spécifié ici, pas dessiné dans la maquette
Le menu de ligne ouvert ; le dialogue de suppression d'un brouillon ; l'état vide sous filtre ; l'export de la liste ; l'erreur propre au bandeau de chiffres. À dessiner avant de développer ces parties.

## Hors périmètre
Feuilles de soins, télétransmission, tiers payant ; paiement en ligne ; facturation d'un rendez-vous non honoré ; onglet Facturation dans le dossier patient ; devis ; factures récurrentes automatiques ; relances automatiques ; plusieurs devises ; statistiques au-delà du bandeau ; export vers un logiciel comptable autre qu'un fichier.
