# Écran 4 · Graphe patient (carte mentale centrée sur une entrée)

> Spécification pour agents. Maquette : `04-graphe-patient.html` / `.png`. Palette : Nordique. Document B, écran 4 ; Document A, module `linking` (table `link`, CTE récursive profondeur ≤ 3, UC-7/UC-8).
>
> **Rendu révisé le 21 novembre 2026** (G Q58) : lecture dirigée de gauche à droite, cartes et traits, à la place de la disposition en étoile de Cytoscape. La maquette `.html` / `.png` montre l'ancien rendu : elle ne vaut plus que pour la structure de l'écran (barre d'outils, panneau, légende). Maquette de travail du nouveau rendu : `propositions-2026-11/05-graphe-elk.html`. Les documents A, B4 et l'étude couleurs citent encore Cytoscape : écart listé en G5.

## Objectif
Voir **ce qui est relié à quoi** autour d'une entrée (souvent une situation) : les ressentis déclenchés, les événements déclencheurs, les médicaments qui traitent, et créer/retirer des liens directement.

## Route & module
- Route : `/patients/:id/graph?root=<entryId>&depth=2`.
- API : `GET /api/patients/{id}/graph?root=&depth=1..3&types=&linkTypes=&from=&to=` → `{nodes[], edges[], truncated, superNodes[]}` (module `linking`, CTE récursive sur `link`, limite 150 nœuds puis regroupement en **super-nœuds**).
- `POST /api/links`, `PATCH /api/links/{id}` (statut), `DELETE` = statut `superseded` (jamais de suppression physique).
- Rendu : les cartes sont du HTML, les liens du SVG, dessinés par `pm-graph-canvas` ; **elkjs** (0.12.1, licence EPL-2.0, chargé à la demande avec l'onglet) calcule seulement la disposition : en couches, de gauche à droite, tracés à angles droits.
- Fichiers de `features/graph/ui` : `graph-layout.ts` (le seul qui parle à elkjs : sens de lecture par type de lien, blocs d'entrées sœurs, fil d'une entrée), `graph-paths.ts` (géométrie des traits), `graph-scene.ts` (ce que le gabarit dessine), `graph-canvas.component.*` (vue, zoom, sélection, glisser), `graph-glyph.component.ts` (forme par type).
- Store `GraphStore` : `query` (racine, profondeur, filtres), `graph`, `selectedId`, `viewports` (zoom et position par racine). Aucune position de nœud n'est mémorisée : la disposition est recalculée.

## Structure de l'écran
1. **Barre d'application + en-tête patient** (partagés), onglet 3 actif.
2. **Barre d'outils du graphe** : « Centré sur » (sélecteur d'entrée avec icône de type), **Profondeur** 1/2/3 (segmenté, défaut 2), **Lecture** (segmenté : Chaîne causale, Colonnes par type, Chronologie ; défaut Chaîne causale), **Sens** (segmenté : Gauche → droite, Haut → bas ; défaut Gauche → droite), case **« Nom des liens »** (cochée par défaut), filtres *Types d'entrées*, *Liens*, *Période* ; compteur `N nœuds · M liens` ; **Recentrer** ; bouton **« Lier »** (raccourci `L`).
3. **Zone graphe** (fond blanc, bordure subtile) :
   - **Sens de lecture**, de gauche à droite : ce qui déclenche ou précède, puis ce qui en découle, puis ce qui y répond. Par type de lien : `triggers`, `worsens`, `part_of` placent la source avant la cible ; `caused_by`, `follows` placent la cible avant la source (la cause, l'antécédent d'abord) ; `treats`, `relieves` placent le traitement après ce qu'il traite ; `co_occurs` n'a pas de sens et ne pèse pas sur la disposition, sauf pour une entrée sans aucun lien orienté, placée à côté de celle qu'elle accompagne. **La flèche garde toujours le sens du lien**, pas celui de la lecture.
   - **Lectures** : _Chaîne causale_ (défaut) : les liens seuls placent les cartes, comme décrit ci-dessus. _Colonnes par type_ : une colonne titrée par nature d'entrée, toujours dans l'ordre Événements, Situations, Ressentis et notes, Réponses (traitements, séances). _Chronologie_ : une colonne titrée par mois (heure locale, comme la date affichée), les entrées sans date dans une dernière colonne « Sans date », un super-nœud dans la colonne de son voisin. Dans une colonne, les liens ordonnent encore les cartes ; un bloc d'entrées sœurs ne réunit que des entrées de la même colonne.
   - **Sens** : de gauche à droite (défaut) ou de haut en bas ; de haut en bas, les colonnes deviennent des rangées, titrées à gauche. Lecture et sens vivent dans l'URL (`reading=causal|type|time`, `direction=right|down`, omis à leur valeur par défaut) et redisposent le graphe reçu sans nouvelle requête.
   - **Une carte par entrée** : la forme de son type, son titre (deux lignes au plus), puis « type · date ». Carte racine : bordure 2 px `--primary`, teinte `--primary-tint`, légèrement plus grande.
   - **Formes par type**, dans la carte : ressenti = **cercle** (diamètre ∝ intensité, teinte lavande, chiffre d'intensité à l'intérieur), événement = **losange** cobalt, situation = **barre** `#2F4F73`, séance = **carré arrondi** `#3E8E7E`, médicament = **capsule** ocre `#B07A2A`, note = **rectangle** gris `#7F8EA8`.
   - **Bloc d'entrées sœurs** : à partir de 6 entrées qui n'ont qu'un lien, du même type, vers la même entrée et du même côté, elles sont rangées en grille (par date) dans un cadre, reliées par un seul trait nommé « aggrave · 12 ». Sans cela, 500 entrées autour d'une seule formaient une colonne de 40 000 px calculée en 14 s.
   - **Styles de liens** : ceux du catalogue (`lineStyle` de `GET /api/vocabulary/link-types`) : plein, tirets longs, tirets courts, pointillé sans flèche (lien symétrique), fin, double. Case « Nom des liens » cochée : le nom du lien est posé sur son trait ; décochée (`names=off` dans l'URL) : seulement sur le fil de l'entrée sélectionnée. Au-delà de 60 nœuds, les noms sont masqués d'office et la case est inactive. Lien **proposé** (V2) = gris clair `#B9C2D1` + étiquette « suggéré ».
   - **Super-nœud** : carte en pointillés « 12 ressentis regroupés · anxiété majoritaire » → double-clic, ou « Déplier » dans le panneau = développe (ajoute les entrées).
   - Zoom +/− en bas à gauche, molette ; glisser le fond déplace la vue ; double-clic sur une carte = la timeline sur l'entrée (B2).
   - **Légende** en bas à droite (formes + styles de lien), repliable.
4. **Panneau latéral (détail)** s'ouvre à la sélection d'un nœud : type, titre, *Quand* (date + précision), *Séance*, émotion/famille, tags, texte, **Liens (N)** avec phrase lisible (« *Entretien d'évaluation* déclenche ce ressenti ») + « Modifier » ; liens dérivés marqués *dérivé* ; actions : *Voir dans la timeline*, *Recentrer le graphe ici*, *Modifier l'entrée · version n*.
5. **Pied du panneau** : aide : « Glisser un nœud vers un autre crée un lien · Suppr retire le lien sélectionné (confirmation) ».

## Interactions
- **Sélection d'une carte** : son fil s'allume (tout ce qui mène à elle, tout ce qui en part, ses co-occurrences), le reste s'efface ; le panneau de détail s'ouvre.
- **Créer un lien** : glisser-déposer carte A → carte B (la carte glissée revient à sa place), ou `L` puis deux clics → ouvre l'**éditeur de lien** (écran 5) : type, sens, justification (`rationale`), provenance `manual`.
- Sélection d'une arête → panneau : type, provenance, confiance (si `ai_*`), *Accepter / Rejeter* si `proposed`, *Retirer* sinon.
- Changement de profondeur ou de filtres = nouvelle requête (pas de filtrage client au-delà de 150 nœuds).
- La disposition est **déterministe** : mêmes données, même carte. Elle est recalculée à chaque changement (racine, profondeur, filtres, lien ajouté, groupe déplié) et les cartes glissent vers leur nouvelle place ; l'ordre des entrées reçues est respecté pour que la carte bouge peu. Le zoom et la position de la vue sont gardés par `root` dans la session ; « Recentrer » ajuste le graphe à la zone.
- Rejeter un lien le conserve (`status = rejected`), masqué par défaut, filtre « Liens : rejetés » pour le revoir.

## Tokens
- Fond graphe `#FFFFFF`, grille/axes `#E4E8F0`, trait de lien `--link #8A94A6`, proposé `#B9C2D1`, sélection `--primary #3A63C2` (halo 4 px `#E3EAF8`).
- Les ressentis sont **les seuls** nœuds lavande ; l'intensité pilote la taille du cercle (diamètre = 18 + 1,6 × intensité px), jamais la couleur de famille (réservée aux courbes).
- Cadre d'un bloc d'entrées sœurs : `--surface-ground`, bordure `--border-subtle`. Fil de l'entrée sélectionnée : traits, flèches et noms de liens en `--primary`.
- Panneau : `#FFFFFF`, bordure `#D6DCE6` ; puces de type avec icône + libellé (jamais couleur seule).

## Accessibilité
- Alternative non graphique obligatoire : bouton « Liste des liens » → tableau `source · type · cible · provenance · statut` (même données), navigable au clavier.
- Nœud sélectionné annoncé (`aria-live="polite"`), panneau = `role="complementary"`.
- Le canevas est un `role="group"` nommé (nombre de nœuds et de liens, renvoi à la liste). Les cartes sont des boutons **hors de l'ordre de tabulation** (jusqu'à 150 arrêts sinon) : au clavier et au lecteur d'écran, on passe par la « Liste des liens ».
- Contrastes : chiffre d'intensité `#4E3F9E` sur `#ECE8F8` (`--feeling-text` sur `--feeling-tint`), quelle que soit la taille du cercle. Hors du fil, une carte s'efface par sa bordure, sa forme et la graisse de son titre, jamais par l'opacité de son texte (axe-core, deux thèmes).

## Critères d'acceptation
- [ ] 150 nœuds : disposition calculée en moins de 2 s et vue fluide (mesuré en e2e le 21 novembre 2026 : 0,4 à 0,75 s, 52 à 60 images par seconde).
- [ ] `depth=3` sur un patient de 2 000 entrées → réponse < 500 ms (index GIN sur `link(source_id, target_id)`), `truncated=true` + super-nœuds.
- [ ] Glisser A→B crée un lien `manual/accepted` et met à jour le compteur sans recharger.
- [ ] Un lien rejeté n'apparaît plus mais reste en base (test d'intégration).
- [ ] Vue liste équivalente passe axe-core sans erreur.
- [ ] Aucun cycle infini sur `part_of` réciproque (test CTE avec `cycle` guard).

## Hors périmètre V1
Suggestions de liens IA (V2, `ai_suggested`), graphe multi-patients, export image.
