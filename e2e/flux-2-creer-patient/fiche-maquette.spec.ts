import { APIRequestContext, expect, Page, test } from '@playwright/test';

import { setPreferences } from '../flux-6-vue-ensemble/overview-data';
import { createAccount, signIn } from '../preferences/accounts';
import { expectNoAxeViolations } from '../support/axe';
import { shoot } from '../support/captures';

// UX-B8 : fiche patient fidèle à la fiche 16 et à sa maquette (méta complète sous le titre, champs
// date localisés, Suivi en 3 colonnes, cases de drapeau à droite, tags saisis dans la zone de puces).
// Contre l'API locale (seed small), jamais de mock du backend : compte jetable, patient créé par
// l'API.

const API = 'http://localhost:8080';

async function createTag(api: APIRequestContext, label: string): Promise<void> {
  const response = await api.post(`${API}/api/tags`, { data: { label } });
  expect(response.status(), await response.text()).toBe(201);
}

async function createMarie(api: APIRequestContext): Promise<string> {
  await createTag(api, 'travail');
  await createTag(api, 'sommeil');
  const response = await api.post(`${API}/api/patients`, {
    data: {
      displayName: 'Marie D.',
      firstName: 'Marie',
      lastName: 'Dubois',
      birthDate: '2003-07-28',
      pronoun: 'elle',
      context: { situation: 'En couple', initialReason: 'Anxiété liée au travail' },
      followUp: {
        since: '2025-03-01',
        rhythm: 'biweekly',
        modality: 'in_person',
        durationMin: 50,
        prescriber: 'Dr Lenoir',
      },
      flags: [{ kind: 'watch', reason: 'Montée de l’anxiété' }, { kind: 'shared_care' }],
      tags: ['travail', 'sommeil'],
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  return ((await response.json()) as { id: string }).id;
}

/** Fiche lue et méta complète (nombre de séances lu dans la projection). */
async function ready(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Modifier la fiche · Marie D.');
  await expect(page.locator('.page-header .meta')).toContainText('1 séance');
}

test('maquette 16 : méta, dates jj/mm/aaaa, Suivi en 3 colonnes, drapeaux, tags ; axe clair et sombre ; 375 px', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const account = await createAccount(request, 'ux-b8.fiche', 'psychologist');
  const id = await createMarie(request);
  await signIn(page, account);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/fr/patients/${id}/fiche`);
  await ready(page);

  // Méta sous le titre : date de création, séances (séance d'accueil créée par l'API).
  await expect(page.locator('.page-header .meta')).toHaveText(/^Créée le .+ · 1 séance$/);

  // Champs date localisés : « 28/07/2003 » et « 03/2025 », en JetBrains Mono.
  const birthDate = page.getByLabel('Date de naissance');
  await expect(birthDate).toHaveValue('28/07/2003');
  await expect(page.getByLabel('Suivi·e depuis')).toHaveValue('03/2025');
  await expect(birthDate).toHaveCSS('font-family', /JetBrains Mono/);
  await expect(page.locator('input[type="date"], input[type="month"]')).toHaveCount(0);

  // Précisions des libellés (maquette) : « (facultatif) », « · sert à l'âge et aux phases de vie ».
  await expect(page.locator('#field-firstName-aside')).toHaveText('(facultatif)');
  await expect(birthDate).toHaveAccessibleDescription(/sert à l'âge et aux phases de vie/);

  // Suivi en 3 colonnes : Suivi·e depuis, Rythme, Modalité sur la première ligne.
  const tops = await Promise.all(
    ['#field-followUp-since', '#field-followUp-rhythm', '#field-followUp-modality'].map(
      async (selector) => (await page.locator(selector).boundingBox())!.y,
    ),
  );
  expect(new Set(tops.map(Math.round)).size).toBe(1);
  const duration = await page.locator('#field-followUp-durationMin').boundingBox();
  expect(duration!.y).toBeGreaterThan(tops[0] + 20);

  // Drapeaux : case à droite du libellé, carte cochée « à surveiller » avec sa date de pose.
  const watch = page.locator('.flag-card.watch');
  const box = (await watch.boundingBox())!;
  const check = (await watch.locator('input').boundingBox())!;
  const name = (await watch.locator('.flag-name').boundingBox())!;
  expect(check.x).toBeGreaterThan(name.x + name.width);
  expect(check.x + check.width).toBeGreaterThan(box.x + box.width - 40);
  await expect(watch).toContainText(/Posé le \d+/);
  await expect(page.getByRole('checkbox', { name: 'À surveiller', exact: true })).toBeChecked();
  await expect(page.getByLabel('Raison du drapeau « à surveiller »')).toHaveValue(
    'Montée de l’anxiété',
  );

  // Tags saisis dans la zone de puces : le champ est dans la même zone que les puces, pas de
  // bouton « Ajouter » séparé ; Entrée ajoute (à la fin), la croix retire. L'API rend les tags triés.
  const zone = page.locator('pm-tag-editor .zone');
  await expect(zone.locator('.chip')).toHaveText(['#sommeil', '#travail']);
  const tagInput = zone.getByRole('combobox', { name: 'Ajouter un tag' });
  await expect(tagInput).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ajouter', exact: true })).toHaveCount(0);
  await createTag(request, 'famille');
  await tagInput.fill('famille');
  await tagInput.press('Enter');
  await expect(zone.locator('.chip')).toHaveText(['#sommeil', '#travail', '#famille']);
  await expect(tagInput).toHaveValue('');
  await zone.getByRole('button', { name: 'Retirer le tag #famille' }).click();
  await expect(zone.locator('.chip')).toHaveCount(2);

  // Pied : Enregistrer avant Annuler (maquette), mention à droite.
  const save = (await page.getByRole('button', { name: /Enregistrer/ }).boundingBox())!;
  const cancel = (await page.getByRole('button', { name: 'Annuler' }).boundingBox())!;
  expect(save.x).toBeLessThan(cancel.x);

  // Colonne latérale : aperçu, « À la création d'un patient », Confidentialité avec les versions.
  await expect(page.locator('aside.side > * h2').first()).toHaveText("Aperçu de l'en-tête");
  await expect(page.getByRole('region', { name: "À la création d'un patient" })).toContainText(
    "séance d'accueil",
  );
  await expect(
    page
      .getByRole('region', { name: 'Confidentialité' })
      .getByRole('button', { name: '1 version' }),
  ).toBeVisible();

  await shoot(page, 'ux-b8-16-fiche-1440');
  await expectNoAxeViolations(page);

  // Thème sombre : mêmes contrôles axe.
  await setPreferences(request, { theme: 'dark' });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await ready(page);
  await shoot(page, 'ux-b8-16-fiche-1440-sombre');
  await expectNoAxeViolations(page);
  await setPreferences(request, { theme: 'light' });

  // 375 px : aucune page ne défile horizontalement (modification et création).
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  await ready(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
  await shoot(page, 'ux-b8-16-fiche-375');
  await expectNoAxeViolations(page);
  await page.goto('/fr/patients/nouveau');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nouveau patient');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
  await expectNoAxeViolations(page);
});
