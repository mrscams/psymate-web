import { expect, Page, test } from '@playwright/test';

import { adminApi, shareSession } from '../flux-10-admin/helpers';
import { setPreferences } from '../flux-6-vue-ensemble/overview-data';
import { createAccount, signIn } from '../preferences/accounts';
import { ADMIN_AVAILABLE, ADMIN_MISSING } from '../support/admin';
import { expectNoAxeViolations } from '../support/axe';
import { themeFolder } from '../theme/theme-support';
import { axeScreen, expectTheme, shoot, THEMES } from './a11y-support';

// Écrans connectés à 375 px sans défilement horizontal (UX-A1, fiche 00 ; WCAG 1.4.10).
//
// Barre d'application (recherche sur une deuxième ligne sous 600 px), en-tête patient (séance
// empilée sous le nom, bascule « Vue » sous les onglets sous 760 px) et navigation Mon compte
// (onglets horizontaux défilants sous 760 px). Seuls les contenus qui défilent dans leur propre zone
// (tableau des patients, onglets de Mon compte) peuvent dépasser ; la page, jamais. Un second test
// vérifie qu'à 1440 px la mise en page large est conservée. Captures dans PSYMATE_E2E_CAPTURES
// (hors du dépôt), seulement si la variable est définie. Contre l'API locale, jamais de mock.

/** Largeur de défilement du document égale à la fenêtre. */
async function expectPageWidth(page: Page, width: number): Promise<void> {
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth, `largeur de défilement de ${page.url()}`).toBe(width);
}

test.describe('à 375 × 812', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('liste, dossier, timeline et préférences tiennent dans 375 px', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const account = await createAccount(request, 'ux-a1.mobile', 'psychologist');
    const folder = await themeFolder(request);
    await setPreferences(request, { 'overview.view': 'complete' });
    await signIn(page, account);
    const h1 = page.getByRole('heading', { level: 1 }).first();

    // Liste : la recherche de la barre passe sur sa propre ligne, l'avatar reste entier.
    await expect(page.getByRole('link', { name: 'Nina S.', exact: true })).toBeVisible();
    const avatar = page.getByRole('button', { name: /menu du compte/ });
    await expect(avatar).toBeVisible();
    expect((await avatar.boundingBox())?.width).toBe(32);
    const search = page.getByRole('searchbox', { name: 'Rechercher', exact: true });
    const brand = page.getByRole('link', { name: 'PsyMate' }).first();
    expect((await search.boundingBox())!.y).toBeGreaterThan((await brand.boundingBox())!.y + 24);
    await expectPageWidth(page, 375);
    await shoot(page, 'ux-a1-375-01-patients');
    await expectNoAxeViolations(page);

    // Dossier : séance sous le nom, onglets puis bascule « Vue » sur la ligne suivante.
    await page.goto(`/fr/patients/${folder.patientId}`);
    await expect(h1).toHaveText('Nina S.');
    const timelineTab = page.getByRole('link', { name: /Timeline/ });
    const toggle = page.getByRole('group', { name: "Niveau de détail de la vue d'ensemble" });
    await expect(toggle).toBeVisible();
    expect((await toggle.boundingBox())!.y).toBeGreaterThan((await timelineTab.boundingBox())!.y);
    const start = page.getByRole('button', { name: /séance/ }).first();
    expect((await start.boundingBox())!.y).toBeGreaterThan((await h1.boundingBox())!.y);
    await expectPageWidth(page, 375);
    await shoot(page, 'ux-a1-375-02-dossier');
    await expectNoAxeViolations(page);

    // Timeline.
    await timelineTab.click();
    await expect(page).toHaveURL(/\/timeline$/);
    await expectPageWidth(page, 375);
    await shoot(page, 'ux-a1-375-03-timeline');
    await expectNoAxeViolations(page);

    // Mon compte : onglets horizontaux qui défilent dans leur liste, pastilles conservées.
    await page.goto('/fr/mon-compte/preferences');
    await expect(h1).toHaveText('Préférences');
    const nav = page.getByRole('navigation', { name: 'Mon compte' });
    const list = nav.getByRole('list');
    expect(await list.evaluate((ul) => getComputedStyle(ul).flexDirection)).toBe('row');
    expect(await list.evaluate((ul) => ul.scrollWidth > ul.clientWidth)).toBe(true);
    await expectPageWidth(page, 375);
    await shoot(page, 'ux-a1-375-04-preferences');
    await expectNoAxeViolations(page);
  });
});

