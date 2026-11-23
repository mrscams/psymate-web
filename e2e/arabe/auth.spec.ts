import {
  APIRequestContext,
  expect,
  Locator,
  Page,
  request as playwrightRequest,
  test,
} from '@playwright/test';

import { confirmEmail, enableTwoFactor, register, TestAccount } from '../support/accounts';
import { expectNoAxeViolations } from '../support/axe';
import { shoot } from '../support/captures';
import { totp, totpStep } from '../support/totp';

// M16-10, features/auth de droite à gauche (G Q71, Q74 à Q77 ; docs/design/arabe.md §2, §3, §5,
// §9) : connexion, double authentification, inscription, mot de passe oublié et nouveau mot de
// passe (lien valable et lien expiré), confirmation d'e-mail (en attente et lien expiré), première
// connexion et compte suspendu, en /ar/, en largeur de bureau et de téléphone. dir="rtl", pas de
// défilement horizontal, axe-core sans violation, une capture par écran (PSYMATE_E2E_CAPTURES).
// Le rendu est mesuré, pas seulement les attributs : côté des panneaux, direction calculée et
// position de l'encre d'un champ dans sa capture (alignement du côté de début de la page, ordre de
// frappe d'un code). Aucun libellé ciblé (rôles, structure, URL) : les textes de /ar/ passent du
// français de repli à l'arabe au fil du jalon. Les pages d'avant connexion s'ouvrent sans session ;
// la double authentification passe par l'API locale (seed small, Mailpit), jamais de mock.

const WIDTHS = [
  { name: 'bureau', width: 1440, height: 900 },
  { name: 'telephone', width: 375, height: 812 },
] as const;

/** Les pages d'avant connexion de la feature : nom de capture et adresse. */
const PAGES = [
  { name: 'connexion', path: '/ar/connexion' },
  { name: 'inscription', path: '/ar/inscription' },
  { name: 'mot-de-passe-oublie', path: '/ar/mot-de-passe-oublie' },
  { name: 'nouveau-mot-de-passe', path: '/ar/reinitialiser/jeton-e2e-arabe' },
  { name: 'nouveau-mot-de-passe-expire', path: '/ar/reset-password' },
  { name: 'confirmation-en-attente', path: '/ar/confirmer-email' },
  { name: 'confirmation-expiree', path: '/ar/confirmer-email/expire' },
  { name: 'premiere-connexion', path: '/ar/premiere-connexion' },
  { name: 'compte-suspendu', path: '/ar/compte-suspendu' },
] as const;

/** Saisie dont l'ordre se lit dans le rendu : un chiffre (haut) puis des tirets (bas). */
const TYPED_ORDER = '1-------';
const ARABIC_NAME = 'سلمى';
const LATIN_NAME = 'Claire';

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

