#!/usr/bin/env node
// pnpm contract:pull : épingle le contrat d'API et regénère le client (handbook §6.1).
//
// 1. Lit CONTRACT_TAG (contract-vX.Y.Z).
// 2. Copie contract/openapi.yaml de psymate-api à ce tag dans docs/contract/openapi.yaml, si le dépôt
//    de l'API est cloné à côté (PSYMATE_API_DIR, sinon ../psymate-api). Sans lui (CI), la copie
//    commitée est gardée telle quelle.
// 3. Vérifie que info.version du YAML vaut X.Y.Z.
// 4. Lance openapi-generator (typescript-angular, version figée dans openapitools.json) vers un
//    dossier temporaire, puis remplace src/app/api en entier. Un service par tag OpenAPI (noms de tags
//    translittérés en ASCII pour des noms de classes lisibles).
//
// Le résultat est commité ; relancer le script sur le même tag doit donner un diff vide.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const specPath = path.join(root, 'docs/contract/openapi.yaml');
const outDir = path.join(root, 'src/app/api');
const cli = path.join(root, 'node_modules/@openapitools/openapi-generator-cli/main.js');

/** Options de typescript-angular (handbook §6.1). */
const ADDITIONAL_PROPERTIES = {
  supportsES6: 'true',
  withInterfaces: 'true',
  stringEnums: 'true',
  fileNaming: 'kebab-case',
  ngVersion: '22.0.0',
};

function fail(message) {
  console.error(`[contract:pull] ${message}`);
  process.exit(1);
}

function log(message) {
  console.log(`[contract:pull] ${message}`);
}

// 1. Tag épinglé.
const tag = fs.readFileSync(path.join(root, 'CONTRACT_TAG'), 'utf8').trim();
const tagMatch = /^contract-v(\d+\.\d+\.\d+)$/.exec(tag);
if (!tagMatch) fail(`CONTRACT_TAG doit valoir contract-vX.Y.Z (lu : « ${tag} »).`);
const expectedVersion = tagMatch[1];

