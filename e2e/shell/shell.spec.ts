import {
  APIRequestContext,
  expect,
  Page,
  request as playwrightRequest,
  test,
} from '@playwright/test';

import { createAccount, signIn } from '../preferences/accounts';
import { expectNoAxeViolations } from '../support/axe';

// Page patient et en-tête permanent (M1-07, B2, fiche 00 §2) : contre l'API locale (seed small,
// Mailpit), jamais de mock du backend. Chaque test crée ses comptes jetables : les séances démarrées
// ou clôturées ici ne touchent aucun patient du seed.

const API = 'http://localhost:8080';

async function createPatient(
  api: APIRequestContext,
  displayName: string,
  followUp?: Record<string, string>,
): Promise<string> {
  const response = await api.post(`${API}/api/patients`, { data: { displayName, followUp } });
  expect(response.status(), await response.text()).toBe(201);
  return ((await response.json()) as { id: string }).id;
}

function header(page: Page) {
  return {
    name: page.getByRole('heading', { level: 1 }),
    session: page.locator('pm-patient-header .session-text'),
    start: page.getByRole('button', { name: 'Démarrer la séance' }),
    close: page.getByRole('button', { name: 'Clôturer la séance' }),
    tabs: page.getByRole('navigation', { name: 'Dossier' }),
    capture: page.getByRole('textbox', { name: 'Noter quelque chose' }),
  };
}

function counter(page: Page) {
  return page.getByRole('button', { name: /^Compteur : \d+$/ });
}

