import {
  APIRequestContext,
  BrowserContext,
  expect,
  Page,
  request as playwrightRequest,
  test,
} from '@playwright/test';

import { createAccount, signIn } from '../preferences/accounts';
import { TestAccount } from '../support/accounts';
import { expectNoAxeViolations } from '../support/axe';
import { shoot } from '../support/captures';
import { API } from '../support/env';

// M16-14, features/patients de droite à gauche (G Q71, Q73 à Q78 ; docs/design/arabe.md §1 à §5,
// §9) : liste vide, pleine (avec la bande « Aujourd'hui »), filtrée, archivés, cartes à 390 px,
// fiche en création et en modification, en /ar/. Pour chaque écran : <html dir="rtl">, pas de
// défilement horizontal, axe-core sans violation, une capture (PSYMATE_E2E_CAPTURES, thème clair du
// compte). Le rendu est mesuré (positions des boîtes, direction et alignement calculés), pas déduit
// d'un attribut. Aucun libellé ciblé (rôles, structure, URL) : les textes de /ar/ passent du
// français de repli à l'arabe au fil du jalon. Une seule inscription et une seule connexion (en
// /fr/), puis /ar/… ; contre l'API locale (seed small), jamais de mock du backend.

/** Nom saisi en arabe : affiché dans son sens (dir="auto"), dans une interface de droite à gauche. */
const ARABIC_NAME = 'أحمد ب.';

let api: APIRequestContext;
let account: TestAccount;
let context: BrowserContext;
let page: Page;
/** Patient arabe de la liste, rouvert en modification. */
let arabicId: string;
/** Lignes de la liste des actifs (patients créés, et la démo si le compte en reçoit une). */
let activeRows: number;

test.describe.configure({ mode: 'serial', timeout: 90_000 });

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000);
  api = await playwrightRequest.newContext();
  account = await createAccount(api, 'm16-14.patients', 'psychologist');
  // Contexte créé par le fixture browser : baseURL, locale et fuseau du projet.
  context = await browser.newContext();
  page = await context.newPage();
  await signIn(page, account);
});

test.afterAll(async () => {
  await context?.close();
  await api?.dispose();
});

async function createPatient(data: Record<string, unknown>): Promise<string> {
  const response = await api.post(`${API}/api/patients`, { data });
  expect(response.status(), await response.text()).toBe(201);
  return ((await response.json()) as { id: string }).id;
}

/** Démarre une séance (après la séance d'accueil, créée de façon asynchrone par l'API). */
async function startSession(id: string): Promise<void> {
  await expect(async () => {
    const current = await api.get(`${API}/api/patients/${id}/sessions/current`);
    expect(current.status()).toBe(200);
  }).toPass({ timeout: 15_000 });
  const started = await api.post(`${API}/api/patients/${id}/sessions/start`, {
    data: { modality: 'in_person' },
  });
  expect(started.status(), await started.text()).toBe(201);
}

/** <html lang="ar" dir="rtl">, aucun défilement horizontal, axe-core sans violation. */
async function expectRtlPage(): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.evaluate(() => document.fonts.ready);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'défilement horizontal').toBeLessThanOrEqual(0);
  await expectNoAxeViolations(page);
}

/** Boîte rendue d'un élément. */
async function boxOf(selector: string) {
  const box = await page.locator(selector).first().boundingBox();
  expect(box, `${selector} rendu`).not.toBeNull();
  return box!;
}

/** Direction et alignement calculés d'un élément. */
async function computed(selector: string) {
  return page
    .locator(selector)
    .first()
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return { direction: style.direction, textAlign: style.textAlign };
    });
}

/** Liste lue et résumés arrivés (plus aucune barre d'attente). */
async function settled(): Promise<void> {
  await expect(page.locator('pm-patient-table table')).toBeVisible();
  await expect(page.locator('pm-patient-table .pending')).toHaveCount(0, { timeout: 15_000 });
}

test('liste vide', async () => {
  await page.goto('/ar/patients');
  await expect(page.locator('pm-state, pm-onboarding').first()).toBeVisible();
  await expectRtlPage();
  await shoot(page, 'arabe-patients-vide');
});

