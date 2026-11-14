import {
  APIRequestContext,
  expect,
  Page,
  request as playwrightRequest,
  test,
} from '@playwright/test';

import { createAccount, signIn } from '../preferences/accounts';
import { TestAccount } from '../support/accounts';
import { expectNoAxeViolations } from '../support/axe';
import { API, FilterPatient, filterPatient, setGroupBy } from './filters-data';
import { createPatient, intakeOf, expectCount } from './timeline-data';

// Filtres et mode par séance de la timeline (M3-03, fiche 03, C2) contre l'API locale (jamais de
// mock) : filtrer « anxiété » (compteurs des facettes), « Brouillons seulement », filtres dans
// l'URL et au rechargement, bascule par séance avec M (préférence écrite), dernière séance dépliée,
// préférence relue sur un autre patient, « Lier » depuis le menu et la touche L. Depuis UX-S9
// (proposition 03), émotions, tags et « Brouillons seulement » sont dans le panneau du bouton
// « Filtres » (« Filtres · n » quand des filtres sont actifs) ; les émotions aussi dans la colonne
// de résumé.
// Toutes les entrées de Nora B. ont moins de 90 jours : la période par défaut les montre toutes.

let account: TestAccount;
let nora: FilterPatient;
let other: string;
let api: APIRequestContext;

test.describe.configure({ mode: 'serial', timeout: 90_000 });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  api = await playwrightRequest.newContext();
  account = await createAccount(api, 'm3-03.filtres', 'psychologist');
  nora = await filterPatient(api);
  other = await createPatient(api, 'Paul R.');
  await intakeOf(api, other);
});

test.afterAll(async () => {
  await api?.dispose();
});

function timeline(page: Page) {
  const toolbar = page.getByRole('toolbar', { name: 'Affichage de la timeline' });
  return {
    toolbar,
    cards: page.locator('pm-timeline-card article'),
    types: toolbar.getByRole('group', { name: 'Types' }),
    side: page.locator('.tl-side'),
    filtersMenu: toolbar.getByRole('button', { name: /^Filtres/ }),
    menu: page.getByRole('dialog', { name: 'Filtres de la timeline' }),
    mode: toolbar.getByRole('group', { name: "Mode d'affichage (M)" }),
    sessions: page.locator('pm-timeline-sessions'),
    toggles: page.locator('pm-timeline-sessions button.head'),
    heads: page.locator('pm-timeline-sessions .session-head'),
  };
}

/** Plus aucun élément n'a le focus : les raccourcis d'une touche s'appliquent. */
async function blur(page: Page): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

/** Bouton de puce par le début de son nom (« Anxiété 3 »). */
function chip(group: ReturnType<typeof timeline>['types'], name: string) {
  return group.getByRole('button', { name: new RegExp(`^${name}(\\s|,|$)`) });
}

/** Choix du panneau « Filtres » (émotion, tag, brouillons), par le début de son nom. */
function menuChoice(t: ReturnType<typeof timeline>, name: string) {
  return t.menu.getByRole('button', { name: new RegExp(`^${name}(\\s|$)`) });
}

/** Ouvre le panneau « Filtres », y bascule un choix, puis le referme (Échap). */
async function pick(page: Page, t: ReturnType<typeof timeline>, name: string): Promise<void> {
  await t.filtersMenu.click();
  await menuChoice(t, name).click();
  await page.keyboard.press('Escape');
  await expect(t.menu).toBeHidden();
}

