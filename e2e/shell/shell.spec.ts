import {
  APIRequestContext,
  expect,
  Page,
  request as playwrightRequest,
  test,
} from '@playwright/test';

import { createAccount, signIn } from '../preferences/accounts';
import { expectNoAxeViolations } from '../support/axe';

// Page patient et en-tête permanent (M1-07, B2, fiche 00 §2 ; UX-S2 : en-tête compact, barre de
// séance, bloc de saisie dans la colonne de contenu) : contre l'API locale (seed small, Mailpit),
// jamais de mock du backend. Chaque test crée ses comptes jetables : les séances démarrées ou
// clôturées ici ne touchent aucun patient du seed.

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
    /** « Dernière séance : … » dans l'en-tête, « Séance en cours · … » dans la barre de séance. */
    session: page.locator('.session-text'),
    bar: page.locator('pm-session-bar .session-bar'),
    start: page.getByRole('button', { name: 'Démarrer la séance' }),
    close: page.getByRole('button', { name: 'Clôturer la séance' }),
    tabs: page.getByRole('navigation', { name: 'Dossier' }),
    capture: page.getByRole('textbox', { name: 'Noter quelque chose' }),
  };
}

/** La séance d'accueil dans « Dernières séances » de la vue d'ensemble (M4-05), dépliable. */
function intakeToggle(page: Page) {
  return page.locator('pm-overview-sessions button[aria-expanded]').first();
}

test('onglets : 1 2 3 et clic, état conservé au retour, inactifs dans la barre de capture', async ({
  page,
  request,
}) => {
  const account = await createAccount(request, 'm1-07.onglets', 'psychologist');
  // Vue complète (M4-05) : l'onglet 1 a des séances dépliables, son état rangé par rememberTab.
  const prefs = await request.patch(`${API}/api/me/preferences`, {
    data: { 'overview.view': 'complete' },
  });
  expect(prefs.status(), await prefs.text()).toBe(200);
  const id = await createPatient(request, 'Inès M.');
  // La séance d'accueil est créée de façon asynchrone après le patient : on l'attend.
  await expect
    .poll(async () => (await request.get(`${API}/api/patients/${id}/sessions/current`)).status(), {
      timeout: 10_000,
    })
    .toBe(200);
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

  // L'onglet 1 (vue d'ensemble, M4-05) range ses séances dépliées (rememberTab) : on replie la
  // séance d'accueil, puis on part sur le Graphe (M2-06) par clic : patient sans lien, état vide.
  // Sans situation en cours reliée, le graphe s'ouvre sur tout le dossier (?root=all, UX-B3).
  await expect(intakeToggle(page)).toHaveAttribute('aria-expanded', 'true');
  await intakeToggle(page).click();
  await expect(intakeToggle(page)).toHaveAttribute('aria-expanded', 'false');
  await h.tabs.getByRole('link', { name: /Graphe/ }).click();
  await expect(page).toHaveURL(new RegExp(`/fr/patients/${id}/graph\\?root=all$`));
  await expect(page.getByRole('heading', { level: 2, name: 'Graphe des liens' })).toBeAttached();
  await expect(page.getByText('Les liens que vous créez apparaîtront ici')).toBeVisible();
  await expect(intakeToggle(page)).toHaveCount(0);

  // Touches : 2 → Timeline (M3-02), 1 → retour à l'onglet 1 avec son état, 3 → Graphe.
  await page.keyboard.press('2');
  await expect(page).toHaveURL(new RegExp(`/fr/patients/${id}/timeline$`));
  await expect(page.getByRole('heading', { level: 2, name: 'Timeline' })).toBeAttached();
  await page.keyboard.press('1');
  await expect(page).toHaveURL(new RegExp(`/fr/patients/${id}$`));
  await expect(intakeToggle(page)).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('3');
  await expect(page).toHaveURL(new RegExp(`/fr/patients/${id}/graph\\?root=all$`));
  await expect(page.getByText('Les liens que vous créez apparaîtront ici')).toBeVisible();
  await expectNoAxeViolations(page);

  // Un champ a le focus : 1 2 3 s'écrivent, l'onglet ne change pas.
  await h.capture.click();
  await page.keyboard.type('312');
  await expect(h.capture).toHaveValue('312');
  await expect(page).toHaveURL(new RegExp(`/fr/patients/${id}/graph\\?root=all$`));

  // L'ancienne destination de M1-06 (après création) mène à l'onglet 1.
  await page.goto(`/fr/patients/${id}/overview`);
  await expect(page).toHaveURL(new RegExp(`/fr/patients/${id}$`));
  await expect(h.name).toHaveText('Inès M.');
});

