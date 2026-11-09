import { expect, Page, test } from '@playwright/test';

import { ADMIN_AVAILABLE, ADMIN_MISSING } from '../support/admin';
import { expectNoAxeViolations } from '../support/axe';
import { keyboardOnly, tabTo } from '../support/clavier';
import { publishPsychologistInParis, PublishedPractitioner } from './published-practitioner';

// B3 flux 7 au clavier seul (M7-04, B7, fiches 08, 09) : un visiteur, sans compte, cherche,
// filtre, ouvre une fiche et écrit au praticien, sans souris (keyboardOnly). Contre l'API réelle,
// jamais de mock du backend.
// - La recherche, les filtres et l'état « aucun résultat » (UC-14 A1) se testent sans données.
// - Le parcours complet exige une fiche publiée, donc un dossier approuvé par un administrateur
//   (G Q14) : il s'ignore sans PSYMATE_E2E_ADMIN_* (e2e/support/admin.ts). Il fait un envoi de
//   formulaire. Limite de l'API : 5 envois par heure et par IP (G Q24) ; avec ce test, une passe
//   complète avec administrateur en fait 3 (visiteur.spec.ts : message et piège à robots ; ici :
//   message au clavier), soit une seule passe par heure.

/** Ouvre un mat-select au clavier (Espace), choisit l'option par les flèches, Entrée. */
async function chooseByKeyboard(page: Page, label: string, option: RegExp): Promise<void> {
  const select = page.getByRole('combobox', { name: label });
  await tabTo(page, select, { max: 40 });
  await page.keyboard.press('Space');
  const wanted = page.getByRole('option', { name: option });
  await expect(wanted).toBeVisible();
  // L'option active est celle que désigne aria-activedescendant (ce que lit un lecteur d'écran).
  const wantedId = await wanted.getAttribute('id');
  await expect(select).toHaveAttribute('aria-activedescendant', /./);
  let active = await select.getAttribute('aria-activedescendant');
  for (let i = 0; i < 30 && active !== wantedId; i++) {
    await page.keyboard.press('ArrowDown');
    const previous = active;
    await expect.poll(() => select.getAttribute('aria-activedescendant')).not.toBe(previous);
    active = await select.getAttribute('aria-activedescendant');
  }
  await expect(select).toHaveAttribute('aria-activedescendant', wantedId ?? '');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('listbox')).toHaveCount(0);
}

test('flux 7 au clavier, sans fiche publiée : ville, profession, filtre, aucun résultat, critère retiré', async ({
  page,
}) => {
  const keys = await keyboardOnly(page);
  await page.goto('/fr/annuaire');
  await expect(
    page.getByRole('heading', { level: 1, name: /Trouver un psychologue/ }),
  ).toBeVisible();
  const search = page.getByRole('search', { name: 'Rechercher un praticien' });

  // Ville (Tab, saisie) puis Profession (liste au clavier), Entrée sur « Rechercher ».
  await tabTo(page, search.getByLabel('Ville'), { max: 40 });
  await page.keyboard.type('Zzyzx-sur-Mer');
  await chooseByKeyboard(page, 'Profession', /^Psychologue/);
  await tabTo(page, search.getByRole('button', { name: 'Rechercher' }), { max: 10 });
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/ville=Zzyzx-sur-Mer/);
  await expect(page).toHaveURL(/profession=psychologist/);

  // Facette « Accepte de nouveaux patients » : Tab, Espace ; l'URL suit.
  const accepting = page
    .getByRole('complementary', { name: 'Filtres' })
    .getByRole('checkbox', { name: 'Accepte de nouveaux patients' });
  await tabTo(page, accepting, { max: 60 });
  await page.keyboard.press('Space');
  await expect(page).toHaveURL(/accepte=oui/);

  // Aucun résultat (UC-14 A1) : critères retirables au clavier, la ville part de l'URL.
  const none = page.locator('.no-results[role=status]');
  await expect(none).toContainText('Aucun praticien à Zzyzx-sur-Mer pour ces critères');
  await expect(none.getByRole('button', { name: 'Élargir à toute la France' })).toBeVisible();
  await expectNoAxeViolations(page);
  const city = none.getByRole('button', { name: /Zzyzx-sur-Mer/ });
  await tabTo(page, city, { max: 60 });
  await page.keyboard.press('Enter');
  await expect(page).not.toHaveURL(/ville=/);
  await expectNoAxeViolations(page);
  keys.expectNoPointer();
});

test.describe('flux 7 au clavier, fiche publiée', () => {
  let practitioner: PublishedPractitioner;

  test.beforeAll(async () => {
    test.skip(!ADMIN_AVAILABLE, ADMIN_MISSING);
    test.setTimeout(60_000);
    practitioner = await publishPsychologistInParis();
  });

  test('ville, profession, fiche, formulaire rempli et envoyé, confirmation', async ({ page }) => {
    test.setTimeout(90_000);
    const keys = await keyboardOnly(page);
    await page.goto('/fr/annuaire');
    const search = page.getByRole('search', { name: 'Rechercher un praticien' });
    await tabTo(page, search.getByLabel('Ville'), { max: 40 });
    await page.keyboard.type('Paris');
    await chooseByKeyboard(page, 'Profession', /^Psychologue/);
    await tabTo(page, search.getByRole('button', { name: 'Rechercher' }), { max: 10 });
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/ville=Paris/);

    // La fiche : Tab jusqu'à « Voir la fiche … », Entrée.
    const card = page.locator('pm-practitioner-card').filter({ hasText: practitioner.displayName });
    await tabTo(
      page,
      card.getByRole('link', { name: `Voir la fiche ${practitioner.displayName}` }),
      { max: 120 },
    );
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('heading', { level: 1, name: practitioner.displayName }),
    ).toBeVisible();
    await expectNoAxeViolations(page);

    // « Prendre contact » : le titre du formulaire reçoit le focus ; Tab de champ en champ.
    await tabTo(page, page.getByRole('link', { name: 'Prendre contact' }), { max: 40 });
    await page.keyboard.press('Enter');
    const contact = page.locator('#contact');
    await expect(
      page.getByRole('heading', { name: `Envoyer un message à ${practitioner.displayName}` }),
    ).toBeFocused();
    await tabTo(page, contact.getByLabel('Votre nom'), { max: 5 });
    await page.keyboard.type('Sam Clavier');
    await tabTo(page, contact.getByLabel('Votre e-mail'), { max: 5 });
    await page.keyboard.type('sam.clavier@example.test');
    await tabTo(page, contact.getByLabel('Message', { exact: true }), { max: 5 });
    await page.keyboard.type('Bonjour, avez-vous un créneau le samedi ?');
    const consent = contact.getByRole('checkbox', { name: /J'accepte que mes coordonnées/ });
    await tabTo(page, consent, { max: 5 });
    await page.keyboard.press('Space');
    await expect(consent).toBeChecked();
    const sent = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/practitioners/${practitioner.slug}/contact`) &&
        r.request().method() === 'POST',
    );
    await tabTo(page, contact.getByRole('button', { name: 'Envoyer le message' }), { max: 5 });
    await page.keyboard.press('Enter');
    expect((await sent).status(), 'au-delà de 5 envois par heure et par IP : 429 (G Q24)').toBe(
      202,
    );
    await expect(contact.getByRole('status')).toContainText(
      `Votre message a été transmis à ${practitioner.displayName}.`,
    );
    await expectNoAxeViolations(page);
    keys.expectNoPointer();
  });
});
