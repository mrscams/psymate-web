import { expect, Page, test } from '@playwright/test';

import { setPreferences } from '../flux-6-vue-ensemble/overview-data';
import { enableProbe, graphReady } from '../flux-6-graphe/graph-support';
import { adminApi, shareSession } from '../flux-10-admin/helpers';
import { createAccount, signIn } from '../preferences/accounts';
import { ADMIN_AVAILABLE, ADMIN_MISSING } from '../support/admin';
import { expectNoAxeViolations } from '../support/axe';
import {
  bodyBackground,
  capture,
  expectNoAxeViolationsSoft,
  settled,
  SURFACE_RAISED,
  themeFolder,
  token,
  watchReloads,
} from './theme-support';

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
    await setPreferences(request, { theme: 'system', 'overview.view': 'complete' });
    await page.emulateMedia({ colorScheme: 'light' });
    await signIn(page, account);
    await expectTheme(page, 'light');

    // Vue d'ensemble complète : la courbe ECharts (SVG) est dessinée avec --feeling du thème clair.
    await page.goto(`/fr/patients/${folder.patientId}`);
    const chart = page.locator('pm-overview-trend-chart');
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

    // Sombre : appliqué avant même la réponse du serveur (PATCH en arrière-plan).
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

  test('parcours en sombre : chaque écran sans violation axe-core, captures pleine page', async ({
    page,
    request,
  }, testInfo) => {
    const account = await createAccount(request, 'm6-04.parcours', 'psychologist');
    const folder = await themeFolder(request);
    await setPreferences(request, { theme: 'system', 'overview.view': 'complete' });
    await enableProbe(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    await signIn(page, account);

    // Écran prêt : son titre de niveau 1 (hors dialogue : le fond devient inerte) et son contenu.
    const titled = async (): Promise<void> => {
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    };
    const screens: [string, string, () => Promise<void>][] = [
      [
        '01-patients',
        '/fr/patients',
        async () => {
          await expect(page.getByRole('link', { name: 'Nina S.', exact: true })).toBeVisible();
        },
      ],
      [
        '02-nouveau-patient',
        '/fr/patients/nouveau',
        async () => {
          await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        },
      ],
      [
        '03-fiche-patient',
        `/fr/patients/${folder.patientId}/fiche`,
        async () => {
          await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        },
      ],
      [
        '04-vue-ensemble',
        `/fr/patients/${folder.patientId}`,
        async () => {
          await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nina S.');
          await expect(page.locator('pm-overview-trend-chart svg path').first()).toBeAttached({
            timeout: 15_000,
          });
        },
      ],
      [
        '05-timeline',
        `/fr/patients/${folder.patientId}/timeline`,
        async () => {
          // Mode par séance (défaut) : la séance passée se déplie, ses cartes colorées par type.
          await page.getByRole('button', { name: /^Séance du .* 8 entrées$/ }).click();
          await expect(page.getByText('Joie après la randonnée').first()).toBeVisible();
        },
      ],
      [
        '07-recherche',
        `/fr/patients/${folder.patientId}/search?q=anxi%C3%A9t%C3%A9`,
        async () => {
          await expect(page.locator('mark').first()).toBeVisible();
        },
      ],
      [
        '08-editeur-entree',
        `/fr/patients/${folder.patientId}?entry=${folder.feeling}`,
        async () => {
          const dialog = page.locator('[role="dialog"]:has(pm-entry-editor-panel)');
          await expect(dialog).toBeVisible();
          await expect(page.locator('.mdc-dialog--opening')).toHaveCount(0);
        },
      ],
      [
        '09-editeur-lien',
        `/fr/patients/${folder.patientId}?link=${folder.event}`,
        async () => {
          const dialog = page.locator('[role="dialog"]:has(pm-link-editor-panel)');
          await expect(dialog.getByRole('heading', { name: 'Lier deux entrées' })).toBeVisible();
        },
      ],
      [
        '10-preferences',
        PREFERENCES,
        async () => {
          await expect(page.getByRole('radio', { name: 'Système' })).toBeChecked();
        },
      ],
      ['11-dossier-professionnel', '/fr/mon-compte/dossier-professionnel', titled],
      ['12-profil-public', '/fr/mon-compte/profil-public', titled],
      ['13-emotions', '/fr/mon-compte/emotions', titled],
      ['14-tags', '/fr/mon-compte/tags', titled],
      ['15-securite', '/fr/mon-compte/securite', titled],
    ];

    for (const [name, url, ready] of screens) {
      await test.step(name, async () => {
        await page.goto(url);
        await ready();
        await settled(page);
        await expectTheme(page, 'dark');
        await expectNoAxeViolationsSoft(page, name);
        await capture(page, testInfo, name);
      });
    }

    // Graphe : axe hors du canevas (Cytoscape dessine dans un <canvas>, sans DOM à analyser).
    await test.step('06-graphe', async () => {
      await page.goto(`/fr/patients/${folder.patientId}/graph?root=${folder.situation}`);
      // Situation racine, l'événement qui la déclenche et le ressenti qu'elle aggrave.
      await graphReady(page, { count: 3 });
      await settled(page);
      await expectTheme(page, 'dark');
      await expectNoAxeViolationsSoft(page, '06-graphe', 'pm-graph-canvas .canvas');
      await capture(page, testInfo, '06-graphe');
    });
  });

  test('parcours en sombre, pages publiques et d’authentification', async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    for (const [name, url] of [
      ['20-annuaire', '/fr/annuaire'],
      ['21-comment-ca-marche', '/fr/comment-ca-marche'],
      ['22-connexion', '/fr/connexion'],
      ['23-inscription', '/fr/inscription'],
      ['24-mot-de-passe-oublie', '/fr/mot-de-passe-oublie'],
    ]) {
      await test.step(name, async () => {
        await page.goto(url);
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
        await settled(page);
        await expectTheme(page, 'dark');
        await expectNoAxeViolationsSoft(page, name);
        await capture(page, testInfo, name);
      });
    }
  });

  test('parcours en sombre, administration', async ({ page, context }, testInfo) => {
    // L'administrateur e2e (2FA) n'est pas dans le dépôt : voir e2e/support/admin.ts.
    test.skip(!ADMIN_AVAILABLE, ADMIN_MISSING);
    const admin = await adminApi();
    try {
      await shareSession(admin, context);
      await page.emulateMedia({ colorScheme: 'dark' });
      for (const [name, url] of [
        ['30-admin-validation', '/fr/admin/validation'],
        ['31-admin-praticiens', '/fr/admin/praticiens'],
        ['32-admin-journal', '/fr/admin/journal'],
        ['33-admin-vocabulaire', '/fr/admin/vocabulaire'],
      ]) {
        await test.step(name, async () => {
          await page.goto(url);
          await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
          await settled(page);
          // La barre d'administration garde ses couleurs (fiche 00 §5) ; le reste passe en sombre.
          await expectTheme(page, 'dark');
          await expectNoAxeViolationsSoft(page, name);
          await capture(page, testInfo, name);
        });
      }
    } finally {
      await admin.dispose();
    }
  });
});
