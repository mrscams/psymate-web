import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, Page, test } from '@playwright/test';

// Outils des e2e d'accessibilité (M7-04, B7, C5) : axe-core écran par écran dans un thème donné,
// captures facultatives hors du dépôt. Contre l'API réelle (seed small, Mailpit), jamais de mock.

export type Theme = 'light' | 'dark';
export const THEMES: readonly Theme[] = ['light', 'dark'];

/** Règles WCAG analysées : 2.0 et 2.1, niveaux A et AA (mêmes que e2e/support/axe.ts). */
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** Le thème est appliqué : `data-theme` sur <html> (préférence ou système). */
export async function expectTheme(page: Page, theme: Theme): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

/** Plus aucun bloc en chargement (pm-state, aria-busy). */
export async function settled(page: Page): Promise<void> {
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });
}

/**
 * axe-core sur toute la page, sans règle désactivée ni élément exclu. Attend d'abord la fin des
 * ondulations Material et des fondus de dialogue (couleurs semi-transparentes en cours
 * d'animation, voir e2e/support/axe.ts). Assertion « soft » : un parcours de vingt écrans les
 * analyse tous et échoue à la fin avec la liste complète. Le nombre de violations par gravité est
 * joint au rapport (annotation `axe <thème>`).
 */
export async function axeScreen(page: Page, theme: Theme, screen: string): Promise<void> {
  await expect(page.locator('.mat-ripple-element')).toHaveCount(0);
  await expect(page.locator('.mdc-dialog--opening, .mdc-dialog--closing')).toHaveCount(0);
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  const byImpact = results.violations.reduce<Record<string, number>>((acc, violation) => {
    const impact = violation.impact ?? 'inconnu';
    acc[impact] = (acc[impact] ?? 0) + violation.nodes.length;
    return acc;
  }, {});
  const counted = Object.entries(byImpact)
    .map(([impact, count]) => `${impact} ${count}`)
    .join(', ');
  test.info().annotations.push({
    type: `axe ${theme}`,
    description: `${screen} : ${counted || '0 violation'} (${results.passes.length} règles respectées)`,
  });
  expect
    .soft(
      results.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => n.target.join(' ')),
      })),
      `axe-core, thème ${theme} : ${screen}`,
    )
    .toEqual([]);
}

/**
 * Capture pleine page pour la revue, seulement si PSYMATE_E2E_CAPTURES désigne un dossier (hors du
 * dépôt) : rien n'est écrit par défaut.
 */
export async function shoot(page: Page, name: string, fullPage = true): Promise<void> {
  const dir = process.env['PSYMATE_E2E_CAPTURES'];
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await expect(page.locator('.mat-ripple-element')).toHaveCount(0);
  await page.screenshot({ path: join(dir, `${name}.png`), fullPage, animations: 'disabled' });
}
