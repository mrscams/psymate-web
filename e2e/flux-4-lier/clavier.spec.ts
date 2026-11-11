import { APIRequestContext, APIResponse, expect, test } from '@playwright/test';

import { enableProbe, graphReady } from '../flux-6-graphe/graph-support';
import { createAccount, signIn } from '../preferences/accounts';
import { expectNoAxeViolations } from '../support/axe';
import { keyboardOnly, tabTo } from '../support/clavier';

// B3 flux 4 au clavier seul (M7-04, B7, fiche 06) : une entrée ouverte depuis la timeline, L ouvre
// l'éditeur de lien, la recherche filtre, la cible se choisit aux flèches, le type parmi ceux de la
// matrice, le sens s'inverse, justification, Entrée ; puis la variante graphe (le glisser-déposer
// a pour équivalent clavier « Lier (L) » dans le détail d'une entrée de la liste équivalente).
// Aucun geste de pointeur (keyboardOnly). Contre l'API locale, jamais de mock du backend.

const API = 'http://localhost:8080';

async function ok<T>(response: Promise<APIResponse>): Promise<T> {
  const res = await response;
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
  return (res.status() === 204 ? undefined : await res.json()) as T;
}

interface Folder {
  patientId: string;
  feelingId: string;
  eventId: string;
  noteId: string;
}

/** Ressenti, événement et note sans lien ; la recherche du dossier (projection) les connaît. */
async function createFolder(api: APIRequestContext): Promise<Folder> {
  const patient = await ok<{ id: string }>(
    api.post(`${API}/api/patients`, { data: { displayName: 'Inès L.' } }),
  );
  await ok(
    api.post(`${API}/api/patients/${patient.id}/entries`, {
      data: { type: 'session', session: { modality: 'in_person' } },
    }),
  );
  const entry = async (data: Record<string, unknown>) =>
    (await ok<{ id: string }>(api.post(`${API}/api/patients/${patient.id}/entries`, { data }))).id;
  const feelingId = await entry({
    type: 'feeling',
    title: 'Anxiété 8/10',
    feeling: { emotionCode: 'anxiety', intensity: 8 },
  });
  const eventId = await entry({ type: 'event', title: "Entretien d'évaluation" });
  const noteId = await entry({
    type: 'note',
    title: 'Sommeil haché',
    body: 'Réveils nocturnes depuis deux semaines.',
  });
  await expect
    .poll(
      async () =>
        (
          await ok<{ items: { entryId: string }[] }>(
            api.get(`${API}/api/patients/${patient.id}/search`),
          )
        ).items.map((item) => item.entryId),
      { timeout: 20_000 },
    )
    .toEqual(expect.arrayContaining([feelingId, eventId, noteId]));
  return { patientId: patient.id, feelingId, eventId, noteId };
}

const linkEditor = (page: import('@playwright/test').Page) =>
  page.locator('[role="dialog"]:has(pm-link-editor-panel)');

