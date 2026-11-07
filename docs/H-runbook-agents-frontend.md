# Document H – Mode opératoire des agents · Frontend `psymate-web`

3 novembre 2026 · @Hayes · Version 1.0 · Ce document est fait pour être **suivi**, pas lu, comme le document F côté API. Partie 1 : les décisions que les prompts appliquent. Partie 2 : ce qu'il faut créer une fois avant le premier agent (volet web de M0-08). Partie 3 : les lots, dans l'ordre des briques de C10, avec pour chaque tâche l'explication en clair, la commande et le prompt exact à coller.

Les prompts renvoient aux documents de `psymate-web/docs/` : `B-ux.md` (expérience utilisateur), `C-plan.md` (tâches : C2, C6, C9, **C10** qui révise les tâches web), `G-decisions.md` (décisions, l'emporte sur tout), `Etude-couleurs-Nordique.md` (tokens), `design/NN-*.md` (une fiche par écran, avec sa maquette `.html`), `design/00-composants-partages.md`, `contract/openapi.yaml` + `api-reference.md` (le contrat réel, tag `contract-v0.11.0`), `handbook/architecture-frontend.html` (les six couches, les frontières, les 14 règles), `couverture-ecrans.md` (écarts fiches ↔ contrat). Quand une fiche et le contrat se contredisent, **le contrat l'emporte** ; quand un document et G se contredisent, **G l'emporte**.

---

## Lexique

| Code | Signification |
| --- | --- |
| **Brique 0 … 7** | Les groupes de tâches de C10 : 0 socle, 1 identité et compte, 2 dossier patient (base), 3 vues du dossier, 4 annuaire et profil public, 5 capture et finitions, 6 administration, 7 bêta. |
| **Fiche NN** | `docs/design/NN-*.md` : route, API, structure, règles, tokens, accessibilité, critères d'acceptation. La maquette `.html` du même numéro est la référence visuelle. |
| **Feature** | Un dossier de `src/app/features/` : une par contexte, chargé à la demande, avec un `index.ts` public. Un seul agent à la fois par feature. |
| **Pièces communes** | `src/app/shared/ui/*` et `src/app/core/*` (fiche 00), posées par M0-09. On ne les modifie que par une tâche dédiée. |
| **Six couches** | Page → composant UI → store → service de données → client généré → transport (handbook §2). |
| **`CONTRACT_TAG`** | Fichier à la racine : le tag du contrat que `src/app/api` reflète. `pnpm contract:pull` régénère le client depuis `docs/contract/openapi.yaml` à ce tag. |
| **`ApiProblem`** | L'erreur typée fabriquée par l'intercepteur à partir d'un `application/problem+json` : `{ status, code, detail, errors[], retryAfterSeconds, extra }`. |
| **Trois états** | Vide, chargement, erreur : tout bloc de données les a, via `shared/ui/state` (planche 29). |
| **e2e** | Playwright contre l'API réelle (Docker + seed `small`), un dossier par flux de B3, axe-core dans chaque test. |

---

# Partie 1 — Décisions appliquées dans les prompts

| # | Décision |
| --- | --- |
| G Q1, Q2 | Produit **PsyMate** (jamais « Suivi »), dépôt `mrscams/psymate-web`, domaine psymate.com. |
| C « Build frontend » | **Angular 22**, Material 22 (M3), **pnpm**, Node 24 (G Q50), zoneless, standalone, Signal Forms, `@ngrx/signals`, cytoscape, echarts, openapi-generator, Vitest, Playwright. Versions figées. Le scaffold Angular 21 / npm actuel est remplacé par M0-06 (G Q51). |
| G Q6 | Session par cookie, 12 h, 30 j avec « rester connecté » : aucun jeton côté web. |
| G Q15 | Spécialités et publics : liste fermée (`GET /api/public/directory/vocabulary` côté public, `GET /api/vocabulary/directory` côté praticien), jamais de saisie libre. |
| G Q20 | Pas de numéros d'urgence sur les pages publiques. |
| G Q21 | Inscription ouverte, aucun code d'invitation. |
| G Q23 | Français d'abord : `messages.fr.xlf` complet à chaque tâche, EN non bloquant. `vocabulary.subjectLabel` remplace « patient » par « client ». |
| G Q25, Q26 | Agenda (15, 15b) hors V1 ; signalements (23) V1.1 : aucune route, aucun onglet. |
| G Q31 | Fenêtre de grâce 1 h 15 : le web l'affiche, ne la calcule pas. |
| A11, B9 | `authorType` lu, jamais envoyé ; place réservée du marqueur « rapporté par le patient », jamais dessiné. |
| C10 | Tâches M0-09 et M1-18 ajoutées ; M0-07, M1-06, M1-15, M1-16, M1-07, M4-08, M5-05, M6-03, M7-07 révisées ; ordre des briques. |
| Contrat | `contract-v0.11.0` couvre toute la V1 web (M10-01 à M10-06 fusionnées). Aucune tâche web n'attend le backend. |
| Handbook | Les 14 règles de `architecture-frontend.html` §11 sont la base du `CLAUDE.md` web (Partie 2). |

**Tranché le 7 novembre 2026** : Angular 22 + pnpm (G Q51), sur Node 24 (G Q50). H s'applique tel qu'écrit ; le scaffold Angular 21 / npm est remplacé par M0-06.

---

# Partie 2 — Préparation (une seule fois, avant le premier agent)

Durée : une heure. À la main, sans agent.

## 2.1 Prérequis

```bash
node --version      # 24.x
corepack enable && pnpm --version   # pnpm 9+
docker --version    # pour les e2e (API + Postgres) et Mailpit
gh auth status
claude --version
```

`psymate-api` cloné à côté (`../psymate-api`) : les e2e et le suivi d'avancement s'y appuient.

## 2.2 Le dépôt

`docs/` est déjà en place (PR psymate-web#1) : documents de référence, 32 fiches et maquettes, contrat 0.11.0, handbook. Vérifier :

```bash
cd psymate-web && git checkout main && git pull
ls docs/design | wc -l        # 87 fichiers
grep -m1 version docs/contract/openapi.yaml   # 0.11.0
```

## 2.3 Créer `CLAUDE.md` à la racine (copier tel quel)

```markdown
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
- Suivi d'avancement : dans ../psymate-api, make log TASK=… AGENT=frontend-feature-dev STATUS=… SUMMARY="…" PR=…

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
pnpm lint, pnpm check:tokens, pnpm test, pnpm build verts ; les e2e de la tâche verts en local ; PR ouverte avec le template (ID, critères de la fiche cochés un par un, tests ajoutés, dépendances npm ajoutées listées, écarts fiche ↔ contrat constatés) ; puis make log dans ../psymate-api avec le fichier d'événement commité là-bas.
```

## 2.4 Créer `.claude/settings.json`

```json
{
  "permissions": {
    "allow": [
      "Bash(pnpm *)", "Bash(npx playwright *)", "Bash(docker compose *)",
      "Bash(git status*)", "Bash(git diff *)", "Bash(git log *)", "Bash(git add *)",
      "Bash(git commit *)", "Bash(git push *)", "Bash(gh pr *)",
      "Bash(make -C ../psymate-api log *)"
    ],
    "deny": ["Bash(rm -rf *)", "Bash(git push --force *)", "Read(.env*)", "Edit(src/app/api/**)", "Edit(docs/contract/openapi.yaml)"]
  },
  "hooks": {
    "PostToolUse": [
      { "matcher": "Edit|Write", "hooks": [ { "type": "command", "command": "pnpm -s prettier --write $(git diff --name-only --diff-filter=AM -- '*.ts' '*.html' '*.scss' 2>/dev/null) >/dev/null 2>&1 || true" } ] }
    ],
    "Stop": [
      { "hooks": [ { "type": "command", "command": "test -f package.json && (pnpm -s lint && pnpm -s test -- --run || (echo 'Lint ou tests rouges : corrige avant de terminer' >&2; exit 2)) || true" } ] }
    ]
  }
}
```

Le hook `Stop` empêche un agent de s'arrêter sur du rouge ; `test -f package.json` évite qu'il tourne avant M0-06.

## 2.5 Créer les deux agents dans `.claude/agents/`

`.claude/agents/frontend-feature-dev.md` :

```markdown
---
name: frontend-feature-dev
description: Implémente UNE tâche web du plan C (C2, C6, C9, C10) dans UNE feature Angular de psymate-web. À utiliser pour toute tâche « web / <feature> ».
tools: Read, Write, Edit, Glob, Grep, Bash
model: sonnet
---
Tu implémentes exactement la tâche donnée, dans la feature donnée, et rien d'autre.

Avant d'écrire une ligne :
1. Lis CLAUDE.md et docs/README.md.
2. Lis la ou les fiches docs/design/NN-*.md de ta tâche (et ouvre la maquette .html du même nom pour la mise en page), puis la ligne de ta tâche dans docs/C-plan.md (C2/C6/C9, révisée par C10 si elle y figure).
3. Lis docs/design/00-composants-partages.md : tu réutilises ces composants, tu ne les refais pas.
4. Vérifie chaque chemin, méthode, champ et code d'erreur dans docs/api-reference.md (le contrat l'emporte sur la fiche ; la section « Écarts avec la maquette » de la fiche dit ce que tu suis et ce que tu ignores).
5. Lis docs/handbook/architecture-frontend.html §2 (six couches), §5 (frontières), §6 (communication avec le backend). Si ton prompt cite une décision « Qn », lis-la dans docs/G-decisions.md et applique-la.

Pendant :
- Ne touche qu'à src/app/features/<feature>/**, ses tests, ses traductions et ses e2e. Si un composant partagé manque, arrête-toi et dis-le dans ton rapport au lieu de le créer ou de le modifier.
- Un seul fichier importe src/app/api : data/<x>.api.ts. Les composants ne voient que des signaux et des méthodes de store.
- Chaque critère d'acceptation de la fiche devient un test (Vitest ou Playwright). Chaque bloc de données a ses trois états.

À la fin : pnpm lint, pnpm check:tokens, pnpm test, pnpm build verts, les e2e de la tâche verts (API locale : make up && make run dans ../psymate-api, make seed SIZE=small), puis une PR via gh pr create avec le template : ID de la tâche, critères cochés un par un, tests ajoutés, dépendances npm ajoutées (ou « aucune »), écarts fiche ↔ contrat constatés, décisions prises quand la documentation était ambiguë. Puis make -C ../psymate-api log TASK=<ID> AGENT=frontend-feature-dev STATUS=done SUMMARY="…" PR=<url>.
```

`.claude/agents/reviewer.md` :

```markdown
---
name: reviewer
description: Relit le diff d'une tâche web sans rien modifier. À lancer avant chaque fusion.
tools: Read, Glob, Grep, Bash
model: sonnet
---
Tu relis le diff de la branche courante par rapport à main (git diff main...HEAD). Tu ne modifies aucun fichier.

Vérifie, dans cet ordre, et réponds par une liste « bloquant / à corriger / remarque » :
1. Frontières : aucun import de l'intérieur d'une autre feature (seulement son index.ts) ; src/app/api importé seulement depuis data/*.api.ts ; features/admin n'importe rien de patients, patient-shell, overview, timeline, graph, entries, search, capture ; aucun fichier de src/app/api ni de shared/ui ou core modifié hors d'une tâche M0-09 ou dédiée.
2. Critères : reprends la section « Critères d'acceptation » de la fiche et la ligne de C ; pour chaque critère, nomme le test (Vitest ou e2e) qui le démontre, ou écris « non couvert ».
3. Contrat : chaque appel correspond à une opération de docs/api-reference.md (chemin, méthode, champs) ; les codes d'erreur traités sont ceux documentés ; aucun champ inventé.
4. Couches : aucun HttpClient ni subscribe de requête dans un composant ; aucune transformation de DTO hors data/ ; état serveur dans un store, pas dupliqué dans un composant.
5. Trois états : vide, chargement, erreur présents pour chaque bloc de données, via shared/ui/state.
6. Couleurs, textes, URLs en dur ; secrets ; authorType envoyé en écriture ; routes agenda ou signalements.
7. Dépendances : toute nouvelle entrée de package.json est annoncée dans la PR, version figée.
8. Accessibilité : rôles ARIA des panneaux et listes, labels de formulaire, parcours clavier décrit dans un e2e, axe-core appelé.
9. i18n : messages.fr.xlf à jour ; aucune chaîne utilisateur hors $localize.
```

## 2.6 Fichiers git et branche

```bash
printf '.claude/worktrees/\n.env\n.env.*\n' >> .gitignore
git add -A && git commit -m "CLAUDE.md, agents, settings (M0-08 web)" && git push
```

`main` est protégée dans GitHub (PR obligatoire) ; `psymate-web#1` a déjà posé les docs.

## 2.7 Comment vous lancez un agent (toujours la même manœuvre)

```bash
cd ~/psymate-web
git checkout main && git pull
claude --worktree <ID>        # exemple : claude --worktree M1-06
```

Puis collez le prompt du lot. L'agent travaille dans `.claude/worktrees/<ID>/` sur la branche `worktree-<ID>` et ouvre une PR.

**Pour les e2e**, l'API doit tourner : dans `../psymate-api`, `make up && make run`, puis `make seed SIZE=small` une fois (comptes `claire.seed@example.test` / `karim.seed@example.test`, mot de passe dans `tools/seed/README.md`). Les e2e de la CI web lancent l'API en service Docker.

**Quand un agent a fini** :
1. Dans le même terminal : `Lance le sous-agent reviewer sur cette branche et corrige ce qu'il marque bloquant.`
2. Lisez vous-même trois choses dans la PR : le test e2e (il raconte ce que fait l'écran), la liste des écarts fiche ↔ contrat, le diff de `package.json` s'il y en a un.
3. Ouvrez l'écran en local (`pnpm start`) et comparez à la maquette `.html`.
4. Fusionnez en squash : `gh pr merge <numéro> --squash --delete-branch`. Quittez l'agent, acceptez la suppression du worktree.
5. `make -C ../psymate-api log TASK=<ID> AGENT=claude STATUS=merged SUMMARY="PR … fusionnée"`.

**Règle d'or** : on ne lance une tâche que quand **toutes** ses dépendances (colonne « Dépend de », révisée par C10) sont fusionnées. Un seul agent par feature à la fois.

---

# Partie 3 — Les lots, dans l'ordre des briques

Chaque lot indique : ce qu'il faut avoir fusionné avant ; les agents à lancer (un terminal chacun) ; pour chaque agent, la tâche en clair, puis le prompt à coller tel quel.

## Lot 0 — Le socle

**Avant de lancer** : Partie 2 terminée ; la décision Angular 22 / pnpm écrite dans G (Q51, fait).
**Agents** : M0-06 seul, puis M0-07 seul, puis M0-09 seul (chacun pose ce que le suivant utilise).

### Agent 1 · tâche M0-06 — Initialiser `psymate-web`

**En clair** : remplacer le scaffold par le vrai projet : Angular 22 standalone zoneless, pnpm, Material 22 avec le thème Nordique construit sur `tokens.css`, `@angular/localize` FR/EN, ESLint (frontières, `no-hardcoded-color`), Prettier, Vitest, Playwright, CI GitHub Actions. Aucun écran.

```bash
claude --worktree M0-06
```

```text
Tâche M0-06 — Initialiser psymate-web (dépôt psymate-web, racine). Utilise l'agent frontend-feature-dev.

Contexte : lis CLAUDE.md, docs/C-plan.md « Décisions d'outillage » (Build frontend, Versions, CI) et C2 ligne M0-06, docs/G-decisions.md (Q51 : Angular 22 + pnpm ; Q50 : Node 24 figé dans engines.node, .nvmrc et la CI), docs/B-ux.md B7 (bibliothèque de composants, i18n, accessibilité), docs/Etude-couleurs-Nordique.md §8 (thème Material et variables CSS, test de non-régression), docs/handbook/architecture-frontend.html §3 (arborescence) et §12.

Objectif : un projet Angular 22 (CLI 22, standalone, zoneless, provideExperimentalZonelessChangeDetection ou l'équivalent stable de la ligne 22 : vérifie dans la documentation officielle, pas de mémoire), géré par pnpm (packageManager figé), avec Angular Material 22 (M3) dont le thème est construit à partir de src/theme/tokens.css (variables de l'étude §8, thèmes light / dark / soft par data-theme), @angular/localize avec messages.fr.xlf source et messages.en.xlf, ESLint + Prettier avec les règles : no-hardcoded-color (aucun hexa dans src/app hors theme), eslint-plugin-boundaries (éléments core, shared, api, feature : une feature n'importe pas l'intérieur d'une autre ; api importé seulement depuis **/data/*.api.ts ; admin n'importe aucune feature patient), Vitest (pnpm test), Playwright avec axe-core (pnpm e2e, config qui attend http://localhost:8080/actuator/health), script pnpm check:tokens (tools/check-tokens.mjs : contraste ≥ 4,5:1 texte et 3:1 icônes pour chaque couple déclaré, deux thèmes), proxy.conf.json /api → :8080, arborescence vide de docs/handbook §3 (core/, api/ vide avec un README « généré », shared/, features/ avec un README), .github/workflows/ci.yml (lint → check:tokens → test → build → e2e avec l'API psymate-api en service Docker et Postgres, seed small). Budgets de build raisonnables. Supprime l'ancien scaffold (caseload, patient-detail).

Périmètre : racine, src/, .github/, tools/. Aucun écran, aucun store, aucun client généré (c'est M0-07).

Critères d'acceptation (C2 M0-06) :
- pnpm lint, pnpm check:tokens, pnpm test, pnpm build verts en local et en CI ;
- une fixture qui viole une frontière (features/admin important features/patients) fait échouer pnpm lint ; une couleur hexa dans un composant aussi ;
- bascule FR/EN fonctionnelle sur une page vide ;
- test de contraste vert sur les deux thèmes.

Tests : un test de composant minimal, le test de contraste, les fixtures ESLint.

Interdits : dépendance non listée dans la PR ; plage de version ; code d'écran.

Livrable : PR « M0-06 Initialiser psymate-web », pnpm lint/test/build verts.
```

### Agent 2 · tâche M0-07 — Client généré, session, gardes (socle de l'identité, révisé C10)

**En clair** : le pont avec le backend et la mémoire de « qui est là » : `pnpm contract:pull` + client généré, `SessionStore` nourri par `GET /api/auth/me`, les trois gardes, le triage après connexion, une page de connexion minimale pour tester le tout de bout en bout. Les écrans complets viennent en M1-15.

```bash
claude --worktree M0-07
```

```text
Tâche M0-07 — Client généré, SessionStore, gardes, triage (dépôt psymate-web, core/auth, core/http partiel, features/auth minimal). Utilise l'agent frontend-feature-dev. Ligne C2 M0-07 révisée par C10.

Contexte : lis CLAUDE.md, docs/C-plan.md C10 ligne M0-07, docs/handbook/architecture-frontend.html §6 (contrat, cycle d'une requête, session, codes HTTP) et §7, docs/design/00-composants-partages.md « Emplacement et stores », docs/design/11-connexion.md (réponses de POST /api/auth/login), docs/api-reference.md sections Authentification (login, logout, GET /api/auth/me avec role, twoFactorEnabled, passwordChangeRequired ; GET /api/auth/session) et l'introduction (format problem+json), docs/G-decisions.md Q5, Q6, docs/contract/README.md (table des tags).

Objectif : fichier CONTRACT_TAG = contract-v0.11.0 ; script pnpm contract:pull (tools/contract-pull.mjs : vérifie que docs/contract/openapi.yaml porte la version du tag, lance @openapitools/openapi-generator-cli typescript-angular vers src/app/api avec un service par tag, withInterfaces, stringEnums ; version du générateur figée) et src/app/api commité ; core/auth : SessionStore (signalStore : me, authenticated, role, verificationStatus, passwordChangeRequired, twoFactorEnabled, status ; load() via GET /api/auth/me, clear()), APP_INITIALIZER qui appelle load() et tolère le 401, authGuard (→ /connexion?next=), roleGuard('admin') (→ /patients), statusGuard (email_pending → /confirmer-email ; rejected | suspended → /compte-suspendu ; passwordChangeRequired → /premiere-connexion), afterLogin() qui applique le triage du handbook §8.3 ; core/http : credentials.interceptor (withCredentials, Accept), problem.interceptor (problem+json → ApiProblem typé, api-problem.ts), auth-redirect.interceptor (401 → clear + /connexion?next= ; 403 EMAIL_NOT_CONFIRMED / ACCOUNT_SUSPENDED / PASSWORD_CHANGE_REQUIRED / TWO_FACTOR_REQUIRED / ADMIN_ROLE_REQUIRED → redirections) ; features/auth : page /connexion minimale (e-mail, mot de passe, rester connecté, bloc OTP qui apparaît sur 202 otpRequired, messages 401 unique / 423 avec Retry-After), POST /api/auth/logout depuis un bouton provisoire ; routes : /connexion publique, /patients protégée avec une page vide « Mes patients » provisoire.

Périmètre : CONTRACT_TAG, tools/contract-pull.mjs, src/app/api (généré), src/app/core/auth/**, src/app/core/http/** (les trois intercepteurs ci-dessus ; retry-after et offline sont M0-09), src/app/features/auth/** (page minimale), app.config.ts, app.routes.ts, e2e/flux-1-connexion/. Aucun composant partagé (M0-09), aucun écran complet (M1-15).

Critères d'acceptation (C2 M0-07 révisé C10) :
- pnpm contract:pull regénère src/app/api à l'identique (diff vide) ;
- e2e : se connecter avec un compte du seed → arrive sur /patients ; sans session, /patients → /connexion?next=/patients ;
- e2e : identifiants faux → message unique ; compte 2FA du seed (ou activé dans le test) → bloc OTP sur 202 ;
- test unitaire du triage afterLogin() : chaque statut va au bon endroit (table de cas) ;
- test unitaire de problem.interceptor : un 422 problem+json devient un ApiProblem avec errors[].

Tests : SessionStore (api simulé), afterLogin, intercepteurs, e2e flux 1 (partie connexion).

Interdits : éditer src/app/api ; stocker un jeton ; composant de shared/ui ; dépendance non annoncée.

Livrable : PR « M0-07 Client généré, session, gardes », pnpm lint/test/build verts, e2e vert.
```

### Agent 3 · tâche M0-09 — Socle UI partagé (fiche 00)

**En clair** : les pièces communes que tous les écrans réutilisent : barre d'application, bandeau d'état, layout public, navigation Mon compte, panneau latéral, composant « état », toasts, confirmation, icônes de type ; les deux derniers intercepteurs ; les raccourcis ; `applyProblem`. Aucun écran métier.

```bash
claude --worktree M0-09
```

```text
Tâche M0-09 — Socle UI partagé (dépôt psymate-web, shared/ui, shared/forms, shared/util, core/http, core/shortcuts, core/theme, core/i18n). Utilise l'agent frontend-feature-dev. Ligne C10 M0-09.

Contexte : lis CLAUDE.md, docs/C-plan.md C10 ligne M0-09, docs/design/00-composants-partages.md en entier, docs/design/29-etats.md (composant État, toasts, confirmation, codes d'erreur), docs/B-ux.md B2 (navigation, raccourcis, en-tête patient permanent — l'en-tête lui-même est M1-07, mais le composant patient-header de shared/ui est à toi), B7, docs/Etude-couleurs-Nordique.md §4–§8, docs/handbook/architecture-frontend.html §5, §9, §10, docs/api-reference.md introduction (codes, Retry-After). Maquettes : 01, 02, 10, 11, 20 pour les barres et layouts ; 05, 06 pour le panneau ; 29 pour les états.

Objectif : shared/ui : app-bar (logo PsyMate, section, champ de recherche ouvert par /, FR/EN, avatar + menu Déconnexion), status-banner (ambre tant que verificationStatus ≠ approved, lien vers le dossier), public-layout (bandeau Annuaire · Comment ça marche · Espace praticien, pied sans numéros d'urgence, conteneur 480 px pour les formulaires), account-nav (220 px, six entrées, pastilles publié / état du dossier, onglets à 390 px), admin-bar (sombre, onglets Validation · Praticiens · Journal · Vocabulaire, rappel « aucune donnée patient »), patient-header (nom, âge, suivie depuis, drapeaux, séance courante, boutons Démarrer / Clôturer en output(), onglets 1 2 3, emplacement de la bascule Vue et de la barre de capture : composant bête, le store est M1-07), side-panel (role="dialog", aria-modal, 480 px ou 420 px, voile, piège de focus, retour du focus, Échap, pile de deux), state (kind empty | loading | error, title, message, action, details, aria-busy, role status / alert, squelettes), toast (succès / info / avertissement, 6 s, aria-live, action optionnelle), confirm-dialog (variante destructive avec nom à retaper), entry-icon (six formes + couleurs) ; shared/forms : applyProblem(form, problem), field-errors, validateurs communs ; shared/util : formatOccurred() pour les six précisions, cursor, Loadable ; core/http : retry-after.interceptor (429 : toast avec Retry-After, un rejeu pour GET), offline.interceptor (statut 0 : bandeau « Connexion perdue · brouillons conservés », rejeu au retour) ; core/shortcuts (N / L 1 2 3 M Échap ?, inactifs dans un champ) ; core/theme (ThemeService : data-theme light / dark / soft / system) ; core/i18n (subjectLabel pipe patient / client, formats Intl) ; une page /_demo (hors production) qui montre chaque composant dans ses états pour la revue et axe-core.

Périmètre : src/app/shared/**, src/app/core/{http,shortcuts,theme,i18n}/**, la page de démonstration, tests, e2e/socle/. Aucune feature métier.

Critères d'acceptation (C10 M0-09, fiche 00) :
- chaque composant a ses trois états et un test de composant ;
- side-panel : Échap ferme, le focus revient au déclencheur, aucun élément derrière le voile n'est focusable (test) ;
- un import de features/** depuis shared/** fait échouer pnpm lint ;
- 429 avec Retry-After → toast « réessayez dans N s », la requête GET est rejouée une fois ;
- axe-core 0 violation « serious » sur /_demo dans les deux thèmes ;
- aucune valeur hexadécimale hors src/theme.

Tests : composants (Vitest + Testing Library), intercepteurs, shortcuts, e2e /_demo + axe-core.

Interdits : écran métier ; store métier ; dépendance non annoncée (annonce @ngrx/signals, @axe-core/playwright si tu les ajoutes ici).

Livrable : PR « M0-09 Socle UI partagé », pnpm lint/check:tokens/test/build verts, e2e vert.
```

**M0-08 (volet web)** : fait à la main en Partie 2 (`CLAUDE.md`, `settings.json`, agents). Rien à lancer.

**Après fusion des trois** : le dépôt sait se connecter, afficher une page avec la barre et les états. Toutes les briques suivantes peuvent commencer selon leurs dépendances.

---

## Lot 1 — Identité et compte

**Avant de lancer** : M0-07 et M0-09 fusionnés.
**Agents** : 2 en parallèle (`auth` : M1-15 ; `account` : M1-16), puis 2 en parallèle (`account` : M1-17 ; `auth` : M1-18).

### Agent 1 · tâche M1-15 — Connexion, inscription, dossier professionnel (écrans complets)

**En clair** : les trois écrans publics et le premier écran du compte, tels que les fiches 11, 12, 13 les décrivent, sur le socle de M0-07 : validation inline, jauge de force, OTP, dépôt de justificatifs par glisser-déposer, bandeau d'état.

```bash
claude --worktree M1-15
```

```text
Tâche M1-15 — Écrans connexion, inscription, dossier professionnel (dépôt psymate-web, features/auth et features/account/verification). Utilise l'agent frontend-feature-dev. Ligne C6 M1-15 révisée par C10.

Contexte : lis CLAUDE.md, docs/C-plan.md C6 ligne M1-15 et C10, docs/design/11-connexion.md, 12-inscription.md, 13-dossier-professionnel.md (+ maquettes), docs/design/00-composants-partages.md (public-layout, account-nav, status-banner, side-panel : à réutiliser), docs/api-reference.md : POST /api/auth/login (déjà branché par M0-07 : tu complètes l'écran), POST /api/auth/register (champs, 201 identique, anti-énumération), GET /api/me/verification, POST /api/me/verification/documents (multipart, 10 Mo, types), DELETE …/{id}, GET …/{id}/url, POST /api/me/verification/submit, PATCH /api/me/professional-info ; docs/G-decisions.md Q14 (diplôme + pièce d'identité pour toutes les professions), Q21, Q23.

Objectif : /connexion complet (fiche 11 : rester connecté, OTP, 423 avec compte à rebours, liens mot de passe oublié et inscription) ; /inscription (fiche 12 : trois sections, profession en trois cartes, n° pro, téléphone, adresse ou visio uniquement, consentements, jauge de force ≥ 12 caractères, colonne « Ensuite », 201 → /confirmer-email en attente) ; /mon-compte/dossier-professionnel (fiche 13 : progression en quatre jalons, informations professionnelles, liste des justificatifs typés avec statut, dépôt par glisser-déposer avec progression et erreurs 413 / 415, règle de complétude côté serveur reflétée, « Soumettre » et « Plus tard », tableau des états et verrous) ; bandeau d'état global branché sur verificationStatus.

Périmètre : src/app/features/auth/** (pages login, register), src/app/features/account/pages/verification.page.ts + ui/ + data/ (verification.store, verification.api), messages.fr.xlf, e2e/flux-9-inscription-dossier/. Aucun composant partagé modifié.

Critères d'acceptation (fiches 11, 12, 13) :
- les critères cochables des trois fiches, chacun avec son test ;
- inscription avec un e-mail déjà utilisé : même 201, même écran (e2e vérifie dans Mailpit l'e-mail « vous avez déjà un compte ») ;
- dépôt d'un PDF de 11 Mo → message sous le champ, dossier inchangé ;
- « Soumettre » désactivé tant que diplôme et pièce d'identité manquent ; après submit, statut under_review et bandeau ambre sur /patients ;
- axe-core 0 violation ; parcours clavier e2e (inscription complète sans souris).

Tests : stores (api simulé), composants, e2e flux 9.

Interdits : modifier core/auth (M0-07) ou shared/ui ; fiche 25 / 27 (M1-18) ; dépendance non annoncée.

Livrable : PR « M1-15 Écrans d'identité », pnpm lint/test/build verts, e2e vert.
```

### Agent 2 · tâche M1-16 — Préférences par compte (révisée C10)

**En clair** : le `PreferencesStore` que tous les écrans lisent, et la page Préférences (fiche 14) : affichage, vocabulaire, durée de séance, thème appliqué immédiatement, langue. La bascule de la vue d'ensemble sera branchée par M4-05.

```bash
claude --worktree M1-16
```

```text
Tâche M1-16 — PreferencesStore et page Préférences (dépôt psymate-web, core/preferences et features/account/preferences). Utilise l'agent frontend-feature-dev. Ligne C6 M1-16 scindée par C10.

Contexte : lis CLAUDE.md, docs/C-plan.md C10 ligne M1-16, docs/design/14-preferences-praticien.md (+ maquette ; tableau des clés et défauts), docs/design/17-emotions-personnalisees.md (seulement pour savoir que la section Émotions est M1-09 : ici un lien), docs/design/00-composants-partages.md, docs/handbook/architecture-frontend.html §7 et §12, docs/api-reference.md : GET / PATCH /api/me/preferences (merge RFC 7396, clés inconnues ignorées), docs/G-decisions.md Q23 (langue), « sessions.defaultDurationMin = 60 ».

Objectif : core/preferences : PreferencesStore (clés de la fiche 14 avec leurs défauts par profession, load() au login après SessionStore, set(key, value) optimiste avec PATCH et repli sur la valeur serveur en cas d'erreur, cache localStorage.prefs lu au démarrage seulement), preferences.api.ts ; ThemeService et LocaleService (M0-09) branchés sur theme et locale ; subjectLabel branché sur vocabulary.subjectLabel ; page /mon-compte/preferences (fiche 14 : Affichage, Vocabulaire et saisie, Émotions personnalisées = lien vers /mon-compte/emotions, Compte et sécurité = résumé avec lien vers /mon-compte/securite ; chaque réglage s'enregistre immédiatement avec « Enregistré »). La bascule de la vue d'ensemble et le sélecteur de fenêtre ne sont pas ici (M4-05, M4-07) mais lisent les mêmes clés.

Périmètre : src/app/core/preferences/**, src/app/features/account/pages/preferences.page.ts + ui/, messages, e2e/preferences/.

Critères d'acceptation (fiche 14, C10) :
- changer le thème : appliqué sans rechargement, PATCH envoyé, conservé après reconnexion dans un autre contexte de navigateur (e2e) ;
- une erreur sur le PATCH ramène la valeur serveur et affiche un toast ;
- un coach lit « client » dans la barre et sur /patients (pipe subjectLabel) ;
- localStorage.prefs absent ou corrompu : l'application démarre quand même ;
- PATCH partiel conserve les autres clés (test du store avec api simulé).

Tests : PreferencesStore (table de cas), page, e2e.

Interdits : toucher à core/auth ; écrire la bascule de la vue d'ensemble ; dépendance non annoncée.

Livrable : PR « M1-16 Préférences », pnpm lint/test/build verts, e2e vert.
```

### Agent 3 · tâche M1-17 — Compte et sécurité, activation 2FA, première connexion admin

**En clair** : la fiche 18 : mot de passe, 2FA en trois étapes, désactivation, codes de secours, déconnexion des autres appareils ; et l'écran bloquant de première connexion imposé à un administrateur.

```bash
claude --worktree M1-17
```

```text
Tâche M1-17 — Compte et sécurité, 2FA, première connexion (dépôt psymate-web, features/account/security et features/auth/first-login). Utilise l'agent frontend-feature-dev. Ligne C9 M1-17.

Contexte : lis CLAUDE.md, docs/C-plan.md C9 ligne M1-17, docs/design/18-compte-securite.md (+ maquette, trois états ; section « Écarts avec la maquette » : ce qui est hors V1), docs/design/11-connexion.md (bloc OTP), docs/handbook/architecture-frontend.html §8.3 et §8.5, docs/api-reference.md : POST /api/auth/password/change, POST /api/me/2fa/enable → secret + otpauthUri, POST /api/me/2fa/verify → dix codes, POST /api/me/2fa/disable, POST /api/me/2fa/recovery-codes/regenerate, POST /api/auth/sessions/revoke-others, GET /api/me/security et POST /api/me/sessions/{id}/revoke (v0.11.0), GET /api/auth/me (role, twoFactorEnabled, passwordChangeRequired), POST /api/auth/email/change (compte confirmé, v0.10.0) ; docs/G-decisions.md Q5, Q6.

Objectif : /mon-compte/securite (fiche 18 A : cartes E-mail (changement avec confirmation sur la nouvelle adresse), Mot de passe, Double authentification (état, activer / désactiver, régénérer), Sessions actives (liste de GET /api/me/security, session courante marquée, révocation unitaire, « Déconnecter les autres »), Connexion précédente) ; panneau /mon-compte/securite/2fa (fiche 18 B : QR dessiné côté web depuis otpauthUri, secret copiable, OTP, codes de secours affichés une fois avec « Télécharger » et case « je les ai enregistrés ») ; /premiere-connexion (fiche 18 C : étape 1 nouveau mot de passe, étape 2 2FA obligatoire pour un admin, déclenché par passwordChangeRequired et par les 403 PASSWORD_CHANGE_REQUIRED / TWO_FACTOR_REQUIRED, aucun accès à /admin avant la fin).

Périmètre : src/app/features/account/pages/security.page.ts, panels/, ui/ (otp-input si absent de shared, recovery-codes), data/ (security.store, security.api), src/app/features/auth/pages/first-login.page.ts, messages, e2e/securite/. Le dessin du QR : une petite bibliothèque est acceptable si annoncée dans la PR, version figée.

Critères d'acceptation (fiche 18, C9) :
- activer la 2FA puis se reconnecter exige le code (e2e avec un TOTP calculé dans le test depuis le secret) ; code faux → message unique ;
- désactiver exige mot de passe + code ; régénérer invalide les anciens codes (le serveur le dit, le web l'affiche) ;
- un admin créé par make admin (../psymate-api) arrive sur /premiere-connexion, change son mot de passe, active la 2FA, puis entre sur /admin ; avant, /admin le renvoie vers l'étape manquante ;
- révoquer une autre session la ferme (e2e avec deux contextes) ;
- axe-core 0 violation ; parcours clavier complet.

Tests : stores, composants, e2e sécurité.

Interdits : exposer le secret ailleurs que dans le panneau ; modifier core/auth ; dépendance non annoncée.

Livrable : PR « M1-17 Compte et sécurité », pnpm lint/test/build verts, e2e vert.
```

### Agent 4 · tâche M1-18 — Confirmation d'e-mail et compte suspendu / refusé

**En clair** : les fiches 25 et 27 : les trois états de la confirmation (en attente, lien, expiré) et l'écran d'un compte refusé ou suspendu (lecture seule, export du compte, recours).

```bash
claude --worktree M1-18
```

```text
Tâche M1-18 — Confirmation d'e-mail, compte suspendu / refusé (dépôt psymate-web, features/auth). Utilise l'agent frontend-feature-dev. Ligne C10 M1-18.

Contexte : lis CLAUDE.md, docs/C-plan.md C10 ligne M1-18, docs/design/25-confirmation-email.md et 27-compte-suspendu.md (+ maquettes), docs/design/19-donnees-export.md (le même export du compte, pour un compte actif), docs/handbook/architecture-frontend.html §8.3 et §8.4, docs/api-reference.md : POST /api/auth/email/confirm, POST /api/auth/email/resend (202, limites), POST /api/auth/email/change (compte email_pending), POST /api/me/export et GET /api/me/export/{jobId} et …/file (appelables par un compte suspendu avec email + password + otp selon la fiche 27 : vérifie le corps exact dans le contrat), POST /api/me/appeal (un seul ouvert, 409 sinon) ; docs/G-decisions.md Q18, Q28.

Objectif : /confirmer-email (en attente : renvoyer avec limite affichée, corriger l'adresse), /confirmer-email/:token (traitement : 204 → session ouverte → /patients ; 410 → /confirmer-email/expire), /confirmer-email/expire ; /compte-suspendu (motif et date, ce qui reste permis, bouton « Exporter mes dossiers » avec suivi du job et lien 7 jours / 410, formulaire de recours une seule fois puis état du recours, déconnexion) ; statusGuard et intercepteur 403 (M0-07) déjà en place : tu branches les pages.

Périmètre : src/app/features/auth/pages/{confirm-email, suspended}.page.ts + ui/ + data/, messages, e2e/flux-9-confirmation/ et e2e/compte-suspendu/.

Critères d'acceptation (fiches 25, 27) :
- lien de confirmation lu dans Mailpit → session ouverte, liste vide ; lien réutilisé → page expirée ;
- un compte suspendu (suspendu par l'API admin dans le test) ne peut atteindre aucune route d'écriture : /patients/:id/overview s'affiche en lecture seule, l'éditeur est inaccessible ;
- deuxième recours → message « un recours est déjà en cours » (409) ;
- export : job lancé, lien affiché, 410 affiché proprement après expiration (horloge de test côté API si disponible, sinon cas unitaire) ;
- axe-core 0 violation.

Tests : stores, composants, e2e.

Interdits : modifier core/auth ou shared/ui ; dépendance non annoncée.

Livrable : PR « M1-18 Confirmation et compte suspendu », pnpm lint/test/build verts, e2e vert.
```

---

## Lot 2 — Le dossier patient, base

**Avant de lancer** : M0-09 et M1-16 fusionnés (M1-06 lit `subjectLabel` et les préférences).
**Agents** : M1-06 seul, puis M1-07 seul, puis M1-08 ∥ M1-09.

### Agent 1 · tâche M1-06 — Liste des patients et fiche patient (révisée C10)

```bash
claude --worktree M1-06
```

```text
Tâche M1-06 — Liste des patients et fiche patient (dépôt psymate-web, features/patients). Utilise l'agent frontend-feature-dev. Ligne C2 M1-06 révisée par C10 (fiche 16 en entier).

Contexte : lis CLAUDE.md, docs/C-plan.md C10 ligne M1-06, docs/design/01-liste-patients.md et 16-fiche-patient.md (+ maquettes ; section « Écarts avec la maquette » de couverture-ecrans.md : archivage = DELETE /api/patients/{id}, restauration = POST …/restore), docs/B-ux.md B3 flux 2, B4 écran 1, docs/design/00-composants-partages.md, docs/handbook/architecture-frontend.html §8 (anatomie d'une feature), docs/api-reference.md section Patients (GET /api/patients avec curseur, filtres, tri ; POST ; GET / PATCH /api/patients/{id} ; DELETE ; POST …/restore ; GET …/versions ; POST / DELETE …/flags ; PUT …/tags ; 422 avec errors[].code depuis M10-05), section Tags ; docs/G-decisions.md Q7.

Objectif : /patients (fiche 01 : filtre avec accents ignorés, tri, puces rapides, « afficher les archivés », tableau avec émotions dominantes et situations actives si l'API les fournit sinon colonne absente, raccourcis N et /, états vide / chargement / erreur, bouton Nouveau patient) ; /patients/nouveau et /patients/:id/fiche (fiche 16 : identité, contexte, suivi, drapeaux avec raison, tags du praticien, zone d'archivage avec nom à retaper et toast « Restaurer », historique des versions champ par champ, aperçu de l'en-tête) ; PatientStore et PatientApi ; après création → /patients/:id/overview.

Périmètre : src/app/features/patients/**, messages, e2e/flux-2-creer-patient/.

Critères d'acceptation (C2 M1-06, fiches 01, 16) :
- e2e : créer un patient, le retrouver dans la liste (filtre « marie » trouve « Marie D. », « marié » aussi), ouvrir sa fiche, modifier le rythme → « 2 versions », l'archiver avec le nom retapé, le restaurer ;
- 422 (displayName manquant, date future) → messages sous les champs via applyProblem, focus sur le premier ;
- un coach voit « Mes clients » et « Nouveau client » ;
- N ouvre la création depuis la liste ; / focalise le filtre ;
- trois états de la liste et de la fiche (tests de composant) ; axe-core 0 violation.

Tests : PatientStore, composants, e2e flux 2.

Interdits : composant partagé modifié ; appel HTTP hors data/patient.api.ts ; dépendance non annoncée.

Livrable : PR « M1-06 Liste et fiche patient », pnpm lint/test/build verts, e2e vert.
```

### Agent 2 · tâche M1-07 — Page patient et en-tête permanent (révisée C10)

```bash
claude --worktree M1-07
```

```text
Tâche M1-07 — Page patient, en-tête permanent, mémoire des onglets (dépôt psymate-web, features/patient-shell). Utilise l'agent frontend-feature-dev. Ligne C2 M1-07 révisée par C10.

Contexte : lis CLAUDE.md, docs/C-plan.md C10 ligne M1-07, docs/B-ux.md B2 (modèle de navigation, en-tête patient permanent, mémoire des onglets), docs/design/00-composants-partages.md §2, docs/design/02-vue-ensemble-patient.md (en-tête), docs/handbook/architecture-frontend.html §6.2, §7, §11 (PatientShellStore), docs/api-reference.md section Séances (GET /api/patients/{id}/sessions/current, POST …/sessions/start, POST …/sessions/contact, POST /api/sessions/{id}/close avec durationMin et summary) et Patients (GET /api/patients/{id}).

Objectif : route /patients/:id avec enfants overview | timeline | graph | search (pages provisoires vides pour timeline, graph, search, overview : chacune sera remplacée par sa tâche), PatientShellStore (patient, currentSession, lastSession, tabs : état mémorisé par onglet, status, problem ; load, startSession, contactSession, closeSession avec durée par défaut prefs.defaultDurationMin, rememberTab / recallTab), le composant patient-header de shared/ui branché (séance courante avec durée qui s'écoule, Démarrer / Clôturer avec dialogue durée + compte rendu, onglets 1 2 3 par touche et par clic, emplacement de la bascule Vue (branchée en M4-05) et de la barre de capture (champ « Noter quelque chose… » qui ouvrira l'éditeur en M1-08 : ici un output)), conservation de l'état des onglets pendant la navigation interne.

Périmètre : src/app/features/patient-shell/**, app.routes.ts (la branche /patients/:id), messages, e2e/shell/.

Critères d'acceptation (C2 M1-07 révisé) :
- changer d'onglet et revenir conserve l'état (test avec une page provisoire qui écrit un compteur dans rememberTab) ;
- Démarrer la séance → l'en-tête passe « en cours », sans rechargement ; Clôturer propose 60 min (ou la préférence), envoie POST close, l'en-tête montre « Dernière séance » ;
- 1 2 3 changent d'onglet, pas quand un champ a le focus ;
- un patient d'un autre praticien (403 PATIENT_FORBIDDEN) → état erreur du shell, pas de redirection ;
- axe-core 0 violation.

Tests : PatientShellStore, e2e shell.

Interdits : écrire les onglets (tâches suivantes) ; modifier shared/ui/patient-header (si un input manque, arrête-toi et dis-le) ; dépendance non annoncée.

Livrable : PR « M1-07 Page patient et en-tête », pnpm lint/test/build verts, e2e vert.
```

### Agent 3 · tâche M1-08 — Éditeur d'entrée et historique des versions

```bash
claude --worktree M1-08
```

```text
Tâche M1-08 — Éditeur d'entrée (panneau) et historique des versions (dépôt psymate-web, features/entries). Utilise l'agent frontend-feature-dev. Ligne C2 M1-08.

Contexte : lis CLAUDE.md, docs/C-plan.md C2 ligne M1-08, docs/design/05-editeur-entree.md en entier (+ maquette, états A et B ; « Écarts avec la maquette » : pas de restauration de version, rail « Lié à » = M2-05, barre de commande = M6-02), docs/B-ux.md B4 écran 5, docs/design/00-composants-partages.md (side-panel), docs/design/17-emotions-personnalisees.md (création custom en ligne), docs/api-reference.md : POST /api/patients/{id}/entries (schéma par type : note, event, situation, feeling avec emotionCode et intensity, session, medication ; occurred avec precision ; sessionId ; visibility), PATCH /api/entries/{id} avec reason, GET /api/entries/{id}, GET /api/entries/{id}/versions, GET /api/vocabulary/emotions, POST /api/me/emotions, GET /api/vocabulary/entry-types, GET /api/patients/{id}/sessions/current ; docs/G-decisions.md Q31 (grâce 1 h 15), A11 (authorType jamais envoyé) ; docs/E-modele-donnees.md E5.2 (familles et couleurs).

Objectif : panneau entry-editor ouvert depuis le shell (touche N, bouton +, champ « Noter quelque chose… », ?entry=<id> pour la correction) : six types en chips avec forme et couleur, champs minimaux par type, émotion avec autocomplétion et création custom en ligne (famille obligatoire, 409 affiché), curseur d'intensité au clavier, précision temporelle (six valeurs) et date, séance présélectionnée (courante sinon dernière, modifiable), « Plus » replié (visibilité, tags, valence si le contrat l'a sinon rien), brouillon Ctrl+S conservé à Échap, Enregistrer ⏎ ; en correction : bandeau grâce / hors grâce calculé depuis recordedAt et versioning (1 h 15), champ motif, « Enregistrer la version n » ; panneau version-history (liste, diff champ par champ, lecture seule) ; EntryEditorStore ; index.ts exporte openEntryEditor(patientId, options).

Périmètre : src/app/features/entries/**, messages, e2e/flux-3-saisie/ (partie éditeur).

Critères d'acceptation (C2 M1-08, fiche 05) :
- e2e : saisir un ressenti 8/10 en moins de 20 s au clavier (N → type → émotion → intensité → ⏎), mesuré ;
- corriger après la fenêtre de grâce (horloge de l'API ou entrée du seed) → « 2 versions » dans l'historique ; dans la fenêtre → aucune version créée ;
- entrée sans séance refusée par l'API (SESSION_REQUIRED) → message sous le champ séance ;
- émotion custom créée en ligne réutilisable dans l'autocomplétion ; doublon → 409 affiché ;
- Échap conserve le brouillon, rouvrir le retrouve ;
- aucun authorType dans les corps envoyés (test du store) ; axe-core 0 violation.

Tests : EntryEditorStore (table de cas par type), composants, e2e.

Interdits : rail « Lié à » (M2-05) ; grammaire de la barre (M6-01) ; modifier shared/ui/side-panel ; dépendance non annoncée.

Livrable : PR « M1-08 Éditeur d'entrée », pnpm lint/test/build verts, e2e vert.
```

### Agent 4 · tâche M1-09 — Tags et émotions personnalisées

```bash
claude --worktree M1-09
```

```text
Tâche M1-09 — Tags et émotions personnalisées (dépôt psymate-web, features/account/emotions et tags). Utilise l'agent frontend-feature-dev. Ligne C2 M1-09 (la langue est passée en M1-16).

Contexte : lis CLAUDE.md, docs/C-plan.md C2 ligne M1-09, docs/design/17-emotions-personnalisees.md (+ maquette ; promotion = V2, à ne pas faire), docs/design/14-preferences-praticien.md (section Émotions personnalisées : lien), docs/api-reference.md sections Vocabulaire et Tags (GET /api/vocabulary/emotions, POST / PATCH /api/me/emotions, POST …/{code}/merge, POST …/merges/{id}/undo ; GET / POST /api/tags, PATCH /api/tags/{id}, POST /api/tags/{id}/merge ; 422 TAG_IS_EMOTION) ; docs/G-decisions.md Q8, Q11.

Objectif : /mon-compte/emotions (fiche 17 : liste des custom avec famille et usage, ajouter, renommer, fusionner deux custom avec aperçu et annulation possible 30 jours, journal des fusions) ; /mon-compte/tags (liste, renommer, fusionner avec aperçu « réétiquette N entrées ») ; un tag égal à une émotion → message avec l'émotion proposée.

Périmètre : src/app/features/account/pages/{emotions,tags}.page.ts + ui/ + data/, messages, e2e/vocabulaire/.

Critères d'acceptation (C2 M1-09, fiche 17) :
- fusionner deux tags → les entrées du seed portant l'ancien tag portent le nouveau (e2e qui relit une entrée) ;
- fusionner deux émotions custom puis annuler → la première revient ;
- créer le tag « anxiété » → 422 affiché avec « utiliser l'émotion Anxiété ? » ;
- aucun bouton « Proposer au global » (V2) ; axe-core 0 violation.

Tests : stores, composants, e2e.

Interdits : toucher à features/entries ; dépendance non annoncée.

Livrable : PR « M1-09 Tags et émotions », pnpm lint/test/build verts, e2e vert.
```

---

## Lot 3 — Les vues du dossier (trois couloirs parallèles)

**Avant de lancer** : M1-07 et M1-08 fusionnés.
**Agents** : 3 couloirs en parallèle : `timeline` (M3-02 → M3-03 → M3-04), `graph` + `entries` (M2-04 → M2-05 → M2-06), `search` (M4-08). Puis `overview` (M4-05 → M4-07) quand M2-06 et M3-02 sont fusionnés.

### Couloir timeline · tâche M3-02 — Composant timeline

```bash
claude --worktree M3-02
```

```text
Tâche M3-02 — Composant timeline (dépôt psymate-web, features/timeline). Utilise l'agent frontend-feature-dev. Ligne C2 M3-02.

Contexte : lis CLAUDE.md, docs/C-plan.md C2 ligne M3-02, docs/design/03-timeline.md en entier (+ maquette, état A ; « Écarts avec la maquette »), docs/B-ux.md B4 écran 3, B2 (navigation vers le graphe, position conservée), docs/A-architecture.md A6 (cibles), docs/handbook/architecture-frontend.html §11 (mémoire des onglets), docs/api-reference.md section Chronologie (GET /api/patients/{id}/timeline : fenêtre, curseur keyset, filtres, facettes, ongoingSituations ; TimelineItemDto avec occurred.precision, authorType, visibility), docs/Etude-couleurs-Nordique.md §4.

Objectif : onglet /patients/:id/timeline en mode chronologique : axe vertical, cartes par type (bordure 3 px + forme, jamais en aplat), précision affichée selon occurred.precision via formatOccurred, bandes de situations en cours chevauchantes, pastille « dit en séance du … », zone « Avant le suivi », virtual scroll CDK avec trois fenêtres en mémoire et curseur, zoom (Ctrl+molette, + −) sans requête tant que la fenêtre couvre, menu contextuel au clavier (Ouvrir, Corriger → openEntryEditor, Lier (L) réservé à M2-04, Voir dans le graphe → route), TimelineStore avec état mémorisé dans le shell (rememberTab), place du marqueur authorType (non dessiné).

Périmètre : src/app/features/timeline/** (sauf filtres et mode par séance : M3-03 ; vue décennie : M3-04), messages, e2e/flux-5-timeline/.

Critères d'acceptation (C2 M3-02, fiche 03) :
- seed medium (ou small + entrées générées) : défilement fluide sur 2 000 entrées (mesure dans la PR), zoom sans requête tant que la fenêtre couvre (test : compteur de requêtes) ;
- une situation en cours s'affiche en bande sur toute sa durée ; une entrée saisie en séance passée porte la pastille ;
- « Corriger » ouvre l'éditeur sur l'entrée ; retour → position de défilement conservée ;
- menu contextuel entièrement au clavier ; axe-core 0 violation.

Tests : TimelineStore (fenêtres, curseur), composants, e2e.

Interdits : filtres et modes (M3-03) ; agrégats (M3-04) ; dépendance non annoncée.

Livrable : PR « M3-02 Timeline », pnpm lint/test/build verts, e2e vert.
```

### Couloir timeline · tâche M3-03 — Filtres et mode par séance

```bash
claude --worktree M3-03
```

```text
Tâche M3-03 — Filtres et mode par séance (dépôt psymate-web, features/timeline). Utilise l'agent frontend-feature-dev. Ligne C2 M3-03. Dépend de M3-02.

Contexte : lis CLAUDE.md, docs/C-plan.md C2 ligne M3-03, docs/design/03-timeline.md (état B, filtres, touche M, préférence timeline.groupBy), docs/design/14-preferences-praticien.md (clé timeline.groupBy), docs/api-reference.md Chronologie (paramètres types, emotions, tags, draftsOnly, includePrivate, facets).

Objectif : puces de filtre par type avec compteurs (facettes), chips émotion et tag, « Brouillons seulement », période ; bascule Chronologique | Par séance par bouton et touche M, qui écrit prefs.set('timeline.groupBy', …) ; mode par séance : séances dépliables (carré arrondi), la dernière dépliée avec durée, modalité, compte rendu, entrées ; les autres repliées avec leur compte ; entrées hors séance signalées ; état des filtres dans l'URL (?types=&emotion=&tag=&drafts=&mode=) et dans la mémoire de l'onglet.

Périmètre : src/app/features/timeline/** (filtres, mode), messages, e2e/flux-5-timeline/ (cas ajoutés).

Critères d'acceptation (C2 M3-03) : e2e : filtrer « anxiété » → seules les entrées concernées, compteurs cohérents ; basculer par séance avec M ; déplier la dernière séance ; recharger l'URL → mêmes filtres ; la préférence est relue sur un autre patient.

Tests : TimelineFiltersStore, e2e.

Interdits : vue décennie ; dépendance non annoncée.

Livrable : PR « M3-03 Filtres et mode par séance », pnpm lint/test/build verts, e2e vert.
```

### Couloir timeline · tâche M3-04 — Vue décennie agrégée

```bash
claude --worktree M3-04
```

```text
Tâche M3-04 — Vue décennie agrégée (dépôt psymate-web, features/timeline). Utilise l'agent frontend-feature-dev. Ligne C2 M3-04. Dépend de M3-02.

Contexte : lis CLAUDE.md, docs/C-plan.md C2 ligne M3-04, docs/design/03-timeline.md (état C), docs/A-architecture.md A6, docs/api-reference.md GET /api/patients/{id}/timeline/summary?granularity=month (periods[] : comptes par type, intensité moyenne, situations longues).

Objectif : au-delà d'une plage de 3 ans (ou zoom maximal), bascule automatique sur l'agrégat mensuel : petites barres par type, courbe d'intensité moyenne, bandes de situations longues, marqueur « début du suivi », étiquette « Agrégé par mois · double-clic pour zoomer » ; double-clic sur un mois → fenêtre détaillée sur ce mois ; retour automatique au détail quand la plage repasse sous 3 ans ; rendu en SVG maison ou ECharts chargé en @defer (annoncer le choix).

Périmètre : src/app/features/timeline/** (décennie), e2e cas ajouté.

Critères d'acceptation (C2 M3-04) : bascule automatique > 3 ans (test) ; résumé décennie du seed < 100 ms côté API relu sans ralentir l'écran (mesure dans la PR) ; double-clic ramène au détail ; aucune couleur en dur (tokens lus par ECharts si utilisé).

Tests : composant, e2e.

Interdits : dépendance non annoncée (ECharts est déjà prévu dans package.json par M0-06).

Livrable : PR « M3-04 Vue décennie », pnpm lint/test/build verts, e2e vert.
```

### Couloir graphe · tâche M2-04 — Éditeur de lien

```bash
claude --worktree M2-04
```

```text
Tâche M2-04 — Éditeur de lien (dépôt psymate-web, features/graph, panneau). Utilise l'agent frontend-feature-dev. Ligne C2 M2-04.

Contexte : lis CLAUDE.md, docs/C-plan.md C2 ligne M2-04 et C4 (le prompt type de cette tâche), docs/design/06-editeur-de-lien.md (+ maquette ; « Écarts » de couverture-ecrans.md : POST /api/entries/{id}/links, PATCH / DELETE /api/links/{id}), docs/B-ux.md B3 flux 4, B4 écran 6, docs/api-reference.md section Liens (GET / POST /api/entries/{id}/links ; PATCH et DELETE /api/links/{id} ; 409 LINK_EXISTS avec existingLinkId ; 422 types incompatibles) et Vocabulaire (GET /api/vocabulary/link-types avec allowedSourceTypes / allowedTargetTypes), docs/E-modele-donnees.md E5.3 (matrice) ; docs/G-decisions.md Q12.

Objectif : panneau link-editor (420 px) ouvert depuis une entrée (touche L, bouton « Lier », ?link=<entryId>) : entrée source, recherche de cible dans le dossier (GET /api/patients/{id}/search limité, M4-08 le fera aussi : ici le champ réutilise l'API), entrées déjà liées grisées, chips des types filtrées par la matrice (types incompatibles désactivés avec aide), inversion du sens, phrase « <source> <verbe> <cible> » en direct, justification, Entrée crée, 409 → « Ce lien existe déjà · Modifier le type ? », liste des liens posés avec modifier / retirer (DELETE = statut superseded, l'API le dit) ; index.ts exporte openLinkEditor(entryId).

Périmètre : src/app/features/graph/panels/link-editor.panel.ts + ui/ + data/link.api.ts, link-editor.store.ts, core/shortcuts (enregistrement de L : si le registre ne permet pas d'enregistrer depuis une feature, arrête-toi et dis-le), messages, e2e/flux-4-lier/.

Critères d'acceptation (C2 M2-04, fiche 06) : e2e « lier deux entrées depuis une entrée ouverte » ; seuls les types autorisés pour le couple sont actifs (test unitaire de filtrage par la matrice) ; inversion recompose la phrase ; lien existant → message 409 avec action « modifier le type » ; retirer un lien le marque retiré dans la liste sans le supprimer ; axe-core 0 violation.

Tests : filtrage (table de cas sur E5.3), store, e2e flux 4.

Interdits : vue graphe (M2-06) ; rail (M2-05) ; dépendance non annoncée.

Livrable : PR « M2-04 Éditeur de lien », pnpm lint/test/build verts, e2e vert.
```

### Couloir graphe · tâche M2-05 — Rail « Lié à… » dans l'éditeur d'entrée

```bash
claude --worktree M2-05
```

```text
Tâche M2-05 — Rail « Lié à… » (dépôt psymate-web, features/entries). Utilise l'agent frontend-feature-dev. Ligne C2 M2-05. Dépend de M2-04 et de l'API M2-02 (links[] dans POST /api/patients/{id}/entries).

Contexte : lis CLAUDE.md, docs/C-plan.md C2 ligne M2-05, docs/B-ux.md B5 (rail : cinq entrées récentes / actives, type proposé selon les types, Tab + Espace), docs/design/05-editeur-entree.md (rail), docs/api-reference.md : POST /api/patients/{id}/entries avec links[] (tout ou rien : un lien invalide annule l'entrée, 422), GET /api/vocabulary/link-types, GET /api/patients/{id}/timeline (pour les cinq entrées récentes / situations actives).

Objectif : dans entry-editor, un rail de cinq cibles (situations actives puis entrées récentes), type de lien proposé selon la matrice (modifiable), sélection par Tab + Espace, envoi dans links[] de la création ; en correction, le rail ouvre l'éditeur de lien (M2-04) au lieu d'envoyer links[].

Périmètre : src/app/features/entries/** (rail), e2e/flux-3-saisie/ (cas ajouté).

Critères d'acceptation (C2 M2-05) : e2e : ressenti lié à un événement en une seule saisie ; lien invalide (type incompatible forcé dans le test) → 422, aucune entrée créée, message sous le rail ; Tab + Espace au clavier.

Tests : store (links[] dans le corps), e2e.

Interdits : modifier features/graph ; dépendance non annoncée.

Livrable : PR « M2-05 Rail Lié à », pnpm lint/test/build verts, e2e vert.
```

### Couloir graphe · tâche M2-06 — Vue graphe

```bash
claude --worktree M2-06
```

```text
Tâche M2-06 — Vue graphe (dépôt psymate-web, features/graph). Utilise l'agent frontend-feature-dev. Ligne C2 M2-06. Dépend de M2-04.

Contexte : lis CLAUDE.md, docs/C-plan.md C2 ligne M2-06, docs/design/04-graphe-patient.md (+ maquette), docs/B-ux.md B4 écran 4, B2 (double-clic → timeline), B7 (liste équivalente pour lecteurs d'écran), docs/api-reference.md section Graphe (GET /api/patients/{id}/graph?root=&depth=&types=&linkTypes=&from=&to= → nodes, edges, truncated, superNodes ; POST …/graph/expand), docs/Etude-couleurs-Nordique.md §4 (formes et couleurs par type, styles de trait par type de lien, pointillé pour proposed).

Objectif : onglet /patients/:id/graph?root=&depth= : Cytoscape + cose-bilkent chargés en @defer, formes et couleurs par type via les tokens (lus par getComputedStyle, rechargés au changement de thème), styles de trait par type de lien, racine et profondeur 1–3, filtres types / types de liens / période, panneau de détail d'un nœud (entrée, liens, « Lier » → M2-04, « Corriger » → éditeur), glisser un nœud sur un autre → éditeur de lien prérempli, double-clic → timeline positionnée, super-nœuds avec « Déplier » (expand), liste équivalente « liens de cette entrée » accessible, prefers-reduced-motion : pas d'animation de layout, GraphStore avec zoom et position mémorisés dans le shell.

Périmètre : src/app/features/graph/** (page, store, ui), messages, e2e/flux-6-graphe/.

Critères d'acceptation (C2 M2-06, fiche 04) : graphe de 150 nœuds fluide sur le seed (mesure) ; glisser-déposer crée un lien ; super-nœud se déplie ; double-clic ouvre la timeline sur l'entrée ; liste équivalente navigable au clavier ; aucune couleur en dur ; axe-core 0 violation hors canvas.

Tests : GraphStore, mapping tokens → styles Cytoscape (unitaire), e2e.

Interdits : dépendance non annoncée (cytoscape et cose-bilkent sont prévus par M0-06 ; sinon annonce).

Livrable : PR « M2-06 Vue graphe », pnpm lint/test/build verts, e2e vert.
```

### Couloir recherche · tâche M4-08 — Recherche dans le dossier (M4-04 fusionnée)

```bash
claude --worktree M4-08
```

```text
Tâche M4-08 — Recherche dans le dossier (dépôt psymate-web, features/search). Utilise l'agent frontend-feature-dev. Lignes C2 M4-04 et C6 M4-08 fusionnées par C10.

Contexte : lis CLAUDE.md, docs/C-plan.md C10 (M4-04 + M4-08), docs/design/07-recherche-dossier.md (+ maquette), docs/B-ux.md B3 flux 5, B4 écran 7, B2 (/ ouvre le champ, Échap restaure l'onglet), docs/api-reference.md section Recherche (GET /api/patients/{id}/search : q avec la syntaxe tag: émotion: avant: après: séance:, types[], from, to, sessionId, includeArchived, sort, pagination ; items avec snippet <mark>, matchedVia, countsByType).

Objectif : /patients/:id/search?q=… ouvert par / depuis tout écran patient (le champ de la barre devient le champ de recherche), puces par type avec compteurs, période, séance, archivées, résultats surlignés (--search-highlight, texte en text-primary), section « approchés » (trigrammes), aperçu à droite avec « Ouvrir dans la timeline », « Voir dans le graphe », « Modifier », navigation ↑ ↓ Entrée, Échap restaure l'onglet précédent, aide de la syntaxe ; SearchStore ; debounce 250 ms, min 2 caractères.

Périmètre : src/app/features/search/**, le branchement du champ de la barre (via l'output prévu par shared/ui/app-bar ; si absent, arrête-toi), messages, e2e/flux-5-recherche/.

Critères d'acceptation (fiche 07) : « entretien manger » (faute) trouve l'événement du seed ; tag:travail ne renvoie que les entrées taguées ; filtre Ressentis → compteurs inchangés ; parcours / → saisie → ↓ → Entrée ouvre la timeline sur l'entrée ; aucune entrée privée d'un autre praticien (le serveur filtre ; le test vérifie) ; axe-core 0 violation.

Tests : SearchStore, composants, e2e.

Interdits : modifier shared/ui/app-bar ; dépendance non annoncée.

Livrable : PR « M4-08 Recherche dans le dossier », pnpm lint/test/build verts, e2e vert.
```

### Couloir vue d'ensemble · tâche M4-05 — Vue d'ensemble complète et bascule

```bash
claude --worktree M4-05
```

```text
Tâche M4-05 — Vue d'ensemble complète, bascule Vue et sélecteur de fenêtre (dépôt psymate-web, features/overview). Utilise l'agent frontend-feature-dev. Ligne C2 M4-05 (+ la bascule, reprise de M1-16 par C10). Dépend de M2-06, M3-02, M1-16.

Contexte : lis CLAUDE.md, docs/C-plan.md C2 ligne M4-05 et C10 (M1-16, M4-05), docs/design/02-vue-ensemble-patient.md (+ maquette, vue complète), docs/B-ux.md B3 flux 6, B4 écran 2, B8 (deux niveaux, bascule à droite des onglets, clés overview.view et overview.window), docs/api-reference.md GET /api/patients/{id}/overview?window= (blocs, stale, narrative, feelings, sinceLastSession, recentSessions), docs/Etude-couleurs-Nordique.md §4 (familles d'émotions).

Objectif : onglet /patients/:id/overview en vue complète : tuiles chiffrées, courbe de tendance par famille (ECharts en @defer, tokens), alertes vers la timeline filtrée, situations actives avec « Voir dans le graphe » (route graph?root=), traitement en cours, dernières séances → timeline par séance dépliée, « dernière mise à jour » et « Recalculer » si stale ; bascule « Vue : Simple · Complète » dans l'emplacement de l'en-tête (écrit overview.view, libellé « mémorisée dans vos préférences ») et sélecteur 30 j / 90 j / 1 an (overview.window) ; la vue simple est M4-07 : ici, la bascule affiche un état provisoire « Récit : bientôt » ; chaque bloc a ses trois états ; OverviewStore relit après toute écriture (événement du shell).

Périmètre : src/app/features/overview/** (vue complète, bascule, store), messages, e2e/flux-6-vue-ensemble/.

Critères d'acceptation (C2 M4-05, fiche 02) : e2e : ouvrir un patient, cliquer une situation → graphe centré ; ouverture < 200 ms côté API relue (mesure) ; bascule et fenêtre conservées après reconnexion (préférences) ; saisir une entrée depuis l'onglet → la vue se recharge ; chaque bloc vide a son état ; axe-core 0 violation.

Tests : OverviewStore, composants, e2e.

Interdits : vue simple (M4-07) ; dépendance non annoncée.

Livrable : PR « M4-05 Vue d'ensemble complète », pnpm lint/test/build verts, e2e vert.
```

### Couloir vue d'ensemble · tâche M4-07 — Vue simple « Récit »

```bash
claude --worktree M4-07
```

```text
Tâche M4-07 — Vue simple « Récit » (dépôt psymate-web, features/overview). Utilise l'agent frontend-feature-dev. Ligne C6 M4-07. Dépend de M4-05.

Contexte : lis CLAUDE.md, docs/C-plan.md C6 ligne M4-07, docs/design/02-vue-ensemble-patient.md (section vue simple) et la maquette 02b-vue-ensemble-simple.html, docs/B-ux.md B8 (vue simple : résumé rédigé, point d'attention, tendance expliquée + vrais ressentis, dernière séance entière, situations en phrases, depuis la dernière séance, traitement, cadre, à compléter), docs/api-reference.md GET …/overview (narrative.sentences, attention, feelings.points par ressenti réel, séries par émotion, marqueurs médicament, ticks séances, sinceLastSession, recentSessions dont la dernière avec compte rendu).

Objectif : la vue simple (défaut) : résumé « En bref » (phrases de l'API, jamais recomposées côté web), point d'attention, graphe à points réels (une série par émotion, repère médicament, ticks de séances, ECharts), dernière séance en entier, situations en phrases, « depuis la dernière séance », traitement, cadre, « à compléter » ; la bascule de M4-05 affiche cette vue ; emplacement réservé pour un futur bloc « Reçu du patient » (B9, non dessiné).

Périmètre : src/app/features/overview/** (vue simple), messages, e2e cas ajouté.

Critères d'acceptation (fiche 02, C6 M4-07) : seed « Marie D. » → la phrase « monte » de l'API s'affiche telle quelle ; snapshot de l'état vide (patient sans entrée) ; bascule simple ↔ complète sans rechargement ; axe-core 0 violation.

Tests : composants, snapshot vide, e2e.

Interdits : composer des phrases côté web ; dépendance non annoncée.

Livrable : PR « M4-07 Vue simple Récit », pnpm lint/test/build verts, e2e vert.
```

---

## Lot 4 — Annuaire et profil public

**Avant de lancer** : M0-09 fusionné ; M1-09 pour M5-04 (tags non requis : seulement la nav compte). Peut tourner **en parallèle du lot 2 ou 3** (features `account/profile` et `public`, personne d'autre n'y touche).
**Agents** : 2 en parallèle.

### Agent 1 · tâche M5-04 — Mon profil public

```bash
claude --worktree M5-04
```

```text
Tâche M5-04 — Écran « Mon profil public » (dépôt psymate-web, features/account/profile). Utilise l'agent frontend-feature-dev. Ligne C6 M5-04 (révisée).

Contexte : lis CLAUDE.md, docs/C-plan.md C6 ligne M5-04, docs/design/10-mon-profil-public.md (+ maquette ; « Écarts » de couverture-ecrans.md : PUT /api/me/profile, POST …/publish et …/unpublish, POST / DELETE …/photo), docs/B-ux.md B3 flux 8, B4 écran 10, docs/api-reference.md section Profil annuaire (GET / PUT /api/me/profile, photo multipart, publish → 409 avec missing[] dont verification, unpublish) et Vocabulaire (GET /api/vocabulary/directory : liste fermée), docs/G-decisions.md Q15.

Objectif : /mon-compte/profil-public : formulaire en enregistrement automatique (800 ms d'inactivité, « Enregistré · il y a … », PUT complet), identité et photo (recadrage carré côté web, 512 px), présentation, spécialités et publics choisis dans la liste fermée (puces, 8 max), modalités, langues, tarif, contacts avec interrupteur « Afficher » chacun, cabinet et horaires ; colonne droite : interrupteur « Publié » avec liste de contrôle et refus 409 détaillé (missing[] → lignes à corriger ; verification → « votre dossier doit être approuvé »), URL de la fiche, « Ouvrir la fiche publique », aperçu visiteur en direct.

Périmètre : src/app/features/account/pages/profile.page.ts + ui/ + data/, messages, e2e/flux-8-profil-public/.

Critères d'acceptation (fiche 10) : e2e : compléter, publier, voir la fiche (/praticiens/:slug), retirer ; publication refusée sans contact affiché (409 missing contact) ; profil non approuvé → interrupteur inactif avec explication ; spécialité hors liste impossible (pas de saisie libre) ; axe-core 0 violation.

Tests : ProfileStore (autosave, 409), composants, e2e.

Interdits : dépendance non annoncée (recadrage : canvas natif, pas de bibliothèque sauf annonce).

Livrable : PR « M5-04 Mon profil public », pnpm lint/test/build verts, e2e vert.
```

### Agent 2 · tâche M5-05 — Pages publiques (révisée C10)

```bash
claude --worktree M5-05
```

```text
Tâche M5-05 — Pages publiques : annuaire, fiche, contact, comment ça marche (dépôt psymate-web, features/public). Utilise l'agent frontend-feature-dev. Ligne C2 M5-05 révisée par C10.

Contexte : lis CLAUDE.md, docs/C-plan.md C10 ligne M5-05, docs/design/08-annuaire-public.md (+ maquette ; « Écarts avec la maquette » : pas de tarif en liste, tri pertinence, carte omise, champ q, filtre specialties depuis M10-02), 09-fiche-publique-praticien.md, 24-comment-ca-marche.md (+ maquettes), docs/B-ux.md B3 flux 7, B4 écrans 8 et 9, docs/api-reference.md : GET /api/public/directory (q, city, professions, specialties, modalities, audiences, languages, accepting, sort, page ; facettes plafonnées G Q48), GET /api/public/directory/practitioners/{slug}, POST …/{slug}/contact (honeypot, délai minimal, 429), GET /api/public/directory/vocabulary (M10-01) ; docs/G-decisions.md Q20, Q24.

Objectif : /annuaire (recherche, facettes avec compteurs, cartes avec badge « Profil vérifié », pagination par page, aucun résultat avec suggestions, note « seuls les praticiens vérifiés »), /praticiens/:slug (fiche 09 : carte identité, présentation, pratique, contacts affichés seulement, cabinet, formulaire de contact avec consentement, honeypot et délai minimal, 429 affiché), /comment-ca-marche (fiche 24, contenu statique indexable) ; prérendu des trois routes (Angular SSR en mode prerender, données de l'annuaire chargées côté client après hydratation ; aucune route authentifiée rendue côté serveur) ; balises meta et robots.

Périmètre : src/app/features/public/**, la configuration prerender, messages, e2e/flux-7-visiteur/.

Critères d'acceptation (C2 M5-05, fiches 08, 09, 24) : e2e sans connexion : trouver une psychologue à Paris, filtrer par spécialité, ouvrir sa fiche, envoyer un message (vu dans Mailpit) ; honeypot rempli → 202 silencieux, rien dans Mailpit ; Lighthouse accessibilité ≥ 90 sur les trois pages (rapport dans la PR) ; aucun numéro d'urgence ; axe-core 0 violation.

Tests : DirectoryStore, composants, e2e flux 7.

Interdits : importer core/auth (pas de session requise) ; carte interactive tierce ; dépendance non annoncée (SSR : @angular/ssr, annonce).

Livrable : PR « M5-05 Pages publiques », pnpm lint/test/build verts, e2e vert.
```

---

## Lot 5 — Capture rapide et finitions

**Avant de lancer** : M2-05 fusionné (pour M6-02) ; M0-06 (pour M6-04) ; M1-16 et l'API M6-05 (pour M6-06) ; M4-05 (pour M6-03, en dernier).
**Agents** : M6-01 ∥ M6-04 ∥ M6-06 tout de suite ; M6-02 après M6-01 ; M6-03 quand tous les écrans sont là.

### Agent 1 · tâche M6-01 — Grammaire de la barre de commande

```bash
claude --worktree M6-01
```

```text
Tâche M6-01 — Grammaire de la barre de commande (dépôt psymate-web, features/capture, parseur pur). Utilise l'agent frontend-feature-dev. Ligne C2 M6-01.

Contexte : lis CLAUDE.md, docs/C-plan.md C2 ligne M6-01, docs/B-ux.md B5 en entier (alternative A : préfixes /evt /sit /med /note, détection d'émotion par préfixe globales + custom, intensité, dates relatives et précision, > cible), docs/api-reference.md GET /api/vocabulary/emotions (codes et libellés, custom du praticien), docs/E-modele-donnees.md E5.2.

Objectif : parseur TypeScript pur (sans DOM, sans Angular) : parse(input, {emotions, now, locale}) → { type, emotionCode?, intensity?, text, occurred: {from, precision}, target?: { query } , warnings[] } ; préfixes, émotion par préfixe non ambigu (« anx » → anxiété, « tri » ambigu → suggestion), intensité 1–10, dates relatives (« hier », « lundi », « il y a 3 j », « en mars », « été 2024 »), > cible, guillemets ; messages d'aide pour chaque ambiguïté.

Périmètre : src/app/features/capture/parser/**, tests.

Critères d'acceptation (C2 M6-01) : jeu de 40 phrases de test couvrant chaque règle (table de cas) ; aucune dépendance de date (horloge injectée) ; le parseur est pur et couvert à 100 %.

Tests : unitaires (table de cas).

Interdits : DOM, Angular, appel HTTP ; dépendance non annoncée.

Livrable : PR « M6-01 Grammaire », pnpm lint/test verts.
```

### Agent 2 · tâche M6-02 — Barre de commande et aperçu

```bash
claude --worktree M6-02
```

```text
Tâche M6-02 — Barre de commande et aperçu (dépôt psymate-web, features/capture). Utilise l'agent frontend-feature-dev. Ligne C2 M6-02. Dépend de M6-01, M2-05.

Contexte : lis CLAUDE.md, docs/C-plan.md C2 ligne M6-02, docs/B-ux.md B5 et B3 flux 3, docs/design/05-editeur-entree.md (barre de capture et aperçu en haut de l'état A), docs/design/00-composants-partages.md §2 (emplacement dans l'en-tête patient), features/entries/index.ts (openEntryEditor et la création avec links[]).

Objectif : le champ de capture de l'en-tête patient : aperçu interprété en direct (type, émotion avec pastille, intensité, date et précision, cible proposée avec type de lien), rail « lié à » réutilisé, Entrée crée directement (séance courante), Ctrl+Entrée ouvre l'éditeur prérempli, Ctrl+S brouillon, création d'émotion custom proposée quand le préfixe est inconnu ; CaptureStore.

Périmètre : src/app/features/capture/** (hors parseur), le branchement de l'emplacement prévu dans patient-header (output), e2e/flux-3-saisie/ (cas chronométré).

Critères d'acceptation (C2 M6-02) : e2e chronométré : « anx 8 n'a pas dormi > entretien » → ressenti lié créé en moins de 12 s au clavier, mesuré ; aperçu correct pour les 40 phrases de M6-01 (test de composant sur un échantillon) ; préfixe inconnu → proposition de création custom ; axe-core 0 violation.

Tests : CaptureStore, composant, e2e.

Interdits : modifier shared/ui/patient-header ; dépendance non annoncée.

Livrable : PR « M6-02 Barre de commande », pnpm lint/test/build verts, e2e vert.
```

### Agent 3 · tâche M6-04 — Mode sombre et contraste doux

```bash
claude --worktree M6-04
```

```text
Tâche M6-04 — Mode sombre et contraste doux (dépôt psymate-web, theme). Utilise l'agent frontend-feature-dev. Ligne C2 M6-04.

Contexte : lis CLAUDE.md, docs/C-plan.md C2 ligne M6-04, docs/Etude-couleurs-Nordique.md §6 (mode sombre, réglage contraste doux, bascule) et §8, docs/design/14-preferences-praticien.md (clé theme : light | soft | dark | system), core/theme (ThemeService de M0-09).

Objectif : compléter src/theme/tokens.css pour dark et soft (toutes les variables, pas seulement les surfaces), thème Material correspondant, préférence système (system → prefers-color-scheme avec écoute des changements), vérification de chaque écran existant en sombre (captures dans la PR), Cytoscape et ECharts relus au changement de thème, export PDF toujours en clair (côté API, rien à faire : le noter), test de contraste étendu aux deux thèmes.

Périmètre : src/theme/**, core/theme, tools/check-tokens.mjs, e2e/theme/.

Critères d'acceptation (C2 M6-04) : tous les écrans lisibles en sombre (captures) ; test de contraste vert sur light, soft, dark ; bascule sans rechargement ; system suit l'OS (test avec émulation prefers-color-scheme).

Tests : check:tokens, e2e thème.

Interdits : couleur en dur ; dépendance non annoncée.

Livrable : PR « M6-04 Mode sombre », pnpm lint/check:tokens/test/build verts, e2e vert.
```

### Agent 4 · tâche M6-06 — Données et export

```bash
claude --worktree M6-06
```

```text
Tâche M6-06 — Données et export (dépôt psymate-web, features/account/data-export et un point d'entrée dans patients). Utilise l'agent frontend-feature-dev. Ligne C9 M6-06.

Contexte : lis CLAUDE.md, docs/C-plan.md C9 ligne M6-06, docs/design/19-donnees-export.md (+ maquette ; « Écarts » : un seul job visible, états du contrat, md affiché Markdown), docs/design/16-fiche-patient.md, docs/api-reference.md sections Export patient (GET /api/patients/{id}/export?format=pdf|md) et Export de compte (POST /api/me/export → 202 job, 409 EXPORT_IN_PROGRESS ; GET …/{jobId} queued / running / done / failed avec expiresAt, downloadUrl ; GET …/file → zip, 410 EXPORT_EXPIRED) ; docs/G-decisions.md Q18.

Objectif : /mon-compte/donnees (export d'un patient : sélecteur, PDF | Markdown, rappel privées exclues ; export du compte : lancer, suivi du dernier job (id conservé côté client), lien jusqu'à expiresAt, 410 → « Relancer », 409 affiché) ; bouton « Exporter ce dossier ▾ » dans la fiche patient (16) et dans le menu de l'en-tête ; ExportStore.

Périmètre : src/app/features/account/pages/data-export.page.ts + data/, un bouton dans features/patients (fiche) via l'output prévu, messages, e2e/export/.

Critères d'acceptation (fiche 19) : PDF d'un patient du seed ouvrable (téléchargé par Playwright, taille > 0, type application/pdf) ; une entrée privée créée dans le test n'apparaît pas dans l'export Markdown ; lancer puis télécharger l'export du compte ; 409 si relancé pendant un job ; parcours clavier.

Tests : ExportStore, e2e.

Interdits : modifier shared/ui ; dépendance non annoncée.

Livrable : PR « M6-06 Données et export », pnpm lint/test/build verts, e2e vert.
```

### Agent 5 · tâche M6-03 — Revue des états et des raccourcis (révisée C10)

```bash
claude --worktree M6-03
```

```text
Tâche M6-03 — Revue des trois états et des raccourcis sur tous les écrans (dépôt psymate-web, toutes les features, revue). Utilise l'agent frontend-feature-dev. Ligne C2 M6-03 révisée par C10. À lancer quand les lots 1 à 5 sont fusionnés.

Contexte : lis CLAUDE.md, docs/C-plan.md C10 ligne M6-03 et C5 (« chaque écran a ses trois états »), docs/design/29-etats.md en entier (+ planche), docs/B-ux.md B2 (raccourcis), docs/design/00-composants-partages.md §7.

Objectif : pour chacun des écrans V1 (fiches 01 à 29 hors 15, 15b, 23) : vérifier et compléter les états vide, chargement, erreur (composant état, messages i18n FR), les raccourcis N / L 1 2 3 M Échap ? branchés et inactifs dans un champ, le panneau d'aide des raccourcis (touche ?), les messages des codes 401 / 403 / 409 / 422 / 423 / 429 / hors ligne conformes à la planche 29 ; un tableau dans la PR : écran × état × test.

Périmètre : corrections dans les features concernées (une PR par brique si le diff dépasse 30 fichiers), e2e/etats/ (un test par état manquant).

Critères d'acceptation (C2 M6-03) : chaque écran a ses trois états en revue visuelle (captures dans la PR) ; e2e de chaque état ; aucun texte hors $localize.

Tests : e2e états, composants corrigés.

Interdits : modifier shared/ui (si un composant partagé doit changer, ouvre une tâche) ; dépendance non annoncée.

Livrable : PR(s) « M6-03 Revue des états », pnpm lint/test/build verts, e2e vert.
```

---

## Lot 6 — Administration

**Avant de lancer** : M0-09 et M1-17 fusionnés. Peut tourner **en parallèle des lots 2 à 5** (feature `admin`, aucune dépendance patient).

### Agent 1 · tâche M7-07 — Écrans d'administration

```bash
claude --worktree M7-07
```

```text
Tâche M7-07 — Écrans d'administration (dépôt psymate-web, features/admin). Utilise l'agent frontend-feature-dev. Ligne C6 M7-07 révisée par C10.

Contexte : lis CLAUDE.md, docs/C-plan.md C6 ligne M7-07, C10, docs/design/20-admin-validation-praticiens.md, 21-admin-praticiens.md, 22-admin-journal.md, 28-admin-vocabulaire.md (+ maquettes ; « Écarts » de la fiche 28 : Modalités et Langues en lecture seule, 409 avec compteur), docs/B-ux.md B8 flux 10, docs/design/00-composants-partages.md §5 (admin-bar), docs/api-reference.md sections Administration : vérifications (file, dossier, documents avec URL signée, décision avec message obligatoire), praticiens (liste avec curseur, suspend / reactivate avec motif), journal (paginé, lecture seule), vocabulaire de l'annuaire (GET / POST / PATCH, 409 VOCABULARY_IN_USE), recours (GET /api/admin/appeals, décision) ; docs/G-decisions.md Q15, Q26, Q27, Q29.

Objectif : module lazy /admin/** derrière authGuard + roleGuard('admin') (+ 2FA : 403 TWO_FACTOR_REQUIRED → /premiere-connexion), barre admin, /admin/validation[/:id] (fiche 20 : file du plus ancien au plus récent, rouge au-delà de 2 jours ouvrés, dossier, justificatifs avec case Conforme et visionneuse par URL signée, liste de contrôle, décision Approuver / Demander un complément / Refuser avec message obligatoire), /admin/praticiens (fiche 21 : liste, filtres, suspendre / réactiver avec motif, recours ouverts), /admin/journal (fiche 22 : filtres, pagination par curseur, lecture seule), /admin/vocabulaire (fiche 28) ; règle testée : la feature admin n'importe aucun service ni composant des features patient.

Périmètre : src/app/features/admin/**, app.routes.ts (branche /admin), messages, e2e/flux-10-admin/.

Critères d'acceptation (fiches 20, 21, 22, 28, C6) : e2e : un admin du test (make admin côté API, première connexion faite par le test) approuve un dossier du seed → le praticien voit son bandeau disparaître et peut publier ; un praticien qui tape /admin est redirigé vers /patients ; décision sans message → bouton inactif et 422 affiché si forcé ; désactiver une spécialité utilisée → 409 avec le compteur ; journal paginé ; fixture ESLint : un import de features/patients depuis admin fait échouer pnpm lint ; axe-core 0 violation.

Tests : stores, composants, fixture ESLint, e2e flux 10.

Interdits : importer une feature patient ; afficher une donnée patient ; onglet Signalements ; dépendance non annoncée (visionneuse PDF : iframe natif, pas de bibliothèque sauf annonce).

Livrable : PR « M7-07 Administration », pnpm lint/test/build verts, e2e vert.
```

---

## Lot 7 — Bêta

**Avant de lancer** : tous les lots précédents fusionnés.
**Agents** : M7-03 puis M7-04 (M7-04 relit tout, y compris M7-03).

### Agent 1 · tâche M7-03 — Onboarding et patient DEMO

```bash
claude --worktree M7-03
```

```text
Tâche M7-03 — Onboarding et patient DEMO (dépôt psymate-web, features/patients et shared : page d'aide). Utilise l'agent frontend-feature-dev. Ligne C2 M7-03.

Contexte : lis CLAUDE.md, docs/C-plan.md C2 ligne M7-03 et C5 (« première entrée en moins de 3 minutes »), docs/B-ux.md B3 flux 1, docs/design/29-etats.md (états vides de la première connexion, page d'aide des raccourcis), docs/G-decisions.md Q22 (patient DEMO généré côté API, marqué « DEMO · »).

Objectif : première connexion : état vide de la liste avec le patient « DEMO · … » du seed étiqueté, supprimable sans retaper le nom (archivage), « Nouveau patient » mis en avant, premier message d'accueil (trois étapes), lien « Voir les raccourcis » ; panneau d'aide des raccourcis (touche ?) complet ; message préparé pour les suggestions V2 (texte neutre, aucune fonctionnalité) ; parcours guidé minimal (sans bibliothèque) jusqu'à la première entrée.

Périmètre : src/app/features/patients/** (état vide, DEMO), le panneau d'aide (dans shared/ui/help si M0-09 l'a prévu, sinon features/patient-shell), messages, e2e/flux-1-premiere-connexion/.

Critères d'acceptation (C2 M7-03) : e2e : un nouveau praticien (inscription + confirmation dans le test) saisit sa première entrée en moins de 3 minutes de parcours scripté, sans aide ; le patient DEMO se supprime en un clic et se restaure ; ? ouvre l'aide partout.

Tests : composants, e2e flux 1 complet.

Interdits : dépendance non annoncée ; toucher à l'API.

Livrable : PR « M7-03 Onboarding », pnpm lint/test/build verts, e2e vert.
```

### Agent 2 · tâche M7-04 — Accessibilité et e2e complets

```bash
claude --worktree M7-04
```

```text
Tâche M7-04 — Accessibilité et e2e complets (dépôt psymate-web, racine, e2e). Utilise l'agent frontend-feature-dev. Ligne C2 M7-04.

Contexte : lis CLAUDE.md, docs/C-plan.md C2 ligne M7-04, C5 (la bêta est prête quand : les 15 cas d'usage V1 passent en e2e, axe-core 0 violation sérieuse sur tous les écrans, zoom 200 %, navigation clavier complète), docs/B-ux.md B3 (flux 1 à 10) et B7 accessibilité, docs/A-architecture.md A2 (UC-01 à UC-15).

Objectif : un e2e par flux de B3 (1 à 10) et une correspondance UC → e2e dans un tableau commité (docs/e2e-couverture.md) ; axe-core sur chaque écran V1 dans les deux thèmes ; parcours clavier complet de chaque flux (sans souris) ; zoom 200 % sans perte de fonction (captures) ; liste équivalente du graphe testée avec un lecteur d'écran simulé (rôles et noms) ; corrections d'accessibilité dans les features concernées (une PR par brique si nécessaire).

Périmètre : e2e/**, docs/e2e-couverture.md, corrections ciblées dans les features.

Critères d'acceptation (C2 M7-04, C5) : zéro violation axe « serious » sur les écrans V1 ; parcours clavier e2e pour les dix flux ; tableau UC → e2e complet ; CI verte.

Tests : les e2e eux-mêmes.

Interdits : désactiver une règle axe ; dépendance non annoncée.

Livrable : PR « M7-04 Accessibilité et e2e », pnpm lint/test/build verts, e2e vert.
```

---

## Après le lot 7

Le frontend V1 est complet : les 32 fiches ont leur écran, les dix flux de B3 ont leur e2e, le contrat `contract-v0.11.0` est épinglé. Reste pour la bêta (C5) : le déploiement progressif 5 → 20 → 50 et l'étude hébergement (M7-06, côté API). Hors V1, conservés : agenda (15, 15b), signalements (23), déclinaison mobile, marqueur « rapporté par le patient » (B9).

**Changement de contrat pendant la V1 web** : si l'API pose un tag (par exemple `contract-v0.12.0` après M10-07), une PR d'une ligne change `CONTRACT_TAG`, lance `pnpm contract:pull` et n'adapte que les `*.api.ts` concernés ; jamais mélangée à une tâche d'écran.
