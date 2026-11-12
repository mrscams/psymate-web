import { expect, Page, test } from '@playwright/test';

import { setPreferences } from '../flux-6-vue-ensemble/overview-data';
import { enableProbe, graphReady } from '../flux-6-graphe/graph-support';
import { createAccount, signIn } from '../preferences/accounts';
import { expectNoAxeViolations } from '../support/axe';
import { tabTo } from '../support/clavier';
import { themeFolder } from '../theme/theme-support';
import { shoot } from './a11y-support';

const API = 'http://localhost:8080';

// Zoom navigateur 200 % sans perte de fonction (M7-04, B7, C5 ; WCAG 1.4.4 et 1.4.10).
//
// Équivalent retenu : la fenêtre de référence (Desktop Chrome de playwright.config, 1280 × 720)
// vue à 200 %, soit une fenêtre CSS de 640 × 360 px et un devicePixelRatio de 2. C'est exactement
// ce que fait le zoom de Chrome : la largeur CSS est divisée par deux (les media queries, le
// passage des panneaux en pleine largeur et des onglets « Mon compte » en ligne se déclenchent),
// le texte et les cibles doublent en pixels physiques. Playwright ne pilote pas le zoom du
// navigateur (Ctrl + « + ») en mode sans tête ; la propriété CSS `zoom` sur <html> a été écartée :
// elle grossit le rendu sans réduire la largeur CSS, donc sans déclencher la mise en page étroite.
//
// Sur chaque écran principal : pas de défilement horizontal de la page (WCAG 1.4.10 : seul le
// contenu en deux dimensions, comme le canevas du graphe, peut défiler dans sa propre zone), le
// titre visible, et l'action principale menée au clavier jusqu'à l'API. Captures dans
// PSYMATE_E2E_CAPTURES (hors du dépôt), seulement si la variable est définie. Contre l'API locale,
// jamais de mock du backend.

test.use({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 2 });

/** Aucun défilement horizontal de la page (la largeur du document tient dans la fenêtre). */
async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'défilement horizontal de la page à 200 %').toBeLessThanOrEqual(0);
}

async function screen(page: Page, name: string): Promise<void> {
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });
  await expectNoHorizontalScroll(page);
  await shoot(page, `zoom200-${name}`);
}