async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[/.]/g, '\\$&')}$`));
  await expect(page.locator('h1').first()).toBeVisible();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
}

/** Boîte d'un élément, rendue. */
async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box, 'élément rendu').not.toBeNull();
  return box!;
}

interface Ink {
  /** Largeur de la capture du champ. */
  width: number;
  /** Première et dernière colonne encrée (texte du champ). */
  minX: number;
  maxX: number;
  /** Colonnes encrées sur au moins 60 % de la hauteur d'encre maximale (le chiffre). */
  tallMinX: number;
  tallMaxX: number;
}

/**
 * Encre du texte d'un champ, lue dans sa capture (bordure exclue) : où le texte est réellement
 * dessiné, sans se fier aux attributs ni aux styles calculés. Le champ perd le focus (pas d'anneau,
 * pas de curseur).
 */
async function inkOf(page: Page, field: Locator): Promise<Ink> {
  await field.blur();
  const png = await field.screenshot({ animations: 'disabled', caret: 'hide' });
  return page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const { data, width, height } = context.getImageData(0, 0, image.width, image.height);
    const inset = 4;
    const at = (x: number, y: number) => {
      const i = (y * width + x) * 4;
      return [data[i], data[i + 1], data[i + 2]];
    };
    const background = at(inset, inset);
    const heights: number[] = [];
    for (let x = inset; x < width - inset; x++) {
      let count = 0;
      for (let y = inset; y < height - inset; y++) {
        const [r, g, b] = at(x, y);
        const diff =
          Math.abs(r - background[0]) + Math.abs(g - background[1]) + Math.abs(b - background[2]);
        if (diff > 120) count++;
      }
      heights[x] = count;
    }
    const inked = heights.flatMap((h, x) => (h > 0 ? [x] : []));
    const tallest = Math.max(0, ...heights.filter((h) => h !== undefined));
    const tall = heights.flatMap((h, x) => (h >= tallest * 0.6 && h > 0 ? [x] : []));
    return {
      width,
      minX: Math.min(...inked),
      maxX: Math.max(...inked),
      tallMinX: Math.min(...tall),
      tallMaxX: Math.max(...tall),
    };
  }, png.toString('base64'));
}

/** Le texte du champ est collé au bord droit (début de la page en arabe). */
function expectInkAtRight(ink: Ink): void {
  expect(ink.width - ink.maxX, 'marge de droite').toBeLessThan(ink.minX);
}

/** Le texte du champ est collé au bord gauche. */
function expectInkAtLeft(ink: Ink): void {
  expect(ink.minX, 'marge de gauche').toBeLessThan(ink.width - ink.maxX);
}

/** « 1------- » dessiné dans l'ordre de frappe : le chiffre (encre haute) à gauche des tirets. */
function expectTypingOrder(ink: Ink): void {
  expect(ink.minX).toBeGreaterThanOrEqual(0);
  expect(ink.tallMaxX, 'le chiffre tapé en premier est à gauche').toBeLessThan(
    ink.minX + (ink.maxX - ink.minX) * 0.3,
  );
}

/** Valeur sans sens de lecture (Q77) : de gauche à droite, à droite du champ, dans l'ordre tapé. */
async function expectLtrValueAtPageStart(page: Page, field: Locator, value = TYPED_ORDER) {
  await field.pressSequentially(value);
  expect(await field.evaluate((el) => getComputedStyle(el).direction)).toBe('ltr');
  const ink = await inkOf(page, field);
  expectInkAtRight(ink);
  if (value === TYPED_ORDER) expectTypingOrder(ink);
  await field.fill('');
}

test.describe.configure({ mode: 'serial' });

for (const size of WIDTHS) {
  test.describe(`features/auth en /ar/, ${size.name}`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });
    const desktop = size.name === 'bureau';

    for (const { name, path } of PAGES) {
      test(`${name} : de droite à gauche, sans débordement, axe-core, capture`, async ({
        page,
      }) => {
        await open(page, path);
        await expectRtlPage(page);
        await shoot(page, `arabe-auth-${name}-${size.name}`);
      });
    }

    test('connexion : panneaux échangés, e-mail et mot de passe de gauche à droite à droite', async ({
      page,
    }) => {
      await open(page, '/ar/connexion');
      const brand = await boxOf(page.locator('.brand-panel'));
      const form = await boxOf(page.locator('.form-panel'));
      if (desktop) {
        // Deux panneaux : la marque à droite, le formulaire à gauche.
        expect(brand.x).toBeGreaterThanOrEqual(form.x + form.width - 1);
        // Filet de séparation sur le bord de fin (gauche) du panneau de marque.
        const borders = await page
          .locator('.brand-panel')
          .evaluate((el) => [
            getComputedStyle(el).borderLeftWidth,
            getComputedStyle(el).borderRightWidth,
          ]);
        expect(borders).toEqual(['1px', '0px']);
      } else {
        expect(brand.y + brand.height).toBeLessThanOrEqual(form.y + 1);
      }
      // Bouton afficher : à gauche du champ du mot de passe.
      const password = await boxOf(page.locator('#login-password'));
      const toggle = await boxOf(page.locator('.toggle-password'));
      expect(toggle.x + toggle.width).toBeLessThanOrEqual(password.x + 1);

      await expectLtrValueAtPageStart(page, page.locator('#login-email'));
      await page.locator('#login-password').pressSequentially('Secret-2026');
      expect(
        await page.locator('#login-password').evaluate((el) => getComputedStyle(el).direction),
      ).toBe('ltr');
      expectInkAtRight(await inkOf(page, page.locator('#login-password')));
    });

    test('inscription : colonne latérale à gauche, nom saisi dans son sens, numéros de gauche à droite', async ({
      page,
    }) => {
      await open(page, '/ar/inscription');
      if (desktop) {
        const main = await boxOf(page.locator('.register > .main'));
        const side = await boxOf(page.locator('aside.side'));
        expect(side.x + side.width).toBeLessThanOrEqual(main.x + 1);
      }
      // Nom et prénom en dir="auto" (Q77) : un prénom arabe à droite, un prénom latin à gauche.
      const firstName = page.locator('input[autocomplete="given-name"]');
      await firstName.pressSequentially(ARABIC_NAME);
      expect(await firstName.evaluate((el) => getComputedStyle(el).direction)).toBe('rtl');
      expectInkAtRight(await inkOf(page, firstName));
      const lastName = page.locator('input[autocomplete="family-name"]');
      await lastName.pressSequentially(LATIN_NAME);
      expect(await lastName.evaluate((el) => getComputedStyle(el).direction)).toBe('ltr');
      expectInkAtLeft(await inkOf(page, lastName));

      await expectLtrValueAtPageStart(page, page.locator('input[autocomplete="email"]'));
      await expectLtrValueAtPageStart(page, page.locator('input[autocomplete="tel"]'));
      await expectLtrValueAtPageStart(page, page.locator('input[autocomplete="postal-code"]'));
      await shoot(page, `arabe-auth-inscription-saisie-${size.name}`);
    });

    test('mot de passe oublié : flèche de retour vers la droite, e-mail de gauche à droite', async ({
      page,
    }) => {
      await open(page, '/ar/mot-de-passe-oublie');
      const arrow = page.locator('.back .pm-flip-rtl');
      expect(await arrow.evaluate((el) => getComputedStyle(el).transform)).toBe(
        'matrix(-1, 0, 0, 1, 0, 0)',
      );
      // La flèche ouvre le lien : à droite de son texte.
      const text = await boxOf(page.locator('.back a span').nth(1));
      const arrowBox = await boxOf(arrow);
      expect(arrowBox.x).toBeGreaterThanOrEqual(text.x + text.width - 1);
      await expectLtrValueAtPageStart(page, page.locator('#reset-email'));
    });

    test('nouveau mot de passe : champs de gauche à droite, à droite', async ({ page }) => {
      await open(page, '/ar/reinitialiser/jeton-e2e-arabe');
      for (const id of ['#new-password', '#new-password-confirm']) {
        const field = page.locator(id);
        await field.pressSequentially('Secret-Clinique-2026');
        expect(await field.evaluate((el) => getComputedStyle(el).direction)).toBe('ltr');
        expectInkAtRight(await inkOf(page, field));
      }
    });

    test('confirmation expirée et compte suspendu : e-mail de gauche à droite, à droite', async ({
      page,
    }) => {
      await open(page, '/ar/confirmer-email/expire');
      await expectLtrValueAtPageStart(page, page.locator('input[type="email"]'));

      await open(page, '/ar/compte-suspendu');
      await expectLtrValueAtPageStart(page, page.locator('input[type="email"]'));
      if (desktop) {
        // Carte principale à droite, colonne d'actions à gauche.
        const main = await boxOf(page.locator('.card.main'));
        const side = await boxOf(page.locator('aside.side'));
        expect(side.x + side.width).toBeLessThanOrEqual(main.x + 1);
      }
      // Recours en dir="auto" : un texte arabe s'écrit de droite à gauche.
      const message = page.locator('textarea');
      await message.pressSequentially(ARABIC_NAME);
      expect(await message.evaluate((el) => getComputedStyle(el).direction)).toBe('rtl');
      // Compteur « 4 / 4000 » isolé de gauche à droite : le compte à gauche du maximum.
      const count = page.locator('#message-count bdi');
      expect(await count.evaluate((el) => getComputedStyle(el).direction)).toBe('ltr');
      const parts = await count.evaluate((el) => {
        const range = document.createRange();
        const text = el.firstChild!;
        const value = text.textContent!;
        const slash = value.indexOf('/');
        range.setStart(text, 0);
        range.setEnd(text, slash - 1);
        const first = range.getBoundingClientRect().x;
        range.setStart(text, slash + 2);
        range.setEnd(text, value.length);
        return { first, last: range.getBoundingClientRect().x };
      });
      expect(parts.first).toBeLessThan(parts.last);
    });

    test('première connexion : panneau d’explication à droite, champs de gauche à droite', async ({
      page,
    }) => {
      await open(page, '/ar/premiere-connexion');
      if (desktop) {
        const explain = await boxOf(page.locator('aside.explain'));
        const card = await boxOf(page.locator('section.card'));
        expect(explain.x).toBeGreaterThanOrEqual(card.x + card.width - 1);
      }
      await expectLtrValueAtPageStart(page, page.locator('input[type="email"]'));
      const temporary = page.locator('input[autocomplete="current-password"]');
      await temporary.pressSequentially('Temporaire-2026');
      expectInkAtRight(await inkOf(page, temporary));
    });
  });
}

// Double authentification : un compte jetable confirmé, 2FA activée par l'API (une inscription, une
// session d'API), puis le bloc code de la connexion en /ar/ (réponse 202, sans connexion complète).
test.describe('connexion en /ar/ : double authentification (API locale)', () => {
  let api: APIRequestContext;
  let account: TestAccount;

  test.beforeAll(async () => {
    api = await playwrightRequest.newContext();
    account = await register(api, 'm16-10.otp');
    await confirmEmail(api, account.email);
    await enableTwoFactor(api, (secret) => {
      const step = totpStep();
      return { value: totp(secret, step), step };
    });
  });

  test.afterAll(async () => {
    await api?.dispose();
  });

  for (const size of WIDTHS) {
    test(`bloc code, ${size.name} : code saisi dans l'ordre de frappe`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await open(page, '/ar/connexion');
      await page.locator('#login-email').fill(account.email);
      await page.locator('#login-password').fill(account.password);
      await page.locator('button[type="submit"]').click();
      const code = page.locator('#login-otp');
      await expect(code).toBeVisible();
      await expect(page).toHaveURL(/\/ar\/connexion$/);
      await expectRtlPage(page);
      await shoot(page, `arabe-auth-double-authentification-${size.name}`);

      await code.pressSequentially(TYPED_ORDER);
      expect(await code.evaluate((el) => getComputedStyle(el).direction)).toBe('ltr');
      expectTypingOrder(await inkOf(page, code));

      // Code de secours : même champ, même sens.
      await page.locator('.otp-row .link-button').click();
      await expect(code).toHaveValue('');
      await code.pressSequentially(TYPED_ORDER);
      expect(await code.evaluate((el) => getComputedStyle(el).direction)).toBe('ltr');
      // Champ centré (maquette 11) : seul l'ordre de frappe est mesuré.
      expectTypingOrder(await inkOf(page, code));
    });
  }
});
