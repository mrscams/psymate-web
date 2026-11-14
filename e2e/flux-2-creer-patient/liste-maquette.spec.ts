import { APIRequestContext, expect, Page, test } from '@playwright/test';

import { setPreferences } from '../flux-6-vue-ensemble/overview-data';
import { createAccount, signIn } from '../preferences/accounts';
import { expectNoAxeViolations } from '../support/axe';
import { shoot } from '../support/captures';
import { keyboardOnly } from '../support/clavier';

// UX-S7 : liste des patients fidèle à la proposition 01 et aux décisions du 14 novembre 2026
// (dix patients par page avec Précédent / Suivant, date seule, archivés par GET ?archived=true,
// aucun chiffre que le serveur ne sert pas). Contre l'API locale, jamais de mock : chaque test crée
// son compte jetable et ses patients (le résumé de chaque ligne vient de GET /overview).

const API = 'http://localhost:8080';

async function createPatient(
  api: APIRequestContext,
  data: Record<string, unknown>,
): Promise<string> {
  const response = await api.post(`${API}/api/patients`, { data });
  expect(response.status(), await response.text()).toBe(201);
  return ((await response.json()) as { id: string }).id;
}

/** Démarre une séance (après la séance d'accueil, créée de façon asynchrone par l'API). */
async function startSession(api: APIRequestContext, id: string): Promise<void> {
  await expect(async () => {
    const current = await api.get(`${API}/api/patients/${id}/sessions/current`);
    expect(current.status()).toBe(200);
  }).toPass({ timeout: 15_000 });
  const started = await api.post(`${API}/api/patients/${id}/sessions/start`, {
    data: { modality: 'in_person' },
  });
  expect(started.status(), await started.text()).toBe(201);
}

/**
 * Séance d'accueil connue de la projection du patient (l'API la crée de façon asynchrone, jamais
 * clôturée ; elle ne compte pas comme séance ouverte : la liste affiche sa date, sans « en cours »).
 */
async function intakeProjected(api: APIRequestContext, id: string): Promise<void> {
  await expect(async () => {
    const response = await api.get(`${API}/api/patients/${id}/overview?window=90d`);
    expect(response.status()).toBe(200);
    const overview = (await response.json()) as { recentSessions: { kind?: string }[] };
    expect(overview.recentSessions.some((s) => s.kind === 'intake')).toBe(true);
  }).toPass({ timeout: 20_000 });
}

/** Liste lue et résumés arrivés (plus aucune barre d'attente). */
async function settled(page: Page): Promise<void> {
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.locator('pm-patient-table .pending')).toHaveCount(0, { timeout: 15_000 });
}

const rows = (page: Page) => page.locator('pm-patient-table tbody tr');
const footer = (page: Page) => page.getByRole('navigation', { name: 'Pages de la liste' });

