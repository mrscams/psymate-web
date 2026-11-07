import { APIRequestContext, expect, Page, test } from '@playwright/test';

import { confirmEmail, register, TestAccount } from '../support/accounts';
import {
  ADMIN_AVAILABLE,
  ADMIN_MISSING,
  adminContext,
  suspendPractitioner,
} from '../support/admin';
import { expectNoAxeViolations } from '../support/axe';

// Fiche 27 (M1-18) : compte suspendu. La suspension passe par l'API admin (un administrateur
// local avec 2FA, voir e2e/support/admin.ts) ; sans lui, le premier test est ignoré et le dit.
// Contre l'API locale, jamais de mock.

const API = 'http://localhost:8080';
const APPEAL =
  'Le diplôme transmis est bien celui de mon établissement : voici pourquoi la décision me semble erronée.';

async function fillCredentials(page: Page, account: TestAccount): Promise<void> {
  await page.getByLabel('Adresse e-mail du compte').fill(account.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(account.password);
}

/** Tabule jusqu'au champ voulu (sans souris) ; échoue après 40 tabulations. */
async function tabTo(page: Page, id: string): Promise<void> {
  for (let i = 0; i < 40; i++) {
    if ((await page.evaluate(() => document.activeElement?.id)) === id) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`le focus n'a jamais atteint #${id}`);
}

async function practitionerId(api: APIRequestContext): Promise<string> {
  const me = await api.get(`${API}/api/auth/me`);
  expect(me.status(), await me.text()).toBe(200);
  return ((await me.json()) as { id: string }).id;
}

test.describe('compte suspendu par un administrateur', () => {
  test.skip(!ADMIN_AVAILABLE, ADMIN_MISSING);

  test('sessions révoquées, aucune route d’écriture ; écran 27 ; export (job, lien, zip) ; recours une fois puis 409', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    // Compte jetable confirmé (session dans `request`), suspendu par l'administrateur.
    const account = await register(request, 'm1-18.suspendu');
    await confirmEmail(request, account.email);
    const id = await practitionerId(request);
    const admin = await adminContext();
    await suspendPractitioner(
      admin,
      id,
      'Test e2e M1-18 : suspension pour vérifier la page compte suspendu.',
    );

    // Toutes les sessions sont révoquées : plus aucune route, d'écriture ou de lecture, ne répond.
    expect((await request.get(`${API}/api/auth/me`)).status()).toBe(401);
    expect(
      (
        await request.post(`${API}/api/patients`, {
          data: { displayName: 'Essai', firstName: 'E', lastName: 'S' },
        })
      ).status(),
    ).toBe(401);
    // Et la connexion est refusée : 403 ACCOUNT_SUSPENDED.
    const login = await request.post(`${API}/api/auth/login`, {
      data: { email: account.email, password: account.password },
    });
    expect(login.status()).toBe(403);
    expect(((await login.json()) as { code: string }).code).toBe('ACCOUNT_SUSPENDED');

    // Écran : la connexion mène à /compte-suspendu (intercepteur 403, M0-07).
    await page.goto('/fr/connexion');
    await page.getByLabel('Adresse e-mail').fill(account.email);
    await page.getByLabel('Mot de passe', { exact: true }).fill(account.password);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page).toHaveURL(/\/fr\/compte-suspendu$/);
    await expect(
      page.getByRole('status').filter({ hasText: 'Compte suspendu ou refusé' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: /Votre compte est suspendu ou votre dossier a été refusé/,
      }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Motif communiqué' })).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Ce que vous pouvez faire' }),
    ).toBeVisible();
    await expect(page.getByText(/agenda/i)).toHaveCount(0);
    await expectNoAxeViolations(page);

    // Aucune route protégée n'est atteignable : /patients renvoie à la connexion (pas de session).
    await page.goto('/fr/patients');
    await expect(page).toHaveURL(/\/fr\/connexion\?next=%2Fpatients$/);
    await page.goto('/fr/compte-suspendu');

    // Export : job lancé (202), suivi jusqu'à « Prêt », lien valable 7 jours, zip téléchargé.
    await fillCredentials(page, account);
    await page.getByRole('button', { name: 'Exporter mes dossiers' }).click();
    const pill = page.locator('.job .pill');
    await expect(pill).toHaveText(/En attente|En préparation|Prêt/);
    await expect(page.getByRole('button', { name: 'Exporter mes dossiers' })).toHaveAttribute(
      'aria-disabled',
      /true|false/,
    );
    await expect(pill).toHaveText('Prêt', { timeout: 120_000 });
    await expect(page.locator('.job')).toContainText("Lien valable jusqu'au");
    await expectNoAxeViolations(page);

    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: "Télécharger l'archive" }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toMatch(/^export-psymate-\d{8}\.zip$/);

    // Recours : un seul. 201 → état « Recours envoyé le … », le formulaire disparaît.
    await page.getByLabel('Votre explication').fill(APPEAL);
    await page.getByRole('button', { name: 'Envoyer le recours' }).click();
    const sent = page.locator('aside').getByRole('status');
    await expect(sent).toContainText('Recours envoyé le');
    await expect(page.getByLabel('Votre explication')).toHaveCount(0);
    await expectNoAxeViolations(page);

    // Après rechargement : le job d'export est retrouvé (localStorage), le formulaire de recours
    // revient (le serveur reste juge) et le second dépôt répond 409 APPEAL_ALREADY_OPEN.
    await page.reload();
    await expect(page.locator('.job .pill')).toHaveText('Prêt');
    await fillCredentials(page, account);
    await page.getByLabel('Votre explication').fill(APPEAL);
    await page.getByRole('button', { name: 'Envoyer le recours' }).click();
    await expect(page.locator('aside').getByRole('status')).toContainText(
      "Un recours est déjà en cours d'examen",
    );
    await expect(page.getByLabel('Votre explication')).toHaveCount(0);
    await expectNoAxeViolations(page);
  });
});

