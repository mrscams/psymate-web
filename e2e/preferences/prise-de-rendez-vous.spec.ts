import { expect, Locator, Page, Request, test } from '@playwright/test';

import { shoot } from '../support/captures';
import { expectNoAxeViolations } from '../support/axe';
import { keyboardOnly, tabTo } from '../support/clavier';
import { createAccount, signIn } from './accounts';

// Fiche 14, section « Prise de rendez-vous en ligne » (M14-11, G Q64), contre l'API réelle, jamais
// de mock du backend. Chaque test crée son compte jetable : un compte neuf n'est ni approuvé ni
// publié, la section y montre donc le bandeau « profil non publié » ; le cas « offerte, lien
// visible » (compte approuvé et publié) est couvert par le test Vitest de la page, session simulée.

const PREFERENCES = '/fr/mon-compte/preferences';
const PREFERENCES_API = '/api/me/preferences';

/** Les corps des PATCH /api/me/preferences envoyés par la page, dans l'ordre. */
function recordPatches(page: Page): Record<string, unknown>[] {
  const bodies: Record<string, unknown>[] = [];
  page.on('request', (request: Request) => {
    if (request.method() === 'PATCH' && request.url().endsWith(PREFERENCES_API)) {
      bodies.push(request.postDataJSON() as Record<string, unknown>);
    }
  });
  return bodies;
}

function patchResponse(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.url().endsWith(PREFERENCES_API) && response.request().method() === 'PATCH',
  );
}

async function openSection(page: Page): Promise<Locator> {
  await page.goto(PREFERENCES);
  await expect(page.getByRole('heading', { level: 1, name: 'Préférences' })).toBeVisible();
  const section = page.getByRole('region', { name: 'Prise de rendez-vous en ligne' });
  await expect(section).toBeVisible();
  // Le profil est lu : le bandeau d'un compte neuf (non publié) est là.
  await expect(section.getByRole('note').first()).toBeVisible();
  return section;
}

function day(section: Locator, name: string): Locator {
  return section.getByRole('group', { name: `Plages du ${name}` });
}

async function noHorizontalScroll(page: Page): Promise<void> {
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `défilement horizontal à ${page.viewportSize()?.width} px`).toBeLessThanOrEqual(
    0,
  );
}

