import { expect, Page, test } from '@playwright/test';

import { adminApi, shareSession } from '../flux-10-admin/helpers';
import { createAccount, signIn } from '../preferences/accounts';
import { ADMIN_AVAILABLE, ADMIN_MISSING } from '../support/admin';
import { expectNoAxeViolations } from '../support/axe';
import { shoot } from '../support/captures';

// M16-09, socle visuel de l'arabe (G Q71, Q74 à Q77 ; docs/design/arabe.md §1 à §4, §9) : coquilles
// publique, praticien et d'administration, panneau latéral, boîte de confirmation et planche d'états
// (/_demo) en /ar/, de droite à gauche, sans défilement horizontal, axe-core sans violation, captures
// en clair et en sombre (PSYMATE_E2E_CAPTURES). Police : IBM Plex Sans Arabic pour l'écriture arabe
// seulement, jamais téléchargée en /fr/. Aucun libellé ciblé (rôles, structure, URL) : les textes de
// /ar/ passent du français de repli à l'arabe au fil du jalon. Contre l'API locale pour les écrans
// connectés (seed small, Mailpit), jamais de mock du backend.

const THEMES = ['light', 'dark'] as const;
const PLEX = /IBMPlexSansArabic/i;
/** Échantillon arabe posé dans la page : les textes de /ar/ sont encore le français de repli. */
const ARABIC_SAMPLE = 'متابعة الجلسة';

/** <html lang="ar" dir="rtl">, aucun défilement horizontal, axe-core sans violation. */
async function expectRtlPage(page: Page): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.evaluate(() => document.fonts.ready);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'défilement horizontal').toBeLessThanOrEqual(0);
  await expectNoAxeViolations(page);
}

