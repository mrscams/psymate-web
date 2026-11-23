# Étude : traduire PsyMate en arabe

22 novembre 2026. Mesures prises sur la branche `fluent2-redesign` de psymate-web, contrat 0.14.0, et en lecture seule sur la branche `main` de psymate-api. Aucun code n'a été modifié.

Depuis, `main` a reçu le jalon M14 : il porte 3 266 textes le 23 novembre 2026, et sa police latine est Inter (Segoe UI est celle de l'habillage Fluent 2, pas encore fusionné). Les ordres de grandeur ci-dessous restent valables.

Suite : le plan de réalisation est `docs/M-plan-version-arabe.md` (jalon M16). Il reprend les décisions de la section 3 et remplace l'ordre indicatif de la section 4.

## 1. Réponse courte

Presque toute l'interface peut être traduite : elle est déjà externalisée (3 021 textes, environ 14 000 mots, dans `src/locale/messages.fr.xlf`). Ajouter un fichier `messages.ar.xlf` et un troisième bundle `/ar/` est mécaniquement simple.

Le vrai travail n'est pas la traduction, c'est tout ce qui l'entoure :

1. **La mise en page de droite à gauche.** Les styles sont écrits en gauche/droite physiques (environ 200 déclarations dans 86 fichiers, contre une dizaine en propriétés logiques).
2. **Le « français ou anglais » est écrit en dur** dans le client, dans le contrat et dans l'API. G Q23 prévoit d'ajouter une langue « sans changement de code » ; ce n'est pas le cas aujourd'hui.
3. **Les textes rédigés par le serveur** (messages d'erreur, résumé « En bref », verbes des liens, catalogues d'émotions et de spécialités, exports, e-mails) n'existent qu'en français et en anglais, et le contrat n'a pas de place pour un libellé arabe.
4. **La saisie libre** (détection des dates et des émotions dans le texte) repose sur une grammaire française et anglaise.

## 2. Ce qu'on peut traduire

### A. Traduisible par simple ajout d'un fichier de traduction

| Zone (préfixe des identifiants) | Textes |
| --- | ---: |
| Compte, profil, préférences, vocabulaire (`account`, `profile`, `preferences`, `vocabulary`, `accountNav`) | 651 |
| Administration (`admin`, `adminBar`) | 307 |
| Connexion, inscription, dossier (`auth`) | 265 |
| Liste et fiche patient (`patients`, `patientShell`, `patientHeader`, `sessionBar`) | 395 |
| Pages publiques et annuaire (`public`) | 228 |
| Timeline (`timeline`) | 184 |
| Agenda (`agenda`) | 170 |
| Entrées et saisie (`entries`, `capture`) | 258 |
| Graphe et liens (`graph`, `links`) | 209 |
| Vue d'ensemble (`overview`) | 118 |
| Recherche (`search`) | 78 |
| Profil 360 (`profile360`) | 44 |
| Socle (états, toasts, bandeaux, raccourcis, formulaires, barres) | environ 110 |
| **Total** | **3 021** |

À noter pour le traducteur :

- **31 messages au pluriel.** L'arabe a six formes (zéro, un, deux, peu, beaucoup, autre) là où le français en a deux. Chaque message est à réécrire avec ses six formes ; Angular les gère.
- **117 messages avec une valeur insérée.** L'ordre des mots change, à relire un par un.
- **Phrases assemblées par morceaux.** Quelques libellés insèrent un nom de type ou d'émotion en minuscules dans une phrase (`capture-labels.ts`, `patient-row.ts`, `capture-links.component.ts`). En arabe l'article et l'accord ne suivent pas ; ces phrases demandent une reformulation, parfois un message par type.
- **Genre.** Aucun message n'utilise de sélection par genre. L'arabe accorde verbes et adjectifs (« suivie depuis… », impératifs adressés au praticien). Conseil : boutons au nom verbal (« إضافة » plutôt que « أضف »), tournures sans accord pour la personne suivie.
- **Terminologie clinique.** « patient / client », noms des types d'entrée, familles d'émotions : un glossaire validé par un clinicien arabophone est nécessaire avant de traduire en volume.
- L'anglais est lui-même en retard d'environ 170 textes. L'arabe peut partir du français sans attendre.

### B. Traduisible, mais demande du code dans psymate-web

| Sujet | Constat | Travail |
| --- | --- | --- |
| Troisième langue | `APP_LOCALES = ['fr', 'en']`, `toAppLocale` renvoie `fr` pour tout ce qui n'est pas anglais, `otherLocale` est une bascule à deux positions, le sélecteur de langue aussi | Passer d'une bascule à une liste ; tâche sur `core/i18n` et `core/preferences` |
| Choix des libellés | Sept services `*.api.ts` portent un booléen `english` ; `itemLabel` choisit entre `labelEn` et `labelFr` | Remplacer le booléen par la langue |
| Droite à gauche | Environ 200 déclarations physiques (`margin-left`, `left:`, `text-align: left`…) dans 86 fichiers, dont une dizaine de composants partagés ; aucun `dir` posé dans l'application | Conversion en propriétés logiques, fichier par fichier, vérifiable par captures |
| Contenu saisi | Aucun `dir="auto"` : une note en arabe dans l'interface française (ou l'inverse) s'aligne mal et la ponctuation se déplace | Poser `dir="auto"` sur les champs et les affichages de texte saisi. Utile dès aujourd'hui, même sans traduction |
| Typographie | 59 `letter-spacing` (casse les ligatures de l'écriture arabe), 31 `text-transform: uppercase` (sans effet), 4 italiques (inexistant en arabe) | Neutraliser sous `:lang(ar)` dans les tokens |
| Police | `--font-ui` est une pile Segoe UI, sans police web embarquée. Segoe UI couvre l'arabe sous Windows ; ailleurs le système choisit sa police | Décider : laisser le système, ou embarquer une police arabe (dépendance et poids à déclarer) |
| Agenda | FullCalendar reçoit `fr` ou `en-gb` en dur ; `firstDay: 1` en dur | Brancher la locale arabe fournie par FullCalendar (sens RTL inclus) ; premier jour selon le pays |
| Vue d'ensemble | ECharts ne se retourne pas seul ; alignements `left` / `right` en dur dans `feelings-chart.options.ts` | Voir décision 5 |
| Timeline par décennie | Graphique SVG maison calculé de gauche à droite | Voir décision 5 |
| Graphe | elkjs dispose avec `elk.direction: RIGHT` | En arabe, lecture vers la gauche (`LEFT`) : c'est un graphe en lecture dirigée (G Q58) |
| Clavier | Flèches gauche/droite codées en dur dans six composants (curseurs d'intensité, onglets, barres d'outils) ; raccourcis lus sur `event.key`, qui rend une lettre arabe sur un clavier arabe | Inverser les flèches en RTL ; lire les raccourcis sur la touche physique |
| Icônes | 58 SVG en ligne, dont des flèches et chevrons directionnels | Inventaire et miroir des seules icônes de direction |
| Recherche côté client | La normalisation retire les diacritiques (donc les voyelles brèves, c'est bien) mais n'unifie pas les variantes de alif, ta marbuta, ya | Compléter la normalisation |
| Tests | 73 specs Playwright ciblent des libellés français et tournent sur `/fr/` : elles ne cassent pas | Ajouter un jeu e2e arabe réduit : parcours clé, axe-core, captures RTL |

Ce qui marche déjà sans rien faire : les dates, heures, durées et listes passent toutes par `Intl` avec la locale (`core/i18n/formats.ts`), Angular Material et le CDK se retournent seuls dès que `dir="rtl"` est posé sur la page, le sélecteur de date suit la locale, les noms de langues de l'annuaire viennent de `Intl.DisplayNames`.

### C. Traduisible seulement avec psymate-api et un nouveau contrat

| Sujet | Constat |
| --- | --- |
| Préférence de langue | Le contrat limite `locale` à `fr` ou `en` |
| Catalogues globaux | Émotions, types d'entrée, types de lien (libellé et libellé inverse), spécialités, approches, publics, modalités : champs `labelFr` et `labelEn` uniquement, pas de `labelAr` ; écrans d'administration à étendre |
| Messages du serveur | 453 clés dans `messages_fr.properties` et `messages_en.properties` ; l'API ramène toute langue autre que l'anglais au français |
| Langue envoyée | Le client ne pose pas `Accept-Language` : c'est la langue du navigateur qui part, pas celle de l'interface. À corriger, sinon un praticien en `/ar/` reçoit des erreurs en français |
| Résumé « En bref » | Phrases rédigées par règles côté serveur, en français ou anglais. En arabe, l'accord en genre et en nombre rend ces règles nettement plus lourdes |
| Verbes des liens | Rendus par le serveur selon `Accept-Language` |
| Exports Markdown et PDF | Textes fr/en ; l'export asynchrone est fixé en français. Le PDF demande une police arabe embarquée, la mise en forme des lettres liées et le sens RTL (non vérifié dans le moteur actuel) |
| E-mails | Confirmation, changement d'adresse, décisions de vérification : à traduire et à mettre en RTL |
| Recherche plein texte | Index PostgreSQL en configuration `french` avec `unaccent` et `pg_trgm`. L'arabe y est indexé mot à mot, sans racines ni variantes : la recherche marche de façon approximative, à améliorer par une configuration `arabic` |

### D. Ce qui ne se traduit pas

- **Les données saisies** : notes, entrées, noms, Profil 360, étiquettes et émotions créées par le praticien. Elles restent dans la langue de saisie ; il faut seulement qu'elles s'affichent correctement (point `dir="auto"`).
- **Le nom du produit**, PsyMate, en caractères latins.
- **Les codes et identifiants** : codes d'erreur, codes de récupération, références d'export, adresses e-mail, URL.
- **Les documents de vérification** déposés par le praticien.
- **La détection dans la saisie libre**, en première version (voir ci-dessous).

### Cas particulier : la saisie libre

`features/capture/parser` reconnaît « hier », « il y a 3 ans », « lundi dernier », les nombres en lettres et les noms d'émotions, avec un lexique français et un lexique anglais. L'arabe n'est pas un troisième lexique à remplir : le duel (« قبل سنتين »), les prépositions collées au mot et l'absence de voyelles demandent une grammaire propre. Proposition : livrer l'arabe sans détection dans le texte, les champs structurés du bloc de saisie restant disponibles, puis écrire la grammaire arabe dans un second temps.

## 3. Décisions à prendre (à inscrire dans G)

1. **Quel arabe.** Arabe standard moderne pour l'interface ; pas de dialecte.
2. **Quel pays, donc quels chiffres et quel calendrier.** Le code de locale change le rendu : `ar-MA`, `ar-DZ`, `ar-TN` donnent des chiffres latins et le calendrier grégorien ; `ar-EG` donne les chiffres arabo-indiens ; `ar-SA` donne en plus le calendrier hégirien par défaut. **Décidé le 22 novembre 2026 : chiffres latins et calendrier grégorien, quel que soit le pays**, pour que les dates restent comparables avec l'API et les exports. Conséquences :
   - un seul bundle `/ar/`, sans variante par pays ;
   - la locale `ar` seule rend des chiffres arabo-indiens dans `Intl` : tous les formats passent par une locale de formatage explicite, `ar-u-nu-latn-ca-gregory`, définie une fois dans `core/i18n` (lot 1) ;
   - les appels qui donnent `LOCALE_ID` directement à une bibliothèque (FullCalendar, sélecteur de date Material, ECharts, `Intl.ListFormat` et `Intl.DisplayNames` dans les features) sont à faire passer par cette locale de formatage ;
   - même règle côté API pour les exports et les e-mails ;
   - le pays ne joue plus que sur le premier jour de la semaine (décision 3).
3. **Premier jour de la semaine** : **décidé le 22 novembre 2026, lundi**, comme en français et en anglais (l'usage varie selon les pays : lundi au Maghreb, samedi ou dimanche ailleurs). Conséquences :
   - `firstDay: 1` de l'agenda reste tel quel, et la locale arabe de FullCalendar ne doit pas le remplacer par sa propre valeur ;
   - le mini-calendrier de l'agenda et le sélecteur de date Material suivent la même règle : à vérifier, car le sélecteur lit le premier jour dans la locale ;
   - si un pays à semaine commençant le dimanche est visé plus tard, ce sera une préférence du praticien, pas un second bundle.
4. **Périmètre de la première version** : **décidé le 22 novembre 2026, tout le produit** (espace praticien, administration, pages publiques). Conséquences :
   - le lot 4 (API et contrat) conditionne la mise en service, il n'est plus optionnel ;
   - les pages publiques ne passent plus en premier, l'ordre suit les dépendances techniques ;
   - restent proposés pour un second temps, à confirmer : résumé « En bref », export PDF, recherche plein texte par racines, détection dans la saisie libre. Tant qu'ils ne sont pas faits, il faut dire ce que voit un praticien en arabe : résumé et export en français, recherche mot à mot, saisie par les champs structurés.
5. **Sens des axes de temps** (courbe des ressentis, timeline par décennie). **Décidé le 22 novembre 2026 : les graphiques temporels restent de gauche à droite en première version.** Conséquences :
   - la courbe des ressentis (ECharts) et la timeline par décennie (SVG) gardent leur axe du temps, le passé à gauche ; seuls leurs libellés, légendes et infobulles passent en arabe ;
   - ces deux blocs sont isolés du sens de la page (`dir="ltr"` sur le conteneur du graphique), pour que la mise en page RTL ne déplace pas leurs repères ;
   - la mise en page autour (titres, filtres, panneaux) se retourne comme le reste ;
   - le graphe des liens, lui, se lit vers la gauche en arabe (`elk.direction: LEFT`), car c'est un sens de lecture et non un axe de temps (G Q58) ;
   - la grille de l'agenda suit FullCalendar en RTL (jours de droite à gauche), c'est un calendrier et non un graphique.
6. **Police arabe** : **décidé le 22 novembre 2026, IBM Plex Sans Arabic**, embarquée (comparaison : `docs/design/arabe/polices.html`). Conséquences :
   - les fichiers de police (licence libre OFL) sont hébergés avec le site, sans appel à un tiers ; c'est un ajout à déclarer dans la PR du socle, avec le texte de la licence ;
   - la police ne couvre que l'écriture arabe (`unicode-range`) : lettres latines et chiffres restent en Segoe UI, comme dans les bundles français et anglais ;
   - elle n'est chargée que par le bundle `/ar/` ; `--font-ui` est redéfini sous `:lang(ar)` dans `src/theme/tokens.css` ;
   - graisses à embarquer : celles que l'interface emploie (400, 500, 600, 700 dans la maquette, à confirmer sur les tokens) ;
   - `--font-mono` n'a pas de lettres arabes : les dates et identifiants qui l'emploient sont à repasser en police d'interface avec chiffres tabulaires quand ils contiennent un nom de mois ;
   - le rendu devient le même sur tous les appareils, y compris sur les machines Linux des e2e, ce qui stabilise les captures.
7. **Qui traduit et qui valide** : un traducteur, puis une relecture par un clinicien arabophone sur le glossaire et sur écran.

## 4. Ordre proposé

| Lot | Contenu | Dépend de |
| --- | --- | --- |
| 0 | Décisions G, glossaire clinique | rien |
| 1 | Socle : troisième langue dans `core/i18n`, bundle `/ar/`, `dir` et `lang`, `Accept-Language` explicite, règles `:lang(ar)` dans les tokens | lot 0 |
| 2 | Conversion des styles en propriétés logiques, `dir="auto"` sur le contenu saisi, flèches du clavier | lot 1 ; une tâche dédiée pour `shared/ui`, puis une par feature |
| 3 | Traduction de `messages.ar.xlf` (pages publiques d'abord si le périmètre est réduit) | glossaire |
| 4 | API et contrat : `locale` étendu, `labelAr`, `messages_ar.properties`, e-mails | PR de changement de tag dédiée côté web |
| 5 | Agenda, graphe, graphiques, e2e arabe avec captures RTL | lots 2 et 4 |
| 6 | Second temps : résumé « En bref », export PDF, recherche plein texte, grammaire de saisie libre | lot 4 |

Les lots 1 et 2 peuvent avancer sans attendre l'API. Tant que le lot 4 n'est pas livré, un praticien en arabe verrait les catalogues et les messages du serveur en français : avec le périmètre « tout le produit », le bundle `/ar/` ne s'ouvre aux praticiens qu'après le lot 4.

### Volume pour tout le produit (ordre de grandeur, à affiner dans un plan de tâches)

| Lot | Tâches web estimées | Remarque |
| --- | ---: | --- |
| 1. Socle | 2 | `core/i18n` et `core/preferences` ; tokens `:lang(ar)` |
| 2. Styles et contenu saisi | 15 | une tâche dédiée `shared/ui`, puis une par feature (14 features) |
| 3. Traduction | 1 | intégration de `messages.ar.xlf` ; la traduction elle-même est hors code |
| 4. Contrat | 1 | PR de changement de tag, après la livraison côté API |
| 5. Agenda, graphe, graphiques, e2e | 4 | |
| **Total web, hors second temps** | **environ 23** | une PR par tâche |

Traduction : environ 14 000 mots. Au rythme usuel d'un traducteur professionnel (2 000 à 2 500 mots par jour), six à sept jours, plus la relecture clinique sur écran. Le travail côté psymate-api (lot 4) et le second temps (lot 6) ne sont pas chiffrés ici.

## 5. Ce qui n'a pas été vérifié

- Que le build Angular pose bien `dir="rtl"` sur `<html>` pour le bundle arabe : le code d'`@angular/build` installé le fait (lu le 22 novembre 2026), mais aucun build arabe n'a été lancé.
- Le rendu réel d'un écran en RTL : aucune capture n'a été faite, les chiffres viennent d'un comptage du code.
- Le moteur PDF de l'API (police, mise en forme de l'arabe) et les modèles d'e-mails : repérés, pas lus.
- La version de PostgreSQL et la présence de la configuration `arabic`.
- L'effort en jours : seul un nombre de tâches web est estimé (section 4) ; le travail côté API n'est pas chiffré.
