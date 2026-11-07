import { APIRequestContext, expect, Locator, Page, test } from '@playwright/test';

import { expectNoAxeViolations } from '../support/axe';
import { totp, totpStep } from '../support/totp';
import {
  apiLoginStatus,
  createAccount,
  enableTwoFactorWithCodes,
  freshStep,
  INVALID_CODE,
  MAILPIT,
  openSecurity,
  SECURITY,
  signIn,
  signOut,
} from './helpers';

// Fiche 18 A et B (M1-17) : /mon-compte/securite et le panneau /mon-compte/securite/2fa, contre
// l'API locale (seed small, Mailpit), jamais de mock. Chaque test crée son compte jetable : la 2FA,
// les sessions et le verrou (5 échecs) sont par compte, et les tests tournent en parallèle.

const COMPROMISED_PASSWORD = 'motdepasse1234';
const STRONG_PASSWORD = 'Nouveau-Fil-Rouge-2026!';

/** Tabule (sans souris) jusqu'à ce que `target` ait le focus ; échoue après 40 tabulations. */
async function tabUntil(page: Page, target: Locator): Promise<void> {
  for (let i = 0; i < 40; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('le focus n’a jamais atteint la cible');
}

async function expectPanel(page: Page, title: string) {
  const panel = page.getByRole('dialog', { name: title });
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('aria-modal', 'true');
  return panel;
}

/** Secret affiché dans le panneau (groupé par 4), remis d'un bloc. */
async function readSecret(page: Page): Promise<string> {
  const text = await page.locator('.secret code').textContent();
  return (text ?? '').replace(/\s+/g, '');
}

async function mailCount(api: APIRequestContext, email: string, atLeast: number): Promise<number> {
  let count = 0;
  for (let attempt = 0; attempt < 30 && count < atLeast; attempt++) {
    const search = await api.get(`${MAILPIT}/api/v1/search`, { params: { query: `to:${email}` } });
    count = (((await search.json()) as { messages?: unknown[] }).messages ?? []).length;
    if (count < atLeast) await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return count;
}

test('activer la 2FA par le panneau (QR, code faux puis juste, 10 codes), puis la connexion exige le code', async ({
  page,
  request,
}) => {
  const account = await createAccount(request, 'm1-17.activer');
  await signIn(page, account);
  await openSecurity(page);
  await expect(page.getByText('Non activée')).toBeVisible();
  await expectNoAxeViolations(page);

  // Le panneau suit la route /2fa.
  await page.getByRole('button', { name: 'Activer' }).click();
  await expect(page).toHaveURL(/\/fr\/mon-compte\/securite\/2fa$/);
  const panel = await expectPanel(page, 'Activer la double authentification');
  await expect(panel.getByRole('img', { name: /QR code/ })).toBeVisible();
  const secret = await readSecret(page);
  expect(secret).toMatch(/^[A-Z2-7]{16,}$/);
  await expect(panel.locator('[aria-current="step"]')).toHaveText(/Scanner le QR/);
  await expectNoAxeViolations(page);

  // Étape 2 au clavier : Continuer, le champ code reçoit le focus.
  await panel.getByRole('button', { name: 'Continuer' }).click();
  const code = panel.getByLabel('Code de vérification');
  await expect(code).toBeFocused();
  await expect(code).toHaveAttribute('autocomplete', 'one-time-code');
  await expect(code).toHaveAttribute('inputmode', 'numeric');
  await page.keyboard.type('000000');
  await page.keyboard.press('Enter');
  await expect(panel.getByRole('alert')).toHaveText(INVALID_CODE);
  await expect(code).toBeFocused();
  await expectNoAxeViolations(page);

  const step = totpStep();
  await code.fill(totp(secret, step));
  await panel.getByRole('button', { name: 'Vérifier' }).click();
  const codes = panel.getByRole('list', { name: 'Codes de secours' });
  await expect(codes.getByRole('listitem')).toHaveCount(10);
  await expect(codes.getByRole('listitem').first()).toHaveText(/^[A-Z0-9]{5}-[A-Z0-9]{5}$/);
  // Le secret n'est plus affiché une fois vérifié.
  await expect(page.locator('.secret')).toHaveCount(0);
  const finish = panel.getByRole('button', { name: 'Terminer' });
  await expect(finish).toBeDisabled();
  // Au clavier : Tab jusqu'à la case, Espace la coche, Tab jusqu'à Terminer, Entrée.
  const checkbox = panel.getByRole('checkbox', { name: 'Je les ai enregistrés' });
  await tabUntil(page, checkbox);
  await page.keyboard.press('Space');
  await expect(checkbox).toBeChecked();
  await expect(finish).toBeEnabled();
  await expectNoAxeViolations(page);
  await tabUntil(page, finish);
  await page.keyboard.press('Enter');

  await expect(panel).toHaveCount(0);
  await expect(page).toHaveURL(/\/fr\/mon-compte\/securite$/);
  await expect(page.getByText('Activée', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Désactiver' })).toBeVisible();

  // Reconnexion : 202 otpRequired, code faux → message unique, code juste → /patients.
  await signOut(page);
  await page.goto('/fr/connexion');
  await page.getByLabel('Adresse e-mail').fill(account.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  const otp = page.getByLabel('Code de vérification');
  await expect(otp).toBeVisible();
  await otp.fill('000000');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('alert')).toHaveText('E-mail, mot de passe ou code incorrect.');
  await otp.fill(totp(secret, freshStep(step)));
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/fr\/patients$/);
});

test('désactiver exige mot de passe + code : code faux → message unique, mot de passe faux → erreur sur le champ, puis 204', async ({
  page,
  request,
}) => {
  const account = await createAccount(request, 'm1-17.desactiver');
  const { secret, usedStep, recoveryCodes } = await enableTwoFactorWithCodes(request);
  await signIn(page, account, () => totp(secret, freshStep(usedStep)));
  await openSecurity(page);

  await page.getByRole('button', { name: 'Désactiver' }).click();
  const panel = await expectPanel(page, 'Désactiver la double authentification');
  const password = panel.getByLabel('Mot de passe');
  const code = panel.getByLabel('Code de vérification');
  await expect(password).toBeFocused();

  // Formulaire vide : validation de forme, aucun appel.
  await panel.getByRole('button', { name: 'Désactiver' }).click();
  await expect(panel.locator('#field-disable-password-error')).toHaveText(
    'Ce champ est obligatoire.',
  );
  await expect(panel.locator('#field-disable-code-error')).toHaveText('Ce champ est obligatoire.');

  await password.fill(account.password);
  await code.fill('000000');
  await panel.getByRole('button', { name: 'Désactiver' }).click();
  await expect(panel.locator('#field-disable-code-error')).toHaveText(INVALID_CODE);
  await expectNoAxeViolations(page);

  await password.fill('Pas-le-bon-mot-de-passe-1');
  await code.fill('000000');
  await panel.getByRole('button', { name: 'Désactiver' }).click();
  await expect(panel.locator('#field-disable-password-error')).not.toBeEmpty();

  // Un code de secours vaut un code TOTP (contrat) : pas de fenêtre de 30 s à attendre.
  await password.fill(account.password);
  await code.fill(recoveryCodes[0]);
  await panel.getByRole('button', { name: 'Désactiver' }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByText('Non activée')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Activer' })).toBeVisible();
});

test('régénérer : confirmation, 10 nouveaux codes ; les anciens sont refusés au login, un nouveau accepté', async ({
  page,
  request,
}) => {
  const account = await createAccount(request, 'm1-17.regenerer');
  const { secret, usedStep, recoveryCodes: oldCodes } = await enableTwoFactorWithCodes(request);
  await signIn(page, account, () => totp(secret, freshStep(usedStep)));
  await openSecurity(page);

  await page.getByRole('button', { name: 'Régénérer les codes' }).click();
  const confirm = page.getByRole('dialog', { name: 'Régénérer les codes de secours ?' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Régénérer' }).click();

  const panel = await expectPanel(page, 'Nouveaux codes de secours');
  const items = panel.getByRole('list', { name: 'Codes de secours' }).getByRole('listitem');
  await expect(items).toHaveCount(10);
  const newCodes = await items.allTextContents();
  expect(newCodes).not.toContain(oldCodes[0]);
  await expect(panel.getByText('Les 10 anciens codes ne fonctionnent plus')).toBeVisible();
  await expectNoAxeViolations(page);
  await panel.getByRole('checkbox', { name: 'Je les ai enregistrés' }).check();
  await panel.getByRole('button', { name: 'Terminer' }).click();
  await expect(panel).toHaveCount(0);

  // Le serveur reste juge : un ancien code est refusé, un nouveau accepté (compte à part).
  const api = await request.storageState().then(() => request); // même contexte, cookie sans effet sur /login
  expect(await apiLoginStatus(api, account, oldCodes[0])).toBe(401);
  expect(await apiLoginStatus(api, account, newCodes[0].trim())).toBe(200);
});

test('sessions actives : la courante marquée, révoquer une autre session la ferme (deux contextes), « Déconnecter les autres » annonce 0', async ({
  page,
  browser,
  request,
}) => {
  const account = await createAccount(request, 'm1-17.sessions');
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await signIn(otherPage, account);
  await signIn(page, account);
  await openSecurity(page);

  const sessions = page.getByRole('list', { name: 'Sessions actives' }).getByRole('listitem');
  // Trois sessions : celle de `request` (confirmEmail), l'autre navigateur, celui-ci.
  await expect(sessions).toHaveCount(3);
  await expect(sessions.filter({ hasText: 'session courante' })).toHaveCount(1);
  await expect(sessions.filter({ hasText: 'session courante' }).getByRole('button')).toHaveCount(0);
  await expectNoAxeViolations(page);

  // Révocation unitaire au clavier : Tab jusqu'au premier « Déconnecter », Entrée.
  const revoke = page.getByRole('button', { name: /^Déconnecter · / }).first();
  await revoke.focus();
  await page.keyboard.press('Enter');
  await expect(sessions).toHaveCount(2);

  // « Déconnecter les autres » : confirmation, le nombre renvoyé par le serveur est annoncé.
  await page.getByRole('button', { name: 'Déconnecter les autres appareils' }).click();
  await page
    .getByRole('dialog', { name: 'Déconnecter les autres appareils ?' })
    .getByRole('button', { name: 'Déconnecter' })
    .click();
  await expect(page.getByText('1 appareil déconnecté.')).toBeVisible();
  await expect(sessions).toHaveCount(1);
  await page.getByRole('button', { name: 'Déconnecter les autres appareils' }).click();
  await page
    .getByRole('dialog', { name: 'Déconnecter les autres appareils ?' })
    .getByRole('button', { name: 'Déconnecter' })
    .click();
  await expect(page.getByText("Aucun autre appareil n'était connecté.")).toBeVisible();

  // L'autre navigateur a perdu sa session : son prochain chargement revient à la connexion.
  await otherPage.goto('/fr/mon-compte/securite');
  await expect(otherPage).toHaveURL(/\/fr\/connexion\?next=/);
  await other.close();
});

test('changer le mot de passe : 422 PASSWORD_POLICY coche les règles, 204 révoque les sessions → /connexion, reconnexion avec le nouveau', async ({
  page,
  request,
}) => {
  const account = await createAccount(request, 'm1-17.mdp');
  await signIn(page, account);
  await openSecurity(page);

  await page
    .locator('section[aria-labelledby="h-password"]')
    .getByRole('button', { name: 'Modifier' })
    .click();
  const panel = await expectPanel(page, 'Modifier le mot de passe');
  const current = panel.getByLabel('Mot de passe actuel');
  await expect(current).toBeFocused();

  // Règles cochées au fil de la saisie, puis le serveur refuse (compromis / casse).
  const rules = panel.locator('pm-password-rules li');
  await expect(rules).toHaveCount(3);
  await current.fill(account.password);
  await panel.getByLabel('Nouveau mot de passe', { exact: true }).fill(COMPROMISED_PASSWORD);
  await expect(rules.nth(0)).toHaveAttribute('data-state', 'ok');
  await expect(rules.nth(1)).toHaveAttribute('data-state', 'pending');
  await panel.getByLabel('Confirmer le nouveau mot de passe').fill(COMPROMISED_PASSWORD);
  await panel.getByRole('button', { name: 'Changer le mot de passe' }).click();
  await expect(panel.locator('pm-password-rules li[data-state="ko"]').first()).toBeVisible();
  await expectNoAxeViolations(page);

  await panel.getByLabel('Nouveau mot de passe', { exact: true }).fill(STRONG_PASSWORD);
  await panel.getByLabel('Confirmer le nouveau mot de passe').fill(STRONG_PASSWORD);
  await panel.getByRole('button', { name: 'Changer le mot de passe' }).click();
  await expect(page).toHaveURL(/\/fr\/connexion$/);

  await signIn(page, { ...account, password: STRONG_PASSWORD });
});

test('changer l’e-mail : mot de passe faux → 422 sur le champ (G Q49), puis 202 et lien envoyé à la nouvelle adresse', async ({
  page,
  request,
}) => {
  const account = await createAccount(request, 'm1-17.email');
  const newEmail = account.email.replace('@', '.nouvelle@');
  await signIn(page, account);
  await openSecurity(page);

  await page
    .locator('section[aria-labelledby="h-email"]')
    .getByRole('button', { name: 'Modifier' })
    .click();
  const panel = await expectPanel(page, "Modifier l'e-mail de connexion");
  await panel.getByLabel('Nouvelle adresse e-mail').fill(newEmail);
  await panel.getByLabel('Mot de passe').fill('Pas-le-bon-mot-de-passe-1');
  await panel.getByRole('button', { name: 'Envoyer le lien de confirmation' }).click();
  await expect(panel.locator('#field-email-password-error')).not.toBeEmpty();
  await expectNoAxeViolations(page);

  await panel.getByLabel('Mot de passe').fill(account.password);
  await panel.getByRole('button', { name: 'Envoyer le lien de confirmation' }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: newEmail })).toBeVisible();
  expect(await mailCount(request, newEmail, 1)).toBeGreaterThanOrEqual(1);
  // L'adresse actuelle reste celle du compte tant que le lien n'est pas ouvert.
  await expect(page.locator('section[aria-labelledby="h-email"]')).toContainText(account.email);
});

test('panneau 2FA au clavier : Entrée sur Activer l’ouvre, Échap demande confirmation, refuser le garde, confirmer le ferme et rend le focus', async ({
  page,
  request,
}) => {
  const account = await createAccount(request, 'm1-17.echap');
  await signIn(page, account);
  await openSecurity(page);

  const activate = page.getByRole('button', { name: 'Activer' });
  await tabUntil(page, activate);
  await page.keyboard.press('Enter');
  const panel = await expectPanel(page, 'Activer la double authentification');
  await expect(page).toHaveURL(/\/securite\/2fa$/);
  await expect(panel.getByRole('img', { name: /QR code/ })).toBeVisible();

  // Échap : confirmation « Abandonner l'activation ? » ; Échap dans la boîte la referme, le panneau reste.
  await page.keyboard.press('Escape');
  const confirm = page.getByRole('dialog', { name: "Abandonner l'activation ?" });
  await expect(confirm).toBeVisible();
  await expectNoAxeViolations(page);
  await page.keyboard.press('Escape');
  await expect(confirm).toHaveCount(0);
  await expect(panel).toBeVisible();

  // Échap puis confirmation : le panneau se ferme, l'URL revient, le focus retourne au déclencheur.
  await page.keyboard.press('Escape');
  await confirm.getByRole('button', { name: 'Abandonner' }).click();
  await expect(panel).toHaveCount(0);
  await expect(page).toHaveURL(/\/fr\/mon-compte\/securite$/);
  await expect(activate).toBeFocused();
  await expect(page.getByText('Non activée')).toBeVisible();
});

test('sans session, /mon-compte/securite renvoie vers la connexion', async ({ page }) => {
  await page.goto(SECURITY);
  await expect(page).toHaveURL(/\/fr\/connexion\?next=%2Fmon-compte%2Fsecurite$/);
});
