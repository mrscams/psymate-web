# Document M – Plan d'action · Version arabe, jalon M16 (API et web)

22 novembre 2026, mis à jour le 23 novembre pour le lancement. Écrit à la demande de l'utilisateur, à la suite de `docs/Etude-traduction-arabe.md` (constats et mesures) et de la comparaison des polices `docs/design/arabe/polices.html`. **Lancé le 23 novembre 2026**, en autonomie, à la demande de l'utilisateur (M4.5).

**Ce que l'utilisateur a tranché le 22 novembre 2026** (G Q71, section G14) : tout le produit en arabe ; chiffres latins et calendrier grégorien quel que soit le pays ; semaine commençant le lundi ; graphiques temporels laissés de gauche à droite ; police IBM Plex Sans Arabic, embarquée. **Ce que ce plan propose et que l'utilisateur n'a pas encore relu** : l'arabe standard moderne, les décisions techniques de M2.2 et M2.3, le découpage en tâches, le second temps (M8). Qui traduit et qui valide reste ouvert (M9).

La tâche M16-01 copie la moitié API dans `psymate-api/docs/M-plan-version-arabe-api.md` et inscrit les décisions dans le G de l'API. La tâche M16-07 fait le report côté web. Tant qu'elles ne sont pas fusionnées, ce document fait foi pour le jalon M16.

Numéros (revérifiés le 23 novembre 2026 sur `main` des deux dépôts) : jalon **M16**. M14 est livré ; M15 (facturation) n'est pas lancé et son plan n'est pas sur `main`. Dans ce dépôt : **Q71 inscrite, Q72 à Q81 à inscrire, section G14**, section **C14** (G11 et Q59 sont des numéros déjà réservés ; G13, Q67 à Q70 et C13 à la facturation). Dans psymate-api : **Q96 à Q102, section G12, section C15** (Q83 à Q95, G11 et C14 restent réservés à la facturation). Migrations : **`V16`** pour M16-02 (contraintes de langue en base) et **`V17`** pour les catalogues de M16-03 (constat de la session API, inscrit dans sa copie du plan le 23 novembre 2026). Contrat : **`0.16.0`**, la mineure qui suit `0.15.0` (tag posé par M14-08). La facturation prendra les numéros suivants pour sa migration et son contrat ; son plan devra être corrigé en conséquence.

## M1. Périmètre

Ce que le jalon doit permettre :

