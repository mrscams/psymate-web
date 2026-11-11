import { expect, test } from '@playwright/test';

import { expectNoAxeViolations } from '../support/axe';

// UX-A6 (fiche 00 §4) : les trois liens du pied public mènent à leur page, sans session et sans
// redirection (avant : route `**` puis /connexion). axe-core à 0 dans les deux thèmes, aucun
// débordement horizontal à 375 px. Contre l'application construite, jamais de mock du backend.
// Point de départ : « Comment ça marche » (UX-D1bis : la connexion n'a plus le pied public, maquette 11).

const LINKS = [
  { name: 'Mentions légales', path: '/fr/mentions-legales', tab: 'Mentions légales · PsyMate' },
  { name: 'Confidentialité', path: '/fr/confidentialite', tab: 'Confidentialité · PsyMate' },
  { name: 'Accessibilité', path: '/fr/accessibilite', tab: 'Accessibilité · PsyMate' },
] as const;

for (const link of LINKS) {
  test(`pied public : « ${link.name} » ouvre sa page depuis « Comment ça marche », sans redirection`, async ({
    page,
  }) => {
    await page.goto('/fr/comment-ca-marche');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const footer = page.getByRole('navigation', { name: 'Informations légales' });
    await expect(footer).toBeVisible();

    const visited: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) visited.push(new URL(frame.url()).pathname);
    });
    await footer.getByRole('link', { name: link.name, exact: true }).click();

    await expect(page).toHaveURL((url) => url.pathname === link.path);
    await expect(page.getByRole('heading', { level: 1, name: link.name })).toBeVisible();
    await expect(page).toHaveTitle(link.tab);
    await expect(page.getByRole('note')).toContainText('à compléter par le propriétaire');
    // Layout large : pas de colonne de 480 px des formulaires.
    await expect(page.locator('main#main')).not.toHaveClass(/narrow/);
    expect(visited.filter((p) => p !== link.path)).toEqual([]);
    await expectNoAxeViolations(page);

    // Chargement direct (sans navigation interne) : même page, toujours sans redirection.
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(link.path);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('heading', { level: 1, name: link.name })).toBeVisible();
    await expect(page).toHaveURL((url) => url.pathname === link.path);
    await expectNoAxeViolations(page);
  });
}

test('pied public à 375 px : les trois pages sans défilement horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const link of LINKS) {
    await page.goto(link.path);
    await expect(page.getByRole('heading', { level: 1, name: link.name })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `débordement horizontal sur ${link.path}`).toBeLessThanOrEqual(0);
    await expectNoAxeViolations(page);
  }
});
