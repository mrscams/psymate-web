import { APIRequestContext, expect, Page, test } from '@playwright/test';

import { setPreferences } from '../flux-6-vue-ensemble/overview-data';
import { createAccount, signIn } from '../preferences/accounts';
import { expectNoAxeViolations } from '../support/axe';
import { shoot } from '../support/captures';

// UX-S10 : fiche patient fidèle à la proposition 16 (docs/design/propositions-2026-11) : page en
// pleine largeur, rail collant à gauche (aperçu de l'en-tête, sections, Enregistrer toujours
// visible), formulaire continu, « (facultatif) » disparu, raison du drapeau dans sa carte, export et
// historique dans l'en-tête ; sur mobile, puces des sections en haut et barre d'enregistrement en
// bas. Contre l'API locale (seed small), jamais de mock du backend : compte jetable, patient créé
// par l'API.

const API = 'http://localhost:8080';

async function createTag(api: APIRequestContext, label: string): Promise<void> {
  const response = await api.post(`${API}/api/tags`, { data: { label } });
  expect(response.status(), await response.text()).toBe(201);
}

async function createNour(api: APIRequestContext): Promise<string> {
  await createTag(api, 'sommeil');
  await createTag(api, 'travail');
  const response = await api.post(`${API}/api/patients`, {
    data: {
      displayName: 'Nour K.',
      firstName: 'Nour',
      birthDate: '1991-04-12',
      pronoun: 'elle',
      context: {
        situation: 'En couple, un enfant de 4 ans',
        activity: 'Infirmière de nuit',
        referredBy: 'Médecin traitant',
        initialReason: 'Épuisement, troubles du sommeil',
      },
      followUp: { since: '2026-09-01', rhythm: 'biweekly', modality: 'in_person', durationMin: 50 },
      flags: [{ kind: 'watch', reason: 'Sommeil très dégradé depuis octobre' }],
      tags: ['sommeil', 'travail'],
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  return ((await response.json()) as { id: string }).id;
}

/**
 * Fiche lue et méta complète. La séance d'accueil est créée par un écouteur asynchrone de l'API
 * (PatientCreated) et la projection vue d'ensemble la compte ensuite : juste après la création,
 * la méta peut encore dire « aucune séance » ; on relit la fiche jusqu'à « 1 séance ».
 */
async function ready(page: Page, name = 'Nour K.'): Promise<void> {
  await expect(async () => {
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Fiche · ${name}`);
    await expect(page.locator('.page-head .sub')).toContainText('1 séance', { timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
}

const rail = (page: Page) => page.locator('pm-record-rail');
const save = (page: Page) => page.getByRole('button', { name: /Enregistrer/ });
const sections = (page: Page) => page.getByRole('navigation', { name: 'Sections de la fiche' });

test('proposition 16 à 1440 et 1280 px : rail collant, Enregistrer visible au défilement, sections, aucun « facultatif » ; axe clair et sombre', async ({
  page,
  request,
}) => {
  test.setTimeout(150_000);
  const account = await createAccount(request, 'ux-s10.fiche', 'psychologist');
  const id = await createNour(request);
  await signIn(page, account);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/fr/patients/${id}/fiche`);
  await ready(page);

  // En-tête : titre, méta, « Exporter le dossier ▾ » et « Historique des versions » à droite.
  await expect(page.locator('.page-head .sub')).toHaveText(/^Créée le .+ · 1 séance$/);
  const head = page.locator('.page-head');
  await expect(head.getByRole('button', { name: /Exporter le dossier/ })).toBeVisible();
  await expect(head.getByRole('button', { name: 'Historique des versions' })).toBeVisible();

  // Rail à gauche de 240 px, formulaire à droite ; aperçu de l'en-tête en haut du rail.
  const railBox = (await sections(page).boundingBox())!;
  const panelBox = (await page.locator('.panel').boundingBox())!;
  expect(Math.round(railBox.width)).toBe(240);
  expect(railBox.x + railBox.width).toBeLessThan(panelBox.x);
  const preview = page.getByRole('region', { name: "Aperçu de l'en-tête" });
  await expect(preview).toContainText('Nour K.');
  await expect(preview).toContainText('35 ans · suivi·e depuis septembre 2026');
  await expect(preview.getByRole('listitem')).toHaveText(/À surveiller/);

  // Liens des sections, avec leur décompte ; la première est courante.
  const links = sections(page).getByRole('link');
  await expect(links).toHaveText([
    /^Identité 4 champs/,
    /^Contexte 4/,
    /^Suivi 4/,
    /^Drapeaux 1 posé/,
    /^Tags 2/,
    /^Archivage/,
  ]);
  await expect(links.first()).toHaveAttribute('aria-current', 'true');
  await expect(save(page)).toContainText('Ctrl+↵');

  // Sections continues, dans l'ordre ; « (facultatif) » a disparu, seul le nom affiché est marqué.
  await expect(page.locator('form fieldset > legend h2')).toHaveText([
    'Identité',
    'Contexte',
    'Suivi',
    'Drapeaux',
    'Tags du dossier',
  ]);
  await expect(page.getByText('(facultatif)')).toHaveCount(0);
  await expect(page.locator('.required')).toHaveCount(1);
  await expect(page.getByText('Le reste est facultatif.')).toHaveCount(1);

  // Champs : dates en jj/mm/aaaa (JetBrains Mono), aide de l'âge, Suivi en trois colonnes.
  const birthDate = page.getByLabel('Date de naissance');
  await expect(birthDate).toHaveValue('12/04/1991');
  await expect(birthDate).toHaveCSS('font-family', /JetBrains Mono/);
  await expect(birthDate).toHaveAccessibleDescription(/35 ans · l'âge et les phases de vie/);
  const tops = await Promise.all(
    ['#field-followUp-since', '#field-followUp-rhythm', '#field-followUp-modality'].map(
      async (selector) => (await page.locator(selector).boundingBox())!.y,
    ),
  );
  expect(new Set(tops.map(Math.round)).size).toBe(1);
  await expect(page.getByLabel('Téléphone')).toHaveAccessibleDescription(/jamais synchronisées/);

  // Drapeaux : la raison de « à surveiller » est dans sa carte cochée.
  const watch = page.locator('.flagcard.watch');
  await expect(watch).toHaveClass(/\bon\b/);
  await expect(watch).toContainText(/Posé le \d+/);
  await expect(watch.getByLabel('Raison du drapeau « à surveiller »')).toHaveValue(
    'Sommeil très dégradé depuis octobre',
  );
  await shoot(page, 'ux-s10-16-fiche-1440');
  await expectNoAxeViolations(page);

  // Défilement jusqu'en bas : le rail reste collé, Enregistrer visible ; Archivage courant.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(save(page)).toBeInViewport();
  await expect(sections(page)).toBeInViewport();
  await expect(links.last()).toHaveAttribute('aria-current', 'true');
  expect((await rail(page).boundingBox())!.y).toBeLessThan(40);
  await shoot(page, 'ux-s10-16-fiche-1440-bas', false);

  // Lien « Drapeaux », depuis le haut : la page défile jusqu'à la section, le lien reste courant
  // (le défilement qu'il provoque ne le contredit pas), focus sur le titre de la section.
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(links.first()).toHaveAttribute('aria-current', 'true');
  await links.nth(3).click();
  await expect(page.locator('#section-drapeaux-title')).toBeFocused();
  await expect(page.locator('#section-drapeaux-title')).toBeInViewport();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
  await page.waitForTimeout(400);
  await expect(links.nth(3)).toHaveAttribute('aria-current', 'true');
  await expect(save(page)).toBeInViewport();

  // Modifier un champ : « 1 champ modifié » sous Enregistrer, Annuler les modifications le remet.
  await page.getByLabel('Rythme habituel').selectOption({ label: 'Mensuel' });
  await expect(rail(page).locator('.note')).toHaveText(
    '1 champ modifié · chaque enregistrement crée une version horodatée.',
  );
  await rail(page).getByRole('button', { name: 'Annuler les modifications' }).click();
  await expect(page.getByLabel('Rythme habituel')).toHaveValue('biweekly');
  await expect(rail(page).locator('.note')).toHaveText(
    'Chaque enregistrement crée une version horodatée.',
  );

  // Historique des versions : panneau latéral (état vide, une seule version).
  await head.getByRole('button', { name: 'Historique des versions' }).click();
  const history = page.getByRole('dialog', { name: 'Historique des versions' });
  await expect(history).toContainText('Aucune modification depuis la création');
  await expectNoAxeViolations(page);
  await page.keyboard.press('Escape');
  await expect(history).toBeHidden();

  // 1280 px, la largeur de la maquette : même disposition, Enregistrer visible au défilement.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(rail(page)).toBeVisible();
  expect(Math.round((await sections(page).boundingBox())!.width)).toBe(240);
  await shoot(page, 'ux-s10-16-fiche-1280');
  await page.evaluate(() => window.scrollTo(0, 900));
  await expect(save(page)).toBeInViewport();
  await expectNoAxeViolations(page);

  // Thème sombre : mêmes contrôles axe.
  await setPreferences(request, { theme: 'dark' });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await ready(page);
  await shoot(page, 'ux-s10-16-fiche-1280-sombre');
  await expectNoAxeViolations(page);
  await setPreferences(request, { theme: 'light' });

  // Création : même mise en page, « Créer le dossier », aperçu vide qui se remplit.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/fr/patients/nouveau');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nouveau patient');
  await expect(page.getByRole('button', { name: /Créer le dossier/ })).toBeVisible();
  await expect(sections(page).getByRole('link')).toHaveCount(5);
  await page.getByRole('textbox', { name: /Nom affiché/ }).fill('Paul R.');
  await expect(page.getByRole('region', { name: "Aperçu de l'en-tête" })).toContainText('Paul R.');
  await expect(page.getByText('(facultatif)')).toHaveCount(0);
  await shoot(page, 'ux-s10-16-nouveau-1440');
  await expectNoAxeViolations(page);
});

test('proposition 16 mobile (390 px) : puces des sections en haut, barre Enregistrer / Annuler en bas, une colonne', async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const account = await createAccount(request, 'ux-s10.mobile', 'psychologist');
  const id = await createNour(request);
  await signIn(page, account);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/fr/patients/${id}/fiche`);
  await ready(page);

  // Aucune page ne défile horizontalement ; l'aperçu du rail est replié.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await expect(page.getByRole('region', { name: "Aperçu de l'en-tête" })).toBeHidden();

  // Puces des sections, collées en haut au défilement.
  const chips = sections(page);
  await expect(chips.getByRole('link').first()).toHaveText('Identité', { useInnerText: true });
  // Une colonne : Prénom sous Nom affiché.
  const name = (await page.getByRole('textbox', { name: /Nom affiché/ }).boundingBox())!;
  const first = (await page.getByLabel('Prénom').boundingBox())!;
  expect(first.y).toBeGreaterThan(name.y + name.height);
  expect(Math.round(first.x)).toBe(Math.round(name.x));
  await shoot(page, 'ux-s10-16-fiche-390');
  await expectNoAxeViolations(page);

  // Barre basse : Enregistrer puis Annuler, collée en bas de l'écran pendant le défilement.
  await page.evaluate(() => window.scrollTo(0, 700));
  const bar = rail(page).locator('.save');
  await expect(save(page)).toBeInViewport();
  const barBox = (await bar.boundingBox())!;
  expect(barBox.y + barBox.height).toBeGreaterThan(844 - 4);
  // D'un bord à l'autre de l'écran (maquette `.m-bottom`).
  expect(Math.round(barBox.x)).toBe(0);
  expect(Math.round(barBox.width)).toBe(390);
  const saveBox = (await save(page).boundingBox())!;
  const cancelBox = (await bar.getByRole('button', { name: 'Annuler' }).boundingBox())!;
  expect(saveBox.x).toBeLessThan(cancelBox.x);
  expect((await chips.boundingBox())!.y).toBeLessThanOrEqual(1);
  // Capture de l'écran seul : une capture pleine page figerait les barres collantes.
  await shoot(page, 'ux-s10-16-fiche-390-defile', false);
  await expectNoAxeViolations(page);

  // Création à 390 px.
  await page.goto('/fr/patients/nouveau');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nouveau patient');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await expect(page.getByRole('button', { name: /Créer le dossier/ })).toBeInViewport();
  await expectNoAxeViolations(page);
});

test('tag tapé sans Entrée : ajouté à l’enregistrement (modification et création), refusé → envoi bloqué', async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const account = await createAccount(request, 'ux-s10.brouillon', 'psychologist');
  const id = await createNour(request);
  await createTag(request, 'famille');
  await signIn(page, account);

  // Modification : « famille » tapé, puis Enregistrer → PUT /tags le contient, toast, puce.
  await page.goto(`/fr/patients/${id}/fiche`);
  await ready(page);
  const tagInput = page.getByRole('combobox', { name: 'Ajouter un tag' });
  await tagInput.fill('famille');
  const put = page.waitForResponse(
    (r) => r.url().endsWith(`/api/patients/${id}/tags`) && r.request().method() === 'PUT',
  );
  await save(page).click();
  const response = await put;
  expect(response.status()).toBe(200);
  expect(response.request().postDataJSON()).toEqual({ tags: ['sommeil', 'travail', 'famille'] });
  await expect(page.getByText('Fiche enregistrée')).toBeVisible();
  await expect(tagInput).toHaveValue('');
  await page.reload();
  await ready(page);
  await expect(page.locator('pm-tag-editor .chip')).toHaveText([
    '#famille',
    '#sommeil',
    '#travail',
  ]);

  // Création : nom et brouillon de tag, Ctrl+Entrée → le POST porte le tag.
  await page.goto('/fr/patients/nouveau');
  await page.getByRole('textbox', { name: /Nom affiché/ }).fill('Paul R.');
  await tagInput.fill('famille');
  const created = page.waitForResponse(
    (r) => r.url().endsWith('/api/patients') && r.request().method() === 'POST',
  );
  await tagInput.press('Control+Enter');
  const post = await created;
  expect(post.status()).toBe(201);
  expect(post.request().postDataJSON()).toMatchObject({
    displayName: 'Paul R.',
    tags: ['famille'],
  });

  // Brouillon refusé (émotion) : aucun POST du patient, message sous le champ, focus dessus.
  await page.goto('/fr/patients/nouveau');
  await page.getByRole('textbox', { name: /Nom affiché/ }).fill('Léa M.');
  let posts = 0;
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().endsWith('/api/patients')) posts += 1;
  });
  await tagInput.fill('anxiété');
  await page.getByRole('button', { name: /Créer le dossier/ }).click();
  await expect(page.locator('#field-tags-error')).toBeVisible();
  await expect(tagInput).toBeFocused();
  expect(posts).toBe(0);
  await expect(page).toHaveURL(/\/fr\/patients\/nouveau$/);
  await expectNoAxeViolations(page);
});