test('activer, mode automatique, lundi 09:00–12:00, enregistrer, recharger : relu à l’identique', async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const account = await createAccount(request, 'm14-11.parcours', 'psychologist');
  await signIn(page, account);
  const patches = recordPatches(page);
  const section = await openSection(page);

  // Désactivée par défaut ; profil non publié : bandeau et lien, tous les réglages visibles.
  await expect(section.getByRole('status').first()).toHaveText(
    "Désactivée : votre fiche publique n'a pas de bouton « Prendre rendez-vous ».",
  );
  const note = section.getByRole('note').first();
  await expect(note).toContainText(
    "Votre profil public n'est pas publié : la prise de rendez-vous ne sera proposée qu'une fois le profil publié.",
  );
  await expect(note.getByRole('link', { name: 'Mon profil public' })).toHaveAttribute(
    'href',
    /\/mon-compte\/profil-public$/,
  );
  await expect(section.getByRole('link', { name: /Voir ma page de rendez-vous/ })).toHaveCount(0);
  await expect(section.getByRole('spinbutton', { name: "Durée d'un créneau" })).toHaveValue('60');
  await expect(section.getByRole('spinbutton', { name: 'Délai minimal' })).toHaveValue('24');
  await expect(section.getByRole('spinbutton', { name: 'Horizon' })).toHaveValue('28');
  await expect(section.getByRole('checkbox', { name: 'Au cabinet' })).toBeChecked();
  await expect(section.getByRole('combobox', { name: 'Fuseau horaire' })).toHaveValue(
    'Europe/Paris',
  );
  await expect(section.getByText('0 plage sur 21')).toBeVisible();
  await expectNoAxeViolations(page);
  await shoot(page, 'm14-11-01-desactivee');

  // Activation : l'interrupteur reste utilisable sans profil publié.
  const toggle = section.getByRole('switch', { name: 'Proposer la prise de rendez-vous en ligne' });
  let saved = patchResponse(page);
  await toggle.click();
  expect((await saved).status()).toBe(200);
  await expect(toggle).toBeChecked();
  await expect(section.getByRole('status').first()).toHaveText(
    "La prise de rendez-vous n'est pas proposée tant qu'il n'y a pas de plage.",
  );
  await expect(
    section.getByText('Ajoutez au moins une plage pour que la prise de rendez-vous soit proposée.'),
  ).toBeVisible();

  // Mode automatique.
  saved = patchResponse(page);
  await section.getByRole('radio', { name: /Acceptation automatique dans mes plages/ }).check();
  expect((await saved).status()).toBe(200);

  // Lundi 09:00–12:00 : rien ne part avant « Enregistrer les plages ».
  const monday = day(section, 'lundi');
  await monday.getByRole('button', { name: 'Ajouter une plage' }).click();
  const start = monday.getByRole('textbox', { name: 'Début de la plage 1 du lundi' });
  await expect(start).toBeFocused();
  await start.fill('09:00');
  await monday.getByRole('textbox', { name: 'Fin de la plage 1 du lundi' }).fill('12:00');
  await expect(section.getByText('Modifications non enregistrées')).toBeVisible();
  const before = patches.length;
  saved = patchResponse(page);
  await section.getByRole('button', { name: 'Enregistrer les plages' }).click();
  const response = await saved;
  expect(response.status()).toBe(200);
  expect(patches.length).toBe(before + 1);
  expect((await response.json())['booking.windows']).toEqual([
    { day: 1, start: '09:00', end: '12:00' },
  ]);
  await expect(section.getByText('1 plage sur 21')).toBeVisible();
  await expect(section.getByRole('button', { name: 'Enregistrer les plages' })).toBeDisabled();
  // Activée, une plage, profil non publié : pas de ligne d'état, le bandeau la remplace.
  await expect(section.locator('.section-status')).toHaveCount(0);
  await expect(section.getByRole('link', { name: /Voir ma page de rendez-vous/ })).toHaveCount(0);

  expect(patches).toEqual([
    { 'booking.enabled': true },
    { 'booking.confirmation': 'auto' },
    { 'booking.windows': [{ day: 1, start: '09:00', end: '12:00' }] },
  ]);

  // Rechargement : les valeurs viennent du serveur, identiques.
  await page.reload();
  const reloaded = page.getByRole('region', { name: 'Prise de rendez-vous en ligne' });
  await expect(
    reloaded.getByRole('switch', { name: 'Proposer la prise de rendez-vous en ligne' }),
  ).toBeChecked();
  await expect(
    reloaded.getByRole('radio', { name: /Acceptation automatique dans mes plages/ }),
  ).toBeChecked();
  await expect(
    day(reloaded, 'lundi').getByRole('textbox', { name: 'Début de la plage 1 du lundi' }),
  ).toHaveValue('09:00');
  await expect(
    day(reloaded, 'lundi').getByRole('textbox', { name: 'Fin de la plage 1 du lundi' }),
  ).toHaveValue('12:00');
  await expect(reloaded.getByText('Enregistré', { exact: true })).toBeVisible();
  await expectNoAxeViolations(page);
  await shoot(page, 'm14-11-02-une-plage');

  // Retirer la dernière plage et enregistrer : « pas proposée tant qu'il n'y a pas de plage ».
  await day(reloaded, 'lundi')
    .getByRole('button', { name: 'Retirer la plage du lundi, 09:00 à 12:00' })
    .click();
  await expect(
    day(reloaded, 'lundi').getByRole('button', { name: 'Ajouter une plage' }),
  ).toBeFocused();
  saved = patchResponse(page);
  await reloaded.getByRole('button', { name: 'Enregistrer les plages' }).click();
  expect((await saved).request().postDataJSON()).toEqual({ 'booking.windows': [] });
  await expect(reloaded.getByRole('status').first()).toHaveText(
    "La prise de rendez-vous n'est pas proposée tant qu'il n'y a pas de plage.",
  );
});

