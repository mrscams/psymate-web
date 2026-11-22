import {
  APIRequestContext,
  expect,
  Page,
  request as playwrightRequest,
  Request,
  test,
} from '@playwright/test';

import { createAccount, signIn } from '../preferences/accounts';
import { SEED } from '../support/accounts';
import { expectNoAxeViolations } from '../support/axe';
import { API } from '../support/env';

// Profil 360 en lecture (M13-06, fiche 30, G Q53, Q55, Q56) : contre l'API locale et le seed small,
// jamais de mock du backend. Le premier test lit un patient du seed (compte de Claire) et compare
// l'écran à la réponse de l'API ; le second crée un compte et un patient jetables (profil vide, puis
// quelques informations écrites par l'API dans la préparation du test) pour l'état vide, le thème
// sombre et la largeur étroite. L'écran lui-même n'écrit jamais rien.

type Category = 'history' | 'family' | 'health' | 'values_goals';

interface Item {
  id: string;
  category: Category;
  title: string;
  detail?: string | null;
  periodLabel?: string | null;
  periodYear?: number | null;
}

const LABELS: Record<Category, string> = {
  history: 'Histoire et souvenirs',
  family: 'Famille et entourage',
  health: 'Santé et antécédents',
  values_goals: 'Valeurs et projets',
};

const CATEGORIES = Object.keys(LABELS) as Category[];

function countText(count: number): string {
  return count === 1 ? '1 information' : `${count} informations`;
}

async function profileOf(api: APIRequestContext, patientId: string): Promise<Item[]> {
  const response = await api.get(`${API}/api/patients/${patientId}/profile-items`);
  expect(response.status(), await response.text()).toBe(200);
  return ((await response.json()) as { items: Item[] }).items;
}

function menu(page: Page) {
  return page.getByRole('navigation', { name: 'Rubriques du profil' });
}

function rubric(page: Page) {
  return page.locator('pm-profile-rubric');
}

/** Les titres affichés dans la rubrique courante, dans l'ordre de l'écran. */
async function shownTitles(page: Page): Promise<string[]> {
  return (await rubric(page).locator('li .t').allTextContents()).map((t) => t.trim());
}

/** Toutes les requêtes vers l'API faites par la page à partir de maintenant. */
function recordApi(page: Page): Request[] {
  const seen: Request[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) seen.push(request);
  });
  return seen;
}

function isProfileRead(request: Request, patientId: string): boolean {
  return (
    request.method() === 'GET' &&
    new URL(request.url()).pathname === `/api/patients/${patientId}/profile-items`
  );
}

test('patient du seed : rubriques et compteurs de l’API, ordre du fil, Famille, ?rubrique=, un seul GET', async ({
  page,
}) => {
  // Le patient de Claire qui a le plus d'informations dans son profil (seed small, M13-03).
  const seed = await playwrightRequest.newContext();
  const login = await seed.post(`${API}/api/auth/login`, { data: SEED.claire });
  expect(login.status(), await login.text()).toBe(200);
  const list = await seed.get(`${API}/api/patients`, { params: { limit: 50 } });
  expect(list.status(), await list.text()).toBe(200);
  const patients = ((await list.json()) as { items: { id: string; displayName: string }[] }).items;
  let chosen: { id: string; items: Item[] } | null = null;
  for (const patient of patients) {
    const items = await profileOf(seed, patient.id);
    if (!chosen || items.length > chosen.items.length) chosen = { id: patient.id, items };
  }
  await seed.dispose();
  expect(chosen, 'un patient de Claire avec un profil (make seed SIZE=small)').not.toBeNull();
  const { id, items } = chosen!;
  expect(items.length).toBeGreaterThan(0);
  const byCategory = (category: Category) => items.filter((item) => item.category === category);

  await signIn(page, SEED.claire);
  const requests = recordApi(page);
  await page.goto(`/fr/patients/${id}/profile`);

  // Menu : les quatre rubriques dans l'ordre, chacune avec le nombre renvoyé par l'API.
  const links = menu(page).getByRole('link');
  await expect(links).toHaveCount(4);
  for (const [index, category] of CATEGORIES.entries()) {
    await expect(links.nth(index)).toHaveAccessibleName(
      `${LABELS[category]} ${countText(byCategory(category).length)}`,
    );
    await expect(links.nth(index).locator('.c')).toHaveText(String(byCategory(category).length));
  }
  await expect(links.first()).toHaveAttribute('aria-current', 'true');

  // Histoire et souvenirs (défaut) : l'ordre de l'API, exactement ; sans année après les datées.
  await expect(rubric(page).getByRole('heading', { level: 3 })).toHaveText(LABELS.history);
  const history = byCategory('history');
  expect(await shownTitles(page)).toEqual(history.map((item) => item.title));
  const firstUndated = history.findIndex((item) => item.periodYear == null);
  if (firstUndated >= 0) {
    expect(history.slice(firstUndated).every((item) => item.periodYear == null)).toBe(true);
  }
  if (history.length > 0) {
    // La période est à gauche du titre, sur le fil (liste ordonnée).
    const row = rubric(page).locator('ol li').first();
    const period = await row.locator('.k').boundingBox();
    const title = await row.locator('.t').boundingBox();
    expect(period && title && period.x + period.width <= title.x).toBe(true);
    await expect(row.locator('.k')).toHaveText(history[0].periodLabel ?? '');
  }
  await expectNoAxeViolations(page);

  // Famille et entourage : clic dans le menu, ?rubrique=family ; titre et détail, pastille à la
  // première lettre du titre, aucune colonne de période.
  await links.nth(1).click();
  await expect(page).toHaveURL(new RegExp(`/fr/patients/${id}/profile\\?rubrique=family$`));
  await expect(rubric(page).getByRole('heading', { level: 3 })).toHaveText(LABELS.family);
  await expect(links.nth(1)).toHaveAttribute('aria-current', 'true');
  const family = byCategory('family');
  expect(await shownTitles(page)).toEqual(family.map((item) => item.title));
  const rows = rubric(page).locator('li');
  for (const [index, item] of family.entries()) {
    const initial = (/\p{L}|\p{N}/u.exec(item.title)?.[0] ?? item.title.charAt(0)).toUpperCase();
    await expect(rows.nth(index).locator('.av')).toHaveText(initial);
    if (item.detail) await expect(rows.nth(index).locator('.d')).toHaveText(item.detail);
    else await expect(rows.nth(index).locator('.d')).toHaveCount(0);
  }
  await expect(rubric(page).locator('.k')).toHaveCount(0);

  // Santé, puis Valeurs : titre et détail, ni pastille ni étiquette ; rubrique vide : son état.
  for (const category of ['health', 'values_goals'] as const) {
    await links.nth(CATEGORIES.indexOf(category)).click();
    await expect(rubric(page).getByRole('heading', { level: 3 })).toHaveText(LABELS[category]);
    const expected = byCategory(category);
    if (expected.length === 0) {
      await expect(rubric(page).getByText("Rien dans cette rubrique pour l'instant")).toBeVisible();
    } else {
      expect(await shownTitles(page)).toEqual(expected.map((item) => item.title));
    }
    await expect(rubric(page).locator('.av, .k')).toHaveCount(0);
  }

  // Un seul GET profile-items, aucune écriture, ni séance ni entrée créées par l'onglet (G Q56).
  expect(requests.filter((r) => isProfileRead(r, id))).toHaveLength(1);
  expect(
    requests.filter((r) => r.method() !== 'GET').map((r) => `${r.method()} ${r.url()}`),
  ).toEqual([]);
  await expect(page.locator('pm-capture-block')).toHaveCount(0);

  // Recharger sur ?rubrique=family affiche Famille et entourage.
  await page.goto(`/fr/patients/${id}/profile?rubrique=family`);
  await expect(rubric(page).getByRole('heading', { level: 3 })).toHaveText(LABELS.family);
  await expect(links.nth(1)).toHaveAttribute('aria-current', 'true');
  // Valeur inconnue : Histoire et souvenirs.
  await page.goto(`/fr/patients/${id}/profile?rubrique=inconnue`);
  await expect(rubric(page).getByRole('heading', { level: 3 })).toHaveText(LABELS.history);
});

