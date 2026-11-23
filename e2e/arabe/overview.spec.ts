import {
  APIRequestContext,
  BrowserContext,
  expect,
  Page,
  request as playwrightRequest,
  test,
} from '@playwright/test';

import { daysAgo, entry } from '../flux-5-timeline/timeline-data';
import {
  emptyPatient,
  notedSince,
  OverviewFolder,
  risingFolder,
} from '../flux-6-vue-ensemble/overview-data';
import { createAccount, signIn } from '../preferences/accounts';
import { expectNoAxeViolations } from '../support/axe';
import { shoot } from '../support/captures';

// M16-16, vue d'ensemble en /ar/ (G Q71 point 4, Q73 à Q77 ; docs/design/arabe.md §1, §3, §5, §9 ;
// fiche 02) : la page se lit de droite à gauche (colonne latérale à gauche de la colonne de
// lecture), la courbe des ressentis reste de gauche à droite (la date la plus ancienne à gauche,
// direction calculée ltr), son infobulle reste dans le cadre ; dir="rtl", aucun défilement
// horizontal, axe-core sans violation, une capture de la vue complète (bureau) et de la vue en une
// colonne (téléphone), en clair et en sombre par la préférence du compte (PSYMATE_E2E_CAPTURES).
// Aucun libellé ciblé (rôles, structure, URL) : les textes de /ar/ passent du français de repli à
// l'arabe au fil du jalon. Contre l'API locale (seed small), jamais de mock du backend : dossier
// écrit par l'API dans un compte jetable (comme e2e/flux-6-vue-ensemble). Une seule inscription et
// une seule connexion (page partagée, mode série dans ce bloc seulement).

/** Titre saisi en arabe : affiché dans son sens (dir="auto"), dans une interface de droite à gauche. */
const ARABIC_TITLE = 'ملاحظة عن النوم';
/** Chiffres arabo-indiens (U+0660 à U+0669) et persans : jamais affichés (G Q71 point 2). */
const NON_LATIN_DIGITS = /[٠-٩۰-۹]/;
const THEMES = ['light', 'dark'] as const;

