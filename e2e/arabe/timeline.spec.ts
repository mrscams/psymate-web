import {
  APIRequestContext,
  expect,
  Page,
  request as playwrightRequest,
  test,
} from '@playwright/test';

import { DecadePatient, decadePatient } from '../flux-5-timeline/decade-data';
import { setGroupBy } from '../flux-5-timeline/filters-data';
import { daysAgo, entry, StoryPatient, storyPatient } from '../flux-5-timeline/timeline-data';
import { createAccount, signIn } from '../preferences/accounts';
import { TestAccount } from '../support/accounts';
import { expectNoAxeViolations } from '../support/axe';
import { shoot } from '../support/captures';

// M16-17, timeline de droite à gauche (G Q71 point 4, Q74 à Q77, Q81 ; docs/design/arabe.md §3, §5,
// §6, §9) : vue chronologique, vue par séance, panneau des filtres et vue décennie en /ar/, en
// largeur de bureau et de téléphone ; dir="rtl", pas de défilement horizontal, axe-core sans
// violation, une capture par vue (PSYMATE_E2E_CAPTURES). La vue décennie reste de gauche à droite
// (l'année la plus ancienne à gauche). Aucun libellé ciblé (rôles, structure, URL) : les textes de
// /ar/ passent du français de repli à l'arabe au fil du jalon. Contre l'API locale (seed small),
// jamais de mock du backend.

const WIDTHS = [
  { name: 'bureau', width: 1440, height: 900 },
  { name: 'telephone', width: 390, height: 844 },
] as const;

/** Titre saisi en arabe : affiché dans son sens (dir="auto"), dans une interface de droite à gauche. */
const ARABIC_TITLE = 'نوبة قلق قبل الاجتماع';

let account: TestAccount;
let story: StoryPatient;
let decade: DecadePatient;
let api: APIRequestContext;

test.describe.configure({ mode: 'serial', timeout: 90_000 });

test.beforeAll(async () => {
  test.setTimeout(300_000);
  api = await playwrightRequest.newContext();
  account = await createAccount(api, 'm16-17.timeline', 'psychologist');
  story = await storyPatient(api);
  await entry(api, story.id, {
    type: 'note',
    title: ARABIC_TITLE,
    body: 'نص الملاحظة.',
    occurred: { from: daysAgo(2) },
    sessionId: story.sessionRecent,
  });
  decade = await decadePatient(api);
});

test.afterAll(async () => {
  await api?.dispose();
});

/** <html lang="ar" dir="rtl">, aucun défilement horizontal, axe-core sans violation. */
async function expectRtlPage(page: Page): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.evaluate(() => document.fonts.ready);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'défilement horizontal').toBeLessThanOrEqual(0);
  await expectNoAxeViolations(page);
}

/**
 * Thème du compte (comme e2e/arabe/socle.spec.ts) : la préférence `theme` (`light` par défaut)
 * l'emporte sur prefers-color-scheme ; posée par l'API, page rechargée, vérifiée sur <html>.
 */
async function useAccountTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  const response = await page.request.patch('/api/me/preferences', { data: { theme } });
  expect(response.status(), await response.text()).toBe(200);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

/** Boîte d'un élément, rendue. */
async function boxOf(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox();
  expect(box, `${selector} rendu`).not.toBeNull();
  return box!;
}

/** Connexion en /fr/ (libellés connus), puis la timeline en /ar/ : la session garde le bundle de l'URL. */
async function openTimeline(page: Page, patientId: string, query = ''): Promise<void> {
  await signIn(page, account);
  await page.goto(`/ar/patients/${patientId}/timeline${query}`);
  await expect(page).toHaveURL(new RegExp(`/ar/patients/${patientId}/timeline`));
  await expect(page.locator('[role="toolbar"]')).toBeVisible();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 20_000 });
}

