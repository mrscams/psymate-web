import AxeBuilder from '@axe-core/playwright';
import { APIRequestContext, expect, Locator, Page, test } from '@playwright/test';

import { ADMIN_AVAILABLE, ADMIN_MISSING } from '../support/admin';
import { expectNoAxeViolations } from '../support/axe';
import { adminApi, shareSession, SubmittedAccount, submittedAccount } from './helpers';

// UX-E1 à UX-E4 (audit UX du 9 nov. 2026, fiches 20, 21, 22, 28) : mise en page des écrans
// d'administration mesurée contre l'API locale (seed small), jamais de mock. Décision de validation
// visible sans défilement à 1440 × 900 et collante ; lignes de 56 px chez les praticiens ;
// aucun débordement horizontal à 375 px, barre d'administration comprise (UX-A9a) ; captures
// 1440 px jointes au rapport pour la comparaison avec les maquettes. axe-core à 0 sur chaque écran
// mesuré, sans exclusion.

const SCREENS = [
  { name: '20-validation', url: '/fr/admin/validation' },
  { name: '21-praticiens', url: '/fr/admin/praticiens' },
  { name: '22-journal', url: '/fr/admin/journal' },
  { name: '28-vocabulaire', url: '/fr/admin/vocabulaire' },
];

async function settled(page: Page): Promise<void> {
  await expect(page.locator('pm-admin-bar')).toBeVisible();
  await expect(page.locator('main h1')).toBeVisible();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 20_000 });
  await page.evaluate(() => document.fonts.ready);
}

/** Boîte de l'élément entièrement dans la fenêtre. */
async function expectInViewport(page: Page, locator: Locator): Promise<void> {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box, 'élément rendu').not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
}

test.describe('administration : mise en page (UX-E1 à UX-E4)', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 });
  test.skip(!ADMIN_AVAILABLE, ADMIN_MISSING);

  let admin: APIRequestContext;
  let practitioner: SubmittedAccount;

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    admin = await adminApi();
    practitioner = await submittedAccount('ux-e1.layout');
  });

  test.afterAll(async () => {
    await practitioner?.api.dispose();
    await admin?.dispose();
  });

  test('1440 × 900 : décision visible sans défilement, colonne collante en lisant le document', async ({
    page,
    context,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await shareSession(admin, context);
    await page.goto(`/fr/admin/validation/${practitioner.id}`);
    await expect(page.locator('#dossier-title')).toHaveText('Alix Essai');
    await settled(page);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    const side = page.getByRole('complementary', { name: 'Vérification et décision' });
    await expect(side.getByRole('group', { name: 'Liste de contrôle' })).toBeVisible();
    for (const name of ['Approuver', 'Demander un complément', 'Refuser et suspendre']) {
      await expectInViewport(page, side.getByRole('button', { name, exact: true }));
    }
    // Colonne droite de 320 px, à droite de la visionneuse de 320 px de haut.
    const sideBox = (await side.boundingBox())!;
    expect(sideBox.width).toBeGreaterThanOrEqual(320);
    expect(sideBox.width).toBeLessThanOrEqual(328);
    const stage = (await page.locator('pm-document-viewer .stage').boundingBox())!;
    expect(Math.round(stage.height)).toBe(320);
    expect(stage.x + stage.width).toBeLessThanOrEqual(sideBox.x);
    await page.screenshot({ path: testInfo.outputPath('20-validation-1440.png') });
    await expectNoAxeViolations(page);

    // En descendant dans le dossier, la décision reste en vue (colonne collante).
    await page.mouse.move(700, 600);
    await page.mouse.wheel(0, 400);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await expectInViewport(page, side.getByRole('button', { name: 'Approuver', exact: true }));
  });

  test('1440 : praticiens en lignes de 56 px, actions en ligne ; captures des quatre écrans', async ({
    page,
    context,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await shareSession(admin, context);
    await page.goto('/fr/admin/praticiens');
    await settled(page);
    const rows = page.locator('tbody tr');
    await expect(rows.first()).toBeVisible();
    const count = await rows.count();
    const heights = await rows.evaluateAll((trs) =>
      trs.map((tr) => Math.round(tr.getBoundingClientRect().height)),
    );
    expect(Math.max(...heights)).toBeLessThanOrEqual(57);
    // Critère de l'audit : 3 400 px au plus pour 47 comptes (56 px par compte au-delà).
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.screenshot({
      path: testInfo.outputPath('21-praticiens-1440-full.png'),
      fullPage: true,
    });
    expect(height).toBeLessThanOrEqual(3400 + Math.max(0, count - 47) * 56);
    // « Suspendre… » en texte, sans bordure.
    const suspend = page.getByRole('button', { name: /^Suspendre…/ }).first();
    if ((await suspend.count()) > 0) {
      expect(await suspend.evaluate((b) => getComputedStyle(b).borderTopStyle)).toBe('none');
    }
    await expectNoAxeViolations(page);

    for (const screen of SCREENS) {
      await page.goto(screen.url);
      await settled(page);
      await page.screenshot({
        path: testInfo.outputPath(`${screen.name}-1440.png`),
        fullPage: screen.name !== '21-praticiens',
      });
    }
  });

  test('375 px : aucun débordement horizontal sur les quatre écrans', async ({
    page,
    context,
  }, testInfo) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await shareSession(admin, context);
    for (const screen of SCREENS) {
      await page.goto(screen.url);
      await settled(page);
      // Page entière, barre d'administration comprise (repliée à 375 px depuis UX-A8) : la page ne
      // défile pas horizontalement, et aucun élément ne dépasse la fenêtre ; le message nomme les
      // fautifs.
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
        `${screen.url} : largeur défilable à 375 px`,
      ).toBe(375);
      const overflow = await page.evaluate(() =>
        [...document.querySelectorAll('body *')]
          // Cadres défilants qui restent dans la page : tableaux (.table-wrap) et onglets de la
          // barre d'administration (nav.tabs, overflow-x: auto sous 720 px).
          .filter((el) => !el.parentElement?.closest('.table-wrap, pm-admin-bar nav.tabs'))
          .filter((el) => el.getBoundingClientRect().right > 375.5)
          .slice(0, 5)
          .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`),
      );
      expect(overflow, `${screen.url} à 375 px`).toEqual([]);
      await page.screenshot({
        path: testInfo.outputPath(`${screen.name}-375.png`),
        fullPage: true,
      });
      // axe sur toute la page, barre comprise, sans exclusion.
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(results.violations, screen.url).toEqual([]);
    }
  });
});
