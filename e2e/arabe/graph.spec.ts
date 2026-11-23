import {
  APIRequestContext,
  BrowserContext,
  expect,
  Page,
  request as playwrightRequest,
  test,
} from '@playwright/test';

import {
  enableProbe,
  graphReady,
  point,
  SmallFolder,
  smallFolder,
} from '../flux-6-graphe/graph-support';
import { createAccount, signIn } from '../preferences/accounts';
import { expectNoAxeViolations } from '../support/axe';
import { shoot } from '../support/captures';

// M16-18, vue graphe en /ar/ (G Q75 ; docs/design/arabe.md §2, §3, §5 ; fiches 04 et 06) : le graphe
// se lit vers la gauche (elk.direction LEFT, la cause à droite de son effet), de haut en bas sans
// changement, détail d'une carte, liste équivalente des liens et éditeur de lien de droite à gauche,
// sans défilement horizontal, axe-core sans violation, une capture par vue (PSYMATE_E2E_CAPTURES).
// Aucun libellé ciblé (rôles, structure, URL) : les textes de /ar/ passent du français de repli à
// l'arabe au fil du jalon. Contre l'API locale (seed small, Mailpit), jamais de mock du backend :
// dossier créé par l'API dans un compte jetable (smallFolder, comme e2e/flux-6-graphe). Une seule
// inscription et une seule connexion pour toute la suite (mode série, page partagée) : la charge de
// la CI n'expose pas la suite aux 429.

let api: APIRequestContext;
let folder: SmallFolder;
let context: BrowserContext;
let page: Page;

test.describe.configure({ mode: 'serial', timeout: 90_000 });

test.beforeAll(async ({ browser }, testInfo) => {
  test.setTimeout(180_000);
  api = await playwrightRequest.newContext();
  const account = await createAccount(api, 'm16-18.graphe', 'psychologist');
  folder = await smallFolder(api);
  // Page partagée par la suite : mêmes réglages que la configuration (adresse, langue du navigateur).
  // Contexte créé explicitement : axe-core refuse une page ouverte par browser.newPage().
  context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    locale: testInfo.project.use.locale,
    viewport: { width: 1440, height: 900 },
  });
  page = await context.newPage();
  await enableProbe(page);
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

/** Boîte d'un élément, rendue. */
async function boxOf(selector: string) {
  const box = await page.locator(selector).first().boundingBox();
  expect(box, `${selector} rendu`).not.toBeNull();
  return box!;
}

/** Le graphe du dossier en /ar/, centré sur la situation, dessiné. */
async function openGraph(query = ''): Promise<void> {
  await page.goto(`/ar/patients/${folder.patientId}/graph?root=${folder.situation}${query}`);
  await graphReady(page, { count: 4 });
}

test('de droite à gauche : la cause à droite de son effet', async () => {
  await openGraph();
  await expectRtlPage();

  // Événement → situation → ressenti → médicament : chaque carte à droite de la suivante.
  const event = await point(page, folder.event);
  const situation = await point(page, folder.situation);
  const feeling = await point(page, folder.feeling);
  const medication = await point(page, folder.medication);
  expect(event.x).toBeGreaterThan(situation.x);
  expect(situation.x).toBeGreaterThan(feeling.x);
  expect(feeling.x).toBeGreaterThan(medication.x);
  // Sens par défaut : aucun paramètre d'URL.
  expect(new URL(page.url()).searchParams.get('direction')).toBeNull();
  // Le repère du dessin reste de gauche à droite ; les cartes suivent la page
  // (sens calculé, pas l'attribut : dir n'agit pas sur un <svg>, qui l'hérite du repère).
  await expect(page.locator('pm-graph-canvas .world')).toHaveCSS('direction', 'ltr');
  await expect(page.locator('pm-graph-canvas svg.links')).toHaveCSS('direction', 'ltr');
  await expect(page.locator(`[data-node-id="${folder.event}"]`)).toHaveCSS('direction', 'rtl');
  await shoot(page, 'arabe-graph-horizontal');
});

