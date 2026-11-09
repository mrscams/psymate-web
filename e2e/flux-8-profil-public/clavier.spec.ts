import { APIRequestContext, expect, Page, test } from '@playwright/test';

import { ADMIN_AVAILABLE, ADMIN_MISSING } from '../support/admin';
import { expectNoAxeViolations } from '../support/axe';
import { keyboardOnly, tabTo } from '../support/clavier';
import { approvedAccount, expectSaved, pendingAccount, signIn } from './helpers';

// B3 flux 8 au clavier seul (M7-04, B7, fiche 10) : Mon compte depuis le menu de l'avatar, « Profil
// public » dans la navigation, le profil rempli champ par champ, l'aperçu rafraîchi ; la
// publication refusée tant que le dossier n'est pas approuvé (motif et lien atteignables au
// clavier) ; avec un dossier approuvé (administrateur e2e), publier puis retirer à l'Espace.
// Aucun geste de pointeur après la connexion (keyboardOnly). Contre l'API réelle, jamais de mock.

const API = 'http://localhost:8080';

/** Avatar (Tab, Entrée) → « Mon compte » (Entrée) → « Profil public » (Tab, Entrée). */
async function openProfileByKeyboard(page: Page): Promise<void> {
  await tabTo(page, page.getByRole('button', { name: /menu du compte/ }), { max: 40 });
  await page.keyboard.press('Enter');
  const account = page.getByRole('menuitem', { name: 'Mon compte' });
  await expect(account).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/fr\/mon-compte\//);
  const nav = page.getByRole('navigation', { name: 'Mon compte' });
  await tabTo(page, nav.getByRole('link', { name: /Profil public/ }), { max: 40 });
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/fr\/mon-compte\/profil-public$/);
  await expect(page.getByRole('heading', { name: 'Profil public', level: 1 })).toBeVisible();
  await expect(page.getByLabel('Nom affiché')).toBeVisible();
}

/** Remplit le profil au clavier : chaque champ atteint par Tab. */
async function fillProfileByKeyboard(page: Page, email: string): Promise<void> {
  await tabTo(page, page.getByLabel('Titre affiché'), { max: 40 });
  await page.keyboard.type('Psychologue clinicienne');
  await tabTo(page, page.getByRole('textbox', { name: 'Présentation' }), { max: 40 });
  await page.keyboard.type('Accompagnement des adultes, approche TCC.');
  const specialties = page.getByRole('combobox', { name: 'Spécialités' });
  await tabTo(page, specialties, { max: 40 });
  await page.keyboard.type('burn');
  await expect(page.getByRole('option', { name: /Burn-out/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: /^Retirer Burn-out/ })).toBeVisible();
  const remote = page.getByRole('checkbox', { name: 'En visio' });
  await tabTo(page, remote, { max: 40 });
  await page.keyboard.press('Space');
  await expect(remote).toBeChecked();
  await tabTo(page, page.getByLabel('E-mail public'), { max: 40 });
  await page.keyboard.type(email);
  const showEmail = page.getByRole('switch', { name: "Afficher l'e-mail" });
  await tabTo(page, showEmail, { max: 10 });
  await page.keyboard.press('Space');
  await expect(showEmail).toBeChecked();
  await tabTo(page, page.getByLabel('Ville', { exact: true }), { max: 40 });
  await page.keyboard.type('Lyon');
  await expectSaved(page);
}

test('flux 8 au clavier, dossier non approuvé : profil rempli, aperçu, publication refusée avec motif', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const account = await pendingAccount(request, 'm7-04.flux8');
  await signIn(page, account);
  const keys = await keyboardOnly(page);
  await page.reload();

  await openProfileByKeyboard(page);
  await fillProfileByKeyboard(page, 'cabinet.clavier@example.test');

  // « Rafraîchir l'aperçu » : le focus passe sur la carte, qui montre ce que verront les visiteurs.
  await tabTo(page, page.getByRole('button', { name: "Rafraîchir l'aperçu" }), { max: 80 });
  await page.keyboard.press('Enter');
  const preview = page.getByTestId('preview');
  await expect(preview).toBeFocused();
  await expect(preview).toContainText('cabinet.clavier@example.test');
  await expect(preview).toContainText('Lyon · En visio');

  // « Publié » inactif : le motif est lisible et son lien atteignable au clavier.
  await expect(page.getByRole('switch', { name: 'Publié' })).toBeDisabled();
  await expect(page.getByText('Dossier en cours de vérification.')).toBeVisible();
  const dossier = page.getByRole('link', { name: 'Voir mon dossier professionnel' });
  await tabTo(page, dossier, { max: 80, backwards: true });
  await expectNoAxeViolations(page);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/fr\/mon-compte\/dossier-professionnel$/);

  // Côté API : le profil est enregistré, et la publication reste refusée (dossier en tête).
  const profile = (await (await page.request.get(`${API}/api/me/profile`)).json()) as {
    specialties: string[];
    contactEmail: string | null;
    showEmail: boolean;
  };
  expect(profile.specialties).toEqual(['burnout']);
  expect(profile.contactEmail).toBe('cabinet.clavier@example.test');
  expect(profile.showEmail).toBe(true);
  keys.expectNoPointer();
});

test.describe('flux 8 au clavier, dossier approuvé', () => {
  test.skip(!ADMIN_AVAILABLE, ADMIN_MISSING);

  test('profil rempli, publié à l’Espace, fiche publique 200, retiré → 404', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    const account = await approvedAccount(request, 'm7-04.flux8-publie');
    await signIn(page, account);
    const keys = await keyboardOnly(page);
    await page.reload();
    await openProfileByKeyboard(page);
    await fillProfileByKeyboard(page, 'cabinet.publie@example.test');

    const published = page.getByRole('switch', { name: 'Publié' });
    await tabTo(page, published, { max: 80, backwards: true });
    await page.keyboard.press('Space');
    await expect(published).toBeChecked();
    await expect(published).toBeFocused();
    await expect(page.getByText("Votre fiche est publiée dans l'annuaire.")).toBeVisible();
    await expectNoAxeViolations(page);
    const slug = await profileSlug(page);
    expect((await request.get(`${API}/api/public/directory/practitioners/${slug}`)).status()).toBe(
      200,
    );

    // Retirer à tout moment : Espace de nouveau ; la fiche disparaît, les données restent.
    await page.keyboard.press('Space');
    await expect(published).not.toBeChecked();
    await expect
      .poll(async () =>
        (await request.get(`${API}/api/public/directory/practitioners/${slug}`)).status(),
      )
      .toBe(404);
    expect(await profileField(page.request, 'contactEmail')).toBe('cabinet.publie@example.test');
    keys.expectNoPointer();
  });
});

async function profileSlug(page: Page): Promise<string> {
  return (await profileField(page.request, 'slug')) as string;
}

async function profileField(api: APIRequestContext, field: string): Promise<unknown> {
  const body = (await (await api.get(`${API}/api/me/profile`)).json()) as Record<string, unknown>;
  return body[field];
}
