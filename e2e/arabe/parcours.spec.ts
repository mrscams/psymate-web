import {
  APIRequestContext,
  Browser,
  BrowserContext,
  expect,
  Locator,
  Page,
  request as playwrightRequest,
  Response,
  test,
  TestInfo,
} from '@playwright/test';

import { createAccount, signIn } from '../preferences/accounts';
import { TestAccount } from '../support/accounts';
import { expectNoAxeViolations } from '../support/axe';
import { shoot } from '../support/captures';
import { API } from '../support/env';

// M16-29, ouverture de l'arabe (G Q80) : les parcours de B3 enchaînés en /ar/ (connexion, créer un
// patient, ouvrir une séance et saisir, lier deux entrées, timeline, recherche, vue d'ensemble,
// Profil 360), l'annuaire public et la fiche d'un praticien, puis le changement de langue des
// préférences (fr → ar, déconnexion et reconnexion en ar, retour au français et à l'anglais).
// Les écrans un à un, mesurés en détail, sont dans les autres specs de e2e/arabe ; celle-ci suit le
// parcours d'un praticien de bout en bout, axe-core à chaque écran, chaque écriture vérifiée sur le
// corps envoyé (docs/contract/openapi.yaml) et relue par l'API. Rôles, ids et structure plutôt
// que libellés : les traductions arabes seront relues et peuvent changer. Contre l'API locale (seed
// small, Mailpit), jamais de mock du backend ; comptes jetables, données créées par le test.
//
// Trois blocs indépendants, pour qu'un échec n'en cache pas d'autres : le dossier (mode série, une
// page partagée, chaque étape partant de la précédente), l'annuaire (sans session) et la langue.

/** Nom affiché saisi en arabe à la création du patient. */
const PATIENT_NAME = 'سلمى بن علي';
/** Événement saisi en arabe ; le mot latin permet la recherche (plein texte « en français », contrat). */
const SEARCH_WORD = 'entretien';
const EVENT_TITLE = `اجتماع ${SEARCH_WORD} مع المدير`;
const FEELING_TEXT = 'ليلة صعبة قبل الاجتماع';
const NOTE_TEXT = 'ملاحظة بعد الاجتماع';
const PROFILE_TITLE = 'العودة إلى العزف على البيانو';
const PROFILE_DETAIL = 'مشروع منذ الصيف';
const VIEWPORT = { width: 1440, height: 900 };
/** Assez pour un Retry-After (jusqu'à 60 s) suivi du rejeu automatique d'un GET public plafonné. */
const API_WAIT = 75_000;

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

/** <html lang> et <html dir> d'une page en français ou en anglais, axe-core sans violation. */
async function expectLtrPage(page: Page, locale: 'fr' | 'en'): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expectNoAxeViolations(page);
}

/** Plus aucun bloc en chargement dans `root`. */
async function settled(root: Locator): Promise<void> {
  await expect(root.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 20_000 });
}

/** Contexte du navigateur aux réglages du projet (adresse, langue, fuseau) : jamais newPage() seul. */
async function projectContext(browser: Browser, testInfo: TestInfo): Promise<BrowserContext> {
  return browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    locale: testInfo.project.use.locale,
    timezoneId: testInfo.project.use.timezoneId,
    viewport: VIEWPORT,
  });
}

/** Connexion par l'écran, par les ids du formulaire (aucun libellé). */
async function signInByIds(page: Page, locale: string, account: TestAccount): Promise<void> {
  await page.goto(`/${locale}/connexion`);
  await page.locator('#login-email').fill(account.email);
  await page.locator('#login-password').fill(account.password);
  await page.locator('button[type="submit"]').click();
}

