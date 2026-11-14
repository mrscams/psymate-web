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
import { API, closedSession, setGroupBy } from './filters-data';
import { createPatient, daysAgo, entry, intakeOf } from './timeline-data';

// Proposition 03 (UX-S9) contre l'API locale : un patient bâti comme « Nour K. » de la maquette
// (séance ouverte du jour avec deux entrées, ressentis, séance passée avec compte rendu, situation
// en cours) ; à 1440, 1280 et 390 px : barre d'outils sur une ligne, jours en ancres, séparateur de
// séance, colonne de résumé. Les captures vont dans docs/design/captures-ux-s9/.

const SHOTS = 'docs/design/captures-ux-s9';

let account: TestAccount;
let api: APIRequestContext;
let patient: string;

test.describe.configure({ mode: 'serial', timeout: 120_000 });

test.beforeAll(async () => {
  test.setTimeout(180_000);
  api = await playwrightRequest.newContext();
  account = await createAccount(api, 'ux-s9.maquette', 'psychologist');
  await setGroupBy(api, 'chronological');
  patient = await createPatient(api, 'Nour K.', '1991-03-02', { since: daysAgo(60).slice(0, 10) });
  await intakeOf(api, patient);
  const past = await closedSession(
    api,
    patient,
    daysAgo(7, 9),
    50,
    'Reprise du thème du sommeil ; refus du passage de jour vécu comme une injustice.\nObjectif : agenda du sommeil deux semaines.',
  );
  const first = await closedSession(
    api,
    patient,
    daysAgo(21, 17),
    45,
    'Première séance : motif d’épuisement, réveils nocturnes depuis la réorganisation du service.',
  );
  // La séance ouverte du jour est une vraie séance démarrée (après les séances passées : une seule
  // séance ouverte à la fois) : la séance d'accueil, créée avec le patient et jamais clôturée par
  // l'API, n'est pas « ouverte » pour la timeline (14 novembre 2026).
  const started = await api.post(`${API}/api/patients/${patient}/sessions/start`, {
    data: { modality: 'in_person' },
  });
  expect(started.status(), await started.text()).toBe(201);
  const open = ((await started.json()) as { id: string }).id;
  await entry(api, patient, {
    type: 'situation',
    title: 'Réorganisation du service de nuit',
    occurred: { from: daysAgo(45), precision: 'day' },
    sessionId: first,
  });
  await entry(api, patient, {
    type: 'note',
    title: 'Revoir l’hygiène de sommeil',
    status: 'draft',
    body: 'Proposer un agenda du sommeil sur deux semaines.',
    occurred: { from: new Date(Date.now() - 5 * 60_000).toISOString() },
    sessionId: open,
  });
  await entry(api, patient, {
    type: 'feeling',
    feeling: { emotionCode: 'anxiety', intensity: 7 },
    occurred: { from: new Date(Date.now() - 10 * 60_000).toISOString() },
    sessionId: open,
  });
  await entry(api, patient, {
    type: 'feeling',
    feeling: { emotionCode: 'joy', intensity: 5 },
    occurred: { from: daysAgo(4, 21) },
    sessionId: past,
  });
  await entry(api, patient, {
    type: 'event',
    title: 'Entretien avec la cadre de santé',
    occurred: { from: daysAgo(7), precision: 'day' },
    sessionId: past,
  });
  await entry(api, patient, {
    type: 'feeling',
    feeling: { emotionCode: 'sadness', intensity: 5 },
    occurred: { from: daysAgo(10, 21) },
    sessionId: past,
  });
  for (const [days, code, intensity] of [
    [14, 'anxiety', 6],
    [18, 'trust', 4],
    [21, 'anxiety', 7],
    [25, 'anger', 5],
  ] as const) {
    await entry(api, patient, {
      type: 'feeling',
      feeling: { emotionCode: code, intensity },
      occurred: { from: daysAgo(days, 20) },
      sessionId: first,
    });
  }
});

test.afterAll(async () => {
  await api?.dispose();
});

async function open(page: Page, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height });
  await signIn(page, account);
  await page.goto(`/fr/patients/${patient}/timeline`);
  await expect(page.locator('pm-timeline-card article').first()).toBeVisible();
  await expect(page.locator('.tl-side .headline')).toBeVisible();
}

