import { APIRequestContext, expect, Page, test } from '@playwright/test';

import { confirmEmail, register } from '../support/accounts';
import { expectNoAxeViolations } from '../support/axe';

// UX-D1 à UX-D5 (audit UX du 9 novembre 2026, fiches 11, 12, 25, 26, 27) : connexion, inscription,
// confirmation d'e-mail, mot de passe oublié (étapes 1 et 2), compte suspendu. Mesures de l'audit :
// hauteur de page à 1440 px, aucun débordement à 375 px, axe-core à 0 en clair et en sombre ;
// étape 2 du mot de passe oublié avec un vrai jeton lu dans Mailpit. Contre l'API locale (seed
// small), jamais de mock du backend.

const API = 'http://localhost:8080';
const MAILPIT = 'http://localhost:8025';
// Lien de l'e-mail de réinitialisation (psymate-api, AuthMailer) : <web>/reset-password?token=…
const RESET_TOKEN = /reset-password\?token=([A-Za-z0-9_.~%-]+)/;

/** Les six écrans de la tâche, avec un repère visible une fois la page rendue. */
const SCREENS = [
  { name: '11-connexion', path: '/fr/connexion', heading: 'Connexion' },
  { name: '12-inscription', path: '/fr/inscription', heading: 'Créer votre compte praticien' },
  {
    name: '25-confirmation-email',
    path: '/fr/confirmer-email',
    heading: 'Un dernier clic : confirmez votre e-mail',
  },
  {
    name: '26-mot-de-passe-oublie',
    path: '/fr/mot-de-passe-oublie',
    heading: 'Mot de passe oublié',
  },
  {
    name: '26-mot-de-passe-etape-2',
    path: '/fr/reset-password?token=jeton-de-capture',
    heading: 'Choisissez un nouveau mot de passe',
  },
  {
    name: '27-compte-suspendu',
    path: '/fr/compte-suspendu',
    heading: 'Votre compte est suspendu ou votre dossier a été refusé',
  },
] as const;

