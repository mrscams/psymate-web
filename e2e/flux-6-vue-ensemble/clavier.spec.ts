import { expect, test } from '@playwright/test';

import { createAccount, signIn } from '../preferences/accounts';
import { expectNoAxeViolations } from '../support/axe';
import { keyboardOnly, tabTo } from '../support/clavier';
import { block, overviewFolder, setPreferences } from './overview-data';

// B3 flux 6 au clavier seul (M7-04, B7, fiche 02) : ouvrir le patient depuis la liste (/ puis le
// nom, Entrée), lire la vue d'ensemble, déplier la séance passée, ouvrir le graphe centré sur la
// situation active, revenir (touche 1), « Démarrer la séance » : les séances se replient et la
// barre de capture prend le focus. Aucun geste de pointeur (keyboardOnly). Contre l'API locale
// (seed small, Mailpit), jamais de mock du backend.

test('flux 6 au clavier : / nom Entrée, séance dépliée, situation → graphe, 1, Démarrer la séance', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const account = await createAccount(request, 'm7-04.flux6', 'psychologist');
  await setPreferences(request, { 'overview.view': 'complete' });
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

  // 2. Lecture : faits, situations, tendance, dernières séances (la plus récente dépliée).
  const situations = block(page, 'Situations actives');
  await expect(situations).toContainText('Surcharge au travail');
  await expect(block(page, "Tendance d'intensité · 90 jours")).toBeVisible();
  const sessions = block(page, 'Dernières séances');
  const toggles = sessions.locator('button[aria-expanded]');
  await expect(toggles).toHaveCount(2);
  await expect(toggles.first()).toHaveAttribute('aria-expanded', 'true');
  await expectNoAxeViolations(page);

  // 3. Déplier la séance passée : Tab jusqu'à son bouton, Entrée.
  await tabTo(page, toggles.nth(1), { max: 80 });
  await page.keyboard.press('Enter');
  await expect(toggles.nth(1)).toHaveAttribute('aria-expanded', 'true');
  await expect(sessions.getByRole('link', { name: 'Voir la séance dans la timeline' })).toHaveCount(
    2,
  );

  // 4. Situation active → graphe centré sur elle ; touche 1 : retour à la vue d'ensemble.
  await tabTo(page, situations.getByRole('link', { name: /voir dans le graphe/i }), {
    max: 80,
    backwards: true,
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
  await expect(toggles).toHaveCount(3);
  keys.expectNoPointer();
});