test('praticien à 200 % : liste, création, vue d’ensemble, capture, timeline, éditeur, graphe, recherche, compte', async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  const account = await createAccount(request, 'm7-04.zoom', 'psychologist');
  const folder = await themeFolder(request);
  await setPreferences(request, { 'overview.view': 'complete' });
  await enableProbe(page);
  await signIn(page, account);
  const h1 = page.getByRole('heading', { level: 1 }).first();

  // Liste des patients : le nom, « Nouveau patient » ; axe à 200 %.
  await expect(page.getByRole('link', { name: 'Nina S.', exact: true })).toBeVisible();
  await screen(page, '01-liste-patients');
  await expectNoAxeViolations(page);

  // Création au clavier (N, nom, Ctrl+Entrée) : la vue d'ensemble du nouveau patient s'ouvre.
  await page.keyboard.press('n');
  await expect(h1).toHaveText('Nouveau patient');
  await screen(page, '16-nouveau-patient');
  await tabTo(page, page.getByRole('textbox', { name: /Nom affiché/ }));
  await page.keyboard.type('Zoé Z.');
  await page.keyboard.press('Control+Enter');
  await expect(h1).toHaveText('Zoé Z.');

  // Vue d'ensemble d'un dossier rempli : en-tête, onglets, blocs ; capture d'une note au clavier
  // (le bloc de saisie n'existe qu'en séance, UX-S1).
  const start = await request.post(`${API}/api/patients/${folder.patientId}/sessions/start`, {
    data: { modality: 'in_person' },
  });
  expect(start.status(), await start.text()).toBe(201);
  await page.goto(`/fr/patients/${folder.patientId}`);
  await expect(h1).toHaveText('Nina S.');
  await expect(page.getByRole('link', { name: /Timeline/ })).toBeVisible();
  await screen(page, '02-vue-ensemble');
  await expectNoAxeViolations(page);

  // Bascule « Vue : Simple · Complète » : entière (aucun bouton rogné par son groupe) et utilisable.
  const toggle = page.getByRole('group', { name: "Niveau de détail de la vue d'ensemble" });
  for (const name of ['Simple', 'Complète']) {
    const clipped = await toggle.getByRole('button', { name }).evaluate((button) => {
      const own = button.getBoundingClientRect();
      const group = button.parentElement!.getBoundingClientRect();
      return own.right > group.right + 0.5 || button.scrollWidth > button.clientWidth;
    });
    expect(clipped, `bouton « ${name} » rogné à 200 %`).toBe(false);
  }
  await tabTo(page, toggle.getByRole('button', { name: 'Simple' }), { max: 60 });
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 3, name: 'En bref' })).toBeVisible();
  await screen(page, '02b-vue-ensemble-simple');
  await page.keyboard.press('Tab');
  await expect(toggle.getByRole('button', { name: 'Complète' })).toBeFocused();
  await expect(toggle.getByRole('button', { name: 'Complète' })).toBeInViewport({ ratio: 1 });
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 3, name: 'Dernières séances' })).toBeVisible();
  const capture = page.getByRole('textbox', { name: 'Noter quelque chose' });
  await tabTo(page, capture, { max: 60 });
  await page.keyboard.type('Note prise à 200 %');
  const created = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      new URL(r.url()).pathname === `/api/patients/${folder.patientId}/entries`,
  );
  await page.keyboard.press('Enter');
  expect((await created).status()).toBe(201);
  await expect(capture).toHaveValue('');

  // Timeline : les cartes ; Entrée sur une carte ouvre l'éditeur, plein écran à cette largeur,
  // dont le bouton d'enregistrement reste atteignable au clavier.
  // Le focus est dans le bloc de saisie (où « 2 » s'écrit) : depuis UX-S2 le bloc est sous
  // l'en-tête, dans la colonne de contenu ; l'onglet, placé avant lui, est atteint par Maj+Tab.
  await tabTo(page, page.getByRole('link', { name: /Timeline/ }), { max: 40, backwards: true });
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/timeline/);
  // La séance passée du dossier : 8 entrées, 9 si la note saisie plus haut s'y rattache.
  const session = page.getByRole('button', { name: /^Séance du .* [89] entrées$/ });
  await tabTo(page, session, { max: 80 });
  await page.keyboard.press('Enter');
  const card = page.locator(`pm-timeline-card article[data-entry-id="${folder.feeling}"]`);
  await expect(card).toBeVisible();
  await screen(page, '03-timeline');
  await expectNoAxeViolations(page);
  await tabTo(page, card, { max: 80 });
  await page.keyboard.press('Enter');
  const editor = page.locator('[role="dialog"]:has(pm-entry-editor-panel)');
  await expect(editor).toBeVisible();
  await expect(editor.locator('pm-state [aria-busy="true"]')).toHaveCount(0);
  const box = await editor.boundingBox();
  expect(box!.width, 'le panneau tient dans la fenêtre').toBeLessThanOrEqual(640);
  await screen(page, '05-editeur-entree');
  await expectNoAxeViolations(page);
  await tabTo(page, editor.locator('.footer .primary'), { max: 80 });
  await expect(editor.locator('.footer .primary')).toBeInViewport();
  await page.keyboard.press('Escape');
  await expect(editor).toBeHidden();

  // Graphe : le canevas (zone en deux dimensions) et sa liste équivalente au clavier.
  // Touche 3 (le focus est revenu sur la carte, hors champ) : le graphe de tout le dossier.
  await page.keyboard.press('3');
  await expect(page).toHaveURL(/\/graph/);
  await graphReady(page, { count: 3 });
  const listToggle = page.getByRole('button', { name: 'Liste des liens', exact: true });
  await tabTo(page, listToggle, { max: 60 });
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('table', { name: 'Liens du graphe (même contenu que le canevas)' }),
  ).toBeVisible();
  await screen(page, '04-graphe');
  await expectNoAxeViolations(page);

  // Recherche : / puis la saisie, résultats surlignés.
  await page.keyboard.press('/');
  await page.keyboard.type('anxiété');
  await expect(page.locator('mark').first()).toBeVisible();
  await screen(page, '07-recherche');
  await expectNoAxeViolations(page);
  await page.keyboard.press('Escape');

  // Mon compte : la navigation passe en onglets ; Préférences puis Sécurité atteints au clavier.
  await page.goto('/fr/mon-compte/preferences');
  await expect(h1).toHaveText('Préférences');
  await screen(page, '14-preferences');
  await expectNoAxeViolations(page);
  const nav = page.getByRole('navigation', { name: 'Mon compte' });
  await tabTo(page, nav.getByRole('link', { name: /Compte et sécurité|Sécurité/ }), { max: 40 });
  await page.keyboard.press('Enter');
  await expect(h1).toHaveText('Compte et sécurité');
  await screen(page, '18-compte-securite');
  await expectNoAxeViolations(page);
});

