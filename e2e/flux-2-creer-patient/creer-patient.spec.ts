import { APIRequestContext, expect, Page, test } from '@playwright/test';

import { createAccount, signIn } from '../preferences/accounts';
import { expectNoAxeViolations } from '../support/axe';

// Flux 2 (B3) et fiches 01, 16 (M1-06) : contre l'API locale (seed small, Mailpit), jamais de mock
// du backend. Chaque test crée son compte jetable : la liste de ses patients ne dépend que de lui.

const API = 'http://localhost:8080';

/** Patient créé directement par l'API (session du compte jetable portée par `request`). */
async function createPatient(api: APIRequestContext, displayName: string): Promise<string> {
  const response = await api.post(`${API}/api/patients`, { data: { displayName } });
  expect(response.status(), await response.text()).toBe(201);
  return ((await response.json()) as { id: string }).id;
}

/** Le nom affiché dans la liste, lien vers le dossier. */
function patientLink(page: Page, name: string) {
  return page.getByRole('table').getByRole('link', { name, exact: true });
}

test('créer un patient, le retrouver (marie, marié), modifier le rythme, archiver, restaurer', async ({
  page,
  request,
}) => {
  // Flux complet avec sept passes axe-core : plus long que le délai par défaut de 30 s.
  test.setTimeout(90_000);
  const account = await createAccount(request, 'm1-06.flux2', 'psychologist');
  await createPatient(request, 'Omar B.');
  await signIn(page, account);

  await expect(page.getByRole('heading', { level: 1, name: 'Mes patients' })).toBeVisible();
  await expect(patientLink(page, 'Omar B.')).toBeVisible();
  await expectNoAxeViolations(page);

  // N ouvre la création depuis la liste.
  await page.keyboard.press('n');
  await expect(page).toHaveURL(/\/fr\/patients\/nouveau$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Nouveau patient' })).toBeVisible();
  await expect(page.getByLabel('Durée de séance (min)')).toHaveValue('60');
  await expectNoAxeViolations(page);

  // Erreurs de forme, sans appel réseau : nom manquant, date future ; focus sur le premier champ.
  let posts = 0;
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().endsWith('/api/patients')) posts += 1;
  });
  await page.getByLabel('Date de naissance').fill('2999-01-01');
  await page.getByRole('button', { name: /Enregistrer/ }).click();
  const displayName = page.getByRole('textbox', { name: /Nom affiché/ });
  await expect(displayName).toBeFocused();
  await expect(displayName).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#field-displayName-error')).toHaveText('Ce champ est obligatoire.');
  await expect(page.locator('#field-birthDate-error')).toHaveText(
    'La date ne peut pas être dans le futur.',
  );
  expect(posts).toBe(0);
  await expectNoAxeViolations(page);

  // 422 du serveur (plus de 120 ans) : message de l'API sous le champ et dans le résumé en tête,
  // qui prend le focus ; son lien mène au champ (UX-A7).
  await displayName.fill('Marie D.');
  await page.getByLabel('Date de naissance').fill('1890-01-01');
  const rejected = page.waitForResponse(
    (r) => r.url().endsWith('/api/patients') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: /Enregistrer/ }).click();
  expect((await rejected).status()).toBe(422);
  await expect(page.locator('#field-birthDate-error')).toContainText('moins de 120 ans');
  const summary = page.locator('pm-form-errors [role="alert"]');
  await expect(summary).toBeFocused();
  await summary.getByRole('link', { name: 'Date de naissance' }).click();
  await expect(page.getByLabel('Date de naissance')).toBeFocused();

  // Création : seul le nom (et le rythme) ; Ctrl+Entrée enregistre → vue d'ensemble.
  await page.getByLabel('Date de naissance').fill('');
  await page.getByLabel('Rythme habituel').selectOption({ label: 'Hebdomadaire' });
  await expect(page.getByRole('region', { name: "Aperçu de l'en-tête" })).toContainText('Marie D.');
  const created = page.waitForResponse(
    (r) => r.url().endsWith('/api/patients') && r.request().method() === 'POST',
  );
  await displayName.press('Control+Enter');
  expect((await created).status()).toBe(201);
  // /patients/:id/overview renvoie sur l'onglet 1 du dossier, /patients/:id (M1-07).
  await expect(page).toHaveURL(/\/fr\/patients\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Marie D.' })).toBeVisible();

  // Retrouver le patient dans la liste (logo, B2) : / focalise le filtre, accents ignorés.
  await page.getByRole('link', { name: 'PsyMate' }).click();
  await expect(patientLink(page, 'Marie D.')).toBeVisible();
  await page.keyboard.press('/');
  const filter = page.getByRole('searchbox', { name: 'Filtrer les patients par nom' });
  await expect(filter).toBeFocused();
  await filter.fill('marie');
  await expect(patientLink(page, 'Marie D.')).toBeVisible();
  await expect(patientLink(page, 'Omar B.')).toBeHidden();
  await filter.fill('marié');
  await expect(patientLink(page, 'Marie D.')).toBeVisible();
  await expect(patientLink(page, 'Omar B.')).toBeHidden();
  await expect(page.getByRole('table').locator('mark')).toHaveText('Marie');
  await expectNoAxeViolations(page);

  // Ouvrir sa fiche, modifier le rythme → « 2 versions », différence dans l'historique.
  // La fiche s'ouvre depuis le menu « … » de la ligne (maquette 01) ; la ligne mène au dossier.
  await page.getByRole('button', { name: "Plus d'actions pour Marie D." }).click();
  await page.getByRole('menuitem', { name: 'Modifier la fiche de Marie D.' }).click();
  await expect(page).toHaveURL(/\/fiche$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Modifier la fiche · Marie D.');
  await expect(page.locator('.page-header .meta')).toContainText('1 version');
  await expect(page.getByLabel('Rythme habituel')).toHaveValue('weekly');
  await page.getByLabel('Rythme habituel').selectOption({ label: 'Mensuel' });
  const patched = page.waitForResponse((r) => r.request().method() === 'PATCH');
  await page.getByRole('button', { name: /Enregistrer/ }).click();
  expect((await patched).request().postDataJSON()).toEqual({ followUp: { rhythm: 'monthly' } });
  await expect(page.locator('.page-header .meta')).toContainText('2 versions');
  const history = page.getByRole('region', { name: 'Historique des versions' });
  await expect(history.getByRole('heading', { name: /Version 2/ })).toBeVisible();
  await expect(history).toContainText('Rythme habituel');
  await expect(history).toContainText('Mensuel');

  // Une seconde modification : la version 3 ne liste que la différence, avant → après.
  await page.getByLabel('Rythme habituel').selectOption({ label: 'Irrégulier' });
  await page.getByRole('button', { name: /Enregistrer/ }).click();
  await expect(page.locator('.page-header .meta')).toContainText('3 versions');
  const v3 = history.getByRole('listitem').filter({ hasText: 'Version 3' });
  await expect(v3.locator('dt')).toHaveText(['Rythme habituel']);
  await expect(v3.locator('del')).toHaveText('Mensuel');
  await expect(v3.locator('ins')).toHaveText('Irrégulier');
  await expectNoAxeViolations(page);

  // Archiver avec le nom retapé → liste sans le patient, toast « Restaurer ».
  await page.getByRole('button', { name: 'Archiver…' }).click();
  const dialog = page.getByRole('dialog');
  const confirm = dialog.getByRole('button', { name: 'Archiver ce patient' });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel('Tapez « Marie D. » pour confirmer').fill('Marie D.');
  await expectNoAxeViolations(page);
  await confirm.click();
  await expect(page).toHaveURL(/\/fr\/patients$/);
  await expect(page.getByText('Marie D. archivé·e')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Filtrer les patients par nom' }).fill('');
  await expect(patientLink(page, 'Omar B.')).toBeVisible();
  await expect(patientLink(page, 'Marie D.')).toBeHidden();

  // Restaurer depuis le toast : le patient revient dans la liste.
  await page.getByRole('button', { name: 'Restaurer' }).click();
  await expect(page.getByText('Marie D. restauré·e')).toBeVisible();
  await expect(patientLink(page, 'Marie D.')).toBeVisible();
  await expectNoAxeViolations(page);
});

test('afficher les archivés, ouvrir la fiche archivée et la restaurer', async ({
  page,
  request,
}) => {
  const account = await createAccount(request, 'm1-06.archives', 'psychologist');
  const id = await createPatient(request, 'Léa M.');
  const archived = await request.delete(`${API}/api/patients/${id}`);
  expect(archived.status()).toBe(204);
  await signIn(page, account);

  await expect(
    page.getByRole('status').filter({ hasText: 'Créez votre premier patient' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Afficher les archivés' }).click();
  await expect(patientLink(page, 'Léa M.')).toBeVisible();
  await page.getByRole('button', { name: "Plus d'actions pour Léa M." }).click();
  await page.getByRole('menuitem', { name: 'Modifier la fiche de Léa M.' }).click();
  await expect(page.getByText('Ce dossier est archivé')).toBeVisible();
  await expect(page.getByRole('textbox', { name: /Nom affiché/ })).toBeDisabled();
  await expectNoAxeViolations(page);
  await page.getByRole('button', { name: 'Restaurer', exact: true }).click();
  await expect(page.getByRole('textbox', { name: /Nom affiché/ })).toBeEnabled();
  await expect(page.getByText('Ce dossier est archivé')).toBeHidden();
});

test('un coach voit « Mes clients » et « Nouveau client »', async ({ page, request }) => {
  const account = await createAccount(request, 'm1-06.coach', 'coach');
  await signIn(page, account);
  await expect(page.getByRole('heading', { level: 1, name: 'Mes clients' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Nouveau client/ })).toBeVisible();
  await expect(
    page.getByRole('status').filter({ hasText: 'Créez votre premier client' }),
  ).toBeVisible();
  await expectNoAxeViolations(page);
  await page.getByRole('link', { name: /Nouveau client/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Nouveau client' })).toBeVisible();
});

test('clavier seul : / puis le nom, Entrée ouvre le dossier', async ({ page, request }) => {
  const account = await createAccount(request, 'm1-06.clavier', 'psychologist');
  const id = await createPatient(request, 'Éloïse R.');
  await createPatient(request, 'Paul T.');
  await signIn(page, account);
  await expect(patientLink(page, 'Paul T.')).toBeVisible();
  await page.keyboard.press('/');
  await page.keyboard.type('eloise');
  await expect(patientLink(page, 'Paul T.')).toBeHidden();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/fr/patients/${id}$`));
});
