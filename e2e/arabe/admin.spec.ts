import {
  APIRequestContext,
  expect,
  Locator,
  Page,
  request as playwrightRequest,
  test,
} from '@playwright/test';

import {
  adminApi,
  shareSession,
  SubmittedAccount,
  submittedAccount,
} from '../flux-10-admin/helpers';
import { confirmEmail, register } from '../support/accounts';
import { ADMIN_AVAILABLE, ADMIN_MISSING, suspendPractitioner } from '../support/admin';
import { expectNoAxeViolations } from '../support/axe';
import { shoot } from '../support/captures';
import { API } from '../support/env';

// M16-13, administration de droite à gauche (G Q71, Q74 à Q81 ; docs/design/arabe.md §2 à §6, §9) :
// file de validation, dossier d'un praticien avec la visionneuse, praticiens, recours, journal et
// vocabulaire de l'annuaire en /ar/ : dir="rtl", aucun défilement horizontal, axe-core sans
// violation, une capture par écran en clair et en sombre (PSYMATE_E2E_CAPTURES). Aucun libellé
// ciblé (rôles, structure, URL) : les textes de /ar/ passent du français de repli à l'arabe au fil
// du jalon. Contre l'API locale (seed small, Mailpit), jamais de mock du backend.
//
// Administrateur : celui de e2e/support/admin.ts (PSYMATE_E2E_ADMIN_*), une seule connexion (TOTP)
// pour tout le fichier ; sans lui, tout le fichier est ignoré et le dit. Thème : un administrateur
// n'a pas de préférences chargées (core/preferences : PreferencesStore.load() pour un praticien
// seulement, reset() sinon), donc ThemeService suit prefers-color-scheme : le thème se pose par
// emulateMedia et se vérifie sur <html data-theme>.

const THEMES = ['light', 'dark'] as const;
/** Chiffres arabo-indiens (U+0660 à U+0669, U+06F0 à U+06F9) : jamais affichés (G Q71). */
const ARABIC_INDIC = /[٠-٩۰-۹]/;
/** Texte saisi en arabe (Q77) : dir="auto" le met de droite à gauche, dans les trois langues. */
const ARABIC_NOTE = 'ملاحظة داخلية: الشهادة مطابقة للاسم المصرَّح به.';
const ARABIC_APPEAL = 'أطلب مراجعة قرار الإيقاف لأن الشهادة المرسلة صحيحة ومطابقة.';
const PHONE = { width: 390, height: 844 };

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

/** Barre d'administration et titre rendus, plus aucun chargement en cours. */
async function settled(page: Page): Promise<void> {
  await expect(page.locator('pm-admin-bar')).toBeVisible();
  await expect(page.locator('main h1').first()).toBeVisible();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 20_000 });
}

async function open(page: Page, path: string): Promise<void> {
  await page.goto(`/ar/admin/${path}`);
  await expect(page).toHaveURL(new RegExp(`/ar/admin/${path.split('?')[0]}`));
  await settled(page);
}

/**
 * Chaque thème (prefers-color-scheme, seul réglage d'un administrateur) : page vérifiée (sens,
 * débordement, axe) et capturée.
 */
async function checkAndShoot(page: Page, name: string): Promise<void> {
  for (const theme of THEMES) {
    await page.emulateMedia({ colorScheme: theme });
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await settled(page);
    await expectRtlPage(page);
    await shoot(page, `arabe-admin-${name}-${theme}`);
  }
  await page.emulateMedia({ colorScheme: 'light' });
}

/** Sens calculé par le navigateur (dir="auto" et <bdi> résolus sur le contenu). */
async function direction(locator: Locator): Promise<string> {
  return locator.evaluate((el) => getComputedStyle(el).direction);
}

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box, 'élément rendu').not.toBeNull();
  return box!;
}

