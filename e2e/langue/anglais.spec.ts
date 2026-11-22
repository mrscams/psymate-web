import { expect, Page, Request, test } from '@playwright/test';

import { createAccount, signIn } from '../preferences/accounts';
import { uniqueEmail } from '../support/accounts';
import { expectNoAxeViolations } from '../support/axe';

// Anglais de bout en bout, contre l'API réelle (jamais de mock du backend). Deux choses :
// - l'agenda (fiches 15 et 15b), dernier écran resté en français dans le bundle /en/ ;
// - la langue de l'écran annoncée à l'API (Accept-Language, core/http locale.interceptor) : le
//   serveur écrit ses messages dans la langue de l'application, pas dans celle du navigateur.
// Le navigateur des e2e est en fr-FR (playwright.config.ts), ce qui rend le second point visible.

const API = 'http://localhost:8080';

const LOGIN = (request: Request) =>
  request.method() === 'POST' && new URL(request.url()).pathname === '/api/auth/login';

/** Identifiants refusés sur l'écran de connexion : l'en-tête envoyé et le message du serveur. */
async function refusedSignIn(page: Page, locale: 'fr' | 'en') {
  await page.goto(`/${locale}/connexion`);
  await page
    .getByLabel(locale === 'fr' ? 'E-mail professionnel' : 'Work email')
    .fill(uniqueEmail('langue.inconnu'));
  await page
    .getByLabel(locale === 'fr' ? 'Mot de passe' : 'Password', { exact: true })
    .fill('Mauvais-Mot-De-Passe-2026');
  const sent = page.waitForRequest(LOGIN);
  await page.getByRole('button', { name: locale === 'fr' ? 'Se connecter' : 'Sign in' }).click();
  const request = await sent;
  const response = await request.response();
  expect(response?.status()).toBe(401);
  return {
    acceptLanguage: await request.headerValue('accept-language'),
    detail: ((await response?.json()) as { detail: string }).detail,
  };
}

test('agenda en anglais : barre, vues, rail, liste vide et panneau « New appointment »', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const account = await createAccount(request, 'langue.agenda', 'psychologist');
  // La langue du compte est suivie à la connexion (fiche 14) : on la passe à l'anglais d'abord.
  const saved = await request.patch(`${API}/api/me/preferences`, { data: { locale: 'en' } });
  expect(saved.status(), await saved.text()).toBe(200);
  await signIn(page, account, 'en');

  const agendaCall = page.waitForRequest((req) => new URL(req.url()).pathname === '/api/agenda');
  await page
    .locator('pm-nav-rail.app-rail')
    .getByRole('link', { name: 'Calendar', exact: true })
    .click();
  await expect(page).toHaveURL(/\/en\/agenda/);
  expect(await (await agendaCall).headerValue('accept-language')).toBe('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { level: 1, name: 'Calendar' })).toBeVisible();
  await expect(page).toHaveTitle('Calendar · PsyMate');

  await expect(page.getByRole('button', { name: 'Today', exact: true })).toBeVisible();
  const views = page.getByRole('group', { name: 'View' });
  for (const name of ['Day', 'Week', 'Month', 'List']) {
    await expect(views.getByRole('button', { name, exact: true })).toBeVisible();
  }
  const rail = page.getByRole('complementary', { name: 'Calendar navigation' });
  await expect(rail.getByText('My calendars')).toBeVisible();
  for (const name of ['In-person sessions', 'Video sessions', 'Contacts (calls)']) {
    await expect(rail.getByRole('checkbox', { name })).toBeChecked();
  }
  await expect(rail.getByText('coming soon')).toBeVisible();

  await views.getByRole('button', { name: 'Week', exact: true }).click();
  await expect(page.locator('.toolbar .meta')).toContainText('no session');
  await expectNoAxeViolations(page);

  await views.getByRole('button', { name: 'List', exact: true }).click();
  await expect(page.getByText('No appointments in the next 30 days')).toBeVisible();

  await page.getByRole('button', { name: '+ Appointment' }).click();
  const panel = page.getByRole('dialog');
  await expect(panel.getByRole('heading', { name: 'New appointment' })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Schedule the appointment' })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Cancel Esc', exact: true })).toBeVisible();
  await expectNoAxeViolations(page);

  // Aucun texte français de l'agenda n'est resté dans la version anglaise.
  await expect(page.locator('body')).not.toContainText(
    /Rendez-vous|Aujourd|Semaine|Séance|Modalité|Planifier|Créneau/i,
  );
});

test('langue de l’API : écran en anglais sur un navigateur français, le serveur répond en anglais', async ({
  page,
}) => {
  const refused = await refusedSignIn(page, 'en');
  expect(refused.acceptLanguage).toBe('en');
  expect(refused.detail).toMatch(/password/i);
  await expectNoAxeViolations(page);
});

test('langue de l’API : écran en français sur un navigateur anglais, le serveur répond en français', async ({
  browser,
}) => {
  const context = await browser.newContext({ locale: 'en-US' });
  const page = await context.newPage();
  const refused = await refusedSignIn(page, 'fr');
  expect(refused.acceptLanguage).toBe('fr');
  expect(refused.detail).toMatch(/mot de passe/i);
  await expectNoAxeViolations(page);
  await context.close();
});
