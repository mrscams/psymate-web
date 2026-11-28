import { expect, Page, test } from '@playwright/test';

import { createAccount, signIn } from '../preferences/accounts';
import { expectNoAxeViolations } from '../support/axe';

// M15-14, socle du module Facturation (fiche 33, « Cadre du module » ; G Q67 et Q68) contre l'API
// réelle (seed small, Mailpit), jamais de mock du backend. Le socle n'appelle aucune route de
// facturation : les pages des onglets restent à l'état « chargement » jusqu'aux écrans M15-15 à
// M15-20. Chaque test crée son compte jetable : rien n'est écrit dans un compte du seed.

/** Le carreau « Facture » du rail de la coquille (habillage praticien, 900 px et plus). */
function invoiceTile(page: Page) {
  return page.locator('pm-nav-rail.app-rail').getByRole('link', { name: 'Facture', exact: true });
}

/** En-tête du module : titre, « Nouvelle facture », onglets. */
function moduleHeader(page: Page) {
  const tabs = page.getByRole('navigation', { name: 'Facturation' });
  return {
    title: page.getByRole('heading', { level: 1, name: 'Facturation' }),
    create: page.getByRole('link', { name: /Nouvelle facture/ }),
    tabs,
    tab: (name: string) => tabs.getByRole('link', { name, exact: true }),
  };
}

/** Thème sombre posé sur <html> comme le fait le service de thème, le temps de l'analyse. */
async function setTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

test('M15-14 : le carreau « Facture » ouvre /facturation et porte aria-current ; les quatre onglets naviguent ; axe-core en clair et en sombre', async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const account = await createAccount(request, 'm15-14.socle', 'psychologist');
  // Aucune route de facturation n'est appelée par le socle.
  const billingCalls: string[] = [];
  page.on('request', (req) => {
    const path = new URL(req.url()).pathname;
    if (/^\/api\/(billing|invoices|payments|me\/billing)/.test(path)) billingCalls.push(path);
  });
  await signIn(page, account);

  // Libellé du carreau inchangé (G Q67 point 8) ; lien vers /facturation.
  const tile = invoiceTile(page);
  await expect(tile).toHaveAttribute('href', '/fr/facturation');
  await expect(tile).not.toHaveAttribute('aria-current');
  await tile.click();
  await expect(page).toHaveURL(/\/fr\/facturation$/);
  await expect(tile).toHaveAttribute('aria-current', 'page');
  await expect(page).toHaveTitle('Facturation · PsyMate');

  const h = moduleHeader(page);
  await expect(h.title).toBeVisible();
  await expect(h.create).toHaveAttribute('href', '/fr/facturation/nouvelle');
  await expect(h.tab('Factures')).toHaveAttribute('aria-current', 'page');
  await expect(h.tabs.getByRole('link')).toHaveText([
    'Factures',
    'À facturer',
    'Paiements',
    'Réglages',
  ]);
  // Pleine largeur (contentWidth 'full') : l'en-tête va du rail au bord droit.
  const width = await page.evaluate(() => document.documentElement.clientWidth);
  const head = (await page.locator('pm-billing-header .mhead').boundingBox())!;
  expect(head.x).toBe(56);
  expect(Math.round(head.x + head.width)).toBe(width);
  // Page minimale à l'état « chargement ».
  await expect(page.locator('pm-invoices-page [aria-busy="true"]')).toBeVisible();
  await expectNoAxeViolations(page);
  await setTheme(page, 'dark');
  await expectNoAxeViolations(page);
  await setTheme(page, 'light');

  // Les quatre onglets naviguent ; le carreau reste actif sur /facturation/**.
  const tabs: [string, RegExp, string, string][] = [
    [
      'À facturer',
      /\/fr\/facturation\/a-facturer$/,
      'pm-billable-page',
      'À facturer · Facturation · PsyMate',
    ],
    [
      'Paiements',
      /\/fr\/facturation\/paiements$/,
      'pm-payments-page',
      'Paiements · Facturation · PsyMate',
    ],
    [
      'Réglages',
      /\/fr\/facturation\/reglages$/,
      'pm-billing-settings-page',
      'Réglages · Facturation · PsyMate',
    ],
    ['Factures', /\/fr\/facturation$/, 'pm-invoices-page', 'Facturation · PsyMate'],
  ];
  for (const [name, url, pageTag, title] of tabs) {
    await h.tab(name).click();
    await expect(page).toHaveURL(url);
    await expect(page).toHaveTitle(title);
    await expect(h.tab(name)).toHaveAttribute('aria-current', 'page');
    await expect(page.locator(`${pageTag} [aria-busy="true"]`)).toBeVisible();
    await expect(tile).toHaveAttribute('aria-current', 'page');
    // Sur Réglages, pas de « Nouvelle facture » (fiche 33).
    await expect(h.create).toHaveCount(name === 'Réglages' ? 0 : 1);
  }
  await page.goto('/fr/facturation/reglages');
  await expect(h.tab('Réglages')).toHaveAttribute('aria-current', 'page');
  await expectNoAxeViolations(page);
  await setTheme(page, 'dark');
  await expectNoAxeViolations(page);

  // Une requête (?statut=, ?patient=) ne change ni l'onglet courant ni le carreau actif.
  await page.goto('/fr/facturation?statut=late');
  await expect(h.tab('Factures')).toHaveAttribute('aria-current', 'page');
  await expect(tile).toHaveAttribute('aria-current', 'page');

  expect(billingCalls).toEqual([]);
});

