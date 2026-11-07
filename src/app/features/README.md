# src/app/features

Une feature par contexte backend, chargée en lazy depuis `app.routes.ts` (handbook §3, §4, §8) :
`auth`, `patients`, `patient-shell`, `overview`, `timeline`, `graph`, `entries`, `search`, `capture`,
`account`, `public`, `admin`.

Structure d'une feature : `index.ts` (seule surface publique : routes, store exporté exprès, types de
vue), `<x>.routes.ts`, `pages/`, `ui/`, `data/` (`<x>.api.ts`, `<x>.store.ts`), `panels/` si besoin.

Frontières vérifiées par `pnpm lint` (eslint-plugin-boundaries, `eslint.config.mjs`) :

- une feature n'importe d'une autre que son `index.ts` ;
- `features/admin` n'importe aucune feature patient (`patients`, `patient-shell`, `overview`,
  `timeline`, `graph`, `entries`, `search`, `capture`) ;
- `features/public` ne lit que `core/http` et `core/i18n` ;
- seul `data/<x>.api.ts` importe `src/app/api`.

Exemples de violations : `tools/eslint/fixtures/`.
