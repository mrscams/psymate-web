import AxeBuilder from '@axe-core/playwright';
import { APIRequestContext, expect, Page, test } from '@playwright/test';

import { confirmEmail, register, uniqueEmail } from '../support/accounts';

// B3 flux 9 (M1-15, fiches 11, 12, 13) : inscription, confirmation par Mailpit, dossier
// professionnel, bandeau d'état. Contre l'API locale (seed small) et Mailpit, jamais de mock.

const MAILPIT = 'http://localhost:8025';
const STRONG_PASSWORD = 'Vendôme-Lyon-2026!x';
const COMPROMISED_PASSWORD = 'motdepasse1234';

async function expectNoAxeViolations(page: Page): Promise<void> {
  // L'ondulation Material d'un clic éclaircit le fond du bouton pendant 225 ms : on attend sa fin.
  await expect(page.locator('.mat-ripple-element')).toHaveCount(0);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
}

/** Sujets des e-mails reçus par une adresse dans Mailpit (attend jusqu'à 15 s le nombre voulu). */
async function mailSubjects(
  api: APIRequestContext,
  email: string,
  atLeast: number,
): Promise<string[]> {
  let subjects: string[] = [];
  for (let attempt = 0; attempt < 30 && subjects.length < atLeast; attempt++) {
    const search = await api.get(`${MAILPIT}/api/v1/search`, { params: { query: `to:${email}` } });
    const body = (await search.json()) as { messages?: { Subject: string }[] };
    subjects = (body.messages ?? []).map((m) => m.Subject);
    if (subjects.length < atLeast) await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return subjects;
}

/** Tabule jusqu'au champ voulu (sans souris) ; échoue après 40 tabulations. */
async function tabTo(page: Page, id: string): Promise<void> {
  for (let i = 0; i < 40; i++) {
    if ((await page.evaluate(() => document.activeElement?.id)) === id) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`le focus n'a jamais atteint #${id}`);
}

async function expectFocus(page: Page, id: string): Promise<void> {
  await expect(page.locator(`#${id}`)).toBeFocused();
}

/** Remplit l'inscription entièrement au clavier, dans l'ordre des champs de la fiche 12. */
async function registerByKeyboard(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/fr/inscription');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Créer votre compte praticien' }),
  ).toBeVisible();

  await tabTo(page, 'field-firstName');
  await page.keyboard.type('Alix');
  await page.keyboard.press('Tab');
  await expectFocus(page, 'field-lastName');
  await page.keyboard.type('Essai');
  await page.keyboard.press('Tab');
  await expectFocus(page, 'field-email');
  await page.keyboard.type(email);
  // Cartes de profession : vrais boutons radio, un seul arrêt de tabulation, flèches pour choisir.
  await page.keyboard.press('Tab');
  await expectFocus(page, 'field-profession-psychologist');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#field-profession-coach')).toBeChecked();
  await page.keyboard.press('Tab');
  await expectFocus(page, 'field-professionalNumber');
  await page.keyboard.press('Tab');
  await expectFocus(page, 'field-phone');
  await page.keyboard.type('06 12 34 56 78');
  await page.keyboard.press('Tab');
  await expectFocus(page, 'field-address-street');
  await page.keyboard.type('12 rue des Lilas');
  await page.keyboard.press('Tab');
  await expectFocus(page, 'field-address-postalCode');
  await page.keyboard.type('69001');
  await page.keyboard.press('Tab');
  await expectFocus(page, 'field-address-city');
  await page.keyboard.type('Lyon');
  await page.keyboard.press('Tab');
  await expectFocus(page, 'field-remoteOnly');
  await page.keyboard.press('Tab');
  await expectFocus(page, 'field-password');
  await page.keyboard.type(password);
  await page.keyboard.press('Tab');
  await expectFocus(page, 'field-passwordConfirm');
  await page.keyboard.type(password);
  await page.keyboard.press('Tab');
  await expectFocus(page, 'field-terms');
  await page.keyboard.press('Space');
  await expect(page.locator('#field-terms')).toBeChecked();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Créer mon compte' })).toBeFocused();
  await page.keyboard.press('Enter');
}