/** Thème du système (préférence « système » par défaut), vérifié sur <html data-theme>. */
async function useTheme(page: Page, theme: (typeof THEMES)[number]): Promise<void> {
  await page.emulateMedia({ colorScheme: theme });
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

/** Boîte d'un élément, rendue. */
async function boxOf(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox();
  expect(box, `${selector} rendu`).not.toBeNull();
  return box!;
}

test.describe('police arabe (Q76)', () => {
  test('/fr/ : aucun fichier de police arabe demandé, --font-ui inchangé', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (request) => {
      if (PLEX.test(request.url())) requests.push(request.url());
    });
    await page.goto('/fr/comment-ca-marche');
    await expect(page.locator('main h1')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const family = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(family).toMatch(/^Inter\b/);
    expect(family).not.toContain('IBM Plex Sans Arabic');
    expect(requests).toEqual([]);
  });

  test('/ar/ : IBM Plex Sans Arabic chargée pour l’arabe, le latin reste dans la police du thème', async ({
    page,
  }) => {
    const requests: string[] = [];
    page.on('request', (request) => {
      if (PLEX.test(request.url())) requests.push(request.url());
    });
    await page.goto('/ar/comment-ca-marche');
    await expect(page.locator('main h1')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    const result = await page.evaluate(async (sample) => {
      const probe = (text: string, family?: string) => {
        const span = document.createElement('span');
        span.textContent = text;
        span.style.whiteSpace = 'nowrap';
        if (family) span.style.fontFamily = family;
        document.querySelector('main')!.append(span);
        return span;
      };
      const arabic = probe(sample);
      await document.fonts.ready;
      // Pile du thème sans la police arabe (celle de /fr/ et /en/).
      const latinStack = getComputedStyle(document.body).fontFamily.split(',').slice(1).join(',');
      const width = (text: string, family?: string) => {
        const span = probe(text, family);
        const value = span.getBoundingClientRect().width;
        span.remove();
        return value;
      };
      const faces = [...document.fonts].filter((face) =>
        face.family.includes('IBM Plex Sans Arabic'),
      );
      /** La face couvre-t-elle ce caractère (unicode-range « U+600-6FF, U+750-77F… ») ? */
      const covers = (face: FontFace, char: string) =>
        face.unicodeRange.split(',').some((range) => {
          const [start, end = start] = range.trim().replace(/^U\+/i, '').split('-');
          const code = char.codePointAt(0)!;
          return code >= parseInt(start, 16) && code <= parseInt(end, 16);
        });
      return {
        coversArabic: faces.length > 0 && faces.every((face) => covers(face, 'ا')),
        coversLatinOrDigit: faces.some((face) => [...'Aaz09é'].some((c) => covers(face, c))),
        family: getComputedStyle(arabic).fontFamily,
        loaded: faces.filter((face) => face.status === 'loaded').map((face) => face.weight),
        latinStack,
        arabicWidth: width(sample),
        arabicWidthLatinStack: width(sample, latinStack),
        latinWidth: width('PsyMate 2026, Claire Martin'),
        latinWidthLatinStack: width('PsyMate 2026, Claire Martin', latinStack),
      };
    }, ARABIC_SAMPLE);

    expect(result.family).toMatch(/^"?IBM Plex Sans Arabic"?, Inter\b/);
    expect(result.latinStack.trim()).toMatch(/^Inter\b/);
    expect(result.loaded).toContain('400');
    // unicode-range : l'écriture arabe seulement (ni lettres latines, ni chiffres).
    expect(result.coversArabic).toBe(true);
    expect(result.coversLatinOrDigit).toBe(false);
    // Appliquée : l'arabe change de rendu, le latin non.
    expect(result.arabicWidth).not.toBe(result.arabicWidthLatinStack);
    expect(result.latinWidth).toBe(result.latinWidthLatinStack);
    expect(requests.some((url) => /IBMPlexSansArabic-Regular/.test(url))).toBe(true);
    expect(requests.every((url) => new URL(url).pathname.startsWith('/ar/'))).toBe(true);
  });

  test('/ar/ : typographie arabe (pas d’interlettrage, de capitales forcées ni d’italique)', async ({
    page,
  }) => {
    await page.goto('/ar/_demo');
    await expect(page.locator('main h1, h1').first()).toBeVisible();
    const styles = await page.evaluate(() => {
      const el = document.createElement('em');
      el.style.cssText = 'letter-spacing: 0.12em; text-transform: uppercase; font-style: italic';
      el.textContent = 'الحالة';
      document.body.append(el);
      const cs = getComputedStyle(el);
      return {
        letterSpacing: cs.letterSpacing,
        textTransform: cs.textTransform,
        fontStyle: cs.fontStyle,
        tag: getComputedStyle(document.querySelector('pm-admin-bar .tag')!).fontFamily,
      };
    });
    expect(styles).toMatchObject({
      letterSpacing: 'normal',
      textTransform: 'none',
      fontStyle: 'normal',
    });
    // Étiquette à lettres en chasse fixe (--font-mono-text) : police d'interface en arabe.
    expect(styles.tag).toMatch(/^"?IBM Plex Sans Arabic"?/);
  });
});

test('icône de direction : .pm-flip-rtl retournée en /ar/, intacte en /fr/', async ({ page }) => {
  for (const [locale, transform] of [
    ['ar', 'matrix(-1, 0, 0, 1, 0, 0)'],
    ['fr', 'none'],
  ] as const) {
    await page.goto(`/${locale}/_demo`);
    await expect(page.locator('pm-admin-bar')).toBeVisible();
    const value = await page.evaluate(() => {
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      icon.classList.add('pm-flip-rtl');
      document.querySelector('main, body')!.append(icon);
      return getComputedStyle(icon).transform;
    });
    expect(value, locale).toBe(transform);
  }
});

test.describe('planche d’états /_demo en /ar/', () => {
  for (const theme of THEMES) {
    test(`page entière, thème ${theme}`, async ({ page }) => {
      await page.goto('/ar/_demo');
      await useTheme(page, theme);
      await expect(page.locator('pm-admin-bar')).toBeVisible();
      await expectRtlPage(page);
      // Barre d'administration de la planche : la marque au début de la ligne, donc à droite.
      const bar = await boxOf(page, 'pm-admin-bar header');
      const brand = await boxOf(page, 'pm-admin-bar .brand');
      expect(brand.x + brand.width).toBeGreaterThan(bar.x + bar.width - 40);
      await shoot(page, `arabe-socle-planche-${theme}`);
    });

    test(`panneau latéral et boîte de confirmation, thème ${theme}`, async ({ page }) => {
      await page.goto('/ar/_demo');
      await useTheme(page, theme);
      const viewport = page.viewportSize()!;

      await page.locator('button.open-panel').click();
      const pane = page.locator('.pm-side-panel-pane');
      await expect(page.getByRole('dialog')).toBeVisible();
      // Ancré à la fin de ligne : à gauche en arabe.
      const box = await boxOf(page, '.pm-side-panel-pane');
      expect(box.x).toBe(0);
      expect(box.width).toBeLessThan(viewport.width);
      // L'ombre tombe sur la page, à droite du panneau.
      await expect(pane).toHaveCSS('box-shadow', /\) 8px 0px 32px/);
      // Croix en haut, du côté de la fin de ligne (à gauche).
      const close = await boxOf(page, 'pm-side-panel .close');
      expect(close.x).toBeLessThan(box.x + box.width / 2);
      await expectNoAxeViolations(page);
      await shoot(page, `arabe-socle-panneau-${theme}`, false);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);

      await page.locator('button.confirm-word').click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('textbox')).toBeFocused();
      await expect(dialog.locator('h2')).toHaveAttribute('dir', 'auto');
      await expect(dialog.getByRole('textbox')).toHaveAttribute('dir', 'auto');
      await expectNoAxeViolations(page);
      await shoot(page, `arabe-socle-confirmation-${theme}`, false);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
    });
  }
});

