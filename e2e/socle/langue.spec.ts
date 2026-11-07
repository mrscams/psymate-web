import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// M0-06 : page vide servie en français par défaut, bascule FR ⇄ EN, axe-core sans violation.

test('la racine mène à la page vide en français', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/fr\/$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bienvenue dans PsyMate');
});

test('bascule FR → EN → FR', async ({ page }) => {
  await page.goto('/fr/');
  await page.getByRole('link', { name: 'English' }).click();

  await expect(page).toHaveURL(/\/en\/$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome to PsyMate');

  await page.getByRole('link', { name: 'Français' }).click();

  await expect(page).toHaveURL(/\/fr\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bienvenue dans PsyMate');
});

for (const locale of ['fr', 'en']) {
  test(`axe-core : aucune violation WCAG 2.1 AA (${locale})`, async ({ page }) => {
    await page.goto(`/${locale}/`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });
}