test('sans session : la page s’affiche ; compte actif → 409 « connectez-vous normalement » ; identifiants faux → message unique ; recours refusé pour un compte actif', async ({
  page,
  request,
}) => {
  // Compte jetable confirmé (docs_pending) : ni suspendu ni refusé.
  const account = await register(request, 'm1-18.actif');
  await confirmEmail(request, account.email);

  await page.goto('/fr/compte-suspendu');
  await expect(
    page.getByRole('status').filter({ hasText: 'Compte suspendu ou refusé' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Retour à la connexion' })).toBeVisible();
  await expect(page.getByLabel(/Code de vérification/)).toHaveCount(0);
  await expectNoAxeViolations(page);

  // Parcours clavier : e-mail → mot de passe → Exporter.
  await tabTo(page, 'field-email');
  await page.keyboard.type(account.email);
  await page.keyboard.press('Tab');
  await expect(page.locator('#field-password')).toBeFocused();
  await page.keyboard.type(account.password);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Exporter mes dossiers' })).toBeFocused();
  await page.keyboard.press('Enter');

  const alert = page.locator('.export').getByRole('alert');
  await expect(alert).toContainText('connectez-vous normalement');
  await expect(alert.getByRole('link', { name: 'Se connecter' })).toBeVisible();
  await expect(page.locator('.job .pill')).toHaveCount(0);
  await expectNoAxeViolations(page);

  // Identifiants faux : le message unique (un seul essai, pour ne pas verrouiller le compte).
  await page.getByLabel('Mot de passe', { exact: true }).fill('Pas-le-bon-mot-de-passe-1');
  await page.getByRole('button', { name: 'Exporter mes dossiers' }).click();
  await expect(alert).toHaveText('E-mail, mot de passe ou code incorrect.');

  // Recours d'un compte actif : 409 ACCOUNT_NOT_SUSPENDED, le formulaire reste.
  await page.getByLabel('Mot de passe', { exact: true }).fill(account.password);
  await page.getByLabel('Votre explication').fill(APPEAL);
  await page.getByRole('button', { name: 'Envoyer le recours' }).click();
  await expect(page.locator('form.appeal').getByRole('alert')).toContainText(
    'connectez-vous normalement',
  );
  await expect(page.getByLabel('Votre explication')).toBeVisible();
});