test.describe('vue d’ensemble en /ar/', () => {
  let api: APIRequestContext;
  let folder: OverviewFolder;
  let empty: string;
  let context: BrowserContext;
  let page: Page;

  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  test.beforeAll(async ({ browser }, testInfo) => {
    test.setTimeout(240_000);
    api = await playwrightRequest.newContext();
    const account = await createAccount(api, 'm16-16.overview', 'psychologist');
    folder = await risingFolder(api);
    await notedSince(api, folder.patientId);
    await entry(api, folder.patientId, {
      type: 'note',
      title: ARABIC_TITLE,
      body: 'نص الملاحظة.',
      occurred: { from: daysAgo(1, 10) },
      sessionId: folder.session,
    });
    empty = await emptyPatient(api);
    // Page partagée : mêmes réglages que la configuration (adresse, langue du navigateur). Contexte
    // créé explicitement : axe-core refuse une page ouverte par browser.newPage().
    context = await browser.newContext({
      baseURL: testInfo.project.use.baseURL,
      locale: testInfo.project.use.locale,
      viewport: { width: 1440, height: 900 },
    });
    page = await context.newPage();
    // Connexion en /fr/ (libellés connus), puis /ar/ : la session garde le bundle de l'URL.
    await signIn(page, account);
  });

  test.afterAll(async () => {
    await context?.close();
    await api?.dispose();
  });

  /** <html lang="ar" dir="rtl">, aucun défilement horizontal, axe-core sans violation. */
  async function expectRtlPage(): Promise<void> {
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await page.evaluate(() => document.fonts.ready);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'défilement horizontal').toBeLessThanOrEqual(0);
    await expectNoAxeViolations(page);
  }

  /** Plus aucune section en chargement, et la courbe dessinée par ECharts. */
  async function drawn(): Promise<void> {
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 20_000 });
    await expect(page.locator('pm-overview-feelings-chart svg path').first()).toBeAttached({
      timeout: 20_000,
    });
  }

  /**
   * Thème du compte (comme e2e/arabe/socle.spec.ts) : la préférence `theme` l'emporte sur
   * prefers-color-scheme ; posée par l'API dans la session du navigateur, page rechargée.
   */
  async function useAccountTheme(theme: (typeof THEMES)[number]): Promise<void> {
    const response = await page.request.patch('/api/me/preferences', { data: { theme } });
    expect(response.status(), await response.text()).toBe(200);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  }

  async function boxOf(selector: string) {
    const box = await page.locator(selector).first().boundingBox();
    expect(box, `${selector} rendu`).not.toBeNull();
    return box!;
  }

  async function openOverview(patientId: string): Promise<void> {
    await page.goto(`/ar/patients/${patientId}`);
    await expect(page).toHaveURL(new RegExp(`/ar/patients/${patientId}$`));
  }

  /** Chaque thème : page vérifiée (sens, débordement, axe) et capturée. */
  async function checkAndShoot(name: string, ready: () => Promise<void>): Promise<void> {
    try {
      for (const theme of THEMES) {
        await useAccountTheme(theme);
        await ready();
        await expectRtlPage();
        await shoot(page, `arabe-vue-ensemble-${name}-${theme}`);
      }
    } finally {
      await useAccountTheme('light');
    }
  }

  test('vue complète : la colonne latérale à gauche, la courbe de gauche à droite', async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openOverview(folder.patientId);
    await drawn();
    await expectRtlPage();

    // Deux colonnes de droite à gauche : la colonne de lecture à droite, la latérale à gauche.
    const main = await boxOf('.ov > .main');
    const side = await boxOf('.ov > pm-overview-side');
    expect(side.x + side.width).toBeLessThanOrEqual(main.x + 1);
    // Lien d'en-tête de section poussé en fin de ligne : à gauche du titre.
    const heading = await boxOf('pm-overview-noted .head h3');
    const link = await boxOf('pm-overview-noted .head .link');
    expect(link.x + link.width).toBeLessThanOrEqual(heading.x + 1);

    // Récit du serveur (en français) et titre saisi en arabe : chacun dans son sens (Q77).
    const brief = page.locator('pm-overview-since .brief');
    if (await brief.count()) {
      expect(await brief.evaluate((el) => getComputedStyle(el).direction)).toBe('ltr');
    }
    const arabic = page.locator('pm-overview-noted .name', { hasText: ARABIC_TITLE });
    await expect(arabic).toBeVisible();
    expect(await arabic.evaluate((el) => getComputedStyle(el).direction)).toBe('rtl');

    // La courbe : direction calculée ltr sur son conteneur et sur le SVG (dir n'agit pas sur un svg,
    // qui hérite la propriété de son conteneur HTML).
    const figure = page.locator('pm-overview-feelings-chart .figure');
    expect(await figure.evaluate((el) => getComputedStyle(el).direction)).toBe('ltr');
    const svg = page.locator('pm-overview-feelings-chart svg').first();
    expect(await svg.evaluate((el) => getComputedStyle(el).direction)).toBe('ltr');

    // La date la plus ancienne à gauche : les libellés de l'axe du temps, lus comme des jours par
    // la locale de formatage du navigateur (celle de l'application), ont des abscisses croissantes
    // avec leur date. Positions comparées entre elles : indépendant de la largeur de la police.
    const ticks = await svg.evaluate((root) => {
      const locale = 'ar-u-ca-gregory-hc-h23-nu-latn';
      const days = new Map<string, number>();
      const today = Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
      for (let offset = -400; offset <= 2; offset++) {
        const time = today + offset * 86_400_000;
        for (const year of [undefined, 'numeric'] as const) {
          const text = new Intl.DateTimeFormat(locale, {
            day: 'numeric',
            month: 'short',
            year,
            timeZone: 'UTC',
          }).format(time);
          days.set(text, time);
        }
      }
      return [...root.querySelectorAll('text')]
        .map((label) => ({
          text: (label.textContent ?? '').replace(/[⁦-⁩]/g, '').trim(),
          x: label.getBoundingClientRect().x + label.getBoundingClientRect().width / 2,
        }))
        .filter((label) => days.has(label.text))
        .map((label) => ({ ...label, time: days.get(label.text)! }));
    });
    expect(ticks.length, JSON.stringify(ticks)).toBeGreaterThan(1);
    const byX = [...ticks].sort((a, b) => a.x - b.x).map((tick) => tick.time);
    expect(byX).toEqual([...byX].sort((a, b) => a - b));
    // Chiffres latins partout dans la courbe (Q71 point 2).
    expect(await svg.textContent()).not.toMatch(NON_LATIN_DIGITS);

    // Infobulle d'un ressenti (le point le plus à droite, le plus près du bord) : dans le cadre.
    const target = await svg.evaluate((root) => {
      const symbols = [...root.querySelectorAll('path')]
        .map((shape) => shape.getBoundingClientRect())
        .filter((box) => box.width >= 6 && box.width <= 18 && Math.abs(box.width - box.height) < 2)
        .sort((a, b) => b.x - a.x);
      const found = symbols[0];
      return found ? { x: found.x + found.width / 2, y: found.y + found.height / 2 } : null;
    });
    expect(target, 'point de ressenti dessiné').not.toBeNull();
    await page.mouse.move(target!.x, target!.y);
    const tooltip = page.locator('pm-overview-feelings-chart .chart > div:not(:has(svg))').last();
    await expect(tooltip).toBeVisible();
    const frame = await figure.boundingBox();
    const tip = await tooltip.boundingBox();
    expect(tip!.x).toBeGreaterThanOrEqual(frame!.x - 1);
    expect(tip!.x + tip!.width).toBeLessThanOrEqual(frame!.x + frame!.width + 1);
    expect(await tooltip.textContent()).not.toMatch(NON_LATIN_DIGITS);
    await shoot(page, 'arabe-vue-ensemble-infobulle', false);
    await page.mouse.move(0, 0);

    await checkAndShoot('complete-bureau', drawn);
  });

  test('vue en une colonne (téléphone) : rien ne déborde', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    try {
      await openOverview(folder.patientId);
      await drawn();
      // Une colonne : la latérale sous la colonne de lecture.
      const main = await boxOf('.ov > .main');
      const side = await boxOf('.ov > pm-overview-side');
      expect(side.y).toBeGreaterThanOrEqual(main.y + main.height - 1);
      await checkAndShoot('une-colonne-telephone', drawn);
    } finally {
      await page.setViewportSize({ width: 1440, height: 900 });
    }
  });

  test('dossier vide : les états vides de droite à gauche', async () => {
    await openOverview(empty);
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 20_000 });
    await expect(page.locator('pm-overview-feelings pm-state')).toBeVisible();
    await expectRtlPage();
    await shoot(page, 'arabe-vue-ensemble-vide-light');
  });
});
