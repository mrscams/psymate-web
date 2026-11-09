import {
  APIRequestContext,
  expect,
  Page,
  request as playwrightRequest,
  test,
} from '@playwright/test';

import { SEED, uniqueEmail } from '../support/accounts';
import { expectNoAxeViolations } from '../support/axe';

// B3 flux 1, première connexion (M7-03, planche 29 §2 et §6, C5 « première entrée en moins de
// 3 minutes ») : contre l'API locale (seed small + demo, Mailpit), jamais de mock du backend.

const API = 'http://localhost:8080';
const MAILPIT = 'http://localhost:8025';
const TOKEN = /confirmer-email\/([A-Za-z0-9_.~%-]+)/;
const PASSWORD = 'Vendôme-Lyon-2026!x';
/** C5 : un nouveau praticien saisit sa première entrée en moins de 3 minutes. */
const FIRST_ENTRY_BUDGET_MS = 180_000;

/** Lien de confirmation de l'inscription, lu dans Mailpit (attend jusqu'à 15 s). */
async function confirmationToken(api: APIRequestContext, email: string): Promise<string> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const search = await api.get(`${MAILPIT}/api/v1/search`, { params: { query: `to:${email}` } });
    const messages = ((await search.json()) as { messages?: { ID: string }[] }).messages ?? [];
    for (const message of messages) {
      const full = await api.get(`${MAILPIT}/api/v1/message/${message.ID}`);
      const match = TOKEN.exec(((await full.json()) as { Text?: string }).Text ?? '');
      if (match) return decodeURIComponent(match[1]);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`aucun e-mail de confirmation pour ${email} dans Mailpit`);
}

/**
 * Chronomètre du parcours : les analyses axe-core (exigées dans chaque e2e) sont décomptées, elles
 * ne font pas partie de ce que vit le praticien.
 */
function stopwatch() {
  const started = Date.now();
  let paused = 0;
  return {
    async axe(page: Page): Promise<void> {
      const before = Date.now();
      await expectNoAxeViolations(page);
      paused += Date.now() - before;
    },
    elapsed: () => Date.now() - started - paused,
  };
}

function helpDialog(page: Page) {
  return page.getByRole('dialog', { name: 'Raccourcis clavier' });
}

/** Contexte API connecté avec Claire (seed small), pour préparer et nettoyer. */
async function claireApi(): Promise<APIRequestContext> {
  const api = await playwrightRequest.newContext({ baseURL: API });
  const login = await api.post('/api/auth/login', { data: SEED.claire });
  expect(login.status(), await login.text()).toBe(200);
  return api;
}

/** Le patient « DEMO · … » de Claire (seed demo), actif ou archivé. */
async function demoPatient(api: APIRequestContext): Promise<{ id: string; displayName: string }> {
  for (const archived of [false, true]) {
    const response = await api.get('/api/patients', { params: { q: 'DEMO', archived } });
    expect(response.status()).toBe(200);
    const items = ((await response.json()) as { items: { id: string; displayName: string }[] })
      .items;
    const demo = items.find((p) => p.displayName.startsWith('DEMO · '));
    if (demo) return demo;
  }
  throw new Error('patient DEMO absent : lancer make seed SIZE=demo dans ../psymate-api');
}

