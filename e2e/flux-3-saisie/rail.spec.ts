import { APIRequestContext, APIResponse, expect, Locator, Page, test } from '@playwright/test';

import { createAccount, signIn } from '../preferences/accounts';
import { expectNoAxeViolations } from '../support/axe';

// B3 flux 3, rail « Lié à… » de l'éditeur d'entrée (M2-05, fiche 05 §7, B5) : contre l'API locale
// (seed small, Mailpit), jamais de mock du backend. Le test du lien invalide réécrit la requête POST
// (type de lien hors matrice) pour que le serveur réel réponde 422 : la réponse n'est pas simulée.

const API = 'http://localhost:8080';

interface LinkDto {
  id: string;
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
async function intakeOf(api: APIRequestContext, patientId: string): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const response = await api.get(`${API}/api/patients/${patientId}/sessions/current`);
    if (response.status() === 200) return;
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

/** Nombre d'entrées du dossier (chronologie, brouillons et privées comprises). */
async function entryCount(api: APIRequestContext, patientId: string): Promise<number> {
  const page = await ok<{ items: unknown[] }>(
    api.get(`${API}/api/patients/${patientId}/timeline?limit=200&includePrivate=true`),
  );
  return page.items.length;
}

function editor(page: Page) {
  const dialog = page.locator('[role="dialog"]:has(pm-entry-editor-panel)');
  const rail = dialog.locator('fieldset.rail');
  return {
    dialog,
    rail,
    type: (name: string) => dialog.getByRole('button', { name, exact: true }),
    emotion: dialog.getByRole('combobox', { name: 'Émotion' }),
    slider: dialog.getByRole('slider'),
    save: dialog.locator('.footer .primary'),
    target: (name: string) => rail.getByRole('checkbox', { name: new RegExp(name) }),
    linkType: (name: string) =>
      rail.getByRole('combobox', { name: `Type de lien avec « ${name} »` }),
    railError: rail.locator('.rail-error[role="alert"]'),
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

/** Ressenti Anxiété 8/10 au clavier, panneau ouvert sur une nouvelle entrée (focus sur « Note »). */
async function typeFeeling(page: Page): Promise<void> {
  const e = editor(page);
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
}

/** `Tab` jusqu'à la case de la cible (B5 : « Tab pour y aller »), sans souris. */
async function tabTo(page: Page, target: Locator): Promise<void> {
  for (let i = 0; i < 20; i++) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  await expect(target).toBeFocused();
}

test.describe('rail « Lié à… »', () => {
  test.describe.configure({ timeout: 90_000 });

  test('ressenti lié à un événement en une seule saisie (Tab + Espace dans le rail)', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'm2-05.rail', 'psychologist');
    const patientId = await createPatient(request, 'Chloé R.');
    await startSession(request, patientId);
    await signIn(page, account);
    await page.goto(`/fr/patients/${patientId}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Chloé R.');
    const e = editor(page);

    // 1. L'événement, dans l'éditeur.
    await page.keyboard.press('n');
    await settled(e.dialog);
    await e.type('Événement').click();
    await e.dialog.getByLabel('Titre', { exact: true }).fill('Entretien annuel');
    const eventCreated = page.waitForResponse((r) =>
      isCreate(r.url(), r.request().method(), patientId),
    );
    await e.save.click();
    const eventResponse = await eventCreated;
    expect(eventResponse.status()).toBe(201);
    const eventId = ((await eventResponse.json()) as { id: string }).id;
    await expect(e.dialog).toBeHidden();

    // 2. Le ressenti, au clavier, lié à l'événement depuis le rail : Tab jusqu'à la case, Espace.
    await page.keyboard.press('n');
    await settled(e.dialog);
    await typeFeeling(page);
    await page.keyboard.press('Tab');
    await page.keyboard.type("n'a pas dormi");
    const target = e.target('Entretien annuel');
    await tabTo(page, target);
    await expect(target).not.toBeChecked();
    // Type proposé par la matrice E5.3 : l'événement déclenche le ressenti.
    await expect(e.linkType('Entretien annuel').locator('option:checked')).toHaveText(
      'déclenché par',
    );
    await page.keyboard.press('Space');
    await expect(target).toBeChecked();
    await expectNoAxeViolations(page);

    const created = page.waitForResponse((r) => isCreate(r.url(), r.request().method(), patientId));
    await expect(target).toBeFocused();
    await page.keyboard.press('Enter');
    const response = await created;
    expect(response.status(), await response.text()).toBe(201);
    const body = response.request().postDataJSON() as Record<string, unknown>;
    expect(body).toMatchObject({
      type: 'feeling',
      feeling: { emotionCode: 'anxiety', intensity: 8 },
      body: "n'a pas dormi",
      links: [{ targetId: eventId, linkType: 'triggers', direction: 'incoming' }],
    });
    expect(JSON.stringify(body)).not.toMatch(/authorType|submissionId/);
    const feelingId = ((await response.json()) as { id: string }).id;
    await expect(e.dialog).toBeHidden();
    await expect(page.getByText('Entrée enregistrée.').last()).toBeVisible();

    // Côté API : le lien existe, posé dans la même transaction (l'événement déclenche le ressenti).
    const links = await ok<LinkDto[]>(request.get(`${API}/api/entries/${feelingId}/links`));
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      sourceId: eventId,
      targetId: feelingId,
      linkType: 'triggers',
    });

    // Réouverture : le rail relit la chronologie, le ressenti créé y est proposé.
    await page.keyboard.press('n');
    await settled(e.dialog);
    await expect(e.target("n'a pas dormi|Anxiété 8/10")).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('lien invalide (type hors matrice forcé dans la requête) → 422, aucune entrée créée, message sous le rail', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'm2-05.invalide', 'psychologist');
    const patientId = await createPatient(request, 'Malo D.');
    await startSession(request, patientId);
    const eventId = await createEntry(request, patientId, {
      type: 'event',
      title: 'Entretien annuel',
    });
    await signIn(page, account);
    await page.goto(`/fr/patients/${patientId}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Malo D.');
    const before = await entryCount(request, patientId);

    // On réécrit la requête (pas la réponse) : « traite » n'admet qu'un médicament en source.
    await page.route(`**/api/patients/${patientId}/entries`, async (route) => {
      const sent = route.request();
      if (sent.method() !== 'POST') return route.continue();
      const body = sent.postDataJSON() as { links?: { linkType: string }[] };
      if (body.links?.[0]) body.links[0].linkType = 'treats';
      await route.continue({ postData: JSON.stringify(body) });
    });

    const e = editor(page);
    await page.keyboard.press('n');
    await settled(e.dialog);
    await typeFeeling(page);
    const target = e.target('Entretien annuel');
    await tabTo(page, target);
    await page.keyboard.press('Space');
    await expect(target).toBeChecked();

    const created = page.waitForResponse((r) => isCreate(r.url(), r.request().method(), patientId));
    await e.save.click();
    const response = await created;
    expect(response.status()).toBe(422);
    expect(response.request().postDataJSON()).toMatchObject({
      links: [{ targetId: eventId, linkType: 'treats', direction: 'incoming' }],
    });
    const problem = (await response.json()) as {
      code: string;
      errors: { field: string; code: string }[];
    };
    expect(problem.code).toBe('VALIDATION_FAILED');
    expect(problem.errors[0]).toMatchObject({ code: 'LINK_TYPE_NOT_ALLOWED' });
    expect(problem.errors[0].field).toMatch(/^links\[0\]/);

    // Message sous le rail, saisie conservée, panneau ouvert.
    await expect(e.railError).toContainText('Lien vers « Entretien annuel » refusé');
    await expect(e.railError).toContainText("L'entrée n'a pas été créée");
    await expect(e.railError).toBeFocused();
    await expect(e.dialog).toBeVisible();
    await expect(e.emotion).toHaveValue('Anxiété');
    await expect(e.slider).toHaveAttribute('aria-valuenow', '8');
    await expect(target).toBeChecked();
    await expectNoAxeViolations(page);

    // Le serveur a tout annulé : ni entrée ni lien.
    expect(await entryCount(request, patientId)).toBe(before);
    const links = await ok<LinkDto[]>(request.get(`${API}/api/entries/${eventId}/links`));
    expect(links).toHaveLength(0);
  });

  test('correction : liens posés en lecture, le rail ouvre l’éditeur de lien au lieu d’envoyer links[]', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'm2-05.correction', 'psychologist');
    const patientId = await createPatient(request, 'Elsa M.');
    await startSession(request, patientId);
    const eventId = await createEntry(request, patientId, {
      type: 'event',
      title: 'Entretien annuel',
    });
    const feelingId = await createEntry(request, patientId, {
      type: 'feeling',
      body: "N'a pas dormi",
      feeling: { emotionCode: 'anxiety', intensity: 8 },
      links: [{ targetId: eventId, linkType: 'triggers', direction: 'incoming' }],
    });
    await signIn(page, account);
    await page.goto(`/fr/patients/${patientId}?entry=${feelingId}`);
    const e = editor(page);
    await settled(e.dialog);
    await expect(e.rail).toHaveCount(0);
    const links = e.dialog.locator('section.links');
    await expect(links.getByRole('heading', { name: 'Lié à… · 1' })).toBeVisible();
    await expect(links.locator('li')).toHaveCount(1);
    await expect(links.locator('li')).toContainText('Entretien annuel');
    await expectNoAxeViolations(page);

    await links.getByRole('button', { name: 'Lier ou modifier les liens' }).click();
    const linkEditor = page.locator('[role="dialog"]:has(pm-link-editor-panel)');
    await expect(linkEditor).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`link=${feelingId}`));
    await expect(linkEditor.locator('pm-state [aria-busy="true"]')).toHaveCount(0);
    await expectNoAxeViolations(page);

    // Un lien posé pendant que l'éditeur de lien est ouvert : relu à sa fermeture.
    const noteId = await createEntry(request, patientId, { type: 'note', body: 'Dort mal' });
    await ok(
      request.post(`${API}/api/entries/${feelingId}/links`, {
        data: { targetId: noteId, linkType: 'co_occurs' },
      }),
    );
    await page.keyboard.press('Escape');
    await expect(linkEditor).toBeHidden();
    await expect(e.dialog).toBeVisible();
    await expect(links.getByRole('heading', { name: 'Lié à… · 2' })).toBeVisible();
    await expect(links.locator('li')).toHaveCount(2);
  });
});