test.describe('parcours B3 en /ar/ : dossier patient', () => {
  let api: APIRequestContext;
  let account: TestAccount;
  let context: BrowserContext;
  let page: Page;
  let patientId: string;
  let eventId: string;
  let feelingId: string;
  let noteId: string;

  test.describe.configure({ mode: 'serial', timeout: 90_000 });

  test.beforeAll(async ({ browser }, testInfo) => {
    test.setTimeout(180_000);
    api = await playwrightRequest.newContext();
    account = await createAccount(api, 'm16-29.parcours', 'psychologist');
    // Compte en arabe (contrat 0.16.0 : locale fr | en | ar) : la connexion depuis /ar/ y reste.
    const preferences = await api.patch(`${API}/api/me/preferences`, { data: { locale: 'ar' } });
    expect(preferences.status(), await preferences.text()).toBe(200);
    expect(((await preferences.json()) as { locale: string }).locale).toBe('ar');
    context = await projectContext(browser, testInfo);
    page = await context.newPage();
  });

  test.afterAll(async () => {
    await context?.close();
    await api?.dispose();
  });

  /** Repères du bloc de saisie, par la structure (aucun libellé). */
  function block() {
    const root = page.locator('pm-capture-block');
    return {
      root,
      input: root.locator('#pm-capture-input'),
      chip: (type: string) => root.locator(`.types .tchip[data-type="${type}"]`),
      emotion: root.locator('#pm-capture-emotion'),
      options: root.locator('pm-capture-emotion li[role="option"]'),
      slider: root.locator('#pm-capture-intensity'),
      rail: root.locator('pm-capture-links .tchip'),
      placed: root.locator('pm-capture-links .tchip.pressed'),
      save: root.locator('button.save'),
    };
  }

  function isEntryCreate(response: Response): boolean {
    return (
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === `/api/patients/${patientId}/entries`
    );
  }

  /** Enregistre la saisie par le bouton ; rend le corps envoyé et l'id créé (201). */
  async function saveCapture(): Promise<{ sent: Record<string, unknown>; id: string }> {
    const created = page.waitForResponse(isEntryCreate);
    await block().save.click();
    const response = await created;
    expect(response.status(), await response.text()).toBe(201);
    await expect(block().input).toHaveValue('');
    return {
      sent: response.request().postDataJSON() as Record<string, unknown>,
      id: ((await response.json()) as { id: string }).id,
    };
  }

  /** Une flèche à la fois jusqu'à `target` (en RTL, flèche gauche augmente), chaque pas attendu. */
  async function intensityTo(target: number): Promise<void> {
    const slider = block().slider;
    await slider.focus();
    await page.keyboard.press('Home');
    await expect.poll(() => slider.getAttribute('aria-valuenow')).toBe('0');
    for (let value = 0; value < target; value++) {
      await page.keyboard.press('ArrowLeft');
      await expect.poll(() => slider.getAttribute('aria-valuenow')).toBe(String(value + 1));
    }
  }

  test('connexion en /ar/ : la liste des patients, de droite à gauche', async () => {
    await signInByIds(page, 'ar', account);
    await expect(page).toHaveURL(/\/ar\/patients$/);
    await expect(page.locator('main h1').first()).toBeVisible();
    await settled(page.locator('main'));
    await expectRtlPage(page);
    await shoot(page, 'arabe-parcours-01-patients');
  });

  test('créer un patient : N, nom arabe, Ctrl+Entrée, dossier ouvert', async () => {
    await expect(async () => {
      await page.keyboard.press('n');
      await expect(page).toHaveURL(/\/ar\/patients\/nouveau$/, { timeout: 2_000 });
    }).toPass({ timeout: 15_000 });
    const displayName = page.locator('input[formcontrolname="displayName"]');
    await expect(displayName).toBeVisible();
    await displayName.fill(PATIENT_NAME);
    expect(await displayName.evaluate((el) => getComputedStyle(el).direction)).toBe('rtl');
    await expectRtlPage(page);
    await shoot(page, 'arabe-parcours-02-nouveau-patient');

    const created = page.waitForResponse(
      (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/patients',
    );
    await displayName.press('Control+Enter');
    const response = await created;
    expect(response.status(), await response.text()).toBe(201);
    // CreatePatientRequest : le nom affiché part tel que saisi.
    expect(response.request().postDataJSON()).toMatchObject({ displayName: PATIENT_NAME });
    patientId = ((await response.json()) as { id: string }).id;
    await expect(page).toHaveURL(new RegExp(`/ar/patients/${patientId}$`));
    const name = page.locator('pm-patient-header h1');
    await expect(name).toContainText(PATIENT_NAME);
    expect(await name.evaluate((el) => getComputedStyle(el).direction)).toBe('rtl');
    // Relu par l'API.
    const read = await api.get(`${API}/api/patients/${patientId}`);
    expect(read.status(), await read.text()).toBe(200);
    expect(((await read.json()) as { displayName: string }).displayName).toBe(PATIENT_NAME);
    await settled(page.locator('main'));
    await expectRtlPage(page);
    await shoot(page, 'arabe-parcours-03-dossier-vide');
  });

  test('ouvrir une séance, saisir un événement puis un ressenti lié à lui (rail « Lié à »)', async () => {
    // Séance d'accueil créée de façon asynchrone par l'API : attendue avant d'en démarrer une.
    await expect
      .poll(
        async () => (await api.get(`${API}/api/patients/${patientId}/sessions/current`)).status(),
        { timeout: 15_000 },
      )
      .toBe(200);
    const started = page.waitForResponse(
      (r) =>
        r.request().method() === 'POST' &&
        new URL(r.url()).pathname === `/api/patients/${patientId}/sessions/start`,
    );
    await page.locator('pm-patient-header button.start-session').click();
    expect((await started).status()).toBe(201);
    await expect(page).toHaveURL(new RegExp(`/ar/patients/${patientId}/session$`));
    const b = block();
    await expect(b.input).toBeVisible();
    await settled(b.root);

    // Événement : titre arabe (CreateEntryRequest : event = title).
    await b.input.fill(EVENT_TITLE);
    await b.chip('event').click();
    await expect(b.chip('event')).toHaveAttribute('aria-pressed', 'true');
    expect(await b.input.evaluate((el) => getComputedStyle(el).direction)).toBe('rtl');
    await expectRtlPage(page);
    await shoot(page, 'arabe-parcours-04-saisie-evenement');
    const event = await saveCapture();
    expect(event.sent).toMatchObject({ type: 'event', title: EVENT_TITLE, status: 'final' });
    eventId = event.id;

    // Ressenti : émotion cherchée par son code, intensité 6 au clavier, lié à l'événement d'un clic
    // dans le rail (B3 flux 3, étape 4) ; l'événement déclenche le ressenti (matrice des liens).
    await b.chip('feeling').click();
    await expect(b.chip('feeling')).toHaveAttribute('aria-pressed', 'true');
    await b.emotion.click();
    await b.emotion.fill('anxiety');
    const found = b.options.and(b.root.locator('li:not(.create)'));
    await expect(found).toHaveCount(1);
    await found.click();
    await intensityTo(6);
    await b.input.fill(FEELING_TEXT);
    await expect(b.chip('feeling')).toHaveAttribute('aria-pressed', 'true');
    // Le rail est relu après l'enregistrement de l'événement.
    const target = b.rail.filter({ hasText: EVENT_TITLE });
    await expect(target).toBeVisible({ timeout: 20_000 });
    await target.click();
    await expect(b.placed).toHaveCount(1);
    await expect(b.placed).toContainText(EVENT_TITLE);
    await settled(b.root);
    await expectRtlPage(page);
    await shoot(page, 'arabe-parcours-05-saisie-ressenti-lie');
    const feeling = await saveCapture();
    expect(feeling.sent).toMatchObject({
      type: 'feeling',
      status: 'final',
      body: FEELING_TEXT,
      feeling: { emotionCode: 'anxiety', intensity: 6 },
      links: [{ targetId: eventId, linkType: 'triggers', direction: 'incoming' }],
    });
    feelingId = feeling.id;

    // Relu par l'API : le ressenti et son lien (source = l'événement, forme active).
    const read = await api.get(`${API}/api/entries/${feelingId}`);
    expect(read.status(), await read.text()).toBe(200);
    expect(await read.json()).toMatchObject({
      type: 'feeling',
      body: FEELING_TEXT,
      feeling: { emotionCode: 'anxiety', intensity: 6 },
    });
    const links = await api.get(`${API}/api/entries/${feelingId}/links`);
    expect(links.status(), await links.text()).toBe(200);
    expect(await links.json()).toEqual([
      expect.objectContaining({ sourceId: eventId, targetId: feelingId, linkType: 'triggers' }),
    ]);
    // Les deux entrées notées pendant la séance (onglet Séance).
    await expect(page.locator('pm-session-tab-page pm-noted-entries li')).toHaveCount(2, {
      timeout: 20_000,
    });
    await expectRtlPage(page);
    await shoot(page, 'arabe-parcours-06-seance');
  });

  test('lier deux entrées existantes : éditeur de lien, cible choisie, type de la matrice', async () => {
    // Une note saisie dans le bloc, puis liée à l'événement par l'éditeur de lien (B3 flux 4).
    const b = block();
    await b.input.fill(NOTE_TEXT);
    await expect(b.chip('note')).toHaveAttribute('aria-pressed', 'true');
    const note = await saveCapture();
    expect(note.sent).toMatchObject({ type: 'note', body: NOTE_TEXT, status: 'final' });
    noteId = note.id;

    // La liste des cibles de l'éditeur vient de la recherche du dossier, une projection : on attend
    // qu'elle connaisse la note et l'événement.
    await expect
      .poll(
        async () => {
          const response = await api.get(`${API}/api/patients/${patientId}/search`);
          if (response.status() !== 200) return [];
          const { items } = (await response.json()) as { items: { entryId: string }[] };
          return items.map((item) => item.entryId);
        },
        { timeout: 30_000 },
      )
      .toEqual(expect.arrayContaining([eventId, noteId]));

    await page.goto(`/ar/patients/${patientId}?link=${noteId}`);
    const dialog = page.locator('[role="dialog"]:has(pm-link-editor-panel)');
    await expect(dialog).toBeVisible();
    await settled(dialog);
    await dialog.locator(`input[type="radio"][value="${eventId}"]`).check();
    // Note → événement : « fait suite à » (follows), admis dans ce sens par la matrice.
    const follows = dialog.locator('.editor pm-link-type-chips [data-code="follows"]');
    await expect(follows).not.toHaveAttribute('aria-disabled', 'true');
    await follows.click();
    await expect(follows).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.locator('.reading .sentence')).toHaveCSS('direction', 'rtl');
    await expectRtlPage(page);
    await shoot(page, 'arabe-parcours-07-editeur-lien', false);

    const created = page.waitForResponse(
      (r) =>
        r.request().method() === 'POST' &&
        new URL(r.url()).pathname === `/api/entries/${noteId}/links`,
    );
    await dialog.locator('.actions button.primary').click();
    const response = await created;
    expect(response.status(), await response.text()).toBe(201);
    // EntryLinkRequest du contrat : cible et type ; sens vu depuis la note (source par défaut).
    expect(response.request().postDataJSON()).toMatchObject({
      targetId: eventId,
      linkType: 'follows',
    });
    await expect(dialog).toBeHidden();
    await expect(page).not.toHaveURL(/link=/);
    const links = await api.get(`${API}/api/entries/${noteId}/links`);
    expect(links.status(), await links.text()).toBe(200);
    expect(await links.json()).toEqual([
      expect.objectContaining({ sourceId: noteId, targetId: eventId, linkType: 'follows' }),
    ]);
    await expectRtlPage(page);
  });

  test('timeline : les entrées saisies, titre arabe dans son sens', async () => {
    await page.locator('pm-patient-header nav.tabs a[href$="/timeline"]').click();
    await expect(page).toHaveURL(new RegExp(`/ar/patients/${patientId}/timeline`));
    await expect(page.locator('[role="toolbar"]')).toBeVisible();
    await settled(page.locator('main'));
    const title = page.locator('pm-timeline-card .title', { hasText: EVENT_TITLE });
    await expect(title).toBeVisible({ timeout: 20_000 });
    await expect(title).toHaveAttribute('dir', 'auto');
    expect(await title.evaluate((el) => getComputedStyle(el).direction)).toBe('rtl');
    await expect(
      page.locator(`pm-timeline-card article[data-entry-id="${feelingId}"]`),
    ).toBeVisible();
    await expect(page.locator(`pm-timeline-card article[data-entry-id="${noteId}"]`)).toBeVisible();
    await expectRtlPage(page);
    await shoot(page, 'arabe-parcours-08-timeline');
  });

  test('recherche : / depuis la timeline, mot latin d’un titre arabe, extrait surligné', async () => {
    // La recherche est une projection : on attend qu'elle trouve l'événement par le mot cherché.
    await expect
      .poll(
        async () => {
          const response = await api.get(`${API}/api/patients/${patientId}/search`, {
            params: { q: SEARCH_WORD },
          });
          if (response.status() !== 200) return [];
          const { items } = (await response.json()) as { items: { entryId: string }[] };
          return items.map((item) => item.entryId);
        },
        { timeout: 30_000 },
      )
      .toContain(eventId);

    await page.keyboard.press('/');
    const bar = page.locator('#app-bar-search');
    await expect(bar).toBeFocused();
    await page.keyboard.type(SEARCH_WORD);
    await expect(page).toHaveURL(
      new RegExp(`/ar/patients/${patientId}/search\\?q=${SEARCH_WORD}$`),
    );
    const item = page.locator(`pm-search-results li[data-entry-id="${eventId}"]`);
    await expect(item).toBeVisible({ timeout: 20_000 });
    await expect(item.locator('mark').first()).toBeVisible();
    expect(
      await item.locator('button.title').evaluate((el) => getComputedStyle(el).direction),
    ).toBe('rtl');
    await expect(page.locator('.results[aria-busy="true"]')).toHaveCount(0, { timeout: 20_000 });
    await expectRtlPage(page);
    await shoot(page, 'arabe-parcours-09-recherche');
  });

  test('vue d’ensemble : la projection relue, la courbe des ressentis dessinée', async () => {
    // Projection calculée en différé : on attend qu'elle compte le ressenti saisi.
    await expect
      .poll(
        async () => {
          const response = await api.get(`${API}/api/patients/${patientId}/overview`, {
            params: { window: '90d' },
          });
          if (response.status() !== 200) return 0;
          const { feelings } = (await response.json()) as {
            feelings?: { series?: { emotionCode: string; count: number }[] };
          };
          return feelings?.series?.find((serie) => serie.emotionCode === 'anxiety')?.count ?? 0;
        },
        { timeout: 30_000 },
      )
      .toBe(1);
    // En séance, la vue d'ensemble s'ouvre par son lien, à côté des onglets (04b).
    await page.locator('pm-patient-header a.overview-link').click();
    await expect(page).toHaveURL(new RegExp(`/ar/patients/${patientId}$`));
    await settled(page.locator('main'));
    await expect(page.locator('pm-overview-feelings-chart svg path').first()).toBeAttached({
      timeout: 20_000,
    });
    await expectRtlPage(page);
    await shoot(page, 'arabe-parcours-10-vue-ensemble');
  });

  test('Profil 360 : état vide, une information ajoutée par le panneau, relue', async () => {
    await page.locator('pm-patient-header nav.tabs a[href$="/profile"]').click();
    await expect(page).toHaveURL(new RegExp(`/ar/patients/${patientId}/profile`));
    await expect(page.locator('pm-profile360-page .empty pm-state')).toBeVisible();
    await expectRtlPage(page);
    await shoot(page, 'arabe-parcours-11-profil360-vide');

    await page.locator('pm-profile-add a').first().click();
    const dialog = page.locator('[role="dialog"]').filter({ has: page.locator('pm-side-panel') });
    await expect(dialog).toBeVisible();
    await dialog.locator('#field-title').fill(PROFILE_TITLE);
    await dialog.locator('#field-detail').fill(PROFILE_DETAIL);
    await expectRtlPage(page);
    const created = page.waitForResponse(
      (r) =>
        r.request().method() === 'POST' &&
        new URL(r.url()).pathname === `/api/patients/${patientId}/profile-items`,
    );
    await dialog.locator('.btn-primary').click();
    const response = await created;
    expect(response.status(), await response.text()).toBe(201);
    const sent = response.request().postDataJSON() as Record<string, unknown>;
    expect(sent).toMatchObject({ title: PROFILE_TITLE, detail: PROFILE_DETAIL });
    expect(['history', 'family', 'health', 'values_goals']).toContain(sent['category']);
    await expect(dialog).toHaveCount(0);
    // Relecture après écriture : l'information apparaît dans sa rubrique, dans son sens.
    const row = page.locator('pm-profile-rubric li .t', { hasText: PROFILE_TITLE });
    await expect(row).toBeVisible({ timeout: 20_000 });
    expect(await row.evaluate((el) => getComputedStyle(el).direction)).toBe('rtl');
    const items = await api.get(`${API}/api/patients/${patientId}/profile-items`);
    expect(items.status(), await items.text()).toBe(200);
    expect(JSON.stringify(await items.json())).toContain(PROFILE_TITLE);
    await expectRtlPage(page);
    await shoot(page, 'arabe-parcours-12-profil360');
  });
});

