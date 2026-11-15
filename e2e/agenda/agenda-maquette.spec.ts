import { expect, Page, test } from '@playwright/test';

import { createAccount, signIn } from '../preferences/accounts';
import { expectNoAxeViolations } from '../support/axe';
import { shoot } from '../support/captures';

// Fiche 15 (maquette 15-agenda.html) et fiche 15b (15b-nouveau-rendez-vous.html), rendu seul : le
// module `scheduling` n'existe pas (G Q25), l'agenda affiche les données de démonstration de la
// feature (semaine de la maquette répétée). Le compte est réel (API locale), rien n'est écrit.

/** La semaine de la maquette : 26 octobre – 1er novembre 2026, 14 séances, 3 blocs Google. */
const WEEK = '/fr/agenda?view=week&date=2026-10-26';

function agenda(page: Page) {
  const grid = page.locator('pm-agenda-calendar');
  return {
    grid,
    events: grid.locator('a.fc-timegrid-event:not(.fc-event-mirror)'),
    busy: grid.locator('.fc-bg-event.busy[role="img"]'),
    views: page.getByRole('group', { name: 'Vue' }),
    rail: page.getByRole('complementary', { name: "Navigation de l'agenda" }),
    detail: page.getByRole('complementary', { name: 'Détail du rendez-vous' }),
    range: page.locator('.toolbar .range'),
    meta: page.locator('.toolbar .meta'),
  };
}

test.beforeEach(async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const account = await createAccount(request, 'agenda', 'psychologist');
  await signIn(page, account);
});