test('erreurs de forme : aucune requête, message sous la plage ou sous le réglage', async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const account = await createAccount(request, 'm14-11.erreurs', 'psychologist');
  await signIn(page, account);
  const patches = recordPatches(page);
  const section = await openSection(page);
  const save = section.getByRole('button', { name: 'Enregistrer les plages' });

  // Fin avant début.
  const tuesday = day(section, 'mardi');
  await tuesday.getByRole('button', { name: 'Ajouter une plage' }).click();
  await tuesday.getByRole('textbox', { name: 'Début de la plage 1 du mardi' }).fill('14:00');
  await tuesday.getByRole('textbox', { name: 'Fin de la plage 1 du mardi' }).fill('12:00');
  await expect(tuesday.getByRole('alert')).toHaveText('La fin doit être après le début.');
  await expect(
    tuesday.getByRole('textbox', { name: 'Fin de la plage 1 du mardi' }),
  ).toHaveAttribute('aria-invalid', 'true');
  await expect(save).toBeDisabled();
  await tuesday.getByRole('button', { name: /Retirer la plage du mardi/ }).click();

  // Chevauchement le même jour, puis plages contiguës acceptées.
  const thursday = day(section, 'jeudi');
  await thursday.getByRole('button', { name: 'Ajouter une plage' }).click();
  await thursday.getByRole('textbox', { name: 'Début de la plage 1 du jeudi' }).fill('09:00');
  await thursday.getByRole('textbox', { name: 'Fin de la plage 1 du jeudi' }).fill('12:00');
  await thursday.getByRole('button', { name: 'Ajouter une plage' }).click();
  await thursday.getByRole('textbox', { name: 'Début de la plage 2 du jeudi' }).fill('11:00');
  await thursday.getByRole('textbox', { name: 'Fin de la plage 2 du jeudi' }).fill('13:00');
  await expect(thursday.getByRole('alert')).toHaveText(
    'Cette plage chevauche une autre plage du même jour.',
  );
  await expect(save).toBeDisabled();

  // Format : message une fois la plage quittée.
  const wednesday = day(section, 'mercredi');
  await wednesday.getByRole('button', { name: 'Ajouter une plage' }).click();
  await wednesday.getByRole('textbox', { name: 'Début de la plage 1 du mercredi' }).fill('9h');
  await wednesday.getByRole('textbox', { name: 'Fin de la plage 1 du mercredi' }).fill('12:00');
  await expect(wednesday.getByRole('alert')).toHaveText(
    'Heure attendue au format HH:MM, minutes de 5 en 5.',
  );

  // Bornes : durée 10, délai 0, horizon 91.
  for (const [name, value, message] of [
    ["Durée d'un créneau", '10', 'Entre 15 et 180, par pas de 5.'],
    ['Délai minimal', '0', 'Entre 1 et 168.'],
    ['Horizon', '91', 'Entre 7 et 90.'],
  ] as const) {
    const input = section.getByRole('spinbutton', { name });
    await input.fill(value);
    await input.press('Tab');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(input).toHaveAccessibleDescription(new RegExp(message.replace(/\./g, '\\.')));
  }

  // Dernière modalité décochée : message, rien n'est envoyé.
  await section.getByRole('checkbox', { name: 'Au cabinet' }).uncheck();
  await expect(section.getByText('Gardez au moins une modalité.')).toBeVisible();

  await expectNoAxeViolations(page);
  await shoot(page, 'm14-11-03-erreurs');
  expect(patches).toEqual([]);

  // Corrigé : 12:00–14:00 après 09:00–12:00 (contiguës) et 09:00 au mercredi ; un seul PATCH.
  await thursday.getByRole('textbox', { name: 'Début de la plage 2 du jeudi' }).fill('12:00');
  await thursday.getByRole('textbox', { name: 'Fin de la plage 2 du jeudi' }).fill('14:00');
  await wednesday.getByRole('textbox', { name: 'Début de la plage 1 du mercredi' }).fill('09:00');
  await expect(section.getByRole('alert')).toHaveCount(4);
  await expect(save).toBeEnabled();
  const saved = patchResponse(page);
  await save.click();
  expect((await saved).status()).toBe(200);
  expect(patches).toEqual([
    {
      'booking.windows': [
        { day: 3, start: '09:00', end: '12:00' },
        { day: 4, start: '09:00', end: '12:00' },
        { day: 4, start: '12:00', end: '14:00' },
      ],
    },
  ]);
});

