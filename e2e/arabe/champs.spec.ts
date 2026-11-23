import { expect, Locator, Page, test } from '@playwright/test';

import { createAccount, signIn } from '../preferences/accounts';
import { expectNoAxeViolations } from '../support/axe';

// M16-09B, champs de saisie de droite à gauche (G Q71, Q76, Q77 ; docs/design/arabe.md §4 et §5),
// règles de src/theme/arabic.scss :
// 1. un champ en dir="ltr" (code, mot de passe, e-mail) garde son interlettrage de /fr/ ; un libellé
//    arabe dans un conteneur dir="ltr" reste sans interlettrage ;
// 2. un champ en dir="ltr" s'aligne du côté de début de la page (à droite en /ar/) ;
// 3. un champ vide en dir="auto" prend le sens de la page, puis le premier caractère fixe le sens.
// Rien ne change en /fr/ ni en /en/. Preuves sur les valeurs calculées et sur le rendu (encre du
// texte et du curseur dans une capture du champ), pas sur les attributs. Les tests 1 et 3 tournent
// sans API (/_demo) ; le test sur « Mon compte » (vrai écran, champs en dir="ltr") demande l'API
// locale (seed small), jamais de mock du backend. Aucun libellé ciblé (rôles, structure, URL).

/** Écart en px toléré entre le bord du texte et le bord de la zone de texte du champ. */
const EDGE = 6;

/** Zone de texte d'un champ (boîte de contenu : sans bordure ni marge intérieure), en px. */
async function contentBox(field: Locator) {
  return field.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const px = (value: string) => parseFloat(value) || 0;
    const left = px(cs.borderLeftWidth) + px(cs.paddingLeft);
    const right = px(cs.borderRightWidth) + px(cs.paddingRight);
    const top = px(cs.borderTopWidth) + px(cs.paddingTop);
    const bottom = px(cs.borderBottomWidth) + px(cs.paddingBottom);
    return {
      x: Math.ceil(r.x + left),
      y: Math.ceil(r.y + top),
      width: Math.floor(r.width - left - right),
      height: Math.floor(r.height - top - bottom),
    };
  });
}

/**
 * Encre rendue dans la zone de texte d'un champ (texte, texte indicatif ou curseur) : première et
 * dernière colonne qui diffèrent du fond, en px depuis le bord gauche de la zone. Capture du seul
 * champ, décodée dans la page (aucune dépendance). `caret` : curseur visible, sans clignotement.
 */
async function inkOf(page: Page, field: Locator, caret = false) {
  const clip = await contentBox(field);
  if (caret) await page.addStyleTag({ content: 'input, textarea { caret-animation: manual; }' });
  const png = await page.screenshot({ clip, caret: caret ? 'initial' : 'hide' });
  const ink = await page.evaluate(async (bytes) => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)]));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    const { data, width, height } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    const background = [data[0], data[1], data[2]];
    let start = -1;
    let end = -1;
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        const i = (y * width + x) * 4;
        const delta =
          Math.abs(data[i] - background[0]) +
          Math.abs(data[i + 1] - background[1]) +
          Math.abs(data[i + 2] - background[2]);
        if (delta > 96) {
          if (start < 0) start = x;
          end = x;
          break;
        }
      }
    }
    return start < 0 ? null : { start, end: end + 1, width };
  }, Array.from(png));
  expect(ink, 'encre dans le champ').not.toBeNull();
  return ink!;
}

async function styleOf(field: Locator) {
  return field.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { direction: cs.direction, textAlign: cs.textAlign, letterSpacing: cs.letterSpacing };
  });
}

/** L'encre touche le bord droit de la zone de texte (et pas le gauche). */
function expectRight(ink: { start: number; end: number; width: number }, what: string): void {
  expect(ink.end, `${what} : bord droit`).toBeGreaterThanOrEqual(ink.width - EDGE);
  expect(ink.start, `${what} : pas au bord gauche`).toBeGreaterThan(EDGE);
}

/** L'encre touche le bord gauche de la zone de texte (et pas le droit). */
function expectLeft(ink: { start: number; end: number; width: number }, what: string): void {
  expect(ink.start, `${what} : bord gauche`).toBeLessThanOrEqual(EDGE);
  expect(ink.end, `${what} : pas au bord droit`).toBeLessThan(ink.width - EDGE);
}

test.describe('interlettrage (Q76)', () => {
  test('champ de code en dir="ltr" : même interlettrage qu’en /fr/ ; libellé arabe d’un conteneur dir="ltr" sans interlettrage', async ({
    page,
  }) => {
    const measures: Record<string, { code: string; placeholder: string; label: string }> = {};
    for (const locale of ['fr', 'ar'] as const) {
      await page.goto(`/${locale}/_demo`);
      await expect(page.locator('pm-admin-bar')).toBeVisible();
      // Champ de code comme ceux de Mon compte et de la connexion (classe .otp : 0.25em), et un
      // libellé arabe dans un conteneur dir="ltr" (graphiques temporels, Q75), posés dans la page.
      await page.addStyleTag({
        content:
          '.probe-code, .probe-code::placeholder { letter-spacing: 0.25em; }' +
          '.probe-label { letter-spacing: 0.1em; }',
      });
      measures[locale] = await page.evaluate(() => {
        const box = document.createElement('div');
        box.dir = 'ltr';
        box.innerHTML =
          '<input class="probe-code" dir="ltr" placeholder="000000" aria-label="code">' +
          '<span class="probe-label">متابعة الجلسة</span>';
        document.body.append(box);
        const code = box.querySelector('input')!;
        return {
          code: getComputedStyle(code).letterSpacing,
          placeholder: getComputedStyle(code, '::placeholder').letterSpacing,
          label: getComputedStyle(box.querySelector('span')!).letterSpacing,
        };
      });
    }
    expect(measures['fr'].code).not.toBe('normal');
    expect(measures['ar'].code).toBe(measures['fr'].code);
    expect(measures['ar'].placeholder).toBe(measures['fr'].placeholder);
    expect(measures['fr'].label).not.toBe('normal');
    expect(measures['ar'].label).toBe('normal');
    await expectNoAxeViolations(page);
  });
});

