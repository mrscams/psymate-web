import {
  APIRequestContext,
  expect,
  Page,
  request as playwrightRequest,
  test,
} from '@playwright/test';

import { createAccount, signIn } from '../preferences/accounts';
import { TestAccount } from '../support/accounts';
import { expectNoAxeViolations } from '../support/axe';
import { DecadePatient, decadePatient, lastDayOf, recentPatient } from './decade-data';
import { setGroupBy } from './filters-data';

// Vue décennie de la timeline (M3-04, fiche 03 état C, A6) contre l'API locale (jamais de mock) :
// bascule automatique au-delà d'une plage de 3 ans, temps du résumé et du rendu mesurés, double-clic
// sur un mois → détail du mois au zoom « semaine », Échap revient, équivalent clavier (tableau des
// mois), retour automatique au détail sous 3 ans, préférence `timeline.groupBy = month` et zoom
// maximal sur un dossier récent, axe-core sans violation.

let account: TestAccount;
let decade: DecadePatient;
let recent: string;
let api: APIRequestContext;

test.describe.configure({ mode: 'serial', timeout: 90_000 });

test.beforeAll(async () => {
  test.setTimeout(240_000);
  api = await playwrightRequest.newContext();
  account = await createAccount(api, 'm3-04.decennie', 'psychologist');
  decade = await decadePatient(api);
  recent = await recentPatient(api);
});

test.afterAll(async () => {
  await api?.dispose();
});

function timeline(page: Page) {
  const toolbar = page.getByRole('toolbar', { name: 'Affichage de la timeline' });
  return {
    toolbar,
    decade: page.locator('pm-timeline-decade'),
    chart: page.locator('pm-timeline-decade svg[role="img"]'),
    month: (key: string) => page.locator(`pm-timeline-decade rect.hit[data-month="${key}"]`),
    viewport: page.locator('cdk-virtual-scroll-viewport'),
    cards: page.locator('pm-timeline-card article'),
    count: page.locator('.status-line .count'),
    granularity: page.locator('.granularity'),
    period: toolbar.getByRole('group', { name: 'Période' }),
    session: toolbar.locator('button[data-mode="session"]'),
  };
}

/** Le moment où le graphique de l'agrégat entre dans le DOM (performance.now() de la page). */
async function watchDecadeRender(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { decadeShownAt?: number };
    new MutationObserver((_records, observer) => {
      if (document.querySelector('pm-timeline-decade svg[role="img"]')) {
        w.decadeShownAt = performance.now();
        observer.disconnect();
      }
    }).observe(document, { childList: true, subtree: true });
  });
}

test('plus de 3 ans : bascule automatique sur l’agrégat par mois ; résumé et rendu mesurés', async ({
  page,
}) => {
  await setGroupBy(api, 'chronological');
  await signIn(page, account);
  await watchDecadeRender(page);
  const summary = page.waitForResponse(
    (r) => r.url().includes(`/api/patients/${decade.id}/timeline/summary?`) && r.ok(),
  );
  await page.goto(`/fr/patients/${decade.id}/timeline`);
  const response = await summary;
  expect(response.url()).toContain('granularity=month');
  const t = timeline(page);

  await expect(t.decade.locator('.badge')).toHaveText('Agrégé par mois · double-clic pour zoomer');
  await expect(t.chart).toBeVisible();
  await expect(t.viewport).toHaveCount(0);
  await expect(t.granularity).toHaveText('Décennie');
  await expect(t.toolbar.getByRole('button', { name: 'Zoom arrière (−)' })).toBeDisabled();
  await expect(t.session).toBeDisabled();
  // 59 mois de plage (première séance il y a 58 mois → mois courant), une zone par mois.
  await expect(t.decade.locator('rect.hit')).toHaveCount(59);
  await expect(t.decade.locator('.facts')).toContainText('59 mois');
  await expect(t.chart).toHaveAttribute(
    'aria-label',
    /^Agrégats par mois de .+ à .+ : \d+ entrées/,
  );
  await expect(t.chart).toHaveAttribute('aria-label', /Intensité moyenne des ressentis de/);
  await expect(t.chart).toHaveAttribute('aria-label', /Situations longues : 2\./);
  await expect(t.chart.locator('.follow-label')).toContainText('début du suivi');
  await expect(t.chart.locator('.band-label').first()).toContainText(
    'Reconversion professionnelle',
  );
  await expect(t.month(decade.drillMonth).locator('title')).toContainText(
    'Notes 1, Ressentis 1 et Séances 1',
  );

  // Mesures (A6, C2 M3-04) : temps du résumé (navigateur, à travers le proxy) et du rendu, après
  // la dernière des deux réponses dont la vue a besoin (première page et résumé).
  const timing = response.request().timing();
  const measures = await page.evaluate(() => {
    const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const summaryEntry = entries.find((e) => e.name.includes('/timeline/summary'))!;
    const firstPage = entries.find((e) => /\/timeline\?/.test(e.name))!;
    const shown = (window as unknown as { decadeShownAt?: number }).decadeShownAt ?? NaN;
    return {
      summaryServer: summaryEntry.responseStart - summaryEntry.requestStart,
      summaryTotal: summaryEntry.responseEnd - summaryEntry.startTime,
      renderAfterData: shown - Math.max(summaryEntry.responseEnd, firstPage.responseEnd),
      summaryBeforePage: summaryEntry.responseEnd <= firstPage.responseEnd,
    };
  });
  const report = {
    summaryTtfbPlaywright: Math.round(timing.responseStart - timing.requestStart),
    summaryServer: Math.round(measures.summaryServer),
    summaryTotal: Math.round(measures.summaryTotal),
    renderAfterData: Math.round(measures.renderAfterData),
    summaryBeforePage: measures.summaryBeforePage,
  };
  test.info().annotations.push({ type: 'mesure M3-04', description: JSON.stringify(report) });
  console.log(`M3-04 mesures (ms) : ${JSON.stringify(report)}`);
  // Seuils tolérants, pas la cible : l'objectif « < 100 ms côté API » (A6) se mesure au curl sur le
  // seed. Ici la requête passe par le proxy de serve-dist et l'API locale est partagée avec d'autres
  // suites en parallèle (148 ms vus pendant une passe complète) ; on ne vérifie que l'ordre de
  // grandeur, pour attraper une régression nette sans rendre le test instable.
  expect(measures.summaryServer).toBeLessThan(1000);
  expect(measures.renderAfterData).toBeLessThan(500);

  await expectNoAxeViolations(page);
});

