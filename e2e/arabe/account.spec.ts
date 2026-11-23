import { APIRequestContext, expect, Locator, Page, test } from '@playwright/test';

import { createAccount, signIn } from '../preferences/accounts';
import { TestAccount } from '../support/accounts';
import { expectNoAxeViolations } from '../support/axe';
import { shoot } from '../support/captures';
import { API } from '../support/env';
import { totp } from '../support/totp';

// M16-12, « Mon compte » de droite à gauche (G Q71, Q74 à Q81 ; docs/design/arabe.md) : profil
// public, dossier professionnel, préférences (prise de rendez-vous en ligne comprise), vocabulaire
// (émotions, journal des fusions, tags), compte et sécurité (2FA, codes de secours), données et
// export, en /ar/ : dir="rtl", aucun défilement horizontal, axe-core sans violation, une capture par
// écran en clair et en sombre (PSYMATE_E2E_CAPTURES). Aucun libellé ciblé (rôles, structure, URL) :
// les textes de /ar/ passent du français de repli à l'arabe au fil du jalon. Connexion en /fr/
// (libellés connus), puis /ar/ : une session déjà ouverte garde le bundle de l'URL. Contre l'API
// locale (seed small, Mailpit), jamais de mock du backend ; un compte jetable par test.

const THEMES = ['light', 'dark'] as const;
/** Chiffres arabo-indiens (U+0660 à U+0669) : jamais affichés (G Q71). */
const ARABIC_INDIC = /[٠-٩]/;

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

/**
 * Thème d'un compte connecté : la préférence `theme` du compte (PATCH /api/me/preferences dans la
 * session du navigateur), page rechargée, vérifiée sur <html data-theme>. Pas d'emulateMedia : la
 * préférence du compte l'emporte sur prefers-color-scheme.
 */
async function useAccountTheme(page: Page, theme: (typeof THEMES)[number]): Promise<void> {
  const response = await page.request.patch('/api/me/preferences', { data: { theme } });
  expect(response.status(), await response.text()).toBe(200);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

/** Ouvre une page de Mon compte en /ar/ et attend la fin des chargements. */
async function openArabic(page: Page, path: string): Promise<void> {
  await page.goto(`/ar/mon-compte/${path}`);
  await expect(page).toHaveURL(new RegExp(`/ar/mon-compte/${path}$`));
  await expect(page.locator('main h1').first()).toBeVisible();
  await settled(page);
}

async function settled(page: Page): Promise<void> {
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 20_000 });
}

/** Chaque thème : page vérifiée (sens, débordement, axe) et capturée. */
async function checkAndShoot(page: Page, name: string): Promise<void> {
  for (const theme of THEMES) {
    await useAccountTheme(page, theme);
    await settled(page);
    await expectRtlPage(page);
    await shoot(page, `arabe-compte-${name}-${theme}`);
  }
}

/** Sens calculé d'un élément (dir="auto" résolu par le navigateur). */
async function direction(locator: Locator): Promise<string> {
  return locator.evaluate((el) => getComputedStyle(el).direction);
}

/** Compte jetable connecté en /fr/ ; `request` garde sa session pour la mise en place par l'API. */
async function signedIn(
  page: Page,
  request: APIRequestContext,
  prefix: string,
): Promise<TestAccount> {
  const account = await createAccount(request, prefix, 'psychologist');
  await signIn(page, account);
  return account;
}

async function created<T>(response: Promise<import('@playwright/test').APIResponse>, status = 201) {
  const done = await response;
  expect(done.status(), await done.text()).toBe(status);
  return (await done.json()) as T;
}

test.describe.configure({ timeout: 120_000 });

test('profil public : texte saisi dans son sens, contacts de gauche à droite', async ({
  page,
  request,
}) => {
  await signedIn(page, request, 'm16-12.profil');
  await openArabic(page, 'profil-public');

  const bio = page.locator('#field-bio');
  await expect(bio).toHaveAttribute('dir', 'auto');
  for (const id of ['displayName', 'titleLabel', 'fees', 'address', 'city']) {
    await expect(page.locator(`#field-${id}`)).toHaveAttribute('dir', 'auto');
  }
  for (const id of ['contactPhone', 'contactEmail', 'websiteUrl', 'postalCode']) {
    await expect(page.locator(`#field-${id}`)).toHaveAttribute('dir', 'ltr');
  }

  // Présentation en arabe : de droite à gauche, dans le champ et dans l'aperçu ; en français : de
  // gauche à droite, même dans l'interface arabe (dir="auto", Q77).
  await bio.fill('أستقبل البالغين والمراهقين في عيادتي.');
  const previewBio = page.locator('[data-testid="preview"] .bio');
  await expect(previewBio).toBeVisible();
  expect(await direction(bio)).toBe('rtl');
  expect(await direction(previewBio)).toBe('rtl');
  await bio.fill('Thérapies brèves, adultes et adolescents.');
  await expect(previewBio).toHaveText('Thérapies brèves, adultes et adolescents.');
  expect(await direction(previewBio)).toBe('ltr');
  await page.locator('#field-contactEmail').fill('cabinet@example.test');
  expect(await direction(page.locator('#field-contactEmail'))).toBe('ltr');
  await expect(page.locator('[data-testid="save-status"] [role="status"]')).toBeVisible();

  await checkAndShoot(page, 'profil');
});

