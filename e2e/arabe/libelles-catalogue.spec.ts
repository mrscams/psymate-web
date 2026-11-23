import {
  APIRequestContext,
  Browser,
  BrowserContext,
  expect,
  Locator,
  Page,
  request as playwrightRequest,
  test,
} from '@playwright/test';

import { adminApi, letters, shareSession } from '../flux-10-admin/helpers';
import { confirmEmail, register } from '../support/accounts';
import { ADMIN_AVAILABLE, ADMIN_MISSING } from '../support/admin';
import { expectNoAxeViolations } from '../support/axe';
import { API } from '../support/env';

// M16-25, contrat 0.16.0 : libellés arabes des catalogues (G Q78). Un administrateur saisit le
// libellé arabe d'une spécialité dans le vocabulaire de l'annuaire et le relit après
// enregistrement ; en /ar/, une entrée qui a un libellé arabe l'affiche, une entrée qui n'en a
// pas affiche le français ; /fr/ et /en/ n'affichent jamais l'arabe. Contre l'API locale (seed
// small, Mailpit), jamais de mock du backend. Aucun texte d'interface ciblé (structure, attributs,
// URL) : seuls les libellés créés par le test sont cherchés.
//
// Administrateur : celui de e2e/support/admin.ts (PSYMATE_E2E_ADMIN_*) ; sans lui, tout le fichier
// est ignoré et le dit (comme e2e/flux-10-admin et e2e/arabe/admin.spec.ts).

/** Entrée du vocabulaire (ItemDto du contrat 0.16.0), champs lus ici. */
interface ItemDto {
  kind: 'specialty' | 'audience';
  code: string;
  labelFr: string;
  labelEn?: string | null;
  labelAr?: string | null;
  active: boolean;
}

/** Contexte du navigateur aux réglages du projet (baseURL, locale, fuseau). */
async function projectContext(browser: Browser): Promise<BrowserContext> {
  const { baseURL, locale, timezoneId } = test.info().project.use;
  return browser.newContext({ baseURL, locale, timezoneId });
}

/** Plus aucun chargement en cours. */
async function settled(page: Page): Promise<void> {
  await expect(page.locator('main h1').first()).toBeVisible();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 20_000 });
}

/** Champ d'un formulaire réactif, par son nom de contrôle. */
function control(root: Locator, name: string): Locator {
  return root.locator(`input[formcontrolname="${name}"]`);
}

/** Ligne du tableau du vocabulaire qui porte ce code. */
function rowOf(page: Page, code: string): Locator {
  return page.locator('tbody tr').filter({ has: page.locator('td.code', { hasText: code }) });
}

/** Ouvre le panneau « Renommer » d'une ligne (bouton à aria-expanded) et le renvoie. */
async function openRename(page: Page, code: string): Promise<Locator> {
  const toggle = rowOf(page, code).locator('button[aria-expanded]');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const panel = page.locator(`#${await toggle.getAttribute('aria-controls')}`);
  await expect(panel).toBeVisible();
  return panel;
}

async function adminList(admin: APIRequestContext): Promise<ItemDto[]> {
  const response = await admin.get(`${API}/api/admin/vocabulary/directory`);
  expect(response.status(), await response.text()).toBe(200);
  return ((await response.json()) as { items: ItemDto[] }).items;
}

/**
 * Ménage : désactive une spécialité de test (jamais supprimée). Comme les autres specs
 * d'administration (e2e/arabe/admin.spec.ts, e2e/flux-10-admin), un échec de nettoyage ne fait
 * pas échouer les tests, mais il se voit dans la sortie (statut et corps de la réponse).
 */
async function deactivate(admin: APIRequestContext, code: string): Promise<void> {
  const response = await admin.patch(`${API}/api/admin/vocabulary/directory/specialty/${code}`, {
    data: { active: false },
  });
  if (response.status() !== 200) {
    console.warn(
      `[M16-25] nettoyage : spécialité ${code} non désactivée (${response.status()}) : ${await response.text()}`,
    );
  }
}

