import {
  APIRequestContext,
  BrowserContext,
  expect,
  Locator,
  Page,
  request as playwrightRequest,
  test,
} from '@playwright/test';

import { createAccount, signIn } from '../preferences/accounts';
import { TestAccount } from '../support/accounts';
import { expectNoAxeViolations } from '../support/axe';
import { shoot } from '../support/captures';
import { API } from '../support/env';

// M16-22, onglet Profil 360 de droite à gauche (G Q53, Q71, Q74 à Q77 ; fiche 30 ; docs/design/
// arabe.md §1 à §5, §9) : état vide, les quatre rubriques, le panneau en création et en
// modification, en /ar/. Pour chaque écran : <html dir="rtl">, pas de défilement horizontal,
// axe-core sans violation, une capture (PSYMATE_E2E_CAPTURES, thème clair du compte). Le rendu est
// mesuré (positions des boîtes, direction calculée par le navigateur), pas déduit d'un attribut, et
// aucune mesure ne dépend de la largeur d'une police. Aucun libellé ciblé (rôles, structure, URL) :
// les textes de /ar/ passent du français de repli à l'arabe au fil du jalon. Les informations sont
// écrites par l'API (une en arabe, une en français par rubrique), jamais par l'écran ; une seule
// inscription et une seule connexion (en /fr/), puis /ar/… ; contre l'API locale (seed small),
// jamais de mock du backend.

type Category = 'history' | 'family' | 'health' | 'values_goals';

interface Seed {
  category: Category;
  title: string;
  detail?: string;
  periodLabel?: string;
  periodYear?: number;
}

/** Une information saisie en arabe et une en français par rubrique (Q77). */
const ITEMS: Seed[] = [
  {
    category: 'history',
    title: 'الطفولة في الرباط',
    detail: 'ذكريات المدرسة والبحر',
    periodLabel: 'الطفولة',
    periodYear: 1990,
  },
  {
    category: 'history',
    title: 'Enfance à Nantes',
    detail: 'Souvenirs de l’école et de la Loire',
    // Une lettre latine d'abord : une période en chiffres seuls n'a pas de sens propre.
    periodLabel: 'Années 1990',
    periodYear: 1991,
  },
  { category: 'family', title: 'مُنى، أخته', detail: 'تعيش في الرباط' },
  { category: 'family', title: 'Thomas, compagnon', detail: 'Vie commune depuis 2020' },
  { category: 'health', title: 'صداع نصفي', detail: 'منذ المراهقة' },
  { category: 'health', title: 'Asthme léger', detail: 'Depuis l’enfance' },
  { category: 'values_goals', title: 'العودة إلى العزف على البيانو' },
  { category: 'values_goals', title: 'Reprendre la course à pied' },
];

/** Ordre du menu et de l'API (fiche 30, Structure 1). */
const CATEGORIES: Category[] = ['history', 'family', 'health', 'values_goals'];

const ARABIC = /\p{Script=Arabic}/u;

let api: APIRequestContext;
let account: TestAccount;
let context: BrowserContext;
let page: Page;
/** Patient sans information (état vide). */
let emptyId: string;
/** Patient aux huit informations. */
let fullId: string;
/** Identifiants des informations, par titre. */
const itemIds = new Map<string, string>();

test.describe.configure({ mode: 'serial', timeout: 90_000 });

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000);
  api = await playwrightRequest.newContext();
  account = await createAccount(api, 'm16-22.profil360', 'psychologist');
  emptyId = await createPatient('Lou P.');
  fullId = await createPatient('سلمى ب.');
  for (const data of ITEMS) {
    const response = await api.post(`${API}/api/patients/${fullId}/profile-items`, { data });
    expect(response.status(), await response.text()).toBe(201);
    itemIds.set(data.title, ((await response.json()) as { id: string }).id);
  }
  // Contexte créé par le fixture browser : baseURL, locale et fuseau du projet.
  context = await browser.newContext();
  page = await context.newPage();
  await signIn(page, account);
});

test.afterAll(async () => {
  await context?.close();
  await api?.dispose();
});

async function createPatient(displayName: string): Promise<string> {
  const response = await api.post(`${API}/api/patients`, { data: { displayName } });
  expect(response.status(), await response.text()).toBe(201);
  return ((await response.json()) as { id: string }).id;
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
async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box, 'élément rendu').not.toBeNull();
  return box!;
}

/** Sens calculé d'un élément (dir="auto" résolu par le navigateur). */
async function direction(locator: Locator): Promise<string> {
  return locator.evaluate((el) => getComputedStyle(el).direction);
}

function rubric(): Locator {
  return page.locator('pm-profile360-page pm-profile-rubric');
}

