# Écran 30 · Profil 360 (onglet du dossier patient et panneau « Ajouter au profil »)

> **Ajouté le 18 novembre 2026.** API livrée par le jalon M13 de psymate-api (contrat `contract-v0.14.0`, module `patients`). Décisions : G Q52 à Q57 de ce dépôt ; côté API, G Q62 à Q70 de psymate-api (`docs/J-plan-profil-360-api.md` là-bas). Plan web : `docs/J-plan-profil-360-web.md`.

> Spécification pour agents. Maquette : `30-profil-360.html` (statique : les quatre rubriques et le panneau se lisent sans script ; avec script, une rubrique à la fois et panneau cliquable). Palette : Nordique. La maquette fixe le contenu de l'onglet et du panneau ; la barre d'application, le rail et l'en-tête patient sont les composants partagés tels qu'ils existent (fiche 00), pas ceux dessinés dans la maquette.

## Objectif
Donner au praticien, en un coup d'œil, ce qui décrit la personne elle-même, indépendamment des séances : son histoire et ses souvenirs, sa famille et son entourage, sa santé et ses antécédents, ses valeurs et ses projets. Lui permettre d'y ajouter une information, de la corriger et de la retirer, sans passer par une séance. L'outil range ce que le praticien écrit : il n'interprète rien, ne déduit rien, ne résume rien.

## Route & module
- Route : `/patients/:id/profile`, quatrième onglet du dossier (« Profil 360 », touche `4`), feature Angular `profile360`, chargée à la demande.
- Rubrique affichée dans l'URL : `?rubrique=history | family | health | values_goals` (absente = `history`). Un rechargement ou un lien partagé garde la rubrique.
- Ouverture du panneau en création dans l'URL : `?ajouter=1` (même principe que `/agenda?nouveau=…`). Le paramètre est retiré à la fermeture du panneau.
- API (contrat `0.14.0`) :
  - `GET /api/patients/{id}/profile-items` → `{ patientId, items: [{ id, category, title, detail?, periodLabel?, periodYear?, createdAt, updatedAt }] }`. Tout le profil en un appel, déjà trié par le serveur (rubrique, puis année et création dans `history`, création ailleurs). **Le client ne retrie pas.**
  - `POST /api/patients/{id}/profile-items` `{ category, title, detail?, periodLabel?, periodYear? }` → `201`.
  - `PATCH /api/patients/{id}/profile-items/{itemId}` (fusion partielle ; `null` efface `detail`, `periodLabel`, `periodYear`).
  - `DELETE /api/patients/{id}/profile-items/{itemId}` → `204` (archivage logique, idempotent).
- Aucune autre API : ni séance, ni entrée, ni lien, ni recherche. Le bloc de saisie (« Noter quelque chose… ») n'apparaît pas sur cet onglet, comme sur Vue d'ensemble, Timeline et Graphe.

## Structure
**Bouton « Ajouter au profil »** : au bout de la ligne des onglets de l'en-tête patient, à droite (emplacement existant de fin de ligne, celui que la Vue d'ensemble utilise pour son sélecteur de fenêtre). Contour, pas cobalt plein, icône « plus ». Visible sur cet onglet seulement, absent si le patient est archivé. C'est l'entrée principale de l'écran : il ouvre le panneau en création.

Contenu en pleine largeur (`contentWidth: 'full'`), deux colonnes :

1. **Menu des rubriques** (colonne gauche, 272 px, carte) : titre « Rubriques », puis quatre boutons dans cet ordre : Histoire et souvenirs, Famille et entourage, Santé et antécédents, Valeurs et projets. Chaque bouton : icône de la rubrique (horloge, personnes, cœur, boussole), libellé, nombre d'informations. La rubrique affichée est marquée (`aria-current="true"`, fond `--primary-tint`).
2. **Rubrique affichée** (colonne droite, carte) :
   - En-tête : icône, nom de la rubrique, phrase d'aide et nombre d'informations (« Les personnes qui comptent · 6 informations »). Pas de bouton dans cet en-tête.
   - **Histoire et souvenirs** : fil chronologique vertical. À gauche la période (`periodLabel`, alignée à droite, 96 px ; vide si absente), un point sur le fil, puis le titre et, dessous, le détail. Périodes, tournants et souvenirs partagent le même gabarit : rien ne les distingue.
   - **Famille et entourage** : une ligne par information, avec une pastille ronde portant la première lettre du titre, puis le titre et, dessous, le détail.
   - **Santé et antécédents**, **Valeurs et projets** : une ligne par information, le titre et, dessous, le détail.
   - Partout : **titre et détail seulement** (G Q53). Pas de colonne d'étiquette, pas de pictogramme par information, pas de provenance, pas de date de saisie.
3. **Panneau « Ajouter au profil » / « Modifier l'information »** (panneau latéral partagé, 480 px, `role="dialog"`) :
   - **Rubrique** : liste des quatre rubriques, préremplie avec la rubrique affichée.
   - **Information** (`title`, obligatoire, 200 caractères au plus), champ d'une ligne.
   - **Précision** (`detail`, facultatif, 2 000 caractères au plus), zone de texte.
   - Seulement si la rubrique est Histoire et souvenirs : **Période** (`periodLabel`, facultatif, 60 caractères au plus, exemple en aide : « Enfance, vers 2000, 2002 – 2009 ») et **Année** (`periodYear`, facultatif, entier de 1900 à 2100, aide : « Sert à classer dans le fil. Laissez vide si vous ne savez pas. »).
   - Pied : bouton principal cobalt « Ajouter » (ou « Enregistrer » en modification), « Annuler ». En modification, à gauche du pied : « Retirer du profil ».

