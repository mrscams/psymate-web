#!/usr/bin/env node
// Vérifie que les règles d'architecture attrapent exactement les violations voulues
// (tools/eslint/fixtures, voir son README). Lancé par pnpm lint.
//
// Chaque fixture déclare dans son en-tête « expect: <règle>[, <règle>…] » ou « expect: none ».
// Échoue si une violation attendue n'est plus signalée (règle cassée ou trop permissive)
// ou si un fichier permis est signalé (règle trop stricte).
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { ESLint } from 'eslint';

const eslint = new ESLint({ ignore: false });
const results = await eslint.lintFiles(['tools/eslint/fixtures/src/**/*.{ts,html,scss}']);

let failures = 0;
for (const result of results) {
  const file = relative(process.cwd(), result.filePath).replace(/\\/g, '/');
  const header = readFileSync(result.filePath, 'utf8').match(
    /expect:\s*([\w@/, -]+?)\s*(?:-->|\*\/|\n)/,
  );
  if (!header) {
    console.error(`✗ ${file} : en-tête « expect: » manquant`);
    failures++;
    continue;
  }
  const expected = header[1].trim() === 'none' ? [] : header[1].split(',').map((r) => r.trim());
  const fatal = result.messages.filter((m) => m.fatal);
  const actual = [...new Set(result.messages.filter((m) => m.severity === 2).map((m) => m.ruleId))];

  const missing = expected.filter((rule) => !actual.includes(rule));
  const unexpected = actual.filter((rule) => !expected.includes(rule));
  if (fatal.length || missing.length || unexpected.length) {
    failures++;
    console.error(`✗ ${file}`);
    for (const m of fatal) console.error(`    erreur d'analyse : ${m.message}`);
    for (const rule of missing) console.error(`    attendu, non signalé : ${rule}`);
    for (const m of result.messages.filter((x) => unexpected.includes(x.ruleId))) {
      console.error(`    signalé, non attendu : ${m.ruleId} (${m.line}:${m.column}) ${m.message}`);
    }
  }
}

if (results.length === 0) {
  console.error('✗ aucune fixture trouvée dans tools/eslint/fixtures');
  process.exit(1);
}
if (failures > 0) {
  console.error(`\n${failures} fixture(s) en échec sur ${results.length}.`);
  process.exit(1);
}
console.log(
  `Fixtures ESLint : ${results.length} fichiers, violations attendues toutes signalées, aucune en trop.`,
);