async function signInClaire(page: Page): Promise<void> {
  await page.goto('/fr/connexion');
  await page.getByLabel('Adresse e-mail').fill(SEED.claire.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(SEED.claire.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/fr\/patients$/);
}

test('nouveau praticien : inscription, confirmation, accueil, premier patient, première entrée en moins de 3 minutes', async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  const watch = stopwatch();
  const email = uniqueEmail('m7-03.premiere');

  // Inscription (fiche 12) : seuls les champs obligatoires.
  await page.goto('/fr/inscription');
  await page.locator('#field-firstName').fill('Lou');
  await page.locator('#field-lastName').fill('Essai');
  await page.locator('#field-email').fill(email);
  await page.locator('#field-profession-psychologist').check();
  await page.locator('#field-phone').fill('06 12 34 56 78');
  await page.locator('#field-address-street').fill('12 rue des Lilas');
  await page.locator('#field-address-postalCode').fill('69001');
  await page.locator('#field-address-city').fill('Lyon');
  await page.locator('#field-password').fill(PASSWORD);
  await page.locator('#field-passwordConfirm').fill(PASSWORD);
  await page.locator('#field-terms').check();
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page).toHaveURL(/\/fr\/confirmer-email$/);

  // Confirmation par le lien de l'e-mail (Mailpit) : la session s'ouvre, la liste vide s'affiche.
  const token = await confirmationToken(request, email);
  await page.goto(`/fr/confirmer-email/${encodeURIComponent(token)}`);
  await expect(page).toHaveURL(/\/fr\/patients$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Mes patients' })).toBeVisible();
  const fromEmptyList = Date.now();

  // Accueil : état vide, trois étapes (la première en cours), Voir les raccourcis. L'API ne crée
  // pas de patient DEMO à l'inscription (seul l'outil de seed le fait) : aucune ligne ici.
  const welcome = page.getByRole('region', { name: 'Bienvenue dans PsyMate' });
  await expect(
    page.getByRole('status').filter({ hasText: 'Créez votre premier patient' }),
  ).toBeVisible();
  await expect(welcome.getByRole('listitem')).toHaveCount(3);
  await expect(welcome.locator('li[aria-current="step"]')).toContainText('Créez un patient');
  await expect(welcome).toContainText('Bientôt : des suggestions');
  await expect(page.getByRole('table')).toHaveCount(0);
  await watch.axe(page);

  // « Voir les raccourcis » ouvre l'aide ; Échap la ferme et rend le focus au lien.
  const shortcutsLink = welcome.getByRole('button', { name: 'Voir les raccourcis' });
  await shortcutsLink.click();
  await expect(helpDialog(page)).toBeVisible();
  await expect(helpDialog(page).getByRole('row', { name: /Nouveau patient/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(helpDialog(page)).toBeHidden();
  await expect(shortcutsLink).toBeFocused();

  // Étape 1 : Nouveau patient (bouton de l'état vide), seul le nom affiché.
  await page
    .getByRole('status')
    .filter({ hasText: 'Créez votre premier patient' })
    .getByRole('button', { name: /Nouveau patient/ })
    .click();
  await expect(page).toHaveURL(/\/fr\/patients\/nouveau$/);
  await page.getByRole('textbox', { name: /Nom affiché/ }).fill('Lou B.');
  const createdPatient = page.waitForResponse(
    (r) => r.url().endsWith('/api/patients') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: /Enregistrer/ }).click();
  const patient = (await (await createdPatient).json()) as { id: string };

  // Étape 2 : le dossier s'ouvre ; étape 3 annoncée par l'indice (dossier sans entrée).
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lou B.');
  const hint = page
    .getByRole('status')
    .filter({ hasText: 'Dernière étape : notez la première entrée.' });
  await expect(hint).toBeVisible();
  await watch.axe(page);

  // La séance d'accueil est créée en différé avec le patient : le praticien lit l'indice entre-temps.
  await expect
    .poll(
      async () => (await page.request.get(`/api/patients/${patient.id}/sessions/current`)).status(),
      {
        timeout: 15_000,
      },
    )
    .toBe(200);

  // Étape 3 : Nouvelle entrée depuis l'indice, une note dans la séance d'accueil.
  await hint.getByRole('button', { name: 'Nouvelle entrée' }).click();
  const editor = page.locator('[role="dialog"]:has(pm-entry-editor-panel)');
  await expect(editor).toBeVisible();
  await expect(editor.locator('pm-state [aria-busy="true"]')).toHaveCount(0);
  await editor
    .getByLabel('Texte', { exact: true })
    .fill('Premier entretien : motif de la consultation.');
  const createdEntry = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      new URL(r.url()).pathname === `/api/patients/${patient.id}/entries`,
  );
  await editor.locator('.footer .primary').click();
  expect((await createdEntry).status()).toBe(201);
  await expect(page.getByText('Entrée enregistrée.')).toBeVisible();

  const total = watch.elapsed();
  const fromList = Date.now() - fromEmptyList;
  console.log(
    `[M7-03] première entrée enregistrée : ${total} ms depuis l'inscription (hors axe), ${fromList} ms depuis la liste vide`,
  );
  test
    .info()
    .annotations.push(
      { type: 'parcours inscription → première entrée (ms, hors axe)', description: String(total) },
      { type: 'parcours liste vide → première entrée (ms)', description: String(fromList) },
    );
  expect(total).toBeLessThan(FIRST_ENTRY_BUDGET_MS);

  // Après l'écriture, la chronologie est relue : l'indice disparaît.
  await expect(hint).toBeHidden();
  await expectNoAxeViolations(page);

  // Retour à la liste : un vrai patient, la liste prend sa forme normale (pas d'accueil).
  await page.goto('/fr/patients');
  await expect(
    page.getByRole('table').getByRole('link', { name: 'Lou B.', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: 'Bienvenue dans PsyMate' })).toHaveCount(0);
});

test('patient DEMO de Claire : étiqueté, supprimé en un clic sans retaper le nom, restauré (toast puis archivés)', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const api = await claireApi();
  const demo = await demoPatient(api);
  try {
    // Point de départ connu : le patient DEMO actif.
    expect((await api.post(`/api/patients/${demo.id}/restore`)).status()).toBe(200);
    await signInClaire(page);
    await page.locator('#patients-filter').fill('DEMO');
    const row = page.getByRole('row').filter({ hasText: demo.displayName });
    await expect(row).toBeVisible();
    await expect(row.locator('.demo-chip')).toHaveText('Démo');
    await expectNoAxeViolations(page);

    // Un clic, puis une confirmation simple : aucun champ où retaper le nom.
    await row.getByRole('button', { name: `Supprimer la démo : ${demo.displayName}` }).click();
    const confirm = page.getByRole('dialog', { name: 'Supprimer le patient de démonstration ?' });
    await expect(confirm).toBeVisible();
    await expect(confirm.getByRole('textbox')).toHaveCount(0);
    await expect(confirm.getByRole('button', { name: 'Supprimer la démo' })).toBeEnabled();
    await expectNoAxeViolations(page);
    const archived = page.waitForResponse(
      (r) => r.request().method() === 'DELETE' && r.url().endsWith(`/api/patients/${demo.id}`),
    );
    await confirm.getByRole('button', { name: 'Supprimer la démo' }).click();
    expect((await archived).status()).toBe(204);
    await expect(row).toHaveCount(0);

    // Toast « Patient de démonstration retiré · Restaurer ».
    const toast = page.getByText('Patient de démonstration retiré');
    await expect(toast).toBeVisible();
    await expectNoAxeViolations(page);
    await page.getByRole('button', { name: 'Restaurer', exact: true }).click();
    await expect(row).toBeVisible();
    await expect(page.getByText('Patient de démonstration restauré')).toBeVisible();

    // Deuxième retrait, restauration depuis les archivés (le toast a pu disparaître).
    await row.getByRole('button', { name: /Supprimer la démo :/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Supprimer la démo' }).click();
    await expect(row).toHaveCount(0);
    await page.getByRole('checkbox', { name: 'Afficher les archivés' }).check();
    const archivedRow = page.getByRole('row').filter({ hasText: demo.displayName });
    await expect(archivedRow).toBeVisible();
    await expectNoAxeViolations(page);
    await archivedRow
      .getByRole('button', { name: `Restaurer le patient de démonstration ${demo.displayName}` })
      .click();
    await expect(archivedRow).toHaveCount(0);
    await page.getByRole('checkbox', { name: 'Afficher les archivés' }).uncheck();
    await expect(page.getByRole('row').filter({ hasText: demo.displayName })).toBeVisible();
  } finally {
    // Quoi qu'il arrive, le patient DEMO redevient actif pour les autres tests.
    await api.post(`/api/patients/${demo.id}/restore`);
    await api.dispose();
  }
});

test('? ouvre l’aide sur la liste, dans un dossier, dans Mon compte ; rien dans un champ ; Échap ferme', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const api = await claireApi();
  const demo = await demoPatient(api);
  await api.post(`/api/patients/${demo.id}/restore`);
  await api.dispose();
  await signInClaire(page);

  // Liste : N et / décrits pour la liste ; M sans objet ici.
  await expect(page.getByRole('heading', { level: 1, name: 'Mes patients' })).toBeVisible();
  await page.keyboard.press('?');
  const help = helpDialog(page);
  await expect(help).toBeVisible();
  await expect(help.getByRole('row', { name: /Filtrer mes patients/ })).toBeVisible();
  await expect(help.getByRole('row', { name: /^N Nouveau patient/ })).toBeVisible();
  await expect(help.getByRole('row', { name: /^M .*indisponible ici/ })).toBeVisible();
  await expectNoAxeViolations(page);
  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();

  // Dans un champ, ? s'écrit et n'ouvre rien.
  const filter = page.locator('#patients-filter');
  await filter.focus();
  await page.keyboard.press('?');
  await expect(filter).toHaveValue('?');
  await expect(help).toHaveCount(0);
  await filter.fill('');

  // Dossier : 1 2 3 et L disponibles, gestes de la barre de saisie décrits.
  await page.goto(`/fr/patients/${demo.id}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(demo.displayName);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('?');
  await expect(help).toBeVisible();
  await expect(
    help.getByRole('row', { name: /Vue d'ensemble · Timeline · Graphe/ }),
  ).not.toContainText('indisponible ici');
  await expect(help.getByRole('row', { name: /^N Nouvelle entrée/ })).toBeVisible();
  await expect(help.getByRole('row', { name: /Barre de saisie du dossier/ })).not.toContainText(
    'indisponible ici',
  );
  await expectNoAxeViolations(page);
  // ? une seconde fois referme l'aide.
  await page.keyboard.press('?');
  await expect(help).toBeHidden();

  // Mon compte : l'aide s'ouvre aussi ; les touches du dossier y sont sans objet.
  await page.goto('/fr/mon-compte/preferences');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('?');
  await expect(help).toBeVisible();
  await expect(help.getByRole('row', { name: /^N .*indisponible ici/ })).toBeVisible();
  await expectNoAxeViolations(page);
  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();
});