- Un praticien choisit l'arabe dans ses préférences : toute l'application passe en arabe, de droite à gauche, sous `/ar/`.
- Un visiteur lit les pages publiques et l'annuaire en arabe.
- Un administrateur travaille en arabe et saisit le libellé arabe des catalogues.
- Les catalogues (émotions, types d'entrée, types de lien, spécialités, approches, publics, modalités), les messages d'erreur et les e-mails arrivent en arabe.
- Un texte saisi en arabe s'affiche correctement dans les trois langues, et un texte saisi en français s'affiche correctement en arabe.

Hors première ouverture, proposé en second temps (M8) : résumé « En bref » rédigé en arabe, exports Markdown et PDF en arabe, recherche plein texte par racines, détection des dates dans la saisie libre en arabe. Tant qu'ils ne sont pas faits, un praticien en arabe a le résumé et l'export en français, une recherche mot à mot, et la saisie par les champs structurés.

Hors M16 : un dialecte ; une variante par pays ; le calendrier hégirien ; les chiffres arabo-indiens ; la traduction des données saisies ; les factures en arabe (M15 vise la France, la facture reste en français ; seuls les écrans du module sont traduits).

## M2. Décisions

### M2.1 Tranchées par l'utilisateur (inscrites : G Q71, section G14)

Cinq points, le 22 novembre 2026 : (1) **tout le produit** est traduit, espace praticien, administration et pages publiques ; (2) **chiffres latins et calendrier grégorien**, quel que soit le pays ; (3) la semaine commence le **lundi** ; (4) les **graphiques temporels restent de gauche à droite** (courbe des ressentis, timeline par décennie) ; (5) police **IBM Plex Sans Arabic**, embarquée avec le site ; lettres latines et chiffres gardent la police latine du thème.

### M2.2 Décisions complémentaires de ce dépôt (à inscrire en Q72 à Q81 par M16-07)

| # | Question | Décision proposée |
| --- | --- | --- |
| Q72 | Quelle langue | Arabe standard moderne, un seul bundle `/ar/`, sans variante par pays ni dialecte. |
| Q73 | Locale de formatage | `core/i18n` expose la locale de formatage du bundle : `ar-u-ca-gregory-hc-h23-nu-latn` en arabe (chiffres latins, calendrier grégorien, heures sur 24 h ; la balise `ar-u-nu-latn-ca-gregory` d'origine rendait « 2:03 م », corrigée par M16-08), `LOCALE_ID` sinon. Aucun `Intl.*`, aucune bibliothèque (FullCalendar, sélecteur de date, ECharts) ne reçoit `LOCALE_ID` directement. Le premier jour de la semaine est fixé à lundi partout où une bibliothèque le lit dans la locale. |
| Q74 | Sens de lecture | Le build pose `dir="rtl"` sur `<html>` pour `/ar/` (comportement d'`@angular/build`, lu dans le code de l'outil). Les styles n'emploient que des propriétés logiques (`margin-inline-start`, `inset-inline-end`, `text-align: start`). Une règle ESLint `psymate/no-physical-direction` l'impose, zone par zone, puis partout. |
| Q75 | Ce qui se retourne | Toute la mise en page. Le graphe des liens se lit vers la gauche en arabe. L'agenda suit le sens RTL de FullCalendar. Les icônes de direction (flèches, chevrons de navigation) sont retournées ; les autres non. Les deux graphiques temporels ne se retournent pas (Q71) : leur conteneur est en `dir="ltr"`. |
| Q76 | Police, mise en œuvre | Fichiers `woff2` dans `public/fonts/`, avec le texte de la licence OFL ; `@font-face` limités à l'écriture arabe par `unicode-range`, donc lettres latines et chiffres restent dans la police latine du thème (Inter) ; `--font-ui` redéfini sous `:lang(ar)`. Sous `:lang(ar)` : pas d'interlettrage (sauf dans un champ de saisie en `dir="ltr"`, dont le contenu est latin : précisé par M16-09B), pas de capitales forcées, pas d'italique. Une date qui contient un nom de mois ne s'affiche pas en `--font-mono`. |
| Q77 | Contenu saisi | Tout texte venant d'une saisie (titre, texte d'entrée, nom, étiquette, note) porte `dir="auto"`, dans les trois langues, à l'affichage comme dans le champ. Une valeur insérée dans une phrase est isolée (`<bdi>`). E-mails, mots de passe, codes et montants sont en `dir="ltr"`. |
| Q78 | Libellés de catalogue | Une seule fonction de `core/i18n` choisit le libellé : arabe s'il existe, sinon français ; anglais s'il existe, sinon français. Plus aucun booléen `english` dans les `data/*.api.ts`. |
| Q79 | Langue envoyée à l'API | Un intercepteur de `core/http` pose `Accept-Language` avec la langue du bundle, dans les trois langues. Corrigé par M16-07 : l'intercepteur existe déjà pour `fr` et `en` (`core/http/locale.interceptor.ts`, PR #103) ; il reste à l'étendre à l'arabe. |
| Q80 | Ouverture | `/ar/` est construit et testé dès le socle, mais n'apparaît dans aucun sélecteur de langue avant la dernière tâche (M16-29), qui exige le contrat `0.16.0`, zéro texte manquant et la relecture par une personne arabophone. |
| Q81 | Saisie libre et clavier | En arabe, l'analyseur de `features/capture/parser` ne propose aucune date ; les champs structurés restent. Les raccourcis se lisent sur la touche physique (`event.code`). Dans un composant horizontal, flèche droite et flèche gauche s'inversent en RTL. |

### M2.3 Décisions de psymate-api (à inscrire en Q96 à Q102, section G12, par M16-01)

Proposées à partir d'une lecture rapide de psymate-api (`main` = 4e798e7) ; M16-01 les confronte au code avant de les inscrire.

| # | Question | Décision proposée |
| --- | --- | --- |
| Q96 | Langues servies | `fr`, `en`, `ar`. La langue d'une requête se résout en un seul endroit de `shared` à partir d'`Accept-Language` ; les résolutions locales (« anglais, sinon français ») des modules disparaissent. Français par défaut. Aucun changement de comportement pour `fr` et `en`. |
| Q97 | Préférence de langue | La préférence `locale` accepte `ar`. |
| Q98 | Catalogues | Colonnes `label_ar`, et `inverse_label_ar` pour les types de lien, nulles par défaut (migration `V17`). Les vues exposent `labelAr` ; les routes d'administration l'acceptent. Repli sur le français. Les catalogues globaux reçoivent leur libellé arabe, tiré du glossaire (M16-07). |
| Q99 | Messages | `messages_ar.properties` porte toutes les clés ; un test échoue si une clé manque dans une des trois langues. |
| Q100 | E-mails | Les e-mails partent dans la langue du destinataire, en arabe de droite à gauche. |
| Q101 | Dates et nombres rendus par le serveur | Chiffres latins et calendrier grégorien en arabe, comme à l'écran (Q71). |
| Q102 | Ce qui reste en français | Résumé « En bref », exports et recherche restent tels quels quand l'arabe est demandé (second temps, M8). Le repli est écrit dans le contrat, pas subi. |

Constats utiles à ces tâches : 453 clés dans `messages_fr.properties` et `messages_en.properties` ; seize classes lisent les messages ; quatre services d'envoi d'e-mail (`AuthMailer`, `VerificationMailer`, `AdminMailer`, `ContactMailer`) ; `label_fr` dans les tables `emotion`, `entry_type`, `link_type`, `directory_vocabulary` ; l'export asynchrone est fixé en français.

## M3. Ce qui marche déjà

Constaté dans le code le 22 novembre 2026 : les dates, durées et listes passent par `Intl` avec la locale (`core/i18n/formats.ts`) ; Angular Material et le CDK suivent `dir` ; `i18nMissingTranslation` vaut `warning`, donc un texte arabe manquant s'affiche en français sans casser le build ; les specs Playwright existantes tournent sur `/fr/` et ne sont pas touchées.

## M4. Tâches, couloirs et parallélisme

### M4.1 API (`psymate-api`)

| ID | Titre | Couloir | Dépend de | Parallèle avec |
| --- | --- | --- | --- | --- |
| M16-01 | Décisions Q96 à Q102 et documentation ; copie de ce plan | docs | — | M16-07 |
| M16-02 | Langue de la requête résolue en un seul endroit ; préférence `locale` = `ar` ; dates et nombres en chiffres latins | shared + classes de messages des modules + identity (préférences), migration `V16` | M16-01 | — |
| M16-03 | Catalogues : `label_ar`, `inverse_label_ar`, vues, administration, libellés des catalogues globaux | vocabulary, directory, linking, migration `V17` | M16-02, glossaire (M16-07) | M16-04 |
| M16-04 | `messages_ar.properties` complet, test de parité des clés | ressources + test | M16-02, glossaire (M16-07) | M16-03 |
| M16-05 | E-mails en arabe, de droite à gauche | services d'envoi + templates | M16-04 | — |
| M16-06 | Seed, contrat `0.16.0`, tag, suivi | seed + contrat | M16-03, M16-05 | — |

**Vagues.** M16-A : 01. M16-B : 02. M16-C : 03 ∥ 04. M16-D : 05. M16-E : 06.

**Agents.** Claude directement pour M16-01 ; `backend-module-dev` pour M16-02 à M16-05 ; `seed-perf` pour M16-06 ; `reviewer` avant chaque fusion ; puis `make log`.

### M4.2 Web (`psymate-web`)

| ID | Titre | Couloir | Dépend de | Parallèle avec |
| --- | --- | --- | --- | --- |
| M16-07 | Ce plan sur `main` ; décisions Q72 à Q81, règles d'habillage arabe, glossaire clinique proposé | docs | — | M16-01 à M16-06 |
| M16-08 | Socle de langue : troisième langue, bundle `/ar/`, locale de formatage, choix des libellés, `Accept-Language`, raccourcis sur la touche physique | core/i18n, core/preferences, core/http, core/shortcuts, angular.json, tools/serve-dist.mjs, src/locale | M16-07 | — |
| M16-09 | Socle visuel : police, règles `:lang(ar)`, règle ESLint, composants partagés et coquille en propriétés logiques, premier e2e arabe | src/theme, public/fonts, tools/eslint, shared/ui, app.component, e2e/arabe | M16-08 | — |
| M16-10 | `auth` de droite à gauche | features/auth | M16-09 | M16-11 à M16-24, M16-26 à M16-28 |
| M16-11 | `public` de droite à gauche | features/public | M16-09 | M16-10 à M16-24, M16-26 à M16-28 |
| M16-12 | `account` de droite à gauche | features/account | M16-09 | M16-10 à M16-24, M16-26 à M16-28 |
| M16-13 | `admin` de droite à gauche | features/admin | M16-09 | M16-10 à M16-24, M16-26 à M16-28 |
| M16-14 | `patients` de droite à gauche | features/patients | M16-09 | M16-10 à M16-24, M16-26 à M16-28 |
| M16-15 | `patient-shell` de droite à gauche | features/patient-shell | M16-09 | M16-10 à M16-24, M16-26 à M16-28 |
| M16-16 | `overview` de droite à gauche, courbe des ressentis de gauche à droite | features/overview | M16-09 | M16-10 à M16-24, M16-26 à M16-28 |
| M16-17 | `timeline` de droite à gauche, vue décennie de gauche à droite | features/timeline | M16-09 | M16-10 à M16-24, M16-26 à M16-28 |
| M16-18 | `graph` de droite à gauche, graphe lu vers la gauche | features/graph | M16-09 | M16-10 à M16-24, M16-26 à M16-28 |
| M16-19 | `entries` de droite à gauche | features/entries | M16-09 | M16-10 à M16-24, M16-26 à M16-28 |
| M16-20 | `capture` de droite à gauche, aucune date détectée en arabe | features/capture | M16-09 | M16-10 à M16-24, M16-26 à M16-28 |
| M16-21 | `search` de droite à gauche | features/search | M16-09 | M16-10 à M16-24, M16-26 à M16-28 |
| M16-22 | `profile360` de droite à gauche | features/profile360 | M16-09 | M16-10 à M16-24, M16-26 à M16-28 |
| M16-23 | `agenda` de droite à gauche, calendrier en arabe | features/agenda | M16-09 | M16-10 à M16-24, M16-26 à M16-28 |
| M16-24 | `billing` de droite à gauche | features/billing | M16-09, M15-20 fusionnée | M16-10 à M16-23, M16-26 à M16-28 |
| M16-25 | Contrat `0.16.0` : `locale` = `ar`, `labelAr` dans les modèles, libellé arabe dans l'administration | api généré + data/*.api.ts + core/preferences + features/admin | M16-06, M16-10 à M16-23 | M16-26 à M16-28 |
| M16-26 | Traduction : pages publiques, connexion et inscription | src/locale/messages.ar.xlf | M16-08, glossaire (M16-07) | M16-10 à M16-25 |
| M16-27 | Traduction : dossier patient | src/locale/messages.ar.xlf | M16-26 | M16-10 à M16-25 |
| M16-28 | Traduction : compte, administration, agenda, socle | src/locale/messages.ar.xlf | M16-27 | M16-10 à M16-25 |
| M16-29 | Ouverture : sélecteurs de langue, parcours e2e arabes, règle ESLint partout, couverture | core/preferences, shared/ui/app-bar, shared/ui/public-layout, features/account, e2e/arabe, docs | M16-09 à M16-28 | — |

**Vagues.** M16-F : 07 (pendant l'API). M16-G : 08, puis 09. M16-H : 10 à 24 en parallèle, un agent par feature (H 2.7), et 26 → 27 → 28 dans le couloir de la traduction. M16-I : 25. M16-J : 29.

**Taille des tâches de feature** (déclarations de style physiques à convertir, comptées sur `main` le 23 novembre 2026) : `timeline` 34, `graph` 27, `shared` 26, `account` 25, `agenda` 15, `public` 14, `patients` 11, `auth` 10, `admin` 10, `capture` 9, `overview` 6, `entries` 6, `patient-shell` 5, `search` 3, `profile360` 3.

**Base de travail** (23 novembre 2026). Le jalon se construit sur `main` et le design d'origine (Nordique, police latine Inter). Les constats chiffrés des prompts de feature ont été mesurés le 22 novembre sur une autre base, avant la livraison de M14 : chaque tâche recompte sur sa base (`main` porte 3 266 textes le 23 novembre, pas 3 021). La maquette `docs/design/arabe/polices.html` a été dessinée avec d'autres tokens : elle vaut pour le choix de la police arabe, pas pour les couleurs ni la police latine.

**Chevauchements à surveiller.** M14 est livré ; M15 n'est pas lancé. Chaque tâche de feature ajoute sa ligne à la liste des zones converties d'`eslint.config.mjs` : conflit d'une ligne au rebase, sans gravité. Les tâches de traduction touchent un seul fichier et se suivent.

**Agents.** Claude directement pour M16-07 ; `frontend-feature-dev` pour les autres ; `reviewer` avant chaque fusion ; puis `pnpm progress:log`.

**e2e.** L'API tourne avec le seed `small`. Les specs arabes ouvrent `/ar/`, vérifient `dir="rtl"`, l'absence de défilement horizontal, axe-core, et produisent une capture.

### M4.3 Règles communes aux tâches API

1. **Lecture.** `CLAUDE.md`, puis ce plan : `../psymate-web/docs/M-plan-version-arabe.md` tant que `docs/M-plan-version-arabe-api.md` n'est pas sur `main`, ensuite la copie de l'API. Le chemin `../psymate-web` part de la racine du dépôt principal ; depuis un worktree, c'est `$(git rev-parse --git-common-dir)/../../psymate-web/docs/M-plan-version-arabe.md`. G l'emporte sur M, M sur C.
2. **Version du contrat.** Une tâche qui change `contract/openapi.yaml` regarde si le tag `contract-v<version courante>` existe (`git fetch --tags && git tag -l "contract-v$(version)"`). S'il existe (cas de `0.15.0`), elle passe à la mineure suivante (`0.16.0`) dans la même PR. S'il n'existe pas, une tâche M16 précédente a déjà ouvert la version : elle ne la change pas, ses champs s'ajoutent à la version en cours. M16-06 pose le tag `contract-v0.16.0`.
3. **Un seul `verify` à la fois sur le poste** (CLAUDE.md). Avant `./mvnw verify` ou `bash tools/verify-fast.sh`, prendre le verrou partagé des worktrees : `LOCK="$(git rev-parse --git-common-dir)/verify.lock"; until mkdir "$LOCK" 2>/dev/null; do sleep 30; done`, et le rendre à la fin, succès ou échec : `rmdir "$LOCK"`. Un verrou vieux de plus de 45 minutes est considéré comme abandonné et peut être retiré. Un test isolé (`./mvnw test -Dtest=…`) n'a pas besoin du verrou.
4. **Début et fin de tâche.** Branche neuve depuis `origin/main` à jour. Au début : `make log TASK=<ID> AGENT=<agent> STATUS=in-progress SUMMARY="…"`. À la fin : `./mvnw verify` vert, sous-agent `reviewer`, corrections des points bloquants, PR avec le template, `make log … STATUS=done … PR=<url>`, événements commités. La fusion suit M4.5.
5. **Jamais** : un nom de patient ou une adresse e-mail dans un journal ; une dépendance Maven non annoncée ; un appel externe ; un fichier hors du couloir de la tâche.

S'y ajoutent, pour M16 :

1. **Rien ne change pour le français et l'anglais.** Une réponse demandée en `fr` ou en `en` est identique avant et après la tâche ; les tests existants restent verts sans être modifiés.
2. **Aucun terme métier arabe hors glossaire.** Le glossaire est `../psymate-web/docs/design/arabe-glossaire.md` ; ses termes sont proposés par M16-07 et relus par une personne arabophone avant l'ouverture. Un terme manquant est signalé dans la PR, jamais inventé.
3. **Registre.** Arabe standard moderne ; formes sans accord de genre pour le praticien et pour la personne suivie ; « PsyMate », codes d'erreur, noms de champs et adresses restent en caractères latins.

### M4.4 Règles communes aux tâches web de feature (M16-10 à M16-24)

Chaque prompt de feature renvoie ici. Dans la feature seulement :

1. **Regarder d'abord.** Lancer l'application en `/ar/` et parcourir chaque écran de la feature avant de toucher au code ; noter ce qui se chevauche, se coupe ou part du mauvais côté.
2. **Styles.** Propriétés logiques seulement : `margin-inline-*`, `padding-inline-*`, `border-inline-*`, `inset-inline-*`, `text-align: start` ou `end`, rayons logiques. La feature rejoint la liste des zones converties d'`eslint.config.mjs` (une ligne) et la règle `psymate/no-physical-direction` y passe.
3. **Typographie.** Rien à faire composant par composant si les règles `:lang(ar)` du socle suffisent ; sinon signaler le manque dans la PR plutôt que de modifier `src/theme`. Une date ou un texte qui contient des lettres ne s'affiche pas en `--font-mono`.
4. **Contenu saisi.** `dir="auto"` sur chaque affichage de texte saisi et sur chaque champ de texte libre ; `<bdi>` pour une valeur insérée dans une phrase ; `dir="ltr"` pour e-mails, mots de passe, codes, montants, URL.
5. **Formats.** Tout `Intl.*`, tout `toLocaleUpperCase` ou `toLocaleLowerCase` et toute bibliothèque reçoit la locale de formatage de `core/i18n`, jamais `LOCALE_ID`. Une mise en capitale de la première lettre ne s'applique pas à un texte arabe.
6. **Libellés de catalogue.** La fonction de `core/i18n` remplace le booléen `english` et tout choix local entre `labelFr` et `labelEn`.
7. **Clavier.** Flèche droite et flèche gauche inversées en RTL dans les composants horizontaux ; haut et bas inchangés.
8. **Icônes.** Seules les icônes de direction sont retournées en RTL.
9. **Phrases.** Une phrase assemblée par morceaux (un nom de type ou d'émotion inséré en minuscules) devient un message entier, un par cas s'il le faut. Les textes sources changés sont listés dans la PR, pour le couloir de la traduction.
10. **e2e.** `e2e/arabe/<feature>.spec.ts` : chaque écran de la feature en `/ar/`, `dir="rtl"`, pas de défilement horizontal, axe-core sans violation, une capture par écran. Aucun libellé ciblé (rôles, structure, URL) : pendant le jalon, les textes de `/ar/` passent du français de repli à l'arabe.

Critères communs : `/fr/` et `/en/` sont identiques à l'écran avant et après (captures existantes inchangées, e2e existants verts sans les modifier) ; plus aucune propriété physique, plus aucun booléen `english`, plus aucun `LOCALE_ID` passé à `Intl` ou à une bibliothèque dans la feature ; chaque écran a sa capture arabe dans la PR, sans chevauchement ni texte coupé ; `pnpm lint`, `pnpm check:tokens`, `pnpm test`, `pnpm build` verts.

Interdits communs : toucher à une autre feature, à `core`, à `shared` ou à `src/theme` (signaler le manque dans la PR) ; traduire des textes (couloir de M16-26 à M16-28) ; ajouter une dépendance npm ; retourner un graphique temporel ; désactiver un test ou une règle.

### M4.5 Lancement (23 novembre 2026, en autonomie)

Consigne de l'utilisateur, le 23 novembre 2026 : `main` des deux dépôts mis à jour, chaque branche coupée de `main` à jour, tâches en Opus 5.5, en autonomie, fusion par l'orchestratrice dès que la PR est verte, Auto-fix activé sur chaque PR, et une vérification toutes les dix minutes des sessions, des worktrees et des PR pour passer à la tâche suivante.

1. **Une session par couloir**, modèle Opus 5.5, dans son worktree. Elle enchaîne les tâches de son couloir, une branche neuve depuis `origin/main` par tâche. Couloirs : API (M16-01 à M16-06) ; documentation et socle web (M16-07 à M16-09) ; puis une session ou un agent par feature (M16-10 à M16-24) et un couloir de traduction (M16-26 à M16-28) ; enfin M16-25 et M16-29.
2. **Fin d'une tâche** : vérifications vertes en local, sous-agent `reviewer`, PR ouverte avec le template, Auto-fix activé sur la PR, puis la session rend compte en une ligne. Elle enchaîne tout de suite si la tâche suivante ne dépend pas de la PR ouverte ; sinon elle attend le message de fusion.
3. **Fusion** : en squash, par la session orchestratrice, dès que la CI est verte et que `reviewer` n'a rien laissé de bloquant, depuis un dossier neutre (`gh pr merge <n> --squash --delete-branch --repo mrscams/<dépôt>`). L'orchestratrice relit le diff après coup et fait corriger dans la PR suivante.
4. **Vérification toutes les dix minutes** par l'orchestratrice : tâches finies, PR vertes non fusionnées, sessions ou worktrees arrêtés ou bloqués, tâche suivante à lancer.
5. **Ce qui n'attend plus l'utilisateur** : la relecture des décisions proposées (Q72 à Q81, Q96 à Q102), qui restent marquées « proposées, non relues » dans les deux G, et la validation du glossaire, dont les termes sont proposés par l'agent.
6. **Le seul arrêt qui attend l'utilisateur** : l'ouverture (M16-29). Elle exigeait la relecture du glossaire et des traductions par une personne arabophone ; tant qu'elle n'était pas faite, `/ar/` restait construit et testé, mais aucun sélecteur de langue ne le proposait. **Levé par l'utilisateur le 23 novembre 2026** : informé que personne n'avait relu le glossaire ni les traductions, il a ordonné « Lance le M16-29. ». L'ouverture se fait donc sans relecture arabophone (G Q80) ; la relecture reste à faire après coup, et ses corrections passeront par une tâche de traduction.
7. **Arrêt sur blocage réel seulement** : CI rouge non expliquée, conflit non trivial, infrastructure tombée, décision produit à prendre. L'orchestratrice le dit alors clairement.

Phrase de lancement d'une tâche (dans le dépôt de la tâche) : « Exécute la tâche M16-NN : ton prompt est le bloc M16-NN de `docs/M-plan-version-arabe.md` ; applique aussi M4.3 (API) ou M4.4 (tâches de feature), et M4.5 pour la fin de tâche. »

## M5. Prompts API

Manœuvre : dans `psymate-api`, `git checkout main && git pull && claude --worktree <ID>`, coller le prompt. À la fin : sous-agent `reviewer`, lecture humaine (migration, diff de `contract/openapi.yaml`, un IT), `gh pr merge <n> --squash --delete-branch`.

### M16-01 — Décisions et documentation

```text
Tâche M16-01 — Inscrire le jalon M16 « Version arabe » dans la documentation de psymate-api (docs/, CLAUDE.md et .claude/agents seulement ; aucun code Java, aucune migration).

Contexte : lis ../psymate-web/docs/M-plan-version-arabe.md en entier (il fait foi) et ../psymate-web/docs/Etude-traduction-arabe.md (section C), docs/G-decisions.md (format des lignes du dernier jalon, table G5), le dernier plan de jalon copié du web (modèle), docs/C-plan.md, docs/D-orchestration-backend.md, CLAUDE.md, .claude/agents/backend-module-dev.md. Puis confronte M2.3 au code : comment chaque module résout la langue d'une requête, où la préférence locale est validée, quelles tables portent label_fr, comment les e-mails choisissent leur langue, où le serveur met en forme une date ou un nombre.

Objectif :
- Nouveau fichier docs/M-plan-version-arabe-api.md : copie de M1, M2.1, M2.3, M4.1, M4.3, M5 et de la partie API de M8 et M9, avec en tête la date, le renvoi au document du web pour la partie web, la phrase « Pour toute tâche M16, ce document fait foi » et la mention exacte de ce qui est tranché par l'utilisateur (M2.1) et de ce qui est proposé par le plan (M2.3).
- G : nouvelle section pour le jalon M16 (G12 si le numéro est libre) avec Q96 à Q102, une ligne par question, même style que le jalon précédent ; une ligne dans la table G5. Si la lecture du code contredit une proposition de M2.3, écris la version corrigée et signale l'écart dans la PR.
- C : jalon M16 (objectif, démontrable) et nouvelle section avec le tableau des tâches M16-01 à M16-06, critères repris de M5.
- D : lignes, vagues et couloirs de M4.1.
- CLAUDE.md et .claude/agents/backend-module-dev.md : une ligne de renvoi vers ce plan pour toute tâche M16, avec les trois règles ajoutées de M4.3.

Périmètre : docs/**, CLAUDE.md, .claude/agents/backend-module-dev.md. Rien d'autre.

Critères d'acceptation :
- Q96 à Q102 existent, avec la mention exacte de qui a tranché quoi ;
- chaque tâche M16-01 à M16-06 a sa ligne dans C et D avec les dépendances de M4.1 ;
- la PR liste les écarts constatés entre M2.3 et le code, ou dit qu'il n'y en a pas ;
- aucune source Java, aucune migration, aucun contrat modifié.

Interdits : toute modification de code, de migration ou de contrat ; réécrire docs/progress/index.html ou un événement existant ; inscrire une décision que M ne contient pas ; écrire qu'une décision de M2.3 a été « tranchée par l'utilisateur ».

Livrable : PR « M16-01 Version arabe : décisions et documentation », puis make log TASK=M16-01 AGENT=claude STATUS=done SUMMARY="…" PR=<url>. Les décisions Q96 à Q102 sont inscrites avec la mention « proposée par le plan M, non relue par l'utilisateur au 23 novembre 2026 ». Fusion : M4.5.
```

### M16-02 — Langue de la requête

```text
Tâche M16-02 — Résoudre la langue d'une requête en un seul endroit et accepter l'arabe (psymate-api). Utilise l'agent backend-module-dev.

Contexte : lis CLAUDE.md, docs/M-plan-version-arabe-api.md (M2.3 Q96, Q97, Q101, M4.3). Repère toutes les résolutions locales de la langue (recherche de Locale.FRENCH, Locale.ENGLISH, "en".equals, request.getLocale) : classes de messages des modules (AgendaMessages, ClinicalMessages et leurs semblables), assembleurs de liens, services d'envoi d'e-mail, export. Repère où la préférence locale est validée.

Objectif :
- Un seul composant de shared rend la langue servie (fr, en, ar) à partir d'Accept-Language, français par défaut ou si la langue demandée n'est pas servie ; chaque module l'emploie à la place de sa propre règle.
- La préférence locale accepte ar ; le contrat le dit (énumération fr, en, ar).
- Les dates et nombres que le serveur met en forme en arabe sont en chiffres latins et en calendrier grégorien.
- Tant que messages_ar.properties n'existe pas (M16-04), une requête en arabe reçoit les messages français, sans erreur.

Périmètre : shared, les classes de messages et de résolution de langue des modules, la validation des préférences dans identity, contract/openapi.yaml (énumération de locale seulement), tests.

Critères d'acceptation :
- les réponses pour fr et en sont identiques avant et après : tests existants verts sans les modifier ;
- un test par module prouve qu'une requête avec Accept-Language: ar ne provoque aucune erreur et reçoit le repli français ;
- la préférence locale = ar est acceptée, toute autre valeur est refusée comme avant ;
- plus aucune résolution locale de la langue hors de shared : test d'architecture, ou la recherche et son résultat cités dans la PR ;
- un test prouve qu'une date mise en forme en arabe ne contient aucun chiffre arabo-indien.

Interdits : traduire quoi que ce soit ; changer un message existant ; dépendance Maven ; toucher aux exports, au résumé « En bref » ou à la recherche au-delà du remplacement de la résolution de langue.

Livrable : PR « M16-02 Langue de la requête : fr, en, ar », puis make log TASK=M16-02 AGENT=backend-module-dev STATUS=review SUMMARY="…" PR=<url>.
```

### M16-03 — Catalogues

```text
Tâche M16-03 — Donner un libellé arabe aux catalogues (psymate-api). Utilise l'agent backend-module-dev. Dépend de M16-02 et du glossaire (M16-07 fusionnée dans psymate-web).

Contexte : lis CLAUDE.md, docs/M-plan-version-arabe-api.md (Q98, M4.3), ../psymate-web/docs/design/arabe-glossaire.md (emploie ses termes tels quels : ils sont proposés et seront relus par une personne arabophone avant l'ouverture), les migrations qui créent label_fr et label_en (V01, V02, V04), les vues et les routes d'administration des catalogues (émotions, types d'entrée, types de lien, vocabulaire de l'annuaire), docs/E-modele-donnees.md.

Objectif :
- Migration V17 (V16 est prise par M16-02 ; sinon le numéro libre suivant) : label_ar nul par défaut sur chaque catalogue qui porte label_fr, inverse_label_ar sur les types de lien ; les lignes des catalogues globaux reçoivent leur libellé arabe du glossaire.
- Les vues exposent labelAr (et inverseLabelAr) ; les routes d'administration l'acceptent, avec les mêmes règles que labelEn (vide = effacé, longueur maximale identique).
- Le verbe d'un lien rendu selon la langue suit la règle de repli : arabe, sinon français.
- Les émotions et étiquettes créées par un praticien ne changent pas : un seul libellé, celui qu'il a saisi.
- E reçoit les colonnes et la ligne de la migration.

Périmètre : vocabulary, directory, linking (ou le module qui porte les types de lien), db/migration, contract/openapi.yaml, docs/E-modele-donnees.md, tests.

Critères d'acceptation :
- la migration passe sur une base vide et sur une base au seed small ;
- un catalogue sans libellé arabe rend le français quand l'arabe est demandé ; avec un libellé arabe, il le rend ;
- les réponses pour fr et en sont inchangées, hormis les champs ajoutés ;
- le diff du contrat se limite aux champs labelAr et inverseLabelAr ;
- la PR liste les lignes de catalogue restées sans libellé arabe, faute de terme au glossaire.

Interdits : rendre label_ar obligatoire ; modifier une migration existante ; inventer une traduction hors glossaire ; dépendance Maven.

Livrable : PR « M16-03 Catalogues : libellés arabes », puis make log TASK=M16-03 AGENT=backend-module-dev STATUS=review SUMMARY="…" PR=<url>.
```

### M16-04 — Messages en arabe

```text
Tâche M16-04 — messages_ar.properties (psymate-api). Utilise l'agent backend-module-dev. Dépend de M16-02 et du glossaire (M16-07 fusionnée dans psymate-web).

Contexte : lis CLAUDE.md, docs/M-plan-version-arabe-api.md (Q99, M4.3), ../psymate-web/docs/design/arabe-glossaire.md (termes et règles de registre), src/main/resources/messages_fr.properties (source) et messages_en.properties (pour lever une ambiguïté), et quelques appelants pour comprendre ce que portent les paramètres {0}, {1}.

Objectif :
- messages_ar.properties porte toutes les clés de messages_fr.properties, en arabe standard moderne, dans l'encodage qu'emploient déjà les deux autres fichiers.
- Registre de l'interface web : phrases courtes, formes sans accord de genre pour le praticien et pour la personne suivie, pas d'impératif genré.
- Les paramètres gardent leur sens et leur ordre logique ; un message qui dépend d'un nombre reste juste pour un, deux, quelques et beaucoup (reformule pour éviter l'accord quand c'est possible).
- Un test échoue si une clé manque ou est en trop dans une des trois langues.

Périmètre : src/main/resources/messages_ar.properties, un test de parité, la configuration de la source de messages si elle liste les langues.

Critères d'acceptation :
- le test de parité est vert, et échoue si on retire une clé d'un des trois fichiers (montre-le dans la PR) ;
- une erreur de validation demandée avec Accept-Language: ar revient en arabe (un IT) ;
- aucun message fr ou en modifié ;
- la PR liste les messages dont la traduction est incertaine, pour le relecteur arabophone.

Interdits : traduire un code d'erreur, un nom de champ, « PsyMate » ; employer un terme métier absent du glossaire ; dépendance Maven.

Livrable : PR « M16-04 Messages en arabe », puis make log TASK=M16-04 AGENT=backend-module-dev STATUS=review SUMMARY="…" PR=<url>.
```

### M16-05 — E-mails en arabe

```text
Tâche M16-05 — E-mails en arabe, de droite à gauche (psymate-api). Utilise l'agent backend-module-dev. Dépend de M16-04.

Contexte : lis CLAUDE.md, docs/M-plan-version-arabe-api.md (Q100, M4.3), les services d'envoi (AuthMailer, VerificationMailer, AdminMailer, ContactMailer et tout autre apparu depuis, par exemple pour la prise de rendez-vous), leurs modèles dans src/main/resources/templates, et comment chacun choisit la langue du destinataire (préférence du praticien, langue de la requête du visiteur).

Objectif :
- Chaque e-mail existe en arabe : objet, corps HTML, corps en texte brut.
- Le HTML arabe porte lang="ar" et dir="rtl" ; les liens, adresses, codes et dates chiffrées sont isolés du sens du texte, pour ne pas s'afficher à l'envers.
- Un e-mail au praticien suit sa préférence locale ; un e-mail à un visiteur suit la langue de sa requête ; français par défaut.
- Les dates et nombres des e-mails arabes sont en chiffres latins et en calendrier grégorien.

Périmètre : les services d'envoi, leurs modèles, messages_*.properties pour les clés d'e-mail, tests.

Critères d'acceptation :
- un test par e-mail vérifie, pour l'arabe, la langue du texte, lang et dir ;
- les e-mails fr et en sont identiques avant et après (tests existants verts sans les modifier) ;
- un e-mail arabe ouvert dans Mailpit s'affiche de droite à gauche, lien cliquable (capture dans la PR).

Interdits : journaliser une adresse ou un contenu d'e-mail ; changer le texte d'un e-mail fr ou en ; dépendance Maven.

Livrable : PR « M16-05 E-mails en arabe », puis make log TASK=M16-05 AGENT=backend-module-dev STATUS=review SUMMARY="…" PR=<url>.
```

### M16-06 — Seed, contrat, suivi

```text
Tâche M16-06 — Clore la partie API du jalon M16 (psymate-api). Utilise l'agent seed-perf. Dépend de M16-03 et M16-05.

Contexte : lis CLAUDE.md, docs/M-plan-version-arabe-api.md, M4.3 point 2 (règle de version du contrat), le seed existant et la tâche de clôture du jalon précédent (modèle).

Objectif :
- Le seed, par l'API seulement, donne à un praticien de démonstration la préférence locale = ar et, dans un de ses dossiers, quelques entrées dont le titre et le texte sont en arabe, plus une entrée qui mêle arabe et français ; rien n'est retiré du seed existant.
- La version du contrat suit la règle de M4.3 point 2 ; le tag contract-v0.16.0 est posé ; docs/api-reference est régénéré si le dépôt le fait.
- Le suivi est à jour.

Critères d'acceptation :
- make seed SIZE=small puis une seconde fois ne change rien ;
- le tag de contrat existe et porte locale = ar, labelAr et inverseLabelAr ;
- le praticien de démonstration en arabe reçoit ses catalogues en arabe (un IT ou une requête citée dans la PR) ;
- ./mvnw verify vert.

Interdits : écrire dans la base hors de l'API ; poser un tag qui existe déjà.

Livrable : PR « M16-06 Version arabe : seed et contrat », puis make log TASK=M16-06 AGENT=seed-perf STATUS=review SUMMARY="…" PR=<url>.
```

## M6. Prompts web

Manœuvre (H 2.7) : dans `psymate-web`, `git checkout main && git pull && claude --worktree <ID>`, coller le prompt. À la fin : `Lance le sous-agent reviewer sur cette branche et corrige ce qu'il marque bloquant.`, lecture humaine, comparaison des captures arabes à l'écran français, `gh pr merge <n> --squash --delete-branch`.

### M16-07 — Décisions, règles d'habillage, glossaire

```text
Tâche M16-07 — Inscrire la version arabe dans la documentation de psymate-web et écrire le glossaire clinique (docs/ et CLAUDE.md seulement ; aucun code). Ta branche part d'un commit qui porte déjà ce plan, l'étude, la maquette des polices, G14 (Q71) et C14 : ta PR les amène sur main avec ton travail.

Contexte : lis CLAUDE.md, docs/M-plan-version-arabe.md en entier, docs/Etude-traduction-arabe.md, docs/design/arabe/polices.html, docs/G-decisions.md (G14 et Q71 déjà inscrites par le premier commit de ta branche, format des dernières sections), docs/C-plan.md (C14 déjà ouverte, format du tableau à huit colonnes de C12), docs/Etude-couleurs-Nordique.md (modèle d'un document d'habillage), docs/design/README.md, docs/couverture-ecrans.md, docs/e2e-couverture.md, src/locale/messages.fr.xlf.

Objectif :
- G : la section G14 reçoit Q72 à Q81, copiées de M2.2, chacune marquée « proposée par le plan M, non relue par l'utilisateur au 23 novembre 2026 » ; Q23 reçoit un renvoi vers G14.
- C : la section C14 reçoit le tableau à huit colonnes des tâches web M16-07 à M16-29, au format de C12, critères repris de M6.
- docs/design/arabe.md : règles d'habillage (propriétés logiques, ce qui se retourne et ce qui ne se retourne pas, police et graisses, règles :lang(ar), dir="auto" et <bdi>, clavier, icônes), avec renvoi à polices.html et une table « physique → logique » des propriétés.
- docs/design/arabe-glossaire.md : chaque terme métier de l'interface (désignation de la personne suivie, types d'entrée, familles d'émotions et émotions du catalogue, types de lien et leur inverse, statuts, sections du dossier, noms des écrans, vocabulaire de l'annuaire) avec le terme français, le terme anglais, une proposition en arabe standard moderne, une variante quand l'usage hésite, et une colonne « relu par » vide (la relecture par une personne arabophone a lieu avant l'ouverture ; les tâches de traduction emploient les propositions sans l'attendre). Plus les règles de registre : boutons au nom verbal, pas d'impératif genré, tournures sans accord pour le praticien et la personne suivie, six formes de pluriel.
- CLAUDE.md : une ligne « Version arabe : docs/M-plan-version-arabe.md ; propriétés logiques seulement, dir="auto" sur tout contenu saisi, locale de formatage de core/i18n, jamais LOCALE_ID dans Intl ». docs/README.md ajoute M, l'étude, design/arabe.md et le glossaire.

Périmètre : docs/**, CLAUDE.md.

Critères d'acceptation :
- Q72 à Q81 existent, avec la mention exacte de qui a tranché quoi (seule Q71 est tranchée par l'utilisateur) ;
- chaque tâche M16-07 à M16-29 a sa ligne dans C14 avec les dépendances de M4.2 ;
- le glossaire couvre tous les termes métier présents dans messages.fr.xlf et ne marque aucun terme comme relu ;
- aucun code modifié.

Interdits : écrire qu'une proposition de M2.2 a été tranchée par l'utilisateur ; marquer un terme du glossaire comme relu ; éditer docs/progress/index.html ou un événement existant ; toucher au code.

Livrable : PR « M16-07 Version arabe : décisions et glossaire », puis pnpm progress:log --task M16-07 --agent claude --status done --summary "…" --pr <url>. Fusion : M4.5.
```

### M16-08 — Socle de langue

```text
Tâche M16-08 — Faire de l'arabe la troisième langue du socle (dépôt psymate-web). Utilise l'agent frontend-feature-dev. C'est la tâche dédiée qui a le droit de modifier core/i18n, core/preferences, core/http et core/shortcuts.

Contexte : lis CLAUDE.md, docs/M-plan-version-arabe.md (M2.2 Q73, Q78, Q79, Q80, Q81), docs/design/arabe.md. Code : src/app/core/i18n/{locales,formats,index}.ts et leurs specs, core/preferences/{locale-navigator,preferences.store}.ts, core/http (intercepteurs et leur ordre), core/shortcuts/shortcuts.service.ts, angular.json (i18n, configurations fr et en), tools/serve-dist.mjs, playwright.config.ts, .github/workflows/ci.yml, les appelants d'otherLocale (app.component.ts, shared/ui/app-bar).

Objectif :
- core/i18n : APP_LOCALES = fr, en, ar ; toAppLocale reconnaît l'arabe ; otherLocale disparaît au profit de la liste ; localeSwitchHref accepte les trois. Trois fonctions nouvelles : la locale de formatage (ar-u-ca-gregory-hc-h23-nu-latn en arabe, la locale du bundle sinon), le sens (rtl en arabe), le choix d'un libellé de catalogue sur un objet { labelFr, labelEn?, labelAr? } (arabe, sinon français ; anglais, sinon français).
- formats.ts : chaque fonction passe par la locale de formatage.
- angular.json : locale ar (src/locale/messages.ar.xlf, sous-chemin ar), configurations de service et de build comme pour en ; messages.ar.xlf créé, sans traduction. Si les avertissements de texte manquant noient la sortie du build, propose une solution dans la PR, sans changer le réglage global à l'aveugle.
- core/http : l'intercepteur existant (locale.interceptor.ts, PR #103) pose Accept-Language avec la langue du bundle, dans les trois langues.
- core/shortcuts : les raccourcis se lisent sur la touche physique ; ils marchent quand event.key rend une lettre arabe.
- core/preferences : LocaleNavigator accepte ar. Aucun sélecteur ne propose encore l'arabe (Q80).
- tools/serve-dist.mjs sert /ar/ ; la CI construit les trois bundles.

Périmètre : src/app/core/{i18n,preferences,http,shortcuts}/**, angular.json, src/locale/messages.ar.xlf, tools/serve-dist.mjs, playwright.config.ts, .github/workflows/ci.yml ; app.component.ts et shared/ui/app-bar pour le seul remplacement d'otherLocale, sans changement visible.

Critères d'acceptation :
- /ar/ s'ouvre ; dans le fichier construit, <html> porte lang="ar" et dir="rtl" ; /fr/ et /en/ sont inchangés à l'écran ;
- un test prouve qu'aucune sortie de formats.ts en arabe ne contient de chiffre arabo-indien et que l'année est grégorienne ;
- une requête depuis /ar/ porte Accept-Language: ar, depuis /fr/ fr, depuis /en/ en (test de l'intercepteur) ;
- un raccourci existant se déclenche avec un événement dont key est une lettre arabe et code la touche attendue (test) ;
- les specs de core/i18n couvrent les trois langues ; les tests existants restent verts sans être modifiés, sauf ceux d'otherLocale ;
- pnpm lint, check:tokens, test, build verts ; e2e existants verts.

Interdits : proposer l'arabe dans un sélecteur ; toucher à une feature ; convertir des styles ; dépendance npm.

Livrable : PR « M16-08 Version arabe : socle de langue », puis pnpm progress:log --task M16-08 --agent frontend-feature-dev --status done --summary "…" --pr <url>.
```

### M16-09 — Socle visuel

```text
Tâche M16-09 — Police arabe, règles :lang(ar), règle ESLint et composants partagés de droite à gauche (dépôt psymate-web). Utilise l'agent frontend-feature-dev. C'est la tâche dédiée qui a le droit de modifier shared/ui, src/theme et tools/eslint.

Contexte : lis CLAUDE.md, docs/M-plan-version-arabe.md (Q74 à Q77, M4.4), docs/design/arabe.md, docs/design/arabe/polices.html (rendu retenu : ouvre-le), docs/design/00-composants-partages.md, docs/Etude-couleurs-Nordique.md. Code : src/theme/{tokens.css,material.scss}, src/styles.scss, src/app/shared/ui/** (25 déclarations physiques : patient-header 5, nav-rail 5, state 3, app-bar 3, public-header 2…), src/app/app.component.{ts,html,scss} (3), tools/eslint/psymate-plugin.mjs et ses fixtures (modèle : no-hardcoded-color), tools/eslint/check-fixtures.mjs, eslint.config.mjs, tools/check-tokens.mjs.

Objectif :
- Police : fichiers woff2 d'IBM Plex Sans Arabic dans public/fonts/ibm-plex-sans-arabic/, avec le texte de la licence OFL ; seulement les graisses que l'interface emploie (relève-les dans tokens.css et material.scss) ; @font-face limités à l'écriture arabe par unicode-range ; --font-ui redéfini sous :lang(ar), la police latine du thème (celle de --font-ui aujourd'hui) restant celle des lettres latines et des chiffres. La PR dit d'où viennent les fichiers et leur version.
- Sous :lang(ar) : pas d'interlettrage, pas de capitales forcées, pas d'italique, par des règles de src/theme plutôt que composant par composant ; interligne du texte courant à vérifier contre polices.html (section 3).
- Règle ESLint psymate/no-physical-direction, sur les styles et les gabarits (margin, padding, border -left et -right ; left: et right: ; text-align et float left et right ; rayons physiques), avec ses fixtures ; active sur une liste de zones converties, une par ligne, qui commence par shared, src/theme et app.component.
- shared/ui, app.component, styles.scss, material.scss : propriétés logiques seulement ; icônes de direction retournées en RTL ; contenu saisi en dir="auto" (en-tête patient, toasts, bandeaux, dialogue de confirmation) ; flèches du clavier inversées en RTL dans les composants horizontaux ; le rail de navigation et le panneau latéral passent du bon côté.
- e2e/arabe/socle.spec.ts : coquille praticien, coquille publique, barre d'administration, panneau latéral, dialogue de confirmation, planche d'états en /ar/ ; dir="rtl", pas de défilement horizontal, axe-core, captures en clair et en sombre. Aucun libellé ciblé.

Périmètre : src/theme/**, src/styles.scss, public/fonts/**, tools/eslint/**, eslint.config.mjs, src/app/shared/ui/**, src/app/app.component.*, e2e/arabe/.

Critères d'acceptation :
- /fr/ et /en/ sont identiques à l'écran avant et après (captures existantes inchangées) ;
- en /ar/, la police rendue est IBM Plex Sans Arabic pour l'arabe et la police latine du thème pour le latin (vérifié dans le navigateur) ; aucun fichier de police n'est téléchargé en /fr/ sur un écran sans texte arabe (onglet réseau, cité dans la PR) ;
- la règle échoue sur ses fixtures et passe sur les zones listées ; pnpm lint vert ;
- pnpm check:tokens, test, build verts ; e2e/arabe/socle vert ; e2e existants verts.

Interdits : charger une police depuis un tiers ; convertir une feature ; changer une couleur ou la valeur d'un token existant ; dépendance npm d'exécution.

Livrable : PR « M16-09 Version arabe : socle visuel », avec les captures arabes, puis pnpm progress:log --task M16-09 --agent frontend-feature-dev --status done --summary "…" --pr <url>.
```

### M16-10 — `auth` de droite à gauche

```text
Tâche M16-10 — features/auth de droite à gauche (dépôt psymate-web). Utilise l'agent frontend-feature-dev. Dépend de M16-09.

Contexte : lis CLAUDE.md, docs/M-plan-version-arabe.md (M2 et M4.4, que tu appliques en entier), docs/design/arabe.md, les fiches 11 (connexion), 12 (inscription), 25 (confirmation d'e-mail), 26 (mot de passe oublié), 27 (compte suspendu).

Constat du 22 novembre 2026 : 10 déclarations physiques (pages/login.page.scss 5, suspended.page.scss 2, confirm-email, first-login, new-password 1 chacune) ; 16 interlettrages et 4 capitales forcées ; 11 emplois de --font-mono ; 29 champs de saisie ; aucun booléen english, aucun Intl direct.

Particularités :
- Pages à deux panneaux (connexion, inscription) : le panneau de marque et le panneau de formulaire échangent leur côté.
- Champs e-mail, mot de passe, code de double authentification, code de récupération, jeton : dir="ltr", alignés du côté de début de la page.
- Nom et prénom saisis : dir="auto".
- Compte à rebours et délais (Retry-After) : par core/i18n, chiffres latins.

Critères propres : chaque page de la feature a sa capture arabe (connexion, double authentification, inscription, confirmation en attente et lien expiré, mot de passe oublié et nouveau mot de passe, première connexion, compte suspendu) ; un code saisi s'affiche dans l'ordre de frappe.

Périmètre : src/app/features/auth/**, e2e/arabe/auth.spec.ts, la ligne de la feature dans eslint.config.mjs.

Livrable : PR « M16-10 Version arabe : auth », puis pnpm progress:log --task M16-10 --agent frontend-feature-dev --status done --summary "…" --pr <url>.
```

### M16-11 — `public` de droite à gauche

```text
Tâche M16-11 — features/public de droite à gauche (dépôt psymate-web). Utilise l'agent frontend-feature-dev. Dépend de M16-09. Vérifie qu'aucune tâche M14 n'est ouverte dans features/public ; sinon arrête-toi et rends compte.

Contexte : lis CLAUDE.md, docs/M-plan-version-arabe.md (M2 et M4.4, que tu appliques en entier), docs/design/arabe.md, les fiches 08 (annuaire), 09 (fiche publique d'un praticien), 24 (comment ça marche), et les pages de prise de rendez-vous si M14 les a livrées.

Constat du 22 novembre 2026 : 11 déclarations physiques (pages/how-it-works.page.scss 3, ui/contact-form.component.scss 3, pages/info-page.scss 2, ui/practitioner-card.component.scss 2, pages/practitioner.page.scss 1) ; 5 interlettrages, 3 capitales forcées, 1 italique ; Intl et choix de libellé dans ui/labels.ts (itemLabel, Intl.DisplayNames), ui/practitioner-card.component.ts, pages/practitioner.page.ts ; deux composants ont une entrée locale = input<AppLocale>('fr').

Particularités :
- ui/labels.ts : itemLabel passe par la fonction de core/i18n ; les noms de langues de consultation viennent d'Intl.DisplayNames avec la locale de formatage, sans mise en capitale en arabe.
- Fiche praticien et carte : nom, titre, présentation, adresse sont du contenu saisi (dir="auto") ; téléphone, e-mail et site en dir="ltr".
- Formulaire de contact : champs de texte libre en dir="auto".
- La feature ne lit que core/http et core/i18n (règle ESLint existante) : rien d'autre.

Critères propres : annuaire (résultats, filtres ouverts, aucun résultat), fiche praticien, formulaire de contact, « comment ça marche » et pages d'information ont leur capture arabe, en largeur de bureau et de téléphone.

Périmètre : src/app/features/public/**, e2e/arabe/public.spec.ts, la ligne de la feature dans eslint.config.mjs.

Livrable : PR « M16-11 Version arabe : public », puis pnpm progress:log --task M16-11 --agent frontend-feature-dev --status done --summary "…" --pr <url>.
```

### M16-12 — `account` de droite à gauche

```text
Tâche M16-12 — features/account de droite à gauche (dépôt psymate-web). Utilise l'agent frontend-feature-dev. Dépend de M16-09.

Contexte : lis CLAUDE.md, docs/M-plan-version-arabe.md (M2 et M4.4, que tu appliques en entier), docs/design/arabe.md, les fiches 10 (mon profil public), 13 (dossier professionnel), 14 (préférences), 17 (émotions personnalisées), 18 (compte et sécurité), 19 (données et export).

Constat du 22 novembre 2026 : la plus grosse feature (90 fichiers). 23 déclarations physiques dans 12 fichiers (ui/vocabulary/vocabulary.scss 4, pages/security.page.scss 3, pages/data-export.page.scss 2, ui/data-export/patient-combobox 2, ui/preferences/segmented-control 2, ui/profile/chip-picker 2…) ; 12 interlettrages, 7 capitales forcées ; 20 emplois de --font-mono ; 36 champs de saisie ; Intl direct dans ui/document-labels.ts, ui/relative-time.ts et ui/vocabulary/* (dont toLocaleLowerCase('fr') dans vocabulary-labels.ts et un tri sur labelFr dans global-vocabulary.component.ts).

Particularités :
- Sélecteur segmenté et sélecteur de thème : ordre des segments suivi par le sens, flèches du clavier inversées en RTL.
- Sécurité : QR, secret, codes de récupération, adresse e-mail en dir="ltr" ; les codes gardent --font-mono (ils n'ont pas de lettres arabes).
- Dates des documents, des exports et des sessions : si elles contiennent un nom de mois, elles quittent --font-mono (M4.4 point 3).
- Aperçu du profil public et éditeur de photo : la présentation est du contenu saisi (dir="auto").
- Vocabulaire : étiquettes et émotions du praticien en dir="auto" ; le tri et la mise en minuscules passent par la locale de formatage.
- N'ajoute pas l'arabe au choix de langue des préférences (Q80, tâche M16-29).

Critères propres : profil, dossier professionnel, préférences, vocabulaire (étiquettes, émotions, journal des fusions), sécurité, données et export ont leur capture arabe ; un code de récupération s'affiche dans l'ordre.

Périmètre : src/app/features/account/**, e2e/arabe/account.spec.ts, la ligne de la feature dans eslint.config.mjs.

Livrable : PR « M16-12 Version arabe : account », puis pnpm progress:log --task M16-12 --agent frontend-feature-dev --status done --summary "…" --pr <url>.
```

### M16-13 — `admin` de droite à gauche

```text
Tâche M16-13 — features/admin de droite à gauche (dépôt psymate-web). Utilise l'agent frontend-feature-dev. Dépend de M16-09.

Contexte : lis CLAUDE.md, docs/M-plan-version-arabe.md (M2 et M4.4, que tu appliques en entier), docs/design/arabe.md, les fiches 20 (validation des praticiens), 21 (praticiens), 22 (journal), 28 (vocabulaire de l'annuaire), et la barre d'administration dans la fiche 00.

Constat du 22 novembre 2026 : 10 déclarations physiques (pages/vocabulary.page.scss 3, pages/practitioners.page.scss 2, ui/appeal-list.component.ts 2, pages/journal.page.scss, ui/decision-form.component.scss, ui/_admin.scss 1 chacune) ; flèches gauche et droite en dur dans pages/vocabulary.page.ts (onglets) ; 5 Intl directs dans ui/admin-labels.ts ; 6 emplois de --font-mono ; 9 champs.

Particularités :
- Onglets du vocabulaire : flèches inversées en RTL.
- Tableaux (file d'attente, praticiens, journal) : colonnes dans l'ordre du sens ; identifiants, adresses e-mail et numéros en dir="ltr".
- Filtres de date du journal (input type="date") : laisser le contrôle natif, vérifier son alignement.
- Formulaire de décision et motifs : texte libre en dir="auto".
- Le champ « libellé arabe » des catalogues n'est pas ajouté ici (M16-25, après le contrat).
- admin n'importe jamais une feature patient.

Critères propres : file de validation, dossier d'un praticien avec visionneuse de document, praticiens, journal, recours, vocabulaire de l'annuaire ont leur capture arabe.

Périmètre : src/app/features/admin/**, e2e/arabe/admin.spec.ts, la ligne de la feature dans eslint.config.mjs.

Livrable : PR « M16-13 Version arabe : admin », puis pnpm progress:log --task M16-13 --agent frontend-feature-dev --status done --summary "…" --pr <url>.
```

### M16-14 — `patients` de droite à gauche

```text
Tâche M16-14 — features/patients de droite à gauche (dépôt psymate-web). Utilise l'agent frontend-feature-dev. Dépend de M16-09. Vérifie qu'aucune tâche M15 n'est ouverte dans features/patients ; sinon arrête-toi et rends compte.

Contexte : lis CLAUDE.md, docs/M-plan-version-arabe.md (M2 et M4.4, que tu appliques en entier), docs/design/arabe.md, les fiches 01 (liste des patients) et 16 (fiche patient).

Constat du 22 novembre 2026 : 11 déclarations physiques (pages/patient-form.page.scss 4, ui/patient-table.component.scss 3, pages/patient-list.page.scss, ui/export-menu.component.ts, ui/patient-row.ts, ui/patient-today.component.scss 1 chacune) ; booléen english dans data/patient.api.ts ; Intl direct dans ui/patient-row.ts (6), data/patient.api.ts, data/patient.model.ts ; 16 champs ; le sélecteur de date partagé dans la fiche patient.

Particularités :
- ui/patient-row.ts : les phrases qui insèrent un libellé d'émotion ou d'étiquette en minuscules deviennent des messages entiers (M4.4 point 9).
- data/patient.model.ts, normalisation de recherche : en plus du retrait des diacritiques, unifier les variantes arabes (formes de alif, ta marbuta et ha, alif maqsura et ya) et retirer le tatweel ; tests à l'appui, sans changer le résultat pour un texte latin.
- Nom, prénom, étiquettes, drapeaux, notes : dir="auto" ; téléphone et e-mail en dir="ltr".
- Tableau : colonnes dans l'ordre du sens, menu d'export et actions de ligne du bon côté.
- Sélecteur de date : il vient de shared/ui ; s'il ne commence pas la semaine le lundi en arabe ou affiche des chiffres arabo-indiens, signale-le dans la PR sans modifier shared.

Critères propres : liste (pleine, vide, filtrée, archivés), bloc « aujourd'hui », fiche patient en création et en modification ont leur capture arabe ; une recherche de « احمد » trouve « أحمد » (test).

Périmètre : src/app/features/patients/**, e2e/arabe/patients.spec.ts, la ligne de la feature dans eslint.config.mjs.

Livrable : PR « M16-14 Version arabe : patients », puis pnpm progress:log --task M16-14 --agent frontend-feature-dev --status done --summary "…" --pr <url>.
```

### M16-15 — `patient-shell` de droite à gauche

```text
Tâche M16-15 — features/patient-shell de droite à gauche (dépôt psymate-web). Utilise l'agent frontend-feature-dev. Dépend de M16-09. Vérifie qu'aucune tâche M15 n'est ouverte dans features/patient-shell ; sinon arrête-toi et rends compte.

Contexte : lis CLAUDE.md, docs/M-plan-version-arabe.md (M2 et M4.4, que tu appliques en entier), docs/design/arabe.md, la fiche 00 (en-tête patient, barre de séance) et la planche 29 (aide des raccourcis).

Constat du 22 novembre 2026 : 5 déclarations physiques (panels/shortcuts-help.panel.ts 4, panels/close-session.panel.scss 1) ; booléen english dans data/patient-shell.api.ts ; 3 Intl directs dans ui/shell-labels.ts ; 1 italique ; 4 champs.

Particularités :
- Barre de séance : durée et heure par core/i18n, chiffres latins ; boutons dans l'ordre du sens.
- Aide des raccourcis : les touches (kbd) restent en caractères latins et en dir="ltr" ; la description se lit en arabe à côté.
- Panneau de clôture de séance : résumé et notes en dir="auto".
- L'en-tête patient vient de shared/ui (converti par M16-09) : n'y touche pas.

Critères propres : dossier avec et sans séance en cours, panneau de clôture, aide des raccourcis ont leur capture arabe.

Périmètre : src/app/features/patient-shell/**, e2e/arabe/patient-shell.spec.ts, la ligne de la feature dans eslint.config.mjs.

Livrable : PR « M16-15 Version arabe : patient-shell », puis pnpm progress:log --task M16-15 --agent frontend-feature-dev --status done --summary "…" --pr <url>.
```

### M16-16 — `overview` de droite à gauche

```text
Tâche M16-16 — features/overview de droite à gauche, courbe des ressentis laissée de gauche à droite (dépôt psymate-web). Utilise l'agent frontend-feature-dev. Dépend de M16-09.

Contexte : lis CLAUDE.md, docs/M-plan-version-arabe.md (M2, dont Q71 point 4 et Q75, et M4.4, que tu appliques en entier), docs/design/arabe.md, les fiches 02 et 02b (vue d'ensemble complète et simple).

Constat du 22 novembre 2026 : 7 déclarations physiques (ui/overview-feelings.component.ts 3, ui/feelings-chart.options.ts, ui/overview-section, ui/overview-side, ui/overview-since 1 chacune) ; booléen english dans data/overview.api.ts ; Intl direct dans ui/overview-labels.ts (8) et ui/overview-since.component.ts ; ECharts dans ui/echarts-setup.ts, ui/chart-host.ts, ui/feelings-chart.options.ts (alignements left et right en dur, position: 'right').

Particularités :
- La courbe garde son axe du temps, le passé à gauche : conteneur du graphique en dir="ltr", options ECharts inchangées pour l'axe. Libellés d'axe, légende, marqueurs et infobulle sont en arabe, dates par la locale de formatage.
- Les alignements left et right des options ECharts sont des coordonnées du graphique, pas de la mise en page : ils restent, avec un commentaire qui le dit ; si la règle ESLint les signale, propose l'exception dans la PR sans la désactiver toi-même.
- Tout ce qui entoure la courbe se retourne : sections, colonne latérale, « suivie depuis ».
- Le résumé « En bref » vient du serveur, en français tant que M16-30 n'est pas faite : il s'affiche en dir="auto".

Critères propres : vue complète et vue simple ont leur capture arabe, en clair et en sombre ; sur la capture, la date la plus ancienne de la courbe est à gauche ; l'infobulle ne sort pas du cadre.

Périmètre : src/app/features/overview/**, e2e/arabe/overview.spec.ts, la ligne de la feature dans eslint.config.mjs.

Livrable : PR « M16-16 Version arabe : overview », puis pnpm progress:log --task M16-16 --agent frontend-feature-dev --status done --summary "…" --pr <url>.
```

### M16-17 — `timeline` de droite à gauche

```text
Tâche M16-17 — features/timeline de droite à gauche, vue décennie laissée de gauche à droite (dépôt psymate-web). Utilise l'agent frontend-feature-dev. Dépend de M16-09.

Contexte : lis CLAUDE.md, docs/M-plan-version-arabe.md (M2, dont Q71 point 4 et Q75, et M4.4, que tu appliques en entier), docs/design/arabe.md, la fiche 03 (timeline chronologique, par séance, vue décennie).

Constat du 22 novembre 2026 : la feature la plus chargée en styles physiques, 35 déclarations (pages/timeline.page.scss 14, ui/timeline-sessions.component.scss 6, ui/timeline-session-divider.component.scss 4, ui/timeline-card.component.scss 3, ui/timeline-decade.chart.ts 3, ui/timeline-decade.component.scss 2…) ; booléen english dans data/timeline.api.ts ; 14 Intl directs (ui/timeline-labels.ts 4, pages/timeline.page.ts 3, ui/timeline-decade.component.ts 3…) ; flèches gauche et droite en dur dans ui/roving-toolbar.directive.ts ; 8 emplois de --font-mono.

Particularités :
- Vues chronologique et par séance : le fil, les cartes et les séparateurs de séance changent de côté ; la colonne latérale et les filtres aussi.
- Vue décennie (ui/timeline-decade.chart.ts, SVG calculé de gauche à droite) : elle reste de gauche à droite, conteneur en dir="ltr" ; les constantes LEFT et RIGHT du calcul sont des coordonnées, elles restent. Libellés d'années et de mois par la locale de formatage, en chiffres latins.
- Barre d'outils au clavier (roving-toolbar) : flèches inversées en RTL.
- Dates des cartes : si elles contiennent un nom de mois, elles quittent --font-mono.
- Titre et extrait des cartes : contenu saisi, dir="auto".
- Piège connu : les captures PNG des e2e timeline existants ne doivent pas changer ; ne les régénère pas.

Critères propres : vue chronologique, vue par séance, vue décennie, filtres ouverts ont leur capture arabe en largeur de bureau et de téléphone ; sur la capture de la vue décennie, l'année la plus ancienne est à gauche.

Périmètre : src/app/features/timeline/**, e2e/arabe/timeline.spec.ts, la ligne de la feature dans eslint.config.mjs.

Livrable : PR « M16-17 Version arabe : timeline », puis pnpm progress:log --task M16-17 --agent frontend-feature-dev --status done --summary "…" --pr <url>.
```

### M16-18 — `graph` de droite à gauche

```text
Tâche M16-18 — features/graph de droite à gauche, graphe lu vers la gauche (dépôt psymate-web). Utilise l'agent frontend-feature-dev. Dépend de M16-09.

Contexte : lis CLAUDE.md, docs/M-plan-version-arabe.md (M2, dont Q75, et M4.4, que tu appliques en entier), docs/design/arabe.md, les fiches 04 (graphe patient) et 06 (éditeur de lien), G Q58 (lecture dirigée).

Constat du 22 novembre 2026 : 27 déclarations physiques (panels/link-editor.panel.scss 8, ui/graph-canvas.component.scss 7, pages/graph.page.scss 5, ui/graph-links-table.component.ts 3…) ; booléen english dans data/link.api.ts et data/graph.api.ts ; Intl direct dans ui/graph-labels.ts ; elkjs dans ui/graph-layout.ts ('elk.direction': horizontal ? 'RIGHT' : 'DOWN') ; un tri par nom avec la locale dans pages/graph.page.ts.

Particularités :
- Sens de lecture horizontal : en arabe, elk.direction vaut LEFT ; la cause est à droite, l'effet à gauche. Le sens vertical (DOWN) ne change pas. Le choix « vers la droite » de l'interface devient « dans le sens de lecture » : le paramètre d'URL garde sa valeur, seul le rendu change.
- Les coordonnées du canevas (positions des cartes, tracé des traits, pointes de flèche) viennent d'elkjs : ce ne sont pas des propriétés de mise en page. Les styles du canevas qui positionnent en left et top restent, avec un commentaire ; si la règle ESLint les signale, propose l'exception dans la PR.
- Verbes des liens : rendus par le serveur selon Accept-Language, en français tant que l'API ne sert pas l'arabe ; dir="auto".
- Éditeur de lien : la phrase « source → verbe → cible » se lit de droite à gauche ; la flèche d'inversion est retournée.
- Tableau des liens : colonnes dans l'ordre du sens.

Critères propres : graphe dans les deux sens (horizontal, vertical), détail d'une carte, tableau des liens, éditeur de lien ont leur capture arabe ; sur la capture horizontale, une chaîne cause → effet se lit de droite à gauche ; /fr/ garde RIGHT (test de graph-layout).

Périmètre : src/app/features/graph/**, e2e/arabe/graph.spec.ts, la ligne de la feature dans eslint.config.mjs.

Livrable : PR « M16-18 Version arabe : graph », puis pnpm progress:log --task M16-18 --agent frontend-feature-dev --status done --summary "…" --pr <url>.
```

### M16-19 — `entries` de droite à gauche

```text
Tâche M16-19 — features/entries de droite à gauche (dépôt psymate-web). Utilise l'agent frontend-feature-dev. Dépend de M16-09.

Contexte : lis CLAUDE.md, docs/M-plan-version-arabe.md (M2 et M4.4, que tu appliques en entier), docs/design/arabe.md, la fiche 05 (éditeur d'entrée, six types, historique des versions).

Constat du 22 novembre 2026 : 7 déclarations physiques (panels/entry-editor.panel.scss 2, ui/emotion-combobox.component.scss 2, ui/occurred-fields.component.scss 2, ui/intensity-slider.component.ts 1) ; booléen english dans data/entries.api.ts ; Intl direct dans ui/emotion-combobox.component.ts et ui/relative-time.ts ; flèches gauche et droite en dur dans ui/intensity-slider.component.ts et ui/type-chips.component.ts ; champs datetime-local dans ui/occurred-fields.component.html ; 12 champs.

Particularités :
- Curseur d'intensité : en RTL, le minimum est à droite et la valeur croît vers la gauche ; flèche gauche augmente, flèche droite diminue ; aria-valuenow inchangé.
- Puces de type : ordre suivi par le sens, flèches inversées.
- Titre et texte de l'entrée : champs et affichage en dir="auto" ; l'historique des versions aussi.
- Liste d'émotions : libellés par la fonction de core/i18n ; la mise en minuscules du nom de famille ne s'applique pas à l'arabe.
- Champs datetime-local : contrôle natif, à laisser ; vérifier l'alignement et les chiffres.
- Rail des liens de l'entrée : du bon côté.

Critères propres : l'éditeur a sa capture arabe pour chacun des six types, plus l'historique des versions et un état d'erreur de validation ; le curseur d'intensité se manie au clavier dans le bon sens (test).

Périmètre : src/app/features/entries/**, e2e/arabe/entries.spec.ts, la ligne de la feature dans eslint.config.mjs.

Livrable : PR « M16-19 Version arabe : entries », puis pnpm progress:log --task M16-19 --agent frontend-feature-dev --status done --summary "…" --pr <url>.
```

### M16-20 — `capture` de droite à gauche

```text
Tâche M16-20 — features/capture de droite à gauche, aucune date détectée en arabe (dépôt psymate-web). Utilise l'agent frontend-feature-dev. Dépend de M16-09.

Contexte : lis CLAUDE.md, docs/M-plan-version-arabe.md (M2, dont Q81, et M4.4, que tu appliques en entier), docs/design/arabe.md, la fiche 05 (place du bloc de saisie) et docs/design/propositions-2026-11 (bloc de saisie structuré). Code : parser/{parse,normalize,lexicon,relative-date,emotion-match,calendar}.ts.

Constat du 22 novembre 2026 : 9 déclarations physiques (ui/capture-links.component.scss 5, ui/capture-block.component.scss 3, ui/capture-emotion-field.component.ts 1) ; booléen english dans data/capture.api.ts ; Intl direct dans data/capture.model.ts (dont toLocaleUpperCase('fr')), ui/capture-labels.ts, ui/capture-block.component.ts, ui/capture-links.component.ts ; flèches gauche et droite en dur dans ui/capture-intensity-scale.component.ts ; 1 italique ; parser/normalize.ts ramène toute langue autre que l'anglais à la grammaire française.

Particularités :
- Analyseur : en arabe, aucune date n'est proposée. grammarLanguage ne doit plus ramener l'arabe au français : la langue arabe n'a pas de lexique de dates, et un texte arabe ne déclenche aucune règle française (tests avec des phrases arabes contenant des chiffres et des mots proches). La reconnaissance d'une émotion par son libellé reste si elle marche telle quelle avec labelAr ; sinon elle est simplement absente, sans erreur.
- parser/calendar.ts emploie 'en-US' pour un calcul technique de jour civil : c'est voulu, n'y touche pas.
- Phrases assemblées (ui/capture-labels.ts, ui/capture-links.component.ts, ui/capture-block.component.ts) : messages entiers, un par type d'entrée s'il le faut ; Intl.ListFormat par la locale de formatage.
- Échelle d'intensité : même règle que le curseur de entries (minimum à droite en RTL, flèches inversées).
- Champ de saisie et aperçu : dir="auto".

Critères propres : bloc de saisie vide, rempli, avec lien proposé, avec émotion et intensité ont leur capture arabe ; les cas de test existants de l'analyseur (parse.cases.ts) restent verts sans être modifiés ; de nouveaux cas prouvent qu'un texte arabe ne produit aucune date.

Périmètre : src/app/features/capture/**, e2e/arabe/capture.spec.ts, la ligne de la feature dans eslint.config.mjs.

Livrable : PR « M16-20 Version arabe : capture », puis pnpm progress:log --task M16-20 --agent frontend-feature-dev --status done --summary "…" --pr <url>.
```

### M16-21 — `search` de droite à gauche

```text
Tâche M16-21 — features/search de droite à gauche (dépôt psymate-web). Utilise l'agent frontend-feature-dev. Dépend de M16-09.

Contexte : lis CLAUDE.md, docs/M-plan-version-arabe.md (M2 et M4.4, que tu appliques en entier), docs/design/arabe.md, la fiche 07 (recherche dans le dossier).

Constat du 22 novembre 2026 : petite tâche. 3 déclarations physiques (pages/patient-search.page.scss, ui/search-preview.component.scss, ui/type-chips.component.ts) ; 2 Intl directs dans ui/search-labels.ts ; 5 emplois de --font-mono ; aucun booléen english.

Particularités :
- Extraits de résultat : contenu saisi, dir="auto" ; le surlignage du terme trouvé ne doit pas casser la liaison des lettres arabes (vérifie à l'œil qu'un mot surligné au milieu reste lié) ; si le rendu casse, signale-le dans la PR.
- Aperçu latéral : du bon côté.
- Dates des résultats : quittent --font-mono si elles contiennent un nom de mois.
- La recherche elle-même est faite par le serveur : aucune normalisation à ajouter ici.

Critères propres : résultats, aucun résultat, aperçu ouvert ont leur capture arabe ; une recherche d'un mot arabe du seed (après M16-06) ou d'une fixture montre un extrait surligné lisible.

Périmètre : src/app/features/search/**, e2e/arabe/search.spec.ts, la ligne de la feature dans eslint.config.mjs.

Livrable : PR « M16-21 Version arabe : search », puis pnpm progress:log --task M16-21 --agent frontend-feature-dev --status done --summary "…" --pr <url>.
```

### M16-22 — `profile360` de droite à gauche

```text
Tâche M16-22 — features/profile360 de droite à gauche (dépôt psymate-web). Utilise l'agent frontend-feature-dev. Dépend de M16-09.

Contexte : lis CLAUDE.md, docs/M-plan-version-arabe.md (M2 et M4.4, que tu appliques en entier), docs/design/arabe.md, la fiche 30 (Profil 360) et sa maquette, docs/J-plan-profil-360-web.md (Q53 : titre et détail seulement).

Constat du 22 novembre 2026 : petite tâche. 3 déclarations physiques, toutes dans ui/profile-rubric.component.scss ; un toLocaleUpperCase dans data/profile360.model.ts (lettre de la pastille Famille) ; 2 interlettrages, 1 capitale forcée ; 3 champs.

Particularités :
- Histoire et souvenirs : la colonne de période et le fil chronologique passent à droite.
- Famille : la pastille porte la première lettre du titre ; pour un titre arabe, c'est la première lettre arabe, sans mise en capitale, découpée par graphème.
- Titre et détail de chaque information : contenu saisi, dir="auto".
- Menu des rubriques et panneau « Ajouter au profil » : du bon côté ; champs en dir="auto".

Critères propres : les quatre rubriques, l'état vide et le panneau (création et modification) ont leur capture arabe ; une information saisie en arabe et une en français s'affichent chacune dans son sens.

Périmètre : src/app/features/profile360/**, e2e/arabe/profile360.spec.ts, la ligne de la feature dans eslint.config.mjs.

Livrable : PR « M16-22 Version arabe : profile360 », puis pnpm progress:log --task M16-22 --agent frontend-feature-dev --status done --summary "…" --pr <url>.
```

### M16-23 — `agenda` de droite à gauche

```text
Tâche M16-23 — features/agenda de droite à gauche, calendrier en arabe (dépôt psymate-web). Utilise l'agent frontend-feature-dev. Dépend de M16-09. Vérifie qu'aucune tâche M14 n'est ouverte dans features/agenda ; sinon arrête-toi et rends compte.

Contexte : lis CLAUDE.md, docs/M-plan-version-arabe.md (M2, dont Q71 point 3, Q73 et Q75, et M4.4, que tu appliques en entier), docs/design/arabe.md, les fiches 15 (agenda) et 15b (nouveau rendez-vous).

Constat du 22 novembre 2026 : 11 déclarations physiques (panels/new-appointment.panel.scss 4, ui/agenda-calendar.component.scss 4, pages/agenda.page.scss 2, ui/appointment-detail.component.scss 1) ; 9 Intl directs dans ui/agenda-format.ts (dont un cas propre au français : locale.startsWith('fr')) ; ui/agenda-calendar.component.ts choisit la locale FullCalendar par this.locale.startsWith('en') ? enLocale : frLocale, avec firstDay: 1 et hour12: false ; 7 interlettrages, 5 capitales forcées, 10 emplois de --font-mono ; aucun booléen english.

Particularités :
- FullCalendar : locale arabe fournie par la bibliothèque (@fullcalendar/core/locales, déjà installée : aucune dépendance à ajouter), direction rtl en arabe, firstDay: 1 conservé et non remplacé par la valeur de la locale, heures sur 24 h, chiffres latins dans les en-têtes de jour et les heures (vérifie le rendu : si la locale arabe de FullCalendar produit des chiffres arabo-indiens, fournis les formats par la locale de formatage).
- Grille : en RTL les jours se lisent de droite à gauche, lundi à droite ; les heures restent de haut en bas. La surcharge de style de la grille (agenda-calendar.component.scss) passe en propriétés logiques.
- Mini-calendrier (ui/mini-month.component.ts) : même premier jour, même sens, flèches de mois retournées.
- Plages horaires « 14:00 – 15:00 » : isolées en dir="ltr" pour que l'heure de début reste à gauche du tiret.
- Détail du rendez-vous et panneau « Nouveau rendez-vous » : du bon côté ; nom du patient ou de l'invité et notes en dir="auto".

Critères propres : semaine, jour, mois, liste, détail, panneau de nouveau rendez-vous avec récurrence et conflit ont leur capture arabe ; sur la capture de la semaine, lundi est la première colonne à droite ; aucun chiffre arabo-indien à l'écran ; e2e/agenda existants verts sans les modifier.

Périmètre : src/app/features/agenda/**, e2e/arabe/agenda.spec.ts, la ligne de la feature dans eslint.config.mjs.

Livrable : PR « M16-23 Version arabe : agenda », puis pnpm progress:log --task M16-23 --agent frontend-feature-dev --status done --summary "…" --pr <url>.
```

### M16-24 — `billing` de droite à gauche

```text
Tâche M16-24 — features/billing de droite à gauche (dépôt psymate-web). Utilise l'agent frontend-feature-dev. Dépend de M16-09 et de M15-20 fusionnée : si features/billing n'existe pas sur main ou si une tâche M15 y est ouverte, arrête-toi et rends compte.

Contexte : lis CLAUDE.md, docs/M-plan-version-arabe.md (M1 « hors M16 », M2 et M4.4, que tu appliques en entier), docs/design/arabe.md, docs/L-plan-facturation.md (L2.1 Q69 et Q70), les fiches 33 à 39 et les maquettes docs/design/facturation/. Commence par l'inventaire de la feature (déclarations physiques, Intl directs, champs), que ce plan n'a pas pu faire : la feature n'existait pas le 22 novembre 2026.

Particularités :
- Montants : toujours en dir="ltr", chiffres latins, par data/money.ts avec la locale de formatage ; l'euro reste à la place que lui donne Intl.
- La facture reste un document français (M1) : l'aperçu de l'éditeur et la feuille d'une facture émise restent en français et de gauche à droite, dans un conteneur lang="fr" dir="ltr". Seul l'habillage autour est traduit et retourné.
- Numéros de facture, SIRET, IBAN : dir="ltr", --font-mono conservé.
- Tableaux (factures, à facturer, paiements) : colonnes dans l'ordre du sens, montants alignés du côté de fin.
- Nom du patient, libellés de prestation, mentions : contenu saisi, dir="auto".

Critères propres : factures, à facturer, éditeur, facture émise, paiements, réglages ont leur capture arabe ; sur chaque capture, la feuille de facture est restée en français de gauche à droite.

Périmètre : src/app/features/billing/**, e2e/arabe/billing.spec.ts, la ligne de la feature dans eslint.config.mjs.

Livrable : PR « M16-24 Version arabe : billing », puis pnpm progress:log --task M16-24 --agent frontend-feature-dev --status done --summary "…" --pr <url>.
```

### M16-25 — Contrat `0.16.0` et libellés arabes

```text
Tâche M16-25 — Passer le contrat épinglé à contract-v0.16.0 et brancher les libellés arabes (dépôt psymate-web). Utilise l'agent frontend-feature-dev. PR dédiée au changement de tag. Dépend de M16-06 (tag posé) et des tâches de feature M16-10 à M16-23.

Contexte : lis CLAUDE.md, docs/M-plan-version-arabe.md (Q78, Q80), le diff du contrat entre le tag de CONTRACT_TAG et contract-v0.16.0, tools/contract-pull.mjs, la PR qui avait posé le tag précédent. Le saut attendu va de contract-v0.15.0 à contract-v0.16.0 ; si le diff porte autre chose que la version arabe, dis-le dans la PR.

Objectif :
- CONTRACT_TAG = contract-v0.16.0 ; pnpm contract:pull ; docs/contract/openapi.yaml, docs/api-reference.md et src/app/api régénérés, jamais édités à la main.
- Chaque data/*.api.ts qui lit labelFr et labelEn lit aussi labelAr (et inverseLabelAr pour les types de lien) et le porte dans son modèle ; la fonction de core/i18n fait le choix à l'affichage. Features concernées : account, admin, capture, entries, graph, overview, patient-shell, patients, public, timeline (vérifie la liste par une recherche de labelEn).
- core/preferences : la préférence locale accepte ar.
- features/admin : les écrans de catalogue (vocabulaire de l'annuaire, et tout écran qui édite labelEn) reçoivent un champ « libellé arabe » à côté du libellé anglais, en dir="rtl", avec les mêmes règles de validation.
- Fixtures et tests mis à jour ; un cas avec libellé arabe et un cas sans (repli français) dans les tests de core/i18n ou d'une feature.

Périmètre : CONTRACT_TAG, docs/contract/**, docs/api-reference.md, src/app/api/** (généré), les data/*.api.ts et .model.ts des features listées, core/preferences, features/admin (champ de libellé arabe), messages.

Critères d'acceptation :
- aucun fichier de src/app/api modifié à la main (diff = sortie du générateur) ;
- en /ar/, un catalogue qui a un libellé arabe l'affiche, un catalogue qui n'en a pas affiche le français ; fr et en inchangés à l'écran ;
- un administrateur saisit un libellé arabe et le relit après enregistrement (e2e contre l'API réelle) ;
- pnpm lint, check:tokens, test, build verts ; e2e existants verts contre l'API de main ;
- la PR liste les écarts fiche ↔ contrat constatés.

Interdits : éditer src/app/api ou docs/contract à la main ; proposer l'arabe dans un sélecteur de langue ; dépendance npm.

Livrable : PR « M16-25 Contrat 0.16.0 et libellés arabes », puis pnpm progress:log --task M16-25 --agent frontend-feature-dev --status done --summary "…" --pr <url>.
```

### M16-26 — Traduction : pages publiques, connexion et inscription

```text
Tâche M16-26 — Traduire en arabe les pages publiques, la connexion et l'inscription (dépôt psymate-web, src/locale seulement). Utilise l'agent frontend-feature-dev. Dépend de M16-08 et du glossaire (M16-07).

Contexte : lis CLAUDE.md, docs/M-plan-version-arabe.md (M9 : qui traduit), docs/design/arabe-glossaire.md (emploie ses termes tels quels : ils sont proposés et seront relus par une personne arabophone avant l'ouverture), src/locale/messages.fr.xlf (source) et messages.en.xlf (pour lever une ambiguïté). Regarde comment messages.en.xlf est tenu à jour (pnpm extract-i18n, identifiants @@) et relis chaque écran en /fr/ avant de le traduire, pour connaître le contexte de chaque texte.

Lot : les unités dont l'identifiant commence par public. et auth. (environ 493 unités le 22 novembre 2026, à recompter sur main).

Objectif :
- Chaque unité du lot a sa cible arabe dans messages.ar.xlf, en arabe standard moderne.
- Registre : boutons et actions au nom verbal (« إضافة », pas « أضف ») ; aucune tournure accordée en genre pour le praticien, le visiteur ou la personne suivie ; phrases courtes ; ponctuation arabe (، ؛ ؟).
- Chaque message au pluriel porte les six formes (zero, one, two, few, many, other), chacune juste grammaticalement.
- Les valeurs insérées gardent leur sens et prennent leur place logique dans la phrase arabe.
- « PsyMate », les codes, les adresses et les unités techniques restent en caractères latins.
- Pages publiques : ton d'accueil, lisible par un patient qui cherche un praticien ; textes légaux et de confidentialité traduits sans rien ajouter ni retirer.

Critères d'acceptation :
- zéro unité du lot sans cible (compte avant et après dans la PR) ;
- pnpm build sans avertissement de traduction manquante pour le lot ; pnpm lint, test verts ;
- chaque écran du lot relu en /ar/, avec capture dans la PR ; aucun texte coupé ni débordant ;
- la PR liste les messages dont la traduction est incertaine, pour le relecteur arabophone.

Interdits : modifier un texte source ou messages.fr.xlf à la main ; changer du code ; employer un terme métier absent du glossaire ; traduire hors du lot.

Livrable : PR « M16-26 Traduction arabe : pages publiques et connexion », puis pnpm progress:log --task M16-26 --agent frontend-feature-dev --status done --summary "…" --pr <url>.
```

### M16-27 — Traduction : dossier patient

```text
Tâche M16-27 — Traduire en arabe le dossier patient (dépôt psymate-web, src/locale seulement). Utilise l'agent frontend-feature-dev. Dépend de M16-26 fusionnée (même fichier).

Contexte : lis CLAUDE.md, docs/M-plan-version-arabe.md (M9), docs/design/arabe-glossaire.md, la PR de M16-26 et, s'il y en a, les remarques du relecteur arabophone (elles valent pour ce lot), src/locale/messages.fr.xlf et messages.en.xlf. Relis chaque écran en /fr/ avant de le traduire. Relève dans les PR des tâches de feature fusionnées les textes sources qu'elles ont changés (M4.4 point 9).

Lot : les unités dont l'identifiant commence par patients., patientShell., patientHeader., sessionBar., overview., timeline., graph., links., entries., entry., capture., search., profile360., subject. (environ 1 300 unités le 22 novembre 2026).

Objectif :
- Chaque unité du lot a sa cible arabe, selon les mêmes règles de registre que M16-26 (nom verbal, pas d'accord de genre, six formes de pluriel, valeurs insérées à leur place, noms propres et codes en caractères latins).
- Vocabulaire clinique strictement celui du glossaire : désignation de la personne suivie (patient, client), types d'entrée, familles d'émotions, types de lien, séance.
- Les messages subject.* (patient et client, singulier et pluriel) sont traduits pour s'insérer sans accord fautif dans les phrases qui les emploient : vérifie chaque phrase appelante en /ar/.
- Les messages entiers créés par les tâches de feature à la place des phrases assemblées sont traduits cas par cas.

Critères d'acceptation :
- zéro unité du lot sans cible (compte avant et après dans la PR) ;
- pnpm build sans avertissement de traduction manquante pour le lot ; pnpm lint, test verts ;
- chaque écran du dossier relu en /ar/ avec capture : liste, fiche patient, séance, vue d'ensemble, timeline, graphe, éditeur d'entrée, bloc de saisie, recherche, Profil 360 ;
- la PR liste les messages dont la traduction est incertaine.

Interdits : modifier un texte source ou messages.fr.xlf à la main ; changer du code ; employer un terme métier absent du glossaire ; traduire hors du lot.

Livrable : PR « M16-27 Traduction arabe : dossier patient », puis pnpm progress:log --task M16-27 --agent frontend-feature-dev --status done --summary "…" --pr <url>.
```

### M16-28 — Traduction : compte, administration, agenda, socle

```text
Tâche M16-28 — Traduire en arabe le compte, l'administration, l'agenda et le socle (dépôt psymate-web, src/locale seulement). Utilise l'agent frontend-feature-dev. Dépend de M16-27 fusionnée (même fichier).

Contexte : lis CLAUDE.md, docs/M-plan-version-arabe.md (M9), docs/design/arabe-glossaire.md, les PR de M16-26 et M16-27 et, s'il y en a, les remarques du relecteur arabophone, src/locale/messages.fr.xlf et messages.en.xlf. Relis chaque écran en /fr/ avant de le traduire.

Lot : toutes les unités encore sans cible, soit celles dont l'identifiant commence par account., accountNav., profile., profession., preferences., vocabulary., admin., adminBar., agenda., shared., shortcuts., forms., toast., banner., state., appBar., navRail., confirm., sidePanel., app., les unités à identifiant numérique, et billing. si le module existe (environ 1 230 unités le 22 novembre 2026, hors billing).

Objectif :
- Chaque unité restante a sa cible arabe, selon les mêmes règles que M16-26 et M16-27.
- Sécurité et compte : messages d'erreur et d'avertissement exacts, sans atténuer ni dramatiser ; les noms de touches et de codes restent en caractères latins.
- Agenda : jours, récurrence (« toutes les 2 semaines », « jusqu'au… », « 5 fois ») avec les six formes de pluriel.
- Administration : vocabulaire de modération cohérent d'un écran à l'autre.
- À la fin, messages.ar.xlf n'a plus aucune unité sans cible.

Critères d'acceptation :
- zéro unité sans cible dans tout le fichier (compte dans la PR) ; pnpm build sans aucun avertissement de traduction manquante pour l'arabe ;
- pnpm lint, test verts ;
- chaque écran du lot relu en /ar/ avec capture : compte et sécurité, préférences, profil, vocabulaire, données et export, administration, agenda, états et notifications, aide des raccourcis ;
- la PR liste les messages dont la traduction est incertaine.

Interdits : modifier un texte source ou messages.fr.xlf à la main ; changer du code ; employer un terme métier absent du glossaire.

Livrable : PR « M16-28 Traduction arabe : compte, administration, agenda, socle », puis pnpm progress:log --task M16-28 --agent frontend-feature-dev --status done --summary "…" --pr <url>.
```

### M16-29 — Ouverture

```text
Tâche M16-29 — Ouvrir la version arabe (dépôt psymate-web). Utilise l'agent frontend-feature-dev. Tâche dédiée : elle a le droit de toucher core/preferences, shared/ui/app-bar et shared/ui/public-layout.

Contexte : lis CLAUDE.md, docs/M-plan-version-arabe.md (Q80, M7), docs/B-ux.md B3 (flux), docs/e2e-couverture.md, docs/couverture-ecrans.md, la fiche 14 (préférences).

Préalables à vérifier avant de commencer, sinon arrête-toi et rends compte : contrat 0.16.0 tiré (M16-25) ; zéro unité sans cible dans messages.ar.xlf ; M16-26 à M16-28 fusionnées ; glossaire et traductions relus par une personne arabophone (c'est le seul arrêt du jalon qui attend l'utilisateur : s'il manque, rends compte et arrête-toi) ; toutes les features dans la liste des zones converties ; M16-24 faite ou explicitement reportée si M15 n'est pas livré.

Objectif :
- Les sélecteurs de langue (préférences du compte, barre de l'application, en-tête public, pages de connexion s'il y en a un) proposent trois langues, chacune écrite dans sa propre langue (Français, English, العربية).
- Choisir l'arabe enregistre la préférence locale = ar et recharge l'application sous /ar/, sur la même route.
- La règle psymate/no-physical-direction s'applique à tout src/app et la liste des zones converties disparaît.
- e2e/arabe reçoit les parcours de B3 en /ar/ : connexion, créer un patient, ouvrir une séance et saisir une entrée, lier deux entrées, timeline, vue d'ensemble, recherche, Profil 360, annuaire public et fiche praticien ; axe-core dans chacun ; les libellés peuvent maintenant être ciblés en arabe.
- docs/couverture-ecrans.md et docs/e2e-couverture.md portent la colonne arabe ; le glossaire reçoit les corrections retenues pendant les relectures.

Périmètre : src/app/core/preferences/**, src/app/shared/ui/{app-bar,public-layout}/**, src/app/features/account (choix de langue des préférences), eslint.config.mjs, e2e/arabe/, docs/.

Critères d'acceptation :
- choisir l'arabe dans les préférences recharge l'application en /ar/ ; après déconnexion et reconnexion, l'application revient en arabe ;
- depuis /ar/, revenir au français ou à l'anglais marche de la même façon ;
- les parcours arabes sont verts contre l'API réelle (seed small), sans mock ;
- pnpm lint (règle active partout), check:tokens, test, build verts ; aucun avertissement de traduction manquante pour l'arabe ;
- /fr/ et /en/ ne changent que par l'entrée ajoutée aux sélecteurs.

Interdits : ouvrir si un préalable manque ; désactiver la règle ESLint pour un fichier qui échoue (le convertir, ou s'arrêter et rendre compte) ; dépendance npm.

Livrable : PR « M16-29 Version arabe : ouverture », puis pnpm progress:log --task M16-29 --agent frontend-feature-dev --status done --summary "…" --pr <url>.
```

## M7. Revue

Avant chaque fusion : sous-agent `reviewer` dans la session de la tâche, CI verte, puis l'orchestratrice fusionne (M4.5) et relit le diff après coup. Elle regarde trois choses.

1. Les captures arabes de la PR, à côté de l'écran français : rien ne se chevauche, rien n'est coupé, le sens des flèches est juste.
2. Les captures françaises existantes : inchangées. Une tâche M16 ne modifie jamais le rendu de `/fr/` ni de `/en/`.
3. Pour une tâche de traduction (M16-04, M16-26 à M16-28) : la liste des messages incertains, gardée pour le relecteur arabophone.

Avant l'ouverture (M16-29) : relecture du glossaire et des traductions par une personne arabophone, idéalement un clinicien, sur écran et sur un dossier de démonstration. C'est le seul point du jalon qui attend l'utilisateur. Le 23 novembre 2026, l'utilisateur a levé ce préalable (M4.5 point 6, G Q80) : la relecture se fera après l'ouverture.

## M8. Second temps (proposé, à confirmer)

Ces tâches ne bloquent pas l'ouverture. Elles ne sont lancées que si l'utilisateur les confirme ; leurs prompts sont plus courts que les autres, parce que le code concerné n'a pas été lu en détail pour ce plan.

### M8.1 API

| ID | Titre | Couloir | Dépend de | Parallèle avec |
| --- | --- | --- | --- | --- |
| M16-30 | Résumé « En bref » rédigé en arabe | overview | M16-06 | M16-31, M16-32 |
| M16-31 | Exports Markdown et PDF en arabe | clinical (export) | M16-06 | M16-30, M16-32 |
| M16-32 | Recherche plein texte en arabe | search | M16-06 | M16-30, M16-31 |

#### M16-30 — Résumé « En bref » en arabe

```text
Tâche M16-30 — Rédiger le résumé « En bref » en arabe (psymate-api). Utilise l'agent backend-module-dev. Second temps du jalon M16 : ne commence que si l'utilisateur l'a confirmé.

Contexte : lis CLAUDE.md, docs/M-plan-version-arabe-api.md (Q102, M8, M4.3), ../psymate-web/docs/design/arabe-glossaire.md, le code qui rédige le résumé par règles (jusqu'à cinq phrases, chacune omise si ses données manquent, sans IA) et ses tests en français et en anglais.

Objectif : les mêmes phrases en arabe standard moderne, justes pour un, deux, quelques et beaucoup (séances, jours, entrées), sans accord de genre fautif pour la personne suivie (tournures neutres) ; chiffres latins ; le contrat dit que le résumé suit Accept-Language pour les trois langues.

Critères d'acceptation : un test par phrase et par forme de nombre (0, 1, 2, 3, 11, 100) ; les résumés fr et en sont identiques avant et après ; la PR donne dix résumés arabes produits sur le seed, pour le relecteur arabophone.

Interdits : appeler un service externe ou un modèle de langue ; changer les règles de sélection des phrases ; dépendance Maven.

Livrable : PR « M16-30 Résumé En bref en arabe », puis make log TASK=M16-30 AGENT=backend-module-dev STATUS=review SUMMARY="…" PR=<url>.
```

#### M16-31 — Exports en arabe

```text
Tâche M16-31 — Exports Markdown et PDF en arabe (psymate-api). Utilise l'agent backend-module-dev. Second temps du jalon M16 : ne commence que si l'utilisateur l'a confirmé.

Contexte : lis CLAUDE.md, docs/M-plan-version-arabe-api.md (Q102, M8, M4.3), clinical/export (ExportTexts, ExportDates, HtmlRenderer, PdfRenderer, ExportJobRunner, PatientExportService). Constat du 22 novembre 2026, à revérifier : le PDF est produit par openhtmltopdf ; PdfRenderer charge les polices du système (Segoe UI, DejaVu) et aucune police arabe ; l'export asynchrone et un appel de PatientExportService sont fixés en français.

Objectif :
- Les textes de l'export existent en arabe ; l'export suit la langue demandée dans ses deux formes, immédiate et asynchrone.
- Le PDF arabe est lisible : police arabe embarquée dans l'application (IBM Plex Sans Arabic, licence OFL, la même qu'à l'écran), lettres liées, texte de droite à gauche, texte mêlé arabe et latin dans le bon ordre. Si openhtmltopdf a besoin d'un module pour la mise en forme bidirectionnelle, annonce la dépendance Maven dans la PR avant de l'ajouter et attends l'accord.
- Le contenu saisi garde son propre sens, paragraphe par paragraphe.
- Chiffres latins, calendrier grégorien.

Critères d'acceptation : un test extrait le texte du PDF arabe et y retrouve une phrase attendue dans l'ordre logique ; une capture du PDF arabe dans la PR ; les exports fr et en sont identiques avant et après, octet pour octet pour le Markdown ; l'export d'un dossier qui mêle arabe et français est lisible.

Interdits : dépendre d'une police installée sur le serveur ; ajouter une dépendance Maven sans accord ; journaliser un contenu d'export.

Livrable : PR « M16-31 Exports en arabe », puis make log TASK=M16-31 AGENT=backend-module-dev STATUS=review SUMMARY="…" PR=<url>.
```

#### M16-32 — Recherche plein texte en arabe

```text
Tâche M16-32 — Recherche plein texte adaptée à l'arabe (psymate-api). Utilise l'agent backend-module-dev. Second temps du jalon M16 : ne commence que si l'utilisateur l'a confirmé.

Contexte : lis CLAUDE.md, docs/M-plan-version-arabe-api.md (Q102, M8, M4.3), le module search et ses migrations (V08 et suivantes), docs/E-modele-donnees.md. Constat du 22 novembre 2026, à revérifier : les index emploient les configurations french et simple avec unaccent et pg_trgm ; la version de PostgreSQL et la présence de la configuration arabic n'ont pas été vérifiées.

Objectif :
- Commence par mesurer : sur le seed enrichi d'entrées arabes (M16-06), ce que la recherche actuelle trouve et manque (formes de alif, ta marbuta, article collé, pluriels). Donne ces résultats dans la PR.
- Propose puis réalise la plus petite évolution qui corrige les manques : normalisation des variantes de lettres à l'indexation et à la requête, et configuration de recherche adaptée au contenu arabe, sans dégrader la recherche française.
- Une nouvelle migration, jamais une migration modifiée ; réindexation décrite et testée.

Critères d'acceptation : les requêtes arabes de la mesure trouvent leurs entrées après la tâche (tests) ; chaque test de recherche français existant reste vert sans être modifié ; le temps de réponse sur le seed de performance ne se dégrade pas (chiffres avant et après dans la PR).

Interdits : extension PostgreSQL nouvelle sans accord ; dépendance Maven ; changer le contrat de la recherche.

Livrable : PR « M16-32 Recherche en arabe », puis make log TASK=M16-32 AGENT=backend-module-dev STATUS=review SUMMARY="…" PR=<url>.
```

### M8.2 Web

| ID | Titre | Couloir | Dépend de | Parallèle avec |
| --- | --- | --- | --- | --- |
| M16-33 | Détection des dates dans la saisie libre en arabe | features/capture | M16-20, M16-29 | M16-30 à M16-32 |

#### M16-33 — Saisie libre : dates en arabe

```text
Tâche M16-33 — Reconnaître les dates dans la saisie libre en arabe (dépôt psymate-web, features/capture). Utilise l'agent frontend-feature-dev. Second temps du jalon M16 : ne commence que si l'utilisateur l'a confirmé.

Contexte : lis CLAUDE.md, docs/M-plan-version-arabe.md (Q81, M8), src/app/features/capture/parser en entier (parse.ts, tokenize.ts, normalize.ts, lexicon.ts, relative-date.ts, parse.cases.ts) et la PR de M16-20.

Objectif :
- Une grammaire arabe des dates relatives et absolues, à côté de la française et de l'anglaise : aujourd'hui, hier, avant-hier, demain ; « قبل ثلاثة أيام », « منذ أسبوعين » ; le duel (« يومين », « أسبوعين », « شهرين », « سنتين ») ; jours de la semaine avec « الماضي » et « القادم » ; jour et mois (noms levantins et noms d'origine française, selon ce que le glossaire retient) ; nombres en lettres jusqu'à douze.
- Tokenisation adaptée : prépositions et conjonctions collées au mot (و، ب، ل، في), article, variantes de lettres, chiffres latins et arabo-indiens en entrée.
- Ce n'est pas un troisième lexique à remplir : si la structure actuelle de relative-date.ts ne porte pas le duel ni les particules collées, propose dans la PR le plus petit changement de structure, sans changer le comportement français ni anglais.

Critères d'acceptation : chaque forme a ses cas dans parse.cases.ts ; tous les cas français et anglais existants restent verts sans être modifiés ; un texte arabe sans date ne produit aucune date ; la PR liste les formes reconnues et celles laissées de côté.

Interdits : toucher à une autre feature ; dépendance npm ; appeler un service externe.

Livrable : PR « M16-33 Saisie libre : dates en arabe », puis pnpm progress:log --task M16-33 --agent frontend-feature-dev --status done --summary "…" --pr <url>.
```

## M9. Ce qui reste ouvert

- **Qui traduit, qui valide.** L'agent propose le glossaire (M16-07) et les traductions (M16-04, M16-26 à M16-28), fusionnés sans attendre. La relecture par une personne arabophone reste à organiser par l'utilisateur ; elle conditionnait l'ouverture (M16-29), que l'utilisateur a décidée sans elle le 23 novembre 2026 (G Q80) : elle se fera après coup. Si un traducteur professionnel est retenu, il corrige le fichier livré.
- **Décisions proposées** (Q72 à Q81, Q96 à Q102, dont l'arabe standard moderne) : inscrites comme proposées, non relues par l'utilisateur.
- **Second temps** (M8) : à confirmer, avec ce que voit le praticien en attendant.
- **Émotions créées par un praticien** : elles n'ont qu'un libellé, rangé dans `labelFr` quelle que soit la langue de saisie. Rien ne change ici ; à renommer un jour côté API si cela gêne.
- **Facturation (M15)** : son plan n'est pas sur `main` et réservait `V16` et le contrat `0.16.0`, que M16 prend (avec `V17`). À corriger dans le plan L avant son lancement.
- **Page de suivi** : sur `main`, `pnpm progress` ne lit pas encore les plans de jalon ; les tâches M16 y apparaissent par le tableau de C14 (ajouté par M16-07) et par leurs événements.
- **Effort** : 6 PR côté API et 23 côté web jusqu'à l'ouverture, 4 de plus pour le second temps. Non chiffré en jours.