/** L'information d'un titre (bouton, le patient n'est pas archivé). */
function row(title: string): Locator {
  return rubric().locator(`button.item[data-item-id="${itemIds.get(title)}"]`);
}

/** Ouvre l'onglet sur une rubrique et attend ses informations. */
async function openRubric(locale: string, category: Category): Promise<void> {
  await page.goto(`/${locale}/patients/${fullId}/profile?rubrique=${category}`);
  const titles = ITEMS.filter((item) => item.category === category).map((item) => item.title);
  for (const title of titles) await expect(row(title)).toBeVisible();
  const links = page.locator('pm-profile-menu nav a');
  await expect(links.nth(CATEGORIES.indexOf(category))).toHaveAttribute('aria-current', 'true');
}

/** Le titre et le détail de chaque information de la rubrique, chacun dans son sens (Q77). */
async function expectOwnDirections(category: Category): Promise<void> {
  for (const item of ITEMS.filter((entry) => entry.category === category)) {
    const expected = ARABIC.test(item.title) ? 'rtl' : 'ltr';
    expect(await direction(row(item.title).locator('.t')), item.title).toBe(expected);
    if (item.detail) {
      expect(await direction(row(item.title).locator('.d')), item.detail).toBe(expected);
    }
    if (item.periodLabel) {
      expect(await direction(row(item.title).locator('.k > span')), item.periodLabel).toBe(
        expected,
      );
    }
  }
}

test('état vide', async () => {
  await page.goto(`/ar/patients/${emptyId}/profile`);
  const empty = page.locator('pm-profile360-page .empty');
  await expect(empty.locator('pm-state')).toBeVisible();
  await expect(page.locator('pm-profile-menu')).toHaveCount(0);
  // Le bouton d'ajout de l'état vide, centré sous l'état.
  const add = await boxOf(empty.locator('pm-profile-add a'));
  const state = await boxOf(empty.locator('pm-state'));
  expect(Math.abs(add.x + add.width / 2 - (state.x + state.width / 2))).toBeLessThan(2);
  await expectRtlPage();
  await shoot(page, 'arabe-profil360-vide');
});

test('Histoire et souvenirs : menu à droite, période à droite du fil, chacun dans son sens', async () => {
  await openRubric('ar', 'history');

  // Menu des rubriques à droite, rubrique affichée à gauche.
  const menu = await boxOf(page.locator('pm-profile-menu'));
  const content = await boxOf(rubric());
  expect(menu.x).toBeGreaterThan(content.x + content.width - 1);

  // Bouton « Ajouter au profil » au bout de la ligne des onglets : à gauche du dernier onglet.
  const lastTab = await boxOf(page.locator('pm-patient-header nav.tabs a').last());
  const add = await boxOf(page.locator('pm-patient-header pm-profile-add a'));
  expect(add.x + add.width).toBeLessThanOrEqual(lastTab.x);

  // Fil chronologique : la période en début de ligne (à droite), le point, puis le titre à gauche.
  for (const item of ITEMS.filter((entry) => entry.category === 'history')) {
    const line = row(item.title);
    const period = await boxOf(line.locator('.k'));
    const dot = await boxOf(line.locator('.dot'));
    const title = await boxOf(line.locator('.t'));
    expect(period.x, 'période à droite du point').toBeGreaterThanOrEqual(dot.x + dot.width);
    expect(dot.x, 'point à droite du titre').toBeGreaterThanOrEqual(title.x + title.width);
    // La période s'aligne vers le fil (fin de ligne, à gauche), quel que soit son sens.
    const text = await boxOf(line.locator('.k > span'));
    expect(Math.abs(text.x - period.x), 'période contre le fil').toBeLessThan(1);
  }

  // Le trait du fil (pseudo-élément) passe par le centre du point, de ce côté-ci.
  const first = rubric().locator('ol > li').first();
  const geometry = await first.evaluate((li) => {
    const line = getComputedStyle(li, '::before');
    const dot = li.querySelector('.dot')!.getBoundingClientRect();
    const box = li.getBoundingClientRect();
    return {
      lineCenter: box.right - parseFloat(line.right) - parseFloat(line.width) / 2,
      dotCenter: dot.x + dot.width / 2,
    };
  });
  expect(Math.abs(geometry.lineCenter - geometry.dotCenter)).toBeLessThan(1.5);

  await expectOwnDirections('history');
  await expectRtlPage();
  await shoot(page, 'arabe-profil360-histoire');
});

