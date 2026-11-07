import { expect, test } from '@playwright/test';

import { ADMIN_AVAILABLE, ADMIN_MISSING } from '../support/admin';
import { expectNoAxeViolations } from '../support/axe';
import {
  approvedAccount,
  expectSaved,
  heavyJpegWithExif,
  jpegSize,
  openProfile,
  pendingAccount,
  signIn,
  tabTo,
  uploadedPhoto,
  watchPhotoUpload,
} from './helpers';

// Flux 8 / fiche 10 (M5-04) : « Mon profil public ». Contre l'API locale, jamais de mock. Les
// scénarios de publication exigent un compte approuvé, donc un administrateur local (variables
// PSYMATE_E2E_ADMIN_*, voir e2e/support/admin.ts) ; sans lui ils sont ignorés et le disent.

const API = 'http://localhost:8080';

test.describe('profil public, dossier non approuvé', () => {
  test('enregistrement automatique, aperçu, liste fermée, interrupteur inactif avec motif ; axe', async ({
    page,
    request,
  }) => {
    const account = await pendingAccount(request, 'm5-04.attente');
    await signIn(page, account);
    await openProfile(page);

    // Interrupteur « Publié » inactif, avec son explication (dossier non approuvé).
    const published = page.getByRole('switch', { name: 'Publié' });
    await expect(published).toBeDisabled();
    await expect(page.getByText('Dossier en cours de vérification.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Voir mon dossier professionnel' })).toBeVisible();

    // Modifier le nom : PUT après 800 ms d'inactivité, « Enregistré », aperçu mis à jour.
    const preview = page.getByTestId('preview');
    const saved = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/me/profile') && response.request().method() === 'PUT',
    );
    await page.getByLabel('Nom affiché').fill('Alix Essai-Profil');
    await expect(preview.getByText('Alix Essai-Profil')).toBeVisible();
    expect((await saved).status()).toBe(200);
    await expectSaved(page);

    // Spécialité hors liste : aucune saisie libre possible, rien n'est ajouté.
    const specialties = page.getByRole('combobox', { name: 'Spécialités' });
    await specialties.fill('Astrologie');
    await expect(page.getByText('Pas dans la liste')).toBeVisible();
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await specialties.press('Enter');
    await expect(page.getByRole('button', { name: /^Retirer/ })).toHaveCount(0);

    // Une spécialité de la liste : filtre, Entrée, puce avec « Retirer Anxiété ».
    await specialties.fill('anxi');
    await expect(page.getByRole('option', { name: 'Anxiété' })).toBeVisible();
    await specialties.press('Enter');
    await expect(page.getByRole('button', { name: 'Retirer Anxiété' })).toBeVisible();
    await expect(specialties).toHaveValue('');
    await expect(preview.getByText('Anxiété')).toBeVisible();
    await expectSaved(page);

    const profile = await page.request.get(`${API}/api/me/profile`);
    const body = (await profile.json()) as { displayName: string; specialties: string[] };
    expect(body.displayName).toBe('Alix Essai-Profil');
    expect(body.specialties).toEqual(['anxiety']);

    // Envoyée quand même par l'API : 422 (le serveur reste juge).
    const forced = await page.request.put(`${API}/api/me/profile`, {
      data: { displayName: 'Alix Essai-Profil', specialties: ['astrologie'] },
    });
    expect(forced.status()).toBe(422);

    // Publication tentée par l'API : 409 avec verification en tête.
    const publish = await page.request.post(`${API}/api/me/profile/publish`);
    expect(publish.status()).toBe(409);
    expect(((await publish.json()) as { missing: string[] }).missing[0]).toBe('verification');

    await expectNoAxeViolations(page);
  });

  test('parcours au clavier : puces, interrupteur « Afficher », rafraîchir l’aperçu ; axe', async ({
    page,
    request,
  }) => {
    const account = await pendingAccount(request, 'm5-04.clavier');
    await signIn(page, account);
    await openProfile(page);
    await page.getByLabel('Nom affiché').focus();

    // Spécialités : Tab jusqu'au champ, flèche bas puis Entrée ajoute la première option.
    const specialties = page.getByRole('combobox', { name: 'Spécialités' });
    await tabTo(page, specialties);
    await page.keyboard.press('ArrowDown');
    await expect(specialties).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Enter');
    const remove = page.getByRole('button', { name: /^Retirer / });
    await expect(remove).toHaveCount(1);
    await expect(specialties).toBeFocused();
    // Retour arrière sur champ vide : la dernière puce part.
    await page.keyboard.press('Backspace');
    await expect(remove).toHaveCount(0);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(remove).toHaveCount(1);

    // Interrupteur « Afficher l'e-mail » : Tab puis Espace.
    await page.getByLabel('E-mail public').fill('clavier@example.test');
    const showEmail = page.getByRole('switch', { name: "Afficher l'e-mail" });
    await tabTo(page, showEmail);
    await page.keyboard.press('Space');
    await expect(showEmail).toBeChecked();
    await expect(page.getByTestId('preview')).toContainText('clavier@example.test');
    await expectSaved(page);

    // « Rafraîchir l'aperçu » (lecteurs d'écran) : le focus passe sur la carte à jour.
    const refresh = page.getByRole('button', { name: "Rafraîchir l'aperçu" });
    await tabTo(page, refresh);
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('preview')).toBeFocused();
    await expectNoAxeViolations(page);
  });

  test('photo de 8 Mo avec EXIF : recadrée en carré 512 px, envoyée sans métadonnées', async ({
    page,
    request,
  }) => {
    const account = await pendingAccount(request, 'm5-04.photo');
    await watchPhotoUpload(page);
    await signIn(page, account);
    await openProfile(page);
    await expect(page.getByText('Photo absente : les initiales sont affichées')).toBeVisible();

    const original = await heavyJpegWithExif(page);
    expect(original.length).toBeGreaterThan(8 * 1024 * 1024);
    expect(original.includes(Buffer.from('Exif'))).toBe(true);

    await page.getByTestId('photo-file').setInputFiles({
      name: 'portrait.jpg',
      mimeType: 'image/jpeg',
      buffer: original,
    });
    await expect(page.getByText('Recadrer la photo')).toBeVisible();
    await page.getByLabel('Zoom').fill('1.5');

    const answered = page.waitForResponse((res) => res.url().endsWith('/api/me/profile/photo'));
    await page.getByRole('button', { name: 'Enregistrer la photo' }).click();
    expect((await answered).status()).toBe(200);
    const photo = await uploadedPhoto(page);

    expect(jpegSize(photo)).toEqual({ width: 512, height: 512 });
    expect(photo.includes(Buffer.from('Exif'))).toBe(false);
    expect(photo.length).toBeLessThan(1024 * 1024);

    await expect(page.getByText('Photo ajoutée')).toBeVisible();
    await expect(page.getByTestId('preview').locator('img')).toBeVisible();
    const profile = await page.request.get(`${API}/api/me/profile`);
    expect(((await profile.json()) as { photoAssetKey: string | null }).photoAssetKey).toBeTruthy();
    await expectNoAxeViolations(page);
  });
});

