import {
  APIRequestContext,
  BrowserContext,
  expect,
  Page,
  request as playwrightRequest,
  Response,
  test,
} from '@playwright/test';

import { createAccount, signIn } from '../preferences/accounts';
import { TestAccount } from '../support/accounts';
import { expectNoAxeViolations } from '../support/axe';
import { shoot } from '../support/captures';
import { API } from '../support/env';

// M16-20, bloc de saisie de droite à gauche (G Q71, Q73 à Q78, Q81 ; docs/design/arabe.md §3, §5,
// §6, §9) : bloc vide, rempli, avec un lien proposé, avec émotion et intensité, en /ar/. Pour
// chaque état : <html dir="rtl">, pas de défilement horizontal, axe-core sans violation, une capture
// (PSYMATE_E2E_CAPTURES). Un texte arabe saisi ne produit aucune date (Q81) ; l'échelle
// d'intensité se manie au clavier dans le sens de lecture (flèche gauche augmente) et la valeur
// enregistrée est relue par l'API, aux deux extrémités. Le rendu est mesuré (boîtes, direction
// calculée), pas déduit d'un attribut. Aucun libellé ciblé (rôles, structure, URL). Une seule
// inscription et une seule connexion (en /fr/), puis /ar/… ; contre l'API locale (seed small),
// jamais de mock du backend. Données comme e2e/flux-3-saisie/bloc-saisie.spec.ts : séance démarrée,
// puis un événement créé par l'API dans cette séance, qui figure dans le rail « Lié à ».

/** Titre de l'événement du rail, en arabe : la cible du `>`. */
const EVENT_TITLE = 'اجتماع العمل';
/** Texte arabe avec des chiffres, un mot de date et une date en chiffres : aucune date lue. */
const ARABIC_NOTE = 'نمت 8 ساعات أمس، موعد 12/03/2024 منذ 2019';

let api: APIRequestContext;
let account: TestAccount;
let context: BrowserContext;
let page: Page;
let patientId: string;
let eventId: string;

test.describe.configure({ mode: 'serial', timeout: 90_000 });

test.beforeAll(async ({ browser }, testInfo) => {
  test.setTimeout(180_000);
  api = await playwrightRequest.newContext();
  account = await createAccount(api, 'm16-20.capture', 'psychologist');
  const patient = await api.post(`${API}/api/patients`, { data: { displayName: 'سلمى ب.' } });
  expect(patient.status(), await patient.text()).toBe(201);
  patientId = ((await patient.json()) as { id: string }).id;
  // Séance d'accueil créée de façon asynchrone, puis une séance démarrée : le bloc est posé.
  await expect(async () => {
    const current = await api.get(`${API}/api/patients/${patientId}/sessions/current`);
    expect(current.status()).toBe(200);
  }).toPass({ timeout: 15_000 });
  const started = await api.post(`${API}/api/patients/${patientId}/sessions/start`, {
    data: { modality: 'in_person' },
  });
  expect(started.status(), await started.text()).toBe(201);
  const event = await api.post(`${API}/api/patients/${patientId}/entries`, {
    data: { type: 'event', title: EVENT_TITLE },
  });
  expect(event.status(), await event.text()).toBe(201);
  eventId = ((await event.json()) as { id: string }).id;
  // Contexte neuf avec la baseURL, la locale et le fuseau du projet.
  context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    locale: testInfo.project.use.locale,
    timezoneId: testInfo.project.use.timezoneId,
  });
  page = await context.newPage();
  await signIn(page, account);
});

test.afterAll(async () => {
  await context?.close();
  await api?.dispose();
});

/** Repères du bloc, par la structure (aucun libellé). */
function block() {
  const root = page.locator('pm-capture-block');
  return {
    root,
    input: root.locator('#pm-capture-input'),
    chip: (type: string) => root.locator(`.types .tchip[data-type="${type}"]`),
    when: root.locator('#pm-capture-when'),
    emotion: root.locator('#pm-capture-emotion'),
    options: root.locator('pm-capture-emotion li[role="option"]'),
    slider: root.locator('#pm-capture-intensity'),
    cell: (value: number) => root.locator(`pm-capture-scale .cell[data-value="${value}"]`),
    placed: root.locator('pm-capture-links .tchip.pressed'),
    save: root.locator('button.save'),
    notes: root.locator('.notes'),
  };
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

async function direction(selector: string): Promise<string> {
  return page
    .locator(selector)
    .first()
    .evaluate((element) => getComputedStyle(element).direction);
}

function isCreate(response: Response): boolean {
  return (
    response.request().method() === 'POST' &&
    new URL(response.url()).pathname === `/api/patients/${patientId}/entries`
  );
}

/** Le dossier en /ar/, bloc déplié, vocabulaire et rail lus. */
async function openBlock(): Promise<void> {
  await page.goto(`/ar/patients/${patientId}`);
  await expect(page).toHaveURL(new RegExp(`/ar/patients/${patientId}`));
  const b = block();
  await expect(b.root.locator('.block')).toHaveClass(/expanded/, { timeout: 20_000 });
  await expect(b.root.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 20_000 });
  await expect(b.root.locator('pm-capture-links .tchip').first()).toBeVisible();
}

