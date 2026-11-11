import { expect, Page, test } from '@playwright/test';

import { adminApi, shareSession } from '../flux-10-admin/helpers';
import { createAccount, signIn } from '../preferences/accounts';
import { ADMIN_AVAILABLE, ADMIN_MISSING } from '../support/admin';
import { expectNoAxeViolations } from '../support/axe';
import { smallTargets, withoutLinkTargets } from '../support/cibles';

// UX-A3 (WCAG 2.5.8, cibles de 24 px) : plus aucune cible autonome sous 24 × 24 px sur
// /connexion, /mon-compte/emotions et /admin/journal (liens dans une phrase exemptés, cases et
// radios mesurées par leur label englobant). La classe `.pm-link-target` agrandit la zone cliquable
// sans bouger le rendu : à 1440 px, la capture est identique au pixel près avec et sans la classe.
// Contre l'API locale (seed small), jamais de mock du backend ; axe-core à 0.

test.use({ viewport: { width: 1440, height: 900 } });

async function settled(page: Page): Promise<void> {
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });
  await page.evaluate(() => document.fonts.ready);
}

/** Capture pleine page avec et sans `.pm-link-target` : aucune différence de pixel. */
async function expectSameRendering(page: Page): Promise<void> {
  // Focus hors de tout lien : l'anneau de focus suit la zone agrandie, c'est voulu.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const withClass = await page.screenshot({ fullPage: true, animations: 'disabled' });
  const restore = await withoutLinkTargets(page);
  const withoutClass = await page.screenshot({ fullPage: true, animations: 'disabled' });
  await restore();
  expect(withClass.equals(withoutClass), 'rendu modifié par .pm-link-target').toBe(true);
}

test('/connexion : aucune cible autonome sous 24 px, rendu inchangé', async ({ page }) => {
  await page.goto('/fr/connexion');
  await expect(page.getByRole('heading', { level: 1, name: 'Connexion' })).toBeVisible();
  await settled(page);

  expect(await smallTargets(page)).toEqual([]);

  // Les liens du pied, de la langue et du formulaire passent de 16 à 21 px à 24 px au moins.
  for (const name of [
    'Mentions légales',
    'Confidentialité',
    'Accessibilité',
    'English',
    'Créer un compte',
    'Mot de passe oublié ?',
  ]) {
    const box = await page.getByRole('link', { name, exact: true }).boundingBox();
    expect(box!.height, `hauteur de « ${name} »`).toBeGreaterThanOrEqual(24);
  }

  // Témoin : sans la classe, la sonde retrouve les six liens de l'audit (16 à 21 px).
  const restore = await withoutLinkTargets(page);
  const before = await smallTargets(page);
  await restore();
  expect(before.map((target) => target.text).sort()).toEqual(
    [
      'Accessibilité',
      'Confidentialité',
      'Créer un compte',
      'English',
      'Mentions légales',
      'Mot de passe oublié ?',
    ].sort(),
  );

  await expectSameRendering(page);
  await expectNoAxeViolations(page);
});

test('/mon-compte/emotions : liens et radios des familles à 24 px au moins', async ({
  page,
  request,
}) => {
  // Compte jetable en attente de dossier : le bandeau de vérification et son lien « Voir le
  // dossier » (pm-status-banner) sont mesurés aussi.
  const account = await createAccount(request, 'ux-a3.cibles', 'psychologist');
  await signIn(page, account);
  await page.goto('/fr/mon-compte/emotions');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await settled(page);

  expect(await smallTargets(page)).toEqual([]);
  for (const name of ['Gérer mes tags', 'English', 'Voir le dossier']) {
    const box = await page.getByRole('link', { name, exact: true }).boundingBox();
    expect(box!.height, `hauteur de « ${name} »`).toBeGreaterThanOrEqual(24);
  }
  // Radios natifs des familles : 18 px au moins (13 px par défaut), label englobant cliquable.
  const radio = page.getByRole('radio').first();
  const box = await radio.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(18);
  expect(box!.height).toBeGreaterThanOrEqual(18);
  const label = page.locator('label.family').first();
  await label.locator('span').last().click();
  await expect(radio).toBeChecked();

  await expectSameRendering(page);
  await expectNoAxeViolations(page);
});

test('/admin/journal : noms et liens d’action à 24 px au moins, rendu inchangé', async ({
  page,
  context,
}) => {
  test.skip(!ADMIN_AVAILABLE, ADMIN_MISSING);
  const admin = await adminApi();
  await shareSession(admin, context);
  await page.goto('/fr/admin/journal');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await settled(page);

  expect(await smallTargets(page)).toEqual([]);
  // Les noms de praticien (bouton-lien « voir seulement ses événements ») mesuraient 16 px.
  const names = page.getByRole('button', { name: /voir seulement ses événements/ });
  if ((await names.count()) > 0) {
    expect((await names.first().boundingBox())!.height).toBeGreaterThanOrEqual(24);
    const restore = await withoutLinkTargets(page);
    expect((await names.first().boundingBox())!.height).toBeLessThan(24);
    await restore();
  }
  await expectSameRendering(page);
  await expectNoAxeViolations(page);
  await admin.dispose();
});