test.describe('administration en /ar/ (M16-13)', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 });
  test.skip(!ADMIN_AVAILABLE, ADMIN_MISSING);

  let admin: APIRequestContext;
  let practitioner: SubmittedAccount;
  let appellant: APIRequestContext;

  test.beforeAll(async () => {
    test.setTimeout(240_000);
    admin = await adminApi();
    // Dossier soumis : diplôme (PDF) et pièce d'identité (PNG), pour la file et la visionneuse.
    practitioner = await submittedAccount('m16-13.dossier');
    // Recours ouvert au message arabe : compte confirmé, suspendu, puis recours (route publique).
    appellant = await playwrightRequest.newContext();
    const account = await register(appellant, 'm16-13.recours');
    await confirmEmail(appellant, account.email);
    const me = await appellant.get(`${API}/api/auth/me`);
    expect(me.status(), await me.text()).toBe(200);
    const { id } = (await me.json()) as { id: string };
    await suspendPractitioner(
      admin,
      id,
      'e2e M16-13 : suspension pour afficher un recours en /ar/.',
    );
    const appeal = await appellant.post(`${API}/api/me/appeal`, {
      data: { email: account.email, password: account.password, message: ARABIC_APPEAL },
    });
    expect(appeal.status(), await appeal.text()).toBe(201);
  });

  test.afterAll(async () => {
    await practitioner?.api.dispose();
    await appellant?.dispose();
    await admin?.dispose();
  });

  test('file de validation : la file à droite du dossier', async ({ page, context }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await shareSession(admin, context);
    await open(page, 'validation');
    const queue = page.locator('section.queue');
    await expect(queue.locator('ol a').first()).toBeVisible();
    // Grille de 1 200 px et plus : la file (première colonne) au début de la ligne, donc à droite.
    const queueBox = await boxOf(queue);
    const dossierBox = await boxOf(page.locator('section.dossier'));
    expect(queueBox.x).toBeGreaterThanOrEqual(dossierBox.x + dossierBox.width - 1);
    // Ancienneté (« il y a 3 j ») : chiffres latins.
    expect(await queue.locator('.age').first().textContent()).not.toMatch(ARABIC_INDIC);
    await checkAndShoot(page, 'validation');
  });

  test('dossier d’un praticien : décision à gauche, coordonnées en ltr, visionneuse', async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await shareSession(admin, context);
    await open(page, `validation/${practitioner.id}`);
    await expect(page.locator('#dossier-title')).toBeVisible();

    // Colonne de décision (collante) à la fin de la ligne : à gauche de la visionneuse.
    const side = await boxOf(page.locator('aside.dossier-side'));
    const stage = await boxOf(page.locator('pm-document-viewer .stage'));
    expect(side.x + side.width).toBeLessThanOrEqual(stage.x + 1);

    // Nom latin isolé : de gauche à droite dans son <bdi>, le titre reste dans le sens de la page.
    expect(await direction(page.locator('#dossier-title bdi'))).toBe('ltr');
    expect(await direction(page.locator('#dossier-title'))).toBe('rtl');
    // E-mail, téléphone, numéro : dir="ltr" (Q77).
    const contacts = page.locator('pm-dossier-header dd bdi[dir="ltr"]');
    await expect(contacts).toHaveCount(3);
    for (const value of await contacts.all()) expect(await direction(value)).toBe('ltr');

    // Note interne saisie en arabe : de droite à gauche ; en caractères latins : de gauche à droite.
    const note = page.locator('pm-decision-form textarea').first();
    await note.fill(ARABIC_NOTE);
    expect(await direction(note)).toBe('rtl');
    await note.fill('Note interne en français.');
    expect(await direction(note)).toBe('ltr');
    await note.fill('');

    // Visionneuse : la pièce d'identité (PNG, second justificatif), zoom et rotation.
    await page.locator('pm-document-list li').nth(1).locator('button.show').click();
    const image = page.locator('pm-document-viewer img');
    await expect(image).toBeVisible({ timeout: 20_000 });
    const zoom = page.locator('pm-document-viewer .tools .mono');
    expect(await direction(zoom)).toBe('ltr');
    expect(await zoom.textContent()).not.toMatch(ARABIC_INDIC);
    await checkAndShoot(page, 'dossier-visionneuse');
  });

  test('praticiens : colonnes dans le sens de lecture, adresses en ltr', async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await shareSession(admin, context);
    await open(page, 'praticiens');
    const headers = page.locator('section.card thead th');
    await expect(headers.first()).toBeVisible();
    // Première colonne à droite, colonne des actions à gauche, alignée sur sa fin (à gauche).
    const first = await boxOf(headers.first());
    const last = await boxOf(headers.last());
    expect(first.x).toBeGreaterThan(last.x);
    expect(await headers.last().evaluate((th) => getComputedStyle(th).textAlign)).toBe('end');
    const email = page.locator('tbody tr .email').first();
    await expect(email).toHaveAttribute('dir', 'ltr');
    expect(await direction(email)).toBe('ltr');
    // Dates (« 9 nov. 2026 ») : chiffres latins.
    expect(await page.locator('tbody tr td.date').first().textContent()).not.toMatch(ARABIC_INDIC);
    await checkAndShoot(page, 'praticiens');
  });

  test('recours : message arabe de droite à gauche, actions à la fin de la ligne', async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await shareSession(admin, context);
    await open(page, 'praticiens');
    const appeals = page.locator('pm-appeal-list');
    await expect(appeals).toBeVisible();
    // Recours masqués au-delà des trois premiers : on les affiche tous (bouton sous la liste).
    const showAll = page.locator('pm-appeal-list + .more button');
    if (await showAll.isVisible()) await showAll.click();
    const quote = appeals.locator('blockquote', { hasText: ARABIC_APPEAL });
    await expect(quote).toBeVisible();
    await expect(quote).toHaveAttribute('dir', 'auto');
    expect(await direction(quote)).toBe('rtl');
    // Filet de citation au début du texte arabe : à droite.
    expect(await quote.evaluate((el) => getComputedStyle(el).borderRightWidth)).toBe('3px');
    const item = appeals.locator('li', { has: quote });
    const body = await boxOf(item.locator('.body'));
    const actions = await boxOf(item.locator('.actions'));
    expect(actions.x + actions.width).toBeLessThanOrEqual(body.x + 1);
    await quote.scrollIntoViewIfNeeded();
    await checkAndShoot(page, 'recours');
  });

  test('journal : horodatage en chiffres latins, code technique en ltr, filtres de date natifs', async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await shareSession(admin, context);
    await open(page, `journal?period=all&practitioner=${practitioner.id}`);
    const row = page.locator('tbody tr').first();
    await expect(row).toBeVisible();
    expect(await row.locator('td').first().textContent()).not.toMatch(ARABIC_INDIC);
    expect(await direction(row.locator('.kind bdi'))).toBe('ltr');
    // Code après le badge, dans le sens de lecture : à sa gauche, séparé par sa marge de début.
    const badge = await boxOf(row.locator('td').nth(1).locator('.badge'));
    const code = await boxOf(row.locator('.kind'));
    expect(badge.x - (code.x + code.width)).toBeGreaterThanOrEqual(5);
    await checkAndShoot(page, 'journal');

    // Période personnalisée : contrôles natifs, au début de leur champ (à droite), dans la fenêtre.
    await open(page, 'journal?period=custom');
    for (const id of ['#journal-from', '#journal-to']) {
      const input = page.locator(id);
      await expect(input).toBeVisible();
      const box = await boxOf(input);
      const label = await boxOf(page.locator(`label[for="${id.slice(1)}"]`));
      expect(Math.abs(box.x + box.width - (label.x + label.width))).toBeLessThanOrEqual(1);
      expect(box.x).toBeGreaterThanOrEqual(0);
    }
    await checkAndShoot(page, 'journal-periode');
  });

  test('vocabulaire de l’annuaire : onglets de droite à gauche, ← vers l’onglet suivant', async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await shareSession(admin, context);
    await open(page, 'vocabulaire');
    const tabs = page.locator('[role="tablist"] [role="tab"]');
    await expect(tabs).toHaveCount(4);
    // Premier onglet au début de la ligne : à droite du second.
    expect((await boxOf(tabs.nth(0))).x).toBeGreaterThan((await boxOf(tabs.nth(1))).x);
    // Code : identifiant en dir="ltr".
    const code = page.locator('tbody tr td.code bdi').first();
    await expect(code).toHaveAttribute('dir', 'ltr');
    expect(await direction(code)).toBe('ltr');
    await checkAndShoot(page, 'vocabulaire');

    // Clavier (Q81) : flèche gauche vers l'onglet suivant, flèche droite vers le précédent.
    await tabs.nth(0).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page).toHaveURL(/kind=audience/);
    await expect(tabs.nth(1)).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(page).not.toHaveURL(/kind=/);
    await expect(tabs.nth(0)).toBeFocused();
  });

  test('téléphone : aucun défilement horizontal sur les quatre écrans', async ({
    page,
    context,
  }) => {
    await page.setViewportSize(PHONE);
    await shareSession(admin, context);
    for (const [name, path] of [
      ['validation', `validation/${practitioner.id}`],
      ['praticiens', 'praticiens'],
      ['journal', 'journal?period=all'],
      ['vocabulaire', 'vocabulaire'],
    ]) {
      await open(page, path);
      await expectRtlPage(page);
      await shoot(page, `arabe-admin-${name}-telephone`);
    }
  });
});
