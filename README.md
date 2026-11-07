# psymate-web

Frontend de PsyMate : Angular 22 (standalone, zoneless, signaux), Angular Material 22 (M3),
`@angular/localize` (français d'abord, anglais), pnpm. Parle uniquement à `psymate-api` par le
contrat OpenAPI épinglé. Règles et commandes : [`CLAUDE.md`](CLAUDE.md) ; référence : [`docs/`](docs/README.md).

## Prérequis

- Node **24.22.2** (`.nvmrc`, G Q50). pnpm télécharge lui-même ce Node pour les scripts
  (`devEngines.runtime` de `package.json`) : un Node 24 plus ancien sur le poste suffit à lancer pnpm.
- pnpm **12.18.0** (`packageManager`) : `corepack enable`.
- Pour `pnpm start` et `pnpm e2e` : l'API locale (`../psymate-api` : `make up && make run`, puis
  `make seed SIZE=small`), qui écoute sur http://localhost:8080.

## Commandes

```bash
pnpm install
```

```bash
pnpm start
```

Serveur de développement sur http://localhost:4200, en français ; `/api` est relayé vers :8080
(`proxy.conf.json`). Pour voir la version anglaise : `pnpm start --configuration en`. Le serveur de
développement ne sert qu'une langue à la fois ; la bascule FR ⇄ EN s'essaie sur le build
(`pnpm build`, puis `node tools/serve-dist.mjs` : http://localhost:4200/fr/ et /en/).

| Commande            | Rôle                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------ |
| `pnpm lint`         | ESLint (frontières entre features, `no-hardcoded-color`), fixtures ESLint, Prettier        |
| `pnpm check:tokens` | Contraste des couples de couleurs déclarés, thèmes clair, sombre et doux                   |
| `pnpm test`         | Vitest (tests unitaires et de composants)                                                  |
| `pnpm build`        | Build de production, un bundle par langue (`dist/psymate-web/browser/fr` et `/en`)         |
| `pnpm e2e`          | Build puis Playwright + axe-core contre l'API réelle (attend `:8080/actuator/health`)      |
| `pnpm extract-i18n` | Régénère `src/locale/messages.fr.xlf` (source) ; reporter les nouveaux messages en anglais |
| `pnpm format`       | Prettier sur tout le dépôt                                                                 |

## Arborescence

Voir `docs/handbook/architecture-frontend.html` §3.

- `src/app/core/` transverse (auth, http, i18n, préférences, raccourcis, thème) ;
- `src/app/api/` client généré par `pnpm contract:pull` (M0-07), jamais édité ;
- `src/app/shared/` composants et utilitaires partagés (fiche 00, M0-09) ;
- `src/app/features/` une feature lazy par contexte, frontières vérifiées par ESLint ;
- `src/theme/tokens.css` couleurs de l'étude Nordique, seule source ; `src/theme/material.scss`
  thème Material construit dessus ;
- `src/locale/` `messages.fr.xlf` (source) et `messages.en.xlf` ;
- `e2e/` Playwright, un dossier par flux ;
- `tools/` `check-tokens.mjs`, règles et fixtures ESLint, `serve-dist.mjs`, `api-reference.mjs`.
