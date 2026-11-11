import { expect, Page, test } from '@playwright/test';

import { expectNoAxeViolations } from '../support/axe';
import { shoot } from '../support/captures';

// UX-D6 à UX-D8 (audit UX du 9 novembre 2026, fiches 08, 09, 24) : annuaire dense et filtres
// repliés en panneau sur mobile, formulaire de la fiche publique, titre de « Comment ça marche ».
// Contre l'API réelle, sans compte : les mesures de l'annuaire se ramènent à 10 fiches quel que soit
// le nombre de fiches publiées ; la fiche publique s'ignore si l'annuaire est vide (seed small sans
// administrateur).

/**
 * Hauteur de la page ramenée à 10 fiches (critère UX-D6), à partir des fiches affichées. Avec 10
 * fiches ou plus, mesure exacte : on retire la place des fiches au-delà de la dixième. Avant UX-G2a,
 * le pas entre les deux premières fiches servait pour toutes : le résultat dépendait de l'ordre des
 * fiches (une fiche courte publiée par un autre e2e en tête donnait 2 453 px au lieu de 2 273).
 * Sous 10 fiches, extrapolation par le plus grand pas observé (hypothèse la plus défavorable).
 */
async function heightForTenCards(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const cards = [...document.querySelectorAll('pm-practitioner-card')].map((card) =>
      card.getBoundingClientRect(),
    );
    if (cards.length < 2) return null;
    const total = document.documentElement.scrollHeight;
    if (cards.length >= 10) {
      return Math.round(total - (cards[cards.length - 1].bottom - cards[9].bottom));
    }
    const stride = Math.max(...cards.slice(1).map((card, i) => card.top - cards[i].top));
    return Math.round(total + (10 - cards.length) * stride);
  });
}

/** Réponse de l'annuaire affichée : des fiches ou « aucun résultat », sans voile de rechargement. */
async function resultsShown(page: Page): Promise<void> {
  await expect(page.locator('pm-practitioner-card, .no-results').first()).toBeVisible();
  await expect(page.locator('.cards.refreshing')).toHaveCount(0);
}