test.describe('champ vide en dir="auto" (Q77)', () => {
  test('/ar/ : boîte de confirmation, champ vide à droite, puis le premier caractère fixe le sens', async ({
    page,
  }) => {
    await page.goto('/ar/_demo');
    await page.locator('button.confirm-word').click();
    const field = page.getByRole('dialog').getByRole('textbox');
    await expect(field).toBeFocused();
    await expect(field).toHaveValue('');

    // Vide : sens de la page, curseur au bord droit.
    expect((await styleOf(field)).direction).toBe('rtl');
    expectRight(await inkOf(page, field, true), 'curseur du champ vide');

    // Premier caractère arabe : de droite à gauche, texte à droite.
    await page.keyboard.type('مريم');
    expect((await styleOf(field)).direction).toBe('rtl');
    expectRight(await inkOf(page, field), 'texte arabe');

    // Premier caractère latin : de gauche à droite, texte à gauche.
    await field.fill('');
    await page.keyboard.type('Marie D.');
    expect((await styleOf(field)).direction).toBe('ltr');
    expectLeft(await inkOf(page, field), 'texte latin');

    // Vidé : de nouveau le sens de la page.
    await field.fill('');
    expect((await styleOf(field)).direction).toBe('rtl');
    expectRight(await inkOf(page, field, true), 'curseur du champ vidé');
    await expectNoAxeViolations(page);
  });

  for (const locale of ['fr', 'en'] as const) {
    test(`/${locale}/ : boîte de confirmation, champ vide à gauche comme avant`, async ({
      page,
    }) => {
      await page.goto(`/${locale}/_demo`);
      await page.locator('button.confirm-word').click();
      const field = page.getByRole('dialog').getByRole('textbox');
      await expect(field).toBeFocused();
      expect((await styleOf(field)).direction).toBe('ltr');
      expectLeft(await inkOf(page, field, true), 'curseur du champ vide');
      // placeholder=" " : rien à lire de plus pour un lecteur d'écran.
      await expect(field).toHaveAccessibleDescription('');
      await expectNoAxeViolations(page);
    });
  }

  test('/ar/ : texte indicatif d’un champ vide à droite, puis à gauche dès un caractère latin', async ({
    page,
  }) => {
    await page.goto('/ar/_demo');
    await expect(page.locator('pm-admin-bar')).toBeVisible();
    await page.evaluate(() => {
      const box = document.createElement('div');
      box.innerHTML =
        '<input id="probe-auto" dir="auto" placeholder="ابحث عن مريض" aria-label="بحث"' +
        ' style="width: 320px; font-size: 16px">';
      document.querySelector('main, body')!.prepend(box);
    });
    const field = page.locator('#probe-auto');
    expect((await styleOf(field)).direction).toBe('rtl');
    expectRight(await inkOf(page, field), 'texte indicatif');
    await field.focus();
    expectRight(await inkOf(page, field, true), 'texte indicatif et curseur');
    await page.keyboard.type('Claire');
    expect((await styleOf(field)).direction).toBe('ltr');
    expectLeft(await inkOf(page, field), 'texte latin');
    await expectNoAxeViolations(page);
  });
});

test.describe('champs de « Mon compte » en /ar/ (API locale)', () => {
  test.describe.configure({ timeout: 120_000 });

  test('e-mail, téléphone, site et code : alignés à droite, code avec l’interlettrage de /fr/', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'm16-09b.champs', 'psychologist');
    await signIn(page, account);

    // Profil public : contacts en dir="ltr", texte latin collé au bord droit du champ.
    await page.goto('/ar/mon-compte/profil-public');
    await expect(page.locator('main h1').first()).toBeVisible();
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 20_000 });
    const values: Record<string, string> = {
      contactPhone: '+33 1 23 45 67 89',
      contactEmail: 'cabinet@example.test',
      websiteUrl: 'https://example.test',
    };
    for (const [id, value] of Object.entries(values)) {
      const field = page.locator(`#field-${id}`);
      await expect(field).toHaveAttribute('dir', 'ltr');
      await field.fill(value);
      const style = await styleOf(field);
      expect(style.direction, id).toBe('ltr');
      expectRight(await inkOf(page, field), id);
    }

    // Activation de la double authentification : champ de code, à droite, interlettrage de /fr/.
    const codeOf = async (locale: string) => {
      await page.goto(`/${locale}/mon-compte/securite/2fa`);
      const setup = page.locator('pm-two-factor-setup');
      await expect(setup.locator('.secret code')).toBeVisible({ timeout: 20_000 });
      await setup.locator('.step .actions button').click();
      const otp = setup.locator('input.otp');
      await expect(otp).toBeVisible();
      await otp.fill('123456');
      return { otp, style: await styleOf(otp) };
    };
    const fr = await codeOf('fr');
    expectLeft(await inkOf(page, fr.otp), 'code en /fr/');
    const ar = await codeOf('ar');
    expect(fr.style.letterSpacing).not.toBe('normal');
    expect(ar.style.letterSpacing).toBe(fr.style.letterSpacing);
    expectRight(await inkOf(page, ar.otp), 'code en /ar/');
    await expectNoAxeViolations(page);
  });
});
