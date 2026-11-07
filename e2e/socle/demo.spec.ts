import AxeBuilder from '@axe-core/playwright';
import { expect, Page, test } from '@playwright/test';

// M0-09 : la page /_demo montre chaque composant partagé dans ses états (fiche 00, C10 M0-09).
// Critères : axe-core 0 violation « serious » dans les deux thèmes ; le panneau latéral piège le
// focus, Échap ferme et rend le focus au déclencheur ; 429 → toast « réessayez dans N s ».

const SERIOUS = ['serious', 'critical'];

const title = (page: Page) => page.getByRole('heading', { level: 1, name: /démonstration/ });

async function openDemo(page: Page, locale = 'fr'): Promise<void> {
  await page.goto(`/${locale}/_demo`);
  await expect(title(page)).toBeVisible();
}

/** `include` : limiter l'analyse (au panneau ouvert, dont la page derrière le voile est aria-hidden). */
async function seriousViolations(page: Page, include?: string) {
  const builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
  const results = await (include ? builder.include(include) : builder).analyze();
  return results.violations
    .filter((violation) => SERIOUS.includes(violation.impact ?? ''))
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.map((node) => node.target.join(' ')),
    }));
}

for (const theme of ['light', 'dark', 'soft'] as const) {
  test(`axe-core : aucune violation serious sur /_demo, thème ${theme}`, async ({ page }) => {
    await openDemo(page);
    await page.getByRole('button', { name: theme, exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    expect(await seriousViolations(page)).toEqual([]);
  });
}

test('axe-core : aucune violation serious sur /_demo en anglais', async ({ page }) => {
  await openDemo(page, 'en');
  expect(await seriousViolations(page)).toEqual([]);
});

test('axe-core : panneau latéral ouvert et boîte de confirmation ouverte', async ({ page }) => {
  await openDemo(page);
  await page.getByRole('button', { name: /Nouvelle entrée/ }).click();
  const panel = page.getByRole('dialog', { name: 'Nouvelle entrée' });
  await expect(panel).toBeVisible();
  await expect(panel.locator('input').first()).toBeFocused();
  expect(await seriousViolations(page, '.cdk-overlay-container')).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.locator('button.confirm-word').click();
  const confirm = page.getByRole('dialog', { name: 'Archiver Marie D. ?' });
  await expect(confirm).toBeVisible();
  // Le focus arrive à la fin de l'animation d'ouverture : les couleurs sont alors stables pour axe.
  await expect(confirm.getByRole('textbox')).toBeFocused();
  await page.waitForTimeout(300);
  expect(await seriousViolations(page, '.cdk-overlay-container')).toEqual([]);
  await page.keyboard.press('Escape');
});

test('panneau latéral : focus piégé, Échap ferme, le focus revient au déclencheur', async ({
  page,
}) => {
  await openDemo(page);
  const trigger = page.locator('button.open-panel');
  await trigger.focus();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog', { name: 'Nouvelle entrée' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(dialog.locator('input').first()).toBeFocused();
  await expect(page.locator('.pm-side-panel-pane')).toHaveCSS('width', '480px');

  // Aucun élément derrière le voile n'est atteignable : vingt tabulations restent dans le panneau.
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press(i % 2 ? 'Shift+Tab' : 'Tab');
    const inside = await page.evaluate(
      () => document.activeElement?.closest('[role="dialog"]') !== null,
    );
    expect(inside, `tabulation ${i + 1}`).toBe(true);
  }
  const hidden = await page.evaluate(() =>
    document.querySelector('pm-root')?.getAttribute('aria-hidden'),
  );
  expect(hidden).toBe('true');

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.locator('pm-root')).not.toHaveAttribute('aria-hidden', 'true');
});

