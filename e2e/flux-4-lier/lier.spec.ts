import { APIRequestContext, expect, Locator, Page, test } from '@playwright/test';

import { createAccount, signIn } from '../preferences/accounts';
import { expectNoAxeViolations } from '../support/axe';

// B3 flux 4 (M2-04, fiche 06) : lier deux entrées existantes, contre l'API locale (seed small,
// Mailpit), jamais de mock du backend. Chaque test crée son compte, son patient et ses entrées par
// l'API ; le panneau s'ouvre par ?link=<entryId> (ou L depuis l'éditeur d'entrée).

const API = 'http://localhost:8080';

async function ok<T>(response: Promise<import('@playwright/test').APIResponse>): Promise<T> {
  const res = await response;
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
  return (res.status() === 204 ? undefined : await res.json()) as T;
}

interface Folder {
  patientId: string;
  feelingId: string;
  eventId: string;
}

/** Patient avec une séance ouverte, un ressenti et un événement (titres connus). */
async function createFolder(api: APIRequestContext): Promise<Folder> {
  const patient = await ok<{ id: string }>(
    api.post(`${API}/api/patients`, { data: { displayName: 'Inès L.' } }),
  );
  await ok(
    api.post(`${API}/api/patients/${patient.id}/entries`, {
      data: { type: 'session', session: { modality: 'in_person' } },
    }),
  );
  const feeling = await ok<{ id: string }>(
    api.post(`${API}/api/patients/${patient.id}/entries`, {
      data: {
        type: 'feeling',
        title: 'Anxiété 8/10',
        body: "N'a pas dormi la veille.",
        feeling: { emotionCode: 'anxiety', intensity: 8 },
      },
    }),
  );
  const event = await ok<{ id: string }>(
    api.post(`${API}/api/patients/${patient.id}/entries`, {
      data: { type: 'event', title: "Entretien d'évaluation", body: 'Chez le nouvel employeur.' },
    }),
  );
  // La recherche du dossier est une projection : on attend qu'elle connaisse les deux entrées.
  await expect
    .poll(
      async () => {
        const result = await ok<{ items: { entryId: string }[] }>(
          api.get(`${API}/api/patients/${patient.id}/search`),
        );
        return result.items.map((item) => item.entryId);
      },
      { timeout: 20_000 },
    )
    .toEqual(expect.arrayContaining([feeling.id, event.id]));
  return { patientId: patient.id, feelingId: feeling.id, eventId: event.id };
}

function editor(page: Page) {
  const dialog = page.locator('[role="dialog"]:has(pm-link-editor-panel)');
  const relation = dialog.getByRole('group', { name: 'Relation', exact: true });
  return {
    dialog,
    source: dialog.locator('.card-name'),
    target: (name: string) => dialog.getByRole('radio', { name: new RegExp(name) }),
    chip: (name: string) => relation.getByRole('button', { name, exact: true }),
    invert: dialog.getByRole('button', { name: 'Inverser le sens' }),
    sentence: dialog.locator('form.editor .sentence'),
    rationale: dialog.getByLabel('Pourquoi (facultatif)'),
    search: dialog.getByRole('searchbox', { name: 'Rechercher une entrée du dossier' }),
    alert: dialog.locator('.alert[role="alert"]'),
    placed: dialog.locator('pm-placed-links li'),
  };
}

/** Le panneau a fini de glisser et ses blocs sont chargés : axe peut mesurer. */
async function settled(dialog: Locator): Promise<void> {
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('pm-state [aria-busy="true"]')).toHaveCount(0);
}

function isCreate(url: string, method: string, entryId: string): boolean {
  return method === 'POST' && url.endsWith(`/api/entries/${entryId}/links`);
}

