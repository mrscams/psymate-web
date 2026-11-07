---
name: progress-log
description: Enregistre l'avancement d'une tâche web (M0-06, M1-15…) dans le suivi du projet (docs/progress) à la fin d'une tâche, d'une revue, ou quand on se bloque. À utiliser par tout agent et par Claude lui-même, jamais en modifiant un fichier existant du suivi.
---

# Journal d'avancement du projet

Le suivi d'avancement (copie du D9 de `psymate-api`, lots du document H côté web) est tenu par des **événements** :
un fichier JSON par mise à jour dans `docs/progress/events/`, et une page `docs/progress/index.html`
regénérée à partir de tous les événements (dépôt principal et worktrees sous `.claude/worktrees/`).

## Quand enregistrer un événement

- À la **fin de ta tâche** : `pnpm lint`, `pnpm check:tokens`, `pnpm test`, `pnpm build` verts et les e2e de la tâche verts → `--status done`, avec l'URL de la PR si elle existe (sinon la branche).
- Quand tu **passes la main au reviewer** ou qu'une revue est faite → `--status review`.
- Quand tu es **bloqué** (composant partagé manquant, décision absente de G, écart fiche ↔ contrat que tu ne dois pas trancher) → `--status blocked`, avec la raison dans `--notes` et ce qu'il faudrait dans `--next`.
- Au **début** d'une tâche longue, si tu veux que l'état « en cours » soit visible → `--status in-progress`.
- Après la **fusion** → `--status merged` (c'est en général Claude, pas l'agent, qui le fait).

## Comment

Une seule commande, depuis la racine du dépôt ou du worktree :

```bash
pnpm progress:log --task M0-09 --agent frontend-feature-dev --status done --summary "Socle UI partagé : 11 composants, 3 états chacun, 48 tests verts" --pr https://github.com/mrscams/psymate-web/pull/2 --notes "@ngrx/signals déjà présent (M0-07)" --next "Lot 1 (M1-15, M1-16) peut démarrer"
```

- `--task` : l'ID de la tâche (`M0-09`), ou `PROJET` pour une note générale.
- `--agent` : ton nom d'agent (`frontend-feature-dev`, `reviewer`, `claude`).
- `--status` : `todo`, `in-progress`, `review`, `blocked`, `done`, `merged`.
- `--summary` : une phrase, obligatoire. `--notes` : décisions prises, écarts, dette, chiffres (tests, tailles de bundle). `--next` : ce qui reste ou ce que ça débloque. `--branch` : déduite de git si absente.
- Évite les guillemets doubles à l'intérieur des valeurs ; utilise des guillemets simples ou des parenthèses.

La commande écrit le fichier d'événement, puis regénère la page. L'équivalent sans pnpm est
`node tools/progress/progress.mjs add --task … --agent … --status … --summary …`.

## Règles

- **N'édite jamais** `docs/progress/index.html` ni un fichier existant de `docs/progress/events/` : la page est dérivée (non commitée), et chaque événement est écrit une fois avec un nom unique. C'est ce qui permet à deux agents de terminer au même instant sans se gêner, et aux événements de fusionner sans conflit entre branches.
- **Commite le fichier d'événement avec ta tâche** (`git add docs/progress/events`), pour qu'il suive la branche puis `main`.
- Un événement est un constat, pas une consigne : il ne remplace ni le rapport de fin de tâche ni la PR.
- Si `pnpm progress:log` échoue (verrou tenu plus de 15 s), signale-le dans ton rapport : ne tente pas d'écrire la page à la main.

## Lire l'avancement

`pnpm progress` regénère la page ; ouvre `docs/progress/index.html` dans un navigateur
(tuiles par état, barres par jalon, tableau filtrable des tâches, journal complet). Le champ de recherche
accepte `web` pour ne voir que les tâches du frontend.