test('de haut en bas : le paramètre d’URL garde sa valeur, le sens vertical ne change pas', async () => {
  await openGraph('&direction=down');
  await expectRtlPage();
  const top = await point(page, folder.event);
  const middle = await point(page, folder.situation);
  const bottom = await point(page, folder.feeling);
  expect(top.y).toBeLessThan(middle.y);
  expect(middle.y).toBeLessThan(bottom.y);
  await shoot(page, 'arabe-graph-vertical');
});

test('détail d’une carte : à gauche du graphe, la chaîne reste à sa place', async () => {
  await openGraph();
  const before = await point(page, folder.event);
  await page.locator(`[data-node-id="${folder.feeling}"]`).click();
  await expect(page.locator('pm-graph-detail aside')).toBeVisible();
  await expect(page.locator('pm-graph-detail h2')).toHaveAttribute('dir', 'auto');
  // Le panneau est du côté de la fin de ligne, à gauche du graphe.
  const board = await boxOf('.board');
  const detail = await boxOf('pm-graph-detail');
  expect(detail.x + detail.width).toBeLessThanOrEqual(board.x + 1);
  // La cause (au bord droit) ne bouge pas quand la zone rétrécit par la gauche.
  await expect
    .poll(async () => Math.abs((await point(page, folder.event)).x - before.x))
    .toBeLessThanOrEqual(1);
  await expectRtlPage();
  await shoot(page, 'arabe-graph-detail');
});

test('liste équivalente des liens : source, lien, cible dans le sens de lecture', async () => {
  await openGraph();
  await page.locator('button[aria-controls="graph-links-list"]').click();
  const table = page.locator('#graph-links-list table').first();
  await expect(table).toBeVisible();
  // La source à droite de la cible.
  const source = await table.locator('thead th').nth(0).boundingBox();
  const target = await table.locator('thead th').nth(2).boundingBox();
  expect(source!.x).toBeGreaterThan(target!.x);
  await expectRtlPage();
  await shoot(page, 'arabe-graph-liste');
});

test('éditeur de lien : phrase source, verbe, cible de droite à gauche, flèche retournée', async () => {
  await openGraph();
  // Ressenti sélectionné, « Lier » de la barre d'outils (raccourci L).
  await page.locator(`[data-node-id="${folder.feeling}"]`).click();
  await page.locator('button.tool.link').click();
  const dialog = page.locator('[role="dialog"]:has(pm-link-editor-panel)');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 20_000 });

  // Panneau ancré à la fin de la ligne : à gauche en arabe (à un pixel près).
  const pane = await boxOf('.pm-side-panel-pane');
  expect(Math.abs(pane.x)).toBeLessThanOrEqual(1);
  // Flèche d'inversion retournée.
  await expect(dialog.locator('button.invert svg')).toHaveCSS(
    'transform',
    'matrix(-1, 0, 0, 1, 0, 0)',
  );

  // Ressenti → événement, « est causé par ».
  await dialog.locator(`input[type="radio"][value="${folder.event}"]`).check();
  await dialog.locator('.editor pm-link-type-chips [data-code="caused_by"]').click();
  const sentence = dialog.locator('.reading .sentence');
  await expect(sentence).toHaveCSS('direction', 'rtl');
  const parts = sentence.locator(':scope > *');
  await expect(parts).toHaveCount(3);
  // Ordre de lecture, que la phrase tienne ou non sur une ligne : sur une même ligne, chaque
  // morceau est à gauche du précédent ; sinon, il est sur une ligne plus basse.
  const boxes = await parts.evaluateAll((elements) =>
    elements.map((element) => {
      const rects = element.getClientRects();
      const first = rects[0];
      const last = rects[rects.length - 1];
      return {
        start: { right: first.right, top: first.top },
        end: { left: last.left, top: last.top },
      };
    }),
  );
  for (let i = 1; i < boxes.length; i++) {
    const previous = boxes[i - 1].end;
    const current = boxes[i].start;
    if (Math.abs(current.top - previous.top) < 2) {
      expect(current.right).toBeLessThanOrEqual(previous.left + 1);
    } else {
      expect(current.top).toBeGreaterThan(previous.top);
    }
  }
  await expectRtlPage();
  await shoot(page, 'arabe-graph-editeur', false);
  await page.keyboard.press('Escape');
});
