import AxeBuilder from '@axe-core/playwright';
import { expect, Page } from '@playwright/test';

/**
 * axe-core sur la page courante, règles WCAG 2.0 / 2.1 A et AA (CLAUDE.md : axe dans chaque e2e).
 *
 * Avant l'analyse, on attend la fin des ondulations Material : juste après un clic, l'ondulation
 * (`.mat-ripple-element`, voile blanc qui s'estompe en 225 ms) éclaircit le fond du bouton, et axe
 * mesure alors un contraste intermédiaire (4,38:1 pour « Se connecter » en CI, où la machine est
 * plus lente qu'en local). Ce n'est pas l'état rendu à l'utilisateur, seulement une animation en cours.
 */
export async function expectNoAxeViolations(page: Page): Promise<void> {
  await expect(page.locator('.mat-ripple-element')).toHaveCount(0);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
}
