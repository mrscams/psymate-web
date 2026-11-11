import { APIRequestContext, expect, Page } from '@playwright/test';

import { confirmEmail, register, TestAccount } from '../support/accounts';
import { totp, totpStep } from '../support/totp';

export const API = 'http://localhost:8080';
export const MAILPIT = 'http://localhost:8025';
export const SECURITY = '/fr/mon-compte/securite';

/** Message unique d'un code refusé (fiche 18). */
export const INVALID_CODE = "Ce code n'est pas valide ou a déjà été utilisé.";

/** Compte jetable confirmé (docs_pending : il entre normalement), session ouverte dans `api`. */
export async function createAccount(api: APIRequestContext, prefix: string): Promise<TestAccount> {
  const account = await register(api, prefix);
  await confirmEmail(api, account.email);
  return account;
}

/**
 * Active la 2FA par l'API sur la session de `api` et garde les 10 codes de secours : renvoie le
 * secret, le pas TOTP consommé par la vérification et les codes.
 */
export async function enableTwoFactorWithCodes(
  api: APIRequestContext,
): Promise<{ secret: string; usedStep: number; recoveryCodes: string[] }> {
  const enable = await api.post(`${API}/api/me/2fa/enable`);
  expect(enable.status(), await enable.text()).toBe(200);
  const { secret } = (await enable.json()) as { secret: string };
  const step = totpStep();
  const verify = await api.post(`${API}/api/me/2fa/verify`, { data: { code: totp(secret, step) } });
  expect(verify.status(), await verify.text()).toBe(200);
  const { recoveryCodes } = (await verify.json()) as { recoveryCodes: string[] };
  return { secret, usedStep: step, recoveryCodes };
}

/** Un pas TOTP jamais consommé : le suivant du dernier utilisé, ou l'actuel s'il est plus récent. */
export function freshStep(lastUsed: number): number {
  return Math.max(lastUsed + 1, totpStep());
}

/** Connexion par l'écran (fiche 11), avec le code si le compte a la 2FA ; attend /patients. */
export async function signIn(page: Page, account: TestAccount, code?: () => string): Promise<void> {
  await page.goto('/fr/connexion');
  await page.getByLabel('E-mail professionnel').fill(account.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  if (code) {
    const otp = page.getByLabel('Code de vérification');
    await expect(otp).toBeVisible();
    await otp.fill(code());
    await page.getByRole('button', { name: 'Se connecter' }).click();
  }
  await expect(page).toHaveURL(/\/fr\/patients$/);
}

/** Ouvre /mon-compte/securite et attend la liste des sessions (donnée du serveur). */
export async function openSecurity(page: Page): Promise<void> {
  await page.goto(SECURITY);
  await expect(page.getByRole('heading', { level: 1, name: 'Compte et sécurité' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Sessions actives' })).toBeVisible();
}

/** POST /api/auth/login hors navigateur, pour vérifier qu'un code est accepté ou refusé. */
export async function apiLoginStatus(
  api: APIRequestContext,
  account: TestAccount,
  otp: string,
): Promise<number> {
  const response = await api.post(`${API}/api/auth/login`, {
    data: { email: account.email, password: account.password, otp, rememberMe: false },
  });
  return response.status();
}

/** Déconnexion par le menu de l'avatar (M0-09). */
export async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: /menu du compte/ }).click();
  await page.getByRole('menuitem', { name: 'Déconnexion' }).click();
  await expect(page).toHaveURL(/\/fr\/connexion$/);
}