test('« suivi·e depuis » : même début de suivi dans l’en-tête et les faits clés (UX-G2c)', async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const account = await createAccount(request, 'ux-g2c.suivi', 'psychologist');
  const prefs = await request.patch(`${API}/api/me/preferences`, {
    data: { 'overview.view': 'complete', 'overview.window': '12m' },
  });
  expect(prefs.status(), await prefs.text()).toBe(200);
  // Dossier neuf : le suivi commence à la création, que la séance d'accueil confirme.
  const fresh = await createPatient(request, 'Agathe N.');
  // Dossier repris après coup : créé aujourd'hui, avec un contact daté de deux mois plus tôt.
  const resumed = await createPatient(request, 'Basile P.');
  const past = new Date(Date.now() - 60 * 24 * 3600 * 1000);
  past.setUTCHours(10, 0, 0, 0);
  const contact = await request.post(`${API}/api/patients/${resumed}/sessions/contact`, {
    data: { modality: 'phone', occurredFrom: past.toISOString(), body: 'Appel de reprise.' },
  });
  expect(contact.status(), await contact.text()).toBe(201);
  await signIn(page, account);

  const meta = page.locator('pm-patient-header .meta');
  const facts = page.getByRole('list', { name: 'Traitement, suivi et drapeaux' });
  const paris = { timeZone: 'Europe/Paris' } as const;
  const today = new Date();

  await page.goto(`/fr/patients/${fresh}`);
  await expect(header(page).name).toHaveText('Agathe N.');
  // UX-S2 : mois abrégé dans l'en-tête compact (« suivi·e depuis sept. 2026 »).
  const month = new Intl.DateTimeFormat('fr-FR', { ...paris, month: 'short', year: 'numeric' });
  const day = new Intl.DateTimeFormat('fr-FR', { ...paris, dateStyle: 'medium' });
  await expect(meta).toContainText(`suivi·e depuis ${month.format(today)}`);
  await expect(facts).toContainText(`Suivi depuis le ${day.format(today)}`);
  await expectNoAxeViolations(page);

  // La création ne vaut plus début de suivi : l'en-tête ne dit pas « depuis <ce mois> » au-dessus
  // de faits clés qui montrent une séance plus ancienne.
  // L'en-tête lit le mois de la première séance (résumé de la chronologie) : on l'attend, sans quoi
  // l'absence de mention serait vraie avant même la lecture.
  const summary = page.waitForResponse(
    (r) =>
      r.url().includes(`/api/patients/${resumed}/timeline/summary`) &&
      r.url().includes('granularity=month'),
  );
  await page.goto(`/fr/patients/${resumed}`);
  expect((await summary).status()).toBe(200);
  await expect(header(page).name).toHaveText('Basile P.');
  await expect(facts).toContainText(`Suivi depuis le ${day.format(past)} (première séance connue)`);
  // Sans âge ni suivi, la ligne « meta » n'est pas rendue : on lit toute l'identité.
  await expect(page.locator('pm-patient-header .who')).not.toContainText('suivi·e depuis');
  await expectNoAxeViolations(page);
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
  // UX-S2 : la barre de séance (au-dessus de l'en-tête) dit la modalité et l'heure de début, le
  // chronomètre tourne, la durée prévue est celle des préférences (60 par défaut) ; Démarrer a
  // disparu de l'en-tête ; l'onglet 1 s'appelle « Séance ».
  await expect(h.bar).toBeVisible();
  await expect(h.session).toContainText('Séance en cours · visio · démarrée à');
  await expect(h.bar.locator('.timer')).toHaveText(/^00:00:\d\d$/);
  await expect(h.bar.locator('.planned')).toHaveText('sur 60 min prévues');
  await expect(h.start).toHaveCount(0);
  await expect(h.tabs.getByRole('link', { name: 'Séance', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
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
  await expect(h.bar).toHaveCount(0);
  await expect(h.session).toContainText('Dernière séance :');
  await expect(h.session).toContainText('· visio · 60 min');
  await expect(h.start).toBeVisible();
  await expect(h.tabs.getByRole('link', { name: /Vue d'ensemble/ })).toHaveAttribute(
    'aria-current',
    'page',
  );
  // B3 flux 3 et 6 : après Clôturer aussi, le bloc de saisie prend le focus.
  await expect(h.capture).toBeFocused();
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
  await expect(h.session).toContainText('Séance en cours · cabinet');
  await expect(h.bar.locator('.planned')).toHaveText('sur 45 min prévues');
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

test('UX-S2 : en-tête compact (identité 44, onglets 38), barre de séance de 44, bloc de saisie dans la colonne de contenu, colonne latérale de 340 px repliée sous 900 px', async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const account = await createAccount(request, 'ux-s2.mesures', 'psychologist');
  const id = await createPatient(request, 'Nour K.', { since: '2026-09-01' });
  await signIn(page, account);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`/fr/patients/${id}`);
  const h = header(page);
  await expect(h.name).toHaveText('Nour K.');
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });

  // Mesures de la maquette 04b « Anatomy and measures », avec une marge pour les polices Linux.
  const within = (value: number, expected: number, slack = 4) => {
    expect(value, `${expected} px attendus (marge ${slack})`).toBeGreaterThanOrEqual(expected);
    expect(value).toBeLessThanOrEqual(expected + slack);
  };
  const identity = page.locator('pm-patient-header .phead-row');
  within((await identity.boundingBox())!.height, 44);
  // Nom, âge et suivi sur une même ligne ; « Dernière séance » ou Démarrer à droite.
  const nameBox = (await h.name.boundingBox())!;
  const metaBox = (await page.locator('pm-patient-header .meta').boundingBox())!;
  expect(Math.abs(metaBox.y + metaBox.height - (nameBox.y + nameBox.height))).toBeLessThan(8);
  const startBox = (await h.start.boundingBox())!;
  expect(startBox.y).toBeLessThan(nameBox.y + nameBox.height);
  for (const tab of ["Vue d'ensemble", 'Timeline', 'Graphe']) {
    within(
      (await h.tabs.getByRole('link', { name: new RegExp(tab) }).boundingBox())!.height,
      38,
      2,
    );
  }
  // Le bloc de saisie est sous l'en-tête, plus dedans, et hors séance il est replié.
  await expect(page.locator('pm-patient-header pm-capture-block')).toHaveCount(0);
  const block = page.locator('pm-capture-block .block');
  await expect(block).toHaveClass(/collapsed/);
  const headerBox = (await page.locator('pm-patient-header').boundingBox())!;
  expect((await block.boundingBox())!.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height);
  await expect(page.locator('.pad-layout aside.ctx')).toHaveCount(0);
  await expect(h.bar).toHaveCount(0);
  await expectNoAxeViolations(page);

  // En séance : barre de 44 px au-dessus de l'en-tête, identité toujours 44, colonne latérale.
  await h.start.click();
  await expect(h.bar).toBeVisible();
  within((await h.bar.boundingBox())!.height, 44);
  expect((await h.bar.boundingBox())!.y).toBeLessThan(
    (await page.locator('pm-patient-header').boundingBox())!.y,
  );
  within((await identity.boundingBox())!.height, 44);
  await expect(h.tabs.getByRole('link', { name: 'Séance', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(block).toHaveClass(/expanded/);
  await expect(h.capture).toBeFocused();
  const timer = h.bar.locator('.timer');
  await expect(timer).toHaveText(/^00:00:\d\d$/);
  expect(await timer.evaluate((el) => getComputedStyle(el).fontVariantNumeric)).toBe(
    'tabular-nums',
  );
  const aside = page.locator('.pad-layout aside.ctx');
  await expect(aside).toBeVisible();
  expect(Math.round((await aside.boundingBox())!.width)).toBe(340);
  const mainBox = (await page.locator('.pad-layout .pad-main').boundingBox())!;
  const asideBox = (await aside.boundingBox())!;
  expect(asideBox.x).toBeGreaterThanOrEqual(mainBox.x + mainBox.width);
  expect(Math.abs(asideBox.y - mainBox.y)).toBeLessThan(2);
  await expect(aside.getByRole('heading', { name: 'Raccourcis dans le texte' })).toBeVisible();
  await expectNoAxeViolations(page);

  // Sous 900 px : la colonne latérale passe sous la colonne principale ; rien ne déborde.
  await page.setViewportSize({ width: 800, height: 720 });
  const narrowMain = (await page.locator('.pad-layout .pad-main').boundingBox())!;
  const narrowAside = (await aside.boundingBox())!;
  expect(narrowAside.y).toBeGreaterThanOrEqual(narrowMain.y + narrowMain.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(800);

  // Les touches 1 2 3 restent celles des onglets (hors champ).
  await page.getByRole('heading', { level: 1 }).click();
  await page.keyboard.press('2');
  await expect(page).toHaveURL(new RegExp(`/fr/patients/${id}/timeline$`));
  await expect(h.bar).toBeVisible();
  await expect(block).toBeVisible();
  await page.keyboard.press('1');
  await expect(page).toHaveURL(new RegExp(`/fr/patients/${id}$`));
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