test('liste pleine, bande du jour, menu d’une ligne, filtrée, archivés', async () => {
  test.setTimeout(150_000);
  arabicId = await createPatient({
    displayName: ARABIC_NAME,
    firstName: 'أحمد',
    email: 'ahmed@example.org',
    phone: '+33 6 12 34 56 78',
    birthDate: '1988-02-03',
    followUp: { since: '2025-03-01' },
    flags: [{ kind: 'watch', reason: 'النوم' }],
  });
  await createPatient({ displayName: 'Marie D.', birthDate: '1990-04-12' });
  const archivedId = await createPatient({ displayName: 'Léa M.' });
  const archived = await api.delete(`${API}/api/patients/${archivedId}`);
  expect(archived.status()).toBe(204);
  await startSession(arabicId);
  await page.goto('/ar/patients');
  await settled();
  activeRows = await page.locator('pm-patient-table tbody tr').count();
  expect(activeRows).toBeGreaterThanOrEqual(2);

  // Colonnes dans l'ordre du sens : la personne à droite, les actions à gauche.
  const who = await boxOf('pm-patient-table thead th.col-who');
  const acts = await boxOf('pm-patient-table thead th.col-acts');
  expect(who.x).toBeGreaterThan(acts.x);
  const header = await page
    .locator('pm-patient-table thead th')
    .evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().x));
  expect(header, 'colonnes de droite à gauche').toEqual([...header].sort((a, b) => b - a));
  expect((await computed('pm-patient-table thead th.col-who')).textAlign).toMatch(
    /^(start|right)$/,
  );

  // En-tête : le titre à droite, les actions à gauche.
  const title = await boxOf('.page-head h1');
  const headActions = await boxOf('.page-head .head-actions');
  expect(title.x).toBeGreaterThan(headActions.x);

  // Nom saisi en arabe : de droite à gauche (dir="auto"), un nom latin de gauche à droite.
  const names = page.locator('pm-patient-table tbody .nm');
  const arabicName = names.filter({ hasText: 'أحمد' });
  const latinName = names.filter({ hasText: 'Marie' });
  expect(await arabicName.evaluate((el) => getComputedStyle(el).direction)).toBe('rtl');
  expect(await latinName.evaluate((el) => getComputedStyle(el).direction)).toBe('ltr');

  // Aucun chiffre arabo-indien dans le tableau (Q73 : chiffres latins).
  expect(await page.locator('pm-patient-table table').innerText()).not.toMatch(/[٠-٩]/);

  // Pied : la pagination à gauche du compte des lignes.
  const shown = await boxOf('.foot .shown');
  const pager = await boxOf('.foot .pager');
  expect(shown.x).toBeGreaterThan(pager.x);

  // Bande du jour : la carte de la séance ouverte, nom isolé de droite à gauche.
  await expect(page.locator('pm-patient-today .tcard')).toHaveCount(1);
  expect(
    await page
      .locator('pm-patient-today .nm bdi')
      .first()
      .evaluate((el) => getComputedStyle(el).direction),
  ).toBe('rtl');
  await expectRtlPage();
  await shoot(page, 'arabe-patients-liste');

  // Menu d'une ligne : les actions sont en fin de ligne (à gauche), le menu reste dans la page.
  const rowMenu = page
    .locator('pm-patient-table tbody tr')
    .filter({ hasText: 'Marie' })
    .locator('button.icon-btn');
  const trigger = (await rowMenu.boundingBox())!;
  expect(trigger.x).toBeLessThan(who.x);
  await rowMenu.click();
  const menu = await boxOf('.mat-mdc-menu-panel');
  const viewport = page.viewportSize()!;
  expect(menu.x).toBeGreaterThanOrEqual(0);
  expect(menu.x + menu.width).toBeLessThanOrEqual(viewport.width);
  await expectRtlPage();
  await shoot(page, 'arabe-patients-menu-ligne', false);
  await page.keyboard.press('Escape');
  await expect(page.locator('.mat-mdc-menu-panel')).toHaveCount(0);

  // Filtrée : le nom tel qu'il est écrit (le filtre q de l'API ne replie pas les formes d'alif,
  // M16-32) ; champ en dir="auto", la saisie arabe va de droite à gauche ; une seule ligne, surlignée.
  const filter = page.locator('#patients-filter');
  await filter.fill('أحمد');
  expect((await computed('#patients-filter')).direction).toBe('rtl');
  await expect(page.locator('pm-patient-table tbody tr')).toHaveCount(1, { timeout: 15_000 });
  await expect(page.locator('pm-patient-table tbody tr .nm mark')).toHaveCount(1);
  await settled();
  await expectRtlPage();
  await shoot(page, 'arabe-patients-filtree');
  await filter.fill('');
  await expect(page.locator('pm-patient-table tbody tr')).toHaveCount(activeRows, {
    timeout: 15_000,
  });

  // Archivés : la bascule de l'en-tête (premier bouton des actions).
  await page.locator('.page-head .head-actions button').first().click();
  await settled();
  await expect(page.locator('pm-patient-table tbody tr.archived')).toHaveCount(1);
  await expectRtlPage();
  await shoot(page, 'arabe-patients-archives');
});

