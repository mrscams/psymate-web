# Écran 37 · Facturation · Paiements (journal des encaissements)

> **Périmètre tranché le 22 novembre 2026 (G Q67, rappelée en fiche 33).** Contrat visé : L5 de `docs/L-plan-facturation.md` (`contract-v0.17.0`, posé par M15-12) ; la section « Route & API » le suit depuis M15-13. Le contrat fusionné (`docs/api-reference.md`, tiré par M15-14) l'emporte : l'écran note tout écart dans sa PR et corrige la fiche. Cadre du module, statuts et règles communes : fiche 33.

> Spécification pour agents. Maquette : `facturation/05-paiements.html` ; captures : `facturation/captures/05-paiements-1.png` à `-10.png`, variantes `-dark` (liste en fin de fiche). Habillage : celui de l'application, par les tokens de `src/theme/tokens.css` (depuis M15-13, les maquettes en reprennent les valeurs ; un écran emploie les noms de tokens, jamais une valeur écrite en dur).

## Objectif
Donner au praticien la liste de ce qu'il a réellement encaissé, dans l'ordre des dates : ce qu'il rapproche de son relevé bancaire et ce qu'il transmet à son comptable. Le journal se lit ; il ne se retouche pas.

## Route & API
- Route : `/facturation/paiements`, troisième onglet du module. État dans l'URL : `?periode=AAAA-MM | AAAA-Tn | AAAA` (absent = mois courant), `?mode=transfer | cheque | cash | card | other` (absent = tous). La période devient `from` et `to` (premier et dernier jour).
- `GET /api/payments?from=&to=&mode=&cursor=` → `{ items: [Payment + { patient: { id, displayName }, partial }], nextCursor?, totals: { amount, paymentCount, refundCount, byMode: [{ mode, amount }] } }`, avec `Payment = { id, invoiceId, invoiceNumber, kind: payment | refund, mode, amount, receivedOn, reference?, note?, cancelledAt? }`. Montants en centimes. Ordre : date de réception décroissante. **Les totaux portent sur toute la période (remboursements déduits, paiements annulés exclus), pas sur la page affichée ; le client n'additionne rien.**
- `GET /api/payments/export?from=&to=&format=csv | pdf&identity=document_number | full_name` → le fichier, en téléchargement direct (même approche d'enregistrement que `features/patients/ui/save-file.ts`, sans import). Un an au plus par export. Colonnes : date, numéro, mode, référence, montant ; le nom seulement avec `full_name`.
- `GET /api/payments/{id}/receipt` (PDF du reçu) ; `POST /api/payments/{id}/cancel` (`200`, idempotent).
- Un paiement ne se crée pas ici : il s'enregistre depuis une facture (fiche 36).
- **Écarts avec la première version de cette fiche** (L5.5) : montants en centimes ; **export du journal en téléchargement direct** (`GET`, pas de `POST` ni de travail d'export comme la fiche 19), un an au plus ; `document: { number, kind }` devient `invoiceNumber` (un remboursement porte le numéro de son avoir) ; le booléen `refund` devient `kind: refund`. Relevé en dessinant les états (à vérifier sur le contrat fusionné par M15-20) : L5 ne sert aucun nombre de lignes, le pied dit donc « n paiements affichés » sans « sur m » ; sous un filtre de mode, `totals.byMode` est filtré aussi, et le client ne sait plus s'il existe un paiement « Autre » sur la période : le bouton « Autre » se décide sur la lecture sans filtre de mode.

## Structure
1. **Barre d'outils** : groupe *période* (précédent, libellé « Novembre 2026 », suivant) ; groupe *étendue* (Mois · Trimestre · Année) ; groupe *mode* (Tous · Virement · Chèque · Espèces · Carte ; « Autre » s'il existe au moins un paiement de ce mode sur la période) ; à droite bouton à contour « Exporter le journal ».
2. **Résumé** (carte en deux parties) : à gauche *Encaissé en {période}* (montant, « n paiements », « n remboursement(s) déduit(s) » s'il y en a) ; à droite une ligne par mode : icône et nom, barre horizontale proportionnelle au mode le plus élevé, montant. Les barres sont toutes en `primary` : la longueur porte la comparaison, le nom et le montant sont écrits.
3. **Tableau** (carte), colonnes : Reçu le · Patient · Facture (numéro en lien ; « · partiel » ou « · remboursement » en secondaire) · Mode (icône et nom) · Référence · Montant · actions. Un remboursement est une ligne au montant négatif, rattachée à son avoir. Un paiement annulé reste affiché, barré, et ne compte pas dans les totaux. Pied de tableau : « Total de la période » et le montant de `totals.amount`.
4. **Pied** : « n paiements affichés » (L5 ne donne pas le total de lignes), « Précédent · Suivant ».
5. **Dialogue « Exporter le journal »** : *Du* et *Au* (préremplis avec la période affichée) ; *Format* (Tableur (CSV), PDF) ; *Identité des patients*, deux cartes à choix unique : **Numéro de facture seulement** (présélectionné ; « Aucun nom dans le fichier. Le numéro renvoie à la facture, que vous conservez. ») et **Nom complet** (« À réserver à un destinataire tenu au secret. ») ; pied : « Annuler », « Exporter ».
6. **Sous 600 px** : total en tête, cartes d'une ligne (date, patient, mode, montant), filtres de mode dans une liste, export dans le menu.

## Interactions
- Changer de période, d'étendue ou de mode met à jour l'URL et relit la liste et les totaux.
- Le numéro de facture ouvre `/facturation/:numero`.
- Actions de ligne (survol et focus) : Télécharger le reçu ; menu : Ouvrir la facture, Annuler le paiement (dialogue de confirmation partagé ; puis relecture). Pas de modification d'un montant : on annule et on ressaisit depuis la facture.
- Export : le dialogue se ferme au lancement ; le fichier est téléchargé quand l'API le rend ; échec → toast d'erreur avec « Réessayer ». Une période de plus d'un an est refusée dans le dialogue, sous *Au* (L5 : un an au plus par export). Colonnes du fichier : date, numéro de facture ou d'avoir, mode, référence, montant ; le nom seulement si « Nom complet » est choisi.
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

## Version arabe
Règles de `docs/design/arabe.md` dès la première tâche (M16-24 est couverte par M15-15 à M15-20) : propriétés CSS logiques seulement ; montants, numéros de facture et d'avoir, dates en chiffres, SIRET, IBAN, adresses e-mail en `dir="ltr"` (chiffres latins, `--font-mono` gardé pour numéros et dates tout en chiffres) ; dates et montants par la locale de formatage de `core/i18n` (`data/money.ts`), jamais `LOCALE_ID` ; libellés dans `messages.fr.xlf`, `messages.en.xlf` et `messages.ar.xlf` (termes : `arabe-glossaire.md`) ; flèches et chevrons retournés, colonnes des tableaux dans le sens de lecture, montants alignés du côté de fin ; rendu de `/fr/` et `/en/` inchangé. Ici : le nom du patient et la référence d'un paiement en `dir="auto"` ; le libellé de période (« Novembre 2026 », « 4ᵉ trimestre 2026 ») par la locale de formatage ; les flèches *Mois précédent* et *Mois suivant* se retournent ; les barres de répartition partent du côté de début (elles ne sont pas un graphique temporel). Le fichier exporté (CSV, PDF) reste en français.

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

## États dessinés (captures)
Chaque état que la première version de cette fiche spécifiait sans le dessiner l'a été par M15-13 (28 novembre 2026), dans `facturation/05-paiements.html`, section « États spécifiés par la fiche ». Captures dans `facturation/captures/`, en clair et en sombre (suffixe `-dark`) :

- `05-paiements-1.png` : le journal.
- `05-paiements-2.png` : dialogue « Exporter le journal ».
- `05-paiements-3.png` : paiement annulé : barré, « annulé » écrit, hors des totaux.
- `05-paiements-4.png` : étendue *Trimestre* (« 4ᵉ trimestre 2026 », `?periode=2026-T4`).
- `05-paiements-5.png` : étendue *Année* avec le mode « Autre ».
- `05-paiements-6.png` : filtre sur le mode « Autre ».
- `05-paiements-7.png` : vide sur la période.
- `05-paiements-8.png` : vide sous filtre de mode (« Aucun paiement par chèque sur cette période », « Tous les modes »).
- `05-paiements-9.png` : sous 600 px.
- `05-paiements-10.png` : sous 600 px, menu ouvert sur « Exporter le journal ».

Non dessiné : rien. L'icône du mode « Autre » reste à choisir (aucune dans les maquettes).

Les libellés que la fiche ne donnait pas et que la maquette propose sont signalés dans la note de chaque cadre (« libellé proposé ») ; une tâche d'écran les reprend tels quels ou les corrige dans sa PR. **Maquettes complétées par M15-13 sans relecture de l'utilisateur.**

## Hors périmètre
Rapprochement bancaire, import de relevé ; livre des dépenses ; déclaration fiscale ou sociale ; remise de chèques en banque ; ventilation par prestation ; comparaison d'une période à l'autre.