test('patient sans information : état vide ; puis profil lu en thème sombre et sous 820 px', async ({
  page,
  request,
}) => {
  const account = await createAccount(request, 'm13-06.profil', 'psychologist');
  const created = await request.post(`${API}/api/patients`, { data: { displayName: 'Lou P.' } });
  expect(created.status(), await created.text()).toBe(201);
  const id = ((await created.json()) as { id: string }).id;

  await signIn(page, account);
  const requests = recordApi(page);
  await page.goto(`/fr/patients/${id}/profile`);
  await expect(page.getByText('Aucune information dans le profil')).toBeVisible();
  await expect(menu(page)).toHaveCount(0);
  await expectNoAxeViolations(page);
  expect(requests.filter((r) => isProfileRead(r, id))).toHaveLength(1);
  expect(requests.filter((r) => r.method() !== 'GET')).toEqual([]);

  // Données préparées par l'API (pas par l'écran) : deux souvenirs, dont un sans année, et un proche.
  for (const data of [
    { category: 'history', title: 'Souvenir sans date', detail: 'Odeur du tilleul' },
    {
      category: 'history',
      title: 'Enfance à Nantes',
      periodLabel: '1991 – 2002',
      periodYear: 1991,
    },
    { category: 'family', title: 'Thomas, compagnon', detail: 'Vie commune depuis 2020' },
  ]) {
    const response = await request.post(`${API}/api/patients/${id}/profile-items`, { data });
    expect(response.status(), await response.text()).toBe(201);
  }
  const theme = await request.patch(`${API}/api/me/preferences`, { data: { theme: 'dark' } });
  expect(theme.status(), await theme.text()).toBe(200);

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  // L'année range le fil côté serveur : la datée d'abord, celle sans année ensuite.
  await expect(rubric(page).getByRole('heading', { level: 3 })).toHaveText(LABELS.history);
  expect(await shownTitles(page)).toEqual(['Enfance à Nantes', 'Souvenir sans date']);
  await expectNoAxeViolations(page);
  await menu(page)
    .getByRole('link', { name: /Famille et entourage/ })
    .click();
  await expect(rubric(page).locator('.av')).toHaveText('T');
  await expectNoAxeViolations(page);
  await menu(page)
    .getByRole('link', { name: /Valeurs et projets/ })
    .click();
  await expect(rubric(page).getByText("Rien dans cette rubrique pour l'instant")).toBeVisible();
  await expectNoAxeViolations(page);

  // Sous 820 px : le menu passe au-dessus du contenu, en une rangée, sans débordement de la page.
  await page.setViewportSize({ width: 600, height: 900 });
  const nav = await menu(page).boundingBox();
  const content = await rubric(page).boundingBox();
  expect(nav && content && nav.y + nav.height <= content.y).toBe(true);
  const links = menu(page).getByRole('link');
  const first = await links.first().boundingBox();
  const second = await links.nth(1).boundingBox();
  expect(first && second && Math.abs(first.y - second.y) < 2).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await expectNoAxeViolations(page);
});
