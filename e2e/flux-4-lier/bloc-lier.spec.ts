import { APIRequestContext, APIResponse, expect, Page, test } from '@playwright/test';

import { block, settled } from '../flux-3-saisie/bloc-support';
import { createAccount, signIn } from '../preferences/accounts';
import { expectNoAxeViolations } from '../support/axe';

// B3 flux 4 depuis le bloc de saisie (UX-S1, proposition 04c « Relier, pas à pas ») : un lien en un
// clic parmi les cinq cibles du rail, le verbe en clair choisi par la matrice et modifiable, `>` puis
// le début du nom, « Autre entrée… » pour une cible hors des cinq, le lien enregistré dans le même
// POST (links[], tout ou rien) et relu par GET /api/entries/{id}/links. Contre l'API locale (seed
// small, Mailpit), jamais de mock du backend.

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

interface Folder {
  patientId: string;
  situationId: string;
  noteId: string;
  eventId: string;
  oldId: string;
}

/**
 * Patient en séance, avec une situation en cours, une note, un événement récent et un événement plus
 * ancien repoussé hors des cinq cibles du rail par cinq notes ; la recherche du dossier (projection)
 * doit connaître l'ancien événement avant que « Autre entrée… » le cherche.
 */
async function createFolder(api: APIRequestContext): Promise<Folder> {
  const patient = await ok<{ id: string }>(
    api.post(`${API}/api/patients`, { data: { displayName: 'Nour K.' } }),
  );
  await expect
    .poll(
      async () => (await api.get(`${API}/api/patients/${patient.id}/sessions/current`)).status(),
      { timeout: 10_000 },
    )
    .toBe(200);
  await ok(
    api.post(`${API}/api/patients/${patient.id}/sessions/start`, {
      data: { modality: 'in_person' },
    }),
  );
  const entry = async (data: Record<string, unknown>) =>
    (await ok<{ id: string }>(api.post(`${API}/api/patients/${patient.id}/entries`, { data }))).id;
  const oldId = await entry({
    type: 'event',
    title: "Entretien d'évaluation",
    occurred: { from: '2026-09-12T00:00:00Z', precision: 'day' },
  });
  for (let i = 1; i <= 5; i++) {
    await entry({ type: 'note', title: `Note de remplissage ${i}`, body: 'sans intérêt' });
  }
  const situationId = await entry({
    type: 'situation',
    title: 'Réorganisation du service de nuit',
    occurred: { from: '2026-10-01T00:00:00Z', precision: 'month' },
  });
  const noteId = await entry({ type: 'note', title: 'Agenda du sommeil', body: 'Tenu 9 nuits.' });
  const eventId = await entry({ type: 'event', title: 'Entretien avec la cadre' });
  // La recherche du dossier est une projection : on attend qu'elle connaisse les deux entretiens.
  for (const [q, id] of [
    ['évaluation', oldId],
    ['cadre', eventId],
  ] as const) {
    await expect
      .poll(
        async () =>
          (
            await ok<{ items: { entryId: string }[] }>(
              api.get(`${API}/api/patients/${patient.id}/search?q=${encodeURIComponent(q)}`),
            )
          ).items.map((item) => item.entryId),
        { timeout: 20_000 },
      )
      .toContain(id);
  }
  return { patientId: patient.id, situationId, noteId, eventId, oldId };
}

function isCreate(url: string, method: string, patientId: string): boolean {
  return method === 'POST' && new URL(url).pathname === `/api/patients/${patientId}/entries`;
}