async function noHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe('annuaire (UX-D6)', () => {
  test('annuaire mobile : bouton Filtres, panneau modal, focus piégé, Échap, résultats', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/fr/annuaire');
    await resultsShown(page);
    await noHorizontalScroll(page);

    const toggle = page.getByRole('button', { name: /^Filtres \(\d+\)$/ });
    const filters = page.getByRole('complementary', { name: 'Filtres' });
    await expect(toggle).toHaveText('Filtres (0)');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(filters).toBeHidden();

    // Ouverture : dialogue modal nommé « Filtres », qui reçoit le focus.
    await toggle.click();
    const dialog = page.getByRole('dialog', { name: 'Filtres' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toBeFocused();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const box = await dialog.boundingBox();
    expect(box?.width).toBe(375);
    await expectNoAxeViolations(page);
    await shoot(page, 'ux-d6-annuaire-375-filtres', false);

    // Défilement retenu : en bas du panneau, la molette ne fait pas défiler la page derrière.
    await expect(dialog).toHaveCSS('overscroll-behavior-y', 'contain');
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe(
      'hidden',
    );
    const pageScroll = await page.evaluate(() => window.scrollY);
    await dialog.hover();
    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 600);
    await expect
      .poll(() => dialog.evaluate((el) => el.scrollTop + el.clientHeight >= el.scrollHeight - 1))
      .toBe(true);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.scrollY)).toBe(pageScroll);

    // Focus piégé : 40 tabulations restent dans le panneau.
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }

    // Échap : panneau fermé, focus rendu au bouton.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(toggle).toBeFocused();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    // Une case cochée dans le panneau : l'URL suit, le compteur du bouton aussi ; « Voir … » ferme.
    await toggle.click();
    await dialog.getByRole('checkbox', { name: /Accepte de nouveaux patients/ }).check();
    await expect(page).toHaveURL(/accepte=oui/);
    await dialog.getByRole('button', { name: /^(Voir|Aucun résultat)/ }).click();
    await expect(dialog).toBeHidden();
    await expect(toggle).toHaveText('Filtres (1)');
    await expect(toggle).toBeFocused();

    // La croix ferme aussi.
    await toggle.click();
    await dialog.getByRole('button', { name: 'Fermer les filtres' }).click();
    await expect(dialog).toBeHidden();
    // Liste rafraîchie (plus de voile de rechargement) avant de mesurer les contrastes.
    await expect(page.locator('.cards.refreshing')).toHaveCount(0);
    await resultsShown(page);
    await noHorizontalScroll(page);
    await expectNoAxeViolations(page);
  });

  test('annuaire mobile : filtres en panneau, thème sombre, axe sans violation', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/fr/annuaire');
    await resultsShown(page);
    await page.getByRole('button', { name: /^Filtres \(\d+\)$/ }).click();
    await expect(page.getByRole('dialog', { name: 'Filtres' })).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('1440 px : une colonne de filtres, « Tout effacer », densité (≤ 2 400 px pour 10 fiches)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/fr/annuaire');
    await resultsShown(page);
    const filters = page.getByRole('complementary', { name: 'Filtres' });
    await expect(filters.getByRole('heading', { name: 'Filtres' })).toBeVisible();
    await expect(filters.getByRole('button', { name: 'Tout effacer' })).toBeDisabled();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Filtres \(\d+\)$/ })).toBeHidden();

    // Langues : seules les valeurs présentes, les autres repliées (« Autres langues (n) »).
    const others = filters.getByRole('button', { name: /^Autres langues \(\d+\)$/ });
    if (await others.count()) {
      await expect(others).toHaveAttribute('aria-expanded', 'false');
      const before = await filters.getByRole('checkbox').count();
      await others.click();
      await expect(others).toHaveAttribute('aria-expanded', 'true');
      expect(await filters.getByRole('checkbox').count()).toBeGreaterThan(before);
      await others.click();
    }

    const cards = page.locator('pm-practitioner-card');
    if (await cards.count()) {
      // Une seule puce de disponibilité par fiche, sur la ligne d'identité.
      const first = cards.first();
      expect(await first.locator('.availability').count()).toBeLessThanOrEqual(1);
      const height = await heightForTenCards(page);
      if (height !== null) expect(height).toBeLessThanOrEqual(2400);
    }
    await noHorizontalScroll(page);
    await expectNoAxeViolations(page);
    await shoot(page, 'ux-d6-annuaire-1440');

    await page.emulateMedia({ colorScheme: 'dark' });
    await expectNoAxeViolations(page);
  });

  test('375 px : pas de défilement horizontal, ≤ 3 600 px pour 10 fiches (extrait et avatar gardés)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/fr/annuaire');
    await resultsShown(page);
    await noHorizontalScroll(page);
    const height = await heightForTenCards(page);
    if (height !== null) expect(height).toBeLessThanOrEqual(3600);
    const card = page.locator('pm-practitioner-card').first();
    if (await card.count()) {
      // Mobile : avatar et extrait gardés, extrait limité à 2 lignes (texte complet dans le DOM).
      await expect(card.getByRole('img', { name: /^Photo de / })).toBeVisible();
      const excerpt = card.locator('.excerpt');
      await expect(excerpt).toBeVisible();
      const lines = await excerpt.evaluate(
        (el) => el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight),
      );
      expect(Math.round(lines)).toBeLessThanOrEqual(2);
    }
    await shoot(page, 'ux-d6-annuaire-375');
  });
});

test.describe('largeur de l’annuaire par la route (UX-A9c)', () => {
  /** Largeur du `<main>` du layout public et de la page qu'il contient. */
  async function widths(page: Page): Promise<{ main: number; page: number }> {
    return page.evaluate(() => {
      const main = document.querySelector('main#main')!;
      const host = [...main.children].find((el) => el.tagName.endsWith('-PAGE'))!;
      return {
        main: Math.round(main.getBoundingClientRect().width),
        page: Math.round(host.getBoundingClientRect().width),
      };
    });
  }

  test('annuaire à 1 280 px par data.contentWidth, sans marge négative ; autres pages inchangées', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/fr/annuaire');
    await resultsShown(page);
    // Le layout porte la largeur ; la page remplit son conteneur, sans en déborder.
    expect(await widths(page)).toEqual({ main: 1328, page: 1280 });
    await expect(page.locator('pm-directory-page')).toHaveCSS('margin-left', '0px');
    const chip = page.locator('pm-practitioner-card .availability').first();
    if (await chip.count()) {
      // Puce de disponibilité sur une ligne (12 px × 1,4 + marges : moins de deux lignes).
      const box = await chip.boundingBox();
      expect(box!.height).toBeLessThan(2 * 12 * 1.4);
    }

    // Comment ça marche et la fiche publique gardent la largeur par défaut (1 120 px).
    await page.goto('/fr/comment-ca-marche');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await widths(page)).toEqual({ main: 1120, page: 1072 });

    await page.goto('/fr/annuaire');
    await resultsShown(page);
    const card = page.locator('pm-practitioner-card').first();
    if (await card.count()) {
      await card.getByRole('link', { name: /^Voir la fiche/ }).click();
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(await widths(page)).toEqual({ main: 1120, page: 1072 });
    }
  });

  for (const width of [1072, 1120, 1152, 1200, 1250, 1300, 1328, 1360, 1400]) {
    test(`annuaire à ${width} px : pas de défilement horizontal`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/fr/annuaire');
      await resultsShown(page);
      await noHorizontalScroll(page);
      const { main, page: inner } = await widths(page);
      expect(main).toBeLessThanOrEqual(width);
      expect(inner).toBe(main - 48);
    });
  }
});