test.describe('parcours B3 en /ar/ : annuaire public et fiche d’un praticien', () => {
  test.describe.configure({ timeout: 180_000 });

  /** Contenu chargé par l'API publique ; un 429 rejoué ne suffit pas : test sauté, pas échoué. */
  async function loaded(page: Page, content: Locator): Promise<void> {
    const failed = page.locator('pm-state .state.error, .rate-limited');
    await expect(content.or(failed).first()).toBeVisible({ timeout: API_WAIT });
    if (!(await content.first().isVisible())) {
      await expect(content.first())
        .toBeVisible({ timeout: API_WAIT })
        .catch(() =>
          test.skip(true, 'API publique plafonnée (429) ou indisponible : écran non chargé'),
        );
    }
  }

  test('annuaire, puis la fiche du premier praticien, par son nom', async ({
    browser,
  }, testInfo) => {
    const context = await projectContext(browser, testInfo);
    const page = await context.newPage();
    try {
      await page.goto('/ar/annuaire');
      const card = page.locator('pm-practitioner-card').first();
      await loaded(page, card);
      await expectRtlPage(page);
      await shoot(page, 'arabe-parcours-13-annuaire');

      const link = card.locator('.name-link');
      const slug = new URL((await link.getAttribute('href'))!, page.url()).pathname
        .split('/')
        .pop();
      await link.click();
      await expect(page).toHaveURL(new RegExp(`/ar/praticiens/${slug}$`));
      await loaded(page, page.locator('#practitioner-name'));
      await expectRtlPage(page);
      await shoot(page, 'arabe-parcours-14-fiche-praticien');
    } finally {
      await context.close();
    }
  });
});