test('maquette 01 : en-tête, bande Aujourd’hui, filtres sans comptes, colonnes, date seule, pied ; axe clair et sombre ; 390 px', async ({
  page,
  request,
}) => {
  test.setTimeout(150_000);
  const account = await createAccount(request, 'ux-s7.liste', 'psychologist');
  const marie = await createPatient(request, {
    displayName: 'Marie D.',
    birthDate: '1990-04-12',
    followUp: { since: '2025-03-01' },
    flags: [{ kind: 'watch', reason: 'Sommeil' }],
  });
  const omar = await createPatient(request, { displayName: 'Omar B.' });
  await createPatient(request, { displayName: `DEMO · Camille R.` });
  await startSession(request, marie);
  await intakeProjected(request, omar);
  await signIn(page, account);
  await settled(page);

  // En-tête sans sous-titre chiffré (décision 4).
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mes patients');
  await expect(page.locator('.page-head p')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Afficher les archivés' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Nouveau patient N' })).toBeVisible();

  // Bande « Aujourd'hui » : séance ouverte de Marie, « Reprendre » vers l'onglet Séance.
  const today = page.getByRole('region', { name: "Aujourd'hui" });
  await expect(today.getByRole('heading', { level: 2 })).toHaveText("Aujourd'hui");
  const card = today.getByRole('listitem').filter({ hasText: 'Marie D.' });
  await expect(card.locator('.chip.live')).toHaveText(/^en séance · \d+ min$/);
  await expect(card.getByRole('link', { name: 'Reprendre : Marie D.' })).toHaveAttribute(
    'href',
    `/fr/patients/${marie}/session`,
  );

  // Filtres rapides : un seul groupe segmenté, sans compte (décision 4).
  const quick = page.getByRole('group', { name: 'Filtres rapides' });
  await expect(quick.getByRole('button')).toHaveText([
    'Tous',
    "Aujourd'hui",
    'À surveiller',
    'Brouillons',
  ]);
  await expect(quick.getByRole('button', { name: 'Tous' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Trier par')).toHaveValue('name');

  await expect(page.locator('pm-patient-table thead th')).toHaveText([
    'Patient',
    'Dernière séance',
    'Depuis la séance',
    'Ressentis · 30 j',
    'Situations',
    'Attention',
    'Actions',
  ]);
  await expect(page.locator('pm-patient-table thead th').first()).toHaveAttribute(
    'aria-sort',
    'ascending',
  );

  // Marie : âge · depuis, puce « en cours », drapeau ambre. Omar : la date seule (décision 2).
  const marieRow = page.getByRole('row').filter({ hasText: 'Marie D.' });
  await expect(marieRow.locator('td.who .sub')).toHaveText(/^\d+ ans · depuis mars 2025$/);
  await expect(marieRow.locator('td.last .chip.live')).toHaveText(/^en cours · \d+ min$/);
  await expect(marieRow.locator('td.att .chip.flag')).toHaveText('À surveiller');
  const omarRow = page.getByRole('row').filter({ hasText: 'Omar B.' });
  const day = new Intl.DateTimeFormat('fr', { day: 'numeric', month: 'short' }).format(new Date());
  await expect(omarRow.locator('td.last')).toHaveText(day);

  // Patient de démonstration : badge DEMO, avatar pointillé, « Supprimer ».
  const demo = page.getByRole('row').filter({ hasText: 'Camille R.' });
  await expect(demo.locator('.demo-badge')).toHaveText('DEMO');
  await expect(demo.locator('.av.dashed')).toHaveText('CR');
  await expect(
    demo.getByRole('button', { name: 'Supprimer la démo : DEMO · Camille R.' }),
  ).toHaveText('Supprimer');

  // Pied : nombre de lignes affichées, Précédent et Suivant grisés (une seule page).
  await expect(footer(page).locator('.shown')).toHaveText('3 patients affichés');
  await expect(footer(page).getByRole('button', { name: 'Précédent' })).toBeDisabled();
  await expect(footer(page).getByRole('button', { name: 'Suivant' })).toBeDisabled();

  await shoot(page, 'ux-s7-01-patients-1440', false);
  await expectNoAxeViolations(page);

  // Actions révélées au survol : ✎ Fiche et menu « … ».
  await marieRow.hover();
  await expect(marieRow.locator('.acts')).toHaveCSS('opacity', '1');
  await marieRow.getByRole('button', { name: "Plus d'actions pour Marie D." }).click();
  await expect(page.getByRole('menuitem')).toHaveText(['Ouvrir', 'Fiche', 'Exporter', 'Archiver']);
  await expectNoAxeViolations(page);
  await page.keyboard.press('Escape');

  // « À surveiller » : seule Marie ; « Aujourd'hui » : Marie (séance ouverte).
  await quick.getByRole('button', { name: 'À surveiller' }).click();
  await expect(page.getByRole('table').locator('a.row-link')).toHaveText(['Marie D.']);
  await quick.getByRole('button', { name: "Aujourd'hui" }).click();
  await expect(page.getByRole('table').locator('a.row-link')).toHaveText(['Marie D.']);
  await quick.getByRole('button', { name: 'Tous' }).click();
  await expect(rows(page)).toHaveCount(3);

  // Thème sombre : mêmes contrôles axe.
  await setPreferences(request, { theme: 'dark' });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await settled(page);
  await shoot(page, 'ux-s7-01-patients-1440-sombre', false);
  await expectNoAxeViolations(page);
  await setPreferences(request, { theme: 'light' });

  // 390 px : une carte par patient, pas de défilement horizontal, même pied.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator('pm-patient-table .cards')).toBeVisible();
  await expect(page.locator('pm-patient-table .pending')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByRole('table')).toBeHidden();
  await expect(page.locator('.cards li')).toHaveCount(3);
  await expect(
    page.locator('.cards li').filter({ hasText: 'Marie D.' }).locator('.chip.flag'),
  ).toContainText('!');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await expect(footer(page).locator('.shown')).toHaveText('3 patients affichés');
  await expectNoAxeViolations(page);

  // Ligne entièrement cliquable : un clic hors du nom (colonne Situations) ouvre le dossier.
  await page.setViewportSize({ width: 1440, height: 900 });
  await settled(page);
  await omarRow.locator('td.situations').click({ force: true });
  await expect(page).toHaveURL(/\/fr\/patients\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Omar B.');
});

test('pagination : 12 patients, 10 puis 2, Précédent / Suivant grisés en bout, retour à la page 1 sur filtre', async ({
  page,
  request,
}) => {
  test.setTimeout(150_000);
  const account = await createAccount(request, 'ux-s7.pages', 'psychologist');
  const names = Array.from({ length: 12 }, (_, i) => `Patient ${String(i + 1).padStart(2, '0')}`);
  for (const displayName of names) await createPatient(request, { displayName });
  await signIn(page, account);
  await settled(page);

  const previous = footer(page).getByRole('button', { name: 'Précédent' });
  const next = footer(page).getByRole('button', { name: 'Suivant' });
  const links = page.getByRole('table').locator('a.row-link');

  await expect(rows(page)).toHaveCount(10);
  await expect(links.first()).toHaveText('Patient 01');
  await expect(footer(page).locator('.shown')).toHaveText('10 patients affichés');
  await expect(previous).toBeDisabled();
  await expect(next).toBeEnabled();
  // Ni numéros de page, ni total : l'API n'en donne pas (décision 1).
  await expect(footer(page)).not.toContainText(/sur \d+/);
  await expectNoAxeViolations(page);

  const page2 = page.waitForRequest((r) => new URL(r.url()).searchParams.has('cursor'));
  await next.click();
  expect(new URL((await page2).url()).searchParams.get('limit')).toBe('10');
  await settled(page);
  await expect(links).toHaveText(['Patient 11', 'Patient 12']);
  await expect(footer(page).locator('.shown')).toHaveText('2 patients affichés');
  await expect(previous).toBeEnabled();
  await expect(next).toBeDisabled();
  await shoot(page, 'ux-s7-01-patients-page-2', false);
  await expectNoAxeViolations(page);

  await previous.click();
  await settled(page);
  await expect(rows(page)).toHaveCount(10);
  await expect(links.first()).toHaveText('Patient 01');
  await expect(previous).toBeDisabled();

  // Page 2, puis un filtre : retour à la première page (pile vidée).
  await next.click();
  await expect(links).toHaveText(['Patient 11', 'Patient 12']);
  await page.getByRole('searchbox', { name: /Filtrer les patients/ }).fill('patient');
  await expect(links.first()).toHaveText('Patient 01');
  await expect(rows(page)).toHaveCount(10);
  await expect(previous).toBeDisabled();
  await expect(next).toBeEnabled();

  // Page 2, puis un tri : retour à la première page aussi.
  await next.click();
  await expect(rows(page)).toHaveCount(2);
  await page.getByLabel('Trier par').selectOption({ label: 'Création' });
  await expect(rows(page)).toHaveCount(10);
  await expect(links.first()).toHaveText('Patient 12');
  await expect(previous).toBeDisabled();
});

test('archiver depuis le menu de la ligne, afficher les archivés, restaurer', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const account = await createAccount(request, 'ux-s7.archives', 'psychologist');
  await createPatient(request, { displayName: 'Léa M.', pronoun: 'elle' });
  await createPatient(request, { displayName: 'Paul R.' });
  await signIn(page, account);
  await settled(page);

  const lea = page.getByRole('row').filter({ hasText: 'Léa M.' });
  await lea.getByRole('button', { name: "Plus d'actions pour Léa M." }).click();
  await page.getByRole('menuitem', { name: 'Archiver' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Tapez « Léa M. » pour confirmer').fill('Léa M.');
  const archived = page.waitForResponse((r) => r.request().method() === 'DELETE');
  await dialog.getByRole('button', { name: 'Archiver ce patient' }).click();
  expect((await archived).status()).toBe(204);
  await expect(page.getByText('Léa M. archivée')).toBeVisible();
  await expect(lea).toHaveCount(0);
  await expect(rows(page)).toHaveCount(1);

  // Archivés : GET ?archived=true, titre et bascule changent.
  const listed = page.waitForRequest(
    (r) => new URL(r.url()).pathname === '/api/patients' && r.url().includes('archived=true'),
  );
  await page.getByRole('button', { name: 'Afficher les archivés' }).click();
  await listed;
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Patients archivés');
  await settled(page);
  await expect(lea.locator('td.who .sub')).toHaveText(/^Archivé·e /);
  await shoot(page, 'ux-s7-01-patients-archives', false);
  await expectNoAxeViolations(page);

  await lea.getByRole('button', { name: "Plus d'actions pour Léa M." }).click();
  await expect(page.getByRole('menuitem')).toHaveText(['Ouvrir', 'Fiche', 'Exporter', 'Restaurer']);
  const restored = page.waitForResponse((r) => r.url().endsWith('/restore'));
  await page.getByRole('menuitem', { name: 'Restaurer' }).click();
  expect((await restored).status()).toBe(200);
  await expect(page.getByText('Léa M. restaurée')).toBeVisible();
  await expect(rows(page)).toHaveCount(0);

  await page.getByRole('button', { name: 'Revenir aux actifs' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mes patients');
  await settled(page);
  await expect(page.getByRole('table').locator('a.row-link')).toHaveText(['Léa M.', 'Paul R.']);
  await expectNoAxeViolations(page);
});

test('clavier : / puis ↓ choisit la première ligne, ↓ la suivante, Entrée ouvre le dossier', async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const account = await createAccount(request, 'ux-s7.clavier', 'psychologist');
  await createPatient(request, { displayName: 'Léa M.' });
  await createPatient(request, { displayName: 'Paul R.' });
  await signIn(page, account);
  const keys = await keyboardOnly(page);
  await page.reload();
  await settled(page);

  const links = page.locator('pm-patient-table table a.row-link');
  await expect(links).toHaveCount(2);
  const second = await links.nth(1).getAttribute('href');

  await page.keyboard.press('/');
  await expect(page.locator('#patients-filter')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(links.first()).toBeFocused();
  // Les actions de la ligne apparaissent au focus.
  await expect(page.locator('pm-patient-table tbody tr').first().locator('.acts')).toHaveCSS(
    'opacity',
    '1',
  );
  await expectNoAxeViolations(page);
  await page.keyboard.press('ArrowDown');
  await expect(links.nth(1)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`${second}$`));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Paul R.');
  keys.expectNoPointer();
});
