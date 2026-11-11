import { APIRequestContext, expect, Page, test } from '@playwright/test';

import { createAccount, signIn } from '../preferences/accounts';
import { expectNoAxeViolations } from '../support/axe';
import { keyboardOnly } from '../support/clavier';

// UX-B6 (audit UX du 9 nov. 2026, fiche 05 §4 et état A de la maquette) : la combobox d'émotion de
// l'éditeur d'entrée, au clavier seul, contre l'API locale (seed small), jamais de mock du backend.
// Liste filtrée par préfixe avec pastille et famille en suffixe, ligne finale « Créer l'émotion
// personnalisée « … » » avec choix de famille (POST /api/me/emotions), émotion créée proposée au
// ressenti suivant sans rechargement, 409 EMOTION_LABEL_EXISTS sous le champ ; curseur à 5 par
// défaut ; pas de débordement à 375 px. axe à 0 liste ouverte et fieldset de famille ouvert.

const API = 'http://localhost:8080';

async function createPatient(api: APIRequestContext, displayName: string): Promise<string> {
  const response = await api.post(`${API}/api/patients`, { data: { displayName } });
  expect(response.status(), await response.text()).toBe(201);
  return ((await response.json()) as { id: string }).id;
}

/** La séance d'accueil est créée de façon asynchrone après le patient : on l'attend. */
async function waitIntake(api: APIRequestContext, patientId: string): Promise<void> {
  await expect
    .poll(
      async () => (await api.get(`${API}/api/patients/${patientId}/sessions/current`)).status(),
      { timeout: 10_000 },
    )
    .toBe(200);
}

function editor(page: Page) {
  const dialog = page.locator('[role="dialog"]:has(pm-entry-editor-panel)');
  return {
    dialog,
    feeling: dialog.getByRole('button', { name: 'Ressenti', exact: true }),
    emotion: dialog.getByRole('combobox', { name: 'Émotion' }),
    list: dialog.getByRole('listbox', { name: 'Émotions' }),
    options: dialog.getByRole('listbox', { name: 'Émotions' }).getByRole('option'),
    slider: dialog.getByRole('slider'),
  };
}

/** N, puis → jusqu'à Ressenti, Tab jusqu'à la combobox (fiche 05 : Tab suit l'ordre des blocs). */
async function openFeeling(page: Page): Promise<ReturnType<typeof editor>> {
  const e = editor(page);
  await page.keyboard.press('n');
  await expect(e.dialog).toBeVisible();
  await expect(e.dialog.getByRole('button', { name: 'Note', exact: true })).toBeFocused();
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
  await expect(e.feeling).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Tab');
  await expect(e.emotion).toBeFocused();
  await expect(e.dialog.locator('pm-state [aria-busy="true"]')).toHaveCount(0);
  return e;
}

