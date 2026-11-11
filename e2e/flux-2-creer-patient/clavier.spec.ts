import { expect, test } from '@playwright/test';

import { createAccount, signIn } from '../preferences/accounts';
import { expectNoAxeViolations } from '../support/axe';
import { keyboardOnly, tabTo } from '../support/clavier';

// B3 flux 2 au clavier seul (M7-04, B7) : N ouvre la création, nom, pronom, motif, rythme,
// Ctrl+Entrée enregistre ; la vue d'ensemble s'ouvre, vide mais structurée, la barre de capture
// focalisée ; puis la fiche se modifie et s'archive sans souris. Aucun geste de pointeur
// (keyboardOnly). Contre l'API locale (seed small, Mailpit), jamais de mock du backend.

test('flux 2 au clavier : N, nom, pronom, motif, rythme, Ctrl+Entrée → vue d’ensemble, capture focalisée ; fiche, archivage', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const account = await createAccount(request, 'm7-04.flux2', 'psychologist');
  await signIn(page, account);
  const keys = await keyboardOnly(page);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Mes patients' })).toBeVisible();

  // N (raccourci de la liste) : le formulaire de création, focus sur son premier champ utile.
  await page.keyboard.press('n');
  await expect(page).toHaveURL(/\/fr\/patients\/nouveau$/);
  const displayName = page.getByRole('textbox', { name: /Nom affiché/ });
  await tabTo(page, displayName);
  await page.keyboard.type('Marie D.');

  // Date de naissance au clavier (pm-date-field, jj/mm/aaaa), pronom (liste native : flèche bas)
  // et motif initial (contexte libre), atteints par Tab.
  const birthDate = page.getByLabel('Date de naissance');
  await tabTo(page, birthDate);
  await page.keyboard.type('28/07/2003');
  const pronoun = page.getByLabel('Pronom / accord');
  await tabTo(page, pronoun);
  await page.keyboard.press('ArrowDown');
  await expect(pronoun).not.toHaveValue('');
  const reason = page.getByLabel('Motif initial');
  await tabTo(page, reason);
  await page.keyboard.type('Anxiété au travail');

  // Rythme habituel : liste native, flèche bas jusqu'à « Hebdomadaire ».
  const rhythm = page.getByLabel('Rythme habituel');
  await tabTo(page, rhythm);
  for (let i = 0; i < 6 && (await rhythm.inputValue()) !== 'weekly'; i++) {
    await page.keyboard.press('ArrowDown');
  }
  await expect(rhythm).toHaveValue('weekly');
  await expect(page.getByRole('region', { name: "Aperçu de l'en-tête" })).toContainText('Marie D.');
  await expectNoAxeViolations(page);

  // Ctrl+Entrée enregistre depuis n'importe quel champ : patient + séance d'accueil.
  const created = page.waitForResponse(
    (r) => r.url().endsWith('/api/patients') && r.request().method() === 'POST',
  );
  await page.keyboard.press('Control+Enter');
  const response = await created;
  expect(response.status()).toBe(201);
  expect(response.request().postDataJSON()).toMatchObject({
    displayName: 'Marie D.',
    birthDate: '2003-07-28',
    context: { initialReason: 'Anxiété au travail' },
    followUp: { rhythm: 'weekly' },
  });
  const { id } = (await response.json()) as { id: string };

  // Vue d'ensemble vide mais structurée, barre de capture focalisée (B3 flux 2, étape 3).
  await expect(page).toHaveURL(new RegExp(`/fr/patients/${id}$`));
  await expect(page.getByRole('heading', { level: 1, name: 'Marie D.' })).toBeVisible();
  const capture = page.getByRole('textbox', { name: 'Noter quelque chose' });
  await expect(capture).toBeFocused();
  await expectNoAxeViolations(page);

  // Fiche du patient depuis le dossier (Maj+Tab jusqu'au lien de l'en-tête), version 2 au clavier.
  const sheet = page.getByRole('link', { name: /Fiche|Modifier la fiche/ }).first();
  await tabTo(page, sheet, { backwards: true });
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/fr/patients/${id}/fiche$`));
  await expect(birthDate).toHaveValue('28/07/2003');
  const privacy = page.getByRole('region', { name: 'Confidentialité' });
  await expect(privacy.getByRole('button', { name: '1 version', exact: true })).toBeVisible();
  await tabTo(page, rhythm);
  await page.keyboard.press('ArrowDown');
  await expect(rhythm).not.toHaveValue('weekly');
  const patched = page.waitForResponse((r) => r.request().method() === 'PATCH');
  await page.keyboard.press('Control+Enter');
  expect((await patched).status()).toBe(200);
  await expect(privacy.getByRole('button', { name: '2 versions' })).toBeVisible();

  // Archiver : Tab jusqu'à « Archiver… », Entrée, nom retapé, Tab, Entrée.
  await tabTo(page, page.getByRole('button', { name: 'Archiver…' }), { max: 100 });
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  const confirmName = dialog.getByLabel('Tapez « Marie D. » pour confirmer');
  await tabTo(page, confirmName, { max: 6 });
  await page.keyboard.type('Marie D.');
  const confirm = dialog.getByRole('button', { name: 'Archiver ce patient' });
  await tabTo(page, confirm, { max: 6 });
  await expectNoAxeViolations(page);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/fr\/patients$/);
  // Accord selon le pronom choisi (« archivée » pour « elle »).
  await expect(page.getByText(/Marie D\. archivé/)).toBeVisible();
  await expect(page.getByRole('table').getByRole('link', { name: 'Marie D.' })).toHaveCount(0);
  keys.expectNoPointer();
});
