import {
  APIRequestContext,
  BrowserContext,
  expect,
  Locator,
  Page,
  request as playwrightRequest,
  test,
} from '@playwright/test';

import { createAccount, signIn } from '../preferences/accounts';
import { SEED } from '../support/accounts';
import { expectNoAxeViolations } from '../support/axe';
import { shoot } from '../support/captures';
import { API } from '../support/env';

// M16-19, éditeur d'entrée en /ar/ (G Q71, Q74 à Q81 ; docs/design/arabe.md §2, §3, §5, §6 ; fiche
// 05) : panneau du côté de la fin de ligne (à gauche), six types, curseur d'intensité dont le minimum
// est à droite (← augmente, → diminue), puces de type dans le sens de lecture, rail « Lié à… »,
// erreur de validation et historique des versions, sans défilement horizontal, axe-core sans
// violation, une capture par écran (PSYMATE_E2E_CAPTURES). Aucun libellé ciblé (rôles, structure,
// URL) : les textes de /ar/ passent du français de repli à l'arabe au fil du jalon. Contre l'API
// locale (seed small, Mailpit), jamais de mock du backend. Une seule inscription et une seule
// connexion pour l'éditeur (mode série, page partagée) ; l'historique prend une entrée ancienne du
// seed (claire.seed), seule source d'une entrée en version 2 (fenêtre de grâce de 1 h 15).

const TYPES = ['note', 'event', 'situation', 'feeling', 'session', 'medication'] as const;
/** Titre saisi en arabe : affiché dans son sens, proposé dans le rail. */
const ARABIC_TITLE = 'نوبة قلق قبل الاجتماع';
/** Grâce de G Q31 (versioning.grace-period = 75m). */
const GRACE_MS = 75 * 60_000;
const VIEWPORT = { width: 1440, height: 900 };

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

/** Le panneau a fini de glisser et ses données sont là. */
async function settled(dialog: Locator): Promise<void> {
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 20_000 });
}

function editorOf(page: Page) {
  const dialog = page.locator('[role="dialog"]:has(pm-entry-editor-panel)');
  return {
    dialog,
    chip: (type: string) => dialog.locator(`pm-type-chips [data-type="${type}"]`),
    slider: dialog.locator('pm-intensity-slider [role="slider"]'),
    track: dialog.locator('pm-intensity-slider .track'),
    thumb: dialog.locator('pm-intensity-slider .thumb'),
    save: dialog.locator('.footer .primary'),
  };
}

/**
 * Position du pouce depuis le bord droit de la piste (de droite à gauche) ou depuis le bord gauche
 * (de gauche à droite), en fraction de la piste : mesurée sur le rendu, indépendante de la police.
 */
async function thumbFrom(page: Page, edge: 'left' | 'right'): Promise<number> {
  const e = editorOf(page);
  const track = (await e.track.boundingBox())!;
  const thumb = (await e.thumb.boundingBox())!;
  const center = thumb.x + thumb.width / 2;
  return edge === 'right'
    ? (track.x + track.width - center) / track.width
    : (center - track.x) / track.width;
}

async function createPatient(api: APIRequestContext, displayName: string): Promise<string> {
  const response = await api.post(`${API}/api/patients`, { data: { displayName } });
  expect(response.status(), await response.text()).toBe(201);
  return ((await response.json()) as { id: string }).id;
}

/** Séance d'accueil créée de façon asynchrone, puis une séance ouverte (bloc Séance présélectionné). */
async function startSession(api: APIRequestContext, patientId: string): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const current = await api.get(`${API}/api/patients/${patientId}/sessions/current`);
    if (current.status() === 200) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const response = await api.post(`${API}/api/patients/${patientId}/sessions/start`, {
    data: { modality: 'in_person' },
  });
  expect(response.status(), await response.text()).toBe(201);
  return ((await response.json()) as { id: string }).id;
}

