import {
  APIRequestContext,
  expect,
  Locator,
  Page,
  request as playwrightRequest,
  test,
} from '@playwright/test';

import { createAccount, signIn } from '../preferences/accounts';
import { TestAccount } from '../support/accounts';
import { expectNoAxeViolations } from '../support/axe';
import { StoryPatient, storyPatient, volumePatient } from './timeline-data';

// Timeline, mode chronologique (M3-02, fiche 03, B4 écran 3) contre l'API locale (jamais de mock) :
// un compte jetable porte un patient « récit » (situations en bande, pastille « dit en séance du … »,
// zone « Avant le suivi ») et un patient « volume » de 2 000 notes (défilement, fenêtres, zoom).

const VOLUME = 2000;
// Total affiché : 2 000 notes, la séance passée et la séance d'accueil, soit « 2 002 » (Intl, fr).

let account: TestAccount;
let story: StoryPatient;
let volume: string;
let api: APIRequestContext;

test.describe.configure({ mode: 'serial', timeout: 120_000 });

test.beforeAll(async () => {
  test.setTimeout(240_000);
  api = await playwrightRequest.newContext();
  account = await createAccount(api, 'm3-02.timeline', 'psychologist');
  story = await storyPatient(api);
  volume = await volumePatient(api, account, VOLUME);
});

test.afterAll(async () => {
  await api?.dispose();
});

function timeline(page: Page) {
  const viewport = page.locator('cdk-virtual-scroll-viewport');
  return {
    viewport,
    count: page.locator('.status-line .count'),
    granularity: page.locator('.granularity'),
    card: (title: string) => page.locator('pm-timeline-card article', { hasText: title }),
    row: (title: string) =>
      page.locator('.row', { has: page.locator('pm-timeline-card', { hasText: title }) }),
    menu: page.getByRole('menu'),
  };
}

/** Lanes de bande allumées sur une ligne, dans l'ordre des colonnes. */
async function lanes(row: Locator): Promise<boolean[]> {
  return row.locator('.lane').evaluateAll((nodes) => nodes.map((n) => n.classList.contains('on')));
}

/** Nombre de fenêtres en mémoire lu dans la ligne d'état (« … · n fenêtres en mémoire »). */
function windowsOf(text: string | null): number {
  const match = /(\d+) fenêtres? en mémoire/.exec(text ?? '');
  return match ? Number(match[1]) : -1;
}

test('situations en bande, pastille « dit en séance du … », zone « Avant le suivi »', async ({
  page,
}) => {
  await signIn(page, account);
  await page.goto(`/fr/patients/${story.id}/timeline`);
  const t = timeline(page);
  await expect(t.card('Entretien annuel')).toBeVisible();
  await expect(t.count).toHaveText('10 entrées · 1 fenêtre en mémoire');

  // Bandes : la situation en cours (commencée il y a 200 jours) va jusqu'en haut, avec la flèche ;
  // la situation terminée ne couvre que sa plage ; les deux ne partagent pas de colonne.
  const legend = page.getByRole('list', { name: 'Situations sur la période' });
  await expect(
    legend.getByRole('listitem', { name: /Réorganisation du service.*en cours/ }),
  ).toBeVisible();
  await expect(legend.getByRole('listitem', { name: /Arrêt maladie.*terminée/ })).toBeVisible();
  const first = page.locator('.row').first();
  await expect(first.locator('.arrow')).toBeVisible();
  expect(await lanes(first)).toEqual([true, false]);
  expect(await lanes(t.row('Entretien annuel'))).toEqual([true, false]);
  expect(await lanes(t.row('Arrêt maladie'))).toEqual([true, true]);
  expect(await lanes(t.row('Réorganisation du service'))).toEqual([true, false]);

  // Pastille : dit en séance il y a 30 jours, survenu 5 jours plus tôt ; la note du jour même n'en a pas.
  await expect(t.card('Entretien annuel').locator('.said')).toHaveText(/^dit en séance du /);
  await expect(t.card('Point sur le sommeil')).toBeVisible();
  await expect(t.card('Point sur le sommeil').locator('.said')).toHaveCount(0);
  await expectNoAxeViolations(page);

  // Avant le suivi : sous le marqueur de début (première séance), précisions lisibles.
  await t.viewport.evaluate((el) => (el.scrollTop = el.scrollHeight));
  const marker = page.locator('.follow-start');
  await expect(marker).toContainText('Début du suivi');
  await expect(marker).toContainText('Avant le suivi');
  for (const [title, when] of [
    ['Déménagement à Lyon', /^2014$/],
    ['Études à Lille', /Études à Lille \(.*2008.*2012\)/],
    ['Souvenirs d’école', /^enfance$/],
  ] as const) {
    await expect(t.row(title)).toHaveClass(/\bbefore\b/);
    await expect(t.card(title).locator('.when')).toHaveText(when);
  }
  await expect(t.card('Déménagement à Lyon').locator('.precision')).toHaveText('précision : année');
  await expect(t.card('Souvenirs d’école').locator('.precision')).toHaveText(
    'précision : phase de vie',
  );
  await expect(t.row('Réorganisation du service')).not.toHaveClass(/\bbefore\b/);
  await expectNoAxeViolations(page);
});

