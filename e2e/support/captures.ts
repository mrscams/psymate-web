import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { expect, Page } from '@playwright/test';

/**
 * Capture pleine page pour la revue visuelle (M6-03, M7-04), seulement si PSYMATE_E2E_CAPTURES
 * désigne un dossier, toujours hors du dépôt : rien n'est écrit par défaut. Pas de capture au milieu
 * d'une ondulation Material ; animations figées.
 */
export async function shoot(page: Page, name: string, fullPage = true): Promise<void> {
  const dir = process.env['PSYMATE_E2E_CAPTURES'];
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await expect(page.locator('.mat-ripple-element')).toHaveCount(0);
  await page.screenshot({ path: join(dir, `${name}.png`), fullPage, animations: 'disabled' });
}
