import { APIRequestContext, APIResponse, expect, Page, Response, test } from '@playwright/test';

import { createAccount, signIn } from '../preferences/accounts';
import { expectNoAxeViolations } from '../support/axe';

// B3 flux 3, barre de commande (M6-02, B5 alternative A, fiche 05 état A) : contre l'API locale
// (seed small, Mailpit), jamais de mock du backend. Chaque test crée son compte et son patient.

const API = 'http://localhost:8080';

interface LinkDto {
  sourceId: string;
  targetId: string;
  linkType: string;
}

async function ok<T>(response: Promise<APIResponse>): Promise<T> {
  const res = await response;
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
  return (res.status() === 204 ? undefined : await res.json()) as T;
}

async function createPatient(api: APIRequestContext, displayName: string): Promise<string> {
  return (await ok<{ id: string }>(api.post(`${API}/api/patients`, { data: { displayName } }))).id;
}

/** La séance d'accueil est créée de façon asynchrone après le patient : on l'attend, puis on démarre. */
async function startSession(api: APIRequestContext, patientId: string): Promise<void> {
  await expect
    .poll(
      async () => (await api.get(`${API}/api/patients/${patientId}/sessions/current`)).status(),
      { timeout: 10_000 },
    )
    .toBe(200);
  await ok(
    api.post(`${API}/api/patients/${patientId}/sessions/start`, {
      data: { modality: 'in_person' },
    }),
  );
}

async function createEntry(
  api: APIRequestContext,
  patientId: string,
  data: Record<string, unknown>,
): Promise<string> {
  return (await ok<{ id: string }>(api.post(`${API}/api/patients/${patientId}/entries`, { data })))
    .id;
}

function isCreate(response: Response, patientId: string): boolean {
  return (
    response.request().method() === 'POST' &&
    new URL(response.url()).pathname === `/api/patients/${patientId}/entries`
  );
}

function isOverview(response: Response, patientId: string): boolean {
  return (
    response.request().method() === 'GET' &&
    new URL(response.url()).pathname === `/api/patients/${patientId}/overview`
  );
}

