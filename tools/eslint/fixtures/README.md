# Fixtures ESLint

Faux arbre `src/app` qui viole (ou respecte) volontairement les règles d'architecture.
`pnpm lint` lance `tools/eslint/check-fixtures.mjs`, qui lint chaque fichier et compare les règles
en erreur à la ligne `expect:` de son en-tête (`expect: none` pour un fichier qui doit passer).

Si une règle cesse d'attraper une violation, ou en attrape une de trop, `pnpm lint` échoue.
