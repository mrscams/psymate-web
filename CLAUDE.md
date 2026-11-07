# psymate-web

## Ce que c'est
Frontend de PsyMate, suivi clinique pour psychologues, psychiatres et coachs. Angular 22 standalone, zoneless, signaux, Angular Material 22 (M3), @ngrx/signals, pnpm. Parle uniquement à psymate-api par le contrat OpenAPI épinglé (CONTRACT_TAG).
Documents de référence dans docs/ : README.md (ordre de lecture), B-ux.md, C-plan.md (C2, C6, C9, C10), G-decisions.md, Etude-couleurs-Nordique.md, design/*.md (une fiche par écran), handbook/architecture-frontend.html, contract/openapi.yaml + api-reference.md, couverture-ecrans.md.
G l'emporte sur tout autre document ; le contrat l'emporte sur une fiche.

## Commandes (utilise uniquement celles-ci)
- pnpm install
- pnpm start : http://localhost:4200, proxy /api → http://localhost:8080 (API lancée dans ../psymate-api : make up && make run)
- pnpm lint : ESLint (frontières entre features, no-hardcoded-color, un seul import de api/ par feature) + Prettier
- pnpm check:tokens : contrastes des tokens, deux thèmes
- pnpm test : Vitest (doit être vert avant toute PR)
- pnpm build
- pnpm e2e : Playwright contre l'API réelle (docker : API + Postgres, seed small)
- pnpm contract:pull : copie docs/contract/openapi.yaml au tag CONTRACT_TAG et régénère src/app/api
- pnpm progress:log --task <ID> --agent frontend-feature-dev --status <done|review|blocked|merged> --summary "…" [--pr … --notes … --next …] : enregistre l'avancement (skill progress-log) ; pnpm progress : regénère docs/progress/index.html

## Architecture (règles non négociables, handbook §11)
- Une feature par contexte (auth, patients, patient-shell, overview, timeline, graph, entries, search, capture, account, public, admin), lazy, avec un index.ts public. Aucun import de l'intérieur d'une autre feature. admin n'importe jamais une feature patient.
- src/app/api est généré au tag CONTRACT_TAG et jamais édité. Seuls les fichiers data/*.api.ts l'importent. Changer de tag = une PR dédiée.
- Six couches : page → composant UI → store → service de données → client généré → transport. Une couche ne parle qu'à celle du dessous.
- Standalone, zoneless, OnPush, signaux. Pas de store RxJS maison ; RxJS seulement pour HTTP et événements DOM.
- État serveur dans un SignalStore, état d'écran dans le composant, préférences dans PreferencesStore. Jamais la même donnée à deux endroits.
- Toute erreur HTTP devient un ApiProblem (core/http). 401, 403 d'état et 429 sont traités par les intercepteurs ; 409 et 422 par l'écran. Aucun composant ne voit un HttpErrorResponse.
- Trois états par bloc de données, avec shared/ui/state.
- Les composants partagés (fiche 00) ne se modifient que par une tâche dédiée.
- Aucune couleur hexadécimale, aucun texte non $localize, aucune URL d'API écrite à la main.
- Le serveur reste juge des règles métier ; le client vérifie la forme.
- Après une écriture, on relit les projections (vue d'ensemble, recherche), on ne recalcule pas localement.
- authorType en lecture seule, place réservée, jamais dessiné (A11). Agenda et signalements : aucune route (G Q25, Q26).

## Conventions
Nommage : x.page.ts (PageX), x.component.ts (XComponent, sélecteur pm-x), x.store.ts (XStore), x.api.ts (XApi), x.routes.ts, x.guard.ts, x.interceptor.ts. Dossiers par feature : index.ts, routes, pages/, ui/, data/ (panels/ pour les panneaux).
Textes : français d'abord (messages.fr.xlf obligatoire, messages.en.xlf si possible, jamais bloquant). Nom du produit : PsyMate. Dates : Intl avec la locale, UTC en transit.
Tests : Vitest pour les stores (service de données simulé) et les composants (trois états) ; Playwright pour chaque flux de B3 et chaque critère e2e des fiches, contre l'API réelle, jamais de mock du backend ; axe-core dans chaque e2e.

## Ne fais jamais
- Ajouter une dépendance npm sans le dire dans la PR ; aucune plage de version.
- Éditer src/app/api ou docs/contract/openapi.yaml à la main.
- Modifier un composant de shared/ui ou core dans une tâche d'écran.
- Désactiver un test, une règle ESLint ou le test de contraste.
- Écrire une couleur, un texte, une URL d'API en dur ; un secret ; une URL de prod.
- Travailler hors de la feature indiquée dans ta tâche.

## Fin de tâche
pnpm lint, pnpm check:tokens, pnpm test, pnpm build verts ; les e2e de la tâche verts en local ; PR ouverte avec le template (ID, critères de la fiche cochés un par un, tests ajoutés, dépendances npm ajoutées listées, écarts fiche ↔ contrat constatés) ; puis pnpm progress:log (skill progress-log) avec le fichier d'événement commité dans la branche. Jamais d'édition de docs/progress/index.html ni d'un événement existant.