function bar(page: Page) {
  const panel = page.locator('pm-command-bar .panel');
  return {
    input: page.getByRole('textbox', { name: 'Noter quelque chose' }),
    panel,
    line: panel.locator('pm-capture-preview .line'),
    warnings: panel.locator('pm-capture-preview li.warning'),
    rail: panel.locator('fieldset.rail'),
    proposal: panel.getByRole('group', { name: /Créer l'émotion personnalisée/ }),
    alert: page.locator('pm-command-bar p.alert[role="alert"]'),
  };
}

/** Panneau ouvert et données lues (vocabulaire, rail) : axe peut mesurer. */
async function settled(page: Page): Promise<void> {
  await expect(bar(page).panel).toBeVisible();
  await expect(bar(page).panel.locator('[aria-busy="true"]')).toHaveCount(0);
}

async function openFolder(page: Page, patientId: string, name: string): Promise<void> {
  await page.goto(`/fr/patients/${patientId}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
}

test.describe('barre de commande', () => {
  test.describe.configure({ timeout: 90_000 });

  test('chronométré : « anx 8 n’a pas dormi > entretien » + Entrée → ressenti lié créé en moins de 12 s au clavier', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'm6-02.chrono', 'psychologist');
    const patientId = await createPatient(request, 'Marie D.');
    await startSession(request, patientId);
    const eventId = await createEntry(request, patientId, {
      type: 'event',
      title: 'Entretien annuel',
    });
    await signIn(page, account);
    await openFolder(page, patientId, 'Marie D.');
    await expect(page.locator('pm-patient-header .session-text')).toContainText('en cours');
    const b = bar(page);

    // Lecture après écriture : une lecture de la vue d'ensemble lancée APRÈS la réponse du POST
    // (horloge du navigateur : début de la requête + arrivée de la réponse).
    let postedAt = Number.POSITIVE_INFINITY;
    const created = page.waitForResponse((r) => {
      if (!isCreate(r, patientId)) return false;
      const timing = r.request().timing();
      postedAt = timing.startTime + timing.responseStart;
      return true;
    });
    const reread = page.waitForResponse(
      (r) => isOverview(r, patientId) && r.request().timing().startTime >= postedAt,
    );
    const started = Date.now();
    await b.input.focus();
    // Frappe à 100 ms par touche (un praticien rapide), pas l'injection instantanée du navigateur.
    await page.keyboard.type("anx 8 n'a pas dormi > entretien", { delay: 100 });
    // L'aperçu interprété avant de valider (B5 : aucune erreur silencieuse).
    await expect(b.line).toContainText('Ressenti · Anxiété 8/10');
    await expect(b.line).toContainText('lié à Événement « Entretien annuel »');
    await page.keyboard.press('Enter');
    const response = await created;
    await expect(b.input).toHaveValue('');
    const elapsed = Date.now() - started;

    console.log(`[M6-02] ressenti lié saisi au clavier dans la barre en ${elapsed} ms`);
    test.info().annotations.push({ type: 'durée de saisie (ms)', description: String(elapsed) });
    expect(elapsed).toBeLessThan(12_000);

    expect(response.status(), await response.text()).toBe(201);
    const body = response.request().postDataJSON() as Record<string, unknown>;
    expect(body).toEqual({
      type: 'feeling',
      visibility: 'clinical',
      feeling: { emotionCode: 'anxiety', intensity: 8 },
      body: "n'a pas dormi",
      status: 'final',
      links: [{ targetId: eventId, linkType: 'triggers', direction: 'incoming' }],
    });
    expect(JSON.stringify(body)).not.toMatch(/authorType|submissionId/);
    const feelingId = ((await response.json()) as { id: string }).id;
    await expect(page.getByText('Entrée enregistrée.').last()).toBeVisible();
    // B3 flux 3, étape 6 : la barre est vide et garde le focus ; la vue d'ensemble se relit.
    await expect(b.input).toBeFocused();
    expect((await reread).status()).toBe(200);

    // Côté API : le lien est posé dans la même transaction (l'entretien déclenche le ressenti).
    const links = await ok<LinkDto[]>(request.get(`${API}/api/entries/${feelingId}/links`));
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      sourceId: eventId,
      targetId: feelingId,
      linkType: 'triggers',
    });
    await expectNoAxeViolations(page);
  });

  test('aperçu et rail : cible proposée et cochée, avertissement bloquant, axe sans violation', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'm6-02.apercu', 'psychologist');
    const patientId = await createPatient(request, 'Hugo L.');
    await startSession(request, patientId);
    const eventId = await createEntry(request, patientId, {
      type: 'event',
      title: 'Entretien annuel',
    });
    const situationId = await createEntry(request, patientId, {
      type: 'situation',
      title: 'Surcharge au travail',
      occurred: { from: '2026-03-01T00:00:00Z', precision: 'month' },
    });
    await signIn(page, account);
    await openFolder(page, patientId, 'Hugo L.');
    const b = bar(page);

    // Champ vide : l'aide de la syntaxe (état vide de l'aperçu).
    await b.input.focus();
    await settled(page);
    await expect(b.panel.getByText('Notez au clavier')).toBeVisible();
    await expectNoAxeViolations(page);

    await page.keyboard.type("anx 8 n'a pas dormi > entretien");
    await settled(page);
    await expect(b.line).toHaveText(
      "Ressenti · Anxiété 8/10 · « n'a pas dormi » · maintenant · séance en cours · lié à Événement « Entretien annuel » lien « déclenché par » proposé",
    );
    // Rail « Lié à… » : la cible du `>` cochée avec le type proposé, l'autre cible libre.
    await expect(b.rail.getByRole('checkbox', { name: /Entretien annuel/ })).toBeChecked();
    await expect(b.rail.getByRole('checkbox', { name: /Surcharge au travail/ })).not.toBeChecked();
    await expect(
      b.rail
        .getByRole('combobox', { name: 'Type de lien avec « Entretien annuel »' })
        .locator('option:checked'),
    ).toHaveText('déclenché par');
    await expectNoAxeViolations(page);

    // Un clic sur le libellé d'une cible du rail la coche (le panneau reste ouvert), un second la
    // décoche.
    const situation = b.rail.getByRole('checkbox', { name: /Surcharge au travail/ });
    await b.rail.locator('label', { hasText: 'Surcharge au travail' }).click();
    await expect(b.panel).toBeVisible();
    await expect(situation).toBeChecked();
    await b.rail.locator('label', { hasText: 'Surcharge au travail' }).click();
    await expect(situation).not.toBeChecked();

    // Au clavier (B3 flux 3, étape 4) : Tab jusqu'à la case, Espace, Entrée → deux liens.
    await b.input.focus();
    for (let i = 0; i < 10; i++) {
      if (await situation.evaluate((element) => element === document.activeElement)) break;
      await page.keyboard.press('Tab');
    }
    await expect(situation).toBeFocused();
    await page.keyboard.press('Space');
    await expect(situation).toBeChecked();
    const linked = page.waitForResponse((r) => isCreate(r, patientId));
    await page.keyboard.press('Enter');
    const linkedResponse = await linked;
    expect(linkedResponse.status(), await linkedResponse.text()).toBe(201);
    expect(linkedResponse.request().postDataJSON()).toMatchObject({
      type: 'feeling',
      links: [
        { targetId: eventId, linkType: 'triggers', direction: 'incoming' },
        { targetId: situationId, linkType: 'triggers', direction: 'incoming' },
      ],
    });
    await expect(b.input).toHaveValue('');
    await expect(b.input).toBeFocused();

    // Avertissement bloquant (intensité hors de 0 à 10) : Entrée ne crée rien et le dit.
    let posted = false;
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().endsWith(`/api/patients/${patientId}/entries`))
        posted = true;
    });
    await b.input.fill('anx 12 crise');
    await expect(b.warnings.first()).toHaveText(
      "À corriger : Intensité 12 hors de l'échelle : tapez un nombre de 0 à 10.",
    );
    await b.input.press('Enter');
    await expect(b.alert).toHaveText(
      "Rien n'est enregistré. Intensité 12 hors de l'échelle : tapez un nombre de 0 à 10.",
    );
    await expect(b.input).toHaveValue('anx 12 crise');
    expect(posted).toBe(false);
    await expectNoAxeViolations(page);

    // Échap replie le panneau ; la frappe suivante le rouvre.
    await page.keyboard.press('Escape');
    await expect(b.panel).toBeHidden();
    await page.keyboard.type(' ');
    await expect(b.panel).toBeVisible();
  });

  test('préfixe inconnu → création d’une émotion personnalisée proposée, puis ressenti créé avec elle', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'm6-02.emotion', 'psychologist');
    const patientId = await createPatient(request, 'Léon F.');
    await startSession(request, patientId);
    await signIn(page, account);
    await openFolder(page, patientId, 'Léon F.');
    const b = bar(page);

    await b.input.focus();
    await page.keyboard.type("tracas 6 avant l'examen");
    await settled(page);
    await expect(b.line).toContainText('« tracas » ? 6/10');
    await expect(b.warnings.first()).toContainText("Aucune émotion ne s'appelle « tracas »");
    await expect(b.proposal).toBeVisible();
    await expect(b.proposal).toContainText("Créer l'émotion personnalisée « Tracas »");
    await expectNoAxeViolations(page);

    // Au clavier : Tab vers la famille ; Entrée sans famille → message (obligatoire, contrat).
    const family = b.proposal.getByLabel('Famille');
    await page.keyboard.press('Tab');
    await expect(family).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(b.proposal.getByRole('alert')).toHaveText("Choisissez la famille de l'émotion.");
    await expectNoAxeViolations(page);
    // Choix de la famille au clavier (saisie de l'initiale dans la liste), puis Entrée.
    await page.keyboard.press('p');
    await expect(family).toHaveValue('fear');
    const createdEmotion = page.waitForResponse(
      (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/me/emotions',
    );
    await page.keyboard.press('Enter');
    const emotionResponse = await createdEmotion;
    expect(emotionResponse.status(), await emotionResponse.text()).toBe(201);
    expect(emotionResponse.request().postDataJSON()).toEqual({ labelFr: 'Tracas', family: 'fear' });
    const code = ((await emotionResponse.json()) as { code: string }).code;

    // Le vocabulaire la connaît aussitôt : la saisie devient un ressenti.
    await expect(b.proposal).toBeHidden();
    await expect(b.line).toContainText('Ressenti · Tracas 6/10');
    await expect(b.input).toBeFocused();
    await expectNoAxeViolations(page);
    const created = page.waitForResponse((r) => isCreate(r, patientId));
    await b.input.press('Enter');
    const response = await created;
    expect(response.status(), await response.text()).toBe(201);
    expect(response.request().postDataJSON()).toMatchObject({
      type: 'feeling',
      feeling: { emotionCode: code, intensity: 6 },
      body: "avant l'examen",
    });
    await expect(b.input).toHaveValue('');
  });

  test('Ctrl+Entrée ouvre l’éditeur prérempli ; Ctrl+S enregistre un brouillon', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'm6-02.editeur', 'psychologist');
    const patientId = await createPatient(request, 'Zoé K.');
    await startSession(request, patientId);
    await signIn(page, account);
    await openFolder(page, patientId, 'Zoé K.');
    const b = bar(page);

    // Ctrl+Entrée : l'éditeur reprend type, émotion, intensité, texte ; rien n'est créé.
    let posted = 0;
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().endsWith(`/api/patients/${patientId}/entries`)) posted++;
    });
    await b.input.focus();
    await page.keyboard.type("anx 7 n'a pas dormi");
    await settled(page);
    await page.keyboard.press('Control+Enter');
    const dialog = page.locator('[role="dialog"]:has(pm-entry-editor-panel)');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('pm-state [aria-busy="true"]')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Ressenti', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(dialog.getByRole('combobox', { name: 'Émotion' })).toHaveValue('Anxiété');
    await expect(dialog.getByRole('slider')).toHaveAttribute('aria-valuenow', '7');
    await expect(dialog.getByLabel('Texte', { exact: true })).toHaveValue("n'a pas dormi");
    // Le panneau est modal (le reste de la page sort de l'arbre d'accessibilité) : par l'id.
    await expect(page.locator('#pm-capture-input')).toHaveValue('');
    expect(posted).toBe(0);
    await expectNoAxeViolations(page);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    // Ctrl+S : POST en brouillon (status draft), barre vidée.
    const created = page.waitForResponse((r) => isCreate(r, patientId));
    await b.input.focus();
    await page.keyboard.type('/evt dispute avec sa sœur hier');
    await expect(b.line).toContainText('Événement');
    await expect(b.line).toContainText('(au jour)');
    await page.keyboard.press('Control+s');
    const response = await created;
    expect(response.status(), await response.text()).toBe(201);
    expect(response.request().postDataJSON()).toMatchObject({
      type: 'event',
      title: 'dispute avec sa sœur',
      status: 'draft',
      occurred: { precision: 'day' },
    });
    expect(((await response.json()) as { status: string }).status).toBe('draft');
    await expect(page.getByText('Brouillon enregistré.').last()).toBeVisible();
    await expect(b.input).toHaveValue('');
  });
});
