import { expect, test } from '@playwright/test';

import { uniqueEmail } from '../support/accounts';
import { expectNoAxeViolations } from '../support/axe';
import { expectState, fail, getOf, hold, postOf, shoot } from './etats-support';

// Planche 29 (M6-03) : pages publiques et d'identité, sans session (fiches 08, 09, 11, 12, 24, 25,
// 26), contre l'API réelle. Les écrans formulaires (11, 12, 26) n'ont pas de bloc de données lu à
// l'affichage : leurs états sont ceux de l'envoi (refus sous le formulaire, role=alert).

test.describe.configure({ timeout: 60_000 });

test.describe('08 annuaire public', () => {
  test('chargement', async ({ page }) => {
    const held = await hold(page, getOf('/api/public/directory'));
    await page.goto('/fr/annuaire?q=psychologue');
    await expectState(page, 'loading', '08-annuaire');
    await held.release();
  });

  test('vide : « Aucun praticien pour ces critères » (fiche 08 C), critère retirable', async ({
    page,
  }) => {
    await page.goto('/fr/annuaire?q=zzqxwvyk');
    const none = page.locator('.no-results[role=status]');
    await expect(none).toContainText('Aucun praticien pour ces critères');
    await expect(none.getByRole('button', { name: /zzqxwvyk/ })).toBeVisible();
    await expectNoAxeViolations(page);
    await shoot(page, '08-annuaire-empty');
  });

  test('erreur : la recherche est conservée, Réessayer', async ({ page }) => {
    await fail(page, getOf('/api/public/directory'));
    await page.goto('/fr/annuaire?q=psychologue');
    const error = await expectState(page, 'error', '08-annuaire', {
      text: "L'annuaire est momentanément indisponible",
    });
    await expect(error.getByRole('button', { name: 'Réessayer' })).toBeVisible();
  });
});

test.describe('09 fiche publique d’un praticien', () => {
  const read = getOf(/^\/api\/public\/directory\/practitioners\/[^/]+$/);

  test('chargement', async ({ page }) => {
    const held = await hold(page, read);
    await page.goto('/fr/praticiens/inconnu-m6-03');
    await expectState(page, 'loading', '09-fiche-publique');
    await held.release();
  });

  test('vide (404) : « Fiche introuvable », retour à l’annuaire', async ({ page }) => {
    await page.goto('/fr/praticiens/inconnu-m6-03');
    const notFound = page.locator('.not-found[role=status]');
    await expect(notFound.getByRole('heading', { name: 'Fiche introuvable' })).toBeVisible();
    await expect(notFound.getByRole('link', { name: "Retour à l'annuaire" })).toBeVisible();
    await expectNoAxeViolations(page);
    await shoot(page, '09-fiche-publique-empty');
  });

  test('erreur avec Réessayer', async ({ page }) => {
    await fail(page, read);
    await page.goto('/fr/praticiens/inconnu-m6-03');
    const error = await expectState(page, 'error', '09-fiche-publique', {
      text: "Impossible d'afficher cette fiche",
    });
    await expect(error.getByRole('button', { name: 'Réessayer' })).toBeVisible();
  });
});

test('24 comment ça marche : page statique, aucun bloc de données', async ({ page }) => {
  await page.goto('/fr/comment-ca-marche');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('pm-state')).toHaveCount(0);
  await expectNoAxeViolations(page);
  await shoot(page, '24-comment-ca-marche');
});

test('11 connexion, erreur : message unique sous le formulaire (401)', async ({ page }) => {
  await page.goto('/fr/connexion');
  await page.getByLabel('Adresse e-mail').fill('inconnu.m6-03@example.test');
  await page.getByLabel('Mot de passe', { exact: true }).fill('Pas-Le-Bon-2026');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('alert')).toHaveText('E-mail, mot de passe ou code incorrect.');
  await expectNoAxeViolations(page);
  await shoot(page, '11-connexion-error');
});

test('12 inscription, erreur : formulaire vide refusé, résumé et champs fautifs', async ({
  page,
}) => {
  await page.goto('/fr/inscription');
  await page.getByRole('button', { name: /Créer mon compte/ }).click();
  await expect(page.locator('[aria-invalid="true"]').first()).toBeVisible();
  await expectNoAxeViolations(page);
  await shoot(page, '12-inscription-error');
});

test.describe('25 confirmation d’e-mail (lien)', () => {
  const confirm = postOf('/api/auth/email/confirm');

  test('chargement pendant le traitement du lien', async ({ page }) => {
    const held = await hold(page, confirm);
    await page.goto('/fr/confirmer-email/jeton-m6-03');
    await expectState(page, 'loading', '25-confirmation-email');
    await held.release();
  });

  test('erreur serveur : Réessayer', async ({ page }) => {
    await fail(page, confirm);
    await page.goto('/fr/confirmer-email/jeton-m6-03');
    const error = await expectState(page, 'error', '25-confirmation-email');
    await expect(error.getByRole('button', { name: 'Réessayer' })).toBeVisible();
  });
});

test.describe('26 mot de passe oublié', () => {
  test('erreur serveur : message générique, saisie conservée', async ({ page }) => {
    await fail(page, postOf('/api/auth/password-reset/request'));
    await page.goto('/fr/mot-de-passe-oublie');
    await page.getByLabel('Adresse e-mail').fill('inconnu.m6-03@example.test');
    await page.getByRole('button', { name: 'Envoyer le lien' }).click();
    await expect(page.getByRole('alert')).toHaveText(
      'Envoi impossible pour le moment. Réessayez dans un instant.',
    );
    await expect(page.getByLabel('Adresse e-mail')).toHaveValue('inconnu.m6-03@example.test');
    await expectNoAxeViolations(page);
    await shoot(page, '26-mot-de-passe-oublie-error');
  });

  test('envoyé : même message quel que soit le compte (role=status)', async ({ page }) => {
    await page.goto('/fr/mot-de-passe-oublie');
    // Adresse unique : 3 demandes par heure et par adresse (fiche 26), relances comprises.
    await page.getByLabel('Adresse e-mail').fill(uniqueEmail('m6-03.reset'));
    await page.getByRole('button', { name: 'Envoyer le lien' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Si un compte existe pour cette adresse' }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
    await shoot(page, '26-mot-de-passe-oublie-sent');
  });
});