async function open(page: Page, folder: Folder): Promise<void> {
  await page.goto(`/fr/patients/${folder.patientId}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nour K.');
  await settled(page);
}

test.describe('relier depuis le bloc de saisie', () => {
  test.describe.configure({ timeout: 120_000 });

  test('un clic pose le lien, le verbe est écrit et se change, un second clic retire ; enregistré dans le même POST', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'ux-s1.lier', 'psychologist');
    const folder = await createFolder(request);
    await signIn(page, account);
    await open(page, folder);
    const b = block(page);

    // Étape 1 : les cinq cibles, situations en cours d'abord ; rien n'est relié.
    await b.input.focus();
    await page.keyboard.type('anx 7 se réveille vers 3 h');
    await expect(b.type('Ressenti')).toHaveAttribute('aria-pressed', 'true');
    const chips = b.links.getByRole('button', { name: /\(situation\)|\(note\)|\(événement\)/ });
    await expect(chips.first()).toHaveAccessibleName(
      'Réorganisation du service de nuit (situation)',
    );
    await expect(chips).toHaveCount(5);
    await expect(b.placed).toHaveCount(0);
    await expectNoAxeViolations(page);

    // Étape 2 : un clic pose le lien, le verbe vient de la matrice, dans le bon sens.
    await b.chip(/Réorganisation du service de nuit/).click();
    await expect(b.placed).toContainText('Réorganisation du service de nuit');
    await expect(b.verb.locator('option:checked')).toHaveText('déclenché par');
    await expect(b.verb.locator('option')).toContainText([
      'déclenché par',
      'aggravé par',
      'soulagé par',
      'survient avec',
    ]);
    await expectNoAxeViolations(page);

    // Le verbe se change parmi ceux admis pour la paire ; un second clic retire le lien.
    await b.verb.selectOption({ label: 'aggravé par' });
    await expect(b.verb.locator('option:checked')).toHaveText('aggravé par');
    await b.chip(/Réorganisation du service de nuit/).click();
    await expect(b.placed).toHaveCount(0);

    // Reposé, puis Entrée : l'entrée et le lien partent ensemble (direction incoming : la situation agit).
    await b.chip(/Réorganisation du service de nuit/).click();
    await expect(b.placed).toContainText('Réorganisation du service de nuit');
    const created = page.waitForResponse((r) =>
      isCreate(r.url(), r.request().method(), folder.patientId),
    );
    await b.input.press('Enter');
    const response = await created;
    expect(response.status(), await response.text()).toBe(201);
    expect(response.request().postDataJSON()).toMatchObject({
      type: 'feeling',
      feeling: { emotionCode: 'anxiety', intensity: 7 },
      body: 'se réveille vers 3 h',
      links: [{ targetId: folder.situationId, linkType: 'triggers', direction: 'incoming' }],
    });
    const feelingId = ((await response.json()) as { id: string }).id;
    await expect(b.input).toHaveValue('');
    await expect(b.placed).toHaveCount(0);

    // Étape 5 : GET /api/entries/{id}/links, la situation déclenche le ressenti.
    const links = await ok<LinkDto[]>(request.get(`${API}/api/entries/${feelingId}/links`));
    expect(links).toEqual([
      expect.objectContaining({
        sourceId: folder.situationId,
        targetId: feelingId,
        linkType: 'triggers',
      }),
    ]);
    await expectNoAxeViolations(page);
  });

  test('au clavier : « > » puis le début du nom sélectionne la puce ; cliquer ailleurs remplace (un seul lien)', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'ux-s1.chevron', 'psychologist');
    const folder = await createFolder(request);
    await signIn(page, account);
    await open(page, folder);
    const b = block(page);

    // Étape 3 : un événement relié à un autre événement.
    await b.input.focus();
    await page.keyboard.type('/evt refus du passage de jour > entretien');
    await expect(b.type('Événement')).toHaveAttribute('aria-pressed', 'true');
    await expect(b.detected).toHaveText('détecté depuis « /evt »');
    await expect(b.root.getByLabel('Titre')).toHaveValue('refus du passage de jour');
    await expect(b.placed).toContainText('Entretien avec la cadre');
    await expect(b.verb.locator('option:checked')).toHaveText('déclenché par');
    await expect(b.links.locator('.note-r')).toHaveText('trouvé depuis « > entretien »');
    await expectNoAxeViolations(page);

    // Une autre puce cliquée remplace la cible du `>` : toujours un seul lien.
    await b.chip(/Agenda du sommeil/).click();
    await expect(b.placed).toHaveCount(1);
    await expect(b.placed).toContainText('Agenda du sommeil');
    await expect(b.verb.locator('option:checked')).toHaveText('survient avec');
    await expect(b.links.locator('.note-r')).toHaveCount(0);

    const created = page.waitForResponse((r) =>
      isCreate(r.url(), r.request().method(), folder.patientId),
    );
    await b.input.press('Enter');
    const response = await created;
    expect(response.status(), await response.text()).toBe(201);
    expect(response.request().postDataJSON()).toMatchObject({
      type: 'event',
      title: 'refus du passage de jour',
      links: [{ targetId: folder.noteId, linkType: 'co_occurs', direction: 'outgoing' }],
    });
    const eventId = ((await response.json()) as { id: string }).id;
    const links = await ok<LinkDto[]>(request.get(`${API}/api/entries/${eventId}/links`));
    expect(links).toHaveLength(1);
    expect(links[0].linkType).toBe('co_occurs');
  });

  test('« Autre entrée… » cherche dans tout le dossier : la cible hors des cinq prend la place d’une puce et part dans le POST', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'ux-s1.autre', 'psychologist');
    const folder = await createFolder(request);
    await signIn(page, account);
    await open(page, folder);
    const b = block(page);

    await b.input.focus();
    await page.keyboard.type('anx 6 avant la réunion');
    await expect(b.chip(/Entretien d'évaluation/)).toHaveCount(0);
    await b.other.click();
    await expect(b.search).toBeFocused();
    await page.keyboard.type('éval');
    const result = b.links
      .getByRole('dialog')
      .getByRole('button', { name: /Entretien d'évaluation/ });
    await expect(result).toBeVisible();
    await expectNoAxeViolations(page);
    await page.keyboard.press('Enter');
    await expect(b.search).toHaveCount(0);
    await expect(b.placed).toContainText("Entretien d'évaluation");
    await expect(b.verb.locator('option:checked')).toHaveText('déclenché par');
    await expect(b.other).toBeFocused();

    // Un autre résultat remplace le précédent : toujours un seul lien.
    await b.other.click();
    await expect(b.search).toBeFocused();
    await page.keyboard.type('cadre');
    await b.links
      .getByRole('dialog')
      .getByRole('button', { name: /Entretien avec la cadre/ })
      .click();
    await expect(b.placed).toHaveCount(1);
    await expect(b.placed).toContainText('Entretien avec la cadre');
    await expect(b.chip(/Entretien d'évaluation/)).toHaveCount(0);

    // Retour à l'entrée ancienne, puis Entrée.
    await b.other.click();
    await expect(b.search).toBeFocused();
    await page.keyboard.type('éval');
    await expect(result).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(b.placed).toContainText("Entretien d'évaluation");
    const created = page.waitForResponse((r) =>
      isCreate(r.url(), r.request().method(), folder.patientId),
    );
    await b.input.press('Enter');
    const response = await created;
    expect(response.status(), await response.text()).toBe(201);
    expect(response.request().postDataJSON()).toMatchObject({
      type: 'feeling',
      links: [{ targetId: folder.oldId, linkType: 'triggers', direction: 'incoming' }],
    });
    const feelingId = ((await response.json()) as { id: string }).id;
    const links = await ok<LinkDto[]>(request.get(`${API}/api/entries/${feelingId}/links`));
    expect(links).toEqual([
      expect.objectContaining({
        sourceId: folder.oldId,
        targetId: feelingId,
        linkType: 'triggers',
      }),
    ]);
    await expectNoAxeViolations(page);
  });
});
