import { expect, test } from '@playwright/test';

import { createAccount, signIn } from '../preferences/accounts';
import { expectNoAxeViolations } from '../support/axe';
import { keyboardOnly, tabTo } from '../support/clavier';
import { block, isOverview, overviewFolder, overviewWindow, windowSelector } from './overview-data';

// B3 flux 6 au clavier seul (M7-04, B7, fiche 02 ; vue unifiée UX-S6) : ouvrir le patient depuis
// la liste (/ puis le nom, Entrée), lire la vue d'ensemble, changer de fenêtre, déplier « Voir les
// données », ouvrir le graphe centré sur la situation en cours, revenir (touche 1), « Démarrer la
// séance » : le bloc de saisie prend le focus. Aucun geste de pointeur (keyboardOnly). Contre l'API
// locale (seed small, Mailpit), jamais de mock du backend.

test('flux 6 au clavier : / nom Entrée, fenêtre, données, situation → graphe, 1, Démarrer la séance', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const account = await createAccount(request, 'm7-04.flux6', 'psychologist');
  const folder = await overviewFolder(request);
  await signIn(page, account);
  const keys = await keyboardOnly(page);
  await page.reload();

  // 1. Ouvrir le patient : / filtre la liste, Entrée ouvre le premier dossier trouvé.
  await expect(page.getByRole('link', { name: 'Marie D.', exact: true })).toBeVisible();
  await page.keyboard.press('/');
  await page.keyboard.type('marie');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/fr/patients/${folder.patientId}$`));
  await expect(page.getByRole('heading', { level: 1, name: 'Marie D.' })).toBeVisible();

  // 2. Lecture : bande « Depuis », ressentis, séances, situations dans la colonne latérale.
  const situations = block(page, /^Situations en cours/);
  await expect(situations).toContainText('Surcharge au travail');
  const feelings = block(page, 'Comment évoluent les ressentis');
  await expect(feelings).toBeVisible();
  const sessions = block(page, 'Dernières séances').locator('.sess');
  await expect(sessions.first()).toBeVisible();
  const before = await sessions.count();
  await expectNoAxeViolations(page);

  // 3. Fenêtre « 30 j » (en-tête), puis « Voir les données » : Entrée déplie le tableau.
  const windows = windowSelector(page);
  await tabTo(page, windows.getByRole('button', { name: '30 j' }), { max: 80 });
  let reread = page.waitForResponse((r) => isOverview(r, folder.patientId));
  await page.keyboard.press('Enter');
  expect(overviewWindow(await reread)).toBe('30d');
  await expect(block(page, 'Émotions · 30 jours')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(windows.getByRole('button', { name: '90 j' })).toBeFocused();
  reread = page.waitForResponse((r) => isOverview(r, folder.patientId));
  await page.keyboard.press('Space');
  expect(overviewWindow(await reread)).toBe('90d');
  const data = feelings.getByRole('button', { name: 'Voir les données' });
  await tabTo(page, data, { max: 80 });
  await page.keyboard.press('Enter');
  await expect(feelings.getByRole('button', { name: 'Masquer les données' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(feelings.getByRole('table')).toBeVisible();

  // 4. Situation active → graphe centré sur elle ; touche 1 : retour à la vue d'ensemble.
  await tabTo(page, situations.getByRole('link', { name: /voir dans le graphe/i }), {
    max: 120,
  });
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(
    new RegExp(`/fr/patients/${folder.patientId}/graph\\?root=${folder.situation}$`),
  );
  // « Centré sur » (UX-B3) : bouton de la liste filtrable, qui montre le titre de la racine.
  const rootPicker = page.getByRole('button', {
    name: 'Centré sur Surcharge au travail',
    exact: true,
  });
  await expect(rootPicker).toHaveAttribute('aria-haspopup', 'listbox');
  await expect(rootPicker.locator('.value')).toHaveText('Surcharge au travail');
  await page.keyboard.press('1');
  await expect(page).toHaveURL(new RegExp(`/fr/patients/${folder.patientId}$`));

  // 5. « Démarrer la séance » (étape 4, UX-S3) : l'onglet Séance s'ouvre, le bloc de saisie prend
  //    le focus ; « Vue d'ensemble » reste à un clic, sa synthèse relue compte la séance en cours.
  await tabTo(page, page.getByRole('button', { name: 'Démarrer la séance' }), { max: 80 });
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/fr/patients/${folder.patientId}/session$`));
  await expect(page.getByRole('textbox', { name: 'Noter quelque chose' })).toBeFocused();
  await expectNoAxeViolations(page);
  await tabTo(page, page.getByRole('link', { name: /Vue d'ensemble/ }), { max: 80 });
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/fr/patients/${folder.patientId}$`));
  await expect(sessions).toHaveCount(before + 1);
  keys.expectNoPointer();
});