test('filtrer « anxiété » : seules ses entrées, compteurs des facettes ; brouillons ; URL et rechargement', async ({
  page,
}) => {
  await setGroupBy(api, 'chronological');
  await signIn(page, account);
  await page.goto(`/fr/patients/${nora.id}/timeline`);
  const t = timeline(page);
  await expectCount(page, 9, 1);
  await expect(chip(t.types, 'Ressentis')).toHaveText(/Ressentis\s*4$/);
  await expect(chip(t.types, 'Tout')).toHaveAttribute('aria-pressed', 'true');
  // Émotions : dans le panneau « Filtres », avec le compteur des facettes.
  await expect(t.filtersMenu).toHaveText(/^Filtres\s*· émotion, tag, brouillons$/);
  await t.filtersMenu.click();
  await expect(menuChoice(t, 'Anxiété')).toHaveText(/Anxiété\s*3$/);
  await expect(menuChoice(t, 'Anxiété')).toHaveAttribute('aria-pressed', 'false');
  await expectNoAxeViolations(page);
  await page.keyboard.press('Escape');
  await expect(t.menu).toBeHidden();
  await expectNoAxeViolations(page);

  // Anxiété : la requête porte emotions=anxiety, les compteurs viennent des facettes de la réponse.
  const filtered = page.waitForResponse(
    (r) =>
      r.url().includes(`/api/patients/${nora.id}/timeline?`) &&
      r.url().includes('emotions=anxiety'),
  );
  await pick(page, t, 'Anxiété');
  const response = await filtered;
  const body = (await response.json()) as {
    items: { type: string; emotion: { code: string } | null }[];
    facets: { types: Record<string, number>; emotions: Record<string, number> };
  };
  expect(body.items).toHaveLength(3);
  expect(body.facets.emotions).toEqual({ anxiety: 3 });
  await expect(page).toHaveURL(/[?&]emotion=anxiety(&|$)/);
  await expectCount(page, 3, 1);
  await expect(t.cards).toHaveCount(3);
  for (const card of await t.cards.all()) {
    await expect(card.locator('.title')).toHaveText('Anxiété');
  }
  // Colonne de résumé : l'émotion choisie est pressée, avec le compteur des facettes.
  await expect(chip(t.side, 'Anxiété')).toHaveAttribute('aria-pressed', 'true');
  await expect(chip(t.side, 'Anxiété')).toHaveText(/Anxiété\s*3$/);
  await expect(t.filtersMenu).toHaveText(/^Filtres\s*·\s*1$/);
  await expect(chip(t.types, 'Ressentis')).toHaveText(/Ressentis\s*3$/);
  await expect(chip(t.types, 'Notes')).toHaveText(/Notes\s*0$/);
  await t.filtersMenu.click();
  await expect(menuChoice(t, 'Anxiété')).toHaveAttribute('aria-pressed', 'true');
  await expect(menuChoice(t, 'Joie')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(t.menu).toBeHidden();
  await expectNoAxeViolations(page);

  // Brouillons seulement : l'anxiété en brouillon, seule.
  await pick(page, t, 'Brouillons seulement');
  await expect(page).toHaveURL(/[?&]drafts=1(&|$)/);
  await expectCount(page, 1, 1);
  await expect(t.cards).toHaveCount(1);
  await expect(t.cards.first()).toContainText('brouillon');

  // Rechargement : mêmes filtres, mêmes entrées.
  const url = page.url();
  await page.reload();
  await expect(page).toHaveURL(url);
  await expectCount(page, 1, 1);
  await expect(chip(t.side, 'Anxiété')).toHaveAttribute('aria-pressed', 'true');
  await expect(t.filtersMenu).toHaveText(/^Filtres\s*·\s*2$/);
  await t.filtersMenu.click();
  await expect(menuChoice(t, 'Brouillons seulement')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(t.menu).toBeHidden();
  await expectNoAxeViolations(page);

  // Changer d'onglet puis revenir (touche 1 puis 2) : les filtres sont dans la mémoire de l'onglet.
  await blur(page);
  await page.keyboard.press('1');
  await expect(page).toHaveURL(new RegExp(`/patients/${nora.id}$`));
  await page.keyboard.press('2');
  await expect(page).toHaveURL(/[?&]emotion=anxiety/);
  await expectCount(page, 1, 1);

  // Barre d'outils au clavier : un arrêt de tabulation, ← → entre les puces.
  await chip(t.types, 'Tout').focus();
  await page.keyboard.press('ArrowRight');
  await expect(chip(t.types, 'Ressentis')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(chip(t.types, 'Tout')).toBeFocused();
});

test('basculer par séance avec M (préférence écrite) ; la dernière séance dépliée ; déplier une autre', async ({
  page,
}) => {
  await setGroupBy(api, 'chronological');
  await signIn(page, account);
  await page.goto(`/fr/patients/${nora.id}/timeline`);
  const t = timeline(page);
  await expectCount(page, 9, 1);

  const written = page.waitForResponse(
    (r) => r.url().endsWith('/api/me/preferences') && r.request().method() === 'PATCH',
  );
  await blur(page);
  await page.keyboard.press('m');
  const patch = await written;
  expect(patch.status()).toBe(200);
  expect(patch.request().postDataJSON()).toEqual({ 'timeline.groupBy': 'session' });
  expect(((await patch.json()) as Record<string, string>)['timeline.groupBy']).toBe('session');
  await expect(t.mode.getByRole('button', { name: 'Par séance' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // La préférence n'est pas dans l'URL : elle est relue à chaque ouverture.
  await expect(page).toHaveURL(new RegExp(`/patients/${nora.id}/timeline$`));
  await expectCount(page, 9);

  // La plus récente est dépliée (même grammaire que le flux) : modalité, durée, première ligne du
  // compte rendu sous le séparateur, ses quatre entrées.
  await expect(t.toggles).toHaveCount(3);
  const latest = t.toggles.nth(0);
  await expect(latest).toHaveAttribute('aria-expanded', 'true');
  await expect(t.heads.nth(0)).toContainText('4 entrées');
  await expect(t.heads.nth(0)).toContainText('Séance · cabinet · 45 min');
  await expect(t.sessions.locator('pm-timeline-session-divider .summary').first()).toHaveText(
    'Travail sur l’anxiété du matin et les réveils nocturnes.',
  );
  const panel = page.getByRole('region', { name: 'Entrées de la séance' });
  await expect(panel).toHaveCount(1);
  await expect(panel.locator('pm-timeline-card')).toHaveCount(4);
  await expect(panel.locator('pm-timeline-card', { hasText: 'Réveils nocturnes' })).toBeVisible();
  // Les autres repliées avec leur compte : la séance d'il y a 20 jours, puis l'accueil (40 jours,
  // sans entrée).
  await expect(t.toggles.nth(1)).toHaveAttribute('aria-expanded', 'false');
  await expect(t.heads.nth(1)).toContainText('2 entrées');
  await expect(t.toggles.nth(2)).toHaveAttribute('aria-expanded', 'false');
  await expect(t.heads.nth(2)).toContainText('aucune entrée');
  await expectNoAxeViolations(page);

  // Déplier la précédente : son détail se lit (durée, entrées).
  await t.toggles.nth(1).click();
  await expect(t.toggles.nth(1)).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('region', { name: 'Entrées de la séance' })).toHaveCount(2);
  const previous = page.locator(`#${await t.toggles.nth(1).getAttribute('aria-controls')}`);
  await expect(t.heads.nth(1)).toContainText('50 min');
  await expect(
    previous.locator('pm-timeline-card', { hasText: 'Dispute au travail' }),
  ).toBeVisible();
  // L'accueil, déplié, se nomme comme tel une fois son détail lu.
  await t.toggles.nth(2).click();
  await expect(t.toggles.nth(2)).toContainText("Séance d'accueil");

  // Le filtre s'applique aussi par séance : anxiété → les deux séances où elle a été notée.
  await pick(page, t, 'Anxiété');
  await expectCount(page, 3);
  await expect(t.heads.nth(0)).toContainText('2 entrées');
  await expect(t.heads.nth(1)).toContainText('1 entrée');
  await expectNoAxeViolations(page);
});

test('la préférence est relue sur un autre patient ; ?mode= l’emporte sans l’écrire', async ({
  page,
}) => {
  await setGroupBy(api, 'session');
  await signIn(page, account);
  const t = timeline(page);

  // Autre patient : par séance (préférence du compte).
  await page.goto(`/fr/patients/${other}/timeline`);
  await expect(t.sessions).toBeVisible();
  await expect(t.mode.getByRole('button', { name: 'Par séance' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // Le bouton « Chronologique » écrit la préférence...
  const written = page.waitForResponse(
    (r) => r.url().endsWith('/api/me/preferences') && r.request().method() === 'PATCH',
  );
  await t.mode.getByRole('button', { name: 'Chronologique' }).click();
  expect((await written).request().postDataJSON()).toEqual({
    'timeline.groupBy': 'chronological',
  });
  await expect(page.locator('cdk-virtual-scroll-viewport')).toBeVisible();
  await expectNoAxeViolations(page);

  // ... relue en ouvrant Nora B. par l'application, sans rechargement : logo → liste → Nora B. →
  // onglet Timeline. Le marqueur posé sur window prouve qu'aucune page n'a été rechargée.
  await page.evaluate(() => ((window as unknown as Record<string, boolean>)['m303'] = true));
  const noReload = () =>
    page.evaluate(() => (window as unknown as Record<string, boolean>)['m303'] === true);
  const openTimeline = async (name: string, id: string) => {
    await page.getByRole('link', { name: 'PsyMate' }).click();
    await expect(page).toHaveURL(/\/fr\/patients$/);
    await page.getByRole('link', { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/patients/${id}$`));
    await page
      .getByRole('navigation', { name: 'Dossier' })
      .getByRole('link', { name: /Timeline/ })
      .click();
    await expect(page).toHaveURL(new RegExp(`/patients/${id}/timeline$`));
  };
  await openTimeline('Nora B.', nora.id);
  await expect(page.locator('cdk-virtual-scroll-viewport')).toBeVisible();
  await expect(t.sessions).toHaveCount(0);
  await expect(t.mode.getByRole('button', { name: 'Chronologique' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(await noReload()).toBe(true);

  // Dans l'autre sens : M sur Nora B. (par séance), puis Paul R. par l'application.
  await blur(page);
  const back = page.waitForResponse(
    (r) => r.url().endsWith('/api/me/preferences') && r.request().method() === 'PATCH',
  );
  await page.keyboard.press('m');
  expect((await back).request().postDataJSON()).toEqual({ 'timeline.groupBy': 'session' });
  await openTimeline('Paul R.', other);
  await expect(t.sessions).toBeVisible();
  await expect(t.mode.getByRole('button', { name: 'Par séance' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(await noReload()).toBe(true);
  await setGroupBy(api, 'chronological');

  // ?mode=session : par séance pour cette visite, la préférence reste « chronologique ».
  let patched = false;
  page.on('request', (r) => {
    if (r.url().endsWith('/api/me/preferences') && r.method() === 'PATCH') patched = true;
  });
  await page.goto(`/fr/patients/${nora.id}/timeline?mode=session`);
  await expect(t.sessions).toBeVisible();
  await expect(t.toggles.first()).toHaveAttribute('aria-expanded', 'true');
  const prefs = await api.get(`${API}/api/me/preferences`);
  expect(((await prefs.json()) as Record<string, string>)['timeline.groupBy']).toBe(
    'chronological',
  );
  expect(patched).toBe(false);
  await expectNoAxeViolations(page);
});

test('« Lier » du menu et touche L : l’éditeur de lien s’ouvre sur l’entrée ; la timeline reste', async ({
  page,
}) => {
  await setGroupBy(api, 'chronological');
  await signIn(page, account);
  await page.goto(`/fr/patients/${nora.id}/timeline`);
  const card = page.locator('pm-timeline-card article', { hasText: 'Dispute au travail' });
  await expect(card).toBeVisible();
  const dialog = page.locator('[role="dialog"]:has(pm-link-editor-panel)');

  await card.click({ button: 'right' });
  const item = page.getByRole('menuitem', { name: /^Lier/ });
  await expect(item).not.toHaveAttribute('aria-disabled', 'true');
  await expect(item).not.toContainText('bientôt');
  await item.click();
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/[?&]link=/);
  await expect(dialog).toContainText('Dispute au travail');
  await expectNoAxeViolations(page);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(card).toBeVisible();
  await expect(card).toHaveClass(/\bselected\b/);

  // L sur la carte qui a le focus.
  await card.focus();
  await page.keyboard.press('l');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