test.describe('profil public, dossier approuvé', () => {
  test.skip(!ADMIN_AVAILABLE, ADMIN_MISSING);

  test('publication refusée sans contact affiché (409 missing contact)', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const account = await approvedAccount(request, 'm5-04.refus');
    await signIn(page, account);
    await openProfile(page);

    await page.getByLabel('Ville', { exact: true }).fill('Lyon');
    // Téléphone renseigné mais pas affiché : aucun moyen de contact visible.
    await page.getByLabel('Téléphone', { exact: true }).fill('04 72 00 00 00');
    await expect(page.getByRole('switch', { name: 'Afficher le téléphone' })).not.toBeChecked();

    const published = page.getByRole('switch', { name: 'Publié' });
    await expect(published).toBeEnabled();
    const refused = page.waitForResponse((res) => res.url().endsWith('/api/me/profile/publish'));
    await published.click();
    const response = await refused;
    expect(response.status()).toBe(409);
    expect(((await response.json()) as { missing: string[] }).missing).toEqual(['contact']);

    const alert = page.getByTestId('publish-refused');
    await expect(alert).toContainText('Publication refusée');
    await expect(alert).toContainText('Affichez au moins un moyen de contact');
    await expect(published).not.toBeChecked();

    // La ligne amène sur le champ à corriger.
    await alert.getByRole('button').click();
    await expect(page.getByLabel('Téléphone', { exact: true })).toBeFocused();
    await expectNoAxeViolations(page);
  });

  test('compléter, publier, fiche publique 200, retirer → 404', async ({ page, request }) => {
    test.setTimeout(120_000);
    const account = await approvedAccount(request, 'm5-04.publie');
    await signIn(page, account);
    await openProfile(page);

    await page.getByLabel('Titre affiché').fill('Psychologue clinicienne');
    await page.getByRole('button', { name: 'Accepte de nouveaux patients' }).click();
    await page
      .getByRole('textbox', { name: 'Présentation' })
      .fill('Accompagnement des adultes, approche TCC.');
    await page.getByRole('combobox', { name: 'Spécialités' }).fill('burn');
    await page.getByRole('combobox', { name: 'Spécialités' }).press('Enter');
    await page.getByRole('checkbox', { name: 'En visio' }).check();
    await page.getByLabel('E-mail public').fill('cabinet.essai@example.test');
    await page.getByRole('switch', { name: "Afficher l'e-mail" }).check();
    await page.getByLabel('Ville', { exact: true }).fill('Lyon');
    // Tarif laissé vide : absent de l'aperçu et de la fiche publique.

    const preview = page.getByTestId('preview');
    await expect(preview).toContainText('cabinet.essai@example.test');
    await expect(preview).toContainText('Lyon · En visio');
    await expect(preview).not.toContainText('Tarif');
    await expect(page.getByText('Au moins un moyen de contact affiché')).toBeVisible();
    await expectSaved(page);

    // Publier au clavier : le focus reste sur l'interrupteur pendant et après l'appel.
    const published = page.getByRole('switch', { name: 'Publié' });
    await published.focus();
    await page.keyboard.press('Space');
    await expect(published).toBeChecked();
    await expect(published).toBeFocused();
    await expect(page.getByText("Votre fiche est publiée dans l'annuaire.")).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'Mon compte' }).getByText('publié'),
    ).toBeVisible();
    const openLink = page.getByRole('link', { name: 'Ouvrir la fiche publique' });
    await expect(openLink).toHaveAttribute('href', /\/praticiens\/[a-z0-9-]+$/);

    const slug = (
      (await (await page.request.get(`${API}/api/me/profile`)).json()) as {
        slug: string;
      }
    ).slug;
    const card = await request.get(`${API}/api/public/directory/practitioners/${slug}`);
    expect(card.status()).toBe(200);
    const fiche = (await card.json()) as {
      displayName: string;
      email: string | null;
      phone: string | null;
      fees: string | null;
      specialties: string[];
    };
    expect(fiche.email).toBe('cabinet.essai@example.test');
    expect(fiche.phone).toBeNull();
    expect(fiche.fees).toBeNull();
    expect(fiche.specialties).toEqual(['burnout']);
    await expectNoAxeViolations(page);

    // Retirer : confirmation inline, puis la fiche répond 404 tout de suite.
    await page.keyboard.press('Space');
    await expect(page.getByText('Elle disparaît immédiatement')).toBeVisible();
    const confirm = page.getByRole('button', { name: 'Retirer la fiche' });
    await expect(confirm).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(published).not.toBeChecked();
    await expect(published).toBeFocused();
    await expect(page.getByText("Votre fiche est retirée de l'annuaire.")).toBeVisible();
    const gone = await request.get(`${API}/api/public/directory/practitioners/${slug}`);
    expect(gone.status()).toBe(404);
  });
});
