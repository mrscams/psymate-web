import { expect, Page, test } from '@playwright/test';

import { setPreferences } from '../flux-6-vue-ensemble/overview-data';
import { createAccount, signIn } from '../preferences/accounts';
import { expectNoAxeViolations } from '../support/axe';
import { themeFolder } from '../theme/theme-support';
import { shoot } from './a11y-support';

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
