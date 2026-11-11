import { expect, Page, test } from '@playwright/test';

import { confirmEmail, enableTwoFactor, register, SEED } from '../support/accounts';
import { expectNoAxeViolations } from '../support/axe';
import { totp, totpStep } from '../support/totp';

// UX-D1bis (décision du 11 novembre 2026) : la connexion reprend la maquette 11 en deux panneaux,
// sans le bandeau ni le pied du layout public. Panneau gauche blanc à bordure droite (logo,
// accroche, sous-titre, aperçu décoratif, pied hébergement et liens), panneau droit sur le fond de
// page avec la carte formulaire de 420 px ; sous 900 px les panneaux s'empilent et le panneau
// gauche se réduit au logo et à l'accroche (fiche 11). Mesures prises sur 11-connexion.html :
// 690 / 750 px à 1 440 px, carte 420 px, rayon 14 px, champs 44 px, bouton 46 px. axe-core à 0 en
// clair et en sombre, aucun débordement à 390 et 375 px. Contre l'API locale (seed small), jamais
// de mock du backend.

const TAGLINE = 'Le fil de vos patients, séance après séance.';

async function open(page: Page): Promise<void> {
  await page.goto('/fr/connexion');
  await expect(page.getByRole('heading', { level: 2, name: 'Connexion' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

/** Couleur calculée d'un token (`var(--x)`) dans le thème courant. */
async function token(page: Page, name: string): Promise<string> {
  return page.evaluate((variable) => {
    const probe = document.createElement('div');
    probe.style.backgroundColor = `var(${variable})`;
    document.body.append(probe);
    const color = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return color;
  }, name);
}

async function background(page: Page, selector: string): Promise<string> {
  return page.locator(selector).evaluate((el) => getComputedStyle(el).backgroundColor);
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test.describe('1440 × 900', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('deux panneaux : largeurs, ordre, carte de 420 px, sans bandeau ni pied public', async ({
    page,
  }) => {
    await open(page);

    // Ni bandeau, ni pied, ni barre : l'habillage nu. Un seul <main id="main">, celui de la coquille
    // (UX-A10c) : la page en est l'enfant et n'en pose pas.
    await expect(page.locator('pm-public-header, pm-public-footer, pm-app-bar')).toHaveCount(0);
    await expect(page.getByRole('main')).toHaveCount(1);
    await expect(page.locator('#main')).toHaveCount(1);
    await expect(page.locator('pm-root > main#main pm-login-page')).toHaveCount(1);
    await expect(page.locator('pm-login-page main, pm-login-page [role="main"]')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'English' })).toHaveCount(0);

    // La page remplit la fenêtre de 1 440 × 900, sans défilement (ni vertical ni horizontal).
    const scroll = await page.evaluate(() => ({
      height: document.documentElement.scrollHeight - window.innerHeight,
      width: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    expect(scroll).toEqual({ height: 0, width: 0 });
    const host = (await page.locator('pm-login-page').boundingBox())!;
    expect(host.y).toBe(0);
    expect(host.height).toBe(900);

    const brand = (await page.locator('.brand-panel').boundingBox())!;
    const form = (await page.locator('.form-panel').boundingBox())!;
    const foot = (await page.locator('.panel-foot').boundingBox())!;
    const card = (await page.locator('.login-card').boundingBox())!;

    // Proportions de la maquette : flex 1 1 420px et 1 1 480px → 690 + 750 px à 1 440 px.
    expect(brand.x).toBe(0);
    expect(Math.abs(brand.width - 690)).toBeLessThanOrEqual(1);
    expect(Math.abs(form.x - 690)).toBeLessThanOrEqual(1);
    expect(Math.abs(form.width - 750)).toBeLessThanOrEqual(1);
    // Les panneaux couvrent toute la hauteur de la fenêtre.
    expect(form.y).toBe(0);
    expect(form.height).toBeGreaterThanOrEqual(900);
    // Pied en bas de la colonne gauche, sur la même largeur.
    expect(foot.x).toBe(0);
    expect(Math.abs(foot.width - brand.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(foot.y - (brand.y + brand.height))).toBeLessThanOrEqual(1);
    expect(foot.y + foot.height).toBeGreaterThanOrEqual(899);

    // Carte formulaire : 420 px, centrée dans le panneau droit, rayon 14 px, bordure 1 px.
    expect(card.width).toBe(420);
    expect(Math.abs(card.x + card.width / 2 - (form.x + form.width / 2))).toBeLessThanOrEqual(1);
    expect(Math.abs(card.y + card.height / 2 - (form.y + form.height / 2))).toBeLessThanOrEqual(1);
    const cardStyle = await page.locator('.login-card').evaluate((el) => {
      const style = getComputedStyle(el);
      return { radius: style.borderTopLeftRadius, border: style.borderTopWidth };
    });
    expect(cardStyle).toEqual({ radius: '14px', border: '1px' });

    // Ordre de lecture : logo, accroche (h1), sous-titre, aperçu, puis la carte, puis le pied.
    const tagline = page.getByRole('heading', { level: 1, name: TAGLINE });
    await expect(tagline).toBeVisible();
    await expect(page.locator('.logo')).toHaveText('PsyMate');
    await expect(page.locator('.pitch-text')).toBeVisible();
    await expect(page.locator('.preview')).toBeVisible();
    await expect(page.locator('.preview')).toHaveAttribute('aria-hidden', 'true');
    const order = await page.evaluate(() =>
      [...document.querySelector('.login')!.children].map((child) => child.className),
    );
    expect(order).toEqual(['brand-panel', 'form-panel', 'panel-foot']);
    const logo = (await page.locator('.logo').boundingBox())!;
    const h1 = (await tagline.boundingBox())!;
    const preview = (await page.locator('.preview').boundingBox())!;
    expect(logo.y).toBeLessThan(h1.y);
    expect(h1.y + h1.height).toBeLessThan(preview.y);
    expect(preview.y + preview.height).toBeLessThan(foot.y);
    // Accroche centrée entre le logo et le pied (justify-content: space-between de la maquette).
    const pitch = (await page.locator('.pitch').boundingBox())!;
    const above = pitch.y - (logo.y + logo.height);
    const below = foot.y - (pitch.y + pitch.height);
    expect(Math.abs(above - below)).toBeLessThanOrEqual(42);

    // Couleurs par tokens : panneau gauche et carte sur surface-raised, panneau droit sur le fond.
    const raised = await token(page, '--surface-raised');
    expect(await background(page, '.brand-panel')).toBe(raised);
    expect(await background(page, '.panel-foot')).toBe(raised);
    expect(await background(page, '.login-card')).toBe(raised);
    expect(await background(page, '.login')).toBe(await token(page, '--surface-ground'));

    // Champs 44 px (cadre du mot de passe compris), bouton 46 px.
    expect((await page.getByLabel('E-mail professionnel').boundingBox())!.height).toBe(44);
    expect((await page.locator('.password').boundingBox())!.height).toBe(44);
    expect((await page.getByRole('button', { name: 'Se connecter' }).boundingBox())!.height).toBe(
      46,
    );

    // Liens du pied : confidentialité, mentions légales, annuaire public.
    const links = page.locator('.panel-foot').getByRole('link');
    await expect(links).toHaveText(['Confidentialité', 'Mentions légales', 'Annuaire public']);
    await expectNoAxeViolations(page);
  });

  test('clair et sombre : axe-core à 0, mêmes tokens, aperçu décoratif masqué', async ({
    page,
  }) => {
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await open(page);
      await expect(page.locator('html')).toHaveAttribute('data-theme', scheme);
      expect(await background(page, '.brand-panel')).toBe(await token(page, '--surface-raised'));
      expect(await background(page, '.login')).toBe(await token(page, '--surface-ground'));
      expect(await background(page, '.logo-mark')).toBe(await token(page, '--primary'));
      await expect(page.getByRole('img')).toHaveCount(0);
      await expectNoAxeViolations(page);
    }
  });

  test('code de vérification (2FA) dans la carte, en clair et en sombre', async ({
    page,
    request,
  }, testInfo) => {
    const account = await register(request, 'ux-d1bis.otp');
    await confirmEmail(request, account.email);
    await enableTwoFactor(request, (s) => {
      const step = totpStep();
      return { value: totp(s, step), step };
    });

    await page.emulateMedia({ colorScheme: 'dark' });
    await open(page);
    await page.getByLabel('E-mail professionnel').fill(account.email);
    await page.getByLabel('Mot de passe', { exact: true }).fill(account.password);
    await page.getByRole('button', { name: 'Se connecter' }).click();

    const code = page.getByLabel('Code de vérification');
    await expect(code).toBeFocused();
    await expect(code).toHaveAttribute('placeholder', '000 000');
    await expect(page.locator('#login-otp-hint')).toContainText(
      "Six chiffres de votre application d'authentification.",
    );
    const block = (await page.locator('.otp').boundingBox())!;
    const card = (await page.locator('.login-card').boundingBox())!;
    expect(block.x).toBeGreaterThan(card.x);
    expect(block.x + block.width).toBeLessThan(card.x + card.width);
    expect((await code.boundingBox())!.height).toBe(44);
    await expectNoAxeViolations(page);
    await page.screenshot({ path: testInfo.outputPath('11-connexion-code--1440-dark.png') });

    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expectNoAxeViolations(page);
    await page.screenshot({ path: testInfo.outputPath('11-connexion-code--1440-light.png') });
  });
});

for (const width of [390, 375]) {
  test(`${width} px : panneaux empilés, panneau gauche réduit au logo et à l’accroche`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await open(page);

      const brand = (await page.locator('.brand-panel').boundingBox())!;
      const card = (await page.locator('.login-card').boundingBox())!;
      const foot = (await page.locator('.panel-foot').boundingBox())!;
      // Empilés, pleine largeur : identité, puis carte, puis pied.
      expect(brand.x).toBe(0);
      expect(brand.y).toBe(0);
      expect(Math.abs(brand.width - width)).toBeLessThanOrEqual(1);
      expect(card.y).toBeGreaterThanOrEqual(brand.y + brand.height);
      expect(foot.y).toBeGreaterThanOrEqual(card.y + card.height);
      // Carte : 24 px de chaque côté, comme la maquette.
      expect(Math.abs(card.x - 24)).toBeLessThanOrEqual(1);
      expect(Math.abs(card.width - (width - 48))).toBeLessThanOrEqual(1);

      // Panneau gauche réduit : logo et accroche, sans sous-titre ni aperçu.
      await expect(page.locator('.logo')).toBeVisible();
      await expect(page.getByRole('heading', { level: 1, name: TAGLINE })).toBeVisible();
      await expect(page.locator('.pitch-text')).toBeHidden();
      await expect(page.locator('.preview')).toBeHidden();
      // Hébergement et liens restent accessibles, sous la carte.
      await expect(page.getByText(/Données hébergées en France/)).toBeVisible();
      await expect(page.getByRole('link', { name: 'Mentions légales' })).toBeVisible();

      expect(await horizontalOverflow(page), `débordement à ${width} px (${scheme})`).toBe(0);
      await expectNoAxeViolations(page);
    }
  });
}

test.describe('zoom 200 %', () => {
  // Comme e2e/accessibilite/zoom-200 : fenêtre de référence 1 280 × 720 vue à 200 %.
  test.use({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 2 });

  test('640 × 360, DPR 2 : empilé, sans débordement, connexion au clavier', async ({ page }) => {
    await open(page);
    expect(await horizontalOverflow(page)).toBe(0);
    const brand = (await page.locator('.brand-panel').boundingBox())!;
    const card = (await page.locator('.login-card').boundingBox())!;
    expect(card.y).toBeGreaterThanOrEqual(brand.y + brand.height);
    // Tout le contenu de la carte tient dans sa largeur.
    const clipped = await page.locator('.login-card').evaluate((el) => {
      const box = el.getBoundingClientRect();
      return [...el.querySelectorAll('label, input, button, a, p, h2')]
        .map((node) => node.getBoundingClientRect())
        .filter((rect) => rect.width > 0 && (rect.left < box.left || rect.right > box.right))
        .length;
    });
    expect(clipped).toBe(0);

    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Créer un compte' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('E-mail professionnel')).toBeFocused();
    await page.keyboard.type(SEED.claire.email);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Mot de passe oublié ?' })).toBeFocused();
    await page.keyboard.press('Tab');
    await page.keyboard.type(SEED.claire.password);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/fr\/patients$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Mes patients' })).toBeVisible();
    await expectNoAxeViolations(page);
  });
});