test('au clavier, thèmes clair et sombre, 390 px et 720 px sans défilement horizontal', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const account = await createAccount(request, 'm14-11.clavier', 'psychologist');
  await signIn(page, account);
  const patches = recordPatches(page);
  const guard = await keyboardOnly(page);
  const section = await openSection(page);

  // Interrupteur : Espace.
  const toggle = section.getByRole('switch', { name: 'Proposer la prise de rendez-vous en ligne' });
  await tabTo(page, toggle, { max: 80 });
  let saved = patchResponse(page);
  await page.keyboard.press('Space');
  await saved;
  await expect(toggle).toBeChecked();

  // Mode : flèche vers le bas entre les deux boutons radio.
  await page.keyboard.press('Tab');
  await expect(section.getByRole('radio', { name: /Je valide chaque demande/ })).toBeFocused();
  saved = patchResponse(page);
  await page.keyboard.press('ArrowDown');
  await saved;
  await expect(
    section.getByRole('radio', { name: /Acceptation automatique dans mes plages/ }),
  ).toBeChecked();

  // Une plage au vendredi : Entrée sur « Ajouter une plage », saisie, Entrée sur « Enregistrer ».
  const friday = day(section, 'vendredi');
  await tabTo(page, friday.getByRole('button', { name: 'Ajouter une plage' }));
  await page.keyboard.press('Enter');
  await expect(
    friday.getByRole('textbox', { name: 'Début de la plage 1 du vendredi' }),
  ).toBeFocused();
  await page.keyboard.type('14:00');
  await page.keyboard.press('Tab');
  await page.keyboard.type('18:00');
  const saveButton = section.getByRole('button', { name: 'Enregistrer les plages' });
  await tabTo(page, saveButton);
  saved = patchResponse(page);
  await page.keyboard.press('Enter');
  expect((await saved).request().postDataJSON()).toEqual({
    'booking.windows': [{ day: 5, start: '14:00', end: '18:00' }],
  });

  // Modalité « En visio » : Espace.
  await tabTo(page, section.getByRole('checkbox', { name: 'En visio' }));
  saved = patchResponse(page);
  await page.keyboard.press('Space');
  expect((await saved).request().postDataJSON()).toEqual({
    'booking.modalities': ['in_person', 'video'],
  });
  guard.expectNoPointer();
  expect(patches.map((body) => Object.keys(body)[0])).toEqual([
    'booking.enabled',
    'booking.confirmation',
    'booking.windows',
    'booking.modalities',
  ]);
  await expectNoAxeViolations(page);

  // Thème sombre.
  saved = patchResponse(page);
  await page.getByText('Sombre', { exact: true }).click();
  await saved;
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expectNoAxeViolations(page);
  await shoot(page, 'm14-11-04-sombre');

  for (const width of [390, 720]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(section).toBeVisible();
    await noHorizontalScroll(page);
    await shoot(page, `m14-11-05-${width}`);
  }
  await expectNoAxeViolations(page);
});
