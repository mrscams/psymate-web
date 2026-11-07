import { APIRequestContext, expect, Page, test } from '@playwright/test';

import { register, TestAccount, uniqueEmail } from '../support/accounts';
import { expectNoAxeViolations } from '../support/axe';

// B3 flux 9, confirmation d'e-mail (M1-18, fiche 25) : lien lu dans Mailpit, session ouverte,
// lien réutilisé → page expirée, renvoi limité, correction de l'adresse. Contre l'API locale et
// Mailpit, jamais de mock.

const API = 'http://localhost:8080';
const MAILPIT = 'http://localhost:8025';
const TOKEN = /confirmer-email\/([A-Za-z0-9_.~%-]+)/;

/**
 * Jetons de confirmation reçus par une adresse, du plus récent au plus ancien (attend jusqu'à
 * 15 s le nombre voulu). Le lien de l'e-mail pointe sur le frontend configuré côté API : seul le
 * jeton compte, la page /fr/confirmer-email/:token le consomme.
 */
async function confirmationTokens(
  api: APIRequestContext,
  email: string,
  atLeast = 1,
): Promise<string[]> {
  let tokens: string[] = [];
  for (let attempt = 0; attempt < 30 && tokens.length < atLeast; attempt++) {
    const search = await api.get(`${MAILPIT}/api/v1/search`, { params: { query: `to:${email}` } });
    const body = (await search.json()) as { messages?: { ID: string; Created: string }[] };
    const messages = [...(body.messages ?? [])].sort((a, b) => b.Created.localeCompare(a.Created));
    tokens = [];
    for (const message of messages) {
      const full = await api.get(`${MAILPIT}/api/v1/message/${message.ID}`);
      const match = TOKEN.exec(((await full.json()) as { Text?: string }).Text ?? '');
      if (match) tokens.push(decodeURIComponent(match[1]));
    }
    if (tokens.length < atLeast) await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return tokens;
}

async function messageCount(api: APIRequestContext, email: string): Promise<number> {
  const search = await api.get(`${MAILPIT}/api/v1/search`, { params: { query: `to:${email}` } });
  return (((await search.json()) as { messages?: unknown[] }).messages ?? []).length;
}

/**
 * L'e-mail d'inscription compte dans la limite « 1 envoi par minute et par compte » de l'API
 * (renvoi et correction d'adresse compris) : un renvoi plus tôt reçoit 202 mais rien ne part. Les
 * tests qui renvoient attendent donc la fin de cette minute après l'inscription.
 */
const RESEND_WINDOW_MS = 61_000;

async function registerForResend(
  api: APIRequestContext,
  prefix: string,
): Promise<TestAccount & { resendAllowedAt: number }> {
  const account = await register(api, prefix);
  return { ...account, resendAllowedAt: Date.now() + RESEND_WINDOW_MS };
}

async function waitForResendWindow(account: { resendAllowedAt: number }): Promise<void> {
  const remaining = account.resendAllowedAt - Date.now();
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
}

/** Connexion d'un compte email_pending : 403 EMAIL_NOT_CONFIRMED → l'intercepteur mène à l'écran 25. */
async function loginUnconfirmed(page: Page, account: TestAccount): Promise<void> {
  await page.goto('/fr/connexion');
  await page.getByLabel('Adresse e-mail').fill(account.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/fr\/confirmer-email$/);
}

/** Tabule jusqu'au champ voulu (sans souris) ; échoue après 40 tabulations. */
async function tabTo(page: Page, id: string): Promise<void> {
  for (let i = 0; i < 40; i++) {
    if ((await page.evaluate(() => document.activeElement?.id)) === id) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`le focus n'a jamais atteint #${id}`);
}

test('compte non confirmé : 403 EMAIL_NOT_CONFIRMED → écran 25 avec l’adresse ; lien Mailpit → session ouverte, liste vide ; lien réutilisé → expiré', async ({
  page,
  request,
}) => {
  const account = await register(request, 'm1-18.confirm');

  // Tant que l'adresse n'est pas confirmée, rien ne s'ouvre : le login répond 403 EMAIL_NOT_CONFIRMED.
  const login = await request.post(`${API}/api/auth/login`, {
    data: { email: account.email, password: account.password },
  });
  expect(login.status()).toBe(403);
  expect(((await login.json()) as { code: string }).code).toBe('EMAIL_NOT_CONFIRMED');

  await loginUnconfirmed(page, account);
  await expect(
    page.getByRole('heading', { level: 1, name: /Un dernier clic : confirmez votre e-mail/ }),
  ).toBeVisible();
  await expect(page.locator('.lead .mono')).toHaveText(account.email);
  await expect(page.getByRole('list').getByRole('listitem')).toHaveCount(3);
  await expect(page.getByRole('button', { name: "Renvoyer l'e-mail" })).toBeVisible();
  await expectNoAxeViolations(page);

  // Le lien de l'e-mail (Mailpit) consomme le jeton : 204, session ouverte, statut docs_pending,
  // liste des patients (vide) avec le bandeau « déposez vos justificatifs ».
  const [token] = await confirmationTokens(request, account.email);
  expect(token).toBeTruthy();
  await page.goto(`/fr/confirmer-email/${encodeURIComponent(token)}`);
  await expect(page).toHaveURL(/\/fr\/patients$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Mes patients' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /justificatifs/ })).toBeVisible();
  const me = await page.request.get('/api/auth/me');
  expect(me.status()).toBe(200);
  expect(((await me.json()) as { verificationStatus: string }).verificationStatus).toBe(
    'docs_pending',
  );
  const patients = await page.request.get('/api/patients');
  expect(patients.status()).toBe(200);

  // Le même lien une seconde fois : 410 → page « expiré » (« a déjà servi »).
  await page.goto(`/fr/confirmer-email/${encodeURIComponent(token)}`);
  await expect(page).toHaveURL(/\/fr\/confirmer-email\/expire$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Ce lien de confirmation a expiré' }),
  ).toBeVisible();
  await expect(page.getByText(/a déjà servi/)).toBeVisible();
  await expectNoAxeViolations(page);
});

test('renvoi : 202, message, bouton désactivé une minute avec compte à rebours ; nouvel e-mail, ancien lien 410 ; adresse inconnue → 202 sans e-mail', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const account = await registerForResend(request, 'm1-18.renvoi');
  const [firstToken] = await confirmationTokens(request, account.email);

  // Arrivée directe : l'adresse n'est pas connue, la carte la demande (clavier seulement).
  await waitForResendWindow(account);
  await page.goto('/fr/confirmer-email');
  await expect(page.locator('#field-email')).toBeVisible();
  await tabTo(page, 'field-email');
  await page.keyboard.type(account.email);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: "Renvoyer l'e-mail" })).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page.getByRole('status').filter({ hasText: 'Demande envoyée' })).toBeVisible();
  const resend = page.getByRole('button', { name: "Renvoyer l'e-mail" });
  await expect(resend).toHaveAttribute('aria-disabled', 'true');
  await expect(resend).toHaveJSProperty('disabled', false); // reste focusable : aria-disabled, pas disabled
  await expect(resend).toHaveAttribute('aria-describedby', 'resend-cooldown');
  await expect(page.locator('#resend-cooldown')).toContainText('Nouveau renvoi possible dans');
  await expect(page.locator('.lead .mono')).toHaveText(account.email);
  await expectNoAxeViolations(page);

  // Second clic pendant le délai : rien ne part (un seul renvoi par minute côté API aussi).
  // dispatchEvent : Playwright attendrait sinon la fin du délai (aria-disabled vaut « désactivé »).
  await resend.dispatchEvent('click');
  await expect.poll(() => messageCount(request, account.email)).toBe(2);
  await page.waitForTimeout(1500);
  expect(await messageCount(request, account.email)).toBe(2);

  // Chaque renvoi invalide le précédent : l'ancien jeton donne 410, le nouveau 204.
  const [newToken] = await confirmationTokens(request, account.email, 2);
  expect(newToken).not.toBe(firstToken);
  const old = await request.post(`${API}/api/auth/email/confirm`, { data: { token: firstToken } });
  expect(old.status()).toBe(410);
  await page.goto(`/fr/confirmer-email/${encodeURIComponent(newToken)}`);
  await expect(page).toHaveURL(/\/fr\/patients$/);

  // Anti-énumération : une adresse inconnue reçoit le même 202 et aucun e-mail.
  const unknown = uniqueEmail('m1-18.inconnu');
  const response = await request.post(`${API}/api/auth/email/resend`, { data: { email: unknown } });
  expect(response.status()).toBe(202);
  await page.waitForTimeout(1000);
  expect(await messageCount(request, unknown)).toBe(0);
});

