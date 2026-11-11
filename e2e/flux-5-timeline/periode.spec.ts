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
import { shoot } from '../support/captures';
import { API, setGroupBy } from './filters-data';
import {
  createPatient,
  daysAgo,
  entry,
  intakeOf,
  StoryPatient,
  storyPatient,
} from './timeline-data';

// UX-B2 (audit UX du 9 nov. 2026, fiche 03 état A) contre l'API locale (jamais de mock) : la
// timeline s'ouvre sur la période « 90 j » (cartes récentes, jamais la vue décennie), barre d'outils
// en deux rangées, ligne d'état en mono 12 px, bouton de mode non sélectionné lisible (text-secondary),
// zone des cartes d'au moins 480 px à 1440 × 900, rien ne déborde à 375 px, axe-core sans violation.
// « Tout » s'écrit `?period=all` ; la période par défaut ne s'écrit pas. Les liens profonds de la
// vue d'ensemble qui portent un filtre sans période (`?drafts=1`, `?mode=session&focus=`) gardent
// « Tout ».

let account: TestAccount;
let story: StoryPatient;
/** Patient dont le seul brouillon a 150 jours (hors de la période par défaut). */
let drafty: string;
/** Patient à six situations en cours (UX-G2c : la liste des situations ne mange pas la zone). */
let crowded: string;
let api: APIRequestContext;

test.describe.configure({ mode: 'serial', timeout: 90_000 });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  api = await playwrightRequest.newContext();
  account = await createAccount(api, 'ux-b2.periode', 'psychologist');
  await setGroupBy(api, 'chronological');
  story = await storyPatient(api);
  drafty = await createPatient(api, 'Brouillon A.');
  await intakeOf(api, drafty);
  await entry(api, drafty, {
    type: 'note',
    status: 'draft',
    title: 'Brouillon ancien',
    body: 'Noté il y a cinq mois, jamais relu.',
    occurred: { from: daysAgo(150) },
  });
  // Les six situations en cours du dossier mesuré par l'audit (bilan UX-G1, zone des cartes à 431 px).
  crowded = await createPatient(api, 'Situations Q.');
  const intake = await intakeOf(api, crowded);
  for (const [title, days] of SIX_SITUATIONS) {
    await entry(api, crowded, {
      type: 'situation',
      title,
      occurred: { from: daysAgo(days), precision: 'day' },
      sessionId: intake,
    });
  }
});

const SIX_SITUATIONS: readonly (readonly [string, number])[] = [
  ['Séparation envisagée', 80],
  ['Projet de voyage', 70],
  ['Changement de poste imposé', 60],
  ['Reprise d’une activité manuelle', 50],
  ['Troubles de la vue : suivi ophtalmologique', 40],
  ['Tensions dans l’équipe', 30],
];

test.afterAll(async () => {
  await api?.dispose();
});

function timeline(page: Page) {
  const toolbar = page.getByRole('toolbar', { name: 'Affichage de la timeline' });
  return {
    toolbar,
    period: toolbar.getByRole('group', { name: 'Période' }),
    mode: toolbar.getByRole('group', { name: "Mode d'affichage (M)" }),
    viewport: page.locator('cdk-virtual-scroll-viewport'),
    count: page.locator('.status-line .count'),
    statusLine: page.locator('.status-line'),
    card: (title: string) => page.locator('pm-timeline-card article', { hasText: title }),
  };
}

/** Rangées visuelles distinctes de la barre d'outils (ordonnées des contrôles, arrondies). */
async function toolbarRows(page: Page): Promise<number> {
  return page
    .locator('[role="toolbar"] button')
    .evaluateAll(
      (buttons) =>
        new Set(
          buttons
            .filter((b) => (b as HTMLElement).offsetParent !== null)
            .map((b) => Math.round(b.getBoundingClientRect().top / 8)),
        ).size,
    );
}