test('menu contextuel entièrement au clavier ; « Corriger » ouvre l’éditeur sur l’entrée', async ({
  page,
}) => {
  await signIn(page, account);
  await page.goto(`/fr/patients/${story.id}/timeline`);
  const t = timeline(page);
  const card = t.card('Entretien annuel');
  await card.focus();

  // Maj+F10 : le menu s'ouvre, le premier élément a le focus ; ↓ parcourt ; Échap rend le focus à la carte.
  await page.keyboard.press('Shift+F10');
  await expect(t.menu).toBeVisible();
  const item = (name: string) => t.menu.getByRole('menuitem', { name: new RegExp(`^${name}`) });
  await expect(item('Ouvrir')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(item('Corriger')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(item('Lier')).toBeFocused();
  await expect(item('Lier')).toHaveAttribute('aria-disabled', 'true');
  await expect(item('Lier')).toContainText('bientôt disponible');
  await page.keyboard.press('ArrowDown');
  await expect(item('Voir dans le graphe')).toBeFocused();
  await expectNoAxeViolations(page);
  await page.keyboard.press('Escape');
  await expect(t.menu).toBeHidden();
  await expect(card).toBeFocused();

  // La touche Menu ouvre aussi ; Entrée sur « Corriger » : l'éditeur s'ouvre sur cette entrée.
  await page.keyboard.press('Shift+F10');
  await expect(item('Ouvrir')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  const editor = page.locator('[role="dialog"]:has(pm-entry-editor-panel)');
  await expect(editor).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`entry=${story.ids['Entretien annuel']}`));
  await expect(editor.getByRole('textbox', { name: 'Titre', exact: true })).toHaveValue(
    'Entretien annuel',
  );
  await page.keyboard.press('Escape');
  await expect(editor).toBeHidden();
  await expect(card).toBeVisible();
  await expect(card).toHaveClass(/\bselected\b/);
});

test(`${VOLUME} entrées : défilement fluide, trois fenêtres au plus, zoom sans requête`, async ({
  page,
}) => {
  await signIn(page, account);
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes(`/api/patients/${volume}/timeline`)) requests.push(request.url());
  });
  await page.goto(`/fr/patients/${volume}/timeline`);
  const t = timeline(page);
  // Fenêtre courante puis la suivante en arrière-plan.
  await expect(t.count).toHaveText(/^2\s002 entrées · 2 fenêtres en mémoire$/);
  await expect(t.granularity).toHaveText('Semaine');
  await page.waitForLoadState('networkidle');
  const settled = requests.length;

  // Zoom : +, −, Ctrl+molette ; la granularité change, aucune requête (les fenêtres couvrent).
  await page.keyboard.press('+');
  await expect(t.granularity).toHaveText('Jour');
  await page.keyboard.press('-');
  await page.keyboard.press('-');
  await expect(t.granularity).toHaveText('Mois');
  const box = (await t.viewport.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -120);
  await page.keyboard.up('Control');
  await expect(t.granularity).toHaveText('Semaine');
  await page.waitForTimeout(500);
  expect(requests.length, requests.slice(settled).join('\n')).toBe(settled);

  // Défilement continu sur toute la liste : 160 px par trame, durées de trame mesurées.
  const stats = await t.viewport.evaluate(
    (el, frames) =>
      new Promise<{
        frames: number;
        p50: number;
        p95: number;
        max: number;
        long: number;
        maxWindows: number;
        longAt: string;
      }>((resolve) => {
        const deltas: number[] = [];
        const longAt: number[] = [];
        let maxWindows = 0;
        let last = performance.now();
        let n = 0;
        const step = (now: number) => {
          deltas.push(now - last);
          if (n > 0 && now - last > 50) longAt.push(n);
          last = now;
          el.scrollTop += 160;
          const text = document.querySelector('.status-line .count')?.textContent ?? '';
          const match = /(\d+) fenêtres? en mémoire/.exec(text);
          if (match) maxWindows = Math.max(maxWindows, Number(match[1]));
          if (++n < frames) requestAnimationFrame(step);
          else {
            const sorted = deltas.slice(1).sort((a, b) => a - b);
            const at = (q: number) =>
              sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
            resolve({
              frames: sorted.length,
              p50: Math.round(at(0.5) * 10) / 10,
              p95: Math.round(at(0.95) * 10) / 10,
              max: Math.round(sorted[sorted.length - 1] * 10) / 10,
              long: sorted.filter((d) => d > 50).length,
              maxWindows,
              longAt: longAt.join(','),
            });
          }
        };
        requestAnimationFrame(step);
      }),
    1200,
  );
  test.info().annotations.push({ type: 'perf', description: JSON.stringify(stats) });
  console.log(`M3-02 défilement ${VOLUME} entrées :`, JSON.stringify(stats));
  expect(stats.maxWindows).toBeLessThanOrEqual(3);
  // 60 Hz : 16,7 ms par trame ; au plus une trame sautée au 95e centile, 2 % de trames longues.
  expect(stats.p95).toBeLessThan(34);
  expect(stats.long).toBeLessThan(stats.frames * 0.02);

  // En bas de la liste : la plus ancienne note est là, toujours trois fenêtres au plus.
  await t.viewport.evaluate((el) => (el.scrollTop = el.scrollHeight));
  await expect(t.card('Note 0001')).toBeVisible();
  await expect.poll(async () => windowsOf(await t.count.textContent())).toBeLessThanOrEqual(3);
  await expectNoAxeViolations(page);
});