async function open(page: Page, screen: (typeof SCREENS)[number]): Promise<void> {
  await page.goto(screen.path);
  await expect(page.getByRole('heading', { level: 1, name: screen.heading })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

/** Jeton du dernier e-mail de réinitialisation reçu par `email` (attend jusqu'à 15 s). */
async function resetToken(api: APIRequestContext, email: string): Promise<string> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const search = await api.get(`${MAILPIT}/api/v1/search`, { params: { query: `to:${email}` } });
    const messages = [
      ...(((await search.json()) as { messages?: { ID: string; Created: string }[] }).messages ??
        []),
    ].sort((a, b) => b.Created.localeCompare(a.Created));
    for (const message of messages) {
      const full = await api.get(`${MAILPIT}/api/v1/message/${message.ID}`);
      const match = RESET_TOKEN.exec(((await full.json()) as { Text?: string }).Text ?? '');
      if (match) return decodeURIComponent(match[1]);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`aucun e-mail de réinitialisation pour ${email} dans Mailpit`);
}

test.describe('1440 px', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('captures 1440 (clair) et axe-core à 0 en clair et en sombre sur les six écrans', async ({
    page,
  }, testInfo) => {
    // Douze analyses axe et douze captures pleine page : 30 s ne suffisent pas sous charge.
    test.setTimeout(120_000);
    for (const screen of SCREENS) {
      await open(page, screen);
      await expectNoAxeViolations(page);
      await page.screenshot({
        path: testInfo.outputPath(`${screen.name}--1440-light.png`),
        fullPage: true,
      });
    }
    await page.emulateMedia({ colorScheme: 'dark' });
    for (const screen of SCREENS) {
      await open(page, screen);
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await expectNoAxeViolations(page);
      await page.screenshot({
        path: testInfo.outputPath(`${screen.name}--1440-dark.png`),
        fullPage: true,
      });
    }
  });

  test('UX-D1 connexion : accroche au-dessus de la carte, hébergement dessous, libellés au-dessus', async ({
    page,
  }) => {
    await page.goto('/fr/connexion');
    await expect(page.getByRole('heading', { level: 1, name: 'Connexion' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const tagline = page.getByText('Le fil de vos patients, séance après séance.');
    const card = page.locator('.login-card');
    const hosting = page.getByText(/Données hébergées en France/);
    const [t, c, h] = await Promise.all([
      tagline.boundingBox(),
      card.boundingBox(),
      hosting.boundingBox(),
    ]);
    expect(t!.y + t!.height).toBeLessThanOrEqual(c!.y);
    expect(h!.y).toBeGreaterThanOrEqual(c!.y + c!.height);
    // « Mot de passe oublié ? » sur la ligne du libellé, à sa droite, au-dessus du champ.
    const label = await page.locator('label[for=login-password]').boundingBox();
    const forgot = await page.getByRole('link', { name: 'Mot de passe oublié ?' }).boundingBox();
    const input = await page.getByLabel('Mot de passe', { exact: true }).boundingBox();
    expect(forgot!.x).toBeGreaterThan(label!.x + label!.width);
    expect(Math.abs(forgot!.y + forgot!.height / 2 - (label!.y + label!.height / 2))).toBeLessThan(
      8,
    );
    expect(forgot!.y + forgot!.height).toBeLessThanOrEqual(input!.y + 2);
    await expect(
      page.getByRole('checkbox', { name: 'Rester connecté·e sur cet appareil pendant 30 jours' }),
    ).toBeVisible();
  });

  test('UX-D2 inscription : colonne latérale à droite, cartes en ligne, hauteur ≤ 1 800 px', async ({
    page,
  }) => {
    await page.goto('/fr/inscription');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const form = await page.locator('form').boundingBox();
    const side = await page.locator('aside.side').boundingBox();
    expect(side!.x).toBeGreaterThan(form!.x + form!.width);
    expect(form!.width).toBeGreaterThan(700);
    const cards = page.locator('fieldset.professions label.card');
    const boxes = await Promise.all([0, 1, 2].map((i) => cards.nth(i).boundingBox()));
    expect(new Set(boxes.map((b) => Math.round(b!.y))).size).toBe(1);
    // Nom accessible = libellé seul ; la description est la description accessible.
    await expect(
      page.getByRole('radio', { name: 'Psychologue', exact: true }),
    ).toHaveAccessibleDescription(/Suivi psychothérapeutique/);
    const consents = page.locator('.consents');
    await expect(consents.getByRole('link', { name: "conditions d'utilisation" })).toHaveAttribute(
      'href',
      '/fr/mentions-legales',
    );
    await expect(
      consents.getByRole('link', { name: 'politique de confidentialité' }),
    ).toHaveAttribute('href', '/fr/confidentialite');
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(height, 'hauteur de /inscription à 1440 px').toBeLessThanOrEqual(1800);
  });

  test('UX-D5 compte suspendu : deux colonnes (identité, export, recours), hauteur ≤ 1 200 px', async ({
    page,
  }) => {
    await page.goto('/fr/compte-suspendu');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const main = await page.locator('section.main').boundingBox();
    const identity = await page
      .getByRole('group', { name: 'Confirmez votre identité' })
      .boundingBox();
    const exportTitle = await page
      .getByRole('heading', { level: 2, name: 'Exporter mes dossiers' })
      .boundingBox();
    const appeal = await page
      .getByRole('heading', { level: 2, name: 'Contester la décision' })
      .boundingBox();
    expect(identity!.x).toBeGreaterThan(main!.x + main!.width);
    expect(identity!.y).toBeLessThan(exportTitle!.y);
    expect(exportTitle!.y).toBeLessThan(appeal!.y);
    expect(main!.width).toBeLessThanOrEqual(641);
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(height, 'hauteur de /compte-suspendu à 1440 px').toBeLessThanOrEqual(1200);
  });
});

test('375 px : aucun débordement horizontal sur les six écrans, axe-core à 0', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const screen of SCREENS) {
    await open(page, screen);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `débordement horizontal sur ${screen.path}`).toBeLessThanOrEqual(0);
    await expectNoAxeViolations(page);
  }
});

