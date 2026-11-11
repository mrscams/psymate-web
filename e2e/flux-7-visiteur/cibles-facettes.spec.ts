import AxeBuilder from '@axe-core/playwright';
import { expect, Locator, Page, test } from '@playwright/test';

import { expectNoAxeViolations } from '../support/axe';
import { smallTargets, withTightLines } from '../support/cibles';

// UX-G2a (bilan UX-G1, régression 08) : cases des facettes et boutons « Autres publics (n) » /
// « Autres langues (n) ». axe-core relevait 2 violations target-size : la case native (18 px) de la
// dernière valeur visible était à 20,8 px du bouton qui la suit (24 px requis).
//
// Pourquoi les e2e de l'annuaire ne le voyaient pas : ils ouvrent /annuaire sans filtre, et la
// facette ne montre que les valeurs présentes dans les fiches publiées. Sur une base sans fiche
// publiée (seed small de la CI), toutes les valeurs sont repliées sous le bouton : aucune case ne le
// précède, la violation n'existe pas. Ici, une valeur cochée dans l'URL reste toujours visible,
// juste avant le bouton, quelles que soient les données : le cas est rejoué partout, facettes
// repliées puis dépliées, à 1440 px (clair, sombre, police de repli large) et dans le panneau à
// 375 px. Contre l'API réelle, sans compte, jamais de mock du backend.

/** Une valeur cochée par facette repliable : visible juste avant « Autres … ». */
const CHECKED = '/fr/annuaire?public=young_adults&langue=fr';
const TOGGLES = [/^Autres publics \(\d+\)$/, /^Autres langues \(\d+\)$/];

