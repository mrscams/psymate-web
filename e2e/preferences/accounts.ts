import { APIRequestContext, expect, Page } from '@playwright/test';

import { confirmEmail, TestAccount, uniqueEmail } from '../support/accounts';

const API = 'http://localhost:8080';

export type Profession = 'psychologist' | 'psychiatrist' | 'coach';

/**
 * Compte jetable confirmé (docs_pending : il entre normalement, fiche 00) pour la profession
 * demandée : le seed small n'a ni coach ni compte dont on puisse changer les préférences sans gêner
 * les autres tests. `register()` de e2e/support fixe la profession à psychologue, d'où cette
 * variante locale.
 */
export async function createAccount(
  api: APIRequestContext,
  prefix: string,
  profession: Profession,
): Promise<TestAccount> {
  const account = { email: uniqueEmail(prefix), password: 'Fil-Rouge-Clinique-2026' };
  const response = await api.post(`${API}/api/auth/register`, {
    data: {
      email: account.email,
      password: account.password,
      firstName: profession === 'coach' ? 'Samir' : 'Alix',
      lastName: 'Essai',
      profession,
      phone: '+33600000098',
      remoteOnly: true,
      consents: { terms: true, privacy: true },
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  await confirmEmail(api, account.email);
  return account;
}

/** Connexion par l'écran (fiche 11), puis attente de /patients. */
export async function signIn(page: Page, account: TestAccount, locale = 'fr'): Promise<void> {
  await page.goto(`/${locale}/connexion`);
  await page
    .getByLabel(locale === 'fr' ? 'E-mail professionnel' : 'Work email')
    .fill(account.email);
  await page
    .getByLabel(locale === 'fr' ? 'Mot de passe' : 'Password', { exact: true })
    .fill(account.password);
  await page.getByRole('button', { name: locale === 'fr' ? 'Se connecter' : 'Sign in' }).click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/patients$`));
}