/** Enregistre par le bouton, rend le corps envoyé et l'entrée relue par l'API. */
async function saveAndRead(): Promise<{
  sent: Record<string, unknown>;
  entry: {
    body: string | null;
    occurred: { from: string; precision: string };
    feeling: { intensity: number };
  };
}> {
  const created = page.waitForResponse(isCreate);
  await block().save.click();
  const response = await created;
  expect(response.status(), await response.text()).toBe(201);
  const id = ((await response.json()) as { id: string }).id;
  const read = await api.get(`${API}/api/entries/${id}`);
  expect(read.status(), await read.text()).toBe(200);
  await expect(block().input).toHaveValue('');
  return {
    sent: response.request().postDataJSON() as Record<string, unknown>,
    entry: await read.json(),
  };
}

test('bloc vide : puces de droite à gauche, rien ne déborde', async () => {
  await openBlock();
  const b = block();
  await expect(b.chip('note')).toHaveAttribute('aria-pressed', 'true');
  // Puces dans le sens de lecture : la première (Note) à droite de la deuxième.
  const first = await boxOf('pm-capture-block .types .tchip[data-type="note"]');
  const second = await boxOf('pm-capture-block .types .tchip[data-type="feeling"]');
  expect(first.x).toBeGreaterThan(second.x);
  // Enregistrer à gauche de Détailler (fin de ligne).
  const save = await boxOf('pm-capture-block button.save');
  const detail = await boxOf('pm-capture-block button.detail');
  expect(save.x).toBeLessThan(detail.x);
  await expectRtlPage();
  await shoot(page, 'arabe-capture-vide');

  await page.setViewportSize({ width: 390, height: 844 });
  try {
    await expect(b.input).toBeVisible();
    await expectRtlPage();
    await shoot(page, 'arabe-capture-vide-390');
  } finally {
    await page.setViewportSize({ width: 1280, height: 720 });
  }
});

test('bloc rempli : un texte arabe ne produit aucune date, il part tel quel', async () => {
  await openBlock();
  const b = block();
  await b.input.fill(ARABIC_NOTE);
  await expect(b.chip('note')).toHaveAttribute('aria-pressed', 'true');
  // Aucune date lue : « Quand » reste « maintenant », aucun avertissement sous les champs.
  await expect(b.when).toHaveValue('now');
  await expect(b.notes).toHaveCount(0);
  // Saisie arabe de droite à gauche (dir="auto"), saisie latine de gauche à droite.
  expect(await direction('#pm-capture-input')).toBe('rtl');
  await b.input.fill('Dort mal');
  expect(await direction('#pm-capture-input')).toBe('ltr');
  await b.input.fill(ARABIC_NOTE);
  await expect(b.when).toHaveValue('now');
  await expectRtlPage();
  await shoot(page, 'arabe-capture-rempli');

  const { sent, entry } = await saveAndRead();
  expect(sent).toEqual({
    type: 'note',
    visibility: 'clinical',
    body: ARABIC_NOTE,
    status: 'final',
  });
  expect(entry.body).toBe(ARABIC_NOTE);
  // Sans moment envoyé, l'API prend l'instant de saisie (CreateEntryRequest.occurred).
  expect(entry.occurred.precision).toBe('exact');
  expect(Math.abs(Date.parse(entry.occurred.from) - Date.now())).toBeLessThan(10 * 60_000);
});

test('lien proposé : « > » et le début d’un titre arabe posent le lien, émotion lue', async () => {
  await openBlock();
  const b = block();
  // Ressenti lié à l'événement, comme e2e/flux-3-saisie (l'événement déclenche le ressenti).
  await b.input.fill('anx 6 نوبة هلع > اجت');
  await expect(b.chip('feeling')).toHaveAttribute('aria-pressed', 'true');
  await expect(b.placed).toHaveCount(1);
  await expect(b.placed).toContainText(EVENT_TITLE);
  // Nom de la cible saisi en arabe : de droite à gauche (dir="auto").
  expect(await direction('pm-capture-block pm-capture-links .tchip.pressed .name')).toBe('rtl');
  // L'étiquette de la rangée à droite de la puce posée.
  const legend = await boxOf('pm-capture-block pm-capture-links .lbl');
  const placed = await boxOf('pm-capture-block pm-capture-links .tchip.pressed');
  expect(legend.x).toBeGreaterThan(placed.x);
  await expectRtlPage();
  await shoot(page, 'arabe-capture-lien');

  const { sent } = await saveAndRead();
  expect(sent['links']).toEqual([
    { targetId: eventId, linkType: 'triggers', direction: 'incoming' },
  ]);
});

