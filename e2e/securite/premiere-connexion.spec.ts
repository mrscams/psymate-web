import { expect, test } from '@playwright/test';

import { expectNoAxeViolations } from '../support/axe';
import { totp, totpStep } from '../support/totp';
import { createAdmin } from './admin';
import { INVALID_CODE } from './helpers';

/** Accueil de l'administration : la file de validation, dossier ouvert ou non (M7-07). */
const ADMIN_HOME = /\/fr\/admin\/validation(\/[0-9a-f-]{36})?$/;

// Fiche 18 C (M1-17, G Q5) : l'administrateur créé par `make admin` arrive sur /premiere-connexion,
// remplace son mot de passe à usage unique, active la 2FA, confirme ses codes de secours, puis entre
// sur /admin ; avant, /admin le renvoie vers l'étape manquante. Contre l'API locale, jamais de mock.

const NEW_PASSWORD = 'Vendome-Lyon-Securite-2026!';

test.describe.configure({ mode: 'serial' });

test('première connexion de l’administrateur : mot de passe, puis 2FA obligatoire, puis /admin', async ({
  page,
}) => {
  test.setTimeout(420_000);
  // `make admin` lance Maven : c'est la partie longue du test.
  const admin = createAdmin('m1-17.admin');

  // Login avec le mot de passe à usage unique : 403 PASSWORD_CHANGE_REQUIRED → /premiere-connexion.
  await page.goto('/fr/connexion');
  await page.getByLabel('Adresse e-mail').fill(admin.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(admin.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/fr\/premiere-connexion$/);
  await expect(
    page.getByRole('heading', { level: 2, name: 'Choisissez votre mot de passe' }),
  ).toBeVisible();
  await expect(
    page.getByRole('list', { name: 'Progression' }).locator('[aria-current="step"]'),
  ).toHaveText(/Choisissez votre mot de passe/);
  await expectNoAxeViolations(page);

  // Sans session, /admin renvoie vers la connexion.
  await page.goto('/fr/admin');
  await expect(page).toHaveURL(/\/fr\/connexion\?next=%2Fadmin$/);
  await page.goto('/fr/premiere-connexion');

  // Étape 1 au clavier : e-mail (saisissable, aucune session), mot de passe temporaire, nouveau, confirmation.
  const email = page.getByLabel('E-mail du compte');
  await email.fill(admin.email);
  await email.press('Tab');
  await expect(page.getByLabel('Mot de passe temporaire')).toBeFocused();
  await page.keyboard.type(admin.password);
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Nouveau mot de passe', { exact: true })).toBeFocused();
  await page.keyboard.type(NEW_PASSWORD);
  await expect(page.locator('pm-password-rules li[data-state="ok"]')).toHaveCount(2);
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Confirmer le nouveau mot de passe')).toBeFocused();
  await page.keyboard.type(NEW_PASSWORD);
  await page.keyboard.press('Enter');

  // 204 → reconnexion automatique → étape 2 (admin sans 2FA), sans quitter la page.
  await expect(
    page.getByRole('heading', { level: 2, name: 'Activez la double authentification' }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/fr\/premiere-connexion$/);
  await expect(page.getByText(admin.email)).toBeVisible();
  const qr = page.getByRole('img', { name: /QR code/ });
  await expect(qr).toBeVisible();
  await expectNoAxeViolations(page);

  // Avant la 2FA, /admin renvoie à l'étape 2.
  await page.goto('/fr/admin');
  await expect(page).toHaveURL(/\/fr\/premiere-connexion$/);
  await expect(
    page.getByRole('heading', { level: 2, name: 'Activez la double authentification' }),
  ).toBeVisible();

  const secret = ((await page.locator('.secret code').textContent()) ?? '').replace(/\s+/g, '');
  expect(secret).toMatch(/^[A-Z2-7]{16,}$/);
  await page.getByRole('button', { name: 'Continuer' }).click();
  const code = page.getByLabel('Code de vérification');
  await expect(code).toBeFocused();
  await code.fill('000000');
  await page.getByRole('button', { name: 'Vérifier' }).click();
  await expect(page.getByRole('alert')).toHaveText(INVALID_CODE);
  await code.fill(totp(secret, totpStep()));
  await page.getByRole('button', { name: 'Vérifier' }).click();

  const codes = page.getByRole('list', { name: 'Codes de secours' }).getByRole('listitem');
  await expect(codes).toHaveCount(10);
  const open = page.getByRole('button', { name: "Ouvrir l'administration" });
  await expect(open).toBeDisabled();
  await expectNoAxeViolations(page);
  await page.getByRole('checkbox', { name: 'Je les ai enregistrés' }).check();
  await expect(open).toBeEnabled();
  await open.click();

  // /admin mène à la file de validation (M7-07), sur le plus ancien dossier s'il y en a un.
  await expect(page).toHaveURL(ADMIN_HOME);
  await expect(page.getByRole('heading', { level: 1, name: /^À vérifier/ })).toBeVisible();
  await expectNoAxeViolations(page);

  // /premiere-connexion n'a plus de raison d'être : retour à /admin.
  await page.goto('/fr/premiere-connexion');
  await expect(page).toHaveURL(ADMIN_HOME);

  // Un administrateur ne voit pas « Désactiver » (409 TWO_FACTOR_REQUIRED_FOR_ADMIN côté serveur).
  await page.goto('/fr/mon-compte/securite');
  await expect(page.getByText('Activée', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Désactiver' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Régénérer les codes' })).toBeVisible();
});