test.describe('à 1440 × 900', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('la mise en page large est conservée', async ({ page, request }) => {
    test.setTimeout(90_000);
    const account = await createAccount(request, 'ux-a1.large', 'psychologist');
    const folder = await themeFolder(request);
    await setPreferences(request, { 'overview.view': 'complete' });
    await signIn(page, account);
    const h1 = page.getByRole('heading', { level: 1 }).first();

    // Barre sur une seule ligne de 48 px.
    await expect(page.getByRole('link', { name: 'Nina S.', exact: true })).toBeVisible();
    expect((await page.locator('.app-bar').boundingBox())!.height).toBe(48);
    await expectPageWidth(page, 1440);
    await shoot(page, 'ux-a1-1440-01-patients');

    // En-tête patient : onglets et bascule « Vue » sur la même ligne.
    await page.goto(`/fr/patients/${folder.patientId}`);
    await expect(h1).toHaveText('Nina S.');
    const timelineTab = page.getByRole('link', { name: /Timeline/ });
    const toggle = page.getByRole('group', { name: "Niveau de détail de la vue d'ensemble" });
    await expect(toggle).toBeVisible();
    const tabBox = (await timelineTab.boundingBox())!;
    const toggleBox = (await toggle.boundingBox())!;
    expect(toggleBox.y).toBeLessThan(tabBox.y + tabBox.height);
    expect(toggleBox.x).toBeGreaterThan(tabBox.x + tabBox.width);
    await expectPageWidth(page, 1440);
    await shoot(page, 'ux-a1-1440-02-dossier');

    await timelineTab.click();
    await expect(page).toHaveURL(/\/timeline$/);
    await expectPageWidth(page, 1440);
    await shoot(page, 'ux-a1-1440-03-timeline');

    // Mon compte : colonne verticale de 220 px.
    await page.goto('/fr/mon-compte/preferences');
    await expect(h1).toHaveText('Préférences');
    const nav = page.getByRole('navigation', { name: 'Mon compte' });
    expect((await nav.boundingBox())!.width).toBe(220);
    expect(await nav.getByRole('list').evaluate((ul) => getComputedStyle(ul).flexDirection)).toBe(
      'column',
    );
    await expectPageWidth(page, 1440);
    await shoot(page, 'ux-a1-1440-04-preferences');
    await expectNoAxeViolations(page);
  });
});

// UX-A8 : barre d'administration à 375 px (environ 570 px de large avant, onglets hors de la barre
// sombre et contraste axe en échec). La page ne déborde plus : onglets sur leur propre ligne,
// défilants dans leur cadre ; axe sur toute la page, barre comprise, en clair et en sombre.
const ADMIN_SCREENS = [
  ['20-admin-validation', '/fr/admin/validation'],
  ['21-admin-praticiens', '/fr/admin/praticiens'],
  ['22-admin-journal', '/fr/admin/journal'],
  ['28-admin-vocabulaire', '/fr/admin/vocabulaire'],
] as const;

test.describe("barre d'administration (UX-A8)", () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(!ADMIN_AVAILABLE, ADMIN_MISSING);

  for (const theme of THEMES) {
    test(`375 × 812 : quatre écrans sans débordement, barre comprise, axe à 0 (${theme})`, async ({
      page,
      context,
    }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width: 375, height: 812 });
      await page.emulateMedia({ colorScheme: theme });
      const admin = await adminApi();
      try {
        await shareSession(admin, context);
        for (const [name, url] of ADMIN_SCREENS) {
          await page.goto(url);
          await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
          await expectTheme(page, theme);
          const bar = page.locator('pm-admin-bar header');
          const tabs = bar.getByRole('navigation', { name: 'Administration' });
          await expect(tabs.getByRole('link', { name: 'Vocabulaire' })).toBeAttached();
          // La barre tient dans la fenêtre ; seuls les onglets défilent, dans leur propre cadre.
          const barBox = (await bar.boundingBox())!;
          expect(barBox.x + barBox.width).toBeLessThanOrEqual(375);
          expect(await tabs.evaluate((nav) => getComputedStyle(nav).overflowX)).toBe('auto');
          const navBox = (await tabs.boundingBox())!;
          expect(navBox.x).toBeGreaterThanOrEqual(0);
          expect(navBox.x + navBox.width).toBeLessThanOrEqual(375);
          // Rappel sous les onglets, sur la barre sombre.
          const reminder = bar.locator('.reminder');
          expect((await reminder.boundingBox())!.y).toBeGreaterThanOrEqual(
            navBox.y + navBox.height - 1,
          );
          await expectPageWidth(page, 375);
          await shoot(page, `ux-a8-375-${name}-${theme}`);
          await axeScreen(page, theme, `${name} à 375 px`);
        }
      } finally {
        await admin.dispose();
      }
    });
  }

  test('1440 × 900 : une seule ligne de 48 px, rappel à droite avant l’avatar (maquette 20)', async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    const admin = await adminApi();
    try {
      await shareSession(admin, context);
      await page.goto('/fr/admin/validation');
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      const bar = page.locator('pm-admin-bar header');
      expect(Math.round((await bar.boundingBox())!.height)).toBe(49);
      const tabs = (await bar.getByRole('navigation', { name: 'Administration' }).boundingBox())!;
      const reminder = (await bar.locator('.reminder').boundingBox())!;
      const avatar = (await bar.getByRole('button', { name: /menu du compte/ }).boundingBox())!;
      expect(reminder.x).toBeGreaterThan(tabs.x + tabs.width);
      expect(reminder.x + reminder.width).toBeLessThanOrEqual(avatar.x);
      expect(reminder.y).toBeGreaterThanOrEqual(tabs.y);
      expect(reminder.y + reminder.height).toBeLessThanOrEqual(tabs.y + tabs.height);
      await expectPageWidth(page, 1440);
      await expectNoAxeViolations(page);
    } finally {
      await admin.dispose();
    }
  });
});
