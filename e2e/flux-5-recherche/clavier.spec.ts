import { expect, test } from '@playwright/test';

import { signIn } from '../preferences/accounts';
import { expectNoAxeViolations } from '../support/axe';
import { keyboardOnly, tabTo } from '../support/clavier';
import { createDossier } from './dossier-data';

// B3 flux 5 au clavier seul (M7-04, B7, fiche 07) : / depuis l'onglet Timeline, saisie, résultats
// et facettes, filtre « Ressentis » au clavier, ↓ pour l'aperçu, « Ouvrir dans la timeline » qui
// positionne la timeline sur l'entrée ; puis une seconde recherche fermée par Échap, qui rend
// l'onglet. Aucun geste de pointeur (keyboardOnly). Contre l'API locale, jamais de mock du backend.

test('flux 5 au clavier : /, saisie, facette Ressentis, ↓, aperçu, « Ouvrir dans la timeline », Échap', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const dossier = await createDossier(request, 'm7-04.flux5');
  await signIn(page, dossier.account);
  const keys = await keyboardOnly(page);
  await page.goto(`/fr/patients/${dossier.patientId}/timeline`);
  await expect(page.getByRole('heading', { level: 1, name: 'Marie D.' })).toBeVisible();
  const bar = page.getByRole('searchbox', { name: 'Rechercher' });
  const results = page.getByRole('list', { name: 'Résultats', exact: true });

  // 1. / donne le focus au champ de l'en-tête ; la saisie lance la recherche.
  await page.keyboard.press('/');
  await expect(bar).toBeFocused();
  await page.keyboard.type('entretien manager');
  await expect(page).toHaveURL(/\/search\?q=entretien(%20|\+)manager$/);
  await expect(results.getByRole('listitem')).toHaveCount(4);
  await expect(page.locator('pm-search-preview pm-state [aria-busy="true"]')).toHaveCount(0);
  await expectNoAxeViolations(page);

  // 2. Facette « Ressentis » : Tab jusqu'à la puce, Entrée ; compteurs inchangés, URL à jour.
  const types = page.getByRole('group', { name: 'Types' });
  const feelings = types.getByRole('button', { name: /^Ressentis \d+$/ });
  await tabTo(page, feelings, { max: 30 });
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/types=feeling/);
  await expect(feelings).toHaveAttribute('aria-pressed', 'true');
  await expect(results.getByRole('listitem')).toHaveCount(2);

  // 3. Retour au champ (Maj+Tab), ↓ sélectionne le second résultat, son aperçu s'affiche.
  await tabTo(page, bar, { backwards: true, max: 30 });
  const selected = page.locator('li[aria-current="true"]');
  const firstId = await selected.getAttribute('data-entry-id');
  await page.keyboard.press('ArrowDown');
  await expect(selected).not.toHaveAttribute('data-entry-id', firstId ?? '');
  const selectedId = await selected.getAttribute('data-entry-id');
  // Les deux ressentis qui citent « entretien » et « manager » ; l'ordre est celui du classement.
  const texts: Record<string, string> = {
    [dossier.ids.feeling]: 'Je tourne en boucle',
    [dossier.ids.feeling3]: 'Calme retrouvé',
  };
  expect(Object.keys(texts)).toContain(selectedId);
  const preview = page.getByRole('complementary', { name: "Aperçu de l'entrée sélectionnée" });
  await expect(preview).toContainText(texts[selectedId!]);
  await expectNoAxeViolations(page);

  // 4. « Ouvrir dans la timeline » (Tab jusqu'au bouton de l'aperçu, Entrée) : la timeline
  //    amène l'entrée à l'écran et la sélectionne.
  await tabTo(page, preview.getByRole('button', { name: 'Ouvrir dans la timeline' }), {
    max: 40,
  });
  await page.keyboard.press('Enter');
  const card = page.locator(`pm-timeline-card article[data-entry-id="${selectedId}"]`);
  await expect(card).toBeInViewport();
  await expect(card).toHaveAttribute('aria-current', 'true');
  await expect(page).toHaveURL(new RegExp(`/fr/patients/${dossier.patientId}/timeline$`));
  await expect(bar).toHaveValue('');

  // 5. Échap pendant une recherche : retour à l'onglet d'où l'on vient (la timeline).
  await page.keyboard.press('/');
  await expect(bar).toBeFocused();
  await page.keyboard.type('juin');
  await expect(page).toHaveURL(/\/search\?q=juin/);
  await expect(results.getByRole('listitem').first()).toContainText('Le manager a changé en juin');
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(new RegExp(`/fr/patients/${dossier.patientId}/timeline$`));
  await expect(bar).toHaveValue('');
  await expectNoAxeViolations(page);
  keys.expectNoPointer();
});