test('pile de deux panneaux : Échap ferme le dessus seulement, le voile ferme aussi', async ({
  page,
}) => {
  await openDemo(page);
  await page.locator('button.open-panel').click();
  await page.getByRole('button', { name: /Lier/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(2);
  await expect(page.getByRole('dialog', { name: 'Nouveau lien' })).toBeVisible();
  await expect(page.locator('.pm-side-panel-pane--420')).toHaveCSS('width', '420px');

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(page.getByRole('dialog', { name: 'Nouvelle entrée' })).toBeVisible();

  await page
    .locator('.cdk-overlay-backdrop')
    .last()
    .click({ position: { x: 20, y: 300 } });
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('raccourcis : / donne le focus à la recherche, ? ouvre l’aide, inactifs dans un champ', async ({
  page,
}) => {
  await openDemo(page);
  await title(page).click();
  await page.keyboard.press('/');
  await expect(page.locator('input[type="search"]').last()).toBeFocused();

  // Dans un champ, « ? » s'écrit et n'ouvre rien.
  await page.keyboard.type('?');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('input[type="search"]').last()).toHaveValue('?');

  await title(page).click();
  await page.keyboard.press('Shift+?');
  await expect(page.getByRole('dialog', { name: 'Raccourcis clavier' })).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('Nouvelle entrée');
  await page.keyboard.press('Escape');
});

test('confirmation destructive : le bouton attend le nom exact', async ({ page }) => {
  await openDemo(page);
  await page.locator('button.confirm-word').click();
  const dialog = page.getByRole('dialog', { name: 'Archiver Marie D. ?' });
  const archive = dialog.getByRole('button', { name: 'Archiver' });
  await expect(archive).toBeDisabled();
  await dialog.getByRole('textbox').fill('Marie');
  await expect(archive).toBeDisabled();
  await dialog.getByRole('textbox').fill('Marie D.');
  await expect(archive).toBeEnabled();
  await archive.click();
  await expect(page.locator('.result').last()).toHaveText('confirmé');

  await page.locator('button.confirm-simple').click();
  await expect(page.getByRole('dialog', { name: 'Supprimer le patient démo ?' })).toBeVisible();
  await page.getByRole('button', { name: 'Annuler' }).click();
  await expect(page.locator('.result').last()).toHaveText('annulé');
});

test('429 → toast « réessayez dans 12 s » ; 422 → résumé et champs fautifs ; hors ligne → bandeau', async ({
  page,
}) => {
  await openDemo(page);
  await page.locator('button.toast-429').click();
  const toast = page.locator('pm-toast-outlet .toast.warning');
  await expect(toast).toContainText(/Trop de requêtes, réessayez dans 12\s?s/);
  await expect(toast).toContainText('Avertissement');

  await page.locator('button.simulate-422').click();
  const summary = page.locator('pm-problem-summary [role="alert"]');
  await expect(summary).toContainText('2 champs à corriger.');
  await expect(summary).toBeFocused();
  await expect(page.locator('#field-displayName')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#field-displayName-error')).toHaveText(
    'Le nom affiché est obligatoire.',
  );
  await expect(page.locator('#field-displayName')).toHaveValue('Marie D.');
  await summary.getByRole('link', { name: 'Date de naissance' }).click();
  await expect(page.locator('#field-birthDate')).toBeFocused();

  await page.locator('button.toggle-offline').click();
  await expect(page.locator('pm-network-banner .banner')).toContainText('Connexion perdue');
  await page.locator('button.toggle-offline').click();
  await expect(page.locator('pm-network-banner .banner')).toHaveCount(0);
});

test('en-tête patient : Démarrer puis Clôturer sans rechargement ; touches 1 2 3', async ({
  page,
}) => {
  await openDemo(page);
  const header = page.locator('pm-patient-header').last();
  await expect(header).toContainText('Dernière séance');
  await header.getByRole('button', { name: 'Démarrer la séance' }).click();
  await expect(header).toContainText('en cours depuis');
  await header.getByRole('button', { name: 'Clôturer la séance' }).click();
  await expect(header).toContainText('Dernière séance');

  // La touche 2 navigue vers l'onglet Timeline du dossier ; sans session, la garde renvoie à la
  // connexion : on vérifie seulement que la page de démonstration a été quittée.
  await title(page).click();
  await page.keyboard.press('2');
  await expect(page).not.toHaveURL(/_demo/);
});
