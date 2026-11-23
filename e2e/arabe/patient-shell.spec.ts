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

// M16-15, dossier patient en /ar/ (G Q71, Q74, Q77, Q81 ; docs/design/arabe.md §2, §5, §6 ; fiche
// 00, planche 29) : dossier sans séance en cours, dossier avec séance en cours (onglet Séance,
// colonne de contexte, lignes notées, au bureau et à 390 px), panneau de clôture, aide des
// raccourcis. dir="rtl", aucun défilement horizontal, axe-core sans violation, une capture par écran
// (PSYMATE_E2E_CAPTURES). Aucun libellé ciblé (rôles, structure, URL) : les textes de /ar/ passent du
// français de repli à l'arabe au fil du jalon. Contre l'API locale, jamais de mock du backend : un
// compte jetable et des dossiers écrits par l'API dans le test (aucune hypothèse sur le seed). Une
// seule inscription et une seule connexion (mode série, page partagée).

/** Titre saisi en arabe : affiché dans son sens (dir="auto"). */
const ARABIC_TITLE = 'ملاحظة عن النوم';
/** Titre latin long : coupé par sa fin (ellipse) dans une interface arabe, jamais par son début. */
const LONG_LATIN_TITLE =
  'Entretien préalable avec le service des ressources humaines de l’entreprise de transport';
/** Nom latin terminé par un point : isolé dans le sous-titre du panneau (« Lou P. », pas « .Lou P »). */
const LATIN_NAME = 'Lou P.';
/** Compte rendu saisi en arabe dans le panneau de clôture : envoyé tel quel, sans caractère ajouté. */
const ARABIC_SUMMARY = 'تحدثنا عن النوم والعمل.';
/** Chiffres arabo-indiens (U+0660 à U+0669) et persans : jamais affichés (G Q71 point 2). */
const NON_LATIN_DIGITS = /[٠-٩۰-۹]/;
/** Caractères d'isolation Unicode (U+2066 à U+2069) : jamais envoyés à l'API. */
const ISOLATES = /[\u2066-\u2069]/;
/** Situation en cours, lue par la colonne de contexte dans la projection « vue d'ensemble ». */
const SITUATION_TITLE = 'Réorganisation du service de nuit';
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

async function createPatient(api: APIRequestContext, displayName: string): Promise<string> {
  const response = await api.post(`${API}/api/patients`, { data: { displayName } });
  expect(response.status(), await response.text()).toBe(201);
  return ((await response.json()) as { id: string }).id;
}

/** La séance d'accueil est créée de façon asynchrone avec le dossier : on l'attend. */
async function waitForIntake(api: APIRequestContext, patientId: string): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const current = await api.get(`${API}/api/patients/${patientId}/sessions/current`);
    if (current.status() === 200) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`séance d'accueil absente pour ${patientId}`);
}

async function startSession(api: APIRequestContext, patientId: string): Promise<string> {
  const response = await api.post(`${API}/api/patients/${patientId}/sessions/start`, {
    data: { modality: 'in_person' },
  });
  expect(response.status(), await response.text()).toBe(201);
  return ((await response.json()) as { id: string }).id;
}

async function closeSession(
  api: APIRequestContext,
  sessionId: string,
  summary: string,
): Promise<void> {
  const response = await api.post(`${API}/api/sessions/${sessionId}/close`, {
    data: { durationMin: 50, summary },
  });
  expect(response.status(), await response.text()).toBe(200);
}

async function createEntry(
  api: APIRequestContext,
  patientId: string,
  data: Record<string, unknown>,
): Promise<void> {
  const response = await api.post(`${API}/api/patients/${patientId}/entries`, { data });
  expect(response.status(), await response.text()).toBe(201);
}

/** <html lang="ar" dir="rtl">, aucun défilement horizontal, axe-core sans violation. */
async function expectRtlPage(page: Page): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.evaluate(() => document.fonts.ready);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'défilement horizontal').toBeLessThanOrEqual(0);
  expect(await page.locator('body').innerText()).not.toMatch(NON_LATIN_DIGITS);
  await expectNoAxeViolations(page);
}

