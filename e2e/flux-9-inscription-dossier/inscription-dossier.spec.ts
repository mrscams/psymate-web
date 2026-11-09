import { APIRequestContext, expect, test } from '@playwright/test';

import { confirmEmail, enableTwoFactor, register, uniqueEmail } from '../support/accounts';
import { expectNoAxeViolations } from '../support/axe';
import { totp, totpStep } from '../support/totp';
import { expectFocus, registerByKeyboard, tabTo, tabToName } from './keyboard';

// B3 flux 9 (M1-15, fiches 11, 12, 13) : inscription, confirmation par Mailpit, dossier
// professionnel, bandeau d'état. Contre l'API locale (seed small) et Mailpit, jamais de mock.

const MAILPIT = 'http://localhost:8025';
const STRONG_PASSWORD = 'Vendôme-Lyon-2026!x';
const COMPROMISED_PASSWORD = 'motdepasse1234';

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
    page.getByRole('heading', { level: 1, name: /Un dernier clic : confirmez votre e-mail/ }),
  ).toBeVisible();

  const subjects = await mailSubjects(request, email, 1);
  expect(subjects).toContain('PsyMate : confirmez votre adresse e-mail');
});

test('e-mail déjà utilisé : même 201, même écran, e-mail « vous avez déjà un compte »', async ({
  page,
  request,
}) => {
  const existing = await register(request, 'm1-15.doublon');
  // mailSubjects attend lui-même l'e-mail jusqu'à 15 s (file asynchrone de l'API, voir
  // e2e/support/api-drain.ts) : le poll lui laisse ce délai au lieu des 5 s par défaut.
  await expect
    .poll(() => mailSubjects(request, existing.email, 1), { timeout: 15_000 })
    .toHaveLength(1);

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

test('connexion au clavier : erreur 401, afficher le mot de passe, bloc code (2FA), axe à chaque état', async ({
  page,
  request,
}) => {
  const account = await register(request, 'm1-15.clavier');
  await confirmEmail(request, account.email);
  const { secret, usedStep } = await enableTwoFactor(request, (s) => {
    const step = totpStep();
    return { value: totp(s, step), step };
  });

  await page.goto('/fr/connexion');
  await tabToName(page, 'Créer un compte');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Adresse e-mail')).toBeFocused();
  await page.keyboard.type(account.email);
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Mot de passe', { exact: true })).toBeFocused();
  await page.keyboard.type('Pas-le-bon-mot-de-passe-1');
  await page.keyboard.press('Tab');
  const toggle = page.getByRole('button', { name: 'Afficher le mot de passe' });
  await expect(toggle).toBeFocused();
  await page.keyboard.press('Space');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('input[autocomplete=current-password]')).toHaveAttribute(
    'type',
    'text',
  );
  // Le bouton garde le focus (le clic ne remonte pas au conteneur mat-form-field).
  await expect(toggle).toBeFocused();
  await page.keyboard.press('Space');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Mot de passe oublié ?' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('checkbox', { name: /Rester connecté/ })).toBeFocused();
  await page.keyboard.press('Space');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeFocused();
  await page.keyboard.press('Enter');

  // 401 : message unique, focus rendu au mot de passe, axe sur l'état d'erreur.
  await expect(page.getByRole('alert')).toHaveText('E-mail, mot de passe ou code incorrect.');
  await expect(page.getByLabel('Mot de passe', { exact: true })).toBeFocused();
  await expectNoAxeViolations(page);

  await page.keyboard.press('Control+A');
  await page.keyboard.type(account.password);
  await page.keyboard.press('Enter');

  // 202 : le bloc code apparaît et reçoit le focus ; axe sur l'état « code demandé » (fiche 11).
  const code = page.getByLabel('Code de vérification');
  await expect(code).toBeFocused();
  await expectNoAxeViolations(page);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Utiliser un code de secours' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(code).toHaveAttribute('inputmode', 'text');
  await expect(code).toBeFocused();
  await expect(page.getByText(/codes de secours/)).toBeVisible();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(code).toHaveAttribute('inputmode', 'numeric');
  await expect(code).toBeFocused();
  await page.keyboard.type(totp(secret, Math.max(usedStep + 1, totpStep())));
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/fr\/patients$/);
});

test('dossier professionnel au clavier : type, intitulé, fichier, Ajouter, Retirer (confirmation), Soumettre', async ({
  page,
  request,
}) => {
  const account = await register(request, 'm1-15.dossier-clavier');
  await confirmEmail(request, account.email);
  await page.goto('/fr/connexion');
  await page.getByLabel('Adresse e-mail').fill(account.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/fr\/patients$/);
  await page.goto('/fr/mon-compte/dossier-professionnel');
  await expect(page.getByText('Aucun justificatif déposé')).toBeVisible();

  const documents = page.getByRole('list', { name: 'Justificatifs déposés' }).getByRole('listitem');
  const pdf = {
    name: 'master.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(
      '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF',
    ),
  };

  // Formulaire d'ajout : liste déroulante au clavier, champs, puis le fichier (la boîte de dialogue
  // du système n'est pas pilotable : setInputFiles pose le fichier sur l'<input type=file> focalisé).
  await tabTo(page, 'field-document-type');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#field-document-type')).toHaveValue('diploma');
  await page.keyboard.press('Tab');
  await expectFocus(page, 'field-document-title');
  await page.keyboard.type('Master 2');
  await page.keyboard.press('Tab');
  await expectFocus(page, 'field-document-issuer');
  await page.keyboard.type('Lyon 2');
  await page.keyboard.press('Tab');
  await expectFocus(page, 'field-document-year');
  await page.keyboard.type('2014');
  await page.keyboard.press('Tab');
  await expectFocus(page, 'field-document-file');
  await page.locator('#field-document-file').setInputFiles(pdf);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Ajouter au dossier' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(documents).toHaveCount(1);

  // Retirer : la confirmation s'ouvre, Échap la ferme sans rien retirer, puis Tab + Entrée confirme.
  await tabToName(page, 'Retirer Master 2');
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: /Retirer « Master 2 » \?/ });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(documents).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Retirer Master 2' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await tabToName(page, 'Retirer');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Aucun justificatif déposé')).toBeVisible();

  // Diplôme + pièce d'identité puis Soumettre au clavier.
  await page.locator('#field-document-type').selectOption('diploma');
  await page.locator('#field-document-title').fill('Master 2');
  await page.locator('#field-document-file').setInputFiles(pdf);
  await page.getByRole('button', { name: 'Ajouter au dossier' }).click();
  await expect(documents).toHaveCount(1);
  await page.locator('#field-document-type').selectOption('identity');
  await page.locator('#field-document-title').fill('CNI');
  await page.locator('#field-document-file').setInputFiles({
    name: 'cni.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64',
    ),
  });
  await page.getByRole('button', { name: 'Ajouter au dossier' }).click();
  await expect(documents).toHaveCount(2);
  await tabToName(page, 'Soumettre le dossier pour vérification');
  await page.keyboard.press('Enter');
  await expect(page.locator('.notice.info')).toContainText('en cours de vérification');
  await expectNoAxeViolations(page);
});
