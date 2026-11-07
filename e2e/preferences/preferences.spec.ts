import AxeBuilder from '@axe-core/playwright';
import { expect, Page, test } from '@playwright/test';

import { createAccount, signIn } from './accounts';

// Fiche 14, M1-16 : contre l'API locale (seed small, Mailpit), jamais de mock du backend. Chaque test
// crée son compte jetable : les préférences sont par compte et les tests tournent en parallèle.

const PREFERENCES = '/fr/mon-compte/preferences';
const PATCH = (response: { url(): string; request(): { method(): string } }): boolean =>
  response.url().endsWith('/api/me/preferences') && response.request().method() === 'PATCH';

async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
}

async function openPreferences(page: Page): Promise<void> {
  await page.goto(PREFERENCES);
  await expect(page.getByRole('heading', { level: 1, name: 'Préférences' })).toBeVisible();
  // Le contenu n'apparaît qu'avec la réponse du serveur (état chargement avant).
  await expect(page.getByRole('group', { name: "Vue d'ensemble par défaut" })).toBeVisible();
}

test('thème : appliqué sans rechargement, PATCH envoyé, conservé dans un autre navigateur', async ({
  page,
  browser,
  request,
}) => {
  const account = await createAccount(request, 'm1-16.theme', 'psychologist');
  await signIn(page, account);
  await openPreferences(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('radio', { name: 'Clair' })).toBeChecked();

  const patch = page.waitForResponse(PATCH);
  await page.getByText('Sombre', { exact: true }).click();
  // Appliqué tout de suite : data-theme change avant même la réponse du serveur.
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const response = await patch;
  expect(response.status()).toBe(200);
  expect(response.request().postDataJSON()).toEqual({ theme: 'dark' });
  expect((await response.json()).theme).toBe('dark');
  await expect(page.getByRole('status').filter({ hasText: /^Enregistré à/ })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Sombre' })).toBeChecked();
  await expectNoAxeViolations(page);

  // Le cache de démarrage est écrit : au rechargement, le thème est là avant la réponse du serveur.
  const cached = await page.evaluate(() => localStorage.getItem('prefs'));
  expect(JSON.parse(cached ?? '{}').theme).toBe('dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  // Un autre contexte de navigateur (aucun cookie, aucun localStorage) : reconnexion → thème conservé.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await signIn(otherPage, account);
  await expect(otherPage.locator('html')).toHaveAttribute('data-theme', 'dark');
  await otherPage.goto(PREFERENCES);
  await expect(otherPage.getByRole('radio', { name: 'Sombre' })).toBeChecked();
  await other.close();
});

test('erreur du serveur sur le PATCH : valeur serveur rétablie et toast', async ({
  page,
  request,
}) => {
  const account = await createAccount(request, 'm1-16.erreur', 'psychologist');
  await signIn(page, account);
  await openPreferences(page);

  // Le client vérifie la forme (entier), le serveur juge la plage : 999 → 422 VALIDATION_FAILED.
  const duration = page.getByRole('spinbutton', { name: 'Durée de séance par défaut' });
  await expect(duration).toHaveValue('60');
  const patch = page.waitForResponse(PATCH);
  await duration.fill('999');
  await duration.press('Tab');
  expect((await patch).status()).toBe(422);

  const toast = page
    .getByRole('region', { name: /Notifications|notifications/ })
    .or(page.locator('pm-toast-outlet'));
  await expect(
    toast.getByText(/Réglage non enregistré : Un entier entre 15 et 180 est attendu\./),
  ).toBeVisible();
  await expect(duration).toHaveValue('60');
  await expectNoAxeViolations(page);

  // Le serveur n'a rien appliqué : un rechargement relit 60.
  await page.reload();
  await expect(page.getByRole('spinbutton', { name: 'Durée de séance par défaut' })).toHaveValue(
    '60',
  );
});

test('coach nouvellement inscrit : « client » et type médicament masqué sans action', async ({
  page,
  request,
}) => {
  const account = await createAccount(request, 'm1-16.coach', 'coach');
  await signIn(page, account);
  await openPreferences(page);

  const subject = page.getByRole('group', { name: 'Désignation des personnes suivies' });
  await expect(subject.getByRole('button', { name: 'Client·e' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(subject.getByRole('button', { name: 'Patient·e' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  // Le pipe subjectLabel suit la préférence : l'aide de la ligne parle de « clients ».
  await expect(page.locator('#subject-help')).toContainText('« clients »');
  await expect(page.getByRole('switch')).not.toBeChecked();
  await expect(page.getByRole('spinbutton', { name: 'Durée de séance par défaut' })).toHaveValue(
    '60',
  );
  await expect(page.getByRole('combobox', { name: 'Langue' })).toHaveValue('fr');

  // Passer à « Patient·e » : optimiste, PATCH de la seule clé, l'aide suit sans rechargement.
  const patch = page.waitForResponse(PATCH);
  await subject.getByRole('button', { name: 'Patient·e' }).click();
  await expect(subject.getByRole('button', { name: 'Patient·e' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('#subject-help')).toContainText('« patients »');
  expect((await patch).request().postDataJSON()).toEqual({ 'vocabulary.subjectLabel': 'patient' });
  await expectNoAxeViolations(page);
});

test('clé inconnue dans le PATCH : ignorée, 200, les 9 clés renvoyées', async ({
  page,
  request,
}) => {
  // `request` porte la session ouverte par la confirmation d'e-mail (e2e/support/accounts.ts).
  const account = await createAccount(request, 'm1-16.inconnue', 'psychologist');
  const response = await request.patch('http://localhost:8080/api/me/preferences', {
    data: { 'overview.window': '12m', cleInconnue: 'ignorée' },
  });
  expect(response.status(), await response.text()).toBe(200);
  const body = (await response.json()) as Record<string, unknown>;
  expect(Object.keys(body).sort()).toEqual(
    [
      'entries.defaultVisibility',
      'entryTypes.medicationVisible',
      'locale',
      'overview.view',
      'overview.window',
      'sessions.defaultDurationMin',
      'theme',
      'timeline.groupBy',
      'vocabulary.subjectLabel',
    ].sort(),
  );
  expect(body['overview.window']).toBe('12m');
  expect('cleInconnue' in body).toBe(false);

  // L'écran relit les 9 clés telles quelles : « 1 an » actif, rien d'autre changé.
  await signIn(page, account);
  await openPreferences(page);
  const window = page.getByRole('group', { name: "Fenêtre d'analyse" });
  await expect(window.getByRole('button', { name: '1 an' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('spinbutton', { name: 'Durée de séance par défaut' })).toHaveValue(
    '60',
  );
  await expectNoAxeViolations(page);
});

test('localStorage.prefs corrompu : l’application démarre quand même', async ({
  page,
  request,
}) => {
  const account = await createAccount(request, 'm1-16.cache', 'psychologist');
  await page.addInitScript(() => localStorage.setItem('prefs', '{{{ pas du json'));
  await page.goto('/fr/connexion');
  await expect(page.getByRole('heading', { level: 1, name: 'Connexion' })).toBeVisible();
  await signIn(page, account);
  await openPreferences(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  // Le cache a été remplacé par la réponse du serveur.
  const cached = await page.evaluate(() => localStorage.getItem('prefs'));
  expect(JSON.parse(cached ?? '{}')['sessions.defaultDurationMin']).toBe(60);
  await expectNoAxeViolations(page);
});

test('langue : English recharge la page dans l’autre bundle, et la préférence suit à la connexion', async ({
  page,
  browser,
  request,
}) => {
  const account = await createAccount(request, 'm1-16.langue', 'psychologist');
  await signIn(page, account);
  await openPreferences(page);

  const patch = page.waitForResponse(PATCH);
  await page.getByRole('combobox', { name: 'Langue' }).selectOption('en');
  expect((await patch).status()).toBe(200);
  await expect(page).toHaveURL(/\/en\/mon-compte\/preferences$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { level: 1, name: 'Preferences' })).toBeVisible();
  await expectNoAxeViolations(page);

  // Autre navigateur, connexion depuis la page française : la langue du compte est suivie.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto('/fr/connexion');
  await otherPage.getByLabel('Adresse e-mail').fill(account.email);
  await otherPage.getByLabel('Mot de passe', { exact: true }).fill(account.password);
  await otherPage.getByRole('button', { name: 'Se connecter' }).click();
  await expect(otherPage).toHaveURL(/\/en\/patients$/);
  await other.close();
});

test('parcours clavier et axe-core', async ({ page, request }) => {
  const account = await createAccount(request, 'm1-16.a11y', 'psychiatrist');
  await signIn(page, account);
  await openPreferences(page);
  await expect(page.getByRole('switch')).toBeChecked();
  await expectNoAxeViolations(page);

  // Au clavier : focus sur « Simple », Tab vers « Complète », puis Entrée enregistre.
  const group = page.getByRole('group', { name: "Vue d'ensemble par défaut" });
  await group.getByRole('button', { name: 'Simple' }).focus();
  await page.keyboard.press('Tab');
  await expect(group.getByRole('button', { name: 'Complète' })).toBeFocused();
  const patch = page.waitForResponse(PATCH);
  await page.keyboard.press('Enter');
  await expect(group.getByRole('button', { name: 'Complète' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect((await patch).request().postDataJSON()).toEqual({ 'overview.view': 'complete' });

  // Les vignettes de thème sont de vrais boutons radio : flèches entre eux.
  await page.getByRole('radio', { name: 'Clair' }).focus();
  const themePatch = page.waitForResponse(PATCH);
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: 'Doux' })).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'soft');
  expect((await themePatch).request().postDataJSON()).toEqual({ theme: 'soft' });
  await expectNoAxeViolations(page);
});
