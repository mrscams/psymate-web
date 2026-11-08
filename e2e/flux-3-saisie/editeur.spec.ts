import {
  APIRequestContext,
  expect,
  Locator,
  Page,
  request as playwrightRequest,
  test,
} from '@playwright/test';

import { createAccount, signIn } from '../preferences/accounts';
import { SEED } from '../support/accounts';
import { expectNoAxeViolations } from '../support/axe';

// B3 flux 3, partie éditeur d'entrée (M1-08, fiche 05) : contre l'API locale (seed small, Mailpit),
// jamais de mock du backend. Les comptes jetables portent les patients créés ici ; la correction
// hors fenêtre de grâce prend une entrée ancienne du seed (claire.seed), seule source d'une entrée
// enregistrée il y a plus de 1 h 15.

const API = 'http://localhost:8080';
/** Grâce de G Q31 (versioning.grace-period = 75m). */
const GRACE_MS = 75 * 60_000;

async function createPatient(api: APIRequestContext, displayName: string): Promise<string> {
  const response = await api.post(`${API}/api/patients`, { data: { displayName } });
  expect(response.status(), await response.text()).toBe(201);
  return ((await response.json()) as { id: string }).id;
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

async function startSession(api: APIRequestContext, patientId: string): Promise<string> {
  await intakeOf(api, patientId);
  const response = await api.post(`${API}/api/patients/${patientId}/sessions/start`, {
    data: { modality: 'in_person' },
  });
  expect(response.status(), await response.text()).toBe(201);
  return ((await response.json()) as { id: string }).id;
}

function editor(page: Page) {
  const dialog = page.locator('[role="dialog"]:has(pm-entry-editor-panel)');
  return {
    dialog,
    type: (name: string) => dialog.getByRole('button', { name, exact: true }),
    emotion: dialog.getByRole('combobox', { name: 'Émotion' }),
    options: dialog.getByRole('listbox', { name: 'Émotions' }).getByRole('option'),
    slider: dialog.getByRole('slider'),
    save: dialog.locator('.footer .primary'),
    session: dialog.getByLabel('Séance', { exact: true }),
    grace: dialog.locator('.grace[role="status"]'),
  };
}

/** Le panneau a fini de glisser et ses données sont là : axe peut mesurer. */
async function settled(dialog: Locator): Promise<void> {
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('pm-state [aria-busy="true"]')).toHaveCount(0);
}

function isCreate(url: string, method: string, patientId: string): boolean {
  return method === 'POST' && url.endsWith(`/api/patients/${patientId}/entries`);
}