test('flux 4 au clavier : timeline, entrée ouverte, L, recherche, cible, type, inversion, Entrée ; variante graphe', async ({
  page,
  request,
}) => {
  test.setTimeout(150_000);
  const account = await createAccount(request, 'm7-04.flux4', 'psychologist');
  const folder = await createFolder(request);
  await enableProbe(page);
  await signIn(page, account);
  const keys = await keyboardOnly(page);
  await page.goto(`/fr/patients/${folder.patientId}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Inès L.');

  // Onglet Timeline (touche 2), Tab jusqu'à la carte du ressenti, Entrée l'ouvre dans l'éditeur.
  await page.keyboard.press('2');
  await expect(page).toHaveURL(/\/timeline/);
  const card = page.locator(`pm-timeline-card article[data-entry-id="${folder.feelingId}"]`);
  await expect(card).toBeVisible();
  await tabTo(page, card, { max: 80 });
  await page.keyboard.press('Enter');
  const entryEditor = page.locator('[role="dialog"]:has(pm-entry-editor-panel)');
  await expect(entryEditor).toBeVisible();
  await expect(entryEditor.locator('pm-state [aria-busy="true"]')).toHaveCount(0);

  // L (hors d'un champ : Maj+Tab jusqu'au titre du panneau) : l'éditeur de lien s'empile.
  await tabTo(page, entryEditor.getByRole('button', { name: /Fermer/ }).first(), {
    backwards: true,
    max: 40,
  });
  await page.keyboard.press('l');
  const dialog = linkEditor(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('pm-state [aria-busy="true"]')).toHaveCount(0);
  await expect(dialog.locator('.card-name')).toHaveText('Anxiété 8/10');
  const search = dialog.getByRole('searchbox', { name: 'Rechercher une entrée du dossier' });
  await expect(search).toBeFocused();

  // Recherche : la note disparaît, l'événement reste ; Tab vers la cible, Espace la choisit.
  await page.keyboard.type('entretien');
  await expect(dialog.getByRole('radio', { name: /Sommeil haché/ })).toHaveCount(0);
  const target = dialog.getByRole('radio', { name: /Entretien d'évaluation/ });
  await tabTo(page, target, { max: 10 });
  await page.keyboard.press('Space');
  await expect(target).toBeChecked();

  // Ressenti → événement : « déclenche » refusé par la matrice ; inverser, puis le choisir.
  const relation = dialog.getByRole('group', { name: 'Relation', exact: true });
  const triggers = relation.getByRole('button', { name: 'déclenche', exact: true });
  await expect(triggers).toHaveAttribute('aria-disabled', 'true');
  const invert = dialog.getByRole('button', { name: 'Inverser le sens' });
  await tabTo(page, invert, { max: 30 });
  await page.keyboard.press('Enter');
  await expect(invert).toHaveAttribute('aria-pressed', 'true');
  // Relation avant Vers (maquette 06, UX-B7) : les puces suivent « Inverser le sens ».
  await tabTo(page, triggers, { max: 10 });
  await page.keyboard.press('Enter');
  await expect(triggers).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.locator('.reading .sentence')).toHaveText(
    "Entretien d'évaluation déclenche Anxiété 8/10",
  );
  const rationale = dialog.getByLabel('Pourquoi (facultatif)');
  await tabTo(page, rationale, { max: 30 });
  await page.keyboard.type('La nuit blanche suit l’annonce.');
  await expectNoAxeViolations(page);

  // Entrée (depuis la recherche) enregistre ; le panneau se ferme, l'éditeur d'entrée reste.
  await tabTo(page, search, { backwards: true, max: 40 });
  const created = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' && r.url().endsWith(`/api/entries/${folder.feelingId}/links`),
  );
  await page.keyboard.press('Enter');
  const response = await created;
  expect(response.status()).toBe(201);
  expect(response.request().postDataJSON()).toEqual({
    targetId: folder.eventId,
    linkType: 'triggers',
    direction: 'incoming',
    rationale: 'La nuit blanche suit l’annonce.',
  });
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Lien enregistré.')).toBeVisible();
  await expect(entryEditor).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(entryEditor).toBeHidden();

  // Variante graphe : touche 3, « Liste des liens », la note dans le tableau ? Non liée : on part
  // de l'événement (Entrée → détail), puis « Lier (L) » : même éditeur, source préremplie.
  await page.keyboard.press('3');
  await expect(page).toHaveURL(/\/graph/);
  // Le dossier entier : le ressenti et l'événement liés (la note, sans lien, n'y est pas).
  await graphReady(page, { count: 2 });
  const toggle = page.getByRole('button', { name: 'Liste des liens', exact: true });
  await tabTo(page, toggle, { max: 40 });
  await page.keyboard.press('Enter');
  const table = page.getByRole('table', { name: 'Liens du graphe (même contenu que le canevas)' });
  const eventButton = table.getByRole('button', { name: "Entretien d'évaluation" });
  await tabTo(page, eventButton, { max: 40 });
  await page.keyboard.press('Enter');
  const detail = page.getByRole('complementary', { name: "Entretien d'évaluation" });
  await expect(detail.getByRole('heading', { level: 2 })).toBeFocused();
  await tabTo(page, detail.getByRole('button', { name: 'Lier (L)' }), { max: 20 });
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.card-name')).toHaveText("Entretien d'évaluation");
  await expect(dialog.locator('label.target.linked')).toContainText('déjà lié');
  await expectNoAxeViolations(page);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

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
  keys.expectNoPointer();
});