/** Plus rien en chargement dans la zone donnée. */
async function settled(root: Locator): Promise<void> {
  await expect(root.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 20_000 });
}

/** Sens calculé et coupe d'un texte sur une ligne : la première lettre reste dans la boîte. */
async function cutOf(locator: Locator) {
  return locator.evaluate((el) => {
    const text = [...el.childNodes].find((node) => node.nodeType === Node.TEXT_NODE)!;
    const offset = text.textContent!.search(/\S/);
    const range = document.createRange();
    range.setStart(text, offset);
    range.setEnd(text, offset + 1);
    const firstLetter = range.getBoundingClientRect();
    const own = el.getBoundingClientRect();
    return {
      direction: getComputedStyle(el).direction,
      overflowing: el.scrollWidth > el.clientWidth,
      firstLetterInside: firstLetter.left >= own.left - 1 && firstLetter.right <= own.right + 1,
    };
  });
}

test.describe('dossier patient en /ar/', () => {
  let api: APIRequestContext;
  let context: BrowserContext;
  let page: Page;
  /** Dossier sans séance en cours (séance d'accueil seulement). */
  let quiet: string;
  /** Dossier avec une séance précédente clôturée et une séance en cours. */
  let busy: string;

  test.describe.configure({ mode: 'serial', timeout: 90_000 });

  test.beforeAll(async ({ browser }, testInfo) => {
    test.setTimeout(180_000);
    api = await playwrightRequest.newContext();
    const account = await createAccount(api, 'm16-15.dossier', 'psychologist');

    quiet = await createPatient(api, 'Nour A.');
    await waitForIntake(api, quiet);

    busy = await createPatient(api, LATIN_NAME);
    await waitForIntake(api, busy);
    // Séance précédente clôturée : compte rendu arabe et un point « Prochaine fois » (marqueur de la
    // convention, identique dans toutes les langues), relus par la colonne de contexte.
    const previous = await startSession(api, busy);
    await closeSession(api, previous, 'راجعنا مفكرة النوم.\n\nProchaine fois :\n– الحديث عن العمل');
    const current = await startSession(api, busy);
    // Noté pendant la séance en cours : un titre arabe, un titre latin long, une situation en cours.
    await createEntry(api, busy, {
      type: 'note',
      title: ARABIC_TITLE,
      body: 'نص الملاحظة.',
      sessionId: current,
    });
    await createEntry(api, busy, {
      type: 'note',
      title: LONG_LATIN_TITLE,
      body: 'Compte rendu.',
      sessionId: current,
    });
    await createEntry(api, busy, {
      type: 'situation',
      title: SITUATION_TITLE,
      occurred: { from: new Date(Date.now() - 20 * 86_400_000).toISOString() },
      sessionId: current,
    });

    // La colonne de contexte lit la projection « vue d'ensemble », qui peut être calculée en différé :
    // on attend que la situation y figure avant d'ouvrir le dossier.
    await expect
      .poll(
        async () => {
          const response = await api.get(`${API}/api/patients/${busy}/overview?window=90d`);
          if (response.status() !== 200) return [];
          const { activeSituations } = (await response.json()) as {
            activeSituations?: { title?: string }[];
          };
          return (activeSituations ?? []).map((situation) => situation.title);
        },
        { timeout: 30_000 },
      )
      .toContain(SITUATION_TITLE);

    // Contexte créé explicitement, réglages du projet : axe-core refuse browser.newPage().
    context = await browser.newContext({
      baseURL: testInfo.project.use.baseURL,
      locale: testInfo.project.use.locale,
      timezoneId: testInfo.project.use.timezoneId,
      viewport: DESKTOP,
    });
    page = await context.newPage();
    // Connexion en /fr/ (libellés connus), puis /ar/ : la session garde le bundle de l'URL.
    await signIn(page, account);
  });

  test.afterAll(async () => {
    await context?.close();
    await api?.dispose();
  });

  /** Le dossier en /ar/ : l'en-tête lu (nom en dir="auto", sens calculé de gauche à droite). */
  async function openFolder(patientId: string): Promise<void> {
    await page.goto(`/ar/patients/${patientId}`);
    const name = page.locator('pm-patient-header h1');
    await expect(name).toBeVisible({ timeout: 20_000 });
    await expect(name).toHaveAttribute('dir', 'auto');
    expect(await name.evaluate((el) => getComputedStyle(el).direction)).toBe('ltr');
    await settled(page.locator('main'));
  }

  test('dossier sans séance en cours', async () => {
    await openFolder(quiet);
    await expect(page.locator('pm-session-bar .session-bar')).toHaveCount(0);
    await expectRtlPage(page);
    await shoot(page, 'arabe-dossier-sans-seance');
  });

  /** L'onglet Séance du dossier en cours, colonne de contexte et lignes notées lues. */
  async function openSessionTab(): Promise<void> {
    await openFolder(busy);
    await expect(page).toHaveURL(new RegExp(`/ar/patients/${busy}/session$`));
    await expect(page.locator('pm-session-bar .session-bar')).toBeVisible();
    await expect(page.locator('pm-session-tab-page pm-noted-entries li')).toHaveCount(3, {
      timeout: 20_000,
    });
    await settled(page.locator('pm-session-context'));
  }

  test('dossier avec séance en cours : onglet Séance et colonne de contexte', async () => {
    await openSessionTab();
    const noted = page.locator('pm-session-tab-page pm-noted-entries');

    // Titres saisis dans leur sens (Q77) : l'arabe de droite à gauche, le latin de gauche à droite.
    const arabic = noted.locator('.name', { hasText: ARABIC_TITLE });
    await expect(arabic).toHaveAttribute('dir', 'auto');
    expect(await arabic.evaluate((el) => getComputedStyle(el).direction)).toBe('rtl');
    const latin = noted.locator('.name', { hasText: 'Entretien préalable' });
    await expect(latin).toHaveAttribute('dir', 'auto');
    expect(await latin.evaluate((el) => getComputedStyle(el).direction)).toBe('ltr');

    // Colonne de contexte : point prévu et situation dans leur sens.
    const side = page.locator('pm-session-context');
    const planned = side.locator('pm-planned-checklist label').first();
    await expect(planned).toHaveAttribute('dir', 'auto');
    expect(await planned.evaluate((el) => getComputedStyle(el).direction)).toBe('rtl');
    await expect(side.locator('.line bdi').first()).toBeVisible();

    // « Raccourcis dans le texte » : ni dates ni ressenti en /ar/ (Q81), préfixes et lien seulement.
    await expect(side.locator('.shortcuts .shortcut')).toHaveCount(5);
    // Préfixes en dir="auto" : « /evt » se lit de gauche à droite, comme dans le bloc de saisie.
    const evt = side.locator('.shortcuts .shortcut b').first();
    await expect(evt).toHaveAttribute('dir', 'auto');
    expect(await evt.evaluate((el) => getComputedStyle(el).direction)).toBe('ltr');
    const tokens = await side.locator('.shortcuts .shortcut b').allTextContents();
    expect(tokens.slice(0, 4).map((token) => token.trim())).toEqual([
      '/evt',
      '/sit',
      '/med',
      '/note',
    ]);

    await expectRtlPage(page);
    await shoot(page, 'arabe-dossier-seance-bureau');
  });

  test('dossier avec séance en cours à 390 px : un titre latin coupé garde son début', async () => {
    await page.setViewportSize(PHONE);
    try {
      await openSessionTab();
      const latin = page
        .locator('pm-session-tab-page pm-noted-entries .name', { hasText: 'Entretien préalable' })
        .first();
      expect(await cutOf(latin)).toEqual({
        direction: 'ltr',
        overflowing: true,
        firstLetterInside: true,
      });
      await expectRtlPage(page);
      await shoot(page, 'arabe-dossier-seance-telephone');
    } finally {
      await page.setViewportSize(DESKTOP);
    }
  });

  test('aide des raccourcis : touches latines en dir="ltr"', async () => {
    await openFolder(busy);
    await page.keyboard.press('?');
    const dialog = page.locator('[role="dialog"]:has(pm-shortcuts-help-panel)');
    await expect(dialog).toBeVisible();
    const keys = dialog.locator('kbd');
    expect(await keys.count()).toBeGreaterThan(0);
    for (const key of await keys.all()) {
      await expect(key).toHaveAttribute('dir', 'ltr');
    }
    // Touches alternatives (1 2 3) dans le sens de la page, la première à droite, séparées ;
    // combinaison (Ctrl + B) de gauche à droite. Positions comparées entre elles seulement.
    const alternatives = await dialog
      .locator('th.keys > span:not([dir])')
      .filter({ has: page.locator('kbd + kbd') })
      .first()
      .locator('kbd')
      .evaluateAll((keys) => keys.map((key) => key.getBoundingClientRect().toJSON() as DOMRect));
    expect(alternatives.length).toBeGreaterThan(1);
    for (let i = 1; i < alternatives.length; i++) {
      const gap = alternatives[i - 1].x - (alternatives[i].x + alternatives[i].width);
      expect(gap, 'écart entre deux touches').toBeGreaterThanOrEqual(3);
    }
    const combo = await dialog
      .locator('th.keys > span[dir="ltr"]')
      .first()
      .locator('kbd')
      .evaluateAll((keys) => keys.map((key) => key.getBoundingClientRect().x));
    expect(combo.length).toBeGreaterThan(1);
    expect(combo).toEqual([...combo].sort((a, b) => a - b));
    // Panneau latéral du côté de la fin de ligne : collé au bord gauche de la fenêtre.
    const panel = (await dialog.boundingBox())!;
    expect(panel.x).toBeLessThanOrEqual(1);
    await expectRtlPage(page);
    await shoot(page, 'arabe-dossier-aide-raccourcis');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('panneau de clôture : champs libres dans leur sens, compte rendu envoyé tel quel', async () => {
    await openSessionTab();
    await page.locator('pm-session-bar button.close-session').click();
    const dialog = page.locator('[role="dialog"]:has(pm-close-session-panel)');
    await expect(dialog).toBeVisible();
    await settled(dialog);

    // Sous-titre : le nom latin isolé dans un <bdi> (pm-side-panel, `subject`), jamais « .Lou P ».
    const subject = dialog.locator('.subtitle bdi');
    await expect(subject).toHaveText(LATIN_NAME);
    expect(await subject.evaluate((el) => getComputedStyle(el).direction)).toBe('ltr');
    const summary = dialog.locator('textarea');
    await expect(summary).toHaveAttribute('dir', 'auto');
    // Vide, il prend le sens de la page (placeholder=" ", règle du thème arabe) ; rempli, le sien.
    await expect(summary).toHaveValue('');
    expect(await summary.evaluate((el) => getComputedStyle(el).direction)).toBe('rtl');
    await expect(dialog.locator('input.duration')).toHaveAttribute('dir', 'ltr');
    await expect(dialog.locator('#next-time-new')).toHaveAttribute('dir', 'auto');
    await expect(dialog.locator('.hints kbd')).toHaveAttribute('dir', 'ltr');
    await summary.fill(ARABIC_SUMMARY);
    expect(await summary.evaluate((el) => getComputedStyle(el).direction)).toBe('rtl');
    await expectRtlPage(page);
    await shoot(page, 'arabe-dossier-panneau-cloture');

    const closed = page.waitForResponse(
      (r) => r.request().method() === 'POST' && /\/api\/sessions\/[^/]+\/close$/.test(r.url()),
    );
    await dialog.locator('.footer button.session').click();
    const response = await closed;
    expect(response.status(), await response.text()).toBe(200);
    const sent = response.request().postDataJSON() as { summary?: string };
    expect(sent.summary).toBe(ARABIC_SUMMARY);
    expect(sent.summary).not.toMatch(ISOLATES);
    await expect(dialog).toBeHidden();
  });
});