for (const size of WIDTHS) {
  test.describe(`timeline en /ar/, ${size.name}`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });
    const desktop = size.name === 'bureau';

    test('vue chronologique : l’axe et la colonne des dates passent à droite', async ({ page }) => {
      await setGroupBy(api, 'chronological');
      await openTimeline(page, story.id);
      const card = page.locator('pm-timeline-card article').first();
      await expect(card).toBeVisible();
      await expectRtlPage(page);

      // Titre saisi : dir="auto" (Q77), donc de droite à gauche pour un titre arabe.
      const arabic = page.locator('pm-timeline-card .title', { hasText: ARABIC_TITLE });
      await expect(arabic).toHaveAttribute('dir', 'auto');
      expect(await arabic.evaluate((el) => getComputedStyle(el).direction)).toBe('rtl');

      if (desktop) {
        // Colonne des dates à droite de l'axe ; l'axe (filet de début de ligne) à droite des cartes.
        const date = await boxOf(page, '.row .day .date');
        const items = await boxOf(page, '.row .day .items');
        expect(date.x).toBeGreaterThanOrEqual(items.x + items.width - 1);
        const border = await page
          .locator('.row .day .items')
          .first()
          .evaluate((el) => getComputedStyle(el).borderRightWidth);
        expect(border).toBe('2px');
        // Marqueur du type sur l'axe : à droite de la carte.
        const marker = await boxOf(page, 'pm-timeline-card .marker');
        const cardBox = await card.boundingBox();
        expect(marker.x).toBeGreaterThan(cardBox!.x + cardBox!.width);
        // Colonne de résumé à gauche du flux.
        const side = await boxOf(page, 'aside.tl-side');
        const stream = await boxOf(page, '.stream');
        expect(side.x + side.width).toBeLessThanOrEqual(stream.x + 1);
      }
      await shoot(page, `arabe-timeline-chronologique-${size.name}`);
    });

    test('nom vertical des bandes centré dans sa colonne, en /fr/ comme en /ar/', async ({
      page,
    }) => {
      test.skip(!desktop, 'pas de nom vertical sur téléphone');
      await setGroupBy(api, 'chronological');
      await openTimeline(page, story.id);
      for (const locale of ['fr', 'ar']) {
        // Même mesure dans les deux sens : l'ancien centrage (left 50 %, translateX(−50 %)) aussi.
        await page.goto(`/${locale}/patients/${story.id}/timeline`);
        const label = page.locator('.lane-label').first();
        await expect(label).toBeVisible();
        const centers = await label.evaluate((el) => {
          const own = el.getBoundingClientRect();
          const lane = el.parentElement!.getBoundingClientRect();
          return { label: own.x + own.width / 2, lane: lane.x + lane.width / 2 };
        });
        expect(Math.abs(centers.label - centers.lane), locale).toBeLessThanOrEqual(1);
      }
    });

    test('vue chronologique en thème sombre (préférence du compte)', async ({ page }) => {
      test.skip(!desktop, 'une largeur suffit pour le thème');
      await setGroupBy(api, 'chronological');
      await openTimeline(page, story.id);
      try {
        await useAccountTheme(page, 'dark');
        await expect(page.locator('pm-timeline-card article').first()).toBeVisible();
        await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 20_000 });
        await expectRtlPage(page);
        await shoot(page, 'arabe-timeline-chronologique-bureau-sombre');
      } finally {
        await useAccountTheme(page, 'light');
      }
    });

    test('barre d’outils : ← va au contrôle suivant, → au précédent (Q81)', async ({ page }) => {
      test.skip(!desktop, 'au clavier, une largeur suffit');
      await setGroupBy(api, 'chronological');
      await openTimeline(page, story.id);
      const controls = page.locator('[role="toolbar"] button:not([disabled])');
      const first = controls.first();
      const second = controls.nth(1);
      // Le premier contrôle est au début de la ligne : à droite du second.
      const a = await first.boundingBox();
      const b = await second.boundingBox();
      expect(a!.x).toBeGreaterThan(b!.x);
      await first.focus();
      await page.keyboard.press('ArrowLeft');
      await expect(second).toBeFocused();
      await page.keyboard.press('ArrowRight');
      await expect(first).toBeFocused();
    });

    test('vue par séance : séparateurs et lignes du même côté que le flux', async ({ page }) => {
      await setGroupBy(api, 'session');
      try {
        await openTimeline(page, story.id);
        const head = page.locator('pm-timeline-sessions .session').first();
        await expect(head).toBeVisible();
        await expectRtlPage(page);
        if (desktop) {
          const date = await boxOf(page, 'pm-timeline-sessions .day .date');
          const items = await boxOf(page, 'pm-timeline-sessions .day .items');
          expect(date.x).toBeGreaterThanOrEqual(items.x + items.width - 1);
        }
        await shoot(page, `arabe-timeline-par-seance-${size.name}`);
      } finally {
        await setGroupBy(api, 'chronological');
      }
    });

    test('filtres ouverts : panneau ancré au bouton, rien ne déborde', async ({ page }) => {
      await setGroupBy(api, 'chronological');
      await openTimeline(page, story.id);
      await page.locator('[role="toolbar"] button.filters').click();
      const panel = page.getByRole('dialog');
      await expect(panel).toBeVisible();
      await expectRtlPage(page);
      // Panneau dans la fenêtre.
      const box = await panel.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(size.width);
      await shoot(page, `arabe-timeline-filtres-${size.name}`, false);
      await page.keyboard.press('Escape');
      await expect(panel).toHaveCount(0);
    });

    test('vue décennie : le graphique reste de gauche à droite (Q71 point 4)', async ({ page }) => {
      await setGroupBy(api, 'chronological');
      await openTimeline(page, decade.id, '?period=all');
      const chart = page.locator('pm-timeline-decade svg[role="img"]');
      await expect(chart).toBeVisible();
      await expectRtlPage(page);
      // Direction calculée (l'attribut dir n'a pas d'effet sur un svg) : ltr, donc les text-anchor
      // gardent leur sens de dessin.
      expect(await chart.evaluate((el) => getComputedStyle(el).direction)).toBe('ltr');
      // Graduation des comptes (text-anchor « end », 6 unités avant le tracé) : entièrement à gauche
      // du bord gauche du tracé (début de la ligne de grille), jamais dedans.
      const tick = await chart.evaluate((el) => {
        const grid = el.querySelector('line.grid')!.getBoundingClientRect();
        const label = el.querySelector('text.tick:not(.intensity)')!.getBoundingClientRect();
        return { tickRight: label.right, plotLeft: grid.left };
      });
      expect(tick.tickRight).toBeLessThanOrEqual(tick.plotLeft);

      // L'année la plus ancienne à gauche : abscisses croissantes avec les années.
      const years = await chart.locator('text.year-label').evaluateAll((labels) =>
        labels.map((label) => ({
          year: Number(label.textContent?.trim()),
          x: label.getBoundingClientRect().x,
        })),
      );
      expect(years.length).toBeGreaterThan(1);
      const byX = [...years].sort((a, b) => a.x - b.x).map((y) => y.year);
      expect(byX).toEqual([...byX].sort((a, b) => a - b));
      // Chiffres latins partout dans le graphique (Q71 point 2).
      expect(await chart.textContent()).not.toMatch(/[٠-٩۰-۹]/);
      await shoot(page, `arabe-timeline-decennie-${size.name}`);
    });
  });
}
