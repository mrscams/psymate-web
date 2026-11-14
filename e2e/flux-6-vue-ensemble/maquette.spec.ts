import { expect, Locator, Page, test } from '@playwright/test';

import { createAccount, signIn } from '../preferences/accounts';
import { expectNoAxeViolations } from '../support/axe';
import { shoot } from '../support/captures';
import { block, notedSince, risingFolder, setPreferences, since } from './overview-data';

// Vue d'ensemble fidèle à la proposition propositions-2026-11/02-vue-ensemble (UX-S6), contre
// l'API locale (seed small), jamais de mock du backend : pleine largeur, deux colonnes (lecture et
// latérale de 340 px, 20 px d'écart), une seule boîte (le graphe), sections sans boîte, titres en
// casse de phrase ; une colonne sous 900 px ; pas de défilement horizontal à 390 px ; axe-core
// sans violation en clair et en sombre. Captures dans PSYMATE_E2E_CAPTURES (hors du dépôt),
// seulement si la variable est définie.

/** Plus aucune section en chargement, et le graphe dessiné par ECharts. */
async function drawn(page: Page): Promise<void> {
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator('pm-overview-feelings-chart svg path').first()).toBeAttached({
    timeout: 15_000,
  });
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

async function box(locator: Locator) {
  const found = await locator.boundingBox();
  if (!found) throw new Error('élément sans boîte');
  return found;
}

test.describe('vue d’ensemble fidèle à la proposition 02', () => {
  test.describe.configure({ timeout: 120_000 });

  for (const width of [1440, 1280]) {
    test(`${width} px : pleine largeur, deux colonnes, une seule boîte, en clair et en sombre`, async ({
      page,
      request,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      const account = await createAccount(request, `ux-s6.maquette-${width}`, 'psychologist');
      const folder = await risingFolder(request);
      await notedSince(request, folder.patientId);
      await signIn(page, account);
      await page.goto(`/fr/patients/${folder.patientId}`);
      await drawn(page);

      // Pleine largeur (route contentWidth full) : la colonne de contenu va de 24 px au bord.
      const layout = await box(page.locator('.ov'));
      expect(layout.x).toBeCloseTo(24, 0);
      expect(layout.x + layout.width).toBeCloseTo(width - 24, 0);
      // Latérale de 340 px, 20 px après la colonne de lecture, alignées en haut.
      const main = await box(page.locator('.ov > .main'));
      const side = await box(page.locator('.ov > pm-overview-side'));
      expect(side.width).toBeCloseTo(340, 0);
      expect(side.x - (main.x + main.width)).toBeCloseTo(20, 0);
      expect(Math.abs(side.y - main.y)).toBeLessThan(2);

      // La bande « Depuis » d'abord, puis les sections ; une seule boîte : la carte du graphe.
      const strip = await box(since(page));
      const chartSection = await box(block(page, 'Comment évoluent les ressentis'));
      expect(strip.y).toBeLessThan(chartSection.y);
      await expect(page.locator('pm-overview-page .panel')).toHaveCount(1);
      await expect(page.locator('pm-overview-section h3').first()).toHaveCSS('font-size', '15px');
      await expect(page.locator('pm-overview-section h3').first()).toHaveCSS('font-weight', '650');
      await expect(page.locator('pm-overview-section h3').first()).toHaveCSS(
        'text-transform',
        'none',
      );

      // Le graphe : une seule ligne verticale, le repère de traitement (Sertraline).
      const feelings = block(page, 'Comment évoluent les ressentis');
      expect(
        await verticalLines(feelings.locator('pm-overview-feelings-chart')),
      ).toBeLessThanOrEqual(1);
      await expect(
        feelings.getByRole('list', { name: 'Légende' }).getByRole('listitem'),
      ).toContainText(['Anxiété', 'Joie', 'séance', 'traitement']);

      // Le sélecteur de fenêtre dans la rangée des onglets, à droite.
      const tabs = await box(page.locator('pm-patient-header .tabs-row'));
      const windows = await box(page.getByRole('group', { name: 'Fenêtre', exact: true }));
      expect(windows.y).toBeGreaterThanOrEqual(tabs.y - 4);
      expect(windows.x).toBeGreaterThan(tabs.x + tabs.width / 2);

      expect(await pageWidth(page)).toBe(width);
      await shoot(page, `ux-s6-02-vue-ensemble-${width}-clair`);
      await expectNoAxeViolations(page);

      await setPreferences(request, { theme: 'dark' });
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await drawn(page);
      await shoot(page, `ux-s6-02-vue-ensemble-${width}-sombre`);
      await expectNoAxeViolations(page);
    });
  }

  test('390 px : une colonne, bande « Depuis », graphe, noté depuis, puis les blocs latéraux', async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const account = await createAccount(request, 'ux-s6.mobile', 'psychologist');
    const folder = await risingFolder(request);
    await notedSince(request, folder.patientId);
    await signIn(page, account);
    await page.goto(`/fr/patients/${folder.patientId}`);
    await drawn(page);

    const order = [
      since(page),
      block(page, 'Comment évoluent les ressentis'),
      block(page, 'Noté depuis la dernière séance'),
      block(page, 'Cadre du suivi'),
      block(page, 'À compléter'),
    ];
    let previous = -1;
    for (const locator of order) {
      const found = await box(locator);
      expect(found.y).toBeGreaterThan(previous);
      expect(found.width).toBeLessThanOrEqual(390 - 32 + 1);
      previous = found.y;
    }
    // Mobile : l'intensité en chiffres à la place de l'échelle, sans date.
    const entry = block(page, 'Noté depuis la dernière séance').locator('a.entry').nth(1);
    await expect(entry.locator('.value')).toHaveText('7/10');
    await expect(entry.locator('.scale')).toBeHidden();
    await expect(entry.locator('.when')).toBeHidden();
    expect(await pageWidth(page)).toBe(390);
    await shoot(page, 'ux-s6-02-vue-ensemble-390');
    await expectNoAxeViolations(page);
  });
});
