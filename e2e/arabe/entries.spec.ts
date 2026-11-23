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
import { expectNoAxeViolations } from '../support/axe';
import { shoot } from '../support/captures';
import { API } from '../support/env';

// M16-19, éditeur d'entrée en /ar/ (G Q71, Q74 à Q81 ; docs/design/arabe.md §2, §3, §5, §6 ; fiche
// 05) : panneau du côté de la fin de ligne (à gauche), six types, curseur d'intensité dont le minimum
// est à droite (← augmente, → diminue) et dont la valeur enregistrée est relue, puces de type dans
// le sens de lecture, rail « Lié à… », erreur de validation et historique des versions, sans
// défilement horizontal, axe-core sans violation, une capture par écran (PSYMATE_E2E_CAPTURES).
// Aucun libellé ciblé (rôles, structure, URL) : les textes de /ar/ passent du français de repli à
// l'arabe au fil du jalon. Contre l'API locale (seed small, Mailpit), jamais de mock du backend. Une
// seule inscription et une seule connexion (mode série, page partagée) ; toutes les données sont
// créées par la suite dans un compte jetable.

const TYPES = ['note', 'event', 'situation', 'feeling', 'session', 'medication'] as const;
/** Titre saisi en arabe : affiché dans son sens, proposé dans le rail. */
const ARABIC_TITLE = 'نوبة قلق قبل الاجتماع';
/** Titre latin long : tronqué par sa fin (ellipse) dans le rail arabe, jamais par son début. */
const LONG_LATIN_TITLE =
  'Entretien préalable avec le service des ressources humaines de l’entreprise de transport';
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

async function createEntry(
  api: APIRequestContext,
  patientId: string,
  data: Record<string, unknown>,
): Promise<string> {
  const response = await api.post(`${API}/api/patients/${patientId}/entries`, { data });
  expect(response.status(), await response.text()).toBe(201);
  return ((await response.json()) as { id: string }).id;
}