test('inscription complète au clavier → 201, /confirmer-email, e-mail de confirmation dans Mailpit', async ({
  page,
  request,
}) => {
  const email = uniqueEmail('m1-15.inscription');
  await page.goto('/fr/inscription');
  // Fiche 12 : trois sections, colonne « Ensuite », aucun code d'invitation (G Q21).
  await expect(page.getByRole('heading', { level: 2, name: /Qui vous êtes/ })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: /Votre profession/ })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: /Votre accès/ })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Ensuite' })).toBeVisible();
  await expect(page.getByText(/code d.invitation/i)).toHaveCount(0);
  await expectNoAxeViolations(page);

  await registerByKeyboard(page, email, STRONG_PASSWORD);

  // Jauge de force : texte, pas seulement la couleur (vérifié avant la navigation ? non : après la
  // saisie, la page est déjà partie ; la jauge est couverte par le test du mot de passe compromis).
  await expect(page).toHaveURL(/\/fr\/confirmer-email$/);
  await expect(
    page.getByRole('heading', { level: 1, name: /Confirmez votre adresse e-mail/ }),
  ).toBeVisible();

  const subjects = await mailSubjects(request, email, 1);
  expect(subjects).toContain('PsyMate : confirmez votre adresse e-mail');
});

test('e-mail déjà utilisé : même 201, même écran, e-mail « vous avez déjà un compte »', async ({
  page,
  request,
}) => {
  const existing = await register(request, 'm1-15.doublon');
  await expect.poll(() => mailSubjects(request, existing.email, 1)).toHaveLength(1);

  await page.goto('/fr/inscription');
  await page.locator('#field-firstName').fill('Alix');
  await page.locator('#field-lastName').fill('Essai');
  await page.locator('#field-email').fill(existing.email);
  await page.locator('#field-profession-psychologist').check();
  await page.locator('#field-phone').fill('06 12 34 56 78');
  await page.locator('#field-remoteOnly').check();
  await expect(page.locator('#field-address-street')).toBeDisabled();
  await page.locator('#field-password').fill(STRONG_PASSWORD);
  await page.locator('#field-passwordConfirm').fill(STRONG_PASSWORD);
  await page.locator('#field-terms').check();
  await page.getByRole('button', { name: 'Créer mon compte' }).click();

  await expect(page).toHaveURL(/\/fr\/confirmer-email$/);
  const subjects = await mailSubjects(request, existing.email, 2);
  expect(subjects).toContain('PsyMate : vous avez déjà un compte');
  expect(subjects).toContain('PsyMate : confirmez votre adresse e-mail');
});

test('mot de passe compromis refusé (422 sous le champ), jauge de force en texte, puis accepté', async ({
  page,
}) => {
  await page.goto('/fr/inscription');
  await page.locator('#field-firstName').fill('Alix');
  await page.locator('#field-lastName').fill('Essai');
  await page.locator('#field-email').fill(uniqueEmail('m1-15.compromis'));
  await page.locator('#field-profession-psychiatrist').check();
  await page.locator('#field-phone').fill('06 12 34 56 78');
  await page.locator('#field-remoteOnly').check();
  await page.locator('#field-password').fill(COMPROMISED_PASSWORD);
  await expect(page.locator('#field-password-strength')).toHaveText(/Faible · 14 caractères/);
  await page.locator('#field-passwordConfirm').fill(COMPROMISED_PASSWORD);
  await page.locator('#field-terms').check();
  await page.getByRole('button', { name: 'Créer mon compte' }).click();

  // Le serveur juge (liste locale de mots de passe compromis) : erreur reliée au champ, saisie conservée.
  const summary = page.locator('pm-problem-summary [role=alert]');
  await expect(summary).toBeVisible();
  await expect(page.locator('#field-password-error')).not.toBeEmpty();
  await expect(page.locator('#field-password')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#field-firstName')).toHaveValue('Alix');
  await expect(page).toHaveURL(/\/fr\/inscription$/);
  await expectNoAxeViolations(page);

  await page.locator('#field-password').fill(STRONG_PASSWORD);
  await expect(page.locator('#field-password-strength')).toHaveText(/Fort · 19 caractères/);
  await page.locator('#field-passwordConfirm').fill(STRONG_PASSWORD);
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page).toHaveURL(/\/fr\/confirmer-email$/);
});

