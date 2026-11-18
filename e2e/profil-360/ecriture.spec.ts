import { APIRequestContext, expect, Page, Request, test } from '@playwright/test';

import { createAccount, signIn } from '../preferences/accounts';
import { expectNoAxeViolations } from '../support/axe';

// Profil 360 en écriture (M13-07, fiche 30, G Q54, Q55) : contre l'API locale, jamais de mock du
// backend. Chaque test crée un compte et un patient jetables (comme lecture.spec.ts) : les
// informations écrites par les tests ne touchent jamais les patients du seed. Le panneau latéral
// ajoute, modifie et retire ; après chaque écriture, le profil est relu (GET), jamais corrigé
// localement. Aucune requête de séance, d'entrée ou de lien pendant ces parcours.

const API = 'http://localhost:8080';

type Category = 'history' | 'family' | 'health' | 'values_goals';

interface Seed {
  category: Category;
  title: string;
  detail?: string;
  periodLabel?: string;
  periodYear?: number;
}

/** Patient jetable du compte connecté sur `api`, avec les informations données (écrites par l'API). */
async function patientWith(api: APIRequestContext, name: string, items: Seed[]): Promise<string> {
  const created = await api.post(`${API}/api/patients`, { data: { displayName: name } });
  expect(created.status(), await created.text()).toBe(201);
  const id = ((await created.json()) as { id: string }).id;
  for (const data of items) {
    const response = await api.post(`${API}/api/patients/${id}/profile-items`, { data });
    expect(response.status(), await response.text()).toBe(201);
  }
  return id;
}

/** Toutes les requêtes vers l'API faites par la page à partir de maintenant. */
function recordApi(page: Page): Request[] {
  const seen: Request[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) seen.push(request);
  });
  return seen;
}

/** Routes de séance, d'entrée ou de lien : le Profil 360 n'en appelle aucune (fiche 30). */
function isSessionEntryOrLink(request: Request): boolean {
  return /\/(sessions|entries|links|timeline)(\/|$|\?)/.test(new URL(request.url()).pathname);
}

function isProfileRead(request: Request, patientId: string): boolean {
  return (
    request.method() === 'GET' &&
    new URL(request.url()).pathname === `/api/patients/${patientId}/profile-items`
  );
}

function header(page: Page) {
  return page.locator('pm-patient-header');
}

function addButton(page: Page) {
  return header(page).getByRole('link', { name: 'Ajouter au profil' });
}

function menu(page: Page) {
  return page.getByRole('navigation', { name: 'Rubriques du profil' });
}

function rubric(page: Page) {
  return page.locator('pm-profile-rubric');
}

async function shownTitles(page: Page): Promise<string[]> {
  return (await rubric(page).locator('li .t').allTextContents()).map((t) => t.trim());
}

async function openRubric(page: Page, label: string): Promise<void> {
  await menu(page)
    .getByRole('link', { name: new RegExp(label) })
    .click();
  await expect(rubric(page).getByRole('heading', { level: 3 })).toHaveText(label);
}