// 2. Copie du YAML au tag depuis psymate-api.
function git(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function apiRepoCandidates() {
  const candidates = [];
  if (process.env.PSYMATE_API_DIR) candidates.push(path.resolve(process.env.PSYMATE_API_DIR));
  candidates.push(path.resolve(root, '../psymate-api'));
  // Depuis un worktree (.claude/worktrees/…), le dépôt principal est le parent du dossier .git commun.
  try {
    const commonDir = path.resolve(root, git(['rev-parse', '--git-common-dir'], root));
    candidates.push(path.resolve(path.dirname(commonDir), '../psymate-api'));
  } catch {
    // Pas un dépôt git (archive) : seules les deux premières pistes comptent.
  }
  return [...new Set(candidates)];
}

const apiRepo = apiRepoCandidates().find((dir) => fs.existsSync(path.join(dir, 'contract')));
if (apiRepo) {
  let yaml;
  try {
    yaml = execFileSync('git', ['show', `${tag}:contract/openapi.yaml`], {
      cwd: apiRepo,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    fail(
      `le tag ${tag} est absent de ${apiRepo} : git -C "${apiRepo}" fetch --tags, puis relancer.`,
    );
  }
  fs.writeFileSync(specPath, yaml);
  log(`docs/contract/openapi.yaml copié depuis ${apiRepo} au tag ${tag}.`);
} else {
  log(
    'psymate-api introuvable à côté : la copie commitée de docs/contract/openapi.yaml est gardée.',
  );
}

// 3. info.version du YAML (lecture ligne à ligne : le bloc info est au premier niveau).
function infoVersion(text) {
  let inInfo = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^\S/.test(line)) inInfo = line.startsWith('info:');
    else if (inInfo) {
      const m = /^ {2}version:\s*['"]?([^'"\s]+)/.exec(line);
      if (m) return m[1];
    }
  }
  return null;
}

const actualVersion = infoVersion(fs.readFileSync(specPath, 'utf8'));
if (actualVersion !== expectedVersion) {
  fail(
    `docs/contract/openapi.yaml porte info.version ${actualVersion}, CONTRACT_TAG attend ${expectedVersion}.`,
  );
}
log(`contrat ${tag} (info.version ${actualVersion}).`);

// 4. Entrée du générateur : le contrat tel quel, sauf les noms de tags privés de leurs accents.
// openapi-generator supprime les lettres accentuées des noms de classes (« Préférences » donnerait
// PrfrencesService) ; translittérées, elles donnent PreferencesService. Seules les lignes qui sont
// exactement un nom de tag changent ; descriptions et schémas restent identiques.
function withAsciiTags(text) {
  const lines = text.split('\n');
  const start = lines.indexOf('tags:');
  const unquote = (value) => value.replace(/^'(.*)'$/, '$1').replace(/''/g, "'");
  const names = new Set();
  // Le bloc tags: s'arrête à la clé de premier niveau suivante (ses éléments commencent par « - »).
  for (let i = start + 1; start >= 0 && i < lines.length && !/^[A-Za-z]/.test(lines[i]); i++) {
    const m = /^(?:- | {2})name: (.+)$/.exec(lines[i]);
    if (m) names.add(unquote(m[1]));
  }
  const ascii = (name) => name.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return lines
    .map((line) => {
      const m = /^(\s*(?:- |name: )+)(.+)$/.exec(line);
      if (!m) return line;
      const value = unquote(m[2]);
      if (!names.has(value) || ascii(value) === value) return line;
      return `${m[1]}'${ascii(value).replace(/'/g, "''")}'`;
    })
    .join('\n');
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'psymate-api-client-'));
const generatorSpec = path.join(tmp, 'openapi.yaml');
const outTmp = path.join(tmp, 'out');
const spec = fs.readFileSync(specPath, 'utf8').replace(/\r\n/g, '\n');
fs.writeFileSync(generatorSpec, withAsciiTags(spec));

// 5. Génération dans un dossier temporaire, puis remplacement de src/app/api.
const result = spawnSync(
  process.execPath,
  [
    cli,
    'generate',
    '--generator-name',
    'typescript-angular',
    '--input-spec',
    generatorSpec,
    '--output',
    outTmp,
    '--additional-properties',
    Object.entries(ADDITIONAL_PROPERTIES)
      .map(([key, value]) => `${key}=${value}`)
      .join(','),
  ],
  { cwd: root, stdio: 'inherit' },
);
if (result.status !== 0) {
  fs.rmSync(tmp, { recursive: true, force: true });
  fail(
    "openapi-generator a échoué (Java 11+ requis, et l'accès à Maven Central au premier lancement).",
  );
}

/** Fins de ligne LF partout : même sortie sous Windows et sous Linux (.gitattributes). */
function normalize(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) normalize(file);
    else {
      const text = fs.readFileSync(file, 'utf8');
      const lf = text.replace(/\r\n/g, '\n');
      if (lf !== text) fs.writeFileSync(file, lf);
    }
  }
}
normalize(outTmp);
for (const unwanted of ['git_push.sh', '.gitignore', '.openapi-generator-ignore']) {
  fs.rmSync(path.join(outTmp, unwanted), { force: true });
}

fs.writeFileSync(
  path.join(outTmp, 'README.md'),
  [
    '# src/app/api : client généré, ne pas éditer',
    '',
    `Généré par \`pnpm contract:pull\` (tools/contract-pull.mjs) depuis docs/contract/openapi.yaml au tag \`${tag}\`,`,
    'avec openapi-generator typescript-angular (version figée dans openapitools.json).',
    '',
    'Seuls les fichiers `data/*.api.ts` importent ce dossier (handbook §5, règle ESLint). Pour changer de',
    'version : modifier CONTRACT_TAG puis relancer `pnpm contract:pull`, dans une PR dédiée.',
    '',
  ].join('\n'),
);

fs.rmSync(outDir, { recursive: true, force: true });
fs.cpSync(outTmp, outDir, { recursive: true });
fs.rmSync(tmp, { recursive: true, force: true });
log('src/app/api regénéré.');