test('Famille et entourage : pastille à droite, première lettre arabe sans capitale', async () => {
  await openRubric('ar', 'family');
  const arabic = row('مُنى، أخته');
  const latin = row('Thomas, compagnon');
  // La première lettre arabe avec sa voyelle brève (un graphème), la lettre latine en capitale.
  await expect(arabic.locator('.av')).toHaveText('مُ');
  await expect(latin.locator('.av')).toHaveText('T');
  for (const line of [arabic, latin]) {
    const avatar = await boxOf(line.locator('.av'));
    const body = await boxOf(line.locator('.body'));
    expect(avatar.x, 'pastille à droite du titre').toBeGreaterThanOrEqual(body.x + body.width);
  }
  await expectOwnDirections('family');
  await expectRtlPage();
  await shoot(page, 'arabe-profil360-famille');
});

test('Santé et antécédents, Valeurs et projets : chacun dans son sens', async () => {
  for (const category of ['health', 'values_goals'] as const) {
    await openRubric('ar', category);
    await expectOwnDirections(category);
    await expect(rubric().locator('.av, .k')).toHaveCount(0);
    await expectRtlPage();
    await shoot(page, `arabe-profil360-${category === 'health' ? 'sante' : 'valeurs'}`);
  }
});

test('panneau en création : à gauche, champs dans le sens de la saisie', async () => {
  await openRubric('ar', 'history');
  await page.locator('pm-patient-header pm-profile-add a').click();
  await expect(page).toHaveURL(/ajouter=1/);
  const dialog = page.locator('[role="dialog"]').filter({ has: page.locator('pm-side-panel') });
  await expect(dialog).toBeVisible();
  // Le panneau latéral passe à gauche en arabe (fin de ligne).
  const panel = await boxOf(dialog);
  expect(panel.x).toBeLessThan(1);
  expect(panel.x + panel.width).toBeLessThan(page.viewportSize()!.width);

  const title = dialog.locator('#field-title');
  const detail = dialog.locator('#field-detail');
  const period = dialog.locator('#field-periodLabel');
  await title.fill('Thomas, compagnon');
  expect(await direction(title)).toBe('ltr');
  await title.fill('سنوات الجامعة');
  expect(await direction(title)).toBe('rtl');
  await detail.fill('Souvenir partagé en séance');
  expect(await direction(detail)).toBe('ltr');
  await period.fill('الشباب');
  expect(await direction(period)).toBe('rtl');
  await expectRtlPage();
  await shoot(page, 'arabe-profil360-panneau-creation', false);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('panneau en modification : valeurs saisies dans leur sens', async () => {
  await openRubric('ar', 'history');
  await row('الطفولة في الرباط').click();
  const dialog = page.locator('[role="dialog"]').filter({ has: page.locator('pm-side-panel') });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('#field-title')).toHaveValue('الطفولة في الرباط');
  expect(await direction(dialog.locator('#field-title'))).toBe('rtl');
  expect(await direction(dialog.locator('#field-detail'))).toBe('rtl');
  expect(await direction(dialog.locator('#field-periodLabel'))).toBe('rtl');
  // Le pied : « Retirer du profil » en début de ligne (à droite), le bouton principal en fin.
  const remove = await boxOf(dialog.locator('.btn-text'));
  const submit = await boxOf(dialog.locator('.btn-primary'));
  expect(remove.x).toBeGreaterThan(submit.x + submit.width);
  await expectRtlPage();
  await shoot(page, 'arabe-profil360-panneau-modification', false);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  // Une information en français, dans l'interface arabe : de gauche à droite.
  await row('Enfance à Nantes').click();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('#field-title')).toHaveValue('Enfance à Nantes');
  expect(await direction(dialog.locator('#field-title'))).toBe('ltr');
  expect(await direction(dialog.locator('#field-periodLabel'))).toBe('ltr');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('en /fr/ et /en/ aussi, chaque information dans son sens (Q77)', async () => {
  for (const locale of ['fr', 'en']) {
    await openRubric(locale, 'history');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expectOwnDirections('history');
    await openRubric(locale, 'family');
    await expectOwnDirections('family');
    await expect(row('مُنى، أخته').locator('.av')).toHaveText('مُ');
    await expect(row('Thomas, compagnon').locator('.av')).toHaveText('T');
  }
});

test('390 px : le menu au-dessus du contenu, rien ne déborde', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  try {
    await openRubric('ar', 'history');
    const menu = await boxOf(page.locator('pm-profile-menu'));
    const content = await boxOf(rubric());
    expect(menu.y + menu.height).toBeLessThanOrEqual(content.y);
    // La rangée des rubriques commence à droite.
    const links = page.locator('pm-profile-menu nav a');
    const first = await boxOf(links.first());
    const second = await boxOf(links.nth(1));
    expect(first.x).toBeGreaterThan(second.x);
    await expectRtlPage();
    await shoot(page, 'arabe-profil360-histoire-390');
  } finally {
    await page.setViewportSize({ width: 1280, height: 720 });
  }
});