test('correction de l’adresse : lien à la nouvelle adresse, ancien lien refusé, nouveau accepté, compte sur la nouvelle adresse', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const account = await registerForResend(request, 'm1-18.corrige');
  const [oldToken] = await confirmationTokens(request, account.email);
  const newEmail = uniqueEmail('m1-18.nouvelle');

  await waitForResendWindow(account);
  await loginUnconfirmed(page, account);
  const toggle = page.getByRole('button', { name: "Corriger l'e-mail" });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  // L'adresse actuelle est connue : mot de passe et nouvelle adresse seulement.
  await expect(page.locator('#change-form #field-email')).toHaveCount(0);
  await expect(page.locator('#field-password')).toBeFocused();
  await page.keyboard.type(account.password);
  await page.keyboard.press('Tab');
  await expect(page.locator('#field-newEmail')).toBeFocused();
  await page.keyboard.type(newEmail);
  await page.keyboard.press('Enter');

  // La carte affiche la nouvelle adresse ; 202 quoi qu'il arrive, le message reste prudent.
  await expect(page.locator('.lead .mono')).toHaveText(newEmail);
  await expect(page.getByRole('status').filter({ hasText: newEmail })).toBeVisible();
  await expect(page.locator('#change-form')).toHaveCount(0);
  await expectNoAxeViolations(page);

  const [newToken] = await confirmationTokens(request, newEmail);
  expect(newToken).toBeTruthy();

  // Ancien lien refusé (410) → page expirée ; nouveau lien → session, compte sur la nouvelle adresse.
  await page.goto(`/fr/confirmer-email/${encodeURIComponent(oldToken)}`);
  await expect(page).toHaveURL(/\/fr\/confirmer-email\/expire$/);
  await page.goto(`/fr/confirmer-email/${encodeURIComponent(newToken)}`);
  await expect(page).toHaveURL(/\/fr\/patients$/);
  const me = await page.request.get('/api/auth/me');
  expect(((await me.json()) as { email: string }).email).toBe(newEmail);
});

test('page expirée : « Recevoir un nouveau lien » au clavier → statut, délai d’une minute, lien Se connecter', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const account = await registerForResend(request, 'm1-18.expire');

  await page.goto('/fr/confirmer-email/expire');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Ce lien de confirmation a expiré' }),
  ).toBeVisible();
  await expect(page.getByText(/Nous ne confirmons pas l.existence d.un compte/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Se connecter' })).toBeVisible();
  await expectNoAxeViolations(page);

  await waitForResendWindow(account);
  await tabTo(page, 'field-email');
  await page.keyboard.type(account.email);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Recevoir un nouveau lien' })).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page.getByRole('status').filter({ hasText: 'Demande envoyée' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Recevoir un nouveau lien' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await expect.poll(() => messageCount(request, account.email)).toBe(2);
  await expectNoAxeViolations(page);
});
