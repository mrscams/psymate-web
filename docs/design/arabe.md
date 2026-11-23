# Habillage arabe : règles de droite à gauche

23 novembre 2026, tâche M16-07. Complément de la fiche 00 (composants partagés) et de `docs/Etude-couleurs-Nordique.md` pour le bundle `/ar/`. Décisions : G Q71 (tranchée par l'utilisateur le 22 novembre 2026) et Q72 à Q81 (proposées par le plan M, non relues par l'utilisateur). Plan : `docs/M-plan-version-arabe.md`. Comparaison des polices et réglages typographiques : `docs/design/arabe/polices.html` (ouvrir dans un navigateur ; elle a été dessinée avec d'autres tokens : elle vaut pour le choix de la police arabe, pas pour les couleurs ni la police latine, qui sont celles de `src/theme/tokens.css`). Termes et registre : `docs/design/arabe-glossaire.md`.

Ces règles s'appliquent à tout le code de `src/app`, dans les trois langues. Elles ne changent rien à l'écran en `/fr/` ni en `/en/` : une propriété logique rend exactement la même chose qu'une propriété physique quand la page est de gauche à droite. Seule exception voulue (Q77) : un texte saisi en arabe s'aligne à droite en `/fr/` et en `/en/` grâce à `dir="auto"` ; un texte saisi en caractères latins ne bouge pas.

## 1. Le sens de la page

- Le build pose `lang="ar"` et `dir="rtl"` sur `<html>` pour `/ar/` (Q74) ; rien d'autre ne pose le sens de la page (les `dir="ltr"` et `dir="auto"` des sections 3 et 5 ne valent que pour leur élément). Angular Material et le CDK lisent ce `dir` (service `Directionality`) : menus, dialogues, panneaux, infobulles et champs se retournent seuls.
- Le code qui a besoin du sens le lit dans `core/i18n` (M16-08), jamais en comparant la locale à `'ar'` dans une feature.
- En CSS, le sens se teste par `:dir(rtl)` ; la langue par `:lang(ar)`. Dans les styles d'un composant (encapsulation émulée), `[dir='rtl'] .x` ne marche pas, car Angular ajoute son attribut de contenu au sélecteur de l'ancêtre et `<html>` ne le porte pas : écrire `:dir(rtl)` ou `:host-context([dir='rtl'])`. Les règles typographiques (section 4) visent la langue, les règles de miroir (section 3) visent le sens.

## 2. Propriétés logiques seulement

Toute déclaration de mise en page s'écrit en propriété logique (Q74). La règle ESLint `psymate/no-physical-direction` (M16-09) le vérifie sur les styles des composants et sur les gabarits, d'abord sur une liste de zones converties (une ligne par zone dans `eslint.config.mjs`), puis partout (M16-29).

| Physique (interdit) | Logique (à employer) |
| --- | --- |
| `margin-left`, `margin-right` | `margin-inline-start`, `margin-inline-end` |
| `margin: 0 8px 0 16px` (quatre valeurs différentes à gauche et à droite) | `margin-block: 0` et `margin-inline: 16px 8px` (début, puis fin) |
| `padding-left`, `padding-right` | `padding-inline-start`, `padding-inline-end` |
| `border-left`, `border-right` (et `-width`, `-color`, `-style`) | `border-inline-start`, `border-inline-end` (et `-width`, `-color`, `-style`) |
| `left`, `right` | `inset-inline-start`, `inset-inline-end` |
| `left: 0; right: 0` | `inset-inline: 0` |
| `text-align: left`, `text-align: right` | `text-align: start`, `text-align: end` |
| `float: left`, `float: right` | `float: inline-start`, `float: inline-end` |
| `clear: left`, `clear: right` | `clear: inline-start`, `clear: inline-end` |
| `border-top-left-radius`, `border-top-right-radius` | `border-start-start-radius`, `border-start-end-radius` |
| `border-bottom-left-radius`, `border-bottom-right-radius` | `border-end-start-radius`, `border-end-end-radius` |
| `border-radius: 8px 0 0 8px` (coins différents à gauche et à droite) | `border-start-start-radius: 8px; border-end-start-radius: 8px` |
| `transform-origin: left` | à éviter ; sinon une règle `:dir(rtl)` qui donne `right` |
| `background-position: left …` | `background-position-x` dans une règle `:dir(rtl)` |
| `justify-content: flex-start` / `flex-end`, `align-items: start` | inchangés : flexbox et grille suivent déjà le sens |
| `flex-direction: row`, `grid-template-columns` | inchangés : ils suivent déjà le sens |
| `margin-top`, `margin-bottom`, `top`, `bottom` | autorisés tels quels (le sens vertical ne change pas) ; `margin-block-*` et `inset-block-*` sont acceptés |
| `margin: 0 auto`, `padding: 8px 16px` (même valeur à gauche et à droite) | autorisés : ils ne dépendent pas du sens |

Exceptions, qui restent physiques avec un commentaire qui le dit :

- les coordonnées d'un dessin, qui ne sont pas de la mise en page : positions calculées par elkjs dans le graphe (`left` et `top` des cartes), constantes `LEFT` et `RIGHT` du SVG de la vue décennie, alignements `left` et `right` des options ECharts de la courbe des ressentis ;
- le contenu d'un conteneur explicitement en `dir="ltr"` (section 3, ce qui ne se retourne pas).

Si la règle ESLint signale une de ces exceptions, la tâche de feature propose l'exception dans sa PR ; elle ne désactive pas la règle elle-même.

## 3. Ce qui se retourne, ce qui ne se retourne pas

Se retourne (Q75) :

- **Toute la mise en page** : rail de navigation et panneau latéral changent de côté, colonnes des tableaux et des pages à deux panneaux s'échangent, actions de fin de ligne passent à gauche, fil d'Ariane se lit de droite à gauche.
- **Le graphe des liens** : en arabe, le sens horizontal se lit vers la gauche (`elk.direction: LEFT`) ; la cause est à droite, l'effet à gauche. Le sens vertical (haut → bas) ne change pas. Le paramètre d'URL garde sa valeur.
- **L'agenda** : FullCalendar en `direction: 'rtl'`, les jours se lisent de droite à gauche, lundi dans la première colonne à droite ; les heures restent de haut en bas.
- **Les icônes de direction**, et seulement elles : flèches avant et arrière, chevrons de navigation (mois précédent et suivant, page précédente et suivante, déplier dans le sens de lecture), flèche de retour, icônes de sortie et d'entrée (déconnexion), flèche d'inversion d'un lien, flèche « vers » d'une phrase source → cible. Le retournement passe par un seul mécanisme du thème (la classe globale `.pm-flip-rtl` de `src/theme/arabic.scss`, `transform: scaleX(-1)` sous `:dir(rtl)`, posée par M16-09 ; une icône déjà transformée par son composant compose `scaleX(-1)` elle-même), posé sur chaque icône concernée.
- **Les contrôles horizontaux au clavier** (section 6) et le curseur d'intensité, dont le minimum passe à droite.

Ne se retourne pas :

- **Les deux graphiques temporels** (Q71 point 4) : la courbe des ressentis de la vue d'ensemble et la vue décennie de la timeline gardent le passé à gauche. Leur conteneur porte `dir="ltr"` ; leurs libellés, légende et infobulle sont en arabe, dates par la locale de formatage. Ce qui les entoure (titre, filtres, colonne latérale) se retourne.
- **Les icônes qui ne disent pas un sens** : recherche, horloge, coche, croix de fermeture, poubelle, crayon, cloche, cadenas, œil, calendrier, point d'interrogation, téléchargement (flèche vers le bas), lecture d'un média, logos.
- **Les touches de clavier affichées** (`<kbd>`) : caractères latins, en `dir="ltr"`.
- **Le contenu en `dir="ltr"`** (section 5) : adresses e-mail, codes, montants, URL, plages horaires « 14:00 – 15:00 ».
- **La feuille d'une facture** (M15) : document français, dans un conteneur `lang="fr" dir="ltr"`.

## 4. Police et typographie

Police (Q71 point 5, Q76) :

- **IBM Plex Sans Arabic**, licence SIL Open Font License 1.1, fichiers `woff2` hébergés avec le site dans `public/fonts/ibm-plex-sans-arabic/`, avec le texte de la licence. Aucun appel à un tiers.
- **Graisses embarquées** : celles que l'interface emploie. Relevé du 23 novembre 2026 sur `main` (`font-weight` dans `src`) : 400 (25 emplois), 500 (39), 600 (130), 650 (9), 700 (7). On embarque donc Regular 400, Medium 500, SemiBold 600 et Bold 700 ; une graisse de 650 est rendue par le fichier 700 (règle de correspondance des polices du navigateur). M16-09 refait ce relevé sur sa base.
- **`@font-face` limités à l'écriture arabe** par `unicode-range` (blocs Arabic U+0600–06FF, Arabic Supplement U+0750–077F, Arabic Extended-A U+08A0–08FF, Arabic Presentation Forms-A U+FB50–FDFF et -B U+FE70–FEFF, plus les marques de sens U+200C–200F). Conséquences : lettres latines et chiffres restent dans la police latine du thème (Inter, `--font-ui` de `src/theme/tokens.css`) ; en `/fr/` et `/en/`, aucun fichier de police arabe n'est téléchargé tant qu'aucun caractère arabe n'est à l'écran.
- **`--font-ui` redéfini sous `:lang(ar)`** dans `src/theme/tokens.css` : la police arabe en tête de pile, la police latine du thème ensuite. `font-display: swap`.

Règles `:lang(ar)` du thème, écrites une fois dans `src/theme` et pas composant par composant (Q76) :

| Règle | Pourquoi |
| --- | --- |
| `letter-spacing: normal` | L'interlettrage casse la liaison des lettres arabes (polices.html, section 3, « Interlettrage actuel » contre « Sans interlettrage »). |
| `text-transform: none` | L'arabe n'a pas de capitales ; une mise en capitale forcée n'a pas d'effet sur l'arabe mais en a sur un mot latin inséré. |
| `font-style: normal` | L'arabe n'a pas d'italique ; l'italique synthétisé penche les lettres et nuit à la lecture. La mise en relief passe par la graisse ou la couleur. |
| Interligne du texte courant | L'arabe a des hampes et des points plus hauts et plus bas que le latin : M16-09 vérifie l'interligne du texte courant contre polices.html (section 3) et l'augmente sous `:lang(ar)` seulement si les lignes se touchent. |
| Pas de `--font-mono` pour une date à nom de mois | `--font-mono` n'a pas de lettres arabes : « 17 نوفمبر 2026، 14:03 » passe dans la police d'interface avec chiffres tabulaires (`font-variant-numeric: tabular-nums`). Le token `--font-mono-text` (M16-09) vaut `--font-mono` en français et en anglais et la police d'interface en arabe : l'employer, avec `tabular-nums`, pour tout texte à lettres en chasse fixe. Une date tout en chiffres et un identifiant gardent `--font-mono`. En arabe seulement : `/fr/` et `/en/` gardent `--font-mono` partout où il est aujourd'hui. |

Une mise en capitale de la première lettre (`text-transform: capitalize`, `toLocaleUpperCase` sur le premier caractère) ne s'applique pas à un texte arabe ; découper un texte par graphème (`Intl.Segmenter`), jamais par caractère.

## 5. Contenu saisi et valeurs insérées

Règle (Q77), dans les trois langues :

- **`dir="auto"`** sur tout affichage et tout champ d'un texte saisi : titre et texte d'une entrée, nom et prénom, étiquette, drapeau, note, motif, présentation du profil public, information du Profil 360, notes d'un rendez-vous, message du formulaire de contact. Le navigateur prend le sens de la première lettre forte : une note en arabe s'aligne à droite dans l'interface française, une note en français s'aligne à gauche dans l'interface arabe, et la ponctuation reste à sa place.
- **`<bdi>`** autour d'une valeur insérée dans une phrase (nom d'un patient, titre d'une entrée, nom d'une émotion, « PsyMate ») : la valeur garde son sens sans déplacer les mots qui l'entourent. Exemple : « Archiver <bdi>Salma Ben Ali</bdi> ? » et « أرشفة <bdi>Claire Martin</bdi>؟ ».
- **`dir="ltr"`** pour ce qui n'a pas de sens de lecture : adresses e-mail, mots de passe, codes de double authentification et de secours, jetons, numéros de téléphone, URL, montants, numéros (ADELI, RPPS, SIRET, IBAN, facture), plages horaires. Le champ reste aligné du côté de début de la page.
- Un message entier qui vient du serveur dans une autre langue (résumé « En bref » en français tant que M16-30 n'est pas faite, verbes des liens tant que l'API ne sert pas l'arabe) s'affiche en `dir="auto"`.

## 6. Clavier

- Les raccourcis se lisent sur la touche physique (`event.code`), pas sur le caractère (`event.key`) : sur un clavier arabe, la touche N rend « ى » (Q81, M16-08).
- Dans un composant horizontal (onglets, contrôle segmenté, sélecteur de thème, barre d'outils à focus mobile, puces de type, curseur et échelle d'intensité, mini-calendrier), **flèche droite et flèche gauche s'inversent en RTL** : flèche gauche va à l'élément suivant (ou augmente la valeur), flèche droite au précédent (ou la diminue). Haut, bas, Début et Fin ne changent pas. `aria-valuenow` d'un curseur ne change pas.
- Les composants du CDK (`FocusKeyManager` avec `withHorizontalOrientation`) font déjà cette inversion s'ils reçoivent le sens de `Directionality` : préférer cela à un code maison.

## 7. Formats

- Tout `Intl.*`, tout `toLocaleString`, `toLocaleUpperCase`, `toLocaleLowerCase`, `localeCompare` et toute bibliothèque (FullCalendar, sélecteur de date Material, ECharts) reçoit la **locale de formatage** de `core/i18n` (Q73) : `ar-u-ca-gregory-hc-h23-nu-latn` en arabe, `LOCALE_ID` sinon. Jamais `LOCALE_ID` directement.
- Résultat attendu en arabe : chiffres latins, calendrier grégorien, semaine au lundi, heures sur 24 h. Un test le vérifie dans `core/i18n` (M16-08) et chaque tâche de feature qui met une date en forme.
- Exceptions voulues : `parser/calendar.ts` emploie `'en-US'` pour un calcul technique de jour civil (M16-20 n'y touche pas).

## 8. Libellés de catalogue

Une seule fonction de `core/i18n` choisit le libellé d'un objet `{ labelFr, labelEn?, labelAr? }` : arabe s'il existe, sinon français ; anglais s'il existe, sinon français (Q78). Aucun booléen `english`, aucun choix local entre `labelFr` et `labelEn` dans une feature. Tant que le contrat `0.16.0` n'est pas tiré (M16-25), les catalogues s'affichent en français dans `/ar/`.

## 9. Tests et captures

- Les specs arabes vivent dans `e2e/arabe/`, une par zone (`socle`, puis une par feature). Chacune ouvre `/ar/`, vérifie `dir="rtl"` sur `<html>`, l'absence de défilement horizontal (`document.documentElement.scrollWidth <= innerWidth`), axe-core sans violation, et produit une capture par écran, en clair et en sombre quand la tâche le demande.
- **Aucun libellé ciblé** dans ces specs avant l'ouverture (M16-29) : rôles, structure et URL seulement, parce que les textes de `/ar/` passent du français de repli à l'arabe au fil des tâches de traduction.
- Les specs et captures existantes, sur `/fr/`, ne changent pas. Une tâche M16 qui les ferait changer a changé le rendu français : c'est un défaut à corriger, pas une capture à régénérer.

## 10. Vérification à l'œil, pour chaque écran

1. Rien ne se chevauche, rien n'est coupé, aucun défilement horizontal.
2. Le rail et les panneaux sont du bon côté ; les actions de fin de ligne sont à gauche.
3. Les flèches et chevrons pointent dans le sens de lecture ; les autres icônes sont intactes.
4. Un texte arabe saisi et un texte français saisi s'affichent chacun dans son sens.
5. Les lettres arabes sont liées (pas d'interlettrage), aucun italique, aucun chiffre arabo-indien.
6. Les deux graphiques temporels ont le passé à gauche.
