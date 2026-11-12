import { APIRequestContext, APIResponse, expect, Page, Response, test } from '@playwright/test';

import { createAccount, signIn } from '../preferences/accounts';
import { expectNoAxeViolations } from '../support/axe';
import { block, settled } from './bloc-support';

// B3 flux 3, bloc de saisie structuré (UX-S1, décision du 12 novembre 2026 ; propositions 04b « Le
// champ de saisie ») : contre l'API locale (seed small, Mailpit), jamais de mock du backend. Chaque
// test crée son compte et son patient.

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

/** La séance d'accueil est créée de façon asynchrone après le patient : on l'attend. */
async function intakeOf(api: APIRequestContext, patientId: string): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const response = await api.get(`${API}/api/patients/${patientId}/sessions/current`);
    if (response.status() === 200) return ((await response.json()) as { id: string }).id;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`pas de séance d'accueil pour ${patientId}`);
}

async function startSession(api: APIRequestContext, patientId: string): Promise<void> {
  await intakeOf(api, patientId);
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

async function openFolder(page: Page, patientId: string, name: string): Promise<void> {
  await page.goto(`/fr/patients/${patientId}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
}

test.describe('bloc de saisie', () => {
  test.describe.configure({ timeout: 90_000 });

  test('chronométré : « anx 8 n’a pas dormi > entretien » + Entrée → ressenti lié créé en moins de 12 s au clavier ; puces, champs et lien suivent la grammaire', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'ux-s1.chrono', 'psychologist');
    const patientId = await createPatient(request, 'Marie D.');
    await startSession(request, patientId);
    const eventId = await createEntry(request, patientId, {
      type: 'event',
      title: 'Entretien annuel',
    });
    await signIn(page, account);
    await openFolder(page, patientId, 'Marie D.');
    await expect(page.locator('pm-patient-header .session-text')).toContainText('en cours');
    const b = block(page);
    // En séance : déplié d'emblée, Note pressée, champs de la note, rangée « Lié à ».
    await settled(page);
    await expect(b.type('Note')).toHaveAttribute('aria-pressed', 'true');
    await expect(b.when).toBeVisible();
    await expect(b.chip(/Entretien annuel/)).toBeVisible();
    await expect(b.save).toBeDisabled();
    await expectNoAxeViolations(page);

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
    await page.keyboard.type("anx 8 n'a pas dormi > entretien", { delay: 100 });
    // La puce suit la grammaire ; les champs sont l'aperçu (B5 : aucune erreur silencieuse).
    await expect(b.type('Ressenti')).toHaveAttribute('aria-pressed', 'true');
    await expect(b.detected).toHaveText('détecté depuis « anx 8 »');
    await expect(b.emotion).toHaveValue('Anxiété');
    await expect(b.intensity).toHaveAttribute('aria-valuenow', '8');
    await expect(b.placed).toContainText('Entretien annuel');
    await expect(b.verb.locator('option:checked')).toHaveText('déclenché par');
    await expect(b.links.locator('.note-r')).toHaveText('trouvé depuis « > entretien »');
    await page.keyboard.press('Enter');
    const response = await created;
    await expect(b.input).toHaveValue('');
    const elapsed = Date.now() - started;

    console.log(`[UX-S1] ressenti lié saisi au clavier dans le bloc en ${elapsed} ms`);
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
    // B3 flux 3, étape 6 : le bloc est vide et garde le focus ; la vue d'ensemble se relit.
    await expect(b.input).toBeFocused();
    await expect(b.type('Note')).toHaveAttribute('aria-pressed', 'true');
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

  test('à la souris : puce Ressenti, émotion dans la liste, intensité sur l’échelle, texte, bouton Enregistrer', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'ux-s1.souris', 'psychologist');
    const patientId = await createPatient(request, 'Hugo L.');
    await startSession(request, patientId);
    await signIn(page, account);
    await openFolder(page, patientId, 'Hugo L.');
    const b = block(page);
    await settled(page);

    // La grammaire suit la puce : Ressenti cliqué sans texte montre Émotion, Intensité, Quand.
    await b.type('Ressenti').click();
    await expect(b.type('Ressenti')).toHaveAttribute('aria-pressed', 'true');
    await expect(b.detected).toHaveCount(0);
    await expect(b.emotion).toBeVisible();
    await expect(b.intensity).toBeVisible();
    await expect(b.save).toBeDisabled();
    await expectNoAxeViolations(page);

    await b.emotion.click();
    await page.keyboard.type('col');
    const list = b.root.getByRole('listbox', { name: 'Émotions' });
    await expect(list.getByRole('option')).toHaveText(['Colère', "Créer l'émotion « Col »"]);
    await list.getByRole('option', { name: 'Colère' }).click();
    await expect(b.emotion).toHaveValue('Colère');
    await b.root.locator('pm-capture-scale .cell[data-value="6"]').click();
    await expect(b.intensity).toHaveAttribute('aria-valuenow', '6');
    await b.input.fill('ruminations sur le service');
    await expect(b.type('Ressenti')).toHaveAttribute('aria-pressed', 'true');
    await expect(b.save).toBeEnabled();
    await expectNoAxeViolations(page);

    const created = page.waitForResponse((r) => isCreate(r, patientId));
    await b.save.click();
    const response = await created;
    expect(response.status(), await response.text()).toBe(201);
    expect(response.request().postDataJSON()).toEqual({
      type: 'feeling',
      visibility: 'clinical',
      feeling: { emotionCode: 'anger', intensity: 6 },
      body: 'ruminations sur le service',
      status: 'final',
    });
    await expect(b.input).toHaveValue('');
    await expect(b.type('Note')).toHaveAttribute('aria-pressed', 'true');
  });

  test('avertissement bloquant sous le champ ; Échap replie et garde le texte ; hors séance, replié puis déplié au focus', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'ux-s1.bloque', 'psychologist');
    const patientId = await createPatient(request, 'Léa M.');
    await intakeOf(request, patientId);
    await signIn(page, account);
    await openFolder(page, patientId, 'Léa M.');
    const b = block(page);

    // Hors séance : une ligne (puces + placeholder), ni champs ni actions ; déplié au focus.
    await expect(b.block).toHaveClass(/collapsed/);
    await expect(b.type('Note')).toBeVisible();
    await expect(b.when).toHaveCount(0);
    await expectNoAxeViolations(page);
    await b.input.focus();
    await settled(page);
    await expect(b.when).toBeVisible();

    // Intensité hors de 0 à 10 : avertissement sous Intensité, Enregistrer désactivé, Entrée ne crée rien.
    let posted = false;
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().endsWith(`/api/patients/${patientId}/entries`))
        posted = true;
    });
    await page.keyboard.type('anx 12 crise');
    await expect(b.note('intensity')).toHaveText(
      "Intensité 12 hors de l'échelle : tapez un nombre de 0 à 10.",
    );
    await expect(b.save).toBeDisabled();
    await page.keyboard.press('Enter');
    await expect(b.alert).toHaveText(
      "Rien n'est enregistré. Intensité 12 hors de l'échelle : tapez un nombre de 0 à 10.",
    );
    await expect(b.input).toHaveValue('anx 12 crise');
    expect(posted).toBe(false);
    await expectNoAxeViolations(page);

    // Échap replie les champs, le texte reste ; la frappe suivante les rouvre.
    await page.keyboard.press('Escape');
    await expect(b.block).toHaveClass(/collapsed/);
    await expect(b.input).toHaveValue('anx 12 crise');
    await page.keyboard.type(' ');
    await expect(b.block).toHaveClass(/expanded/);
  });

  test('émotion inconnue → création proposée sous le champ Émotion, puis ressenti créé avec elle', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'ux-s1.emotion', 'psychologist');
    const patientId = await createPatient(request, 'Léon F.');
    await startSession(request, patientId);
    await signIn(page, account);
    await openFolder(page, patientId, 'Léon F.');
    const b = block(page);
    await settled(page);

    await b.input.focus();
    await page.keyboard.type("tracas 6 avant l'examen");
    await expect(b.type('Ressenti')).toHaveAttribute('aria-pressed', 'true');
    await expect(b.emotion).toHaveValue('tracas');
    await expect(b.note('emotion')).toContainText("Aucune émotion ne s'appelle « tracas »");
    const proposal = b.root.getByRole('group', { name: /Créer l'émotion personnalisée/ });
    await expect(proposal).toContainText("Créer l'émotion personnalisée « Tracas »");
    await expectNoAxeViolations(page);

    // Famille obligatoire (contrat) : Entrée sans famille → message ; puis « p » (peur) et Entrée.
    const family = proposal.getByLabel('Famille');
    await family.focus();
    await page.keyboard.press('Enter');
    await expect(proposal.getByRole('alert')).toHaveText("Choisissez la famille de l'émotion.");
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

    // Le vocabulaire la connaît aussitôt : la saisie devient un ressenti complet.
    await expect(proposal).toBeHidden();
    await expect(b.emotion).toHaveValue('Tracas');
    await expect(b.intensity).toHaveAttribute('aria-valuenow', '6');
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

  test('Ctrl+Entrée et « Détailler » ouvrent l’éditeur prérempli, lien compris ; Ctrl+S enregistre un brouillon', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'ux-s1.editeur', 'psychologist');
    const patientId = await createPatient(request, 'Zoé K.');
    await startSession(request, patientId);
    await createEntry(request, patientId, { type: 'event', title: 'Entretien annuel' });
    await signIn(page, account);
    await openFolder(page, patientId, 'Zoé K.');
    const b = block(page);
    await settled(page);

    let posted = 0;
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().endsWith(`/api/patients/${patientId}/entries`)) posted++;
    });
    await b.input.focus();
    await page.keyboard.type("anx 7 n'a pas dormi > entretien");
    await expect(b.placed).toContainText('Entretien annuel');
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
    // Le lien posé dans le bloc est coché dans le rail de l'éditeur.
    await expect(dialog.getByRole('checkbox', { name: /Entretien annuel/ })).toBeChecked();
    await expect(page.locator('#pm-capture-input')).toHaveValue('');
    expect(posted).toBe(0);
    await expectNoAxeViolations(page);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    // « Détailler » : le même éditeur.
    await b.input.fill('/evt dispute avec sa sœur hier');
    await expect(b.type('Événement')).toHaveAttribute('aria-pressed', 'true');
    await b.detail.click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Événement', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    // Ctrl+S : POST en brouillon (status draft), bloc vidé.
    const created = page.waitForResponse((r) => isCreate(r, patientId));
    await b.input.fill('/evt dispute avec sa sœur hier');
    await expect(b.when.locator('option:checked')).toHaveText('hier');
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

  test('422 du serveur sous le champ ou sous le bloc (SESSION_REQUIRED), la saisie conservée', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'ux-s1.422', 'psychologist');
    const patientId = await createPatient(request, 'Iris P.');
    // Seule séance du patient, l'accueil est archivé : sessions/current répond 404 NO_CURRENT_SESSION.
    const intake = await intakeOf(request, patientId);
    expect((await request.delete(`${API}/api/entries/${intake}`)).status()).toBe(204);
    await signIn(page, account);
    await openFolder(page, patientId, 'Iris P.');
    const b = block(page);

    await b.input.fill('Premier appel de la mère');
    await settled(page);
    const created = page.waitForResponse((r) => isCreate(r, patientId));
    await b.input.press('Enter');
    const response = await created;
    expect(response.status()).toBe(422);
    expect(((await response.json()) as { code: string }).code).toBe('SESSION_REQUIRED');
    await expect(b.alert).toContainText('Toute entrée appartient à une séance');
    await expect(b.input).toHaveValue('Premier appel de la mère');
    await expectNoAxeViolations(page);
  });
});