test('390 px : cartes, rien ne déborde', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  try {
    await page.goto('/ar/patients');
    await expect(page.locator('pm-patient-table .cards li')).toHaveCount(activeRows, {
      timeout: 15_000,
    });
    // Avatar à droite du nom dans la carte.
    const avatar = await boxOf('pm-patient-table .cards .av');
    const body = await boxOf('pm-patient-table .cards .card-body');
    expect(avatar.x).toBeGreaterThan(body.x);
    await expectRtlPage();
    await shoot(page, 'arabe-patients-liste-390');
  } finally {
    await page.setViewportSize({ width: 1280, height: 720 });
  }
});

test('fiche en création', async () => {
  await page.goto('/ar/patients/nouveau');
  const displayName = page.locator('input[formcontrolname="displayName"]');
  await expect(displayName).toBeVisible();

  // Nom saisi : sens pris de la saisie (dir="auto").
  await displayName.fill('سلمى ب.');
  expect((await computed('input[formcontrolname="displayName"]')).direction).toBe('rtl');
  await displayName.fill('Salma B.');
  expect((await computed('input[formcontrolname="displayName"]')).direction).toBe('ltr');
  await displayName.fill('سلمى ب.');

  // Téléphone et e-mail de gauche à droite, alignés du côté de début de la page (à droite).
  for (const selector of ['input[formcontrolname="phone"]', 'input[formcontrolname="email"]']) {
    const style = await computed(selector);
    expect(style.direction, selector).toBe('ltr');
    expect(style.textAlign, selector).toMatch(/^(end|right)$/);
  }
  await page.locator('input[formcontrolname="phone"]').fill('06 12 34 56 78');

  // Rail à droite, formulaire à gauche.
  const rail = await boxOf('pm-record-rail');
  const panel = await boxOf('.rec > .panel');
  expect(rail.x).toBeGreaterThan(panel.x);

  // Durée : l'unité à gauche du champ (fin de ligne en arabe).
  const duration = await boxOf('.with-unit input');
  const unit = await boxOf('.with-unit .unit');
  expect(unit.x + unit.width / 2).toBeLessThan(duration.x + duration.width / 2);
  await expectRtlPage();
  await shoot(page, 'arabe-patients-fiche-creation');
});

test('fiche en modification', async () => {
  await page.goto(`/ar/patients/${arabicId}/fiche`);
  const displayName = page.locator('input[formcontrolname="displayName"]');
  await expect(displayName).toHaveValue(ARABIC_NAME);
  expect((await computed('input[formcontrolname="displayName"]')).direction).toBe('rtl');
  expect((await computed('input[formcontrolname="email"]')).direction).toBe('ltr');
  expect((await computed('input[formcontrolname="watchReason"]')).direction).toBe('rtl');
  // Fil d'Ariane : le nom isolé, lu de droite à gauche.
  expect(
    await page
      .locator('.crumbs bdi')
      .first()
      .evaluate((el) => getComputedStyle(el).direction),
  ).toBe('rtl');
  // Aucun chiffre arabo-indien dans l'en-tête de la fiche (dates par la locale de formatage).
  expect(await page.locator('.page-head').innerText()).not.toMatch(/[٠-٩]/);
  await expectRtlPage();
  await shoot(page, 'arabe-patients-fiche-modification');
});