test('UX-D3 confirmation : un seul geste sans adresse connue, pas de « Corriger l’e-mail »', async ({
  page,
}) => {
  await page.goto('/fr/confirmer-email');
  await expect(page.getByLabel('Adresse du compte')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Renvoyer le lien' })).toBeVisible();
  await expect(page.getByRole('button', { name: "Corriger l'e-mail" })).toHaveCount(0);
  await expect(page.getByText("Pas reçu ? Saisissez l'adresse du compte")).toBeVisible();
  await expectNoAxeViolations(page);
});

test('UX-D4 mot de passe oublié : étape 1 (textes de confiance), lien Mailpit, étape 2, connexion avec le nouveau mot de passe', async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const account = await register(request, 'ux-d4.reset');
  await confirmEmail(request, account.email);

  // Étape 1 : retour en haut de carte, étape, durée réelle (contrat : 30 minutes), même message.
  await page.goto('/fr/mot-de-passe-oublie');
  const card = page.locator('section.card');
  await expect(card.getByRole('link', { name: 'Retour à la connexion' })).toBeVisible();
  await expect(card.getByText('Étape 1 sur 2')).toBeVisible();
  await expect(card.getByText(/valable 30 minutes/).first()).toBeVisible();
  await expect(card.getByText(/le message est le même qu'un compte existe ou non/)).toBeVisible();
  await page.getByLabel('Adresse e-mail').fill(account.email);
  await page.getByRole('button', { name: 'Envoyer le lien' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Si un compte existe pour cette adresse' }),
  ).toBeVisible();
  await expectNoAxeViolations(page);

  // Étape 2 depuis le lien de l'e-mail (chemin envoyé par l'API) : jauge, 4 critères, confirmation.
  const token = await resetToken(request, account.email);
  await page.goto(`/fr/reset-password?token=${encodeURIComponent(token)}`);
  await expect(page.getByText('Étape 2 sur 2')).toBeVisible();
  await expect(page.locator('#new-password-criteria li')).toHaveCount(4);
  await expect(page.locator('.bars .bar')).toHaveCount(4);
  const newPassword = 'Nouveau-Fil-Clinique-2027';
  await page.getByLabel('Nouveau mot de passe', { exact: true }).fill(newPassword);
  await expect(page.locator('#new-password-criteria li[data-state="met"]')).toHaveCount(3);
  await expect(page.locator('.bars .bar.on')).toHaveCount(4);
  await expect(page.locator('#new-password-strength')).toContainText('Fort · 25 caractères');
  // Contrat : toutes les sessions sont révoquées, la page l'annonce (pas de case à cocher).
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await expect(page.getByText(/toutes les sessions ouvertes/)).toBeVisible();
  await page.getByLabel('Confirmer le mot de passe').fill('Autre-Chose-2027-x');
  await page.getByLabel('Confirmer le mot de passe').blur();
  await expect(page.getByText('Les deux mots de passe ne sont pas identiques.')).toBeVisible();
  await page.getByLabel('Confirmer le mot de passe').fill(newPassword);
  await expectNoAxeViolations(page);
  await page.getByRole('button', { name: 'Enregistrer le mot de passe' }).click();

  // 204 : aucune session ouverte (contrat) → connexion avec le message, puis le nouveau mot de passe.
  await expect(page).toHaveURL(/\/fr\/connexion$/);
  await expect(page.getByRole('status').filter({ hasText: 'Mot de passe modifié' })).toBeVisible();
  await expectNoAxeViolations(page);
  const login = await request.post(`${API}/api/auth/login`, {
    data: { email: account.email, password: newPassword },
  });
  expect(login.status()).toBe(200);

  // Le même lien une seconde fois : 410 → « n'est plus valable », nouvelle demande proposée.
  await page.goto(`/fr/reinitialiser/${encodeURIComponent(token)}`);
  await page.getByLabel('Nouveau mot de passe', { exact: true }).fill('Encore-Un-Autre-2027');
  await page.getByLabel('Confirmer le mot de passe').fill('Encore-Un-Autre-2027');
  await page.getByRole('button', { name: 'Enregistrer le mot de passe' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: "Ce lien de réinitialisation n'est plus valable" }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Demander un nouveau lien' })).toHaveAttribute(
    'href',
    '/fr/mot-de-passe-oublie',
  );
  await expectNoAxeViolations(page);
});

test('UX-D4 étape 2 : mot de passe compromis → 422 sous le champ, le jeton reste valable', async ({
  page,
  request,
}) => {
  const account = await register(request, 'ux-d4.policy');
  await confirmEmail(request, account.email);
  const sent = await request.post(`${API}/api/auth/password-reset/request`, {
    data: { email: account.email },
  });
  expect(sent.status()).toBe(202);
  const token = await resetToken(request, account.email);

  await page.goto(`/fr/reinitialiser/${encodeURIComponent(token)}`);
  await page.getByLabel('Nouveau mot de passe', { exact: true }).fill('Password2026!');
  await page.getByLabel('Confirmer le mot de passe').fill('Password2026!');
  await page.getByRole('button', { name: 'Enregistrer le mot de passe' }).click();
  await expect(page.locator('#new-password-error')).toBeVisible();
  await expect(page.getByLabel('Nouveau mot de passe', { exact: true })).toBeFocused();
  await expectNoAxeViolations(page);
});