test('« Corriger » puis retour, « Voir dans le graphe » puis retour : position conservée', async ({
  page,
}) => {
  await signIn(page, account);
  await page.goto(`/fr/patients/${volume}/timeline`);
  const t = timeline(page);
  await expect(t.count).toHaveText(/^2\s002 entrées · /);

  // Au milieu de la deuxième fenêtre.
  await t.viewport.evaluate((el) => (el.scrollTop = 96 * 450));
  const firstVisible = async () =>
    page.evaluate(() => {
      const viewport = document
        .querySelector('cdk-virtual-scroll-viewport')!
        .getBoundingClientRect();
      const cards = [...document.querySelectorAll<HTMLElement>('pm-timeline-card article')];
      const card = cards.find((c) => c.getBoundingClientRect().top >= viewport.top - 1);
      return card?.querySelector('.title')?.textContent?.trim() ?? null;
    });
  await expect.poll(firstVisible).toMatch(/^Note \d{4}$/);
  const anchor = (await firstVisible())!;
  const scrollTop = await t.viewport.evaluate((el) => el.scrollTop);
  const card = t.card(anchor);

  // Corriger (clic droit) puis fermer l'éditeur : rien n'a bougé.
  await card.click({ button: 'right' });
  await t.menu.getByRole('menuitem', { name: /^Corriger/ }).click();
  const editor = page.locator('[role="dialog"]:has(pm-entry-editor-panel)');
  await expect(editor).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(editor).toBeHidden();
  expect(await t.viewport.evaluate((el) => el.scrollTop)).toBe(scrollTop);
  await expect(card).toBeInViewport();

  // Voir dans le graphe : onglet 3 centré sur l'entrée ; retour par la touche 2.
  await card.click({ button: 'right' });
  // Position au départ de l'onglet (le focus pris par la carte au clic a pu la faire glisser).
  const leftAt = await t.viewport.evaluate((el) => el.scrollTop);
  await t.menu.getByRole('menuitem', { name: /^Voir dans le graphe/ }).click();
  await expect(page).toHaveURL(new RegExp(`/patients/${volume}/graph\\?root=`));
  await page.keyboard.press('2');
  await expect(page).toHaveURL(new RegExp(`/patients/${volume}/timeline$`));
  await expect(t.card(anchor)).toBeInViewport();
  await expect.poll(() => t.viewport.evaluate((el) => el.scrollTop)).toBe(leftAt);
  await expect(t.card(anchor)).toHaveClass(/\bselected\b/);
  await expectNoAxeViolations(page);
});

test('?focus=<id> (recherche → timeline) : l’entrée est amenée à l’écran, sélectionnée, focalisée', async ({
  page,
}) => {
  await signIn(page, account);
  const id = story.ids['Déménagement à Lyon'];
  await page.goto(`/fr/patients/${story.id}/timeline?focus=${id}`);
  const t = timeline(page);
  const card = t.card('Déménagement à Lyon');
  await expect(card).toBeInViewport();
  await expect(card).toBeFocused();
  await expect(card).toHaveClass(/\bselected\b/);
  // Le paramètre est retiré (?entry= reste réservé à la correction) ; la position reste dans l'onglet.
  await expect(page).toHaveURL(new RegExp(`/patients/${story.id}/timeline$`));
  await expect(page.locator('[role="dialog"]:has(pm-entry-editor-panel)')).toHaveCount(0);
  await expectNoAxeViolations(page);
});