test.describe('éditeur d’entrée en /ar/', () => {
  let api: APIRequestContext;
  let context: BrowserContext;
  let page: Page;
  let patientId: string;

  test.describe.configure({ mode: 'serial', timeout: 90_000 });

  test.beforeAll(async ({ browser }, testInfo) => {
    test.setTimeout(180_000);
    api = await playwrightRequest.newContext();
    const account = await createAccount(api, 'm16-19.entrees', 'psychologist');
    patientId = await createPatient(api, 'Salma B.');
    const sessionId = await startSession(api, patientId);
    // Une note au titre arabe : cible du rail « Lié à… ».
    const note = await api.post(`${API}/api/patients/${patientId}/entries`, {
      data: { type: 'note', title: ARABIC_TITLE, body: 'نص الملاحظة.', sessionId },
    });
    expect(note.status(), await note.text()).toBe(201);
    // Page partagée par la suite : mêmes réglages que la configuration (adresse, langue du navigateur).
    // Contexte créé explicitement : axe-core refuse une page ouverte par browser.newPage().
    context = await browser.newContext({
      baseURL: testInfo.project.use.baseURL,
      locale: testInfo.project.use.locale,
      timezoneId: testInfo.project.use.timezoneId,
      viewport: VIEWPORT,
    });
    page = await context.newPage();
    // Connexion en /fr/ (libellés connus), puis /ar/ : la session garde le bundle de l'URL.
    await signIn(page, account);
  });

  test.afterAll(async () => {
    await context?.close();
    await api?.dispose();
  });

  /** Le dossier en /ar/, puis N (touche physique, Q81) : l'éditeur en création. */
  async function openEditor(locale = 'ar'): Promise<ReturnType<typeof editorOf>> {
    await page.goto(`/${locale}/patients/${patientId}`);
    await expect(page.locator('h1').first()).toBeVisible();
    await page.keyboard.press('n');
    const e = editorOf(page);
    await settled(e.dialog);
    return e;
  }

  test('six types : panneau à gauche, puces dans le sens de lecture, une capture par type', async () => {
    const e = await openEditor();
    // Panneau latéral du côté de la fin de ligne : collé au bord gauche de la fenêtre.
    const panel = (await e.dialog.boundingBox())!;
    expect(panel.x).toBeLessThanOrEqual(1);
    expect(panel.x + panel.width).toBeLessThan(VIEWPORT.width / 2);
    // Puces : la première (note) à droite de la deuxième (événement).
    const first = (await e.chip('note').boundingBox())!;
    const second = (await e.chip('event').boundingBox())!;
    expect(first.x).toBeGreaterThan(second.x);

    for (const type of TYPES) {
      await e.chip(type).click();
      await expect(e.chip(type)).toHaveAttribute('aria-pressed', 'true');
      await settled(e.dialog);
      // Contenu saisi dans son sens (Q77) : champs de texte libre en dir="auto".
      for (const field of await e.dialog
        .locator('textarea, input[formcontrolname="title"], input[formcontrolname="body"]')
        .all()) {
        await expect(field).toHaveAttribute('dir', 'auto');
      }
      if (type === 'note') {
        // Rail « Lié à… » : la case à droite de sa cible, le rappel en fin de ligne (à gauche).
        const row = e.dialog.locator('pm-link-rail .row').first();
        await expect(row).toBeVisible();
        const box = (await row.locator('input[type="checkbox"]').boundingBox())!;
        const target = (await row.locator('.target').boundingBox())!;
        expect(box.x).toBeGreaterThan(target.x);
        const legend = (await e.dialog.locator('fieldset.rail legend').boundingBox())!;
        const aside = (await e.dialog.locator('.rail-aside').boundingBox())!;
        expect(aside.x).toBeLessThan(legend.x + legend.width / 2);
        await expect(
          e.dialog.locator('pm-link-rail .name bdi', { hasText: ARABIC_TITLE }),
        ).toHaveCount(1);
      }
      await expectRtlPage(page);
      await shoot(page, `arabe-entrees-${type}`);
    }
    await page.keyboard.press('Escape');
    await expect(e.dialog).toBeHidden();
  });

  test('curseur d’intensité : minimum à droite, ← augmente, → diminue (Q81)', async () => {
    const e = await openEditor();
    await e.chip('feeling').click();
    await e.slider.focus();
    await page.keyboard.press('Home');
    await expect(e.slider).toHaveAttribute('aria-valuenow', '1');
    // Minimum au bord droit de la piste.
    expect(await thumbFrom(page, 'right')).toBeLessThan(0.02);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(e.slider).toHaveAttribute('aria-valuenow', '3');
    // (3 − 1) / 9 de la piste depuis la droite.
    expect(Math.abs((await thumbFrom(page, 'right')) - 2 / 9)).toBeLessThan(0.02);
    await page.keyboard.press('ArrowRight');
    await expect(e.slider).toHaveAttribute('aria-valuenow', '2');
    // Haut et bas inchangés ; bornes lues inchangées.
    await page.keyboard.press('ArrowUp');
    await expect(e.slider).toHaveAttribute('aria-valuenow', '3');
    await page.keyboard.press('ArrowDown');
    await expect(e.slider).toHaveAttribute('aria-valuenow', '2');
    await expect(e.slider).toHaveAttribute('aria-valuemin', '1');
    await expect(e.slider).toHaveAttribute('aria-valuemax', '10');
    await page.keyboard.press('End');
    await expect(e.slider).toHaveAttribute('aria-valuenow', '10');
    expect(await thumbFrom(page, 'left')).toBeLessThan(0.02);
    // Repères : 1 à droite, 10 à gauche.
    const ticks = e.dialog.locator('pm-intensity-slider .tick');
    const one = (await ticks.first().boundingBox())!;
    const ten = (await ticks.last().boundingBox())!;
    expect(one.x).toBeGreaterThan(ten.x);
    // Au pointeur : un clic près du bord droit donne le minimum.
    const track = (await e.track.boundingBox())!;
    await page.mouse.click(track.x + track.width - 1, track.y + track.height / 2);
    await expect(e.slider).toHaveAttribute('aria-valuenow', '1');

    // Puces au clavier : ← passe au type suivant (séance), → revient au ressenti.
    await e.chip('feeling').focus();
    await page.keyboard.press('ArrowLeft');
    await expect(e.chip('session')).toHaveAttribute('aria-pressed', 'true');
    await expect(e.chip('session')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(e.chip('feeling')).toHaveAttribute('aria-pressed', 'true');

    await e.slider.focus();
    await page.keyboard.press('7');
    await expect(e.slider).toHaveAttribute('aria-valuenow', '7');
    await expectRtlPage(page);
    await shoot(page, 'arabe-entrees-curseur');
    await page.keyboard.press('Escape');
    await expect(e.dialog).toBeHidden();
  });

  test('curseur d’intensité en /fr/ : inchangé, minimum à gauche, → augmente', async () => {
    const e = await openEditor('fr');
    await e.chip('feeling').click();
    await e.slider.focus();
    await page.keyboard.press('Home');
    expect(await thumbFrom(page, 'left')).toBeLessThan(0.02);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(e.slider).toHaveAttribute('aria-valuenow', '3');
    expect(Math.abs((await thumbFrom(page, 'left')) - 2 / 9)).toBeLessThan(0.02);
    await page.keyboard.press('ArrowLeft');
    await expect(e.slider).toHaveAttribute('aria-valuenow', '2');
    await page.keyboard.press('Escape');
    await expect(e.dialog).toBeHidden();
  });

  test('erreur de validation : champ requis signalé, saisie gardée', async () => {
    const e = await openEditor();
    await e.chip('event').click();
    const title = e.dialog.locator('input[formcontrolname="title"]');
    await title.fill('');
    await e.dialog.locator('textarea').fill('نص بلا عنوان.');
    const created = page.waitForResponse(
      (r) =>
        r.request().method() === 'POST' && r.url().endsWith(`/api/patients/${patientId}/entries`),
    );
    await e.save.click();
    expect((await created).status()).toBe(422);
    await expect(title).toHaveAttribute('aria-invalid', 'true');
    await expect(e.dialog.locator('textarea')).toHaveValue('نص بلا عنوان.');
    // Texte arabe saisi : de droite à gauche dans son champ (dir="auto").
    expect(
      await e.dialog.locator('textarea').evaluate((el) => getComputedStyle(el).direction),
    ).toBe('rtl');
    await expectRtlPage(page);
    await shoot(page, 'arabe-entrees-erreur');
    await page.keyboard.press('Escape');
    await expect(e.dialog).toBeHidden();
  });
});

test('historique des versions en /ar/ : version et date dans le sens de lecture', async ({
  page,
}) => {
  test.setTimeout(120_000);
  // Session API de claire.seed : une entrée déjà en version 2 (laissée par e2e/flux-3-saisie), sinon
  // une entrée ancienne en version 1, corrigée hors de la fenêtre de grâce.
  const api = await playwrightRequest.newContext();
  const login = await api.post(`${API}/api/auth/login`, { data: SEED.claire });
  expect(login.status()).toBe(200);
  const patients = (await (await api.get(`${API}/api/patients?limit=50`)).json()) as {
    items: { id: string }[];
  };
  let target: { patientId: string; entryId: string } | null = null;
  let fallback: { patientId: string; entryId: string; body: string } | null = null;
  for (const patient of patients.items) {
    const timeline = (await (
      await api.get(`${API}/api/patients/${patient.id}/timeline?types=note,event&limit=200`)
    ).json()) as { items: { id: string }[] };
    for (const item of timeline.items) {
      const entry = (await (await api.get(`${API}/api/entries/${item.id}`)).json()) as {
        version: number;
        recordedAt: string;
        body: string | null;
        archivedAt: string | null;
      };
      if (entry.archivedAt || !entry.body) continue;
      if (entry.version >= 2) {
        target = { patientId: patient.id, entryId: item.id };
        break;
      }
      const old = Date.now() - new Date(entry.recordedAt).getTime() > GRACE_MS + 60_000;
      if (!fallback && entry.version === 1 && old) {
        fallback = { patientId: patient.id, entryId: item.id, body: entry.body };
      }
    }
    if (target) break;
  }
  if (!target && fallback) {
    const patched = await api.patch(`${API}/api/entries/${fallback.entryId}`, {
      data: { body: `${fallback.body} (مراجعة)`, reason: 'تصحيح بعد المراجعة' },
    });
    expect(patched.status(), await patched.text()).toBe(200);
    target = { patientId: fallback.patientId, entryId: fallback.entryId };
  }
  await api.dispose();
  test.skip(
    !target,
    'aucune entrée du seed à corriger (seed déjà consommé : make seed SIZE=small)',
  );

  await signIn(page, SEED.claire);
  await page.goto(`/ar/patients/${target!.patientId}?entry=${target!.entryId}`);
  const e = editorOf(page);
  await settled(e.dialog);
  await expectRtlPage(page);
  await shoot(page, 'arabe-entrees-correction');

  await e.dialog.locator('.footer .footnote button.link').click();
  const panel = page.locator('[role="dialog"]:has(pm-version-history-panel)');
  await settled(panel);
  const versions = panel.locator('ol.versions > li');
  expect(await versions.count()).toBeGreaterThanOrEqual(2);
  const current = versions.first();
  await expect(current).toHaveAttribute('aria-current', 'true');
  // Ancien et nouveau texte saisis : dans leur sens (Q77).
  await expect(current.locator('dd .after').first()).toHaveAttribute('dir', 'auto');
  await expect(current.locator('dd s').first()).toHaveAttribute('dir', 'auto');
  // « v2 · date » se lit de droite à gauche : le nom de version à droite de la date.
  const name = (await current.locator('.line .name').boundingBox())!;
  const date = (await current.locator('.line .mono').boundingBox())!;
  expect(name.x).toBeGreaterThan(date.x);
  // Chiffres latins (Q71 point 2).
  expect(await current.locator('.line').textContent()).not.toMatch(/[٠-٩۰-۹]/);
  await expectRtlPage(page);
  await shoot(page, 'arabe-entrees-historique');
});