test.describe('libellés arabes des catalogues (M16-25)', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 });
  test.skip(!ADMIN_AVAILABLE, ADMIN_MISSING);

  let admin: APIRequestContext;
  const created: string[] = [];

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    admin = await adminApi();
  });

  test.afterAll(async () => {
    // Ménage : spécialités de test désactivées (jamais supprimées).
    for (const code of created) await deactivate(admin, code);
    await admin?.dispose();
  });

  test('un administrateur saisit un libellé arabe et le relit après enregistrement', async ({
    browser,
  }) => {
    const code = `e2e_m1625_${letters(8)}`;
    const labelFr = `Spécialité de test ${code}`;
    const labelAr = 'اضطرابات النوم';
    const renamed = 'اضطرابات النوم والأرق';

    const context = await projectContext(browser);
    const page = await context.newPage();
    try {
      await shareSession(admin, context);
      await page.goto('/fr/admin/vocabulaire');
      await settled(page);

      // Ajout : le libellé arabe se saisit à côté du libellé anglais, de droite à gauche.
      const form = page.locator('pm-add-entry-form form');
      const arabic = control(form, 'labelAr');
      await expect(arabic).toHaveAttribute('dir', 'rtl');
      await expect(arabic).toHaveAttribute('lang', 'ar');
      await control(form, 'code').fill(code);
      await control(form, 'labelFr').fill(labelFr);
      await arabic.fill(labelAr);
      await expectNoAxeViolations(page);
      const post = page.waitForResponse(
        (res) =>
          res.url().endsWith('/api/admin/vocabulary/directory') &&
          res.request().method() === 'POST',
      );
      await form.locator('button[type="submit"]').click();
      const createdResponse = await post;
      expect(createdResponse.status(), await createdResponse.text()).toBe(201);
      created.push(code);
      // Corps conforme au contrat (CreateRequest) : libellé anglais vide non envoyé.
      expect(createdResponse.request().postDataJSON()).toEqual({
        kind: 'specialty',
        code,
        labelFr,
        labelAr,
      });
      expect(((await createdResponse.json()) as ItemDto).labelAr).toBe(labelAr);

      // Relecture après rechargement : le panneau « Renommer » préremplit le libellé arabe.
      await page.reload();
      await settled(page);
      let panel = await openRename(page, code);
      await expect(control(panel, 'labelAr')).toHaveValue(labelAr);
      await expect(control(panel, 'labelAr')).toHaveAttribute('dir', 'rtl');
      await expectNoAxeViolations(page);

      // Modification : PATCH partiel qui porte le nouveau libellé arabe.
      await control(panel, 'labelAr').fill(renamed);
      const patch = page.waitForResponse(
        (res) =>
          res.url().endsWith(`/api/admin/vocabulary/directory/specialty/${code}`) &&
          res.request().method() === 'PATCH',
      );
      await panel.locator('button[type="submit"]').click();
      const patched = await patch;
      expect(patched.status(), await patched.text()).toBe(200);
      expect(patched.request().postDataJSON()).toMatchObject({ labelFr, labelAr: renamed });
      expect(((await patched.json()) as ItemDto).labelAr).toBe(renamed);

      await page.reload();
      await settled(page);
      panel = await openRename(page, code);
      await expect(control(panel, 'labelAr')).toHaveValue(renamed);

      // Le serveur garde ce qui a été relu.
      const entry = (await adminList(admin)).find((item) => item.code === code);
      expect(entry?.labelAr).toBe(renamed);
    } finally {
      await context.close();
    }
  });

  test('en /ar/, le libellé arabe s’il existe, sinon le français ; /fr/ et /en/ inchangés', async ({
    browser,
  }) => {
    const withArabic = `e2e_m1625_${letters(8)}`;
    const without = `e2e_m1625_${letters(8)}`;
    const frWith = `Spécialité arabe ${withArabic}`;
    const frWithout = `Spécialité française ${without}`;
    const ar = `تخصص تجريبي ${letters(4)}`;
    for (const [code, labelFr, labelAr] of [
      [withArabic, frWith, ar],
      [without, frWithout, undefined],
    ] as const) {
      const response = await admin.post(`${API}/api/admin/vocabulary/directory`, {
        data: { kind: 'specialty', code, labelFr, ...(labelAr ? { labelAr } : {}) },
      });
      expect(response.status(), await response.text()).toBe(201);
      created.push(code);
    }

    // Praticien jetable (session ouverte par la confirmation) dont le profil porte les deux.
    const practitioner = await playwrightRequest.newContext();
    const account = await register(practitioner, 'm16-25.libelles');
    await confirmEmail(practitioner, account.email);
    const put = await practitioner.put(`${API}/api/me/profile`, {
      data: { displayName: 'Alix Essai', specialties: [withArabic, without] },
    });
    expect(put.status(), await put.text()).toBe(200);

    const context = await projectContext(browser);
    const page = await context.newPage();
    try {
      await shareSession(practitioner, context);
      /** Puces choisies du profil dont le texte est exactement ce libellé. */
      const chip = (label: string) =>
        page.locator('pm-chip-picker .chips li span').filter({ hasText: label });

      await page.goto('/ar/mon-compte/profil-public');
      await settled(page);
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await expect(chip(ar)).toHaveText(ar);
      await expect(chip(frWithout)).toHaveText(frWithout);
      await expect(chip(frWith)).toHaveCount(0);
      await expectNoAxeViolations(page);

      for (const locale of ['fr', 'en']) {
        await page.goto(`/${locale}/mon-compte/profil-public`);
        await settled(page);
        await expect(chip(frWith)).toHaveText(frWith);
        await expect(chip(frWithout)).toHaveText(frWithout);
        await expect(chip(ar)).toHaveCount(0);
      }
    } finally {
      await context.close();
      await practitioner.dispose();
    }
  });
});