test.describe('lier deux entrées', () => {
  test.describe.configure({ timeout: 90_000 });

  test('lier deux entrées depuis une entrée ouverte (?link=) : types de la matrice, inversion, phrase, ⏎', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'm2-04.lier', 'psychologist');
    const folder = await createFolder(request);
    await signIn(page, account);
    await page.goto(`/fr/patients/${folder.patientId}?link=${folder.feelingId}`);

    const e = editor(page);
    await settled(e.dialog);
    await expect(e.dialog.getByRole('heading', { name: 'Lier deux entrées' })).toBeVisible();
    await expect(e.source).toHaveText('Anxiété 8/10');
    await expect(e.search).toBeFocused();
    await expectNoAxeViolations(page);

    await e.target("Entretien d'évaluation").check();
    // Ressenti → événement : « déclenche » est refusé par la matrice, possible dans l'autre sens.
    await expect(e.chip('déclenche')).toHaveAttribute('aria-disabled', 'true');
    await expect(e.chip('est causé par')).not.toHaveAttribute('aria-disabled', 'true');
    await expect(e.dialog.locator('.refusals')).toContainText(
      '« déclenche » : seulement depuis événement, situation, séance. Possible en inversant le sens.',
    );
    await expect(e.sentence).toHaveText("Anxiété 8/10 … Entretien d'évaluation");

    await e.invert.click();
    await expect(e.invert).toHaveAttribute('aria-pressed', 'true');
    await expect(e.chip('déclenche')).not.toHaveAttribute('aria-disabled', 'true');
    await e.chip('déclenche').click();
    await expect(e.chip('déclenche')).toHaveAttribute('aria-pressed', 'true');
    await expect(e.sentence).toHaveText("Entretien d'évaluation déclenche Anxiété 8/10");
    await e.rationale.fill('La nuit blanche suit l’annonce de l’entretien.');
    await expectNoAxeViolations(page);

    const created = page.waitForResponse((r) =>
      isCreate(r.url(), r.request().method(), folder.feelingId),
    );
    await e.search.focus();
    await page.keyboard.press('Enter');
    const response = await created;
    expect(response.status()).toBe(201);
    expect(response.request().postDataJSON()).toEqual({
      targetId: folder.eventId,
      linkType: 'triggers',
      direction: 'incoming',
      rationale: 'La nuit blanche suit l’annonce de l’entretien.',
    });
    await expect(e.dialog).toBeHidden();
    await expect(page.getByText('Lien enregistré.')).toBeVisible();
    await expect(page).not.toHaveURL(/link=/);

    // Le serveur stocke la forme active, source = événement (jamais un type passif).
    const links = await ok<{ sourceId: string; targetId: string; linkType: string }[]>(
      request.get(`${API}/api/entries/${folder.feelingId}/links`),
    );
    expect(links).toEqual([
      expect.objectContaining({
        sourceId: folder.eventId,
        targetId: folder.feelingId,
        linkType: 'triggers',
      }),
    ]);
  });

  test('L depuis l’éditeur d’entrée ouvert : l’éditeur de lien s’empile, source = l’entrée ouverte', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'm2-04.touche-l', 'psychologist');
    const folder = await createFolder(request);
    await signIn(page, account);
    await page.goto(`/fr/patients/${folder.patientId}?entry=${folder.eventId}`);

    const entryDialog = page.locator('[role="dialog"]:has(pm-entry-editor-panel)');
    await expect(entryDialog).toBeVisible();
    await expect(entryDialog.locator('pm-state [aria-busy="true"]')).toHaveCount(0);
    // Le focus quitte le champ (une touche simple dans un champ sert à écrire).
    await entryDialog.locator('h2').click();
    await page.keyboard.press('l');

    const e = editor(page);
    await settled(e.dialog);
    await expect(e.source).toHaveText("Entretien d'évaluation");
    await expect(page.locator('[role="dialog"]')).toHaveCount(2);
    await expect(page).toHaveURL(new RegExp(`entry=${folder.eventId}`));
    await expect(page).toHaveURL(new RegExp(`link=${folder.eventId}`));
    await expectNoAxeViolations(page);

    // Échap sans choix ferme l'éditeur de lien seul ; l'éditeur d'entrée reste ouvert.
    await page.keyboard.press('Escape');
    await expect(e.dialog).toBeHidden();
    await expect(entryDialog).toBeVisible();
    await expect(page).not.toHaveURL(/link=/);
  });

  test('lien existant : 409 « Ce lien existe déjà · Modifier le type ? », puis modifier et retirer (marqué retiré)', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'm2-04.existant', 'psychologist');
    const folder = await createFolder(request);
    await ok(
      request.post(`${API}/api/entries/${folder.eventId}/links`, {
        data: { targetId: folder.feelingId, linkType: 'triggers' },
      }),
    );
    await signIn(page, account);
    await page.goto(`/fr/patients/${folder.patientId}?link=${folder.feelingId}`);

    const e = editor(page);
    await settled(e.dialog);
    await expect(e.dialog.locator('#pm-link-placed')).toHaveText(
      'Liens déjà posés sur cette entrée · 1',
    );
    await expect(e.placed).toHaveCount(1);
    await expect(e.dialog.locator('label.target.linked')).toContainText('déjà lié (déclenché par)');

    await e.target("Entretien d'évaluation").check();
    await e.invert.click();
    await e.chip('déclenche').click();
    const conflict = page.waitForResponse((r) =>
      isCreate(r.url(), r.request().method(), folder.feelingId),
    );
    await e.dialog.getByRole('button', { name: /Enregistrer le lien/ }).click();
    expect((await conflict).status()).toBe(409);
    await expect(e.alert).toContainText('Ce lien existe déjà · Modifier le type ?');
    await expectNoAxeViolations(page);

    await e.alert.getByRole('button', { name: 'Modifier le type' }).click();
    const item = e.placed.first();
    await expect(item.getByRole('button', { name: 'Modifier le type' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    const newType = item.getByRole('group', { name: 'Nouveau type' });
    await expect(newType.getByRole('button', { name: 'déclenche', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(newType.getByRole('button', { name: 'traite', exact: true })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    const patched = page.waitForResponse(
      (r) => r.request().method() === 'PATCH' && r.url().includes('/api/links/'),
    );
    await newType.getByRole('button', { name: 'aggrave', exact: true }).click();
    expect((await patched).status()).toBe(200);
    await expect(e.placed).toHaveCount(1);
    await expect(e.placed.first()).toContainText('aggravé par');

    const removed = page.waitForResponse(
      (r) => r.request().method() === 'DELETE' && r.url().includes('/api/links/'),
    );
    await e.placed.first().getByRole('button', { name: 'Retirer' }).click();
    expect((await removed).status()).toBe(204);
    await expect(e.placed).toHaveCount(1);
    await expect(e.placed.first()).toHaveClass(/removed/);
    await expect(e.placed.first().locator('.badge')).toHaveText('retiré');
    await expect(e.dialog.locator('#pm-link-placed')).toHaveText(
      'Liens déjà posés sur cette entrée · 0',
    );
    await expectNoAxeViolations(page);

    // Retiré, pas effacé : il ne figure plus parmi les liens actifs (statut superseded, G Q41).
    const links = await ok<unknown[]>(request.get(`${API}/api/entries/${folder.feelingId}/links`));
    expect(links).toEqual([]);
  });
});
