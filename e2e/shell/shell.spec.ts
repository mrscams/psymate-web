import {
  APIRequestContext,
  expect,
  Page,
  request as playwrightRequest,
  test,
} from '@playwright/test';

import { createAccount, signIn } from '../preferences/accounts';
import { expectNoAxeViolations } from '../support/axe';
import { themeFolder } from '../theme/theme-support';

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

/** « Voir les données » du graphe de la vue d'ensemble (UX-S6), rangé dans la mémoire du dossier. */
function dataToggle(page: Page) {
  return page.locator('pm-overview-feelings button[aria-expanded]');
}

test('onglets : 1 2 3 et clic, état conservé au retour, inactifs dans la barre de capture', async ({
  page,
  request,
}) => {
  const account = await createAccount(request, 'm1-07.onglets', 'psychologist');
  const id = await createPatient(request, 'Inès M.');
  // La séance d'accueil est créée de façon asynchrone après le patient : on l'attend.
  await expect
    .poll(async () => (await request.get(`${API}/api/patients/${id}/sessions/current`)).status(), {
      timeout: 10_000,
    })
    .toBe(200);
  // Le bloc de saisie n'existe qu'en séance (UX-S1) : on en ouvre une pour la fin du test.
  const start = await request.post(`${API}/api/patients/${id}/sessions/start`, {
    data: { modality: 'in_person' },
  });
  expect(start.status(), await start.text()).toBe(201);
  // Un ressenti dans la séance : le graphe de la vue d'ensemble a ses données (« Voir les données »).
  const feeling = await request.post(`${API}/api/patients/${id}/entries`, {
    data: {
      type: 'feeling',
      feeling: { emotionCode: 'anxiety', intensity: 5 },
      occurred: { from: new Date().toISOString(), precision: 'day' },
      sessionId: ((await start.json()) as { id: string }).id,
    },
  });
  expect(feeling.status(), await feeling.text()).toBe(201);
  await signIn(page, account);

  await page.goto(`/fr/patients/${id}`);
  const h = header(page);
  await expect(h.name).toHaveText('Inès M.');
  // Séance ouverte : le dossier s'ouvre sur l'onglet Séance (UX-S3), que l'onglet 1 désigne (UX-S2) ;
  // « Vue d'ensemble » reste à un clic, à droite des onglets, et n'y renvoie pas une seconde fois.
  await expect(page).toHaveURL(new RegExp(`/fr/patients/${id}/session$`));
  await expect(h.tabs.getByRole('link', { name: 'Séance', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(
    page.getByRole('heading', { level: 2, name: 'Noté pendant cette séance' }),
  ).toBeVisible();
  await h.tabs.getByRole('link', { name: /Vue d'ensemble/ }).click();
  await expect(page).toHaveURL(new RegExp(`/fr/patients/${id}$`));
  await expect(h.tabs.getByRole('link', { name: /Vue d'ensemble/ })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByRole('heading', { level: 2, name: "Vue d'ensemble" })).toBeVisible();
  await expectNoAxeViolations(page);

  // L'onglet 1 (vue d'ensemble, UX-S6) range « Voir les données » (rememberTab) : on déplie le
  // tableau, puis on part sur le Graphe (M2-06) par clic : patient sans lien, état vide.
  // Sans situation en cours reliée, le graphe s'ouvre sur tout le dossier (?root=all, UX-B3).
  await expect(dataToggle(page)).toHaveAttribute('aria-expanded', 'false');
  await dataToggle(page).click();
  await expect(dataToggle(page)).toHaveAttribute('aria-expanded', 'true');
  await h.tabs.getByRole('link', { name: /Graphe/ }).click();
  await expect(page).toHaveURL(new RegExp(`/fr/patients/${id}/graph\\?root=all$`));
  await expect(page.getByRole('heading', { level: 2, name: 'Graphe des liens' })).toBeAttached();
  await expect(page.getByText('Les liens que vous créez apparaîtront ici')).toBeVisible();
  await expect(dataToggle(page)).toHaveCount(0);

  // Touches : 2 → Timeline (M3-02), 1 → l'onglet Séance (séance ouverte, UX-S3) ; la vue
  // d'ensemble par son lien, avec son état ; 3 → Graphe.
  await page.keyboard.press('2');
  await expect(page).toHaveURL(new RegExp(`/fr/patients/${id}/timeline$`));
  await expect(page.getByRole('heading', { level: 2, name: 'Timeline' })).toBeAttached();
  await page.keyboard.press('1');
  await expect(page).toHaveURL(new RegExp(`/fr/patients/${id}/session$`));
  await h.tabs.getByRole('link', { name: /Vue d'ensemble/ }).click();
  await expect(page).toHaveURL(new RegExp(`/fr/patients/${id}$`));
  await expect(dataToggle(page)).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('3');
  await expect(page).toHaveURL(new RegExp(`/fr/patients/${id}/graph\\?root=all$`));
  await expect(page.getByText('Les liens que vous créez apparaîtront ici')).toBeVisible();
  await expectNoAxeViolations(page);

  // Un champ a le focus : 1 2 3 s'écrivent, l'onglet ne change pas.
  await h.capture.click();
  await page.keyboard.type('312');
  await expect(h.capture).toHaveValue('312');
  await expect(page).toHaveURL(new RegExp(`/fr/patients/${id}/graph\\?root=all$`));

  // L'ancienne destination de M1-06 (après création) mène à l'onglet 1 ; rechargé avec une séance
  // ouverte, le dossier va sur l'onglet Séance (UX-S3).
  await page.goto(`/fr/patients/${id}/overview`);
  await expect(page).toHaveURL(new RegExp(`/fr/patients/${id}/session$`));
  await expect(h.name).toHaveText('Inès M.');
});

test('« suivi·e depuis » : même début de suivi dans l’en-tête et le cadre du suivi (UX-G2c, UX-S6)', async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const account = await createAccount(request, 'ux-g2c.suivi', 'psychologist');
  const prefs = await request.patch(`${API}/api/me/preferences`, {
    data: { 'overview.window': '12m' },
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
  // Cadre du suivi de la vue d'ensemble (UX-S6) : « Suivi · depuis <mois> · cabinet ».
  const facts = page.locator('pm-overview-side .line').first();
  const paris = { timeZone: 'Europe/Paris' } as const;
  const today = new Date();

  await page.goto(`/fr/patients/${fresh}`);
  await expect(header(page).name).toHaveText('Agathe N.');
  // UX-S2 : mois abrégé dans l'en-tête compact (« suivi·e depuis sept. 2026 »).
  const month = new Intl.DateTimeFormat('fr-FR', { ...paris, month: 'short', year: 'numeric' });
  await expect(meta).toContainText(`suivi·e depuis ${month.format(today)}`);
  await expect(facts).toContainText(`depuis ${month.format(today)}`);
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
  // La première séance connue (le contact d'il y a deux mois), pas la création du dossier.
  await expect(facts).toContainText(`depuis ${month.format(past)}`);
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
  await expect(h.bar.locator('.count')).toHaveText('rien de noté encore');
  await expect(h.start).toHaveCount(0);
  // UX-S3 : l'onglet Séance remplace la vue d'ensemble ; pas de toast (la barre le dit), une
  // annonce polie.
  await expect(page).toHaveURL(new RegExp(`/fr/patients/${id}/session$`));
  await expect(h.tabs.getByRole('link', { name: 'Séance', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(h.close).toBeVisible();
  // B3 flux 3 et 6 : après Démarrer, la barre de capture prend le focus pour noter au clavier.
  await expect(h.capture).toBeFocused();
  await expect(page.getByText('Séance démarrée.')).toBeAttached();
  await expect(page.locator('pm-toast-outlet')).not.toContainText('Séance démarrée');
  expect(await page.evaluate(() => (window as unknown as { m107?: number }).m107)).toBe(1);
  await expectNoAxeViolations(page);

  // Clôturer : panneau latéral (UX-S3), durée écoulée arrondie (au moins 1), la préférence à un
  // clic (préférence absente → « 60 habituels »).
  await h.close.click();
  const dialog = page.getByRole('dialog', { name: 'Clôturer la séance' });
  await expect(dialog).toBeVisible();
  const duration = dialog.getByLabel('Durée (min)');
  await expect(duration).toHaveValue(/^[15]$/);
  await expect(duration).toBeFocused();
  await dialog.getByRole('button', { name: '60 habituels' }).click();
  await expect(duration).toHaveValue('60');
  await dialog.getByLabel('Compte rendu').fill('Point sur le sommeil.');
  await expectNoAxeViolations(page);

  // Les touches 1 2 3 ne naviguent pas derrière le panneau.
  await dialog.getByRole('button', { name: 'Annuler' }).focus();
  await page.keyboard.press('3');
  await expect(page).toHaveURL(new RegExp(`/fr/patients/${id}/session$`));

  const closed = page.waitForResponse(
    (r) => r.url().includes('/api/sessions/') && r.url().endsWith('/close'),
  );
  await dialog.getByRole('button', { name: 'Clôturer la séance' }).click();
  const response = await closed;
  expect(response.status()).toBe(200);
  expect(response.request().postDataJSON()).toEqual({
    durationMin: 60,
    summary: 'Point sur le sommeil.',
  });
  await expect(dialog).toBeHidden();
  // Retour de l'onglet Séance à la vue d'ensemble (UX-S3) ; toast de 6 s avec « Modifier ».
  await expect(page).toHaveURL(new RegExp(`/fr/patients/${id}$`));
  await expect(h.bar).toHaveCount(0);
  await expect(h.session).toContainText('Dernière séance :');
  await expect(h.session).toContainText('· visio · 60 min');
  await expect(h.start).toBeVisible();
  await expect(h.tabs.getByRole('link', { name: /Vue d'ensemble/ })).toHaveAttribute(
    'aria-current',
    'page',
  );
  // Sans séance, plus de bloc de saisie (UX-S1) : le focus revient sur « Démarrer la séance ».
  await expect(h.capture).toHaveCount(0);
  await expect(h.start).toBeFocused();
  await expect(page.getByText('Séance clôturée · 60 min · compte rendu enregistré')).toBeVisible();
  await expect(
    page.locator('pm-toast-outlet').getByRole('button', { name: 'Modifier' }),
  ).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { m107?: number }).m107)).toBe(1);
  await expectNoAxeViolations(page);
});

test('Clôturer propose l’écoulé, la préférence (45 min) à un clic', async ({ page, request }) => {
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
  // Séance en cours : le dossier s'ouvre sur l'onglet Séance (UX-S3).
  await expect(page).toHaveURL(new RegExp(`/fr/patients/${id}/session$`));
  await h.close.click();
  const dialog = page.getByRole('dialog', { name: 'Clôturer la séance' });
  // Séance tout juste démarrée : l'écoulé proposé ; la préférence du compte à un clic.
  await expect(dialog.getByLabel('Durée (min)')).toHaveValue(/^[15]$/);
  await dialog.getByRole('button', { name: '45 habituels' }).click();
  await expect(dialog.getByLabel('Durée (min)')).toHaveValue('45');
  const closed = page.waitForResponse(
    (r) => r.url().includes('/api/sessions/') && r.url().endsWith('/close'),
  );
  await dialog.getByRole('button', { name: 'Clôturer la séance' }).click();
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
  // Hors séance : ni bloc de saisie (UX-S1) ni colonne latérale ni barre de séance ; l'onglet
  // occupe la colonne principale seule.
  await expect(page.locator('pm-capture-block')).toHaveCount(0);
  await expect(page.locator('.pad-layout aside.ctx')).toHaveCount(0);
  await expect(page.locator('.pad-layout .pad-main pm-overview-page')).toBeVisible();
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
  // Le bloc de saisie est sous l'en-tête (plus dedans), déplié, dans la colonne principale.
  const block = page.locator('.pad-layout .pad-main pm-capture-block .block');
  await expect(block).toHaveClass(/expanded/);
  await expect(page.locator('pm-patient-header pm-capture-block')).toHaveCount(0);
  const headerBox = (await page.locator('pm-patient-header').boundingBox())!;
  expect((await block.boundingBox())!.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height);
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
  // 04b : la colonne principale porte le bloc ET l'onglet courant (l'onglet Séance, UX-S3) ; la
  // latérale (contexte de la séance) les longe, les raccourcis en dernier bloc.
  await expect(page).toHaveURL(new RegExp(`/fr/patients/${id}/session$`));
  const sessionTab = page.locator('.pad-layout .pad-main pm-session-tab-page');
  await expect(sessionTab).toBeVisible();
  const tabBox = (await sessionTab.boundingBox())!;
  expect(tabBox.y).toBeGreaterThanOrEqual((await block.boundingBox())!.y);
  expect(tabBox.x + tabBox.width).toBeLessThanOrEqual(asideBox.x);
  await expect(aside).toHaveAccessibleName('Contexte de la séance');
  await expect(aside.getByRole('heading', { name: 'Raccourcis dans le texte' })).toBeVisible();
  await expectNoAxeViolations(page);

  // Sous 900 px : la colonne latérale passe sous la colonne principale ; rien ne déborde.
  await page.setViewportSize({ width: 800, height: 720 });
  const narrowMain = (await page.locator('.pad-layout .pad-main').boundingBox())!;
  const narrowAside = (await aside.boundingBox())!;
  expect(narrowAside.y).toBeGreaterThanOrEqual(narrowMain.y + narrowMain.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(800);

  // Les touches 1 2 3 restent celles des onglets (hors champ) ; 1 est l'onglet Séance (UX-S3).
  await page.getByRole('heading', { level: 1 }).click();
  await page.keyboard.press('2');
  await expect(page).toHaveURL(new RegExp(`/fr/patients/${id}/timeline$`));
  await expect(h.bar).toBeVisible();
  await expect(block).toBeVisible();
  await page.keyboard.press('1');
  await expect(page).toHaveURL(new RegExp(`/fr/patients/${id}/session$`));

  // À 375 px en séance (fiche 00 §2) : barre réduite (« Clôturer », sans modalité ni durée prévue),
  // bloc puis colonne latérale empilés, aucun défilement horizontal.
  await page.setViewportSize({ width: 375, height: 812 });
  within((await h.bar.boundingBox())!.height, 44);
  await expect(h.bar.locator('.close-session .short')).toBeVisible();
  await expect(h.bar.locator('.close-session .long')).toBeHidden();
  await expect(h.bar.locator('.detail')).toBeHidden();
  await expect(h.bar.locator('.planned')).toBeHidden();
  await expect(h.close).toHaveAccessibleName('Clôturer la séance');
  const blockBox = (await block.boundingBox())!;
  const asideMobile = (await aside.boundingBox())!;
  expect(asideMobile.y).toBeGreaterThanOrEqual(blockBox.y + blockBox.height);
  expect(blockBox.x + blockBox.width).toBeLessThanOrEqual(375);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
  await expectNoAxeViolations(page);
});

test('UX-S2 : en séance à 1440 × 900, la timeline garde 480 px de cartes et le graphe tient dans la fenêtre (UX-G2c)', async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const account = await createAccount(request, 'ux-s2.hauteurs', 'psychologist');
  // Dossier rempli (séance passée, entrées) : la timeline a des cartes, le graphe des liens.
  const folder = await themeFolder(request);
  const id = folder.patientId;
  const start = await request.post(`${API}/api/patients/${id}/sessions/start`, {
    data: { modality: 'in_person' },
  });
  expect(start.status(), await start.text()).toBe(201);
  await signIn(page, account);
  await page.setViewportSize({ width: 1440, height: 900 });
  const h = header(page);

  // Timeline : barre de séance et bloc au-dessus, la zone des cartes mesure au moins 480 px.
  await page.goto(`/fr/patients/${id}/timeline`);
  await expect(h.name).toHaveText('Nina S.');
  await expect(h.bar).toBeVisible();
  await expect(page.locator('.pad-layout .pad-main pm-capture-block')).toBeVisible();
  // En séance la timeline s'ouvre « par séance » (la page défile) ; le critère des 480 px porte
  // sur le mode chronologique, dont la liste prend la hauteur restante : M bascule.
  await page.keyboard.press('m');
  const viewport = page.locator('cdk-virtual-scroll-viewport');
  await expect(viewport).toBeVisible();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });
  const cards = (await viewport.boundingBox())!;
  expect(cards.height, 'zone des cartes de la timeline en séance').toBeGreaterThanOrEqual(480);
  // Colonne latérale à côté, pas sous la liste.
  const aside = (await page.locator('.pad-layout aside.ctx').boundingBox())!;
  expect(aside.x).toBeGreaterThanOrEqual(cards.x + cards.width);
  await expectNoAxeViolations(page);

  // Graphe : le plateau mesure le haut de son onglet (--graph-top) : il prend exactement la hauteur
  // restante de la fenêtre, 480 px au moins (sous la barre et le bloc, la page défile alors du
  // strict nécessaire, plus de décalage fixe de 340 px).
  await page.keyboard.press('3');
  await expect(page).toHaveURL(/\/graph/);
  const board = page.locator('pm-graph-page .board');
  await expect(board).toBeVisible();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });
  const boardBox = (await board.boundingBox())!;
  const boardTop = boardBox.y + (await page.evaluate(() => window.scrollY));
  expect(boardBox.height, 'plateau du graphe en séance').toBeGreaterThanOrEqual(480);
  expect(
    Math.abs(boardBox.height - Math.max(480, 900 - boardTop - 24)),
    'hauteur du plateau = max(480, fenêtre − haut mesuré − 24)',
  ).toBeLessThanOrEqual(2);
  // Rien d'autre que le plateau ne fait défiler la page.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollHeight - document.documentElement.clientHeight,
  );
  expect(overflow, 'défilement de la page au-delà du plateau').toBeLessThanOrEqual(
    Math.max(0, boardTop + boardBox.height + 24 - 900) + 2,
  );
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

// UX-S8 : rail de navigation (proposition 05 A, décision du 14 novembre 2026) et tiroir sous 900 px.

/** Le rail de la coquille (habillage praticien, 900 px et plus). */
function rail(page: Page) {
  const host = page.locator('pm-nav-rail.app-rail');
  return {
    host,
    panel: host.locator('nav.rail'),
    nav: page.getByRole('navigation', { name: 'Navigation' }),
    patients: host.getByRole('link', { name: 'Patients', exact: true }),
    agenda: host.getByRole('link', { name: 'Agenda, à réaliser' }),
    invoice: host.getByRole('link', { name: 'Facture, à réaliser' }),
  };
}

/** Rectangle d'un élément à la frontière du pixel (getBoundingClientRect). */
async function rect(page: Page, selector: string) {
  return page.locator(selector).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
}

test('UX-S8 : rail de 56 px sous la barre, déplié à 220 px par-dessus la page sans la décaler, Ctrl+B, Échap, Agenda et Facture inertes', async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  // Habillage public : pas de rail.
  await page.goto('/fr/connexion');
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();
  await expect(page.locator('pm-nav-rail')).toHaveCount(0);

  const account = await createAccount(request, 'ux-s8.rail', 'psychologist');
  const id = await createPatient(request, 'Nour K.', { since: '2026-09-01' });
  const start = await request.post(`${API}/api/patients/${id}/sessions/start`, {
    data: { modality: 'in_person' },
  });
  expect(start.status(), await start.text()).toBe(201);
  await signIn(page, account);
  await page.setViewportSize({ width: 1440, height: 900 });
  const r = rail(page);

  // Liste des patients : le rail, replié, sous la barre (48 px), sur toute la hauteur ; Patients actif.
  await expect(r.nav).toBeVisible();
  const collapsed = (await r.panel.boundingBox())!;
  expect(collapsed.x).toBe(0);
  expect(collapsed.y).toBe(48);
  expect(collapsed.width).toBe(56);
  expect(collapsed.height).toBeGreaterThanOrEqual(900 - 48);
  await expect(r.patients).toHaveAttribute('aria-current', 'page');
  await expect(r.patients).toHaveAttribute('title', 'Patients');
  await expect(r.host.locator('.label').first()).toBeHidden();
  // Tout ce qui suit la barre commence à 56 px ; la barre garde toute la largeur.
  expect((await rect(page, 'pm-app-bar header')).x).toBe(0);
  expect((await rect(page, 'pm-app-bar header')).width).toBe(1440);
  expect((await rect(page, 'main#main')).x).toBeGreaterThanOrEqual(56);
  // Agenda et Facture : désactivés, sans lien ; un clic ne mène nulle part.
  for (const later of [r.agenda, r.invoice]) {
    await expect(later).toHaveAttribute('aria-disabled', 'true');
    await expect(later).not.toHaveAttribute('href');
    await expect(later).toBeDisabled();
    // Playwright attend qu'un élément aria-disabled s'active : le clic est forcé, au pointeur.
    await later.click({ force: true });
    await expect(page).toHaveURL(/\/fr\/patients$/);
  }
  await page.mouse.move(800, 600);
  await expect(r.panel).not.toHaveClass(/expanded/);
  await expectNoAxeViolations(page);

  // Onglet Séance en séance (largeur full, UX-S5) : barre de séance et en-tête d'un bord à l'autre
  // de la zone restante, de 56 px au bord droit.
  await page.goto(`/fr/patients/${id}`);
  await expect(page).toHaveURL(new RegExp(`/fr/patients/${id}/session$`));
  const h = header(page);
  await expect(h.bar).toBeVisible();
  await expect(h.capture).toBeVisible();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });
  const width = await page.evaluate(() => document.documentElement.clientWidth);
  const main = await rect(page, 'main#main');
  expect(main.x).toBe(56);
  expect(main.width).toBe(width - 56);
  const bar = await rect(page, 'pm-session-bar .session-bar');
  expect(bar.x).toBe(56);
  expect(bar.x + bar.width).toBe(width);
  await expect(r.patients).toHaveAttribute('aria-current', 'page');
  await expectNoAxeViolations(page);

  // Survol : 220 px par-dessus la page, libellés visibles ; le bloc de saisie ne bouge pas d'un pixel.
  const block = 'pm-capture-block .block';
  const before = { block: await rect(page, block), main: await rect(page, 'main#main') };
  await page.mouse.move(28, 400);
  await expect(r.panel).toHaveClass(/expanded/);
  // Transition de 120 ms sur la largeur : on attend la fin.
  await expect.poll(async () => (await r.panel.boundingBox())!.width).toBe(220);
  await expect(r.host.getByText('Patients', { exact: true })).toBeVisible();
  await expect(r.host.getByText('à réaliser')).toHaveCount(2);
  await expect(r.host.getByText('à réaliser').first()).toBeVisible();
  expect(await rect(page, block)).toEqual(before.block);
  expect(await rect(page, 'main#main')).toEqual(before.main);
  await expectNoAxeViolations(page);
  // Le pointeur sort : replié.
  await page.mouse.move(900, 500);
  await expect(r.panel).not.toHaveClass(/expanded/);
  // Transition de 120 ms sur la largeur : on attend la fin.
  await expect.poll(async () => (await r.panel.boundingBox())!.width).toBe(56);
  expect(await rect(page, block)).toEqual(before.block);

  // Ctrl+B depuis le bloc de saisie : focus sur le carreau actif, rail déplié ; Échap le replie et
  // rend le focus au champ.
  await h.capture.click();
  await expect(h.capture).toBeFocused();
  await page.keyboard.press('Control+b');
  await expect(r.patients).toBeFocused();
  await expect(r.panel).toHaveClass(/expanded/);
  expect(await rect(page, block)).toEqual(before.block);
  await expectNoAxeViolations(page);
  await page.keyboard.press('Escape');
  await expect(r.panel).not.toHaveClass(/expanded/);
  await expect(h.capture).toBeFocused();
  // Échap dans le rail ne ferme rien d'autre : la séance est toujours ouverte, le bloc là.
  await expect(h.bar).toBeVisible();

  // Tabulation : la barre, puis le rail (déplié au focus clavier), puis le contenu.
  await page.keyboard.press('Control+b');
  await expect(r.patients).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(r.panel).not.toHaveClass(/expanded/);
  await expect(page.locator('pm-nav-rail :focus')).toHaveCount(0);

  // Un clic sur Patients mène à la liste ; le rail se replie quand le pointeur sort.
  await page.mouse.move(28, 400);
  await r.patients.click();
  await expect(page).toHaveURL(/\/fr\/patients$/);
  await page.mouse.move(900, 500);
  await expect(r.panel).not.toHaveClass(/expanded/);
});

test('UX-S8 : à 390 px, pas de rail ; ☰ ouvre le tiroir de 280 px, Échap, ✕ et le voile le ferment, le focus revient à ☰', async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const account = await createAccount(request, 'ux-s8.tiroir', 'psychologist');
  await signIn(page, account);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('pm-nav-rail.app-rail')).toBeHidden();
  expect((await rect(page, 'main#main')).x).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

  const menu = page.getByRole('button', { name: 'Ouvrir la navigation' });
  await expect(menu).toBeVisible();
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  expect((await menu.boundingBox())!.x).toBeLessThan(
    (await page.locator('pm-app-bar .brand').boundingBox())!.x,
  );
  await expectNoAxeViolations(page);

  const drawer = page.getByRole('dialog', { name: 'Navigation' });
  const open = async () => {
    await menu.click();
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('link', { name: 'Patients', exact: true })).toBeFocused();
  };

  await open();
  await expect(page.locator('pm-app-bar button.menu')).toHaveAttribute('aria-expanded', 'true');
  const box = (await drawer.boundingBox())!;
  expect(box.x).toBe(0);
  expect(box.y).toBe(0);
  expect(box.width).toBe(280);
  expect(box.height).toBe(844);
  // Libellés d'emblée ; Agenda et Facture à réaliser, sans lien.
  await expect(drawer.getByText('Patients', { exact: true })).toBeVisible();
  await expect(drawer.getByText('à réaliser')).toHaveCount(2);
  await expect(drawer.locator('a[href]')).toHaveCount(1);
  await expect(drawer.getByRole('link', { name: 'Agenda, à réaliser' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await expect(page.locator('.pm-nav-drawer-veil')).toBeVisible();
  await expectNoAxeViolations(page);
  // Piège de focus : la tabulation reste dans le tiroir.
  for (let i = 0; i < 3; i += 1) {
    await page.keyboard.press('Tab');
    expect(await drawer.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  }

  // Échap ferme et rend le focus à ☰.
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(menu).toBeFocused();
  await expect(menu).toHaveAttribute('aria-expanded', 'false');

  // ✕ ferme.
  await open();
  await drawer.getByRole('button', { name: 'Fermer la navigation' }).click();
  await expect(drawer).toBeHidden();
  await expect(menu).toBeFocused();

  // Clic sur le voile, hors du tiroir.
  await open();
  await page.mouse.click(340, 500);
  await expect(drawer).toBeHidden();
  await expect(menu).toBeFocused();

  // Ctrl+B ouvre aussi le tiroir quand le rail est masqué, et le referme.
  await page.keyboard.press('Control+b');
  await expect(drawer).toBeVisible();
  await page.keyboard.press('Control+b');
  await expect(drawer).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