test('onglets : 1 2 3 et clic, état conservé au retour, inactifs dans la barre de capture', async ({
  page,
  request,
}) => {
  const account = await createAccount(request, 'm1-07.onglets', 'psychologist');
  const id = await createPatient(request, 'Inès M.');
  await signIn(page, account);

  await page.goto(`/fr/patients/${id}`);
  const h = header(page);
  await expect(h.name).toHaveText('Inès M.');
  await expect(h.tabs.getByRole('link', { name: /Vue d'ensemble/ })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByRole('heading', { level: 2, name: "Vue d'ensemble" })).toBeVisible();
  await expectNoAxeViolations(page);

  // L'onglet 1 range son compteur (rememberTab) ; on part sur la Timeline par clic.
  await counter(page).click();
  await counter(page).click();
  await expect(counter(page)).toHaveText('Compteur : 2');
  await h.tabs.getByRole('link', { name: /Timeline/ }).click();
  await expect(page).toHaveURL(new RegExp(`/fr/patients/${id}/timeline$`));
  await expect(page.getByRole('heading', { level: 2, name: 'Timeline' })).toBeVisible();
  await expect(counter(page)).toHaveText('Compteur : 0');
  await counter(page).click();

  // Touches : 3 → Graphe, 1 → retour à l'onglet 1 avec son état, 2 → Timeline avec le sien.
  await page.keyboard.press('3');
  await expect(page).toHaveURL(new RegExp(`/fr/patients/${id}/graph$`));
  await expect(page.getByRole('heading', { level: 2, name: 'Graphe' })).toBeVisible();
  await page.keyboard.press('1');
  await expect(page).toHaveURL(new RegExp(`/fr/patients/${id}$`));
  await expect(counter(page)).toHaveText('Compteur : 2');
  await page.keyboard.press('2');
  await expect(counter(page)).toHaveText('Compteur : 1');
  await expectNoAxeViolations(page);

  // Un champ a le focus : 1 2 3 s'écrivent, l'onglet ne change pas.
  await h.capture.click();
  await page.keyboard.type('312');
  await expect(h.capture).toHaveValue('312');
  await expect(page).toHaveURL(new RegExp(`/fr/patients/${id}/timeline$`));

  // L'ancienne destination de M1-06 (après création) mène à l'onglet 1.
  await page.goto(`/fr/patients/${id}/overview`);
  await expect(page).toHaveURL(new RegExp(`/fr/patients/${id}$`));
  await expect(h.name).toHaveText('Inès M.');
});

test('Démarrer puis Clôturer la séance : en cours sans rechargement, durée par défaut, dernière séance', async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const account = await createAccount(request, 'm1-07.seance', 'psychologist');
  // Suivi en visio (fiche 16) : les séances démarrées ici le sont en visio.
  const id = await createPatient(request, 'Louis R.', { modality: 'video' });
  await signIn(page, account);

  await page.goto(`/fr/patients/${id}`);
  const h = header(page);
  await expect(h.name).toHaveText('Louis R.');
  await expect(h.start).toBeVisible();
  // Marqueur posé dans la page : il disparaîtrait avec un rechargement.
  await page.evaluate(() => ((window as unknown as { m107: number }).m107 = 1));

  const started = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/api/patients/${id}/sessions/start`) && r.request().method() === 'POST',
  );
  await h.start.click();
  expect((await started).status()).toBe(201);
  expect((await started).request().postDataJSON()).toEqual({ modality: 'video' });
  await expect(h.session).toContainText('en cours depuis');
  await expect(h.close).toBeVisible();
  // B3 flux 3 et 6 : après Démarrer, la barre de capture prend le focus pour noter au clavier.
  await expect(h.capture).toBeFocused();
  await expect(page.getByText('Séance démarrée.')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { m107?: number }).m107)).toBe(1);
  await expectNoAxeViolations(page);

  // Clôturer : dialogue avec la durée par défaut (préférence absente → 60 min).
  await h.close.click();
  const dialog = page.getByRole('dialog', { name: 'Clôturer la séance' });
  await expect(dialog).toBeVisible();
  const duration = dialog.getByLabel('Durée (min)');
  await expect(duration).toHaveValue('60');
  await expect(duration).toBeFocused();
  await dialog.getByLabel('Compte rendu (facultatif)').fill('Point sur le sommeil.');
  await expectNoAxeViolations(page);

  // Les touches 1 2 3 ne naviguent pas derrière le dialogue.
  await dialog.getByRole('button', { name: 'Annuler' }).focus();
  await page.keyboard.press('3');
  await expect(page).toHaveURL(new RegExp(`/fr/patients/${id}$`));

  const closed = page.waitForResponse(
    (r) => r.url().includes('/api/sessions/') && r.url().endsWith('/close'),
  );
  await dialog.getByRole('button', { name: 'Clôturer', exact: true }).click();
  const response = await closed;
  expect(response.status()).toBe(200);
  expect(response.request().postDataJSON()).toEqual({
    durationMin: 60,
    summary: 'Point sur le sommeil.',
  });
  await expect(dialog).toBeHidden();
  await expect(h.session).toContainText('Dernière séance :');
  await expect(h.start).toBeVisible();
  await expect(page.getByText('Séance clôturée.')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { m107?: number }).m107)).toBe(1);
  await expectNoAxeViolations(page);
});

test('Clôturer propose la durée de la préférence (45 min)', async ({ page, request }) => {
  const account = await createAccount(request, 'm1-07.duree', 'psychologist');
  const prefs = await request.patch(`${API}/api/me/preferences`, {
    data: { 'sessions.defaultDurationMin': 45 },
  });
  expect(prefs.status(), await prefs.text()).toBe(200);
  const id = await createPatient(request, 'Nora K.');
  const start = await request.post(`${API}/api/patients/${id}/sessions/start`, {
    data: { modality: 'in_person' },
  });
  expect(start.status(), await start.text()).toBe(201);
  await signIn(page, account);

  await page.goto(`/fr/patients/${id}`);
  const h = header(page);
  await expect(h.session).toContainText('en cours depuis');
  await h.close.click();
  const dialog = page.getByRole('dialog', { name: 'Clôturer la séance' });
  await expect(dialog.getByLabel('Durée (min)')).toHaveValue('45');
  const closed = page.waitForResponse(
    (r) => r.url().includes('/api/sessions/') && r.url().endsWith('/close'),
  );
  await dialog.getByRole('button', { name: 'Clôturer', exact: true }).click();
  expect((await closed).request().postDataJSON()).toEqual({ durationMin: 45 });
  await expect(h.session).toContainText('Dernière séance :');
  await expectNoAxeViolations(page);
});

test("patient d'un autre praticien : 403 PATIENT_FORBIDDEN, état erreur du shell, pas de redirection", async ({
  page,
  request,
}) => {
  // Le propriétaire (« karim ») a sa propre session d'API ; « claire » ouvre son dossier.
  const owner = await playwrightRequest.newContext();
  await createAccount(owner, 'm1-07.karim', 'psychologist');
  const id = await createPatient(owner, 'Patient de Karim');
  await owner.dispose();

  const claire = await createAccount(request, 'm1-07.claire', 'psychologist');
  await signIn(page, claire);
  const refused = page.waitForResponse(
    (r) => r.url().endsWith(`/api/patients/${id}`) && r.request().method() === 'GET',
  );
  await page.goto(`/fr/patients/${id}/timeline`);
  const response = await refused;
  expect(response.status()).toBe(403);
  expect(((await response.json()) as { code: string }).code).toBe('PATIENT_FORBIDDEN');

  const alert = page.getByRole('alert');
  await expect(alert).toContainText("Ce dossier n'est pas le vôtre");
  await expect(page.getByRole('heading', { level: 1, name: 'Dossier patient' })).toBeAttached();
  await expect(page.getByText('Patient de Karim')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Réessayer' })).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/fr/patients/${id}/timeline$`));
  await expectNoAxeViolations(page);

  await page.getByRole('link', { name: 'Retour à la liste' }).click();
  await expect(page).toHaveURL(/\/fr\/patients$/);
});
