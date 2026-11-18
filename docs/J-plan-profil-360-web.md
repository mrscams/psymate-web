# Document J – Plan d'action · Profil 360 (web), jalon M13

18 novembre 2026. Plan de réalisation de l'onglet « Profil 360 » du dossier patient dans `psymate-web`. L'API est livrée : jalon M13 de psymate-api (tâches M13-01 à M13-03, PR #97 à #99 là-bas, tag `contract-v0.14.0`). Les tâches web continuent la numérotation du jalon : **M13-04 à M13-07**. Tant que M13-05 n'est pas fusionnée, ce document et la fiche 30 font foi.

Sources : `docs/design/30-profil-360.md` (fiche de l'écran, source de vérité fonctionnelle) et `30-profil-360.html` (maquette validée par l'utilisateur les 16 à 18 novembre 2026) ; `../psymate-api/docs/J-plan-profil-360-api.md` (J1 décisions de l'API, J3 contrat) ; `docs/design/00-composants-partages.md` (en-tête patient, panneau latéral, composant « état ») ; `docs/H-runbook-agents-frontend.md` 2.7 (manœuvre).

Attention aux numéros : le G de ce dépôt a sa propre suite (Q50 et Q51 y sont des décisions d'outillage). Les décisions de l'API sont citées « G de psymate-api Q62 à Q70 » ; celles du web ci-dessous prennent Q52 à Q57 **dans le G de ce dépôt**.

## J1. Périmètre et décisions à inscrire dans G (M13-05)

Ce que l'écran doit permettre : voir d'un coup tout ce qui décrit la personne, rangé en quatre rubriques ; ajouter une information, la corriger, la retirer, dans le panneau latéral. Le détail est dans la fiche 30.

Hors M13 web : toute modification du bloc de saisie, de l'éditeur d'entrée, de la séance, de la timeline, du graphe, de la recherche ou de la vue d'ensemble ; l'annulation d'un retrait ; la trame de premier entretien ; la reprise d'une phrase de note ; l'export du profil ; la création de rendez-vous invités dans l'agenda (seul leur affichage est adapté, voir Q57).

| # | Question | Proposition |
| --- | --- | --- |
| Q52 | Où vit l'écran | Nouvelle feature **`profile360`**, chargée à la demande, montée sous le dossier : route `/patients/:id/profile`, `data: { tab: 'profile', contentWidth: 'full' }`. Quatrième onglet de l'en-tête patient, « Profil 360 », touche `4`. La feature rejoint `PATIENT_FEATURES` (ESLint) : `admin` ne l'importe jamais. Le mot « profil » seul reste celui du profil public (`features/public`, `features/account`). |
| Q53 | Titre et détail seulement | Chaque information s'affiche avec son titre et, dessous, son détail. Pas de colonne d'étiquette (« En cours », « Projet »), pas de nom séparé du rôle dans Famille, pas de pictogramme par information, pas de provenance. Seule Histoire et souvenirs a une colonne de gauche : la période, sur le fil chronologique. Famille garde une pastille portant la première lettre du titre. Tranchée par l'utilisateur le 18 novembre 2026 ; aucun champ ajouté à l'API. |
| Q54 | Un seul panneau pour ajouter et modifier | Panneau latéral partagé de 480 px. « Ajouter au profil » (un seul bouton, au bout de la ligne des onglets de l'en-tête patient, à droite, comme dans la maquette validée ; visible sur cet onglet seulement) l'ouvre en création, avec la rubrique affichée préremplie ; un clic sur une information l'ouvre en modification. L'ouverture en création passe par l'URL (`?ajouter=1`), comme `/agenda?nouveau=…`. Trois saisies : Rubrique, Information, Précision ; Période et Année pour Histoire et souvenirs seulement. « Retirer du profil » dans le pied, avec le dialogue de confirmation partagé ; pas d'annulation après coup. |
| Q55 | Une lecture, puis relecture après chaque écriture | Un seul `GET /api/patients/{id}/profile-items` charge tout l'onglet ; le store groupe par rubrique et compte, sans retrier (l'ordre est celui du serveur). Après un ajout, une modification ou un retrait, le profil est relu, jamais corrigé localement. La rubrique affichée est dans l'URL (`?rubrique=`). Patient archivé : lecture seule. |
| Q56 | Pas de bloc de saisie sur l'onglet | Comme sur Vue d'ensemble, Timeline et Graphe (décision du 14 novembre 2026), le bloc « Noter quelque chose… » n'existe que sur l'onglet Séance. Ouvrir ou utiliser le Profil 360 ne crée ni séance ni entrée. |
| Q57 | Passage du contrat à `0.14.0` | `CONTRACT_TAG` passe de `contract-v0.12.1` à `contract-v0.14.0` dans une PR dédiée (M13-04). Ce saut embarque `0.13.0` (rendez-vous invités) : `AppointmentDto.patient` devient facultatif et `guest` apparaît. L'agenda est adapté pour **afficher** un rendez-vous invité (nom de l'invité, ou « Invité purgé », sans lien vers un dossier) ; la création et le rattachement d'un invité ne sont pas construits ici. |

## J2. Tâches, couloirs et parallélisme

| ID | Titre | Couloir | Dépend de | Parallèle avec |
| --- | --- | --- | --- | --- |
| M13-04 | Contrat `0.14.0` : `CONTRACT_TAG`, client régénéré, agenda adapté aux rendez-vous invités (affichage) | `api` généré + `features/agenda` | — | M13-05 |
| M13-05 | Décisions et documentation ; quatrième onglet ; squelette de la feature `profile360` | docs + `shared/ui/patient-header` + `features/patient-shell` + `features/profile360` | — | M13-04 |
| M13-06 | L'onglet en lecture : données, menu des rubriques, quatre affichages, états | `features/profile360` | M13-04, M13-05 | — |
| M13-07 | Le bouton « Ajouter au profil » sur la ligne des onglets et le panneau : ajouter, modifier, retirer ; e2e complets | `features/profile360` (+ pose du bouton dans `features/patient-shell`) | M13-06 | — |

**Vagues.** M13-C : 04 ∥ 05 (aucun fichier commun). M13-D : 06. M13-E : 07. Effort indicatif : 3 jours.

**Agents.** `frontend-feature-dev` pour les quatre tâches ; `reviewer` avant chaque fusion ; puis `pnpm progress:log`. Un seul agent par feature à la fois (H 2.7).

**e2e.** L'API doit tourner avec le seed `small` (`../psymate-api` : `make up`, `make run`, `make seed SIZE=small`) ; depuis M13-03 le seed donne un profil à la plupart des patients et à « DEMO · Camille R. ». La CI web construit l'API depuis la branche `main` de psymate-api, qui contient le jalon M13.

## J3. Prompts

Manœuvre (H 2.7) : `git checkout main && git pull && claude --worktree <ID>`, coller le prompt. À la fin : `Lance le sous-agent reviewer sur cette branche et corrige ce qu'il marque bloquant.`, lecture humaine (le test e2e, les écarts fiche ↔ contrat, le diff de `package.json`), comparaison de l'écran à la maquette, `gh pr merge <n> --squash --delete-branch`.

### M13-04 — Contrat `0.14.0`

```text
Tâche M13-04 — Passer le contrat épinglé à contract-v0.14.0 et adapter l'agenda aux rendez-vous invités, en affichage seulement (dépôt psymate-web, src/app/api généré et features/agenda). Utilise l'agent frontend-feature-dev.

Contexte : lis CLAUDE.md, docs/J-plan-profil-360-web.md (J1 Q57), docs/design/15-agenda.md et 15b-nouveau-rendez-vous.md, puis, dans ../psymate-api, docs/I-plan-agenda-api.md I3 et I8 (ce que 0.13.0 a changé : AppointmentDto.patient facultatif, AppointmentDto.guest { firstName, lastName, phone, purgedAt }, ConflictDto.patientDisplayName pour un invité, POST /api/appointments/{id}/attach-patient) et docs/J-plan-profil-360-api.md J3 (ce que 0.14.0 ajoute : quatre routes /api/patients/{id}/profile-items). Regarde tools/contract-pull.mjs et la PR qui avait posé contract-v0.12.1.

Objectif :
- CONTRACT_TAG = contract-v0.14.0 ; pnpm contract:pull ; docs/contract/openapi.yaml, docs/api-reference.md et src/app/api régénérés, jamais édités à la main.
- features/agenda : tout ce qui lit appointment.patient accepte son absence. Un rendez-vous invité s'affiche avec « Prénom Nom » de l'invité (nom seul si pas de prénom), ou « Invité purgé » si guest.purgedAt est renseigné ; pas d'initiales de dossier, pas de lien vers un dossier, pas d'âge ni de « suivi depuis ». Déplacement et annulation fonctionnent comme pour un patient. Aucune création d'invité, aucun rattachement : le panneau « Nouveau rendez-vous » reste tel qu'il est.
- Modèles, fixtures et tests de la feature mis à jour ; un cas invité et un cas invité purgé dans les tests du store et du composant de détail.
- Aucun usage des routes profile-items dans cette tâche.

Périmètre : CONTRACT_TAG, docs/contract/**, docs/api-reference.md, src/app/api/** (généré), src/app/features/agenda/**, e2e/agenda/, messages.

Critères d'acceptation :
- pnpm lint, pnpm check:tokens, pnpm test, pnpm build verts ; aucun fichier de src/app/api modifié à la main (diff = sortie du générateur) ;
- un rendez-vous invité du seed (s'il y en a) ou d'une fixture s'affiche dans la grille, la liste et le détail sans erreur, avec le nom de l'invité ; un invité purgé affiche « Invité purgé » ;
- les e2e de e2e/agenda/ restent verts contre l'API de main ;
- la PR liste les écarts fiche ↔ contrat constatés (fiches 15 et 15b ne décrivent pas l'invité).

Tests : Vitest (store, composants agenda), e2e agenda.

Interdits : éditer src/app/api ou docs/contract à la main ; construire la création ou le rattachement d'un invité ; toucher à une autre feature ; dépendance npm.

Livrable : PR « M13-04 Contrat 0.14.0 et rendez-vous invités en affichage », puis pnpm progress:log --task M13-04 --agent frontend-feature-dev --status done --summary "…" --pr <url>.
```

### M13-05 — Décisions, quatrième onglet, squelette de la feature

```text
Tâche M13-05 — Inscrire le Profil 360 dans la documentation, ajouter le quatrième onglet du dossier et poser le squelette de la feature profile360 (dépôt psymate-web). Utilise l'agent frontend-feature-dev. C'est la tâche dédiée qui a le droit de modifier le composant partagé shared/ui/patient-header.

Contexte : lis CLAUDE.md, docs/J-plan-profil-360-web.md en entier, docs/design/30-profil-360.md et sa maquette, docs/design/00-composants-partages.md (en-tête patient), docs/G-decisions.md (G8 et le format des lignes Q50, Q51), docs/C-plan.md C10, docs/design/README.md, docs/couverture-ecrans.md, docs/e2e-couverture.md. Code : src/app/shared/ui/patient-header/patient-header.component.{ts,html,spec.ts} (PATIENT_TABS, touches 1 2 3), src/app/features/patient-shell/patient-shell.routes.ts, data/patient-shell.model.ts (ShellTab), pages/patient-shell.page.{ts,html} (contentWidth, bloc de saisie réservé à l'onglet Séance), eslint.config.mjs (PATIENT_FEATURES), src/app/features/graph (modèle d'une feature d'onglet : index.ts, loadGraphPage).

Objectif :
- Documentation : G reçoit une section « G9. Profil 360 (web), jalon M13 (18 novembre 2026) » avec Q52 à Q57 copiées de J1 ; C reçoit une section C11 avec le tableau des tâches M13-04 à M13-07 (format de C10) ; docs/design/README.md ajoute la ligne 30 (feature profile360, module backend patients) ; docs/couverture-ecrans.md et docs/e2e-couverture.md ajoutent l'écran ; la fiche 00 dit que l'en-tête patient a quatre onglets ; CLAUDE.md ajoute profile360 à la liste des features et une ligne « Profil 360 : feature profile360, fiche 30, docs/J-plan-profil-360-web.md ; titre et détail seulement, relecture après écriture ».
- En-tête patient : PATIENT_TABS reçoit { key: '4', segment: 'profile', label « Profil 360 » } ; la touche 4 ouvre l'onglet ; le commentaire « trois onglets » et le spec sont mis à jour. Rien d'autre ne change dans le composant.
- Dossier : ShellTab += 'profile' ; nouvelle route enfant 'profile' (data: { tab: 'profile', contentWidth: 'full' }, titre « Profil 360 · PsyMate ») qui charge la page de la feature ; le bloc de saisie reste absent de cet onglet (il n'existe que sur Séance) ; l'onglet reste accessible séance ouverte ou non.
- Feature profile360 : index.ts public, profile360.page.ts minimal qui affiche le titre « Profil 360 » et l'état « chargement » de shared/ui/state (aucun appel d'API : le client 0.14.0 arrive par M13-04). PATIENT_FEATURES += 'profile360'.
- messages.fr.xlf (et messages.en.xlf si possible).

Périmètre : docs/**, CLAUDE.md, src/app/shared/ui/patient-header/**, src/app/features/patient-shell/patient-shell.routes.ts, data/patient-shell.model.ts et, si nécessaire, pages/patient-shell.page.{ts,html} (prise en compte de 'profile' seulement), src/app/features/profile360/**, eslint.config.mjs (une ligne), messages, e2e/shell/.

Critères d'acceptation :
- l'en-tête montre quatre onglets ; « Profil 360 » mène à /patients/:id/profile et porte aria-current sur cette route ; la touche 4 y mène ; les onglets 1 à 3 se comportent comme avant, en séance comme hors séance ;
- sur /patients/:id/profile, pas de bloc de saisie ; l'en-tête, la barre de séance et le rail sont inchangés ;
- G Q52 à Q57 existent ; C11 liste M13-04 à M13-07 avec les dépendances de J2 ; README design, couverture et CLAUDE.md citent la fiche 30 et la feature ;
- pnpm lint (frontières : admin n'importe pas profile360), pnpm check:tokens, pnpm test, pnpm build verts ; e2e/shell/ vert, avec un scénario « quatrième onglet » et axe-core 0 violation.

Tests : spec de l'en-tête (quatre onglets, touche 4), e2e shell.

Interdits : tout appel aux routes profile-items ; toute autre modification de shared/ui ou de core ; toucher au bloc de saisie, à la séance, à la timeline, au graphe, à la vue d'ensemble ; dépendance npm.

Livrable : PR « M13-05 Profil 360 : décisions, quatrième onglet, squelette », puis pnpm progress:log.
```

### M13-06 — L'onglet en lecture

```text
Tâche M13-06 — Profil 360 : l'onglet en lecture (dépôt psymate-web, features/profile360). Utilise l'agent frontend-feature-dev. Dépend de M13-04 (client 0.14.0) et de M13-05 (onglet, route, squelette).

Contexte : lis CLAUDE.md, docs/J-plan-profil-360-web.md (J1 Q53, Q55, Q56), docs/design/30-profil-360.md en entier et sa maquette 30-profil-360.html (contenu de l'onglet ; les composants partagés restent ceux de l'application), docs/api-reference.md (GET /api/patients/{id}/profile-items), docs/design/29-etats.md. Modèles de code : src/app/features/agenda/data/agenda.api.ts, agenda.store.ts et agenda.model.ts (service de données, SignalStore, modèle d'écran), src/app/features/overview (page d'onglet, trois états), shared/ui/state.

Objectif :
- data/profile360.api.ts (seul fichier qui importe src/app/api), data/profile360.model.ts (rubriques dans l'ordre history, family, health, values_goals ; libellés, phrases d'aide et icônes), data/profile360.store.ts (charge le profil du patient, expose les informations groupées par rubrique et les compteurs, sans retrier ; état chargement / erreur / vide ; lecture seule si le patient est archivé, lu dans le store du dossier).
- pages/profile360.page.{ts,html,scss} : deux colonnes (menu 272 px, contenu), rubrique affichée lue et écrite dans ?rubrique= (défaut history, valeur inconnue = history), bascule en une rangée défilante sous 820 px.
- ui/ : menu des rubriques (icône, libellé, compteur, aria-current) ; fil chronologique d'Histoire et souvenirs (période à gauche, point, titre, détail) ; liste de Famille (pastille à la première lettre du titre) ; liste simple de Santé et de Valeurs. Titre et détail seulement, partout. Icônes en SVG inline, tracés de la maquette, couleur héritée.
- États : chargement, erreur avec « Réessayer », profil vide (« Aucune information dans le profil »), rubrique vide (« Rien dans cette rubrique pour l'instant »).
- Pas encore de bouton « Ajouter au profil » ni de clic sur une information : c'est M13-07.
- messages.fr.xlf (et en si possible) ; aucun texte ni couleur en dur.

Périmètre : src/app/features/profile360/**, messages, e2e/profil-360/.

Critères d'acceptation (fiche 30, lecture) :
- sur un patient du seed qui a un profil, les quatre rubriques et leurs compteurs correspondent à la réponse de l'API ;
- dans Histoire et souvenirs, l'ordre affiché est celui de l'API (le test compare les titres dans l'ordre), une information sans année est après les datées ; la période est à gauche ;
- Famille, Santé, Valeurs : titre et détail, aucune étiquette à gauche ; pastille à la première lettre du titre dans Famille ;
- recharger sur ?rubrique=family affiche Famille et entourage ;
- patient sans information : état vide ; erreur réseau simulée dans le test du store : état erreur et « Réessayer » ;
- ouvrir l'onglet n'émet qu'un GET profile-items et aucune écriture ;
- axe-core 0 violation, thèmes clair et sombre ; pnpm lint, check:tokens, test, build verts.

Tests : Vitest pour le store (service de données simulé : groupement, compteurs, ordre conservé, trois états) et les composants (trois états) ; e2e/profil-360/lecture contre l'API réelle et le seed small.

Interdits : toute écriture vers l'API ; retrier côté client ; modifier shared/ui, core ou une autre feature ; dépendance npm.

Livrable : PR « M13-06 Profil 360 : onglet en lecture », puis pnpm progress:log.
```

### M13-07 — Le panneau : ajouter, modifier, retirer

```text
Tâche M13-07 — Profil 360 : panneau « Ajouter au profil » (ajouter, modifier, retirer) et e2e complets (dépôt psymate-web, features/profile360). Utilise l'agent frontend-feature-dev. Dépend de M13-06.

Contexte : lis CLAUDE.md, docs/J-plan-profil-360-web.md (J1 Q54, Q55), docs/design/30-profil-360.md (Structure 3, Interactions, Accessibilité, Critères) et la maquette (bouton « Ajouter au profil » et panneau), docs/api-reference.md (POST, PATCH, DELETE profile-items et leurs erreurs), docs/design/00-composants-partages.md (panneau latéral, confirmation, toast). Modèles de code : src/app/features/agenda/panels/new-appointment.panel.{ts,html} et data/new-appointment.store.ts (panneau latéral avec formulaire, SidePanelService, erreurs 422 par champ), shared/forms (apply-problem, field-errors, validators), shared/ui/confirm-dialog, shared/ui/toast.

Objectif :
- Bouton « Ajouter au profil » au bout de la ligne des onglets de l'en-tête patient (contour, pas cobalt plein, icône plus) : un petit composant de la feature, exporté par son index.ts, que la page du dossier (features/patient-shell) pose dans l'emplacement de fin de ligne existant de pm-patient-header (celui de pm-overview-window, [pmViewToggle] / showViewToggle), sur l'onglet 'profile' seulement et jamais pour un patient archivé. Le bouton est un lien vers /patients/:id/profile?ajouter=1 (les autres paramètres, dont rubrique, sont conservés) ; la page ouvre le panneau en création quand ce paramètre est présent et le retire à la fermeture. Le composant partagé pm-patient-header n'est pas modifié : si l'emplacement ne suffit pas tel qu'il est, arrête-toi et signale-le. Le même bouton figure dans l'état vide. Chaque information devient activable (clic, Entrée) et ouvre le panneau en modification. Rien de tout cela si le patient est archivé.
- panels/profile-item.panel.{ts,html,scss} : panneau latéral de 480 px, un seul composant pour créer et modifier. Champs : Rubrique (préremplie), Information (obligatoire, 200), Précision (facultative, 2 000), et pour Histoire et souvenirs seulement Période (60) et Année (entier 1900 à 2100). Quitter Histoire et souvenirs masque et vide Période et Année. Pied : « Ajouter » ou « Enregistrer » (cobalt), « Annuler », et en modification « Retirer du profil » (bouton texte neutre, jamais rouge) avec le dialogue de confirmation partagé.
- data : POST, PATCH (seuls les champs modifiés ; null pour effacer Précision, Période, Année), DELETE dans profile360.api.ts ; après succès, fermeture, relecture du profil par le store, rubrique concernée affichée, toast, focus rendu au déclencheur.
- Erreurs : 422 par champ sous le champ ; 422 PROFILE_ITEM_LIMIT_REACHED en message dans le panneau ; 409 PROFILE_ITEM_ARCHIVED et 404 PROFILE_ITEM_NOT_FOUND → toast et relecture ; 409 PATIENT_ARCHIVED → toast et lecture seule.
- messages.fr.xlf (et en si possible).

Périmètre : src/app/features/profile360/**, src/app/features/patient-shell/pages/patient-shell.page.{ts,html} (pose du bouton dans l'emplacement de fin de ligne, rien d'autre), messages, e2e/profil-360/.

Critères d'acceptation (fiche 30, tous les critères d'écriture) :
- « Ajouter au profil » est au bout de la ligne des onglets sur l'onglet Profil 360 et absent des trois autres onglets, où le sélecteur de fenêtre de la Vue d'ensemble reste inchangé ; il ouvre le panneau avec la rubrique affichée préremplie ; /patients/:id/profile?ajouter=1 ouvre le panneau directement ;
- ajouter une information dans Santé et antécédents : elle apparaît, le compteur augmente de un, toast « Information ajoutée » ;
- Période et Année visibles seulement pour Histoire et souvenirs ; une création dans une autre rubrique part sans periodLabel ni periodYear (le test lit la requête) ; une information d'histoire créée avec une année se place à son rang dans le fil après relecture ;
- modifier le titre : le nouveau remplace l'ancien, pas de doublon ; effacer la précision l'enlève ;
- retirer : confirmation, disparition, compteur moins un ; annuler la confirmation ne change rien ;
- titre vide : pas de requête, message sous le champ ; une erreur 422 du serveur sur un champ s'affiche sous ce champ (test du store ou du panneau avec service simulé) ;
- patient archivé : pas de bouton, pas de panneau ;
- Échap ferme le panneau et rend le focus au déclencheur ; axe-core 0 violation panneau ouvert, thèmes clair et sombre ;
- aucune requête vers les routes de séance, d'entrée ou de lien pendant ces parcours ; pnpm lint, check:tokens, test, build verts.

Tests : Vitest pour le panneau (création, modification, règle des champs de période, erreurs par champ) et le store (relecture après écriture) ; e2e/profil-360/ecriture contre l'API réelle (les données créées par le test sont retirées par le test).

Interdits : corriger la liste localement au lieu de relire ; proposer d'annuler un retrait ; un bouton rouge ; modifier shared/ui ou core ; toucher à features/patient-shell au-delà de la pose du bouton ; toucher à une autre feature ; dépendance npm.

Livrable : PR « M13-07 Profil 360 : ajouter, modifier, retirer », puis pnpm progress:log. Après fusion : mettre à jour docs/couverture-ecrans.md (écran livré) dans la même PR.
```

## J4. Revue (prompt du reviewer, identique pour chaque tâche)

```text
Relis le diff de cette branche contre main pour la tâche M13-0x, sans rien modifier. Vérifie, dans l'ordre : le périmètre de fichiers du prompt (une seule feature, shared/ui/patient-header seulement dans M13-05, src/app/api seulement régénéré dans M13-04) ; la conformité à la fiche 30 et à J1 (titre et détail seulement, pas de retri, relecture après écriture, pas de bloc de saisie, lecture seule si patient archivé) ; les six couches (seul data/*.api.ts importe src/app/api) ; aucun texte, couleur ou URL en dur ; trois états par bloc de données ; chaque critère d'acceptation couvert par un test qui échouerait sans le code ; e2e contre l'API réelle, sans mock du backend, avec axe-core ; aucune dépendance npm non annoncée. Classe chaque remarque en bloquant ou non bloquant.
```

## J5. Ce qui reste ouvert après M13

- **Annuler un retrait.** Demande une route de restauration côté API (J7 de l'API).
- **Rendez-vous invités dans l'agenda.** M13-04 ne fait que les afficher ; créer un invité et le rattacher à un patient restent à planifier (fiches 15 et 15b à compléter).
- **Trame de premier entretien.** Un enchaînement guidé de créations dans le même panneau, sans séance.
- **Reprise depuis une note en lecture, recherche dans le profil, export du profil.** Chacun dépend d'une évolution de l'API.
- **Recouvrement avec la fiche patient.** Le champ « histoire » de la fiche 16 (`context.history`) et la rubrique Histoire et souvenirs coexistent ; à harmoniser quand les deux sont en usage.
- **Capture `.png` de la fiche 30**, à produire une fois l'écran livré.