/** `yyyy-MM-dd` du jour, en heure locale, comme l'URL de l'agenda. */
function isoToday(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

test('fiche 15 : le carreau Agenda du rail mène à la semaine ; barre d’outils, rail, grille et blocs Google de la maquette', async ({
  page,
}) => {
  await page
    .locator('pm-nav-rail.app-rail')
    .getByRole('link', { name: 'Agenda', exact: true })
    .click();
  await expect(page).toHaveURL(/\/fr\/agenda$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Agenda' })).toBeVisible();

  await page.goto(WEEK);
  const a = agenda(page);
  await expect(a.range).toHaveText('26 octobre – 1er novembre 2026');
  await expect(a.meta).toHaveText('· semaine 44 · 14 séances');
  await expect(a.views.getByRole('button', { name: 'Semaine' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByText('Google Agenda synchronisé')).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Rendez-vous' })).toBeVisible();

  // Rail gauche : mini-mois sur octobre, cinq cases, légende.
  await expect(a.rail.getByText('Octobre 2026')).toBeVisible();
  await expect(a.rail.getByRole('checkbox')).toHaveCount(5);
  await expect(a.rail.getByText('connecté')).toBeVisible();
  await expect(a.rail.getByText('Indisponible (Google)')).toBeVisible();

  // Grille : sept colonnes, quatorze liens nommés, trois blocs « Occupé » nommés, samedi teinté.
  await expect(a.grid.locator('.fc-col-header-cell')).toHaveCount(7);
  await expect(a.events).toHaveCount(14);
  await expect(a.busy).toHaveCount(3);
  await expect(a.busy.first()).toHaveAttribute(
    'aria-label',
    'Indisponible de 14:00 à 16:00, agenda Google Pro',
  );
  await expect(a.grid.getByRole('link', { name: /^Marie D\. · cabinet/ })).toBeVisible();
  await expect(a.grid.getByRole('link', { name: /^Yanis M\. · à confirmer/ })).toHaveClass(
    /tentative/,
  );
  await expect(a.grid.getByRole('link', { name: /^Appel · Inès V\./ })).toHaveClass(/contact/);
  await expect(a.grid.locator('.fc-timegrid-col.fc-day-sat')).toHaveCount(1);
  await expect(a.detail).toHaveCount(0);
  await expectNoAxeViolations(page);
  await shoot(page, 'agenda-semaine');

  // Cases du rail : masquer les visios retire trois séances.
  await a.rail.getByRole('checkbox', { name: 'Séances en visio' }).uncheck();
  await expect(a.events).toHaveCount(11);
  await expect(a.meta).toHaveText('· semaine 44 · 11 séances');
  await a.rail.getByRole('checkbox', { name: 'Séances en visio' }).check();
  await expect(a.events).toHaveCount(14);

  // ‹ › et Aujourd'hui pilotent l'URL.
  await page.getByRole('button', { name: 'Semaine suivante' }).click();
  await expect(page).toHaveURL(/view=week&date=2026-11-02$/);
  await expect(a.range).toHaveText('2 – 8 novembre 2026');
  await page.getByRole('button', { name: "Aujourd'hui", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`view=week&date=${isoToday()}$`));
});

test('fiche 15 : un clic ouvre le détail à droite sans changer de vue ; ↓ ↑ changent de rendez-vous ; Échap ferme', async ({
  page,
}) => {
  await page.goto(WEEK);
  const a = agenda(page);
  await a.grid.getByRole('link', { name: /^Marie D\./ }).click();
  await expect(page).toHaveURL(/\/fr\/agenda\/rdv\/rdv-2026-10-31-13\?view=week&date=2026-10-26$/);
  await expect(a.detail).toBeVisible();
  await expect(a.detail.getByText('Séance planifiée · cabinet')).toBeVisible();
  await expect(a.detail.getByRole('link', { name: 'Marie D.' })).toBeVisible();
  await expect(a.detail.getByText('Samedi 31 octobre · 10:00 – 10:50')).toBeVisible();
  await expect(a.detail.getByText('Cabinet · 12 rue Vendôme')).toBeVisible();
  await expect(a.detail.getByRole('heading', { name: 'Préparer' })).toBeVisible();
  await expect(a.detail.getByRole('link', { name: "Vue d'ensemble" })).toBeVisible();
  await expect(a.detail.getByLabel('Note de planification')).toHaveValue(
    "Reprendre l'entretien du 18 et le carnet du soir.",
  );
  await expect(a.detail.getByText('Séance · M. D.')).toBeVisible();
  await expect(a.detail.getByRole('switch')).toBeDisabled();
  await expect(a.detail.getByRole('button', { name: 'Démarrer la séance' })).toBeVisible();
  await expect(a.grid.locator('a.fc-timegrid-event.selected')).toHaveAttribute(
    'aria-current',
    'true',
  );
  await expect(a.views.getByRole('button', { name: 'Semaine' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // Les actions attendent l'API : inertes, nommées « … · à venir » ; la note se lit seulement.
  await expect(a.detail.getByRole('button', { name: 'Déplacer · à venir' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await expect(a.detail.getByLabel('Note de planification')).toHaveAttribute('readonly', '');
  await shoot(page, 'agenda-detail');
  // Le rendez-vous sélectionné garde le fond plein de la maquette, assombri pour le texte blanc.
  await expectNoAxeViolations(page);

  await page.keyboard.press('ArrowDown');
  await expect(page).toHaveURL(/rdv-2026-10-31-14/);
  await expect(a.detail.getByRole('link', { name: 'Théo B.' })).toBeVisible();
  await page.keyboard.press('ArrowUp');
  await expect(a.detail.getByRole('link', { name: 'Marie D.' })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/fr\/agenda\?view=week&date=2026-10-26$/);
  await expect(a.detail).toHaveCount(0);
  // Le focus revient au rendez-vous dans la grille ; ↓ ne fait plus rien sans détail.
  await expect(a.grid.getByRole('link', { name: /^Marie D\./ })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page).toHaveURL(/\/fr\/agenda\?view=week&date=2026-10-26$/);

  // Masquer l'agenda du rendez-vous ouvert ferme le détail ; ‹ › quittent /rdv/:id.
  await a.grid.getByRole('link', { name: /^Léa T\./ }).click();
  await expect(a.detail.getByRole('link', { name: 'Léa T.' })).toBeVisible();
  await a.rail.getByRole('checkbox', { name: 'Séances en visio' }).uncheck();
  await expect(a.detail).toHaveCount(0);
  await a.rail.getByRole('checkbox', { name: 'Séances en visio' }).check();
  await a.grid.getByRole('link', { name: /^Léa T\./ }).click();
  await expect(a.detail).toBeVisible();
  await page.getByRole('button', { name: 'Semaine suivante' }).click();
  await expect(page).toHaveURL(/\/fr\/agenda\?view=week&date=2026-11-02$/);
  await expect(a.detail).toHaveCount(0);
});

test('fiche 15 : les vues Jour, Mois et Liste ; tout masqué, la liste vide propose de planifier', async ({
  page,
}) => {
  await page.goto('/fr/agenda?view=day&date=2026-10-31');
  const a = agenda(page);
  await expect(a.grid.locator('.fc-col-header-cell')).toHaveCount(1);
  await expect(a.events).toHaveCount(2);
  await expect(a.range).toHaveText('Samedi 31 octobre 2026');

  await a.views.getByRole('button', { name: 'Mois' }).click();
  await expect(page).toHaveURL(/view=month&date=2026-10-31$/);
  await expect(a.range).toHaveText('Octobre 2026');
  await expect(page.locator('pm-agenda-calendar .fc-daygrid-day')).toHaveCount(35);
  await expectNoAxeViolations(page);

  await a.views.getByRole('button', { name: 'Liste' }).click();
  await expect(page).toHaveURL(/view=list&date=2026-10-31$/);
  await expect(page.locator('pm-agenda-calendar .fc-list-day').first()).toContainText(
    /samedi 31 octobre/i,
  );
  await expect(page.locator('pm-agenda-calendar .fc-list-event').first()).toContainText('Marie D.');
  await expectNoAxeViolations(page);

  // Tout masqué : la liste montre l'état vide de la fiche.
  for (const box of await a.rail.getByRole('checkbox').all()) await box.uncheck();
  await expect(page.getByText('Aucun rendez-vous dans les 30 prochains jours')).toBeVisible();
  await expect(page.getByText(/« \+ Rendez-vous » pour en planifier un/)).toBeVisible();
  await expectNoAxeViolations(page);
});

test('fiche 15b : « + Rendez-vous » et un créneau vide ouvrent le panneau de la maquette ; Échap le ferme', async ({
  page,
}) => {
  await page.goto(WEEK);
  await page.getByRole('button', { name: '+ Rendez-vous' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nouveau rendez-vous' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Créneau cliqué : lundi 26 octobre, 10:00')).toBeVisible();
  await expect(dialog.getByRole('group', { name: 'Modalité' }).getByRole('button')).toHaveCount(3);
  await expect(dialog.getByRole('button', { name: 'Cabinet' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // Sans patient prérempli, la durée est la préférence (60 min).
  await expect(dialog.getByText('Se termine à 11:00')).toBeVisible();
  await expect(dialog.getByText('Sera copié dans Google Agenda « PsyMate »')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Planifier le rendez-vous' })).toBeVisible();
  await expectNoAxeViolations(page);

  // Toutes les 2 semaines × 4 : le bouton compte les occurrences, l'aperçu aussi.
  await dialog.getByLabel('Répéter').selectOption({ label: 'Toutes les 2 semaines' });
  await expect(dialog.getByRole('button', { name: 'Planifier 4 rendez-vous' })).toBeVisible();
  await expect(dialog.getByText('4 occurrences')).toBeVisible();
  await shoot(page, 'agenda-nouveau-rendez-vous');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  // Un clic sur un créneau vide (mercredi 11 h) ouvre le même panneau sur ce créneau.
  const column = page.locator('pm-agenda-calendar .fc-timegrid-col.fc-day-wed');
  const box = (await column.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + 3 * 52 + 10);
  await expect(page.getByRole('dialog', { name: 'Nouveau rendez-vous' })).toBeVisible();
  await expect(page.getByText('Créneau cliqué : mercredi 28 octobre, 11:00')).toBeVisible();
});

test('fiche 15 : glisser un rendez-vous le déplace, tirer son bord l’allonge (en local, PATCH à venir)', async ({
  page,
}) => {
  await page.goto(WEEK);
  const a = agenda(page);
  const omar = a.events.filter({ hasText: 'Omar B.' });
  await expect(omar).toContainText('09:00–09:50');
  const from = (await omar.boundingBox())!;
  // Glisser d'une heure vers le bas (52 px), par petits pas : le plugin interaction suit le pointeur.
  await page.mouse.move(from.x + from.width / 2, from.y + 10);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, from.y + 10 + 52, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator('.fc-event-mirror')).toHaveCount(0);
  await expect(omar).toContainText('10:00–10:50');
  await expect(a.meta).toHaveText('· semaine 44 · 14 séances');

  // Tirer le bord bas de 26 px : la séance dure 80 minutes.
  const moved = (await omar.boundingBox())!;
  await page.mouse.move(moved.x + moved.width / 2, moved.y + moved.height - 2);
  await page.mouse.down();
  await page.mouse.move(moved.x + moved.width / 2, moved.y + moved.height - 2 + 26, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.fc-event-mirror')).toHaveCount(0);
  await expect(omar).toContainText('10:00–11:20');
  await expectNoAxeViolations(page);
});