for (const [width, height] of [
  [1440, 900],
  [1280, 800],
] as const) {
  test(`maquette 03 à ${width} px : une ligne d'outils, jours en ancres, séparateur de séance, colonne de résumé`, async ({
    page,
  }) => {
    await open(page, width, height);
    await page.screenshot({ fullPage: true, path: `${SHOTS}/03-timeline-${width}.png` });
    const toolbar = page.getByRole('toolbar', { name: 'Affichage de la timeline' });
    // Une seule ligne : tous les contrôles ont le même haut.
    const tops = await toolbar
      .locator('button')
      .evaluateAll((buttons) =>
        buttons
          .filter((b) => (b as HTMLElement).offsetParent !== null)
          .map((b) => Math.round(b.getBoundingClientRect().top / 8)),
      );
    expect(new Set(tops).size).toBe(1);
    await expect(toolbar.getByRole('button', { name: /^Filtres/ })).toBeVisible();
    await expect(toolbar.getByRole('group', { name: 'Période' })).toBeVisible();

    // Jours en ancres : « Aujourd'hui » est écrit une fois, à gauche de l'axe.
    const anchors = page.locator('.date pm-timeline-day');
    await expect(anchors.first()).toContainText("aujourd'hui");
    // La séance ouverte a son séparateur « en cours depuis » dans le jour courant (la séance
    // d'accueil, créée avec le patient le même jour, n'est jamais « ouverte »).
    await expect(
      page.locator('.row pm-timeline-session-divider', { hasText: 'en cours depuis' }).first(),
    ).toBeVisible();
    // Séance passée : son séparateur porte la première ligne du compte rendu.
    await expect(
      page.locator('pm-timeline-session-divider .summary', {
        hasText: 'Reprise du thème du sommeil',
      }),
    ).toBeVisible();
    // Ressenti nommé, échelle à dix cases.
    const anxiety = page.locator('pm-timeline-card article', { hasText: 'Anxiété' }).first();
    await expect(anxiety.locator('.scale i')).toHaveCount(10);
    await expect(anxiety.locator('.score')).toHaveText('7/10');
    // Situation en cours en tête du flux.
    await expect(page.locator('.bands-top li').first()).toContainText(
      'Réorganisation du service de nuit',
    );

    // Colonne de résumé à droite du flux, 300 px.
    const side = page.locator('.tl-side');
    const stream = await page.locator('.stream').boundingBox();
    const box = await side.boundingBox();
    expect(box!.x).toBeGreaterThan(stream!.x + stream!.width);
    expect(Math.round(box!.width)).toBe(300);
    await expect(side.locator('.headline')).toHaveText(/entrées · 4 séances/);
    await expect(side.getByRole('button', { name: /^Anxiété/ })).toBeVisible();

    await expectNoAxeViolations(page);
  });
}

test('maquette 03 à 390 px : une colonne, en-têtes de jour, outils derrière « Filtres »', async ({
  page,
}) => {
  await open(page, 390, 844);
  const toolbar = page.getByRole('toolbar', { name: 'Affichage de la timeline' });
  // Période et mode ne sont plus dans la barre : ils passent dans le panneau Filtres.
  await expect(toolbar.getByRole('group', { name: 'Période' })).toHaveCount(0);
  await expect(page.locator('.date')).toHaveCount(0);
  await expect(page.locator('.row pm-timeline-day.day-head').first()).toContainText("aujourd'hui");
  // Rien ne déborde horizontalement.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `${SHOTS}/03-timeline-390.png` });
  await expectNoAxeViolations(page);

  await toolbar.getByRole('button', { name: /^Filtres/ }).click();
  const panel = page.getByRole('dialog', { name: 'Filtres de la timeline' });
  await expect(panel.getByRole('group', { name: 'Période' })).toBeVisible();
  await expect(panel.getByRole('button', { name: /^Anxiété/ })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/03-timeline-390-filtres.png` });
  await expectNoAxeViolations(page);
});

test('maquette 03 : « Par séance », même grammaire, la plus récente dépliée', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, account);
  await page.goto(`/fr/patients/${patient}/timeline?mode=session`);
  const heads = page.locator('pm-timeline-session-divider button.head');
  await expect(heads.first()).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.session .date pm-timeline-day').first()).toContainText("aujourd'hui");
  await page.screenshot({ path: `${SHOTS}/03-timeline-par-seance-1440.png` });
  await expectNoAxeViolations(page);
  void API;
});