test.describe('coquille publique en /ar/', () => {
  for (const theme of THEMES) {
    test(`en-tête, pied et page, thème ${theme}`, async ({ page }) => {
      await page.goto('/ar/comment-ca-marche');
      await useTheme(page, theme);
      await expect(page.locator('main h1')).toBeVisible();
      await expectRtlPage(page);
      // La marque au début de la ligne (à droite), les liens après elle (à sa gauche).
      const brand = await boxOf(page, 'pm-public-header .brand');
      const links = await boxOf(page, 'pm-public-header .links');
      expect(links.x + links.width).toBeLessThanOrEqual(brand.x);
      await shoot(page, `arabe-socle-public-${theme}`);
    });
  }

  test('375 px : rien ne déborde', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/ar/comment-ca-marche');
    await expect(page.locator('main h1')).toBeVisible();
    await expectRtlPage(page);
    await shoot(page, 'arabe-socle-public-375');
  });
});

test.describe('coquille praticien en /ar/', () => {
  test.describe.configure({ timeout: 90_000 });

  for (const theme of THEMES) {
    test(`barre d'application et rail, thème ${theme}`, async ({ page, request }) => {
      const account = await createAccount(request, `m16-09.coquille.${theme}`, 'psychologist');
      // Connexion en /fr/ (libellés connus), puis /ar/ : une session déjà ouverte garde le bundle
      // de l'URL (PreferencesStore).
      await signIn(page, account);
      await page.goto('/ar/patients');
      await expect(page).toHaveURL(/\/ar\/patients$/);
      await useTheme(page, theme);
      await expect(page.locator('pm-app-bar header')).toBeVisible();
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 20_000 });
      await expectRtlPage(page);

      const viewport = page.viewportSize()!;
      // Rail de navigation à droite, la page à sa gauche.
      const rail = await boxOf(page, 'pm-nav-rail.app-rail nav');
      expect(rail.x + rail.width).toBeCloseTo(viewport.width, 0);
      const main = await boxOf(page, 'main#main');
      expect(main.x + main.width).toBeLessThanOrEqual(rail.x + 1);
      // Marque à droite, avatar à gauche.
      const brand = await boxOf(page, 'pm-app-bar .brand');
      const avatar = await boxOf(page, 'pm-app-bar .avatar');
      expect(avatar.x).toBeLessThan(brand.x);
      await shoot(page, `arabe-socle-praticien-${theme}`);

      // Le rail déplié passe par-dessus la page, vers la gauche.
      await page.locator('pm-nav-rail.app-rail a.item').first().focus();
      await expect(page.locator('pm-nav-rail.app-rail nav.expanded')).toBeVisible();
      const expanded = await boxOf(page, 'pm-nav-rail.app-rail nav');
      expect(expanded.x + expanded.width).toBeCloseTo(viewport.width, 0);
      expect(expanded.width).toBeGreaterThan(rail.width);
      await page.keyboard.press('Escape');
    });
  }

  test('375 px : tiroir de navigation à droite, rien ne déborde', async ({ page, request }) => {
    const account = await createAccount(request, 'm16-09.tiroir', 'psychologist');
    await signIn(page, account);
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/ar/patients');
    await expect(page.locator('pm-app-bar header')).toBeVisible();
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 20_000 });
    await expectRtlPage(page);
    await page.locator('pm-app-bar button.menu').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    const pane = await boxOf(page, '.pm-nav-drawer-pane');
    expect(pane.x + pane.width).toBeCloseTo(375, 0);
    await expectNoAxeViolations(page);
    await shoot(page, 'arabe-socle-tiroir-375', false);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

test.describe('barre d’administration en /ar/', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });
  test.skip(!ADMIN_AVAILABLE, ADMIN_MISSING);

  test('validation, clair et sombre', async ({ page, context }) => {
    const admin = await adminApi();
    try {
      await shareSession(admin, context);
      await page.goto('/ar/admin/validation');
      await expect(page.locator('pm-admin-bar header')).toBeVisible();
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 20_000 });
      for (const theme of THEMES) {
        await useTheme(page, theme);
        await expectRtlPage(page);
        const bar = await boxOf(page, 'pm-admin-bar header');
        const brand = await boxOf(page, 'pm-admin-bar .brand');
        expect(brand.x + brand.width).toBeGreaterThan(bar.x + bar.width - 40);
        await shoot(page, `arabe-socle-admin-${theme}`);
      }
    } finally {
      await admin.dispose();
    }
  });
});