test.describe('éditeur d’entrée en /ar/', () => {
  let api: APIRequestContext;
  let context: BrowserContext;
  let page: Page;
  let patientId: string;
  let sessionId: string;

  test.describe.configure({ mode: 'serial', timeout: 90_000 });

  test.beforeAll(async ({ browser }, testInfo) => {
    test.setTimeout(180_000);
    api = await playwrightRequest.newContext();
    // Psychiatre : le type « médicament » n'est visible par défaut que pour lui
    // (entryTypes.medicationVisible) ; la préférence est posée en plus, pour ne pas en dépendre.
    const account = await createAccount(api, 'm16-19.entrees', 'psychiatrist');
    const preferences = await api.patch(`${API}/api/me/preferences`, {
      data: { 'entryTypes.medicationVisible': true },
    });
    expect(preferences.status(), await preferences.text()).toBe(200);
    patientId = await createPatient(api, 'Salma B.');
    sessionId = await startSession(api, patientId);
    // Cibles du rail « Lié à… » : un titre arabe et un titre latin long.
    await createEntry(api, patientId, {
      type: 'note',
      title: ARABIC_TITLE,
      body: 'نص الملاحظة.',
      sessionId,
    });
    await createEntry(api, patientId, {
      type: 'note',
      title: LONG_LATIN_TITLE,
      body: 'Compte rendu.',
      sessionId,
    });
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

  /** Le dossier dans la langue voulue, puis N (touche physique, Q81) : l'éditeur en création. */
  async function openEditor(locale = 'ar'): Promise<ReturnType<typeof editorOf>> {
    await page.goto(`/${locale}/patients/${patientId}`);
    await expect(page.locator('h1').first()).toBeVisible();
    await page.keyboard.press('n');
    const e = editorOf(page);
    await settled(e.dialog);
    return e;
  }

  /**
   * Ressenti « anxiety » dont l'intensité est réglée au clavier (Début, puis 5 fois `key`), enregistré :
   * l'intensité envoyée, rendue par la réponse 201 et relue par l'API vaut 6.
   */
  async function saveFeeling(locale: 'ar' | 'fr', key: 'ArrowLeft' | 'ArrowRight'): Promise<void> {
    const e = await openEditor(locale);
    await e.chip('feeling').click();
    const emotion = e.dialog.locator('pm-emotion-combobox input[role="combobox"]');
    await emotion.click();
    await emotion.fill('anx');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(e.dialog.locator('pm-emotion-combobox .field .dot.family-fear')).toBeVisible();
    await e.slider.focus();
    await page.keyboard.press('Home');
    for (let i = 0; i < 5; i++) await page.keyboard.press(key);
    await expect(e.slider).toHaveAttribute('aria-valuenow', '6');
    await expect
      .poll(() => thumbFrom(page, locale === 'ar' ? 'right' : 'left'))
      .toBeCloseTo(5 / 9, 1);
    const created = page.waitForResponse(
      (r) =>
        r.request().method() === 'POST' && r.url().endsWith(`/api/patients/${patientId}/entries`),
    );
    await e.save.click();
    const response = await created;
    expect(response.status(), await response.text()).toBe(201);
    const sent = response.request().postDataJSON() as { feeling?: Record<string, unknown> };
    expect(sent.feeling).toMatchObject({ emotionCode: 'anxiety', intensity: 6 });
    const saved = (await response.json()) as { id: string; feeling?: { intensity?: number } };
    expect(saved.feeling?.intensity).toBe(6);
    const reread = await api.get(`${API}/api/entries/${saved.id}`);
    expect(reread.status()).toBe(200);
    const entry = (await reread.json()) as { feeling?: { intensity?: number } };
    expect(entry.feeling?.intensity).toBe(6);
    await expect(e.dialog).toBeHidden();
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
        // Noms des cibles en dir="auto" : le titre arabe de droite à gauche, le titre latin de
        // gauche à droite, donc coupé par sa fin (ellipse), son début visible.
        const arabic = e.dialog.locator('pm-link-rail .name', { hasText: ARABIC_TITLE });
        await expect(arabic).toHaveAttribute('dir', 'auto');
        expect(await arabic.evaluate((el) => getComputedStyle(el).direction)).toBe('rtl');
        const latin = e.dialog.locator('pm-link-rail .name', { hasText: 'Entretien préalable' });
        await expect(latin).toHaveAttribute('dir', 'auto');
        const cut = await latin.evaluate((el) => {
          const range = document.createRange();
          range.setStart(el.firstChild!, 0);
          range.setEnd(el.firstChild!, 1);
          const firstLetter = range.getBoundingClientRect();
          const own = el.getBoundingClientRect();
          return {
            direction: getComputedStyle(el).direction,
            overflowing: el.scrollWidth > el.clientWidth,
            firstLetterInside:
              firstLetter.left >= own.left - 1 && firstLetter.right <= own.right + 1,
          };
        });
        expect(cut).toEqual({ direction: 'ltr', overflowing: true, firstLetterInside: true });
      }
      await expectRtlPage(page);
      await shoot(page, `arabe-entrees-${type}`);
    }
    await page.keyboard.press('Escape');
    await expect(e.dialog).toBeHidden();
  });

  test('curseur d’intensité au clavier : minimum à droite, ← augmente, → diminue (Q81)', async () => {
    const e = await openEditor();
    await e.chip('feeling').click();
    await e.slider.focus();
    await page.keyboard.press('Home');
    await expect(e.slider).toHaveAttribute('aria-valuenow', '1');
    // Minimum au bord droit de la piste.
    await expect.poll(() => thumbFrom(page, 'right')).toBeLessThan(0.02);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(e.slider).toHaveAttribute('aria-valuenow', '3');
    // (3 − 1) / 9 de la piste depuis la droite.
    await expect.poll(() => thumbFrom(page, 'right')).toBeCloseTo(2 / 9, 1);
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
    await expect.poll(() => thumbFrom(page, 'left')).toBeLessThan(0.02);
    // Repères : 1 à droite, 10 à gauche.
    const ticks = e.dialog.locator('pm-intensity-slider .tick');
    const one = (await ticks.first().boundingBox())!;
    const ten = (await ticks.last().boundingBox())!;
    expect(one.x).toBeGreaterThan(ten.x);

    // Puces au clavier : ← passe au type suivant (séance), → revient au ressenti.
    await e.chip('feeling').focus();
    await page.keyboard.press('ArrowLeft');
    await expect(e.chip('session')).toHaveAttribute('aria-pressed', 'true');
    await expect(e.chip('session')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(e.chip('feeling')).toHaveAttribute('aria-pressed', 'true');
    await expectRtlPage(page);
    await shoot(page, 'arabe-entrees-curseur');
    await page.keyboard.press('Escape');
    await expect(e.dialog).toBeHidden();
  });

  test('curseur d’intensité au pointeur : bord droit 1, milieu 5, bord gauche 10', async () => {
    const e = await openEditor();
    await e.chip('feeling').click();
    const track = (await e.track.boundingBox())!;
    const y = track.y + track.height / 2;
    // Près du bord droit : le minimum.
    await page.mouse.click(track.x + track.width - 1, y);
    await expect(e.slider).toHaveAttribute('aria-valuenow', '1');
    await expect.poll(() => thumbFrom(page, 'right')).toBeLessThan(0.02);
    // Milieu : le centre exact est la frontière d'arrondi entre 5 et 6 (1 + 4,5 crans) ; le clic
    // tombe un quart de cran à droite du centre (4,25 crans depuis la droite), donc 5 sans ambiguïté.
    await page.mouse.click(track.x + track.width / 2 + (track.width / 9) * 0.25, y);
    await expect(e.slider).toHaveAttribute('aria-valuenow', '5');
    await expect.poll(() => thumbFrom(page, 'right')).toBeCloseTo(4 / 9, 1);
    // Près du bord gauche : le maximum.
    await page.mouse.click(track.x + 1, y);
    await expect(e.slider).toHaveAttribute('aria-valuenow', '10');
    await expect.poll(() => thumbFrom(page, 'left')).toBeLessThan(0.02);
    await page.keyboard.press('Escape');
    await expect(e.dialog).toBeHidden();
  });

  test('intensité enregistrée en /ar/ : ← cinq fois depuis 1 donne 6, envoyé et relu', async () => {
    await saveFeeling('ar', 'ArrowLeft');
  });

  test('intensité enregistrée en /fr/ : sens inchangé, → cinq fois depuis 1 donne 6', async () => {
    await saveFeeling('fr', 'ArrowRight');
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

  test('historique des versions : version 2 créée par le test, ligne lue de droite à gauche', async () => {
    // Pendant la grâce (1 h 15), une correction n'est faite en place que pour une entrée sans lien
    // ni autre version (contrat, PATCH /api/entries/{id}) : un événement lié à un ressenti passe
    // donc en version 2 dès sa première correction, sans attendre la fin de la fenêtre.
    const eventId = await createEntry(api, patientId, {
      type: 'event',
      title: 'Crise avant la réunion',
      body: 'Texte saisi en français.',
      sessionId,
    });
    await createEntry(api, patientId, {
      type: 'feeling',
      feeling: { emotionCode: 'anxiety', intensity: 6 },
      sessionId,
      links: [{ targetId: eventId, linkType: 'triggers', direction: 'incoming' }],
    });
    const patched = await api.patch(`${API}/api/entries/${eventId}`, {
      data: { title: ARABIC_TITLE, reason: 'تصحيح بعد المراجعة' },
    });
    expect(patched.status(), await patched.text()).toBe(200);
    expect(
      ((await patched.json()) as { version: number }).version,
      'la correction d’une entrée liée doit créer la version 2 (grâce : en place seulement sans lien ni autre version)',
    ).toBe(2);

    await page.goto(`/ar/patients/${patientId}?entry=${eventId}`);
    const e = editorOf(page);
    await settled(e.dialog);
    await expectRtlPage(page);
    await shoot(page, 'arabe-entrees-correction');

    await e.dialog.locator('.footer .footnote button.link').click();
    const panel = page.locator('[role="dialog"]:has(pm-version-history-panel)');
    await settled(panel);
    const versions = panel.locator('ol.versions > li');
    await expect(versions).toHaveCount(2);
    const current = versions.first();
    await expect(current).toHaveAttribute('aria-current', 'true');
    // Ancien et nouveau titre saisis : chacun dans son sens (Q77).
    const before = current.locator('dd s').first();
    const after = current.locator('dd .after').first();
    await expect(before).toHaveAttribute('dir', 'auto');
    await expect(after).toHaveAttribute('dir', 'auto');
    await expect(after).toHaveText(ARABIC_TITLE);
    expect(await after.evaluate((el) => getComputedStyle(el).direction)).toBe('rtl');
    expect(await before.evaluate((el) => getComputedStyle(el).direction)).toBe('ltr');
    // Motif saisi, isolé dans sa phrase.
    await expect(current.locator('.reason bdi')).toHaveText('تصحيح بعد المراجعة');
    // « v2 · date » se lit de droite à gauche : le nom de version à droite de la date.
    const name = (await current.locator('.line .name').boundingBox())!;
    const date = (await current.locator('.line .mono').boundingBox())!;
    expect(name.x).toBeGreaterThan(date.x);
    // Chiffres latins (Q71 point 2).
    expect(await current.locator('.line').textContent()).not.toMatch(/[٠-٩۰-۹]/);
    await expectRtlPage(page);
    await shoot(page, 'arabe-entrees-historique');
  });
});