test.describe('fiche publique (UX-D7)', () => {
  test('libellés au-dessus, compteur à droite de l’aide, lien vers la confidentialité', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/fr/annuaire');
    await resultsShown(page);
    const card = page.locator('pm-practitioner-card').first();
    test.skip((await card.count()) === 0, 'aucune fiche publiée dans le seed (administrateur e2e)');
    await card.getByRole('link', { name: /^Voir la fiche/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const contact = page.locator('#contact');
    for (const name of ['Votre nom', 'Votre e-mail']) {
      const field = contact.getByLabel(name, { exact: true });
      const label = contact.locator('label', { hasText: name });
      const [labelBox, fieldBox] = [await label.boundingBox(), await field.boundingBox()];
      expect(labelBox!.y + labelBox!.height).toBeLessThanOrEqual(fieldBox!.y);
    }
    await expect(contact.getByRole('combobox', { name: 'Objet' })).toBeVisible();

    // Aide et compteur sur la même ligne, compteur à droite.
    const help = contact.locator('mat-hint.help');
    const counter = contact.locator('mat-hint.length');
    await expect(counter).toHaveText('0 / 4000');
    const [helpBox, counterBox] = [await help.boundingBox(), await counter.boundingBox()];
    expect(Math.abs(helpBox!.y - counterBox!.y)).toBeLessThanOrEqual(2);
    expect(counterBox!.x).toBeGreaterThan(helpBox!.x + helpBox!.width);
    // Le compteur tient sur une ligne (une seule boîte de texte).
    const counterLines = await counter.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
    });
    expect(counterLines).toBe(1);

    const privacy = contact.getByRole('link', { name: /En savoir plus sur la protection/ });
    await expect(privacy).toHaveAttribute('href', '/fr/confidentialite');
    await expect(privacy).toHaveAttribute('target', '_blank');
    await expectNoAxeViolations(page);
    await shoot(page, 'ux-d7-fiche-1440');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expectNoAxeViolations(page);
  });
});

test.describe('comment ça marche (UX-D8)', () => {
  test('titre de 36 px, 4 px sous le surtitre, 20 px au-dessus du paragraphe ; FAQ à 12 px', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/fr/comment-ca-marche');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('details summary').first()).toBeVisible();
    const metrics = await page.evaluate(() => {
      const h1 = document.querySelector('h1')!;
      const eyebrow = document.querySelector('.eyebrow')!;
      const lead = document.querySelector('.hero .lead')!;
      const summary = document.querySelector('details summary')!;
      const box = (el: Element) => el.getBoundingClientRect();
      return {
        size: getComputedStyle(h1).fontSize,
        above: Math.round(box(h1).top - box(eyebrow).bottom),
        below: Math.round(box(lead).top - box(h1).bottom),
        summaryPadding: [
          getComputedStyle(summary).paddingTop,
          getComputedStyle(summary).paddingBottom,
        ],
        summaryHeight: box(summary).height,
      };
    });
    expect(metrics.size).toBe('36px');
    expect(metrics.above).toBe(4);
    expect(metrics.below).toBe(20);
    expect(metrics.summaryPadding).toEqual(['12px', '12px']);
    expect(metrics.summaryHeight).toBeGreaterThanOrEqual(24);
    await expectNoAxeViolations(page);
    await shoot(page, 'ux-d8-comment-ca-marche-1440');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expectNoAxeViolations(page);
  });
});
