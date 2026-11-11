import { expect, Page } from '@playwright/test';

// Outils clavier de l'inscription (fiche 12) et du dossier professionnel (fiche 13), partagés par
// les e2e du flux 9 et le parcours clavier du flux 1 (M7-04).

type Profession = 'psychologist' | 'psychiatrist' | 'coach';
/** Ordre des cartes de profession (un seul arrêt de tabulation, flèches pour choisir). */
const PROFESSIONS: Profession[] = ['psychologist', 'psychiatrist', 'coach'];

/** Tabule jusqu'au champ voulu (sans souris) ; échoue après 40 tabulations. */
export async function tabTo(page: Page, id: string): Promise<void> {
  for (let i = 0; i < 40; i++) {
    if ((await page.evaluate(() => document.activeElement?.id)) === id) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`le focus n'a jamais atteint #${id}`);
}

export async function expectFocus(page: Page, id: string): Promise<void> {
  await expect(page.locator(`#${id}`)).toBeFocused();
}

/** Tabule jusqu'au bouton, lien ou champ dont le nom accessible (aria-label ou texte) vaut `name`. */
export async function tabToName(page: Page, name: string): Promise<void> {
  for (let i = 0; i < 60; i++) {
    const current = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || !el.matches('button, a, input, select, textarea')) return null;
      return (el.getAttribute('aria-label') ?? el.textContent ?? '').trim();
    });
    if (current === name) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`le focus n'a jamais atteint « ${name} »`);
}

/**
 * Remplit l'inscription entièrement au clavier, dans l'ordre des champs de la fiche 12 (coach par
 * défaut : deux flèches depuis la première carte), puis Entrée sur « Créer mon compte ».
 */
export async function registerByKeyboard(
  page: Page,
  email: string,
  password: string,
  profession: Profession = 'coach',
): Promise<void> {
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
  // Aucune carte cochée : Espace coche la première, les flèches passent aux suivantes.
  if (profession === 'psychologist') await page.keyboard.press('Space');
  for (let i = 0; i < PROFESSIONS.indexOf(profession); i++) await page.keyboard.press('ArrowRight');
  await expect(page.locator(`#field-profession-${profession}`)).toBeChecked();
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
  // UX-D2 : liens « conditions d'utilisation » et « politique de confidentialité » dans la case.
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: "conditions d'utilisation" })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'politique de confidentialité' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Créer mon compte' })).toBeFocused();
  await page.keyboard.press('Enter');
}
