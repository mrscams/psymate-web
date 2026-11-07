# Suivi d'avancement

Copie, le 7 novembre 2026, du suivi de `psymate-api` (tableau D9 de `D-orchestration-backend.md`) : mêmes événements, même outil. Côté web, les lots et les features viennent de `docs/H-runbook-agents-frontend.md` ; les tâches de `docs/C-plan.md` (C2, C6, C9, C10). Les deux dépôts tiennent chacun leur copie des événements ; celle-ci fait foi pour les tâches `web`.

- `events/` : un fichier JSON par mise à jour, écrit une seule fois, jamais modifié (`pnpm progress:log …`, skill `progress-log`).
- `index.html` : page générée par `pnpm progress`, non commitée. Elle lit les événements du dépôt principal et de chaque worktree sous `.claude/worktrees/`, ce qui montre aussi les tâches en cours sur des branches pas encore fusionnées.

Pourquoi des événements et pas un tableau édité : deux agents qui terminent au même moment écrivent chacun leur fichier, sans verrou ni conflit, et ces fichiers fusionnent proprement entre branches. La page, elle, est regénérée sous un verrou court et réécrite atomiquement.