test('connexion : liens inscription et mot de passe oublié, afficher le mot de passe, demande de lien (202)', async ({
  page,
}) => {
  await page.goto('/fr/connexion');
  await expect(page.getByRole('link', { name: 'Créer un compte' })).toHaveAttribute(
    'href',
    '/fr/inscription',
  );
  const toggle = page.getByRole('button', { name: 'Afficher le mot de passe' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await page.getByLabel('Mot de passe', { exact: true }).fill('secret');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('input[autocomplete=current-password]')).toHaveAttribute(
    'type',
    'text',
  );
  await expect(page.getByText(/verrouillé 15 minutes/)).toBeVisible();
  await expectNoAxeViolations(page);

  await page.getByRole('link', { name: 'Mot de passe oublié ?' }).click();
  await expect(page).toHaveURL(/\/fr\/mot-de-passe-oublie$/);
  await page.getByLabel('Adresse e-mail').fill(uniqueEmail('m1-15.reset'));
  await page.getByRole('button', { name: 'Envoyer le lien' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Si un compte existe pour cette adresse' }),
  ).toBeVisible();
  await expectNoAxeViolations(page);
});

test('dossier professionnel : 11 Mo refusé, .exe renommé → 415, complétude, soumission, bandeau', async ({
  page,
  request,
}) => {
  const account = await register(request, 'm1-15.dossier');
  await confirmEmail(request, account.email);

  // Connexion par l'écran : un compte docs_pending entre, le bandeau ambre est sur /patients.
  await page.goto('/fr/connexion');
  await page.getByLabel('Adresse e-mail').fill(account.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/fr\/patients$/);
  const banner = page.getByRole('status').filter({ hasText: 'dossier professionnel' });
  await expect(banner).toContainText('incomplet');
  await banner.getByRole('link', { name: 'Voir le dossier' }).click();
  await expect(page).toHaveURL(/\/fr\/mon-compte\/dossier-professionnel$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Dossier professionnel' }),
  ).toBeVisible();

  // Progression : quatre jalons, « Justificatifs » courant ; liste vide ; Soumettre désactivé.
  const steps = page.getByRole('list', { name: 'Progression du dossier' }).getByRole('listitem');
  await expect(steps).toHaveCount(4);
  await expect(steps.nth(2)).toHaveAttribute('aria-current', 'step');
  await expect(page.getByText('Aucun justificatif déposé')).toBeVisible();
  const submit = page.getByRole('button', { name: 'Soumettre le dossier pour vérification' });
  await expect(submit).toBeDisabled();
  await expect(page.locator('.missing')).toHaveText("Il manque : diplôme, pièce d'identité.");
  await expectNoAxeViolations(page);

  const fileInput = page.locator('input[type=file]');
  const fileError = page.locator('#field-document-file-error');
  const documents = page.getByRole('list', { name: 'Justificatifs déposés' }).getByRole('listitem');

  // PDF de 11 Mo : refusé sous le champ avant tout envoi, dossier inchangé.
  await page.locator('#field-document-type').selectOption('diploma');
  await page.locator('#field-document-title').fill('Master 2 Psychologie clinique');
  await page.locator('#field-document-issuer').fill('Université Lyon 2');
  await page.locator('#field-document-year').fill('2014');
  await fileInput.setInputFiles({
    name: 'gros.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(11 * 1024 * 1024)]),
  });
  await expect(fileError).toContainText('dépasse 10 Mo');
  await page.getByRole('button', { name: 'Ajouter au dossier' }).click();
  await expect(fileError).toContainText('dépasse 10 Mo');
  await expect(documents).toHaveCount(0);

  // .exe renommé .pdf : le serveur reconnaît le contenu → 415 sous le champ, dossier inchangé.
  await fileInput.setInputFiles({
    name: 'diplome.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('MZ\u0090\u0000ceci-n-est-pas-un-pdf'),
  });
  await expect(fileError).toHaveCount(0);
  await page.getByRole('button', { name: 'Ajouter au dossier' }).click();
  await expect(fileError).toContainText('PDF, JPEG et PNG');
  await expect(documents).toHaveCount(0);

  // Un vrai PDF : 201, liste à un, il manque encore la pièce d'identité, encart conseillé (ADELI).
  await fileInput.setInputFiles({
    name: 'master-psycho-2014.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(
      '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF',
    ),
  });
  await page.getByRole('button', { name: 'Ajouter au dossier' }).click();
  await expect(documents).toHaveCount(1);
  await expect(documents.first()).toContainText('Master 2 Psychologie clinique');
  await expect(documents.first()).toContainText('Université Lyon 2');
  await expect(documents.first()).toContainText('En attente de vérification');
  await expect(submit).toBeDisabled();
  await expect(page.locator('.missing')).toHaveText("Il manque : pièce d'identité.");
  await expect(page.locator('.recommended')).toContainText('attestation ADELI / RPPS');
  await expect(steps.nth(2)).toContainText('1 déposés · 1 manquant(s)');

  // Pièce d'identité (PNG) : la règle de complétude du serveur est satisfaite, Soumettre s'active.
  await page.locator('#field-document-type').selectOption('identity');
  await page.locator('#field-document-title').fill('Carte nationale d’identité');
  await fileInput.setInputFiles({
    name: 'cni.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64',
    ),
  });
  await page.getByRole('button', { name: 'Ajouter au dossier' }).click();
  await expect(documents).toHaveCount(2);
  await expect(page.locator('.missing')).toHaveCount(0);
  await expect(submit).toBeEnabled();
  await expect(
    page.getByRole('button', { name: 'Retirer Carte nationale d’identité' }),
  ).toBeVisible();
  await expectNoAxeViolations(page);

  // Soumission : under_review, dossier verrouillé, bandeau mis à jour sans rechargement.
  await submit.click();
  await expect(page.locator('.notice.info')).toContainText('en cours de vérification');
  await expect(page.getByRole('status').filter({ hasText: 'dossier professionnel' })).toContainText(
    'en cours de vérification',
  );
  await expect(steps.nth(3)).toHaveAttribute('aria-current', 'step');
  await expect(page.getByRole('button', { name: /^Retirer / })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ajouter au dossier' })).toHaveCount(0);
  await expect(submit).toHaveCount(0);
  await expectNoAxeViolations(page);

  // Le serveur confirme l'état et le verrou (409 sur un retrait forcé), et le bandeau tient sur /patients.
  const verification = await request.get('http://localhost:8080/api/me/verification');
  expect(verification.status()).toBe(200);
  const body = (await verification.json()) as { status: string; documents: { id: string }[] };
  expect(body.status).toBe('under_review');
  const forcedDelete = await request.delete(
    `http://localhost:8080/api/me/verification/documents/${body.documents[0].id}`,
  );
  expect(forcedDelete.status()).toBe(409);

  await page.goto('/fr/patients');
  await expect(page.getByRole('status').filter({ hasText: 'dossier professionnel' })).toContainText(
    'en cours de vérification',
  );
});