test('dossier professionnel : numéros et téléphone de gauche à droite, adresse dans son sens', async ({
  page,
  request,
}) => {
  await signedIn(page, request, 'm16-12.dossier');
  await openArabic(page, 'dossier-professionnel');

  for (const name of ['professionalNumber', 'phone', 'postalCode']) {
    await expect(page.locator(`input[formcontrolname="${name}"]`)).toHaveAttribute('dir', 'ltr');
  }
  for (const name of ['street', 'city']) {
    await expect(page.locator(`input[formcontrolname="${name}"]`)).toHaveAttribute('dir', 'auto');
  }
  for (const name of ['title', 'issuer']) {
    await expect(page.locator(`input[formcontrolname="${name}"]`)).toHaveAttribute('dir', 'auto');
  }
  await expect(page.locator('input[formcontrolname="year"]')).toHaveAttribute('dir', 'ltr');

  await checkAndShoot(page, 'dossier');
});

test('préférences : segments dans le sens de lecture, plages horaires de gauche à droite, thème au clavier inversé', async ({
  page,
  request,
}) => {
  await signedIn(page, request, 'm16-12.preferences');
  await openArabic(page, 'preferences');

  // Contrôle segmenté : le premier segment au début de la ligne, donc à droite.
  const segments = page.locator('pm-segmented-control').first().locator('button');
  const first = await segments.nth(0).boundingBox();
  const second = await segments.nth(1).boundingBox();
  expect(first!.x).toBeGreaterThan(second!.x);

  // Prise de rendez-vous en ligne : une plage ajoutée, ses heures de gauche à droite.
  const booking = page.locator('section[aria-labelledby="h-booking"]');
  await expect(booking).toBeVisible();
  const editor = booking.locator('pm-booking-windows-editor');
  await editor.locator('button.wd-add').first().click();
  const times = editor.locator('input.time');
  await expect(times).toHaveCount(2);
  for (const time of await times.all()) await expect(time).toHaveAttribute('dir', 'ltr');
  await times.nth(0).fill('09:00');
  await times.nth(1).fill('12:30');
  await expectRtlPage(page);
  await shoot(page, 'arabe-compte-preferences-plage');

  await checkAndShoot(page, 'preferences');

  // Sélecteur de thème (vrais boutons radio) : en arabe, flèche gauche va au suivant (Q81).
  await useAccountTheme(page, 'light');
  await settled(page);
  const radios = page.locator('pm-theme-picker input[type="radio"]');
  await radios.nth(0).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(radios.nth(1)).toBeChecked();
  await page.keyboard.press('ArrowRight');
  await expect(radios.nth(0)).toBeChecked();
});

