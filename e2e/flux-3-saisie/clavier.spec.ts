import { APIRequestContext, APIResponse, expect, test } from '@playwright/test';

import { createAccount, signIn } from '../preferences/accounts';
import { setPreferences } from '../flux-6-vue-ensemble/overview-data';
import { expectNoAxeViolations } from '../support/axe';
import { keyboardOnly, tabTo } from '../support/clavier';

// B3 flux 3 au clavier seul (M7-04, B5, B7 ; bloc de saisie UX-S1) : « Démarrer la séance » au
// clavier, le bloc de saisie prend le focus, « /res anxiété 8 n'a pas dormi », Tab jusqu'à la rangée
// « Lié à », Espace presse la puce de l'événement (verbe proposé par la matrice), Entrée enregistre en
// final ; l'entrée apparaît dans l'activité récente, le bloc est vide et garde le focus ; Ctrl+S
// enregistre un brouillon ; Clôturer la séance au clavier. Aucun geste de pointeur (keyboardOnly).
// Contre l'API locale (seed small, Mailpit), jamais de mock du backend.

const API = 'http://localhost:8080';

async function ok<T>(response: Promise<APIResponse>): Promise<T> {
  const res = await response;
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
  return (res.status() === 204 ? undefined : await res.json()) as T;
}

/** Patient, séance d'accueil (créée en différé par l'API) et un événement à lier. */
async function folder(api: APIRequestContext): Promise<{ patientId: string; eventId: string }> {
  const { id: patientId } = await ok<{ id: string }>(
    api.post(`${API}/api/patients`, { data: { displayName: 'Chloé R.' } }),
  );
  await expect
    .poll(
      async () => (await api.get(`${API}/api/patients/${patientId}/sessions/current`)).status(),
      { timeout: 10_000 },
    )
    .toBe(200);
  const { id: eventId } = await ok<{ id: string }>(
    api.post(`${API}/api/patients/${patientId}/entries`, {
      data: { type: 'event', title: 'Entretien annuel' },
    }),
  );
  return { patientId, eventId };
}

test('flux 3 au clavier : démarrer, /res anxiété 8, Tab + Espace dans le rail, Entrée, Ctrl+S, clôturer', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const account = await createAccount(request, 'm7-04.flux3', 'psychologist');
  await setPreferences(request, { 'overview.view': 'complete' });
  const { patientId, eventId } = await folder(request);
  await signIn(page, account);
  const keys = await keyboardOnly(page);
  await page.goto(`/fr/patients/${patientId}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Chloé R.');
  const input = page.getByRole('textbox', { name: 'Noter quelque chose' });
  const root = page.locator('pm-capture-block');

  // 1. « Démarrer la séance » : Tab, Entrée ; l'en-tête dit « en cours », la barre a le focus.
  const start = page.getByRole('button', { name: 'Démarrer la séance' });
  await tabTo(page, start);
  await page.keyboard.press('Enter');
  await expect(page.locator('.session-text')).toContainText('en cours');
  await expect(input).toBeFocused();

  // 2-3. La saisie interprétée : la puce Ressenti pressée, émotion, intensité dans les champs.
  await page.keyboard.type("/res anxiété 8 n'a pas dormi", { delay: 30 });
  await expect(root.getByRole('button', { name: 'Ressenti', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(root.getByRole('combobox', { name: 'Émotion' })).toHaveValue('Anxiété');
  await expect(root.getByRole('slider', { name: 'Intensité' })).toHaveAttribute(
    'aria-valuenow',
    '8',
  );

  // 4. « Lié à » : Tab jusqu'à la puce de l'événement, Espace la presse (verbe proposé par la matrice).
  const target = root.getByRole('button', { name: /Entretien annuel/ });
  await tabTo(page, target, { max: 12 });
  await expect(target).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Space');
  const placed = root.locator('pm-capture-links .tchip.pressed');
  await expect(placed).toContainText('Entretien annuel');
  await expect(
    root.getByRole('combobox', { name: /^Verbe du lien avec/ }).locator('option:checked'),
  ).toHaveText('déclenché par');
  await expect(root.locator('[aria-busy="true"]')).toHaveCount(0);
  await expectNoAxeViolations(page);

  // 5. Entrée enregistre en final (depuis la rangée : retour au texte par Maj+Tab).
  await tabTo(page, input, { backwards: true, max: 12 });
  const created = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      new URL(r.url()).pathname === `/api/patients/${patientId}/entries`,
  );
  await page.keyboard.press('Enter');
  const response = await created;
  expect(response.status(), await response.text()).toBe(201);
  expect(response.request().postDataJSON()).toMatchObject({
    type: 'feeling',
    status: 'final',
    feeling: { emotionCode: 'anxiety', intensity: 8 },
    body: "n'a pas dormi",
    links: [{ targetId: eventId, linkType: 'triggers', direction: 'incoming' }],
  });

  // 6. L'entrée apparaît dans « Activité récente » ; le bloc est vide et garde le focus.
  await expect(input).toHaveValue('');
  await expect(input).toBeFocused();
  const recent = page
    .locator('pm-overview-block section')
    .filter({ has: page.getByRole('heading', { level: 3, name: 'Activité récente' }) });
  // Ressenti sans titre : nommé par son émotion et son intensité (titre de repli, UX-A5, UX-B4).
  await expect(recent.getByRole('link', { name: /^Anxiété 8\/10/ })).toBeVisible();

  // Ctrl+S : brouillon, à compléter après la séance.
  await page.keyboard.type('note à compléter après la séance');
  const draft = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      new URL(r.url()).pathname === `/api/patients/${patientId}/entries`,
  );
  await page.keyboard.press('Control+s');
  const drafted = await draft;
  expect(drafted.status()).toBe(201);
  expect(drafted.request().postDataJSON()).toMatchObject({ status: 'draft' });
  await expect(input).toHaveValue('');
  await expect(input).toBeFocused();
  await expectNoAxeViolations(page);

  // Clôturer la séance : Tab jusqu'au bouton, Entrée, durée proposée, Entrée.
  const close = page.getByRole('button', { name: /Clôturer/ });
  await tabTo(page, close, { backwards: true });
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expectNoAxeViolations(page);
  const closed = page.waitForResponse(
    (r) => r.request().method() === 'POST' && /\/sessions\/[^/]+\/close$/.test(r.url()),
  );
  await tabTo(page, dialog.getByRole('button', { name: /Clôturer/ }), { max: 20 });
  await page.keyboard.press('Enter');
  expect((await closed).ok()).toBe(true);
  await expect(page.locator('.session-text')).not.toContainText('en cours');
  await expect(input).toBeFocused();
  keys.expectNoPointer();
});
