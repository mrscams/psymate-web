import { expect, Page, test } from '@playwright/test';

import { ADMIN, ADMIN_AVAILABLE, ADMIN_MISSING } from '../support/admin';
import { expectNoAxeViolations } from '../support/axe';
import { keyboardOnly, tabTo } from '../support/clavier';
import { totp, totpStep } from '../support/totp';
import { API, submittedAccount } from './helpers';

// B8 flux 10 au clavier seul (M7-04, B7, fiche 20) : l'administrateur se connecte au clavier avec
// son code 2FA, ouvre le dossier soumis depuis la file, coche les justificatifs « conformes » et la
// liste de contrôle à l'Espace, vérifie que « Demander un complément » attend un message, puis
// approuve à l'Entrée. Aucun geste de pointeur (keyboardOnly). Exige l'administrateur e2e local
// (PSYMATE_E2E_ADMIN_*, e2e/support/admin.ts) ; sans lui, le test est ignoré et le dit. Contre
// l'API locale et Mailpit, jamais de mock du backend.

/**
 * Connexion de l'administrateur au clavier (fiche 11) : e-mail, mot de passe, Entrée, puis le code
 * TOTP. Un pas TOTP ne sert qu'une fois : si un autre test vient de consommer le pas courant, le
 * code est refusé ; on attend alors le pas suivant et on saisit son code (une fois).
 */
async function adminSignInByKeyboard(page: Page): Promise<void> {
  await page.goto('/fr/connexion');
  await tabTo(page, page.getByLabel('Adresse e-mail'), { max: 40 });
  await page.keyboard.type(ADMIN.email);
  await tabTo(page, page.getByLabel('Mot de passe', { exact: true }), { max: 3 });
  await page.keyboard.type(ADMIN.password);
  await page.keyboard.press('Enter');
  const code = page.getByLabel('Code de vérification');
  await expect(code).toBeVisible();
  await tabTo(page, code, { max: 10 });
  const step = totpStep();
  await page.keyboard.type(totp(ADMIN.totpSecret, step));
  await page.keyboard.press('Enter');
  const arrived = await page
    .waitForURL(/\/fr\/admin\//, { timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (arrived) return;
  await new Promise((resolve) => setTimeout(resolve, 31_000 - (Date.now() % 30_000)));
  await tabTo(page, code, { max: 10 });
  await page.keyboard.press('Control+a');
  await page.keyboard.type(totp(ADMIN.totpSecret, Math.max(step + 1, totpStep())));
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/fr\/admin\//);
}

test.describe('flux 10 au clavier', () => {
  test.skip(!ADMIN_AVAILABLE, ADMIN_MISSING);

  test('connexion 2FA, dossier depuis la file, conformes, liste de contrôle, approbation', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const practitioner = await submittedAccount('m7-04.flux10');
    try {
      const keys = await keyboardOnly(page);
      await adminSignInByKeyboard(page);
      await expect(page.getByRole('heading', { level: 1, name: /^À vérifier/ })).toBeVisible();

      // La file : le dossier soumis (Tab jusqu'à son lien, Entrée).
      const queue = page.getByRole('list', { name: 'Dossiers en attente de vérification' });
      const link = queue.locator(`a[href$="${practitioner.id}"]`);
      await tabTo(page, link, { max: 200 });
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(new RegExp(`/fr/admin/validation/${practitioner.id}$`));
      await expect(page.locator('#dossier-title')).toHaveText('Alix Essai');
      await expect(page.locator('pm-document-viewer iframe')).toHaveAttribute('src', /^blob:/);
      await expectNoAxeViolations(page);

      // Justificatifs « Conforme » (Espace, PATCH immédiat), puis la liste de contrôle.
      for (const name of [
        /Conforme\s*Master 2 Psychologie clinique/,
        /Conforme\s*Carte nationale/,
        'Le nom concorde sur toutes les pièces',
        'Le diplôme correspond à la profession déclarée',
        'Le numéro est retrouvé dans le registre public',
        'Les documents sont lisibles et non altérés',
      ]) {
        const box = page.getByRole('checkbox', { name });
        await tabTo(page, box, { max: 60 });
        await page.keyboard.press('Space');
        await expect(box).toBeChecked();
      }

      // « Demander un complément » attend un message : inactif tant que le champ est vide.
      const askMore = page.getByRole('button', { name: 'Demander un complément' });
      await expect(askMore).toBeDisabled();
      const message = page.locator('#field-messageToPractitioner');
      await tabTo(page, message, { max: 30 });
      await page.keyboard.type('Merci.');
      await expect(askMore).toBeEnabled();
      await page.keyboard.press('Control+a');
      await page.keyboard.press('Backspace');
      await expect(askMore).toBeDisabled();
      await expectNoAxeViolations(page);

      // Approuver : Tab, Entrée ; le dossier sort de la file, le praticien est approuvé.
      const decided = page.waitForResponse(
        (res) =>
          res.url().endsWith(`/api/admin/verifications/${practitioner.id}/decision`) &&
          res.request().method() === 'POST',
      );
      await tabTo(page, page.getByRole('button', { name: 'Approuver', exact: true }), {
        max: 30,
      });
      await page.keyboard.press('Enter');
      expect((await decided).status()).toBe(201);
      await expect(page.getByText('Alix Essai approuvé·e · e-mail envoyé')).toBeVisible();
      await expect(page).not.toHaveURL(new RegExp(practitioner.id));
      const session = await practitioner.api.get(`${API}/api/auth/session`);
      expect(((await session.json()) as { verificationStatus: string }).verificationStatus).toBe(
        'approved',
      );
      keys.expectNoPointer();
    } finally {
      await practitioner.api.dispose();
    }
  });
});
