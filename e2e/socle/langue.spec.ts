import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// M0-06, mis à jour en M0-07 : la racine mène (sans session) à la connexion, servie en français par
// défaut ; bascule FR ⇄ EN sur la même route ; axe-core sans violation.

test('la racine mène à la connexion en français', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/fr\/connexion\?next=%2Fpatients$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Connexion');
});

test('bascule FR → EN → FR', async ({ page }) => {
  await page.goto('/fr/connexion');
  await page.getByRole('link', { name: 'English' }).click();

  await expect(page).toHaveURL(/\/en\/connexion$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sign in');

  await page.getByRole('link', { name: 'Français' }).click();

  await expect(page).toHaveURL(/\/fr\/connexion$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Connexion');
});

for (const locale of ['fr', 'en']) {
  test(`axe-core : aucune violation WCAG 2.1 AA (${locale})`, async ({ page }) => {
    await page.goto(`/${locale}/connexion`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });
}