test.describe('éditeur d’entrée', () => {
  test.describe.configure({ timeout: 90_000 });

  test('ressenti 8/10 au clavier en moins de 20 s (N → Ressenti → anx ↓ ⏎ → 8 → texte → ⏎), séance en cours', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'm1-08.clavier', 'psychologist');
    const patientId = await createPatient(request, 'Nora B.');
    const sessionId = await startSession(request, patientId);
    await signIn(page, account);
    await page.goto(`/fr/patients/${patientId}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nora B.');
    await expect(page.locator('pm-patient-header .session-text')).toContainText('en cours');

    const created = page.waitForResponse((r) => isCreate(r.url(), r.request().method(), patientId));
    const e = editor(page);
    const started = Date.now();
    await page.keyboard.press('n');
    await expect(e.dialog).toBeVisible();
    await expect(e.type('Note')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(e.type('Ressenti')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Tab');
    await expect(e.emotion).toBeFocused();
    await page.keyboard.type('anx');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(e.emotion).toHaveValue('Anxiété');
    await page.keyboard.press('Tab');
    await expect(e.slider).toBeFocused();
    await page.keyboard.press('8');
    await expect(e.slider).toHaveAttribute('aria-valuenow', '8');
    await page.keyboard.press('Tab');
    await page.keyboard.type("n'a pas dormi");
    await page.keyboard.press('Enter');
    const response = await created;
    await expect(e.dialog).toBeHidden();
    const elapsed = Date.now() - started;

    console.log(`[M1-08] ressenti 8/10 saisi au clavier en ${elapsed} ms`);
    test.info().annotations.push({ type: 'durée de saisie (ms)', description: String(elapsed) });
    expect(elapsed).toBeLessThan(20_000);

    expect(response.status()).toBe(201);
    const body = response.request().postDataJSON() as Record<string, unknown>;
    expect(body).toMatchObject({
      type: 'feeling',
      feeling: { emotionCode: 'anxiety', intensity: 8 },
      body: "n'a pas dormi",
      status: 'final',
      // La séance en cours était présélectionnée (sessions/current).
      sessionId,
    });
    expect(JSON.stringify(body)).not.toMatch(/authorType|submissionId/);
    expect(((await response.json()) as { sessionId: string }).sessionId).toBe(sessionId);
    await expect(page.getByText('Entrée enregistrée.')).toBeVisible();
    // axe après la mesure (le chronomètre ne compte que la saisie) : panneau rouvert sur l'entrée.
    await page.keyboard.press('n');
    await settled(editor(page).dialog);
    await expectNoAxeViolations(page);
  });

  test('Échap conserve le brouillon, N le retrouve ; Ctrl+S crée l’entrée en brouillon', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'm1-08.brouillon', 'psychologist');
    const patientId = await createPatient(request, 'Hugo T.');
    await startSession(request, patientId);
    await signIn(page, account);
    await page.goto(`/fr/patients/${patientId}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hugo T.');

    const e = editor(page);
    await page.getByRole('button', { name: 'Nouvelle entrée (N)' }).click();
    await settled(e.dialog);
    await expectNoAxeViolations(page);
    await e.type('Ressenti').click();
    await e.emotion.fill('trist');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await e.slider.focus();
    await page.keyboard.press('6');
    await e.dialog.getByLabel('Texte', { exact: true }).fill('pleure souvent');
    await page.keyboard.press('Escape');
    await expect(e.dialog).toBeHidden();

    await page.keyboard.press('n');
    await settled(e.dialog);
    await expect(e.type('Ressenti')).toHaveAttribute('aria-pressed', 'true');
    await expect(e.emotion).toHaveValue('Tristesse');
    await expect(e.slider).toHaveAttribute('aria-valuenow', '6');
    await expect(e.dialog.getByLabel('Texte', { exact: true })).toHaveValue('pleure souvent');

    const created = page.waitForResponse((r) => isCreate(r.url(), r.request().method(), patientId));
    await e.dialog.getByLabel('Texte', { exact: true }).focus();
    await page.keyboard.press('Control+s');
    const response = await created;
    expect(response.status()).toBe(201);
    expect(response.request().postDataJSON()).toMatchObject({ status: 'draft', type: 'feeling' });
    expect(((await response.json()) as { status: string }).status).toBe('draft');
    await expect(e.dialog).toBeHidden();
    await expect(page.getByText('Brouillon enregistré.')).toBeVisible();
  });

  test('patient sans séance : 422 SESSION_REQUIRED sous le bloc Séance, saisie conservée', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'm1-08.seance', 'psychologist');
    const patientId = await createPatient(request, 'Iris P.');
    // Seule séance du patient, l'accueil est archivé : sessions/current répond 404 NO_CURRENT_SESSION.
    const intake = await intakeOf(request, patientId);
    expect((await request.delete(`${API}/api/entries/${intake}`)).status()).toBe(204);
    await signIn(page, account);
    await page.goto(`/fr/patients/${patientId}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Iris P.');

    // Ctrl+Entrée : la barre de commande (M6-02) ouvre l'éditeur prérempli (Entrée créerait).
    const capture = page.getByRole('textbox', { name: 'Noter quelque chose' });
    await capture.fill('Premier appel de la mère');
    await capture.press('Control+Enter');
    const e = editor(page);
    await settled(e.dialog);
    await expect(e.session).toHaveValue('');
    await expect(e.session.locator('option:checked')).toHaveText('Aucune séance');

    const created = page.waitForResponse((r) => isCreate(r.url(), r.request().method(), patientId));
    await e.save.click();
    const response = await created;
    expect(response.status()).toBe(422);
    expect(((await response.json()) as { code: string }).code).toBe('SESSION_REQUIRED');
    await expect(e.dialog.locator('#field-sessionId-error')).toHaveText(
      'Toute entrée appartient à une séance',
    );
    await expect(e.session).toHaveAttribute('aria-invalid', 'true');
    await expect(e.dialog.getByLabel('Texte', { exact: true })).toHaveValue(
      'Premier appel de la mère',
    );
    await expectNoAxeViolations(page);
  });

  test('émotion personnalisée créée en ligne puis reproposée ; libellé déjà pris → 409 affiché', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'm1-08.emotion', 'psychologist');
    const patientId = await createPatient(request, 'Léa V.');
    await startSession(request, patientId);
    await signIn(page, account);
    await page.goto(`/fr/patients/${patientId}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Léa V.');

    const label = `Rumination ${Date.now() % 100000}`;
    const e = editor(page);
    await page.keyboard.press('n');
    await settled(e.dialog);
    await e.type('Ressenti').click();
    await e.emotion.fill(label);
    await expect(e.options).toHaveCount(1);
    await expect(e.options).toContainText(`Créer l'émotion personnalisée « ${label} »`);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    const family = e.dialog.getByRole('group', { name: /Famille de/ });
    await expect(family).toBeVisible();
    await family.getByLabel('Peur').check();
    const createdEmotion = page.waitForResponse(
      (r) => r.url().endsWith('/api/me/emotions') && r.request().method() === 'POST',
    );
    await family.getByRole('button', { name: "Créer l'émotion" }).click();
    expect((await createdEmotion).status()).toBe(201);
    await expect(family).toBeHidden();
    await expect(e.emotion).toHaveValue(label);
    await e.slider.focus();
    await page.keyboard.press('5');
    await e.save.click();
    await expect(e.dialog).toBeHidden();

    // Second ressenti, sans rechargement : l'émotion est proposée par l'autocomplétion.
    await page.keyboard.press('n');
    await settled(e.dialog);
    await e.type('Ressenti').click();
    await e.emotion.fill('rumin');
    await expect(e.options.first()).toContainText(label);
    await expect(e.options.first()).toContainText('personnalisée');
    await expectNoAxeViolations(page);

    // Le libellé est pris ailleurs (autre onglet) après le chargement de la liste : 409.
    const taken = `Lassitude ${Date.now() % 100000}`;
    const other = await request.post(`${API}/api/me/emotions`, {
      data: { labelFr: taken, family: 'sadness' },
    });
    expect(other.status()).toBe(201);
    await e.emotion.fill(taken);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await family.getByLabel('Tristesse').check();
    const conflict = page.waitForResponse(
      (r) => r.url().endsWith('/api/me/emotions') && r.request().method() === 'POST',
    );
    await family.getByRole('button', { name: "Créer l'émotion" }).click();
    expect((await conflict).status()).toBe(409);
    await expect(family.getByRole('alert')).toHaveText(
      'Une émotion porte déjà ce libellé : choisissez-la dans la liste.',
    );
    await expectNoAxeViolations(page);
  });

  test('correction dans la fenêtre de grâce : le bandeau l’annonce, aucune version créée', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'm1-08.grace', 'psychologist');
    const patientId = await createPatient(request, 'Marc D.');
    await startSession(request, patientId);
    const response = await request.post(`${API}/api/patients/${patientId}/entries`, {
      data: { type: 'event', title: 'Dispute avec le frère' },
    });
    expect(response.status()).toBe(201);
    const entryId = ((await response.json()) as { id: string }).id;
    await signIn(page, account);

    await page.goto(`/fr/patients/${patientId}?entry=${entryId}`);
    const e = editor(page);
    await settled(e.dialog);
    await expect(e.dialog.getByRole('heading', { level: 2 })).toHaveText("Modifier l'entrée · v1");
    await expect(e.grace).toContainText(
      'dans la fenêtre de grâce (1 h 15) : la version 1 sera modifiée en place',
    );
    await expect(e.save).toHaveText(/^\s*Enregistrer ⏎\s*$/);
    await expect(e.type('Événement')).toHaveAttribute('aria-disabled', 'true');
    await expectNoAxeViolations(page);

    await e.dialog.getByLabel('Titre', { exact: true }).fill('Dispute avec le frère aîné');
    const patched = page.waitForResponse(
      (r) => r.url().endsWith(`/api/entries/${entryId}`) && r.request().method() === 'PATCH',
    );
    await page.keyboard.press('Enter');
    expect((await patched).status()).toBe(200);
    await expect(e.dialog).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`/fr/patients/${patientId}$`));

    const versions = await request.get(`${API}/api/entries/${entryId}/versions`);
    const list = (await versions.json()) as { version: number; title: string }[];
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ version: 1, title: 'Dispute avec le frère aîné' });
  });

  test('correction après la grâce (entrée du seed) : « Enregistrer la version 2 », puis 2 versions dans le pied et l’historique', async ({
    page,
  }) => {
    // Session API de claire.seed pour choisir une entrée ancienne en version 1.
    const api = await playwrightRequest.newContext();
    const login = await api.post(`${API}/api/auth/login`, { data: SEED.claire });
    expect(login.status()).toBe(200);
    const patients = (await (await api.get(`${API}/api/patients?limit=50`)).json()) as {
      items: { id: string }[];
    };
    let target: { patientId: string; entryId: string; title: string } | null = null;
    for (const patient of patients.items) {
      const timeline = (await (
        await api.get(`${API}/api/patients/${patient.id}/timeline?types=note,event&limit=200`)
      ).json()) as { items: { id: string }[] };
      for (const item of timeline.items) {
        const entry = (await (await api.get(`${API}/api/entries/${item.id}`)).json()) as {
          version: number;
          recordedAt: string;
          title: string | null;
          body: string | null;
          archivedAt: string | null;
        };
        const old = Date.now() - new Date(entry.recordedAt).getTime() > GRACE_MS + 60_000;
        if (entry.version === 1 && old && !entry.archivedAt && entry.body) {
          target = { patientId: patient.id, entryId: item.id, title: entry.title ?? '' };
          break;
        }
      }
      if (target) break;
    }
    await api.dispose();
    test.skip(
      !target,
      'aucune entrée du seed en version 1 (seed déjà consommé : make seed SIZE=small)',
    );
    const { patientId, entryId } = target!;

    await signIn(page, SEED.claire);
    await page.goto(`/fr/patients/${patientId}?entry=${entryId}`);
    const e = editor(page);
    await settled(e.dialog);
    await expect(e.grace).toContainText(
      'hors fenêtre de grâce (1 h 15) : cette correction créera la version 2.',
    );
    // Intl sépare le nombre et l'unité par une espace insécable fine : « il y a 24 h ».
    await expect(e.grace).toHaveText(/^\s*Modifiée il y a \d+/);
    await expect(e.save).toHaveText(/Enregistrer la version 2/);
    await expectNoAxeViolations(page);

    const text = e.dialog.getByLabel('Texte', { exact: true });
    await text.fill(`${await text.inputValue()} (relu en e2e)`);
    await e.dialog
      .getByLabel('Motif de la correction (facultatif)')
      .fill('Précision après relecture');
    const patched = page.waitForResponse(
      (r) => r.url().endsWith(`/api/entries/${entryId}`) && r.request().method() === 'PATCH',
    );
    await e.save.click();
    const response = await patched;
    expect(response.status()).toBe(200);
    expect(((await response.json()) as { version: number }).version).toBe(2);
    expect(JSON.stringify(response.request().postDataJSON())).not.toMatch(
      /authorType|submissionId/,
    );
    await expect(e.dialog).toBeHidden();
    await expect(page.getByText('Correction enregistrée (version 2).')).toBeVisible();

    // Rechargement sur ?entry= : le panneau se rouvre, le pied annonce 2 versions.
    await page.goto(`/fr/patients/${patientId}?entry=${entryId}`);
    await settled(e.dialog);
    await expect(e.dialog.getByRole('heading', { level: 2 })).toHaveText("Modifier l'entrée · v2");
    const history = e.dialog.getByRole('button', { name: 'Version 2 · Historique (2 versions)' });
    await expect(history).toBeVisible();
    await expect(e.save).toHaveText(/Enregistrer la version 3/);
    await history.click();

    const panel = page.getByRole('dialog', { name: 'Historique des versions' });
    await expect(panel).toBeVisible();
    const versions = panel.locator('ol.versions > li');
    await expect(versions).toHaveCount(2);
    await expect(versions.first()).toHaveAttribute('aria-current', 'true');
    await expect(versions.first()).toContainText('v2');
    await expect(versions.first()).toContainText('Motif : Précision après relecture');
    await expect(versions.first().locator('dd s')).not.toHaveText('');
    await expect(versions.first().locator('dd .after')).toContainText('(relu en e2e)');
    await expect(versions.nth(1)).toContainText('v1');
    await expectNoAxeViolations(page);

    // Échap ferme l'historique d'abord, l'éditeur reste ouvert dessous.
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(e.dialog).toBeVisible();
  });
});