test.describe('changement de langue des préférences : fr → ar → reconnexion → fr, en', () => {
  test.describe.configure({ timeout: 150_000 });

  const select = (page: Page) => page.locator('select[aria-labelledby="locale-label"]');

  /** La page des préférences dans une langue, le choix de langue lu. */
  async function openPreferences(page: Page, locale: string, expected: string): Promise<void> {
    await page.goto(`/${locale}/mon-compte/preferences`);
    await expect(select(page)).toBeVisible({ timeout: 20_000 });
    await expect(select(page)).toHaveValue(expected);
  }

  /**
   * Choisit une langue : PATCH {locale} (corps du contrat), puis rechargement sur la même route
   * dans le bundle de cette langue. Le corps de la réponse n'est pas lu : l'application part aussitôt
   * vers l'autre bundle (location.assign) ; la valeur du serveur est relue par le choix affiché
   * après rechargement et par le GET final.
   */
  async function choose(page: Page, locale: 'fr' | 'en' | 'ar'): Promise<void> {
    const patched = page.waitForResponse(
      (r) =>
        r.request().method() === 'PATCH' && new URL(r.url()).pathname === '/api/me/preferences',
    );
    await select(page).selectOption(locale);
    const response = await patched;
    expect(response.status()).toBe(200);
    expect(response.request().postDataJSON()).toEqual({ locale });
    await expect(page).toHaveURL(new RegExp(`/${locale}/mon-compte/preferences$`));
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(select(page)).toHaveValue(locale);
  }

  test('barre d’application et préférences ; la langue suit la reconnexion', async ({
    browser,
    request,
  }, testInfo) => {
    const account = await createAccount(request, 'm16-29.langue', 'psychologist');
    const context = await projectContext(browser, testInfo);
    const page = await context.newPage();
    try {
      await signIn(page, account);

      // Barre d'application : les deux autres langues, chacune écrite dans la sienne, lang et dir.
      const bar = page.locator('pm-app-bar nav.locale a');
      const linksOf = () =>
        bar.evaluateAll((anchors) =>
          anchors.map((a) => [
            a.getAttribute('hreflang'),
            a.getAttribute('lang'),
            a.getAttribute('dir'),
            new URL((a as HTMLAnchorElement).href).pathname,
          ]),
        );
      await expect(bar).toHaveCount(2);
      expect(await linksOf()).toEqual([
        ['en', 'en', 'ltr', '/en/patients'],
        ['ar', 'ar', 'rtl', '/ar/patients'],
      ]);
      await expect(bar.nth(1)).toHaveText('العربية');
      await expectLtrPage(page, 'fr');
      // Le lien mène à la même route en arabe, sans toucher à la préférence.
      await bar.nth(1).click();
      await expect(page).toHaveURL(/\/ar\/patients$/);
      await expect(page.locator('main h1').first()).toBeVisible();
      await expect(bar).toHaveCount(2);
      expect(await linksOf()).toEqual([
        ['fr', 'fr', 'ltr', '/fr/patients'],
        ['en', 'en', 'ltr', '/en/patients'],
      ]);
      await expectRtlPage(page);

      // Préférences en /fr/ : trois langues, l'arabe écrit en arabe, lang="ar" et dir="rtl".
      await openPreferences(page, 'fr', 'fr');
      const options = await select(page)
        .locator('option')
        .evaluateAll((list) =>
          list.map((option) => [
            (option as HTMLOptionElement).value,
            option.getAttribute('lang'),
            option.getAttribute('dir'),
          ]),
        );
      expect(options).toEqual([
        ['fr', null, null],
        ['en', null, null],
        ['ar', 'ar', 'rtl'],
      ]);
      await expect(select(page).locator('option[value="ar"]')).toHaveText('العربية');
      await expectLtrPage(page, 'fr');

      // fr → ar : enregistré, rechargé sous /ar/ sur la même route.
      await choose(page, 'ar');
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await expectRtlPage(page);
      await shoot(page, 'arabe-parcours-15-preferences-arabe');

      // Déconnexion, puis reconnexion depuis la page française : l'application revient en /ar/.
      await page.locator('pm-app-bar button.avatar').click();
      await page.locator('.mat-mdc-menu-panel button.logout').click();
      await expect(page).toHaveURL(/\/ar\/connexion/);
      await expectRtlPage(page);
      await signInByIds(page, 'fr', account);
      await expect(page).toHaveURL(/\/ar\/patients$/, { timeout: 20_000 });
      await expect(page.locator('main h1').first()).toBeVisible();
      await expectRtlPage(page);

      // Depuis /ar/ : retour au français, puis l'anglais, puis l'arabe et l'anglais de nouveau.
      await openPreferences(page, 'ar', 'ar');
      await choose(page, 'fr');
      await expectLtrPage(page, 'fr');
      await choose(page, 'en');
      await expectLtrPage(page, 'en');
      await choose(page, 'ar');
      await expectRtlPage(page);
      await choose(page, 'en');
      await expectLtrPage(page, 'en');
      // Relue par l'API : la dernière langue choisie.
      const read = await page.request.get('/api/me/preferences');
      expect(read.status(), await read.text()).toBe(200);
      expect(((await read.json()) as { locale: string }).locale).toBe('en');
    } finally {
      await context.close();
    }
  });
});