Sous 820 px de large, le menu passe au-dessus du contenu, en une rangée défilante.

## Interactions
- Cliquer une rubrique du menu l'affiche et met à jour `?rubrique=`.
- « Ajouter au profil » (ligne des onglets) ouvre le panneau en création, avec la rubrique affichée préremplie. Cliquer une information ouvre le panneau en modification, champs préremplis.
- Dans le panneau, quitter la rubrique Histoire et souvenirs masque Période et Année et les vide ; y revenir les réaffiche vides.
- Après un ajout, une modification ou un retrait réussi : le panneau se ferme, **le profil est relu** (`GET`), la rubrique concernée est affichée, un toast confirme (« Information ajoutée », « Information modifiée », « Information retirée »), le focus revient sur l'élément qui a ouvert le panneau.
- « Retirer du profil » demande confirmation (dialogue partagé) : « Retirer cette information du profil ? Elle ne sera plus affichée. » Pas d'annulation après coup dans cette version.
- Erreurs : `422` par champ → message sous le champ (`shared/forms`) ; `422 PROFILE_ITEM_LIMIT_REACHED` → message dans le panneau ; `409 PROFILE_ITEM_ARCHIVED` ou `404 PROFILE_ITEM_NOT_FOUND` (information retirée entre-temps) → toast et relecture du profil ; `409 PATIENT_ARCHIVED` → toast et passage en lecture seule.
- **Patient archivé** : onglet en lecture seule. Ni « Ajouter au profil », ni ouverture du panneau au clic sur une information.
- Trois états pour le bloc de données (`shared/ui/state`) : chargement ; erreur avec « Réessayer » ; vide. Profil entièrement vide : « Aucune information dans le profil » et le bouton « Ajouter au profil ». Rubrique vide dans un profil non vide : « Rien dans cette rubrique pour l'instant ».

## Tokens
- Carte : fond `--surface-raised`, bordure `--border-subtle`, rayon 12 px.
- Rubrique affichée dans le menu : fond `--primary-tint`, texte et icône `--primary-hover`.
- Icônes et pastilles au repos : fond `--surface-ground`, trait `--text-secondary`.
- Fil chronologique : trait `--border-subtle`, point à fond `--surface-raised` et bordure `--primary`.
- Détail et période : `--text-secondary`. Séparateur de lignes : `--surface-sunken`.
- Un seul élément cobalt plein par zone : le bouton principal du pied du panneau. Jamais de rouge sur un patient, y compris pour « Retirer du profil » (bouton texte neutre).

## Accessibilité
- Le menu est un `<nav aria-label="Rubriques du profil">` ; la rubrique affichée porte `aria-current="true"`. Les compteurs sont lus avec le libellé (« Famille et entourage, 6 informations »).
- Le fil chronologique est une liste (`<ol>`) ; la période est lue avant le titre. Le point et le trait sont décoratifs (`aria-hidden`).
- Chaque information est un bouton (ou contient un bouton) nommé par son titre, activable au clavier ; en lecture seule, c'est un simple élément de liste.
- Panneau : dialogue modal, focus initial sur « Information », Échap ferme, le focus revient au déclencheur. Les champs Période et Année apparaissent et disparaissent sans déplacer le focus.
- La zone de contenu annonce le changement de rubrique (`aria-live="polite"` sur le titre de la rubrique).
- axe-core : 0 violation, thèmes clair et sombre.

## Critères d'acceptation
- [ ] Sur un patient du seed qui a un profil, l'onglet affiche les quatre rubriques avec, pour chacune, le nombre d'informations renvoyé par l'API ; la touche `4` ouvre l'onglet.
- [ ] Dans Histoire et souvenirs, l'ordre affiché est exactement celui de l'API (une information sans année arrive après les datées) ; la période est à gauche, le titre et le détail à droite.
- [ ] Dans Famille, Santé et Valeurs, chaque information montre son titre et son détail, sans étiquette à gauche ; Famille montre la pastille avec la première lettre du titre.
- [ ] Recharger la page sur `?rubrique=family` affiche Famille et entourage.
- [ ] « Ajouter au profil » est au bout de la ligne des onglets, sur l'onglet Profil 360 seulement ; il ouvre le panneau avec la rubrique affichée préremplie ; ouvrir `/patients/:id/profile?ajouter=1` ouvre le panneau directement.
- [ ] Ajouter une information dans Santé et antécédents : après fermeture du panneau, elle apparaît, le compteur de la rubrique augmente de un, le toast « Information ajoutée » s'affiche.
- [ ] Période et Année ne sont visibles que pour Histoire et souvenirs ; une information créée dans une autre rubrique part sans `periodLabel` ni `periodYear`.
- [ ] Modifier le titre d'une information : le nouveau titre remplace l'ancien, aucune ligne en double.
- [ ] Retirer une information : après confirmation elle disparaît et le compteur baisse de un ; annuler la confirmation ne change rien.
- [ ] Titre vide : le bouton principal ne soumet pas et le champ porte son message ; une erreur `422` du serveur sur un champ s'affiche sous ce champ.
- [ ] Patient archivé : aucun bouton « Ajouter au profil », un clic sur une information n'ouvre rien.
- [ ] Patient sans aucune information : état vide et bouton « Ajouter au profil ».
- [ ] Le bloc de saisie n'apparaît pas sur l'onglet ; ouvrir l'onglet ne crée ni séance ni entrée.
- [ ] Échap ferme le panneau et rend le focus au déclencheur ; axe-core 0 violation.

## Hors périmètre
Annuler un retrait et voir les informations retirées ; trame guidée de premier entretien ; reprise d'une phrase de note vers le profil ; recherche dans le profil ; export du profil ; synthèse ou formulation ; déclinaison mobile.
