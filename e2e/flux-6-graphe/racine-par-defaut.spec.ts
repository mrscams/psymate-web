import { expect, Page, test } from '@playwright/test';

import { createAccount, signIn } from '../preferences/accounts';
import { expectNoAxeViolations } from '../support/axe';
import { shoot } from '../support/captures';
import { enableProbe, graphReady, point, smallFolder } from './graph-support';

// UX-B3 et UX-B7 (audit UX du 9 nov. 2026, fiches 04 et 06), contre l'API locale (seed small),
// jamais de mock du backend : arrivée sur le graphe centrée sur la situation en cours la plus liée,
// « Centré sur » en liste filtrable (plus de select natif), « Tout le dossier » en choix explicite,
// « Lier L » dans la barre, légende dépliée ; éditeur de lien dans l'ordre de la maquette 06, phrase
// épinglée au-dessus du pied, lignes de 56 px ; aucun débordement à 375 px. Captures 1440 px si
// PSYMATE_E2E_CAPTURES désigne un dossier (support/captures.ts).

/** Largeur de défilement de la page : rien ne déborde de la fenêtre. */
async function scrollWidth(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth);
}

test.describe('graphe : racine par défaut et éditeur de lien (UX-B3, UX-B7)', () => {
  test.describe.configure({ timeout: 120_000 });

  test('sans ?root= : centré sur la situation en cours la plus liée, « Centré sur » filtrable, tout le dossier en option', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'ux-b3.racine', 'psychologist');
    const folder = await smallFolder(request);
    await page.setViewportSize({ width: 1440, height: 900 });
    await enableProbe(page);
    await signIn(page, account);

    // Arrivée sans racine : la situation (2 liens, en cours) devient la racine, en profondeur 2.
    await page.goto(`/fr/patients/${folder.patientId}/graph`);
    await expect(page).toHaveURL(new RegExp(`/graph\\?root=${folder.situation}$`));
    await graphReady(page, { count: 4 });
    await expect(page.locator('.count')).toHaveText('4 nœuds · 3 liens');
    const trigger = page.getByRole('button', { name: 'Centré sur Surcharge au travail' });
    await expect(trigger).toBeVisible();
    await expect(
      page.getByRole('group', { name: 'Profondeur' }).getByRole('button', { name: '2' }),
    ).toHaveAttribute('aria-pressed', 'true');
    // Plus aucun select natif dans la barre (le « Centré sur » de 150 options a disparu).
    await expect(page.locator('pm-graph-page .toolbar select')).toHaveCount(0);
    await expect(page.locator('pm-graph-legend .toggle')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.tool.link')).not.toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('.warning-note')).toHaveCount(0);

    // Maquette 04 : panneau de détail ouvert sur un ressenti.
    const feeling = await point(page, folder.feeling);
    await page.mouse.click(feeling.x, feeling.y);
    await expect(page.getByRole('complementary', { name: 'Anxiété 8/10' })).toBeVisible();
    await shoot(page, 'ux-b3-04-graphe-1440', false);
    await expectNoAxeViolations(page);

    // « Centré sur » : liste groupée par type, « Tout le dossier » avec son avertissement.
    await trigger.click();
    const listbox = page.getByRole('listbox', { name: 'Entrées du dossier' });
    await expect(listbox).toBeVisible();
    await expect(listbox.getByRole('option', { name: /^Tout le dossier/ })).toContainText(
      "jusqu'à 150 nœuds, étiquettes masquées",
    );
    await expect(listbox.getByRole('group')).toHaveCount(4);
    await expect(listbox.getByRole('group', { name: 'Médicament' })).toContainText(
      'Sertraline 50 mg',
    );
    const search = page.getByRole('combobox', { name: "Chercher l'entrée au centre du graphe" });
    await expect(search).toBeFocused();
    await shoot(page, 'ux-b3-04-centre-sur-1440', false);
    await expectNoAxeViolations(page);

    // Au clavier : texte, Entrée ; le médicament devient la racine.
    await page.keyboard.type('sertra');
    await expect(listbox.getByRole('option')).toHaveCount(1);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`root=${folder.medication}`));
    await expect(page.getByRole('button', { name: 'Centré sur Sertraline 50 mg' })).toBeFocused();
    await graphReady(page, { count: 3 });

    // « Tout le dossier » reste un choix explicite (?root=all).
    await page.keyboard.press('Enter');
    await expect(search).toBeFocused();
    await page.keyboard.press('Home');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/root=all/);
    await expect(page.getByRole('button', { name: 'Centré sur Tout le dossier' })).toBeVisible();
    await graphReady(page, { count: 4 });
    await expectNoAxeViolations(page);
  });

  test('« Lier L » puis éditeur de lien : ordre Depuis → Relation → Vers, lignes de 56 px, phrase épinglée, « Changer »', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'ux-b7.editeur', 'psychologist');
    const folder = await smallFolder(request);
    await page.setViewportSize({ width: 1440, height: 900 });
    await enableProbe(page);
    await signIn(page, account);
    await page.goto(`/fr/patients/${folder.patientId}/graph?root=${folder.situation}`);
    await graphReady(page, { count: 4 });

    // Ressenti sélectionné, puis « Lier » de la barre : il est la source.
    const at = await point(page, folder.feeling);
    await page.mouse.click(at.x, at.y);
    await page.locator('.tool.link').click();
    const dialog = page.locator('[role="dialog"]:has(pm-link-editor-panel)');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('pm-state [aria-busy="true"]')).toHaveCount(0);
    await expect(dialog.locator('.card-name')).toHaveText('Anxiété 8/10');
    await expect(dialog.locator('form.editor h3.block-label')).toHaveText([
      'Depuis',
      'Relation',
      'Vers',
    ]);

    // Lignes « Vers » de 56 px ; « déjà lié (verbe) » sur la situation liée.
    const rows = dialog.locator('label.target');
    await expect(rows.first()).toBeVisible();
    for (const box of await rows.evaluateAll((items) =>
      items.map((item) => item.getBoundingClientRect().height),
    )) {
      expect(Math.round(box)).toBe(56);
    }
    await expect(
      dialog.locator('label.target.linked').filter({ hasText: 'Surcharge au travail' }),
    ).toContainText(/déjà lié \(.*aggrav/);

    // Puce refusée : grisée, sa raison en infobulle.
    await dialog.getByRole('radio', { name: "Entretien d'évaluation" }).check();
    const relation = dialog.getByRole('group', { name: 'Relation', exact: true });
    const triggers = relation.getByRole('button', { name: 'déclenche', exact: true });
    await expect(triggers).toHaveAttribute('aria-disabled', 'true');
    await expect(triggers).toHaveAttribute('title', /« déclenche » : seulement depuis/);

    // La phrase se lit sans défiler, au-dessus du pied, et se recompose à l'inversion.
    const reading = dialog.locator('.reading');
    await expect(reading).toBeInViewport();
    await dialog.getByRole('button', { name: 'Inverser le sens' }).click();
    await triggers.click();
    await expect(reading.locator('.sentence')).toHaveText(
      "Entretien d'évaluation déclenche Anxiété 8/10",
    );
    await expect(reading.locator('[aria-live="polite"]')).toHaveCount(1);
    await expect(page.locator('.mat-ripple-element')).toHaveCount(0);
    await shoot(page, 'ux-b7-06-editeur-lien-1440', false);
    await expectNoAxeViolations(page);

    // « Changer » : une autre entrée devient la source ; le choix en cours est effacé.
    await dialog.getByRole('button', { name: 'Changer' }).click();
    const sourceSearch = dialog.getByRole('searchbox', { name: 'Rechercher la nouvelle source' });
    await expect(sourceSearch).toBeFocused();
    await sourceSearch.fill('Sertraline');
    await dialog.getByRole('button', { name: 'Sertraline 50 mg' }).click();
    await expect(dialog.locator('.card-name')).toHaveText('Sertraline 50 mg');
    await expect(dialog.getByRole('radio', { checked: true })).toHaveCount(0);
    await expect(
      dialog.getByRole('searchbox', { name: 'Rechercher une entrée du dossier' }),
    ).toBeFocused();
    await expectNoAxeViolations(page);
  });

  test('375 px : ni le graphe ni l’éditeur de lien ne débordent', async ({ page, request }) => {
    const account = await createAccount(request, 'ux-b3.mobile', 'psychologist');
    const folder = await smallFolder(request);
    await page.setViewportSize({ width: 375, height: 812 });
    await enableProbe(page);
    await signIn(page, account);
    await page.goto(`/fr/patients/${folder.patientId}/graph`);
    await graphReady(page, { count: 4 });
    expect(await scrollWidth(page)).toBeLessThanOrEqual(375);
    // Légende repliée sur un écran étroit (elle couvrirait le graphe).
    await expect(page.locator('pm-graph-legend .toggle')).toHaveAttribute('aria-expanded', 'false');
    await page.getByRole('button', { name: /^Centré sur/ }).click();
    await expect(page.getByRole('listbox')).toBeVisible();
    expect(await scrollWidth(page)).toBeLessThanOrEqual(375);
    await page.keyboard.press('Escape');
    await expectNoAxeViolations(page);

    await page.locator('.tool.link').click();
    const dialog = page.locator('[role="dialog"]:has(pm-link-editor-panel)');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('pm-state [aria-busy="true"]')).toHaveCount(0);
    expect(await scrollWidth(page)).toBeLessThanOrEqual(375);
    // Ni le corps défilant du panneau ni la liste « Vers » ne débordent en largeur.
    for (const selector of ['.panel-body', 'fieldset.targets']) {
      const overflow = await dialog
        .locator(selector)
        .evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(overflow, selector).toBeLessThanOrEqual(0);
    }
    const panelRight = await dialog
      .locator('pm-link-editor-panel')
      .evaluate((el) => el.getBoundingClientRect().right);
    for (const right of await dialog
      .locator('label.target')
      .evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().right))) {
      expect(right).toBeLessThanOrEqual(panelRight);
    }
    await expect(dialog.locator('.reading')).toBeInViewport();
    await shoot(page, 'ux-b7-06-editeur-lien-375', false);
    await expectNoAxeViolations(page);
  });
});
