# Écran 37 · Facturation · Paiements (journal des encaissements)

> **Périmètre tranché le 22 novembre 2026 (G Q67, rappelée en fiche 33).** Même réserve que la fiche 33 : aucune route au contrat ; les routes et champs ci-dessous sont ce que l'écran attend. Cadre du module, statuts et règles communes : fiche 33.

> Spécification pour agents. Maquette : `facturation/05-paiements.html` ; captures : `facturation/captures/05-paiements-1.png` (journal), `-2.png` (export), variantes `-dark`. Habillage : celui de l'application, par les tokens de `src/theme/tokens.css` (les maquettes sont dessinées avec les valeurs Fluent 2, G Q59, qui ne sont pas encore sur `main` : on en reprend les noms de tokens, jamais une valeur).

## Objectif
Donner au praticien la liste de ce qu'il a réellement encaissé, dans l'ordre des dates : ce qu'il rapproche de son relevé bancaire et ce qu'il transmet à son comptable. Le journal se lit ; il ne se retouche pas.

## Route & API attendue
- Route : `/facturation/paiements`, troisième onglet du module. État dans l'URL : `?periode=AAAA-MM | AAAA-Tn | AAAA` (absent = mois courant), `?mode=transfer | cheque | cash | card | other` (absent = tous).
- `GET /api/payments?from=&to=&mode=&cursor=` → `{ items: [{ id, receivedOn, patient: { id, displayName }, document: { number, kind: invoice | credit_note }, partial, refund, mode, reference?, amount, cancelledAt? }], nextCursor?, totals: { amount, paymentCount, refundCount, byMode: [{ mode, amount }] } }`. Ordre : date de réception décroissante. **Les totaux portent sur toute la période, pas sur la page affichée ; le client n'additionne rien.**
- `POST /api/payments/export` `{ from, to, format: csv | pdf, identity: document_number | full_name }` → fichier produit par l'API (même mécanisme que la fiche 19).
- `GET /api/payments/{id}/receipt` ; `POST /api/payments/{id}/cancel`.
- Un paiement ne se crée pas ici : il s'enregistre depuis une facture (fiche 36).

## Structure
1. **Barre d'outils** : groupe *période* (précédent, libellé « Novembre 2026 », suivant) ; groupe *étendue* (Mois · Trimestre · Année) ; groupe *mode* (Tous · Virement · Chèque · Espèces · Carte ; « Autre » s'il existe au moins un paiement de ce mode sur la période) ; à droite bouton à contour « Exporter le journal ».
2. **Résumé** (carte en deux parties) : à gauche *Encaissé en {période}* (montant, « n paiements », « n remboursement(s) déduit(s) » s'il y en a) ; à droite une ligne par mode : icône et nom, barre horizontale proportionnelle au mode le plus élevé, montant. Les barres sont toutes en `primary` : la longueur porte la comparaison, le nom et le montant sont écrits.
3. **Tableau** (carte), colonnes : Reçu le · Patient · Facture (numéro en lien ; « · partiel » ou « · remboursement » en secondaire) · Mode (icône et nom) · Référence · Montant · actions. Un remboursement est une ligne au montant négatif, rattachée à son avoir. Un paiement annulé reste affiché, barré, et ne compte pas dans les totaux. Pied de tableau : « Total de la période » et le montant de `totals.amount`.
4. **Pied** : « n paiements affichés sur m », « Précédent · Suivant ».
5. **Dialogue « Exporter le journal »** : *Du* et *Au* (préremplis avec la période affichée) ; *Format* (Tableur (CSV), PDF) ; *Identité des patients*, deux cartes à choix unique : **Numéro de facture seulement** (présélectionné ; « Aucun nom dans le fichier. Le numéro renvoie à la facture, que vous conservez. ») et **Nom complet** (« À réserver à un destinataire tenu au secret. ») ; pied : « Annuler », « Exporter ».
6. **Sous 600 px** : total en tête, cartes d'une ligne (date, patient, mode, montant), filtres de mode dans une liste, export dans le menu.

## Interactions
- Changer de période, d'étendue ou de mode met à jour l'URL et relit la liste et les totaux.
- Le numéro de facture ouvre `/facturation/:numero`.
- Actions de ligne (survol et focus) : Télécharger le reçu ; menu : Ouvrir la facture, Annuler le paiement (dialogue de confirmation partagé ; puis relecture). Pas de modification d'un montant : on annule et on ressaisit depuis la facture.
- Export : le dialogue se ferme au lancement ; le fichier est téléchargé quand l'API le rend ; échec → toast d'erreur avec « Réessayer ». Colonnes du fichier : date, numéro de facture ou d'avoir, mode, référence, montant ; le nom seulement si « Nom complet » est choisi.
- Trois états : chargement ; erreur avec « Réessayer » ; vide (« Aucun paiement sur cette période » ; sous filtre de mode : « Aucun paiement par chèque sur cette période » et « Tous les modes »).

## Tokens
- Barres de répartition : `primary` sur `surface-sunken`, `radius-pill`, 8 px de haut. Pas de couleur par mode.
- Montants négatifs : texte neutre, signe écrit ; pas de rouge.
- Pied de tableau : filet `border-strong` au-dessus, Body 1 Strong.
- Carte de choix sélectionnée (export) : `primary-tint`, bord `primary`.

## Accessibilité
- Vrai `<table>` avec `<tfoot>` ; le total est annoncé avec son libellé.
- La répartition par mode est une liste : chaque ligne lit « Virement, 1 080 euros » ; la barre est décorative (`aria-hidden`).
- Le groupe de période annonce le libellé courant (`aria-live="polite"`) quand on passe au mois précédent ou suivant ; les deux flèches sont nommées (« Mois précédent », « Mois suivant »).
- Un paiement annulé est lu « annulé », pas seulement barré.
- Dialogue d'export : modal, focus initial sur *Du*, Échap ferme ; les deux cartes d'identité forment un groupe de boutons radio dont la description est lue.
- axe-core : 0 violation, thèmes clair et sombre.

## Critères d'acceptation
- [ ] Le total et la répartition par mode sont ceux de `totals`, y compris quand la liste a plusieurs pages.
- [ ] Un paiement enregistré depuis une facture apparaît en tête du journal de son mois, avec le numéro de la facture en lien.
- [ ] Un paiement partiel porte « partiel » ; un remboursement est négatif et rattaché à son avoir.
- [ ] Filtrer sur « Chèque » met `?mode=cheque` dans l'URL et ne montre que les chèques ; le total est celui du filtre.
- [ ] Passer à « Trimestre » puis « Année » relit la liste et les totaux pour l'étendue choisie.
- [ ] Annuler un paiement : il reste visible, barré, le total baisse, la facture retrouve son reste dû.
- [ ] L'export par défaut ne contient aucun nom de patient ; avec « Nom complet », la colonne du nom est présente.
- [ ] Aucun bouton ne crée un paiement sur cet écran.
- [ ] axe-core 0 violation.

## Spécifié ici, pas dessiné dans la maquette
Une ligne de paiement annulé ; les étendues *Trimestre* et *Année* ; le mode « Autre » ; les états vides ; la version sous 600 px (décrite en une phrase dans la maquette). À dessiner avant de développer ces parties.

## Hors périmètre
Rapprochement bancaire, import de relevé ; livre des dépenses ; déclaration fiscale ou sociale ; remise de chèques en banque ; ventilation par prestation ; comparaison d'une période à l'autre.
