import AxeBuilder from '@axe-core/playwright';
import { APIRequestContext, expect, Page, test } from '@playwright/test';

import { createPatient, intakeOf } from '../flux-5-timeline/timeline-data';
import { expectNoAxeViolations } from '../support/axe';
import { getOf, practitioner, shareSession, shoot } from './etats-support';

// Planche 29 (M6-03) : états transverses (hors ligne, 429) et raccourcis de B2 (1 2 3, M, N, L,
// Échap, /) branchés et inactifs dans un champ, contre l'API réelle sur un compte jetable.

let api: APIRequestContext;
let patientId: string;

test.describe.configure({ timeout: 90_000 });

test.beforeAll(async () => {
  api = await practitioner('m6-03.transverse');
  patientId = await createPatient(api, 'Noé T.');
  await intakeOf(api, patientId);
});

test.afterAll(async () => {
  await api.dispose();
});

test.beforeEach(async ({ context }) => {
  await shareSession(api, context);
});

async function openDossier(page: Page): Promise<void> {
  await page.goto(`/fr/patients/${patientId}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Noé T.');
}

test('hors ligne : bandeau « Connexion perdue », lecture rejouée au retour du réseau', async ({
  page,
  context,
}) => {
  await page.goto('/fr/patients');
  const filter = page.locator('#patients-filter');
  await expect(page.getByRole('link', { name: /Noé T\./ }).first()).toBeVisible();
  // Une lecture émise hors ligne (filtre de la liste) est retenue par l'intercepteur.
  await context.setOffline(true);
  await filter.fill('Noé');
  const banner = page.getByRole('status').filter({ hasText: 'Connexion perdue' });
  await expect(banner).toBeVisible();
  await shoot(page, '29-hors-ligne');
  // Pendant l'attente, la liste déjà affichée reste grisée (planche 29) : axe ne vérifie ici que le
  // bandeau ; la page entière est vérifiée au retour du réseau.
  const bannerAxe = await new AxeBuilder({ page })
    .include('pm-network-banner')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(bannerAxe.violations).toEqual([]);
  const replayed = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/patients' && r.ok(),
  );
  await context.setOffline(false);
  await replayed;
  await expect(banner).toHaveCount(0);
  await expect(page.locator('pm-state .state.error')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Noé T\./ }).first()).toBeVisible();
  await expectNoAxeViolations(page);
});

test('429 : avertissement avec le délai, lecture rejouée sans action', async ({ page }) => {
  let refused = false;
  const timeline = getOf(`/api/patients/${patientId}/timeline`);
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    if (refused || !timeline(new URL(request.url()), request.method())) return route.fallback();
    refused = true;
    await route.fulfill({
      status: 429,
      contentType: 'application/problem+json',
      headers: { 'Retry-After': '2' },
      body: JSON.stringify({
        type: 'about:blank',
        title: 'Too Many Requests',
        status: 429,
        detail: 'Trop de requêtes.',
        code: 'RATE_LIMITED',
        retryAfterSeconds: 2,
      }),
    });
  });
  const replayed = page.waitForResponse(
    (r) => new URL(r.url()).pathname === `/api/patients/${patientId}/timeline` && r.ok(),
  );
  await page.goto(`/fr/patients/${patientId}/timeline`);
  await expect(page.getByText(/Trop de requêtes, réessayez dans/)).toBeVisible();
  await expectNoAxeViolations(page);
  await shoot(page, '29-trop-de-requetes');
  await replayed;
  await expect(page.locator('pm-state .state.error')).toHaveCount(0);
});

test('raccourcis 1 2 3 et M : branchés hors champ, inactifs dans la barre de saisie', async ({
  page,
}) => {
  await openDossier(page);
  await page.keyboard.press('2');
  await expect(page).toHaveURL(new RegExp(`/patients/${patientId}/timeline`));
  const session = page.getByRole('button', { name: 'Par séance' });
  const chrono = page.getByRole('button', { name: 'Chronologique' });
  await expect(session.or(chrono).first()).toBeVisible();
  const before = await chrono.getAttribute('aria-pressed');
  await page.keyboard.press('m');
  await expect(chrono).not.toHaveAttribute('aria-pressed', before ?? 'false');
  await page.keyboard.press('m');
  await expect(chrono).toHaveAttribute('aria-pressed', before ?? 'false');

  await page.keyboard.press('3');
  await expect(page).toHaveURL(new RegExp(`/patients/${patientId}/graph`));
  await page.keyboard.press('1');
  await expect(page).toHaveURL(new RegExp(`/patients/${patientId}$`));

  // Dans la barre de saisie (champ), les chiffres et les lettres s'écrivent.
  const capture = page.getByRole('textbox', { name: 'Noter quelque chose' });
  await capture.click();
  await page.keyboard.type('2 3 m n l');
  await expect(capture).toHaveValue('2 3 m n l');
  await expect(page).toHaveURL(new RegExp(`/patients/${patientId}$`));
  await expect(page.locator('pm-entry-editor-panel')).toHaveCount(0);
  await expectNoAxeViolations(page);
});

test('raccourcis N, L et Échap : éditeur d’entrée, éditeur de lien, fermeture', async ({
  page,
}) => {
  await openDossier(page);
  await page.keyboard.press('n');
  const editor = page.locator('pm-entry-editor-panel');
  await expect(editor).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(editor).toHaveCount(0);

  // L lie l'entrée ouverte (?entry=) : la séance d'accueil.
  const intake = await intakeOf(api, patientId);
  await page.goto(`/fr/patients/${patientId}?entry=${intake}`);
  await expect(editor).toBeVisible();
  await page.locator('body').focus();
  await editor.getByRole('heading').first().click();
  await page.keyboard.press('l');
  const links = page.locator('pm-link-editor-panel');
  await expect(links).toBeVisible();
  await expectNoAxeViolations(page);
  await page.keyboard.press('Escape');
  await expect(links).toHaveCount(0);
  await expect(editor).toBeVisible();
});

test('liste des patients : / donne le focus au filtre, où N s’écrit', async ({ page }) => {
  await page.goto('/fr/patients');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mes patients');
  await page.keyboard.press('/');
  const filter = page.locator('#patients-filter');
  await expect(filter).toBeFocused();
  await page.keyboard.type('n');
  await expect(filter).toHaveValue('n');
  await expect(page).toHaveURL(/\/fr\/patients(\?.*)?$/);
});