test('double-clic sur un mois : détail de ce mois au zoom « semaine » ; Échap revient', async ({
  page,
}) => {
  await setGroupBy(api, 'chronological');
  await signIn(page, account);
  await page.goto(`/fr/patients/${decade.id}/timeline`);
  const t = timeline(page);
  await expect(t.chart).toBeVisible();

  await t.month(decade.drillMonth).dblclick();
  const from = `${decade.drillMonth}-01`;
  const to = lastDayOf(decade.drillMonth);
  await expect(page).toHaveURL(new RegExp(`[?&]from=${from}&to=${to}$`));
  await expect(t.decade).toHaveCount(0);
  await expect(t.viewport).toBeVisible();
  await expect(t.count).toHaveText('3 entrées · 1 fenêtre en mémoire');
  await expect(t.cards.filter({ hasText: decade.drillNote })).toBeVisible();
  await expect(t.granularity).toHaveText('Semaine');
  // La première carte du mois a le focus (le clavier continue dans le détail).
  await expect(page.locator('pm-timeline-card article').first()).toBeFocused();
  await expectNoAxeViolations(page);

  await page.keyboard.press('Escape');
  await expect(t.chart).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/fr/patients/${decade.id}/timeline$`));
});

test('clavier : tableau des mois, Entrée sur un mois ouvre son détail', async ({ page }) => {
  await setGroupBy(api, 'chronological');
  await signIn(page, account);
  await page.goto(`/fr/patients/${decade.id}/timeline`);
  const t = timeline(page);
  await expect(t.chart).toBeVisible();
  const summary = t.decade.locator('details.months summary');
  await summary.focus();
  await page.keyboard.press('Enter');
  const table = t.decade.locator('details.months table');
  await expect(table).toBeVisible();
  // Une colonne par type montré (Médicaments selon la préférence entryTypes.medicationVisible).
  const headers = (await table.locator('thead th').allTextContents()).map((h) => h.trim());
  expect(headers.slice(0, 6)).toEqual([
    'Mois',
    'Notes',
    'Événements',
    'Situations',
    'Ressentis',
    'Séances',
  ]);
  expect(headers.at(-1)).toBe('Intensité moyenne');
  await expectNoAxeViolations(page);

  const [year, month] = decade.drillMonth.split('-').map(Number);
  const label = new Intl.DateTimeFormat('fr', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
  const button = table.getByRole('button', { name: `${label}, voir le détail`, exact: true });
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`[?&]from=${decade.drillMonth}-01&`));
  await expect(t.cards.filter({ hasText: decade.drillNote })).toBeVisible();
});

test('retour automatique au détail sous 3 ans (période « 1 an »), agrégat de nouveau sur « Tout »', async ({
  page,
}) => {
  await setGroupBy(api, 'chronological');
  await signIn(page, account);
  await page.goto(`/fr/patients/${decade.id}/timeline`);
  const t = timeline(page);
  await expect(t.chart).toBeVisible();

  await t.period.getByRole('button', { name: '1 an', exact: true }).click();
  await expect(t.viewport).toBeVisible();
  await expect(t.decade).toHaveCount(0);
  await expect(t.session).toBeEnabled();
  await expect(t.granularity).toHaveText(/^(Jour|Semaine|Mois)$/);

  await expectNoAxeViolations(page);

  await t.period.getByRole('button', { name: 'Tout', exact: true }).click();
  await expect(t.chart).toBeVisible();
  await expect(t.viewport).toHaveCount(0);
  await expectNoAxeViolations(page);
});

test('préférence timeline.groupBy = month : agrégat forcé sur un dossier récent ; zoom + / −', async ({
  page,
}) => {
  await setGroupBy(api, 'month');
  try {
    await signIn(page, account);
    await page.goto(`/fr/patients/${recent}/timeline`);
    const t = timeline(page);
    await expect(t.chart).toBeVisible();
    await expect(t.decade.locator('rect.hit')).toHaveCount(1);
    await expect(t.toolbar.locator('button[data-mode="chronological"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expectNoAxeViolations(page);

    // + : le détail au zoom « Mois » ; − après « Mois » : de nouveau l'agrégat (zoom maximal).
    await t.toolbar.getByRole('button', { name: 'Zoom avant (+)' }).click();
    await expect(t.viewport).toBeVisible();
    await expect(t.granularity).toHaveText('Mois');
    await expect(t.cards.filter({ hasText: 'Premier contact' })).toBeVisible();
    await t.toolbar.getByRole('button', { name: 'Zoom arrière (−)' }).click();
    await expect(t.chart).toBeVisible();
    await expect(t.granularity).toHaveText('Décennie');
  } finally {
    await setGroupBy(api, 'chronological');
  }
});