test('pages publiques à 200 % : annuaire (filtres repliés), connexion, inscription', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const h1 = page.getByRole('heading', { level: 1 }).first();

  await page.goto('/fr/annuaire');
  await expect(h1).toBeVisible();
  // À cette largeur (640 px CSS, sous 760 px), les filtres sont derrière un bouton qui les ouvre
  // en panneau plein écran (dialogue modal, UX-D6). Fermé, le repère « Filtres » n'est pas exposé
  // (pas de repère vide pour les lecteurs d'écran).
  const filters = page.getByRole('button', { name: /^Filtres \(\d+\)$/ });
  const landmark = page.getByRole('complementary', { name: 'Filtres' });
  await expect(filters).toBeVisible();
  await expect(landmark).toHaveCount(0);
  await tabTo(page, filters, { max: 40 });
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Filtres' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toBeFocused();

  // Reflow (WCAG 1.4.10) : le panneau tient dans la largeur, sans défilement horizontal ni case
  // coupée ; il défile seulement en hauteur.
  expect(await dialog.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
  const clipped = await dialog.evaluate((el) => {
    const panel = el.getBoundingClientRect();
    return [...el.querySelectorAll('label, button, legend, h2')]
      .map((node) => node.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && (rect.left < panel.left || rect.right > panel.right))
      .length;
  });
  expect(clipped, 'éléments du panneau coupés horizontalement à 200 %').toBe(0);

  // Les filtres s'utilisent au clavier : la dernière case du panneau, cochée par Espace, filtre.
  const accepting = dialog.getByRole('checkbox', { name: /Accepte de nouveaux patients/ });
  await tabTo(page, accepting, { max: 60 });
  await expect(accepting).toBeInViewport();
  await page.keyboard.press('Space');
  await expect(page).toHaveURL(/accepte=oui/);
  await screen(page, '08-annuaire-filtres');
  await expectNoAxeViolations(page);

  // Échap ferme le panneau et rend le focus au bouton, qui compte le filtre.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(filters).toBeFocused();
  await expect(filters).toHaveText('Filtres (1)');
  await expect(landmark).toHaveCount(0);
  await screen(page, '08-annuaire');
  await expectNoAxeViolations(page);

  await page.goto('/fr/connexion');
  await expect(h1).toBeVisible();
  await tabTo(page, page.getByLabel('E-mail professionnel'), { max: 40 });
  await page.keyboard.type('personne@example.test');
  await tabTo(page, page.getByLabel('Mot de passe', { exact: true }), { max: 3 });
  await page.keyboard.type('Pas-le-bon-mot-de-passe-1');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toContainText('E-mail, mot de passe ou code incorrect.');
  await screen(page, '11-connexion');
  await expectNoAxeViolations(page);

  await page.goto('/fr/inscription');
  await expect(h1).toBeVisible();
  const submit = page.getByRole('button', { name: 'Créer mon compte' });
  await tabTo(page, submit, { max: 60 });
  await expect(submit).toBeInViewport();
  await page.keyboard.press('Enter');
  // Le résumé des erreurs prend le focus, visible à 200 % ; son premier lien mène au champ.
  const summary = page.locator('pm-form-errors .summary[role="alert"]');
  await expect(summary).toBeFocused();
  await expect(summary).toBeInViewport();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.locator('[aria-invalid="true"]').first()).toBeFocused();
  await screen(page, '12-inscription');
  await expectNoAxeViolations(page);
});