test('ajouter, modifier, retirer : panneau, relecture après chaque écriture, toasts, focus rendu', async ({
  page,
  request,
}) => {
  const account = await createAccount(request, 'm13-07.ecriture', 'psychologist');
  const id = await patientWith(request, 'Noé V.', [
    {
      category: 'history',
      title: 'Enfance à Nantes',
      periodLabel: '1991 – 2002',
      periodYear: 1991,
    },
    { category: 'history', title: 'Souvenir sans date' },
    { category: 'health', title: 'Migraines' },
  ]);

  await signIn(page, account);
  const requests = recordApi(page);
  await page.goto(`/fr/patients/${id}/profile`);
  await expect(rubric(page).getByRole('heading', { level: 3 })).toHaveText('Histoire et souvenirs');

  // « Ajouter au profil » : au bout de la ligne des onglets, à droite du dernier onglet.
  await expect(addButton(page)).toBeVisible();
  const lastTab = await header(page).locator('nav.tabs a').last().boundingBox();
  const add = await addButton(page).boundingBox();
  expect(lastTab && add && add.x > lastTab.x + lastTab.width).toBe(true);
  // Absent des autres onglets ; le sélecteur de fenêtre reste sur la Vue d'ensemble.
  await header(page)
    .getByRole('link', { name: /Vue d'ensemble/ })
    .first()
    .click();
  await expect(header(page).getByRole('group', { name: 'Fenêtre' })).toBeVisible();
  await expect(addButton(page)).toHaveCount(0);
  await header(page)
    .getByRole('link', { name: /Graphe/ })
    .click();
  await expect(page).toHaveURL(new RegExp(`/fr/patients/${id}/graph`));
  await expect(addButton(page)).toHaveCount(0);
  await header(page)
    .getByRole('link', { name: /Profil 360/ })
    .click();
  await expect(rubric(page)).toBeVisible();
  // À partir d'ici, les parcours d'écriture : aucune requête de séance, d'entrée ni de lien.
  const during = recordApi(page);

  // Santé et antécédents affichée, puis « Ajouter au profil » : rubrique préremplie, focus sur
  // Information, pas de Période ni d'Année.
  await openRubric(page, 'Santé et antécédents');
  await expect(rubric(page).locator('.dhead p')).toContainText('1 information');
  await addButton(page).click();
  const dialog = page.getByRole('dialog', { name: 'Ajouter au profil' });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/rubrique=health&ajouter=1$/);
  await expect(dialog.getByLabel('Rubrique')).toHaveValue('health');
  await expect(dialog.getByLabel('Information', { exact: true })).toBeFocused();
  await expect(dialog.getByLabel(/^Période/)).toHaveCount(0);
  await expect(dialog.getByLabel(/^Année/)).toHaveCount(0);
  await expectNoAxeViolations(page);

  // Titre vide : aucune requête, message sous le champ.
  const writesBefore = requests.filter((r) => r.method() !== 'GET').length;
  await dialog.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect(dialog.locator('#field-title-error')).toHaveText('Ce champ est obligatoire.');
  expect(requests.filter((r) => r.method() !== 'GET')).toHaveLength(writesBefore);

  // Période et Année n'existent que pour Histoire et souvenirs ; en partir les vide.
  // Les champs apparaissent et disparaissent sans déplacer le focus.
  await dialog.getByLabel('Rubrique').focus();
  await dialog.getByLabel('Rubrique').selectOption('history');
  await expect(dialog.getByLabel(/^Période/)).toBeVisible();
  await expect(dialog.getByLabel('Rubrique')).toBeFocused();
  await dialog.getByLabel(/^Période/).fill('Vers 2000');
  await dialog.getByLabel(/^Année/).fill('2000');
  await dialog.getByLabel('Rubrique').focus();
  await dialog.getByLabel('Rubrique').selectOption('health');
  await expect(dialog.getByLabel(/^Période/)).toHaveCount(0);
  await expect(dialog.getByLabel('Rubrique')).toBeFocused();
  // Y revenir les réaffiche vides.
  await dialog.getByLabel('Rubrique').selectOption('history');
  await expect(dialog.getByLabel(/^Période/)).toHaveValue('');
  await expect(dialog.getByLabel(/^Année/)).toHaveValue('');
  await dialog.getByLabel('Rubrique').selectOption('health');

  // Ajout dans Santé : la requête part sans periodLabel ni periodYear ; puis relecture.
  await dialog.getByLabel('Information', { exact: true }).fill('Asthme léger');
  await dialog.getByLabel(/^Précision/).fill("Depuis l'enfance");
  const readsBefore = requests.filter((r) => isProfileRead(r, id)).length;
  const [post] = await Promise.all([
    page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/profile-items')),
    dialog.getByRole('button', { name: 'Ajouter', exact: true }).click(),
  ]);
  expect(post.postDataJSON()).toEqual({
    category: 'health',
    title: 'Asthme léger',
    detail: "Depuis l'enfance",
  });
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Information ajoutée')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/fr/patients/${id}/profile\\?rubrique=health$`));
  expect(await shownTitles(page)).toEqual(['Migraines', 'Asthme léger']);
  await expect(rubric(page).locator('.dhead p')).toContainText('2 informations');
  await expect(menu(page).getByRole('link', { name: /Santé et antécédents/ })).toHaveAccessibleName(
    'Santé et antécédents 2 informations',
  );
  expect(requests.filter((r) => isProfileRead(r, id)).length).toBe(readsBefore + 1);
  await expect(addButton(page)).toBeFocused();

  // Modifier le titre et effacer la précision : PATCH des seuls champs changés, pas de doublon.
  const item = rubric(page).getByRole('button', { name: 'Asthme léger' });
  await item.click();
  const edit = page.getByRole('dialog', { name: "Modifier l'information" });
  await expect(edit).toBeVisible();
  await expect(edit.getByLabel('Information', { exact: true })).toHaveValue('Asthme léger');
  await expect(edit.getByLabel(/^Précision/)).toHaveValue("Depuis l'enfance");
  await edit.getByLabel('Information', { exact: true }).fill('Asthme');
  await edit.getByLabel(/^Précision/).fill('');
  const [patch] = await Promise.all([
    page.waitForRequest((r) => r.method() === 'PATCH'),
    edit.getByRole('button', { name: 'Enregistrer' }).click(),
  ]);
  expect(patch.postDataJSON()).toEqual({ title: 'Asthme', detail: null });
  await expect(edit).toHaveCount(0);
  await expect(page.getByText('Information modifiée')).toBeVisible();
  expect(await shownTitles(page)).toEqual(['Migraines', 'Asthme']);
  await expect(rubric(page).locator('li').nth(1).locator('.d')).toHaveCount(0);
  await expect(rubric(page).getByRole('button', { name: 'Asthme', exact: true })).toBeFocused();

  // Une information d'histoire créée avec une année se place à son rang après relecture.
  await openRubric(page, 'Histoire et souvenirs');
  await addButton(page).click();
  await expect(dialog.getByLabel('Rubrique')).toHaveValue('history');
  await dialog.getByLabel('Information', { exact: true }).fill('Naissance de sa sœur');
  await dialog.getByLabel(/^Période/).fill('1985');
  await dialog.getByLabel(/^Année/).fill('1985');
  const [historyPost] = await Promise.all([
    page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/profile-items')),
    dialog.getByRole('button', { name: 'Ajouter', exact: true }).click(),
  ]);
  expect(historyPost.postDataJSON()).toEqual({
    category: 'history',
    title: 'Naissance de sa sœur',
    periodLabel: '1985',
    periodYear: 1985,
  });
  await expect(dialog).toHaveCount(0);
  await expect
    .poll(() => shownTitles(page))
    .toEqual(['Naissance de sa sœur', 'Enfance à Nantes', 'Souvenir sans date']);

  // Retirer : annuler la confirmation ne change rien ; confirmer retire et relit.
  await openRubric(page, 'Santé et antécédents');
  await rubric(page).getByRole('button', { name: 'Asthme', exact: true }).click();
  await expect(edit).toBeVisible();
  const removeButton = edit.getByRole('button', { name: 'Retirer du profil' });
  await removeButton.click();
  const confirm = page.getByRole('dialog', { name: 'Retirer cette information du profil ?' });
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText('Elle ne sera plus affichée.');
  await expectNoAxeViolations(page);
  await confirm.getByRole('button', { name: 'Annuler' }).click();
  await expect(confirm).toHaveCount(0);
  await expect(edit).toBeVisible();
  expect(requests.filter((r) => r.method() === 'DELETE')).toHaveLength(0);

  await removeButton.click();
  await confirm.getByRole('button', { name: 'Retirer', exact: true }).click();
  await expect(edit).toHaveCount(0);
  await expect(page.getByText('Information retirée')).toBeVisible();
  expect(await shownTitles(page)).toEqual(['Migraines']);
  await expect(rubric(page).locator('.dhead p')).toContainText('1 information');
  expect(requests.filter((r) => r.method() === 'DELETE')).toHaveLength(1);

  // Échap ferme le panneau, rend le focus au déclencheur et retire ?ajouter=.
  await addButton(page).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(addButton(page)).toBeFocused();
  await expect(page).toHaveURL(new RegExp(`/fr/patients/${id}/profile\\?rubrique=health$`));
  // Au clavier : Entrée sur une information l'ouvre ; Échap rend le focus à l'information.
  const migraines = rubric(page).getByRole('button', { name: 'Migraines' });
  await migraines.focus();
  await page.keyboard.press('Enter');
  await expect(edit).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(edit).toHaveCount(0);
  await expect(migraines).toBeFocused();

  // Aucune séance, entrée ni lien ; pas de bloc de saisie sur l'onglet.
  expect(during.filter(isSessionEntryOrLink).map((r) => `${r.method()} ${r.url()}`)).toEqual([]);
  expect(requests.filter((r) => r.method() !== 'GET' && isSessionEntryOrLink(r))).toEqual([]);
  await expect(page.locator('pm-capture-block')).toHaveCount(0);
});

test('?ajouter=1 ouvre le panneau directement ; axe-core panneau ouvert, thèmes clair et sombre', async ({
  page,
  request,
}) => {
  const account = await createAccount(request, 'm13-07.theme', 'psychologist');
  const id = await patientWith(request, 'Iris T.', [
    { category: 'family', title: 'Thomas, compagnon', detail: 'Vie commune depuis 2020' },
    { category: 'history', title: 'Enfance à Nantes', periodLabel: '1991', periodYear: 1991 },
  ]);
  await signIn(page, account);

  // Lien direct, rubrique conservée : le panneau s'ouvre en création, Famille préremplie.
  await page.goto(`/fr/patients/${id}/profile?rubrique=family&ajouter=1`);
  const dialog = page.getByRole('dialog', { name: 'Ajouter au profil' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Rubrique')).toHaveValue('family');
  await expectNoAxeViolations(page);
  await dialog.getByRole('button', { name: 'Annuler' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/fr/patients/${id}/profile\\?rubrique=family$`));

  // Thème sombre : panneau en modification dans Histoire (Période, Année, « Retirer du profil »).
  const theme = await request.patch(`${API}/api/me/preferences`, { data: { theme: 'dark' } });
  expect(theme.status(), await theme.text()).toBe(200);
  await page.goto(`/fr/patients/${id}/profile`);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await rubric(page)
    .getByRole('button', { name: /Enfance à Nantes/ })
    .click();
  const edit = page.getByRole('dialog', { name: "Modifier l'information" });
  await expect(edit).toBeVisible();
  await expect(edit.getByLabel(/^Période/)).toHaveValue('1991');
  await expect(edit.getByLabel(/^Année/)).toHaveValue('1991');
  await expect(edit.getByRole('button', { name: 'Retirer du profil' })).toBeVisible();
  await expectNoAxeViolations(page);
  await page.goto(`/fr/patients/${id}/profile?ajouter=1`);
  await expect(dialog).toBeVisible();
  await expectNoAxeViolations(page);
});

test('patient archivé : lecture seule, ni bouton ni panneau', async ({ page, request }) => {
  const account = await createAccount(request, 'm13-07.archive', 'psychologist');
  const id = await patientWith(request, 'Jules A.', [
    { category: 'history', title: 'Enfance à Nantes', periodLabel: '1991', periodYear: 1991 },
  ]);
  const archived = await request.delete(`${API}/api/patients/${id}`);
  expect(archived.status(), await archived.text()).toBe(204);

  await signIn(page, account);
  const requests = recordApi(page);
  await page.goto(`/fr/patients/${id}/profile?ajouter=1`);
  await expect(rubric(page).locator('li .t')).toHaveText(['Enfance à Nantes']);
  // ?ajouter=1 n'ouvre rien et disparaît ; aucun bouton d'ajout ; les informations sont inertes.
  await expect(page).toHaveURL(new RegExp(`/fr/patients/${id}/profile$`));
  await expect(addButton(page)).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Ajouter au profil' })).toHaveCount(0);
  await expect(rubric(page).getByRole('button')).toHaveCount(0);
  await rubric(page).getByText('Enfance à Nantes').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expectNoAxeViolations(page);
  expect(requests.filter((r) => r.method() !== 'GET')).toEqual([]);
});