/**
 * Une flèche à la fois jusqu'à `target`, chaque pas attendu : l'échelle part de la valeur rendue,
 * des frappes plus rapides que le rendu se perdraient (même comportement en /fr/).
 */
async function stepTo(key: 'ArrowLeft' | 'ArrowRight', target: number): Promise<void> {
  const slider = block().slider;
  let value = Number(await slider.getAttribute('aria-valuenow'));
  while (value !== target) {
    const before = value;
    await page.keyboard.press(key);
    await expect.poll(() => slider.getAttribute('aria-valuenow')).not.toBe(String(before));
    value = Number(await slider.getAttribute('aria-valuenow'));
    // Le sens : flèche gauche augmente, flèche droite diminue, d'un pas.
    expect(value - before).toBe(key === 'ArrowLeft' ? 1 : -1);
  }
}

/**
 * Ressenti choisi à la puce, émotion « anxiety » cherchée par son code : la liste ne garde que
 * cette émotion (et la ligne de création, exclue), quel que soit l'ordre du vocabulaire.
 */
async function feelingWithEmotion(): Promise<void> {
  const b = block();
  await b.chip('feeling').click();
  await expect(b.chip('feeling')).toHaveAttribute('aria-pressed', 'true');
  await b.emotion.click();
  await b.emotion.fill('anxiety');
  const found = b.options.and(b.root.locator('li:not(.create)'));
  await expect(found).toHaveCount(1);
  await found.click();
  await expect(b.emotion).not.toHaveValue('anxiety');
}

test('émotion et intensité : flèche gauche augmente jusqu’à 10, la case 1 est à droite ; relu par l’API', async () => {
  await openBlock();
  const b = block();
  await feelingWithEmotion();
  await b.slider.focus();
  await page.keyboard.press('Home');
  await expect.poll(() => b.slider.getAttribute('aria-valuenow')).toBe('0');
  await stepTo('ArrowLeft', 10);
  // Au-delà du maximum, la valeur reste 10.
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => b.slider.getAttribute('aria-valuenow')).toBe('10');
  await expect(b.cell(10)).toHaveClass(/\bon\b/);
  // Minimum à droite : la case 1 à droite de la case 10, chaque case à gauche de la précédente.
  const xs = await b.root
    .locator('pm-capture-scale .cell')
    .evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().x));
  expect(xs, 'cases de droite à gauche').toEqual([...xs].sort((a, c) => c - a));
  const one = await boxOf('pm-capture-block pm-capture-scale .cell[data-value="1"]');
  const ten = await boxOf('pm-capture-block pm-capture-scale .cell[data-value="10"]');
  expect(one.x).toBeGreaterThan(ten.x);
  await b.input.fill('ليلة صعبة');
  await expect(b.chip('feeling')).toHaveAttribute('aria-pressed', 'true');
  await expectRtlPage();
  await shoot(page, 'arabe-capture-emotion-intensite');

  const { sent, entry } = await saveAndRead();
  expect(sent['feeling']).toEqual({ emotionCode: 'anxiety', intensity: 10 });
  expect(entry.feeling.intensity).toBe(10);
});

test('intensité : flèche droite diminue jusqu’à 0 ; relu par l’API', async () => {
  await openBlock();
  const b = block();
  await feelingWithEmotion();
  await b.slider.focus();
  await page.keyboard.press('End');
  await expect.poll(() => b.slider.getAttribute('aria-valuenow')).toBe('10');
  await stepTo('ArrowRight', 9);
  await expect(b.cell(10)).not.toHaveClass(/\bon\b/);
  await expect(b.cell(9)).toHaveClass(/\bon\b/);
  await stepTo('ArrowRight', 0);
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => b.slider.getAttribute('aria-valuenow')).toBe('0');
  await expect(b.cell(1)).not.toHaveClass(/\bon\b/);
  await b.input.fill('هدوء تام');

  const { sent, entry } = await saveAndRead();
  expect(sent['feeling']).toEqual({ emotionCode: 'anxiety', intensity: 0 });
  expect(entry.feeling.intensity).toBe(0);
});
