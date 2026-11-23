#!/usr/bin/env node
// pnpm e2e (après ng build) et le job e2e de la CI : toute la suite Playwright, en deux passes.
//
// 1. Les tests étiquetés @mesure (ils affirment une durée mesurée dans le navigateur : disposition du
//    graphe, cadence d'images) tournent seuls sur la machine, un worker, rien en parallèle. Joués
//    au milieu des autres, leur mesure suivait la charge des workers voisins, pas l'application.
// 2. Tout le reste, en parallèle (workers de playwright.config.ts).
//
// Les deux passes partent quel que soit le résultat de l'autre ; le code de sortie est en échec si
// l'une des deux échoue. Chaque passe a ses dossiers (test-results/<passe>, playwright-report/<passe>),
// sinon la seconde efface les traces et le rapport de la première. Les arguments sont transmis aux
// deux passes (pnpm e2e -- e2e/flux-6-graphe) ; une passe sans test correspondant n'est pas un échec.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const cli = require.resolve('@playwright/test/cli');
const args = process.argv.slice(2).filter((arg) => arg !== '--');

const passes = [
  { name: 'mesure', filter: ['--grep', '@mesure', '--workers=1'] },
  { name: 'reste', filter: ['--grep-invert', '@mesure'] },
];

let failed = false;
for (const pass of passes) {
  console.log(`\n[e2e] Passe « ${pass.name} »`);
  const { status } = spawnSync(
    process.execPath,
    [
      cli,
      'test',
      ...pass.filter,
      `--output=test-results/${pass.name}`,
      '--pass-with-no-tests',
      ...args,
    ],
    {
      stdio: 'inherit',
      env: { ...process.env, PLAYWRIGHT_HTML_OUTPUT_DIR: `playwright-report/${pass.name}` },
    },
  );
  if (status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);