test('vocabulaire : émotions, journal des fusions et tags', async ({ page, request }) => {
  await createAccount(request, 'm16-12.vocabulaire', 'psychologist').then((account) =>
    signIn(page, account),
  );
  // Émotions saisies en arabe et en français ; une fusion par l'API, inscrite au journal du
  // navigateur (le contrat ne liste pas les fusions : data/merge-journal.ts).
  await created(
    request.post(`${API}/api/me/emotions`, { data: { labelFr: 'ضجر', family: 'sadness' } }),
  );
  const source = await created<{ code: string }>(
    request.post(`${API}/api/me/emotions`, { data: { labelFr: 'حزن عابر', family: 'sadness' } }),
  );
  const target = await created<{ code: string }>(
    request.post(`${API}/api/me/emotions`, { data: { labelFr: 'Morosité', family: 'sadness' } }),
  );
  const merge = await created<Record<string, unknown>>(
    request.post(`${API}/api/me/emotions/${source.code}/merge`, {
      data: { targetCode: target.code },
    }),
    200,
  );
  const me = await created<{ id: string }>(request.get(`${API}/api/auth/me`), 200);
  await page.evaluate(
    ([owner, entry]) =>
      localStorage.setItem(`vocabulary.emotionMerges.${owner}`, JSON.stringify([entry])),
    [me.id, { merge, sourceLabel: 'حزن عابر', targetLabel: 'Morosité' }] as const,
  );
  await created(request.post(`${API}/api/tags`, { data: { label: 'أرق' } }));
  await created(request.post(`${API}/api/tags`, { data: { label: 'Travail' } }));

  await openArabic(page, 'emotions');
  const names = page.locator('table .name');
  await expect(names).toHaveCount(2);
  for (const name of await names.all()) await expect(name).toHaveAttribute('dir', 'auto');
  const arabicName = names.filter({ hasText: 'ضجر' });
  expect(await direction(arabicName)).toBe('rtl');
  expect(await direction(names.filter({ hasText: 'Morosité' }))).toBe('ltr');

  // Journal : source → cible, flèche retournée (elle pointe vers la cible, à gauche), dates en
  // chiffres latins.
  const journal = page.locator('pm-merge-journal li');
  await expect(journal).toHaveCount(1);
  await expect(journal.locator('.name')).toHaveCount(2);
  const arrow = journal.locator('.arrow');
  await expect(arrow).toHaveCSS('transform', 'matrix(-1, 0, 0, 1, 0, 0)');
  const sourceBox = await journal.locator('.name').nth(0).boundingBox();
  const targetBox = await journal.locator('.name').nth(1).boundingBox();
  expect(targetBox!.x).toBeLessThan(sourceBox!.x);
  expect(await journal.locator('.muted').textContent()).not.toMatch(ARABIC_INDIC);

  await checkAndShoot(page, 'emotions');

  await openArabic(page, 'tags');
  const tags = page.locator('table .name');
  await expect(tags).toHaveCount(2);
  for (const tag of await tags.all()) await expect(tag).toHaveAttribute('dir', 'auto');
  expect(await direction(tags.filter({ hasText: 'أرق' }))).toBe('rtl');
  expect(await page.locator('table td.mono').first().textContent()).not.toMatch(ARABIC_INDIC);
  await checkAndShoot(page, 'tags');
});

test('compte et sécurité : e-mail, secret et codes de secours de gauche à droite, dans l’ordre', async ({
  page,
  request,
}) => {
  await signedIn(page, request, 'm16-12.securite');
  await openArabic(page, 'securite');
  await expect(page.locator('.value .mono').first()).toHaveAttribute('dir', 'ltr');
  await checkAndShoot(page, 'securite');

  // Panneau 2FA (route /2fa) : QR, secret en dir="ltr", code, puis les 10 codes de secours.
  await page.goto('/ar/mon-compte/securite/2fa');
  const setup = page.locator('pm-two-factor-setup');
  const secretCode = setup.locator('.secret code');
  await expect(secretCode).toBeVisible({ timeout: 20_000 });
  await expect(secretCode).toHaveAttribute('dir', 'ltr');
  await expect(setup.locator('svg.qr')).toBeVisible();
  await expectRtlPage(page);
  await shoot(page, 'arabe-compte-2fa-qr', false);

  const secret = ((await secretCode.textContent()) ?? '').replace(/\s+/g, '');
  await setup.locator('.step .actions button').click();
  const otp = setup.locator('input.otp');
  await expect(otp).toHaveAttribute('dir', 'ltr');
  await otp.fill(totp(secret));
  await setup.locator('form button[type="submit"]').click();

  const codes = page.locator('pm-recovery-codes ul code');
  await expect(codes).toHaveCount(10, { timeout: 20_000 });
  for (const code of await codes.all()) await expect(code).toHaveAttribute('dir', 'ltr');
  // Un code se lit dans l'ordre : son premier caractère à gauche de son dernier.
  const order = await codes.first().evaluate((el) => {
    const text = el.firstChild as Text;
    const box = (start: number) => {
      const range = document.createRange();
      range.setStart(text, start);
      range.setEnd(text, start + 1);
      return range.getBoundingClientRect().x;
    };
    return { first: box(0), last: box(text.length - 1), length: text.length };
  });
  expect(order.length).toBeGreaterThan(1);
  expect(order.first).toBeLessThan(order.last);
  await expectRtlPage(page);
  await shoot(page, 'arabe-compte-2fa-codes', false);
});

test('données et export : sélecteur de patient dans son sens, rappel de la langue du document', async ({
  page,
  request,
}) => {
  await signedIn(page, request, 'm16-12.donnees');
  await created(request.post(`${API}/api/patients`, { data: { displayName: 'سلمى بن علي' } }));
  await openArabic(page, 'donnees');

  const combobox = page.locator('[role="combobox"]');
  await expect(combobox).toBeVisible();
  await expect(combobox).toHaveAttribute('dir', 'auto');
  // Un seul rappel : en arabe, celui qui dit que le document reste en français (API Q102).
  await expect(page.locator('.reminder')).toHaveCount(1);
  await checkAndShoot(page, 'donnees');
});
