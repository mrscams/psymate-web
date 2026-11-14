import { expect, Page, test } from '@playwright/test';

import { setPreferences } from '../flux-6-vue-ensemble/overview-data';
import { createAccount, signIn } from '../preferences/accounts';
import { expectNoAxeViolations } from '../support/axe';
import { bodyBackground, SURFACE_RAISED, themeFolder, token, watchReloads } from './theme-support';

// Les parcours « chaque écran en sombre sans violation axe » (praticien, public, administration) ont
// rejoint e2e/accessibilite/axe-ecrans.spec.ts (thème sombre), qui balaie les mêmes écrans : ici ne
// restent que les comportements du thème (suivi du système, bascule sans rechargement).
// Mode sombre et contraste doux (M6-04, C2 ; étude couleurs §6 ; fiche 14, clé `theme`), contre
// l'API locale (seed small, Mailpit), jamais de mock du backend. Chaque test crée son compte jetable :
// la préférence `theme` est persistée côté serveur, aucun compte du seed n'est modifié. Le sombre est
// forcé par la préférence `system` et l'émulation de prefers-color-scheme (page.emulateMedia).

const PREFERENCES = '/fr/mon-compte/preferences';
const PATCH = (response: { url(): string; request(): { method(): string } }): boolean =>
  response.url().endsWith('/api/me/preferences') && response.request().method() === 'PATCH';

async function expectTheme(page: Page, theme: 'light' | 'dark' | 'soft'): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await expect
    .poll(() => bodyBackground(page))
    .toBe(theme === 'dark' ? SURFACE_RAISED.dark : SURFACE_RAISED.light);
}

test.describe('thème', () => {
  test.describe.configure({ timeout: 180_000 });

  test('system suit prefers-color-scheme, sans rechargement, et la courbe relit ses couleurs', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'm6-04.systeme', 'psychologist');
    const folder = await themeFolder(request);
    await setPreferences(request, { theme: 'system' });
    await page.emulateMedia({ colorScheme: 'light' });
    await signIn(page, account);
    await expectTheme(page, 'light');

    // Vue d'ensemble (UX-S6) : la courbe ECharts (SVG) est dessinée avec --feeling du thème clair.
    await page.goto(`/fr/patients/${folder.patientId}`);
    const chart = page.locator('pm-overview-feelings-chart');
    await expect(chart.locator('svg path').first()).toBeAttached({ timeout: 15_000 });
    const lightFeeling = await token(page, '--feeling');
    await expect.poll(() => chart.innerHTML()).toContain(lightFeeling);
    const noReload = await watchReloads(page);

    // L'OS passe en sombre : data-theme, tokens et courbe suivent, sans rechargement.
    await page.emulateMedia({ colorScheme: 'dark' });
    await expectTheme(page, 'dark');
    const darkFeeling = await token(page, '--feeling');
    expect(darkFeeling).not.toBe(lightFeeling);
    await expect.poll(() => chart.innerHTML()).toContain(darkFeeling);
    expect(await chart.innerHTML()).not.toContain(lightFeeling);

    // Retour au clair.
    await page.emulateMedia({ colorScheme: 'light' });
    await expectTheme(page, 'light');
    await expect.poll(() => chart.innerHTML()).toContain(lightFeeling);
    await noReload();
  });

  test('visiteur : sans préférence, la page publique suit le système', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/fr/annuaire');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectTheme(page, 'dark');
    const noReload = await watchReloads(page);
    await page.emulateMedia({ colorScheme: 'light' });
    await expectTheme(page, 'light');
    await noReload();
  });

  test('bascule depuis les préférences : immédiate, sans rechargement, sombre / doux / système', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'm6-04.bascule', 'psychologist');
    await page.emulateMedia({ colorScheme: 'light' });
    await signIn(page, account);
    await page.goto(PREFERENCES);
    await expect(page.getByRole('heading', { level: 1, name: 'Préférences' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Clair' })).toBeChecked();
    await expectTheme(page, 'light');
    const noReload = await watchReloads(page);

    // Sombre : appliqué sur la page sans navigation ; le PATCH part en arrière-plan.
    let patch = page.waitForResponse(PATCH);
    await page.getByText('Sombre', { exact: true }).click();
    await expectTheme(page, 'dark');
    expect((await patch).request().postDataJSON()).toEqual({ theme: 'dark' });
    await expect(page.getByRole('radio', { name: 'Sombre' })).toBeChecked();
    await expectNoAxeViolations(page);

    // Doux : clair, fond et bordure fine adoucis seulement (étude §6).
    patch = page.waitForResponse(PATCH);
    await page.getByText('Doux', { exact: true }).click();
    await expectTheme(page, 'soft');
    expect((await patch).request().postDataJSON()).toEqual({ theme: 'soft' });
    expect(await token(page, '--surface-ground')).toBe('#f3f4f7');
    expect(await token(page, '--border-subtle')).toBe('#dde1e8');
    expect(await token(page, '--primary')).toBe('#3a63c2');
    await expectNoAxeViolations(page);

    // Système : suit l'OS, et le suit encore après un changement.
    await page.emulateMedia({ colorScheme: 'dark' });
    patch = page.waitForResponse(PATCH);
    await page.getByText('Système', { exact: true }).click();
    await expectTheme(page, 'dark');
    expect((await patch).request().postDataJSON()).toEqual({ theme: 'system' });
    await page.emulateMedia({ colorScheme: 'light' });
    await expectTheme(page, 'light');

    // Un choix manuel ignore l'OS.
    patch = page.waitForResponse(PATCH);
    await page.getByText('Sombre', { exact: true }).click();
    await expectTheme(page, 'dark');
    await patch;
    await page.emulateMedia({ colorScheme: 'light' });
    await expectTheme(page, 'dark');
    await noReload();
  });
});
