import { expect, Page, test } from '@playwright/test';

import { createAccount, signIn } from '../preferences/accounts';
import { expectNoAxeViolations } from '../support/axe';
import {
  createEmotion,
  createFeeling,
  createNote,
  createPatientWithSession,
  createTag,
  readEntry,
} from './vocabulary-api';

// C2 M1-09, fiche 17 : contre l'API locale (seed small, Mailpit), jamais de mock du backend. Chaque
// test crée son compte jetable et ses données par l'API (fusions irréversibles pour les tags).

const TAGS = '/fr/mon-compte/tags';
const EMOTIONS = '/fr/mon-compte/emotions';
/** Réétiquette asynchrone côté API (G Q42, outbox) : délai borné. */
const RELABEL_TIMEOUT = 20_000;

function summary(entry: Awaited<ReturnType<typeof readEntry>>) {
  return {
    emotionCode: entry.feeling?.emotionCode,
    intensity: entry.feeling?.intensity,
    body: entry.body,
  };
}

async function openTags(page: Page): Promise<void> {
  await page.goto(TAGS);
  await expect(page.getByRole('heading', { level: 1, name: 'Tags' })).toBeVisible();
}

async function openEmotions(page: Page): Promise<void> {
  await page.goto(EMOTIONS);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Émotions personnalisées' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /Vocabulaire global · 29 émotions/ }),
  ).toBeVisible();
}

test('fusionner deux tags : les entrées qui portaient l’ancien tag portent le nouveau', async ({
  page,
  request,
}) => {
  const account = await createAccount(request, 'm1-09.tags', 'psychologist');
  await createTag(request, 'stress pro');
  await createTag(request, 'travail');
  const patientId = await createPatientWithSession(request, 'E2E · Tags');
  const onlyOld = await createNote(request, patientId, 'Réunion tendue', ['stress pro']);
  const both = await createNote(request, patientId, 'Charge de travail', ['stress pro', 'travail']);
  expect((await readEntry(request, onlyOld)).tags).toEqual(['stress pro']);

  await signIn(page, account);
  await openTags(page);
  const table = page.getByRole('table', { name: 'Mes tags' });
  await expect(table.getByRole('row')).toHaveCount(3);
  await expectNoAxeViolations(page);

  await table.getByRole('button', { name: 'Fusionner… stress pro' }).click();
  const confirm = page.getByRole('group', { name: 'Fusionner « stress pro » dans un autre tag' });
  await expect(confirm.getByLabel('Fusionner dans')).toBeFocused();
  await confirm.getByLabel('Fusionner dans').selectOption({ label: 'travail' });
  await expect(confirm).toContainText('Fusionner « stress pro » dans « travail » ?');
  await expect(confirm).toContainText('Réétiquette');
  await expect(confirm).toContainText("Cette fusion ne s'annule pas.");
  await expectNoAxeViolations(page);

  const merge = page.waitForResponse(
    (r) => r.url().includes('/api/tags/') && r.url().endsWith('/merge'),
  );
  await confirm.getByRole('button', { name: 'Fusionner', exact: true }).click();
  expect((await merge).status()).toBe(200);
  await expect(page.getByText('« stress pro » fusionné dans « travail »')).toBeVisible();
  await expect(table.getByRole('row')).toHaveCount(2);
  await expect(table.getByRole('button', { name: 'Renommer stress pro' })).toHaveCount(0);

  // Relecture des entrées par l'API : la réétiquette arrive en arrière-plan (délai borné).
  await expect
    .poll(async () => (await readEntry(request, onlyOld)).tags, { timeout: RELABEL_TIMEOUT })
    .toEqual(['travail']);
  await expect
    .poll(async () => (await readEntry(request, both)).tags, { timeout: RELABEL_TIMEOUT })
    .toEqual(['travail']);
  await expectNoAxeViolations(page);
});