test('arrivée : période « 90 j », cartes récentes, URL sans paramètre ; « Tout » montre tout le dossier', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, account);
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes(`/api/patients/${story.id}/timeline?`)) requests.push(request.url());
  });
  await page.goto(`/fr/patients/${story.id}/timeline`);
  const t = timeline(page);

  // 90 j : la séance d'accueil, la séance d'il y a 30 jours, l'événement d'il y a 35 jours et la
  // note du même jour ; ni les situations d'il y a 120 et 200 jours, ni le passé d'avant le suivi.
  await expect(t.count).toHaveText('4 entrées · 1 fenêtre en mémoire');
  await expect(t.period.getByRole('button', { name: '90 j', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(t.card('Entretien annuel')).toBeVisible();
  await expect(t.card('Déménagement à Lyon')).toHaveCount(0);
  await expect(page.locator('pm-timeline-decade')).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/patients/${story.id}/timeline$`));
  expect(requests[0]).toMatch(/[?&]from=/);

  // Mise en page (maquette 03, état A ; audit UX-B2).
  expect(await toolbarRows(page)).toBe(2);
  // La liste tient dans la fenêtre (une carte focalisée n'est jamais sous le bas de l'écran) et
  // mesure au moins 480 px, bandeau « dossier professionnel incomplet » du compte de test compris
  // (UX-G2c : l'audit mesurait la zone avec ce bandeau, comme ici).
  await expect(page.locator('pm-verification-banner')).toBeVisible();
  const box = (await t.viewport.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(900);
  expect(box.height).toBeGreaterThanOrEqual(480);
  const status = await t.statusLine.evaluate((el) => {
    const style = getComputedStyle(el);
    return { size: style.fontSize, family: style.fontFamily };
  });
  expect(status.size).toBe('12px');
  expect(status.family).toMatch(/mono/i);
  // Bouton de mode non sélectionné en text-secondary (#5A6679, 6,2:1), plus en text-disabled.
  await expect(t.mode.getByRole('button', { name: 'Par séance' })).toHaveCSS(
    'color',
    'rgb(90, 102, 121)',
  );
  // Date exacte : pas de « précision : exacte » ; date au jour : la mention reste.
  await expect(t.card('Point sur le sommeil').locator('.precision')).toHaveCount(0);
  await expect(t.card('Entretien annuel').locator('.precision')).toHaveText('précision : jour');
  await expectNoAxeViolations(page);
  await shoot(page, 'ux-b2-1440-03-timeline-90j', false);

  // « Tout » : tout le dossier, ?period=all dans l'URL ; le rechargement le garde.
  await t.period.getByRole('button', { name: 'Tout', exact: true }).click();
  await expect(page).toHaveURL(/[?&]period=all(&|$)/);
  await expect(t.count).toHaveText('10 entrées · 1 fenêtre en mémoire');
  await page.reload();
  await expect(t.count).toHaveText('10 entrées · 1 fenêtre en mémoire');
  await expect(t.period.getByRole('button', { name: 'Tout', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // Retour à « 90 j » : l'URL redevient nue.
  await t.period.getByRole('button', { name: '90 j', exact: true }).click();
  await expect(t.count).toHaveText('4 entrées · 1 fenêtre en mémoire');
  await expect(page).toHaveURL(new RegExp(`/patients/${story.id}/timeline$`));
  await expectNoAxeViolations(page);
});

test('six situations en bande : une seule ligne avant la liste, zone des cartes ≥ 480 px, liste dépliable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, account);
  await page.goto(`/fr/patients/${crowded}/timeline`);
  const t = timeline(page);
  await expect(t.count).toHaveText('7 entrées · 1 fenêtre en mémoire');
  await expect(page.locator('pm-verification-banner')).toBeVisible();

  // Barre d'outils en deux rangées, puis une seule ligne : l'état et « 6 situations sur la période ».
  expect(await toolbarRows(page)).toBe(2);
  const toggle = page.getByRole('button', { name: '6 situations sur la période' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  const status = (await t.statusLine.boundingBox())!;
  const toggleBox = (await toggle.boundingBox())!;
  expect(
    Math.abs(toggleBox.y + toggleBox.height / 2 - (status.y + status.height / 2)),
  ).toBeLessThan(4);
  expect(toggleBox.height).toBeGreaterThanOrEqual(24);
  const box = (await t.viewport.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(900);
  expect(box.height).toBeGreaterThanOrEqual(480);
  // Les bandes portent leur nom à leur tête (quatre colonnes au plus : au-delà, des situations
  // partagent une colonne, d'où la liste complète dépliable).
  await expect(page.locator('.lane-label').first()).toBeVisible();
  await expectNoAxeViolations(page);

  // Déplié : les six situations, avec leur nom complet pour les lecteurs d'écran.
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const legend = page.getByRole('list', { name: 'Situations sur la période' });
  await expect(legend.getByRole('listitem')).toHaveCount(6);
  for (const [title] of SIX_SITUATIONS) {
    await expect(legend.getByRole('listitem', { name: new RegExp(title) })).toBeVisible();
  }
  await expectNoAxeViolations(page);
  await toggle.click();
  await expect(legend).toBeHidden();
});

test('mode par séance : en-têtes avec horaires et durée, axe sans violation', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, account);
  await page.goto(`/fr/patients/${story.id}/timeline?mode=session`);
  const toggles = page.locator('pm-timeline-sessions button.toggle');
  await expect(toggles.first()).toHaveAttribute('aria-expanded', 'true');
  // La séance passée (il y a 30 jours, 50 min, clôturée) : horaires et durée dans l'en-tête.
  await expect(toggles.nth(1)).toContainText(/\d{2}:\d{2} → \d{2}:\d{2} · 50 min/);
  await expectNoAxeViolations(page);
  await shoot(page, 'ux-b2-1440-03-timeline-par-seance');
});

test('375 px : la barre d’outils se replie, rien ne déborde, axe sans violation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await signIn(page, account);
  await page.goto(`/fr/patients/${story.id}/timeline`);
  const t = timeline(page);
  await expect(t.count).toHaveText('4 entrées · 1 fenêtre en mémoire');
  await expect(t.card('Entretien annuel')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await expectNoAxeViolations(page);
  await shoot(page, 'ux-b2-375-03-timeline');
});

test('thème sombre : mêmes contrastes, axe sans violation', async ({ page }) => {
  const dark = await api.patch(`${API}/api/me/preferences`, { data: { theme: 'dark' } });
  expect(dark.status(), await dark.text()).toBe(200);
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, account);
    await page.goto(`/fr/patients/${story.id}/timeline`);
    const t = timeline(page);
    await expect(t.count).toHaveText('4 entrées · 1 fenêtre en mémoire');
    await expectNoAxeViolations(page);
    await shoot(page, 'ux-b2-1440-03-timeline-90j-sombre', false);
  } finally {
    await api.patch(`${API}/api/me/preferences`, { data: { theme: 'light' } });
  }
});

test('lien « N brouillons » (?drafts=1) : tout le dossier, pas seulement 90 jours', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, account);
  await page.goto(`/fr/patients/${drafty}/timeline?drafts=1`);
  const t = timeline(page);
  await expect(t.count).toHaveText('1 entrée · 1 fenêtre en mémoire');
  await expect(t.card('Brouillon ancien')).toBeVisible();
  await expect(t.period.getByRole('button', { name: 'Tout', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page).toHaveURL(new RegExp(`/patients/${drafty}/timeline\\?drafts=1$`));
  await expectNoAxeViolations(page);
});

test('par séance, ?focus= sur une séance de plus de 90 jours : dépliée, sans repli chronologique', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, account);
  const toggle = page.locator(`button.toggle[data-session-id="${story.sessionFirst}"]`);

  // Lien de la vue d'ensemble : ?mode=session&focus=<séance>.
  await page.goto(`/fr/patients/${story.id}/timeline?mode=session&focus=${story.sessionFirst}`);
  await expect(page.locator('pm-timeline-sessions')).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('cdk-virtual-scroll-viewport')).toHaveCount(0);

  // Préférence « par séance » et ?focus= seul : la période par défaut s'élargit, la séance se déplie.
  await setGroupBy(api, 'session');
  try {
    await page.goto(`/fr/patients/${story.id}/timeline?focus=${story.sessionFirst}`);
    await expect(page.locator('pm-timeline-sessions')).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('cdk-virtual-scroll-viewport')).toHaveCount(0);
    await expectNoAxeViolations(page);
  } finally {
    await setGroupBy(api, 'chronological');
  }
});
