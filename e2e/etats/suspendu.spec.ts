import { APIRequestContext, expect, Page, test } from '@playwright/test';

import { confirmEmail, register, TestAccount } from '../support/accounts';
import {
  ADMIN_AVAILABLE,
  ADMIN_MISSING,
  adminContext,
  suspendPractitioner,
} from '../support/admin';
import { expectState, fail, getOf, hold } from './etats-support';

// Planche 29 (M6-03) : chargement et erreur de l'écran 27 (compte suspendu), sur le suivi de
// l'export (GET /api/me/export/{jobId}), seul bloc lu par l'écran. Contre l'API réelle : le compte
// jetable est suspendu par l'administrateur e2e local (comme e2e/compte-suspendu) ; sans lui, ces
// tests sont ignorés et le disent. « Vide » n'a pas de sens ici (aucun export lancé = pas de bloc).

const API = 'http://localhost:8080';
const STATUS = getOf(/^\/api\/me\/export\/[^/]+$/);

async function suspendedAccount(request: APIRequestContext, prefix: string): Promise<TestAccount> {
  const account = await register(request, prefix);
  await confirmEmail(request, account.email);
  const me = await request.get(`${API}/api/auth/me`);
  expect(me.status(), await me.text()).toBe(200);
  const { id } = (await me.json()) as { id: string };
  const admin = await adminContext();
  try {
    await suspendPractitioner(admin, id, 'Test e2e M6-03 : états de la page compte suspendu.');
  } finally {
    await admin.dispose();
  }
  return account;
}

async function launchExport(page: Page, account: TestAccount): Promise<void> {
  await page.goto('/fr/compte-suspendu');
  await page.getByLabel('Adresse e-mail du compte').fill(account.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Exporter mes dossiers' }).click();
}

test.describe('27 compte suspendu : suivi de l’export', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });
  test.skip(!ADMIN_AVAILABLE, ADMIN_MISSING);

  test('chargement', async ({ page, request }) => {
    const account = await suspendedAccount(request, 'm6-03.suspendu.chargement');
    const held = await hold(page, STATUS);
    await launchExport(page, account);
    await expectState(page, 'loading', '27-compte-suspendu');
    await held.release();
    await expect(page.locator('.job .pill')).toBeVisible();
  });

  test('erreur (coupure réseau) avec Réessayer, qui relit l’état du job', async ({
    page,
    request,
  }) => {
    const account = await suspendedAccount(request, 'm6-03.suspendu.erreur');
    await fail(page, STATUS);
    await launchExport(page, account);
    const error = await expectState(page, 'error', '27-compte-suspendu', {
      text: "Impossible de lire l'état de l'export",
    });
    await error.getByRole('button', { name: 'Réessayer' }).click();
    await expect(page.locator('.job .pill')).toBeVisible();
  });
});
