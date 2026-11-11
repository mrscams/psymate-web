import { expect, Page, test } from '@playwright/test';

import { adminApi, shareSession } from '../flux-10-admin/helpers';
import { SEED } from '../support/accounts';
import { ADMIN_AVAILABLE, ADMIN_MISSING } from '../support/admin';
import { expectNoAxeViolations } from '../support/axe';

// UX-A10 : la page de destination n'est créée qu'une fois, à l'ouverture directe comme après un
// changement d'habillage (public → praticien). Avant le correctif, la coquille détruisait la branche
// de son @switch, page comprise, à la fin de la première navigation, puis la recréait dans l'outlet
// du nouvel habillage : chaque lecture lancée à la création partait deux fois (liste des patients).
// Deux mesures : les GET vers l'API, et les insertions dans le DOM de l'élément hôte de la page
// (un observateur posé avant le chargement : la page prérendue de l'annuaire compte une fois, à la
// lecture du HTML, puis l'hydratation la reprend sans la recréer). Contre l'API locale (seed small),
// jamais de mock.

/** Compte les GET dont le chemin est exactement `path` (paramètres de requête ignorés). */
function countGets(page: Page, path: string): () => number {
  let count = 0;
  page.on('request', (request) => {
    if (request.method() === 'GET' && new URL(request.url()).pathname === path) count++;
  });
  return () => count;
}

/** Compte, dès le chargement du document, les insertions dans le DOM des éléments `selector`. */
async function watchInsertions(page: Page, selector: string): Promise<() => Promise<number>> {
  await page.addInitScript((tag) => {
    const counts = ((window as unknown as { __inserted?: Record<string, number> }).__inserted ??=
      {});
    counts[tag] = 0;
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof Element && node.localName === tag) counts[tag]++;
        }
      }
    }).observe(document, { childList: true, subtree: true });
  }, selector);
  return () =>
    page.evaluate(
      (tag) => (window as unknown as { __inserted: Record<string, number> }).__inserted[tag],
      selector,
    );
}

/** Laisse partir une éventuelle seconde création ou lecture avant de compter. */
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
}

/** Ce que la coquille a posé pendant le démarrage, observé dès le début du document. */
interface Startup {
  appBar: number;
  shortcuts: number;
  publicHeader: number;
  appMainSeen: boolean;
  shellFocus: number;
  cls: number;
}

/**
 * Réseau ralenti (latence 400 ms, 1,5 Mbit/s) et observateurs posés avant le chargement : insertions
 * de la barre praticien, de l'aide des raccourcis et du bandeau public, classe `app-main` vue sur le
 * <main>, focus reçu par `pm-root`, décalage de mise en page cumulé (CLS, `layout-shift`).
 */
async function watchStartup(page: Page): Promise<() => Promise<Startup>> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 400,
    downloadThroughput: (1.5 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  await page.addInitScript(() => {
    const seen = { appBar: 0, shortcuts: 0, publicHeader: 0, appMainSeen: false, shellFocus: 0 };
    let cls = 0;
    const scope = window as unknown as { __startup: () => Startup };
    scope.__startup = () => ({ ...seen, cls });
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.localName === 'pm-app-bar') seen.appBar++;
          if (node.localName === 'pm-shortcuts-help') seen.shortcuts++;
          if (node.localName === 'pm-public-header') seen.publicHeader++;
        }
      }
      if (document.querySelector('main#main.app-main')) seen.appMainSeen = true;
    }).observe(document, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });
    document.addEventListener(
      'focus',
      (event) => {
        if ((event.target as Element | null)?.localName === 'pm-root') seen.shellFocus++;
      },
      true,
    );
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & {
        value: number;
        hadRecentInput: boolean;
      })[]) {
        if (!entry.hadRecentInput) cls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
  return () => page.evaluate(() => (window as unknown as { __startup: () => Startup }).__startup());
}

/** Erreurs d'hydratation (NG05xx) ou d'exécution en console. */
function watchHydrationErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (/NG0\d{3}|hydrat/i.test(message.text())) errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

for (const { url, heading, prerendered } of [
  { url: '/fr/annuaire', heading: /Trouver un psychologue/, prerendered: true },
  { url: '/fr/connexion', heading: 'Connexion', prerendered: false },
]) {
  test(`démarrage ralenti sur ${url} : aucun habillage supposé avant la fin de la navigation`, async ({
    page,
  }) => {
    const startup = await watchStartup(page);
    const errors = watchHydrationErrors(page);

    await page.goto(url);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await settle(page);
    const measured = await startup();
    test.info().annotations.push({ type: 'démarrage', description: JSON.stringify(measured) });

    // Jamais de barre praticien, d'aide des raccourcis ni de <main class="app-main"> sur une page
    // publique, même un instant ; le bandeau public n'est posé qu'une fois (le HTML prérendu, repris
    // par l'hydratation, ou le rendu client).
    expect(measured.appBar).toBe(0);
    expect(measured.shortcuts).toBe(0);
    expect(measured.appMainSeen).toBe(false);
    expect(measured.publicHeader).toBe(1);
    // Ni focus ni blur de la coquille à l'ouverture directe.
    expect(measured.shellFocus).toBe(0);
    // Pas de décalage de mise en page dû à la coquille (l'annuaire prérendu ne se redimensionne pas).
    expect(measured.cls).toBeLessThan(prerendered ? 0.05 : 0.1);
    expect(errors).toEqual([]);
  });
}

