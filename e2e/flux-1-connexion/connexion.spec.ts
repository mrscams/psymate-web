import AxeBuilder from '@axe-core/playwright';
import { expect, Page, test } from '@playwright/test';

import { confirmEmail, enableTwoFactor, register, SEED, uniqueEmail } from '../support/accounts';
import { totp, totpStep } from '../support/totp';

// B3 flux 1, partie connexion (M0-07) : contre l'API locale et le seed small, jamais de mock.

const WRONG_CREDENTIALS = 'E-mail, mot de passe ou code incorrect.';

async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
}

async function fillCredentials(page: Page, email: string, password: string): Promise<void> {
  await page.getByLabel('Adresse e-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(password);
}

test('sans session, /patients mène à /connexion?next=/patients', async ({ page }) => {
  await page.goto('/fr/patients');

  await expect(page).toHaveURL(/\/fr\/connexion\?next=%2Fpatients$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Connexion' })).toBeVisible();
  await expect(page.getByLabel('Code de vérification')).toHaveCount(0);
  await expectNoAxeViolations(page);
});

test('connexion avec un compte du seed → /patients, puis déconnexion', async ({ page }) => {
  await page.goto('/fr/patients');
  await expect(page).toHaveURL(/\/fr\/connexion\?next=/);

  await fillCredentials(page, SEED.claire.email, SEED.claire.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();

  await expect(page).toHaveURL(/\/fr\/patients$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Mes patients' })).toBeVisible();
  await expectNoAxeViolations(page);

  // La session survit au rechargement (cookie HttpOnly lu par GET /api/auth/me au démarrage).
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Mes patients' })).toBeVisible();

  // /connexion avec une session ouverte renvoie vers l'accueil.
  await page.goto('/fr/connexion');
  await expect(page).toHaveURL(/\/fr\/patients$/);

  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page).toHaveURL(/\/fr\/connexion$/);
  await page.goto('/fr/patients');
  await expect(page).toHaveURL(/\/fr\/connexion\?next=%2Fpatients$/);
});

test('identifiants faux : le même message unique, e-mail connu ou non', async ({
  page,
  request,
}) => {
  // Compte jetable : un mot de passe faux sur un compte du seed compterait dans son verrou.
  const account = await register(request, 'm0-07.faux');

  await page.goto('/fr/connexion');
  await fillCredentials(page, account.email, 'Pas-le-bon-mot-de-passe-1');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toHaveText(WRONG_CREDENTIALS);
  await expect(page).toHaveURL(/\/fr\/connexion$/);
  await expect(page.getByLabel('Adresse e-mail')).toHaveValue(account.email);
  await expect(page.getByLabel('Mot de passe')).toBeFocused();
  await expectNoAxeViolations(page);

  await page.getByLabel('Adresse e-mail').fill(uniqueEmail('m0-07.inconnu'));
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(alert).toHaveText(WRONG_CREDENTIALS);
});

test('compte avec 2FA : bloc code sur 202, puis connexion avec le code', async ({
  page,
  request,
}) => {
  // Compte jetable confirmé (docs_pending) dont la 2FA est activée par l'API, code calculé ici.
  const account = await register(request, 'm0-07.otp');
  await confirmEmail(request, account.email);
  const { secret, usedStep } = await enableTwoFactor(request, (s) => {
    const step = totpStep();
    return { value: totp(s, step), step };
  });

  await page.goto('/fr/connexion');
  await fillCredentials(page, account.email, account.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();

  const code = page.getByLabel('Code de vérification');
  await expect(code).toBeVisible();
  await expect(code).toHaveAttribute('autocomplete', 'one-time-code');
  await expect(code).toHaveAttribute('inputmode', 'numeric');
  await expect(code).toBeFocused();
  await expect(page).toHaveURL(/\/fr\/connexion$/);
  await expectNoAxeViolations(page);

  // Le pas consommé par la vérification ne peut pas resservir : le suivant (tolérance de dérive
  // de l'API) est accepté tout de suite.
  await code.fill(totp(secret, Math.max(usedStep + 1, totpStep())));
  await page.getByRole('button', { name: 'Se connecter' }).click();

  await expect(page).toHaveURL(/\/fr\/patients$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Mes patients' })).toBeVisible();
});