test('créer le tag « anxiété » : 422 affiché avec « utiliser l’émotion Anxiété ? »', async ({
  page,
  request,
}) => {
  const account = await createAccount(request, 'm1-09.tag-emotion', 'psychologist');
  await signIn(page, account);
  await openTags(page);
  await expect(page.getByText('Aucun tag', { exact: true })).toBeVisible();

  await page.getByLabel('Libellé du tag').fill('anxiété');
  const create = page.waitForResponse(
    (r) => r.url().endsWith('/api/tags') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Créer le tag' }).click();
  expect((await create).status()).toBe(422);
  await expect(page.getByRole('alert')).toContainText("utiliser l'émotion Anxiété ?");
  await expect(page.getByLabel('Libellé du tag')).toHaveAttribute('aria-invalid', 'true');
  await expectNoAxeViolations(page);

  // Un vrai tag passe, la liste le montre.
  await page.getByLabel('Libellé du tag').fill('#sommeil');
  await page.getByRole('button', { name: 'Créer le tag' }).click();
  await expect(page.getByRole('table', { name: 'Mes tags' })).toContainText('sommeil');
});

test('fusionner deux émotions personnalisées puis annuler : la première revient', async ({
  page,
  request,
}) => {
  const account = await createAccount(request, 'm1-09.emotions', 'psychologist');
  const lassitude = await createEmotion(request, 'Lassitude', 'sadness');
  const patientId = await createPatientWithSession(request, 'E2E · Émotions');
  const feeling = await createFeeling(request, patientId, lassitude.code);

  await signIn(page, account);
  await openEmotions(page);
  await expect(page.getByRole('button', { name: /Proposer au global/ })).toHaveCount(0);

  // Ajout par l'écran : avertissement de proximité (aide, pas un blocage), puis 201.
  const label = page.getByRole('textbox', { name: 'Libellé', exact: true });
  await label.fill('Tristesses');
  await expect(page.getByText('Proche de « Tristesse » (vocabulaire global)')).toBeVisible();
  await label.fill('Morosité');
  await page.getByRole('radio', { name: 'Tristesse' }).check();
  const created = page.waitForResponse(
    (r) => r.url().endsWith('/api/me/emotions') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Ajouter à mon vocabulaire' }).click();
  const createdResponse = await created;
  expect(createdResponse.status()).toBe(201);
  const morosite = ((await createdResponse.json()) as { code: string }).code;
  const table = page.getByRole('table', { name: 'Mes émotions personnalisées' });
  await expect(table.getByRole('row')).toHaveCount(3);
  await expect(page.getByRole('heading', { name: 'Mes émotions · 2' })).toBeVisible();
  await expectNoAxeViolations(page);

  // Fusion de Lassitude dans Morosité (même famille) : aperçu, confirmation, toast.
  await table.getByRole('button', { name: 'Fusionner… Lassitude' }).click();
  const confirm = page.getByRole('group', {
    name: 'Fusionner « Lassitude » dans une autre émotion',
  });
  await expect(confirm.getByLabel('Fusionner dans')).toBeFocused();
  await confirm.getByLabel('Fusionner dans').selectOption({ label: 'Morosité · Tristesse' });
  await expect(confirm).toContainText('Fusionner « Lassitude » dans « Morosité » ?');
  await expect(confirm).toContainText('réversible pendant 30 jours');
  await expectNoAxeViolations(page);
  const merge = page.waitForResponse((r) => r.url().endsWith('/merge'));
  await confirm.getByRole('button', { name: 'Fusionner', exact: true }).click();
  expect((await merge).status()).toBe(200);
  await expect(
    page.getByText('« Lassitude » fusionnée dans « Morosité » : 1 ressenti déplacé.'),
  ).toBeVisible();
  await expect(table.getByRole('row')).toHaveCount(2);
  // Le ressenti pointe vers Morosité ; intensité et texte inchangés (fiche 17).
  await expect
    .poll(async () => summary(await readEntry(request, feeling)), { timeout: RELABEL_TIMEOUT })
    .toEqual({ emotionCode: morosite, intensity: 6, body: 'Fatigue du soir' });

  // Journal des fusions : annulation (le journal survit au rechargement de la page).
  await page.reload();
  const journal = page.getByRole('region', { name: 'Journal des fusions' });
  await expect(journal).toContainText('Lassitude');
  await expect(journal).toContainText('1 ressenti');
  await expect(journal).toContainText('annulable jusqu');
  await expectNoAxeViolations(page);
  const undo = page.waitForResponse((r) => r.url().endsWith('/undo'));
  await journal.getByRole('button', { name: 'Annuler la fusion Lassitude' }).click();
  expect((await undo).status()).toBe(200);
  await expect(page.getByText('Fusion annulée : « Lassitude » est de retour')).toBeVisible();
  await expect(table.getByRole('button', { name: 'Fusionner… Lassitude' })).toBeVisible();
  await expect(journal).toContainText('annulée le');
  await expect(journal.getByRole('button', { name: /Annuler la fusion/ })).toHaveCount(0);
  await expect
    .poll(async () => summary(await readEntry(request, feeling)), { timeout: RELABEL_TIMEOUT })
    .toEqual({ emotionCode: lassitude.code, intensity: 6, body: 'Fatigue du soir' });
  await expectNoAxeViolations(page);
});

test('émotions : libellé déjà pris (sans accent) → 409 sous le champ', async ({
  page,
  request,
}) => {
  const account = await createAccount(request, 'm1-09.emotion-409', 'psychologist');
  await signIn(page, account);
  await openEmotions(page);
  await expect(page.getByText('Aucune émotion personnalisée')).toBeVisible();
  await page.getByRole('textbox', { name: 'Libellé', exact: true }).fill('anxiete');
  await page.getByRole('radio', { name: 'Peur' }).check();
  const created = page.waitForResponse((r) => r.url().endsWith('/api/me/emotions'));
  await page.getByRole('button', { name: 'Ajouter à mon vocabulaire' }).click();
  expect((await created).status()).toBe(409);
  await expect(page.getByText('Ce libellé existe déjà dans le vocabulaire global')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Libellé', exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expectNoAxeViolations(page);
});

test('au clavier : renommer un tag, ouvrir la fusion puis Échap rend le focus', async ({
  page,
  request,
}) => {
  const account = await createAccount(request, 'm1-09.clavier', 'psychologist');
  await createTag(request, 'boulot');
  await createTag(request, 'travail');
  await signIn(page, account);
  await openTags(page);
  const table = page.getByRole('table', { name: 'Mes tags' });

  // Renommer : Entrée ouvre le champ (focus dedans), saisie, Entrée enregistre.
  const renameButton = table.getByRole('button', { name: 'Renommer boulot' });
  await renameButton.focus();
  await page.keyboard.press('Enter');
  const input = table.getByRole('textbox', { name: 'Nouveau libellé de « boulot »' });
  await expect(input).toBeFocused();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('Boulot');
  const patch = page.waitForResponse((r) => r.request().method() === 'PATCH');
  await page.keyboard.press('Enter');
  expect((await patch).status()).toBe(200);
  await expect(table.getByRole('button', { name: 'Renommer Boulot' })).toBeFocused();

  // Fusionner… : la confirmation prend le focus (choix de la cible) ; Échap la ferme et le rend.
  const mergeButton = table.getByRole('button', { name: 'Fusionner… Boulot' });
  await mergeButton.focus();
  await page.keyboard.press('Enter');
  const confirm = page.getByRole('group', { name: 'Fusionner « Boulot » dans un autre tag' });
  await expect(confirm.getByLabel('Fusionner dans')).toBeFocused();
  await expect(mergeButton).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(confirm).toHaveCount(0);
  await expect(mergeButton).toBeFocused();
  await expectNoAxeViolations(page);
});