test('ouverture directe de /fr/annuaire : page créée une fois, recherche et vocabulaire lus une fois', async ({
  page,
}) => {
  const inserted = await watchInsertions(page, 'pm-directory-page');
  const searches = countGets(page, '/api/public/directory');
  const vocabulary = countGets(page, '/api/public/directory/vocabulary');

  await page.goto('/fr/annuaire');
  await expect(
    page.getByRole('heading', { level: 1, name: /Trouver un psychologue/ }),
  ).toBeVisible();
  await expect.poll(searches).toBeGreaterThan(0);
  await settle(page);

  expect(await inserted()).toBe(1);
  expect(searches()).toBe(1);
  expect(vocabulary()).toBe(1);
  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(page.getByRole('contentinfo')).toHaveCount(1);
  await expectNoAxeViolations(page);
});

test('ouverture directe de /fr/connexion : page créée une fois, dans l’habillage public', async ({
  page,
}) => {
  const inserted = await watchInsertions(page, 'pm-login-page');

  await page.goto('/fr/connexion');
  await expect(page.getByRole('heading', { level: 1, name: 'Connexion' })).toBeVisible();
  await settle(page);

  expect(await inserted()).toBe(1);
  await expect(page.locator('pm-app-bar')).toHaveCount(0);
  await expect(page.getByRole('main').locator('pm-login-page')).toHaveCount(1);
});

test('connexion puis liste des patients : page créée une fois, liste et tags lus une fois', async ({
  page,
}) => {
  const inserted = await watchInsertions(page, 'pm-patient-list-page');
  await page.goto('/fr/connexion');
  await expect(page.getByRole('heading', { level: 1, name: 'Connexion' })).toBeVisible();

  const patients = countGets(page, '/api/patients');
  const tags = countGets(page, '/api/tags');
  await page.getByLabel('Adresse e-mail').fill(SEED.claire.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(SEED.claire.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();

  await expect(page).toHaveURL(/\/fr\/patients$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Mes patients' })).toBeVisible();
  await expect.poll(patients).toBeGreaterThan(0);
  await settle(page);

  expect(await inserted()).toBe(1);
  expect(patients()).toBe(1);
  expect(tags()).toBe(1);
  // Habillage praticien autour de la même page : barre d'application, un seul <main>.
  await expect(page.locator('pm-app-bar')).toHaveCount(1);
  await expect(page.getByRole('main')).toHaveCount(1);
  await expectNoAxeViolations(page);
});

test('changement d’habillage au clavier : la tabulation repart du haut, par le lien d’évitement', async ({
  page,
}) => {
  const skipLink = page.getByRole('link', { name: 'Aller au contenu' });
  await page.goto('/fr/connexion');
  await page.getByLabel('Adresse e-mail').fill(SEED.claire.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(SEED.claire.password);
  await page.getByLabel('Mot de passe', { exact: true }).press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Mes patients' })).toBeVisible();
  await settle(page);

  // Comme avant UX-A10 (l'habillage entier était reconstruit) : le contrôle qui avait le focus a
  // disparu avec la page de connexion, la tabulation reprend au début du nouvel habillage.
  await page.keyboard.press('Tab');
  await expect(skipLink).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/fr\/patients#main$/);

  await page.getByRole('button', { name: /menu du compte/ }).click();
  await page.getByRole('menuitem', { name: 'Déconnexion' }).press('Enter');
  await expect(page).toHaveURL(/\/fr\/connexion$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Connexion' })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(skipLink).toBeFocused();
});

test.describe('administration', () => {
  test.skip(!ADMIN_AVAILABLE, ADMIN_MISSING);

  test('ouverture directe de /fr/admin/praticiens : page créée une fois, liste lue une fois', async ({
    page,
    context,
  }) => {
    await shareSession(await adminApi(), context);
    const inserted = await watchInsertions(page, 'pm-practitioners-page');
    const practitioners = countGets(page, '/api/admin/practitioners');

    await page.goto('/fr/admin/praticiens');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect.poll(practitioners).toBeGreaterThan(0);
    await settle(page);

    expect(await inserted()).toBe(1);
    expect(practitioners()).toBe(1);
    await expect(page.locator('pm-admin-bar')).toHaveCount(1);
    await expect(page.getByRole('main').locator('pm-practitioners-page')).toHaveCount(1);
  });
});
