import { expect, test } from '@playwright/test';

import { createAccount, signIn } from '../preferences/accounts';
import { expectNoAxeViolations } from '../support/axe';
import {
  block,
  emptyPatient,
  isOverview,
  overviewFolder,
  overviewWindow,
  serverMs,
  setPreferences,
  viewToggle,
  windowSelector,
} from './overview-data';

// Vue d'ensemble complète (M4-05, fiche 02, B3 flux 6, B4 écran 2, B8), contre l'API locale (seed
// small, Mailpit), jamais de mock du backend. Chaque test crée son compte jetable et ses dossiers
// par l'API ; axe-core (WCAG 2.0/2.1 A et AA) dans chaque test.

const API = 'http://localhost:8080';

test.describe('vue d’ensemble', () => {
  test.describe.configure({ timeout: 120_000 });

  test('ouvrir un patient : synthèse en moins de 200 ms côté API, situation → graphe centré', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'm4-05.ouvrir', 'psychologist');
    const folder = await overviewFolder(request);
    await signIn(page, account);

    // Ouverture du patient (défaut du compte : vue simple, 90 jours). Mesure : durée de la réponse
    // GET …/overview relue par le navigateur (de l'envoi au premier octet).
    const opened = page.waitForResponse((r) => isOverview(r, folder.patientId));
    await page.goto(`/fr/patients/${folder.patientId}`);
    const first = await opened;
    expect(first.status()).toBe(200);
    expect(overviewWindow(first)).toBe('90d');
    const openMs = serverMs(first);
    test.info().annotations.push({ type: 'overview-open-ms', description: openMs.toFixed(1) });
    console.log(`[M4-05] GET /overview à l'ouverture : ${openMs.toFixed(1)} ms`);
    expect(openMs).toBeLessThan(200);

    // Vue simple (M4-07 à venir) : l'état provisoire ; la bascule est à droite des onglets.
    await expect(page.getByText('Récit : bientôt')).toBeVisible();
    const toggle = viewToggle(page);
    await expect(toggle).toContainText('mémorisée dans vos préférences');
    await expect(toggle.getByRole('button', { name: 'Simple' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expectNoAxeViolations(page);

    // Bascule « Complète » : écrit overview.view tout de suite ; les blocs de la vue complète.
    const saved = page.waitForResponse(
      (r) => r.url().endsWith('/api/me/preferences') && r.request().method() === 'PATCH',
    );
    await toggle.getByRole('button', { name: 'Complète' }).click();
    expect((await saved).request().postDataJSON()).toEqual({ 'overview.view': 'complete' });
    await expect(toggle.getByRole('button', { name: 'Complète' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const summary = block(page, 'Résumé');
    // Tuile « Ressentis » : les trois ressentis de la fenêtre.
    await expect(summary.locator('.figure').nth(1)).toHaveText('3');
    const trend = block(page, "Tendance d'intensité · 90 jours");
    await expect(trend.getByRole('img')).toHaveAttribute(
      'aria-label',
      /Ressentis sur la période : 3/,
    );
    // ECharts (chargé à la demande) dessine la courbe.
    await expect(trend.locator('pm-overview-trend-chart svg').first()).toBeVisible();
    await expect(block(page, 'Traitement en cours')).toContainText('Sertraline 50 mg');
    await expect(block(page, /Émotions dominantes/)).toContainText('Anxiété');
    const situations = block(page, 'Situations actives');
    await expect(situations).toContainText('Surcharge au travail');
    await expect(situations).toContainText('2 ressentis liés · intensité moy. 7,0/10');
    await expect(page.locator('footer')).toContainText('Dernière mise à jour de la synthèse');
    await expectNoAxeViolations(page);

    // Dernières séances : la plus récente est dépliée, et mène à la timeline par séance.
    const sessions = block(page, 'Dernières séances');
    await expect(sessions.locator('button[aria-expanded="true"]')).toHaveCount(1);
    await expect(
      sessions.getByRole('link', { name: 'Voir la séance dans la timeline' }),
    ).toHaveAttribute('href', new RegExp(`/timeline\\?mode=session&focus=`));

    // Clic sur la situation → graphe centré sur elle.
    await situations.getByRole('link', { name: /Voir dans le graphe/ }).click();
    await expect(page).toHaveURL(
      new RegExp(`/fr/patients/${folder.patientId}/graph\\?root=${folder.situation}$`),
    );
    await expect(page.locator('select.root-select option:checked')).toContainText(
      'Surcharge au travail',
    );

    // Mesure à chaud (dossier relu, cache de la projection) : 5 lectures directes de l'API.
    const timings: number[] = [];
    for (let i = 0; i < 5; i++) {
      const started = performance.now();
      const response = await request.get(
        `${API}/api/patients/${folder.patientId}/overview?window=90d`,
      );
      timings.push(performance.now() - started);
      expect(response.status()).toBe(200);
    }
    const median = [...timings].sort((a, b) => a - b)[2];
    test
      .info()
      .annotations.push({ type: 'overview-warm-median-ms', description: median.toFixed(1) });
    console.log(`[M4-05] GET /overview à chaud, médiane de 5 : ${median.toFixed(1)} ms`);
    expect(median).toBeLessThan(200);
  });

  test('bascule et fenêtre conservées après reconnexion (préférences du compte)', async ({
    page,
    request,
    browser,
  }) => {
    const account = await createAccount(request, 'm4-05.prefs', 'psychologist');
    const folder = await overviewFolder(request);
    await signIn(page, account);
    await page.goto(`/fr/patients/${folder.patientId}`);
    const viewSaved = page.waitForResponse(
      (r) => r.url().endsWith('/api/me/preferences') && r.request().method() === 'PATCH',
    );
    await viewToggle(page).getByRole('button', { name: 'Complète' }).click();
    expect((await viewSaved).request().postDataJSON()).toEqual({ 'overview.view': 'complete' });
    await expect(block(page, 'Résumé')).toBeVisible();

    // 1 an : écrit overview.window, la synthèse est relue par l'API avec ?window=12m.
    const saved = page.waitForResponse(
      (r) => r.url().endsWith('/api/me/preferences') && r.request().method() === 'PATCH',
    );
    const reread = page.waitForResponse((r) => isOverview(r, folder.patientId));
    await windowSelector(page).getByRole('button', { name: '1 an' }).click();
    expect((await saved).request().postDataJSON()).toEqual({ 'overview.window': '12m' });
    expect(overviewWindow(await reread)).toBe('12m');
    await expect(block(page, "Tendance d'intensité · 12 mois")).toBeVisible();
    await expectNoAxeViolations(page);

    // Autre navigateur (ni cookie ni cache local) : reconnexion, la vue et la fenêtre sont là.
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await signIn(otherPage, account);
    const opened = otherPage.waitForResponse((r) => isOverview(r, folder.patientId));
    await otherPage.goto(`/fr/patients/${folder.patientId}`);
    expect(overviewWindow(await opened)).toBe('12m');
    await expect(viewToggle(otherPage).getByRole('button', { name: 'Complète' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(windowSelector(otherPage).getByRole('button', { name: '1 an' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(block(otherPage, "Tendance d'intensité · 12 mois")).toBeVisible();
    await expectNoAxeViolations(otherPage);
    await other.close();
  });

  test('saisir une entrée depuis l’onglet : la vue d’ensemble se recharge', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'm4-05.saisie', 'psychologist');
    await setPreferences(request, { 'overview.view': 'complete' });
    const folder = await overviewFolder(request);
    await signIn(page, account);
    await page.goto(`/fr/patients/${folder.patientId}`);
    const activity = block(page, 'Activité récente');
    await expect(activity.locator('li').first()).toBeVisible();
    const before = await activity.locator('li').count();

    // Barre de capture du shell → éditeur d'entrée → Enregistrer.
    const capture = page.getByRole('textbox', { name: 'Noter quelque chose' });
    await capture.fill('Arrive détendue, parle du week-end');
    await capture.press('Enter');
    const dialog = page.locator('[role="dialog"]:has(pm-entry-editor-panel)');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('pm-state [aria-busy="true"]')).toHaveCount(0);
    const created = page.waitForResponse(
      (r) =>
        r.request().method() === 'POST' &&
        r.url().endsWith(`/api/patients/${folder.patientId}/entries`),
    );
    const reread = page.waitForResponse((r) => isOverview(r, folder.patientId));
    await dialog.locator('.footer .primary').click();
    const response = await created;
    expect(response.status()).toBe(201);
    const { id } = (await response.json()) as { id: string };

    // Nouvelle lecture de la projection (jamais de recalcul local) : l'entrée est dans l'activité.
    const after = await reread;
    expect(after.status()).toBe(200);
    expect(after.request().timing().startTime).toBeGreaterThan(
      response.request().timing().startTime,
    );
    await expect(dialog).toHaveCount(0);
    await expect(activity.locator(`a[href$="entry=${id}"]`)).toBeVisible();
    await expect(activity.locator('li')).toHaveCount(Math.min(before + 1, 10));
    await expectNoAxeViolations(page);
  });

  test('patient sans données : chaque bloc garde son titre et son état vide', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'm4-05.vide', 'psychologist');
    await setPreferences(request, { 'overview.view': 'complete' });
    const patientId = await emptyPatient(request);
    await signIn(page, account);
    await page.goto(`/fr/patients/${patientId}`);

    const empties: [string | RegExp, string][] = [
      [/Tendance d'intensité/, 'Pas encore de ressentis sur cette période'],
      ['À surveiller · à compléter', 'Rien à signaler'],
      ['Situations actives', 'Aucune situation en cours'],
      ['Traitement en cours', 'Aucun traitement en cours'],
      ['Dernières séances', 'Aucune séance'],
      [/Émotions dominantes/, "Pas d'émotion dominante"],
      ['Activité récente', 'Aucune entrée pour le moment'],
    ];
    for (const [heading, title] of empties) {
      const section = block(page, heading);
      await expect(section.getByRole('status')).toContainText(title);
    }
    // Le résumé n'est jamais « vide » : ses zéros sont une information.
    await expect(block(page, 'Résumé').locator('.figure')).toHaveText(['0', '0', '—', '0']);
    await expectNoAxeViolations(page);
  });

  test('mode sombre : tokens sombres appliqués à la vue complète, axe sans violation', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'm4-05.sombre', 'psychologist');
    await setPreferences(request, { 'overview.view': 'complete', theme: 'dark' });
    const folder = await overviewFolder(request);
    await signIn(page, account);
    await page.goto(`/fr/patients/${folder.patientId}`);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const trend = block(page, "Tendance d'intensité · 90 jours");
    await expect(trend.locator('pm-overview-trend-chart svg').first()).toBeVisible();
    await expect(block(page, 'Situations actives')).toContainText('Surcharge au travail');
    await expectNoAxeViolations(page);
  });
});
