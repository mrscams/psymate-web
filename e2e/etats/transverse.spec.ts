import { APIRequestContext, expect, Page, test } from '@playwright/test';

import { createPatient, intakeOf } from '../flux-5-timeline/timeline-data';
import { expectNoAxeViolations } from '../support/axe';
import { practitioner, shareSession, shoot } from './etats-support';

const API = 'http://localhost:8080';

// Planche 29 (M6-03) : état transverse hors ligne et raccourcis de B2 (1 2 3, M, N, L,
// Échap, /) branchés et inactifs dans un champ, contre l'API réelle sur un compte jetable. Le 429
// n'est pas provoqué ici (il faudrait saturer le quota de 600 requêtes par minute) : il est couvert
// en Vitest par core/http (retry-after.interceptor.spec.ts) et shared/ui/toast.

let api: APIRequestContext;
let patientId: string;

test.describe.configure({ timeout: 90_000 });

test.beforeAll(async () => {
  api = await practitioner('m6-03.transverse');
  patientId = await createPatient(api, 'Noé T.');
  await intakeOf(api, patientId);
  // Le bloc de saisie n'existe qu'en séance (UX-S1).
  const start = await api.post(`${API}/api/patients/${patientId}/sessions/start`, {
    data: { modality: 'in_person' },
  });
  expect(start.status(), await start.text()).toBe(201);
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
  // Pendant l'attente, la liste déjà affichée reste grisée (planche 29) par son fond, sans perdre
  // de contraste (M7-04) : axe vérifie toute la page, tableau compris.
  await expect(page.locator('pm-patient-table table.refreshing')).toBeVisible();
  await expectNoAxeViolations(page);
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
  // Séance ouverte : l'onglet 1 est l'onglet Séance (UX-S3).
  await page.keyboard.press('1');
  await expect(page).toHaveURL(new RegExp(`/patients/${patientId}/session$`));

  // Dans le bloc de saisie (champ), les chiffres et les lettres s'écrivent.
  const capture = page.getByRole('textbox', { name: 'Noter quelque chose' });
  await capture.click();
  await page.keyboard.type('2 3 m n l');
  await expect(capture).toHaveValue('2 3 m n l');
  await expect(page).toHaveURL(new RegExp(`/patients/${patientId}/session$`));
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
  await expectNoAxeViolations(page);
});