async function resultsShown(page: Page): Promise<void> {
  await expect(page.locator('pm-practitioner-card, .no-results').first()).toBeVisible();
  await expect(page.locator('.cards.refreshing')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
}

/** Les deux boutons « Autres … » présents, dans l'état demandé. */
async function toggles(scope: Locator, expanded: boolean): Promise<Locator[]> {
  const buttons = TOGGLES.map((name) => scope.getByRole('button', { name }));
  for (const button of buttons) {
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute('aria-expanded', String(expanded));
  }
  return buttons;
}

async function setExpanded(scope: Locator, expanded: boolean): Promise<void> {
  for (const button of await toggles(scope, !expanded)) {
    await button.click();
    await expect(button).toHaveAttribute('aria-expanded', String(expanded));
  }
}

/**
 * Même règle que l'espacement de target-size (axe-core) : le centre de chaque case active est à
 * 12 px au moins du rectangle de toute autre cible (cases, boutons) de la colonne de filtres.
 */
async function closestNeighbour(scope: Locator): Promise<{ label: string; distance: number }> {
  return scope.evaluate((root) => {
    const targets = [...root.querySelectorAll('input, button')].filter(
      (el) => el.getBoundingClientRect().width > 0,
    );
    let closest = { label: '', distance: Infinity };
    for (const box of root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) {
      if (box.disabled || box.getBoundingClientRect().width === 0) continue;
      const r = box.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      for (const other of targets) {
        if (other === box) continue;
        const o = other.getBoundingClientRect();
        const dx = Math.max(o.left - cx, 0, cx - o.right);
        const dy = Math.max(o.top - cy, 0, cy - o.bottom);
        let distance = Math.hypot(dx, dy);
        // Voisin sous 24 px (axe : marge d'arrondi de 0,05 px) : son disque de 12 px compte aussi.
        if (o.width + 0.05 < 24 || o.height + 0.05 < 24) {
          const ox = o.left + o.width / 2;
          const oy = o.top + o.height / 2;
          distance = Math.max(0, Math.min(distance, Math.hypot(ox - cx, oy - cy) - 12));
        }
        if (distance < closest.distance) {
          const label = box.closest('label')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
          closest = { label: `${label} → ${other.textContent?.trim() ?? ''}`, distance };
        }
      }
    }
    return closest;
  });
}

/** Cibles de 24 px (labels englobants des cases), espacement des cases, axe-core à 0. */
async function expectTargets(page: Page, scope: Locator, state: string): Promise<void> {
  const labels = await scope
    .locator('label.option')
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
  expect(labels.length).toBeGreaterThan(0);
  for (const height of labels)
    expect(height, `label de case (${state})`).toBeGreaterThanOrEqual(24);
  const { label, distance } = await closestNeighbour(scope);
  expect(
    distance,
    `case la plus proche d'une autre cible : ${label} (${state})`,
  ).toBeGreaterThanOrEqual(12);
  await expectNoAxeViolations(page);
  // expectNoAxeViolations s'en tient à WCAG 2.0 / 2.1 : target-size (2.5.8) est une règle WCAG 2.2,
  // c'est la seconde raison pour laquelle aucun e2e ne l'a vue. L'audit lançait axe sans filtre.
  const wcag22 = await new AxeBuilder({ page }).withTags(['wcag22aa']).analyze();
  expect(wcag22.violations, `axe WCAG 2.2 AA (${state})`).toEqual([]);
}

/**
 * Cibles autonomes sous 24 px sur la page (même règle que l'e2e cibles-24), à l'arrondi d'axe près :
 * `.pm-link-target` (socle) mesure 23,98 px à cause de l'arrondi de mise en page au 1/64 px.
 */
async function smallTargetsBeyondRounding(page: Page) {
  return (await smallTargets(page)).filter(
    (target) => target.width + 0.05 < 24 || target.height + 0.05 < 24,
  );
}

/** Police de repli large dans la colonne (polices de la CI Linux), boutons à lignes resserrées. */
async function withWideFallback(page: Page): Promise<() => Promise<void>> {
  const wide = await page.addStyleTag({
    content:
      'pm-directory-filters, pm-directory-filters * { font-family: Verdana, "DejaVu Sans", sans-serif !important; }',
  });
  const restoreTight = await withTightLines(page);
  return async () => {
    await restoreTight();
    await wide.evaluate((node) => node.remove());
  };
}

test.describe('UX-G2a cibles des facettes', () => {
  test('1440 px : facettes repliées puis dépliées, clair, sombre, police large : axe à 0', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(CHECKED);
    await resultsShown(page);
    const filters = page.getByRole('complementary', { name: 'Filtres' });
    // Les valeurs cochées sont visibles (et cochées) quelles que soient les fiches publiées.
    await expect(filters.getByRole('checkbox', { name: 'Jeunes adultes' })).toBeChecked();
    await expect(filters.getByRole('checkbox', { name: /^français/i })).toBeChecked();

    await toggles(filters, false);
    await expectTargets(page, filters, 'repliées, clair');
    // Plus aucune cible autonome sous 24 px sur la page (cases mesurées par leur label).
    expect(await smallTargetsBeyondRounding(page)).toEqual([]);

    await setExpanded(filters, true);
    await expectTargets(page, filters, 'dépliées, clair');
    expect(await smallTargetsBeyondRounding(page)).toEqual([]);

    const restore = await withWideFallback(page);
    await expectTargets(page, filters, 'dépliées, police large');
    await setExpanded(filters, false);
    await expectTargets(page, filters, 'repliées, police large');
    await restore();

    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expectTargets(page, filters, 'repliées, sombre');
    await setExpanded(filters, true);
    await expectTargets(page, filters, 'dépliées, sombre');
  });

  test('375 px : panneau de filtres, facettes repliées puis dépliées, clair et sombre : axe à 0', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(CHECKED);
    await resultsShown(page);
    await page.getByRole('button', { name: /^Filtres \(\d+\)$/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Filtres' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('checkbox', { name: 'Jeunes adultes' })).toBeChecked();

    await toggles(dialog, false);
    await expectTargets(page, dialog, 'panneau, repliées');
    await setExpanded(dialog, true);
    await expectTargets(page, dialog, 'panneau, dépliées');

    const restore = await withWideFallback(page);
    await expectTargets(page, dialog, 'panneau, dépliées, police large');
    await restore();

    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expectTargets(page, dialog, 'panneau, dépliées, sombre');
    await setExpanded(dialog, false);
    await expectTargets(page, dialog, 'panneau, repliées, sombre');
  });

  // Base sans fiche publiée (CI, seed small) : l'état « aucun résultat » de l'annuaire porte puces,
  // suggestions et lien « Comment fonctionne l'annuaire ? » (16 px de haut avant UX-G2a). Une
  // ville qui n'existe pas donne cet état contre l'API réelle, avec ou sans fiches publiées.
  test('aucun résultat, fiche publique, comment ça marche : aucune cible autonome sous 24 px', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${CHECKED}&ville=Aucune-ville-UX-G2a&modalite=video`);
    await expect(page.locator('.no-results')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const noResults = page.locator('.no-results');
    await expect(
      noResults.getByRole('link', { name: "Comment fonctionne l'annuaire ?" }),
    ).toBeVisible();
    await expect(noResults.getByRole('button').first()).toBeVisible();
    expect(await smallTargetsBeyondRounding(page)).toEqual([]);
    const filters = page.getByRole('complementary', { name: 'Filtres' });
    await expectTargets(page, filters, 'aucun résultat, repliées');
    await setExpanded(filters, true);
    await expectTargets(page, filters, 'aucun résultat, dépliées');
    expect(await smallTargetsBeyondRounding(page)).toEqual([]);

    await page.goto('/fr/comment-ca-marche');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(await smallTargetsBeyondRounding(page)).toEqual([]);

    // Fiche publique : téléphone, e-mail, site et « Ouvrir dans un plan » (16 à 20 px avant).
    await page.goto('/fr/annuaire');
    await resultsShown(page);
    const card = page.locator('pm-practitioner-card').first();
    if (await card.count()) {
      await card.getByRole('link', { name: /^Voir la fiche/ }).click();
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      expect(await smallTargetsBeyondRounding(page)).toEqual([]);
    }
  });
});
