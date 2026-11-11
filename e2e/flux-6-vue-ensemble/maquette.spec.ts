import { expect, Locator, Page, test } from '@playwright/test';

import { createAccount, signIn } from '../preferences/accounts';
import { expectNoAxeViolations } from '../support/axe';
import { shoot } from '../support/captures';
import { block, risingFolder, setPreferences, viewToggle } from './overview-data';

// Vue d'ensemble fidèle aux maquettes 02 et 02b (UX-B4, UX-B5), contre l'API locale (seed small),
// jamais de mock du backend : grille et blocs de la maquette, aucune ligne verticale par séance,
// légendes de quatre éléments au plus, pas de défilement horizontal à 375 px, axe-core sans
// violation en clair et en sombre. Captures 1440 et 375 dans PSYMATE_E2E_CAPTURES (hors du dépôt),
// seulement si la variable est définie.

/** Plus aucun bloc en chargement, et le graphe dessiné par ECharts. */
async function drawn(page: Page, chart: string): Promise<void> {
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator(`${chart} svg path`).first()).toBeAttached({ timeout: 15_000 });
}

/** Traits verticaux de plus de 40 px dans le SVG du graphe (repères qui barrent la courbe). */
async function verticalLines(chart: Locator): Promise<number> {
  return chart
    .evaluate((host) =>
      [...host.querySelectorAll('svg path, svg line')].filter((shape) => {
        const box = (shape as SVGGraphicsElement).getBBox();
        return box.width < 1.5 && box.height > 40;
      }),
    )
    .then((list) => list.length);
}

async function pageWidth(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth);
}

test.describe('vue d’ensemble fidèle aux maquettes 02 et 02b', () => {
  test.describe.configure({ timeout: 120_000 });

  test('vue complète à 1440 : grille de la maquette, tendance sans ligne de séance, légende de 3', async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const account = await createAccount(request, 'ux-b4.maquette', 'psychologist');
    await setPreferences(request, { 'overview.view': 'complete' });
    const folder = await risingFolder(request);
    await signIn(page, account);
    await page.goto(`/fr/patients/${folder.patientId}`);
    await drawn(page, 'pm-overview-trend-chart');

    // Ordre des blocs de la maquette 02.
    await expect(page.locator('pm-overview-block h3')).toHaveText([
      'Faits clés',
      "Tendance d'intensité · 90 jours",
      'Situations actives',
      'Dernières séances',
      'Émotions dominantes · 90 jours',
      'À compléter',
      'Activité récente',
    ]);
    // Faits clés et tendance sur la même rangée ; la fenêtre dans la carte de la tendance.
    const facts = (await block(page, 'Faits clés').boundingBox())!;
    const trend = block(page, "Tendance d'intensité · 90 jours");
    const trendBox = (await trend.boundingBox())!;
    expect(Math.abs(facts.y - trendBox.y)).toBeLessThan(2);
    expect(trendBox.x).toBeGreaterThan(facts.x + facts.width);
    await expect(trend.getByRole('group', { name: "Période de la vue d'ensemble" })).toBeVisible();

    // Une seule courbe, aucune ligne verticale ; légende de trois éléments.
    expect(await verticalLines(trend.locator('pm-overview-trend-chart'))).toBe(0);
    await expect(trend.getByRole('list', { name: 'Légende' }).getByRole('listitem')).toHaveText([
      'Intensité des ressentis',
      'Séance',
      'Changement de médicament',
    ]);

    // Activité récente en deux colonnes, aucune ligne titrée « Note » ou « Ressenti » seule.
    const activity = block(page, 'Activité récente');
    const items = activity.getByRole('listitem');
    const first = (await items.nth(0).boundingBox())!;
    const second = (await items.nth(1).boundingBox())!;
    expect(Math.abs(first.y - second.y)).toBeLessThan(2);
    for (const name of await activity.getByRole('link').allTextContents()) {
      expect(['Note', 'Ressenti', 'Séance']).not.toContain(name.trim());
    }
    await expect(activity.getByText(/^v1$/)).toHaveCount(0);

    await shoot(page, 'ux-b4-02-complete-1440-clair');
    await expectNoAxeViolations(page);

    // Sombre : mêmes blocs, axe sans violation.
    await setPreferences(request, { theme: 'dark' });
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await drawn(page, 'pm-overview-trend-chart');
    await shoot(page, 'ux-b4-02-complete-1440-sombre');
    await expectNoAxeViolations(page);
  });

  test('vue simple à 1440 : phrase-titre, légende de 4 au plus, « À compléter » ambre', async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const account = await createAccount(request, 'ux-b5.maquette', 'psychologist');
    const folder = await risingFolder(request);
    await signIn(page, account);
    await page.goto(`/fr/patients/${folder.patientId}`);
    await expect(viewToggle(page).getByRole('button', { name: 'Simple' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await drawn(page, 'pm-overview-feelings-chart');

    const feelings = block(page, /^Comment évoluent les ressentis/);
    await expect(feelings.locator('.headline')).toContainText('domine');
    const legend = feelings.getByRole('list', { name: 'Légende' }).getByRole('listitem');
    expect(await legend.count()).toBeLessThanOrEqual(4);
    expect(await verticalLines(feelings.locator('pm-overview-feelings-chart'))).toBeLessThanOrEqual(
      // Un repère de médicament (Sertraline) : la seule ligne verticale admise.
      1,
    );
    // Faits en gras dans « En bref ».
    await expect(block(page, 'En bref').locator('.sentence strong').first()).toBeVisible();

    await shoot(page, 'ux-b5-02b-simple-1440-clair');
    await expectNoAxeViolations(page);

    await setPreferences(request, { theme: 'dark' });
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await drawn(page, 'pm-overview-feelings-chart');
    await shoot(page, 'ux-b5-02b-simple-1440-sombre');
    await expectNoAxeViolations(page);
  });

  test('375 px : aucune des deux vues ne déborde', async ({ page, request }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const account = await createAccount(request, 'ux-b4.mobile', 'psychologist');
    const folder = await risingFolder(request);
    await signIn(page, account);

    await page.goto(`/fr/patients/${folder.patientId}`);
    await drawn(page, 'pm-overview-feelings-chart');
    expect(await pageWidth(page)).toBe(375);
    await shoot(page, 'ux-b5-02b-simple-375');
    await expectNoAxeViolations(page);

    await setPreferences(request, { 'overview.view': 'complete' });
    await page.reload();
    await drawn(page, 'pm-overview-trend-chart');
    expect(await pageWidth(page)).toBe(375);
    await shoot(page, 'ux-b4-02-complete-375');
    await expectNoAxeViolations(page);
  });
});
