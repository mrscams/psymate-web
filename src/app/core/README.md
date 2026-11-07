# src/app/core

Transverse, chargé une fois, aucune UI métier (handbook §3) : `auth/`, `http/`, `preferences/`,
`shortcuts/`, `i18n/`, `theme/`. `core` ne dépend que de `core` ; seuls ses `data/*.api.ts`
(`core/auth`, `core/preferences`) importent `src/app/api`.
