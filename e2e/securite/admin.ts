import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { TestAccount } from '../support/accounts';
import { uniqueEmail } from '../support/accounts';

/** Dépôt psymate-api : PSYMATE_API_DIR, sinon le dossier frère `psymate-api` du premier parent qui en a un. */
export function apiRepoDir(): string | null {
  const fromEnv = process.env['PSYMATE_API_DIR'];
  if (fromEnv) return existsSync(fromEnv) ? resolve(fromEnv) : null;
  let dir = process.cwd();
  for (let depth = 0; depth < 8; depth++) {
    const candidate = join(dir, 'psymate-api');
    if (existsSync(join(candidate, 'Makefile'))) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const PASSWORD_LINE = /Mot de passe\s*:\s*([A-Za-z0-9]{20})/;

/**
 * Crée un administrateur de bootstrap par `make admin EMAIL=…` dans psymate-api (G Q5, M7-08) et
 * lit le mot de passe à usage unique affiché une seule fois. Lance Maven : compter 1 à 3 minutes.
 * Lève une erreur lisible si le dépôt est introuvable ou si la commande échoue.
 */
export function createAdmin(prefix: string): TestAccount {
  const repo = apiRepoDir();
  if (!repo) {
    throw new Error(
      'psymate-api introuvable : clonez-le à côté de psymate-web ou donnez PSYMATE_API_DIR.',
    );
  }
  const email = uniqueEmail(prefix);
  const output = execFileSync('make', ['admin', `EMAIL=${email}`], {
    cwd: repo,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 240_000,
    env: { ...process.env, MAVEN_OPTS: process.env['MAVEN_OPTS'] ?? '' },
  });
  const match = PASSWORD_LINE.exec(output);
  if (!match) {
    throw new Error(`make admin n'a pas affiché le mot de passe attendu :\n${output.slice(-800)}`);
  }
  return { email, password: match[1] };
}
