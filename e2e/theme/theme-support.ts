import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { APIRequestContext, expect, Page, TestInfo } from '@playwright/test';

import { daysAgo, entry, intakeOf, pastSession } from '../flux-5-timeline/timeline-data';

// Outils des e2e du thème (M6-04, étude couleurs §6), contre l'API réelle (jamais de mock) : dossier
// écrit par l'API dans un compte jetable, captures pleine page, état « sans rechargement ».

const API = 'http://localhost:8080';

/** Fond de page (body : --mat-sys-surface = --surface-raised) dans chaque thème, en rgb(). */
export const SURFACE_RAISED = {
  light: 'rgb(255, 255, 255)',
  dark: 'rgb(30, 37, 48)',
} as const;

export async function bodyBackground(page: Page): Promise<string> {
  return page.evaluate(() => getComputedStyle(document.body).backgroundColor);
}

/** Valeur courante d'un token sur <html> (ce que relisent Cytoscape et ECharts). */
export async function token(page: Page, name: string): Promise<string> {
  return page.evaluate(
    (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
    name,
  );
}

/**
 * Pose un témoin dans la fenêtre et compte les chargements : un rechargement ou une navigation
 * complète effacerait le témoin. À appeler sur une page déjà chargée.
 */
export async function watchReloads(page: Page): Promise<() => Promise<void>> {
  let loads = 0;
  page.on('load', () => loads++);
  await page.evaluate(() => ((window as { pmThemeWitness?: boolean }).pmThemeWitness = true));
  return async () => {
    expect(loads, 'la page a été rechargée').toBe(0);
    expect(
      await page.evaluate(() => (window as { pmThemeWitness?: boolean }).pmThemeWitness === true),
    ).toBe(true);
  };
}

/**
 * Capture pleine page, jointe au rapport Playwright (test-results/…, ignoré par git). Si
 * PSYMATE_THEME_CAPTURES est défini, une copie y est aussi écrite (pour la PR).
 */
export async function capture(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  // Pas de capture au milieu d'une ondulation ou d'un fondu de dialogue (même règle qu'axe).
  await expect(page.locator('.mat-ripple-element')).toHaveCount(0);
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: 'image/png' });
  const extra = process.env['PSYMATE_THEME_CAPTURES'];
  if (extra) {
    mkdirSync(extra, { recursive: true });
    await page.screenshot({ path: join(extra, `${name}.png`), fullPage: true });
  }
}

/**
 * axe-core (WCAG 2.0 / 2.1 A, AA), mêmes attentes que e2e/support/axe.ts, mais en assertion
 * « soft » : un parcours de quinze écrans les analyse tous et échoue à la fin avec la liste complète,
 * au lieu de s'arrêter au premier. `exclude` : sélecteur à ignorer (canevas du graphe).
 */
export async function expectNoAxeViolationsSoft(
  page: Page,
  screen: string,
  exclude?: string,
): Promise<void> {
  await expect(page.locator('.mat-ripple-element')).toHaveCount(0);
  await expect(page.locator('.mdc-dialog--opening, .mdc-dialog--closing')).toHaveCount(0);
  let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
  if (exclude) builder = builder.exclude(exclude);
  const results = await builder.analyze();
  expect.soft(results.violations, `axe-core en sombre : ${screen}`).toEqual([]);
}

/** Plus aucun bloc en chargement (pm-state, aria-busy). */
export async function settled(page: Page): Promise<void> {
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });
}

export interface ThemeFolder {
  patientId: string;
  situation: string;
  feeling: string;
  event: string;
}

/**
 * Dossier qui montre toutes les couleurs métier : deux drapeaux (ambre), une séance passée, une
 * situation en cours, un événement qui la déclenche, des ressentis de familles différentes (dont un
 * lié à la situation), un médicament, une note.
 */
export async function themeFolder(api: APIRequestContext): Promise<ThemeFolder> {
  const created = await api.post(`${API}/api/patients`, {
    data: {
      displayName: 'Nina S.',
      birthDate: '1988-03-14',
      flags: [{ kind: 'watch', reason: 'Sommeil' }, { kind: 'shared_care' }],
    },
  });
  expect(created.status(), await created.text()).toBe(201);
  const patientId = ((await created.json()) as { id: string }).id;
  await intakeOf(api, patientId);
  const session = await pastSession(api, patientId, daysAgo(9, 14));
  const situation = await entry(api, patientId, {
    type: 'situation',
    title: 'Surcharge au travail',
    occurred: { from: daysAgo(50), precision: 'day' },
    sessionId: session,
  });
  const event = await entry(api, patientId, {
    type: 'event',
    title: 'Réunion avec le manager',
    occurred: { from: daysAgo(12), precision: 'day' },
    sessionId: session,
    links: [{ targetId: situation, linkType: 'triggers', direction: 'outgoing' }],
  });
  const feeling = await entry(api, patientId, {
    type: 'feeling',
    title: 'Anxiété au réveil',
    feeling: { emotionCode: 'anxiety', intensity: 8 },
    occurred: { from: daysAgo(11), precision: 'day' },
    sessionId: session,
    links: [{ targetId: situation, linkType: 'worsens', direction: 'incoming' }],
  });
  for (const [days, code, intensity, title] of [
    [10, 'sadness', 5, 'Tristesse le dimanche'],
    [8, 'anger', 6, 'Colère après l’appel'],
    [6, 'joy', 4, 'Joie après la randonnée'],
  ] as const) {
    await entry(api, patientId, {
      type: 'feeling',
      title,
      feeling: { emotionCode: code, intensity },
      occurred: { from: daysAgo(days), precision: 'day' },
      sessionId: session,
    });
  }
  await entry(api, patientId, {
    type: 'medication',
    title: 'Sertraline 50 mg',
    medication: { molecule: 'Sertraline', dosage: '50 mg' },
    occurred: { from: daysAgo(40), precision: 'day' },
    sessionId: session,
  });
  await entry(api, patientId, {
    type: 'note',
    title: 'Anxiété en hausse depuis la réorganisation',
    body: 'Évoque la réorganisation du service à chaque séance.',
    occurred: { from: daysAgo(9), precision: 'day' },
    sessionId: session,
  });
  return { patientId, situation, feeling, event };
}