test.describe('combobox d’émotion (UX-B6)', () => {
  test.describe.configure({ timeout: 120_000 });

  test('au clavier : « anx » filtrée avec famille, création d’une émotion personnalisée, 409 sous le champ', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'ux-b6.combobox', 'psychologist');
    const patientId = await createPatient(request, 'Inès V.');
    await waitIntake(request, patientId);
    await signIn(page, account);
    const keys = await keyboardOnly(page);
    await page.goto(`/fr/patients/${patientId}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Inès V.');

    // 1. Sous-titre : le patient ; curseur à 5 par défaut, gradué de 1 à 10.
    const e = await openFeeling(page);
    await expect(e.dialog.locator('.subtitle')).toHaveText('Inès V.');
    await expect(e.slider).toHaveAttribute('aria-valuenow', '5');
    await expect(e.slider).toHaveAttribute('aria-valuemin', '1');
    await expect(e.slider).toHaveAttribute('aria-valuemax', '10');

    // 2. « anx » : liste filtrée, pastille et famille en suffixe, préfixe surligné ; création
    // proposée en dernière ligne (3 lettres, aucun libellé identique).
    await page.keyboard.type('anx');
    await expect(e.emotion).toHaveAttribute('aria-expanded', 'true');
    const anxiety = e.options.filter({ hasText: /^Anxiété/ });
    await expect(anxiety).toHaveCount(1);
    await expect(anxiety.locator('.tag')).toHaveText('peur');
    await expect(anxiety.locator('.dot.family-fear')).toHaveCount(1);
    await expect(anxiety.locator('mark')).toHaveText('Anx');
    await expect(e.options.last()).toContainText("Créer l'émotion personnalisée « anx »");
    await expectNoAxeViolations(page);

    // ↓ ⏎ choisit Anxiété ; le champ garde la pastille et « famille peur ».
    await page.keyboard.press('ArrowDown');
    await expect(e.emotion).toHaveAttribute('aria-activedescendant', /.+/);
    await page.keyboard.press('Enter');
    await expect(e.emotion).toHaveValue('Anxiété');
    await expect(e.emotion).toHaveAttribute('aria-expanded', 'false');
    await expect(e.dialog.locator('pm-emotion-combobox .suffix')).toHaveText('famille peur');

    // 3. Un libellé inconnu : la dernière ligne crée l'émotion, la famille se choisit au clavier.
    const label = `Rumination ${Date.now() % 100000}`;
    await page.keyboard.press('Control+a');
    await page.keyboard.type(label);
    const create = e.options.last();
    await expect(create).toContainText(`Créer l'émotion personnalisée « ${label} »`);
    await page.keyboard.press('ArrowUp');
    await expect(create).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Enter');
    const families = e.dialog.locator('fieldset.create');
    await expect(families).toBeVisible();
    await expect(families.locator('legend')).toContainText(`Famille de « ${label} »`);
    const firstFamily = families.getByRole('radio').first();
    await expect(firstFamily).toBeFocused();
    await page.keyboard.press('Space');
    await expect(firstFamily).toBeChecked();
    await expectNoAxeViolations(page);
    const posted = page.waitForResponse(
      (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/me/emotions',
    );
    await page.keyboard.press('Enter');
    const response = await posted;
    expect(response.status(), await response.text()).toBe(201);
    expect(response.request().postDataJSON()).toEqual({ labelFr: label, family: 'joy' });
    const created = (await response.json()) as { code: string };
    await expect(families).toBeHidden();
    await expect(e.emotion).toBeFocused();
    await expect(e.emotion).toHaveValue(label);
    await expect(e.dialog.locator('pm-emotion-combobox .suffix')).toHaveText('famille joie');

    // 4. Tab → curseur (5), → monte à 6, Tab → texte, ⏎ enregistre avec l'émotion créée.
    await page.keyboard.press('Tab');
    await expect(e.slider).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(e.slider).toHaveAttribute('aria-valuenow', '6');
    await page.keyboard.press('Tab');
    await page.keyboard.type('ressasse la réunion');
    const saved = page.waitForResponse(
      (r) =>
        r.request().method() === 'POST' &&
        new URL(r.url()).pathname === `/api/patients/${patientId}/entries`,
    );
    await page.keyboard.press('Enter');
    const entry = await saved;
    expect(entry.status(), await entry.text()).toBe(201);
    expect(entry.request().postDataJSON()).toMatchObject({
      type: 'feeling',
      feeling: { emotionCode: created.code, intensity: 6 },
      body: 'ressasse la réunion',
    });
    await expect(e.dialog).toBeHidden();

    // 5. Second ressenti sans rechargement : l'émotion créée est proposée, sans ligne de création.
    const again = await openFeeling(page);
    await page.keyboard.type(label.slice(0, 6));
    const mine = again.options.filter({ hasText: label });
    await expect(mine).toHaveCount(1);
    await expect(mine.locator('.tag')).toHaveText('joie · personnalisée');

    // 6. 409 EMOTION_LABEL_EXISTS : un libellé pris entre-temps (créé ailleurs) s'affiche sous le champ.
    const taken = `Lassitude ${Date.now() % 100000}`;
    await page.keyboard.press('Control+a');
    await page.keyboard.type(taken);
    await expect(again.options.last()).toContainText(`Créer l'émotion personnalisée « ${taken} »`);
    const elsewhere = await request.post(`${API}/api/me/emotions`, {
      data: { labelFr: taken, family: 'sadness' },
    });
    expect(elsewhere.status(), await elsewhere.text()).toBe(201);
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    const fieldset = again.dialog.locator('fieldset.create');
    await expect(fieldset).toBeVisible();
    await page.keyboard.press('Space');
    const refused = page.waitForResponse(
      (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/me/emotions',
    );
    await page.keyboard.press('Enter');
    expect((await refused).status()).toBe(409);
    await expect(fieldset.locator('.error[role="alert"]')).toContainText(
      'Une émotion porte déjà ce libellé',
    );
    await expectNoAxeViolations(page);
    keys.expectNoPointer();
  });

  test('375 px : aucun débordement horizontal du panneau, ressenti ouvert et liste dépliée', async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const account = await createAccount(request, 'ux-b6.375', 'psychologist');
    const patientId = await createPatient(request, 'Léa M.');
    await waitIntake(request, patientId);
    await signIn(page, account);
    await page.goto(`/fr/patients/${patientId}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Léa M.');
    const e = await openFeeling(page);
    await page.keyboard.type('tri');
    await expect(e.options.first()).toBeVisible();
    const sizes = await page.evaluate(() => {
      const body = document.querySelector('pm-entry-editor-panel .panel-body');
      return {
        page: document.documentElement.scrollWidth,
        body: body ? body.scrollWidth - body.clientWidth : -1,
      };
    });
    expect(sizes.page).toBeLessThanOrEqual(375);
    expect(sizes.body).toBe(0);
    await expectNoAxeViolations(page);
  });
});