test('M15-14 : N et « Nouvelle facture » ouvrent /facturation/nouvelle ; N est sans effet sur Réglages', async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const account = await createAccount(request, 'm15-14.nouvelle', 'psychologist');
  await signIn(page, account);
  const h = moduleHeader(page);

  // Touche N depuis un onglet du module.
  await page.goto('/fr/facturation/paiements');
  await expect(h.title).toBeVisible();
  await page.locator('body').press('n');
  await expect(page).toHaveURL(/\/fr\/facturation\/nouvelle$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Nouvelle facture' })).toBeVisible();
  await expect(page).toHaveTitle('Nouvelle facture · PsyMate');
  // L'éditeur a sa propre barre : pas d'en-tête de module.
  await expect(page.locator('pm-billing-header')).toHaveCount(0);
  await expect(page.locator('pm-new-invoice-page [aria-busy="true"]')).toBeVisible();
  await expectNoAxeViolations(page);

  // Retour vers la liste, puis le bouton « Nouvelle facture ».
  await page.getByRole('link', { name: 'Retour aux factures' }).click();
  await expect(page).toHaveURL(/\/fr\/facturation$/);
  await h.create.click();
  await expect(page).toHaveURL(/\/fr\/facturation\/nouvelle$/);

  // Sur Réglages, N ne fait rien.
  await page.goto('/fr/facturation/reglages');
  await expect(h.tab('Réglages')).toHaveAttribute('aria-current', 'page');
  await page.locator('body').press('n');
  await expect(page).toHaveURL(/\/fr\/facturation\/reglages$/);
});

test('M15-14 : à 375 px, onglets sur toute la largeur, « Nouvelle facture » en bas d’écran, rien ne déborde', async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const account = await createAccount(request, 'm15-14.mobile', 'psychologist');
  await signIn(page, account);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/fr/facturation');
  const h = moduleHeader(page);
  await expect(h.title).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);

  // Les onglets se partagent la largeur de l'en-tête.
  const boxes = await h.tabs
    .getByRole('link')
    .evaluateAll((links) => links.map((link) => link.getBoundingClientRect().width));
  expect(boxes).toHaveLength(4);
  for (const box of boxes) expect(Math.abs(box - boxes[0])).toBeLessThanOrEqual(1);

  // « Nouvelle facture » : barre du bas, toute la largeur.
  const create = (await h.create.boundingBox())!;
  expect(create.y + create.height).toBeGreaterThan(812 - 40);
  expect(create.width).toBeGreaterThan(375 - 40);
  await expectNoAxeViolations(page);

  // Le tiroir de navigation mène aussi au module.
  await page.getByRole('button', { name: 'Ouvrir la navigation' }).click();
  const drawer = page.getByRole('dialog', { name: 'Navigation' });
  await expect(drawer.getByRole('link', { name: 'Facture', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await drawer.getByRole('link', { name: 'Patients', exact: true }).click();
  await expect(page).toHaveURL(/\/fr\/patients$/);
  await page.getByRole('button', { name: 'Ouvrir la navigation' }).click();
  await drawer.getByRole('link', { name: 'Facture', exact: true }).click();
  await expect(page).toHaveURL(/\/fr\/facturation$/);
});
