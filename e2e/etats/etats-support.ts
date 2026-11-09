import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  APIRequestContext,
  BrowserContext,
  expect,
  Locator,
  Page,
  request as playwrightRequest,
} from '@playwright/test';

import { createAccount } from '../preferences/accounts';
import { expectNoAxeViolations } from '../support/axe';

// Revue des trois états (M6-03, planche 29) contre l'API réelle (seed small, Mailpit) :
// - « vide » vient toujours de données réelles (compte jetable sans patient, dossier sans entrée…) ;
// - « chargement » : la requête part vers l'API réelle, mais le navigateur la retient (page.route)
//   le temps de vérifier le squelette, puis la laisse passer ; l'API ne peut pas être ralentie à la
//   demande ;
// - « erreur » : le navigateur coupe une seule lecture (page.route + abort, comme une coupure
//   réseau) ; aucune réponse HTTP n'est fabriquée, l'API réelle ne sait pas tomber en panne à la
//   demande. Le reste de la page (session, en-tête, autres blocs) et « Réessayer » parlent à la
//   vraie API.

export type StateKind = 'empty' | 'loading' | 'error';

/** Lecture GET dont le chemin est exactement `path` (les paramètres de requête ne comptent pas). */
export function getOf(path: string | RegExp): (url: URL, method: string) => boolean {
  return (url, method) =>
    method === 'GET' &&
    (typeof path === 'string' ? url.pathname === path : path.test(url.pathname));
}

/** Écriture POST dont le chemin est exactement `path`. */
export function postOf(path: string): (url: URL, method: string) => boolean {
  return (url, method) => method === 'POST' && url.pathname === path;
}

type Matcher = (url: URL, method: string) => boolean;

/** Retient les requêtes visées jusqu'à `release()` ; elles partent ensuite vers l'API réelle. */
export async function hold(page: Page, match: Matcher): Promise<{ release: () => Promise<void> }> {
  let open!: () => void;
  const gate = new Promise<void>((resolve) => (open = resolve));
  const handler = async (route: import('@playwright/test').Route) => {
    if (!match(new URL(route.request().url()), route.request().method())) return route.fallback();
    await gate;
    await route.continue().catch(() => undefined);
  };
  await page.route('**/api/**', handler);
  return {
    release: async () => {
      open();
      await page.unroute('**/api/**', handler);
    },
  };
}

/**
 * Coupe la première requête visée (route.abort : aucune réponse, statut 0 côté client), une seule
 * fois : aucune réponse HTTP n'est fabriquée, et « Réessayer » relit ensuite l'API réelle.
 */
export async function fail(page: Page, match: Matcher): Promise<void> {
  let done = false;
  await page.route('**/api/**', async (route) => {
    if (done || !match(new URL(route.request().url()), route.request().method())) {
      return route.fallback();
    }
    done = true;
    await route.abort('failed');
  });
}

/** Le composant d'état partagé dans la variante voulue, dans `scope` (la page par défaut). */
export function state(scope: Page | Locator, kind: StateKind, text?: string | RegExp): Locator {
  const states = scope.locator(`pm-state .state.${kind}`);
  return text ? states.filter({ hasText: text }) : states.first();
}

/**
 * Vérifie l'état (rôle, aria-busy), axe-core (0 violation) et, si PSYMATE_E2E_CAPTURES désigne un
 * dossier, prend la capture `<écran>-<état>.png` pour la revue visuelle (hors dépôt).
 */
export async function expectState(
  page: Page,
  kind: StateKind,
  capture: string,
  options: { scope?: Locator; text?: string | RegExp } = {},
): Promise<Locator> {
  const located = state(options.scope ?? page, kind, options.text);
  await expect(located).toBeVisible();
  if (kind === 'loading') {
    await expect(located).toHaveAttribute('aria-busy', 'true');
    await expect(located).toHaveAttribute('role', 'status');
  } else {
    await expect(located).toHaveAttribute('role', kind === 'error' ? 'alert' : 'status');
  }
  await expectNoAxeViolations(page);
  await shoot(page, `${capture}-${kind}`);
  return located;
}

/** Capture pleine page pour la revue visuelle, seulement si PSYMATE_E2E_CAPTURES est défini. */
export async function shoot(page: Page, name: string): Promise<void> {
  const dir = process.env['PSYMATE_E2E_CAPTURES'];
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `${name}.png`), fullPage: true, animations: 'disabled' });
}

/** Compte praticien jetable (docs_pending) dont la session sert ensuite au navigateur. */
export async function practitioner(prefix: string): Promise<APIRequestContext> {
  const api = await playwrightRequest.newContext();
  await createAccount(api, prefix, 'psychologist');
  return api;
}

/** Ouvre dans le navigateur la session du contexte API (cookies du domaine localhost). */
export async function shareSession(api: APIRequestContext, context: BrowserContext): Promise<void> {
  const { cookies } = await api.storageState();
  await context.addCookies(cookies);
}
