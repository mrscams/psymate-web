import {
  APIRequestContext,
  APIResponse,
  BrowserContext,
  expect,
  Page,
  request as playwrightRequest,
  test,
} from '@playwright/test';

import { createAccount, signIn } from '../preferences/accounts';
import { TestAccount } from '../support/accounts';
import { expectNoAxeViolations } from '../support/axe';
import { shoot } from '../support/captures';
import { API } from '../support/env';

// M16-23, features/agenda de droite à gauche (G Q71 points 2 et 3, Q73 à Q77 ; docs/design/arabe.md
// §1 à §5, §9) : semaine, jour, mois, liste, détail du rendez-vous, panneau « Nouveau rendez-vous »
// avec récurrence et chevauchement, panneau des demandes en ligne, en /ar/. Pour chaque écran :
// <html dir="rtl">, pas de défilement horizontal, axe-core sans violation, une capture
// (PSYMATE_E2E_CAPTURES). Le rendu est mesuré (positions des boîtes et des caractères), pas déduit
// d'un attribut : lundi dans la première colonne à droite, heures de haut en bas, aucun chiffre
// arabo-indien, l'heure de début d'une plage à gauche du tiret. Aucun libellé ciblé (rôles,
// structure, URL) : les textes de /ar/ passent du français de repli à l'arabe au fil du jalon. Une
// seule inscription et une seule connexion (en /fr/), puis /ar/… ; contre l'API locale (seed
// small), jamais de mock du backend.

const ZONE = 'Europe/Paris';

/** Nom saisi en arabe : affiché dans son sens (dir="auto"), dans une interface de droite à gauche. */
const ARABIC_NAME = 'أحمد بن علي';
const LATIN_NAME = 'Claire Martin';

/** Chiffres arabo-indiens (U+0660 à U+0669) et persans (U+06F0 à U+06F9) : jamais à l'écran (Q71). */
const EASTERN_DIGITS = /[٠-٩۰-۹]/;

let api: APIRequestContext;
let account: TestAccount;
let context: BrowserContext;
let page: Page;

test.describe.configure({ mode: 'serial', timeout: 90_000 });

async function ok<T>(response: Promise<APIResponse>): Promise<T> {
  const res = await response;
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()) as T;
}

/** Date et heure murales à Paris. */
function parisParts(instant: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts['year']),
    month: Number(parts['month']),
    day: Number(parts['day']),
    hour: Number(parts['hour']),
    minute: Number(parts['minute']),
  };
}

/** L'instant qui s'affiche `hh:mm` le jour donné à Paris (heure d'été comprise). */
function paris(year: number, month: number, day: number, hours: number, minutes = 0): Date {
  const wall = Date.UTC(year, month - 1, day, hours, minutes);
  let instant = wall;
  for (let i = 0; i < 2; i++) {
    const p = parisParts(new Date(instant));
    instant += wall - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  }
  return new Date(instant);
}

/** Lundi de la semaine courante à Paris. */
function monday(): { year: number; month: number; day: number } {
  const today = parisParts(new Date());
  const noon = new Date(Date.UTC(today.year, today.month - 1, today.day, 12));
  noon.setUTCDate(noon.getUTCDate() - ((noon.getUTCDay() + 6) % 7));
  return { year: noon.getUTCFullYear(), month: noon.getUTCMonth() + 1, day: noon.getUTCDate() };
}

/** Jour de la semaine courante (0 = lundi) à l'heure de Paris donnée. */
function at(weekday: number, hours: number, minutes = 0): Date {
  const { year, month, day } = monday();
  const date = new Date(Date.UTC(year, month - 1, day + weekday, 12));
  return paris(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), hours, minutes);
}

/** `yyyy-MM-dd` du lundi de la semaine courante, pour l'URL et les cellules de FullCalendar. */
function mondayIso(): string {
  const { year, month, day } = monday();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}`;
}

const url = (view: string) => `/ar/agenda?view=${view}&date=${mondayIso()}`;

async function createPatient(displayName: string): Promise<string> {
  return (await ok<{ id: string }>(api.post(`${API}/api/patients`, { data: { displayName } }))).id;
}

async function createAppointment(
  patientId: string,
  startsAt: Date,
  options: { modality?: string; tentative?: boolean; planningNote?: string } = {},
): Promise<void> {
  await ok(
    api.post(`${API}/api/appointments`, {
      data: {
        patientId,
        startsAt: startsAt.toISOString(),
        durationMin: 50,
        modality: options.modality ?? 'in_person',
        tentative: options.tentative ?? false,
        ...(options.planningNote ? { planningNote: options.planningNote } : {}),
      },
    }),
  );
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000);
  api = await playwrightRequest.newContext();
  account = await createAccount(api, 'm16-23.agenda', 'psychologist');
  const claire = await createPatient(LATIN_NAME);
  const ahmed = await createPatient(ARABIC_NAME);
  await createAppointment(claire, at(0, 9));
  await createAppointment(ahmed, at(0, 14), {
    modality: 'video',
    planningNote: 'إحضار دفتر المساء',
  });
  await createAppointment(claire, at(1, 10), { tentative: true });
  await createAppointment(ahmed, at(3, 11), { modality: 'phone' });
  // Contexte créé par le fixture browser : baseURL, locale et fuseau du projet.
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  page = await context.newPage();
  await signIn(page, account);
});

test.afterAll(async () => {
  await context?.close();
  await api?.dispose();
});

/** <html lang="ar" dir="rtl">, aucun défilement horizontal, aucun chiffre arabo-indien, axe-core. */
async function expectRtlPage(): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.evaluate(() => document.fonts.ready);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'défilement horizontal').toBeLessThanOrEqual(0);
  const text = await page.evaluate(() => document.body.innerText);
  expect(text, 'chiffres arabo-indiens').not.toMatch(EASTERN_DIGITS);
  expect(text).toMatch(/\d/);
  await expectNoAxeViolations(page);
}

/** Boîte rendue d'un élément. */
async function boxOf(locator: ReturnType<Page['locator']>) {
  const box = await locator.boundingBox();
  expect(box, 'élément rendu').not.toBeNull();
  return box!;
}

/**
 * Positions rendues, dans une plage horaire « 14:00–14:50 » ou « 14:00 – 14:50 », de l'heure de
 * début, du tiret et de l'heure de fin (rectangles des caractères, pas des attributs).
 */
async function rangeGlyphs(selector: string) {
  return page
    .locator(selector)
    .first()
    .evaluate((element) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      let text: Text | null = null;
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (/\d{2}:\d{2}\s?–\s?\d{2}:\d{2}/.test(node.textContent ?? '')) {
          text = node as Text;
          break;
        }
      }
      if (!text) return null;
      const value = text.textContent ?? '';
      const match = /(\d{2}:\d{2})\s?–\s?(\d{2}:\d{2})/.exec(value)!;
      const left = (from: number, to: number) => {
        range.setStart(text!, from);
        range.setEnd(text!, to);
        return range.getBoundingClientRect().left;
      };
      const start = match.index;
      const dash = value.indexOf('–', start);
      const end = value.indexOf(match[2], dash);
      return { start: left(start, start + 5), dash: left(dash, dash + 1), end: left(end, end + 5) };
    });
}

async function expectRangeLeftToRight(selector: string): Promise<void> {
  const glyphs = await rangeGlyphs(selector);
  expect(glyphs, `plage horaire dans ${selector}`).not.toBeNull();
  expect(glyphs!.start, 'heure de début à gauche du tiret').toBeLessThan(glyphs!.dash);
  expect(glyphs!.dash, 'tiret à gauche de l’heure de fin').toBeLessThan(glyphs!.end);
}

/** Grille lue : les rendez-vous de la semaine sont rendus. */
async function gridReady(selector = 'a.fc-timegrid-event'): Promise<void> {
  await expect(page.locator(`pm-agenda-calendar ${selector}`).first()).toBeVisible();
}

test('semaine : lundi à droite, heures de haut en bas, plages de gauche à droite', async () => {
  await page.goto(url('week'));
  await gridReady();
  await expectRtlPage();

  // Lundi est la première colonne à droite ; dimanche la dernière, à gauche.
  const headers = page.locator('pm-agenda-calendar .fc-col-header-cell[data-date]');
  await expect(headers).toHaveCount(7);
  const xs = await headers.evaluateAll((cells) =>
    cells.map((cell) => ({
      date: cell.getAttribute('data-date'),
      x: cell.getBoundingClientRect().left,
    })),
  );
  const sorted = [...xs].sort((a, b) => b.x - a.x);
  expect(sorted[0].date, 'lundi, première colonne à droite').toBe(mondayIso());
  expect(sorted.map((cell) => cell.date)).toEqual(xs.map((cell) => cell.date));

  // L'axe des heures est à droite de la grille ; les heures se lisent de haut en bas.
  const mondayHeader = await boxOf(headers.first());
  const axis = await boxOf(page.locator('pm-agenda-calendar .fc-timegrid-slot-label').first());
  expect(axis.x).toBeGreaterThan(mondayHeader.x);
  const nine = await boxOf(page.locator('.fc-timegrid-slot-label[data-time="09:00:00"]'));
  const ten = await boxOf(page.locator('.fc-timegrid-slot-label[data-time="10:00:00"]'));
  expect(ten.y).toBeGreaterThan(nine.y);

  // Plage horaire d'un rendez-vous : heure de début à gauche du tiret.
  await expectRangeLeftToRight('pm-agenda-calendar a.fc-timegrid-event .time');

  // Mini-calendrier : même premier jour (lundi à droite), flèche du mois précédent à droite.
  const initials = page.locator('pm-mini-month .weekdays span');
  const first = await boxOf(initials.first());
  const last = await boxOf(initials.last());
  expect(first.x).toBeGreaterThan(last.x);
  const arrows = page.locator('pm-mini-month .arrows button');
  const previous = await boxOf(arrows.first());
  const next = await boxOf(arrows.last());
  expect(previous.x).toBeGreaterThan(next.x);

  // Le rail est à droite de la grille.
  const rail = await boxOf(page.locator('.body .rail'));
  const view = await boxOf(page.locator('.body .view'));
  expect(rail.x).toBeGreaterThan(view.x);

  await shoot(page, 'arabe-agenda-semaine');
});

test('jour', async () => {
  await page.goto(url('day'));
  await gridReady();
  await expectRtlPage();
  await expectRangeLeftToRight('pm-agenda-calendar a.fc-timegrid-event .time');
  await shoot(page, 'arabe-agenda-jour');
});

test('mois : lundi à droite', async () => {
  await page.goto(url('month'));
  await gridReady('a.fc-daygrid-event');
  await expectRtlPage();
  const headers = page.locator('pm-agenda-calendar .fc-col-header-cell');
  await expect(headers).toHaveCount(7);
  const firstHeader = await boxOf(headers.first());
  const lastHeader = await boxOf(headers.last());
  expect(firstHeader.x, 'lundi, première colonne à droite').toBeGreaterThan(lastHeader.x);
  await shoot(page, 'arabe-agenda-mois');
});

test('liste', async () => {
  await page.goto(url('list'));
  await expect(page.locator('pm-agenda-calendar .fc-list-event').first()).toBeVisible();
  await expectRtlPage();
  await expectRangeLeftToRight('pm-agenda-calendar .fc-list-event .list-time');
  // La ligne se lit de droite à gauche : l'heure avant le nom.
  const row = page.locator('pm-agenda-calendar .fc-list-event').first();
  const time = await boxOf(row.locator('.list-time'));
  const name = await boxOf(row.locator('.list-name'));
  expect(time.x).toBeGreaterThan(name.x);
  await shoot(page, 'arabe-agenda-liste');
});

test('détail du rendez-vous : à gauche de la grille, nom et note dans leur sens', async () => {
  await page.goto(url('week'));
  await gridReady();
  await page
    .locator('pm-agenda-calendar a.fc-timegrid-event')
    .filter({ hasText: ARABIC_NAME })
    .first()
    .click();
  const detail = page.locator('pm-appointment-detail');
  await expect(detail.locator('.identity .name')).toBeVisible();
  await expectRtlPage();

  const panel = await boxOf(detail);
  const grid = await boxOf(page.locator('.body .view'));
  expect(panel.x + panel.width).toBeLessThanOrEqual(grid.x + 1);
  // La croix est du côté de fin (à gauche) de l'en-tête.
  const close = await boxOf(detail.locator('.head .close'));
  const kicker = await boxOf(detail.locator('.head .kicker'));
  expect(close.x).toBeLessThan(kicker.x);
  await expectRangeLeftToRight('pm-appointment-detail .when');
  const direction = (selector: string) =>
    detail.locator(selector).evaluate((element) => getComputedStyle(element).direction);
  expect(await direction('.identity .name')).toBe('rtl');
  expect(await direction('textarea')).toBe('rtl');
  await shoot(page, 'arabe-agenda-detail');
});

test('nouveau rendez-vous : panneau à gauche, récurrence, chevauchement de gauche à droite', async () => {
  await page.goto(url('week'));
  await gridReady();
  // Créneau libre du lundi à 16:00 : un clic dans la colonne du lundi.
  const mondayHeader = await boxOf(
    page.locator(`pm-agenda-calendar .fc-col-header-cell[data-date="${mondayIso()}"]`),
  );
  const lane = await boxOf(page.locator('.fc-timegrid-slot-lane[data-time="16:00:00"]'));
  await page.mouse.click(mondayHeader.x + mondayHeader.width / 2, lane.y + lane.height / 2);
  const panel = page.locator('pm-new-appointment-panel');
  await expect(panel.locator('form')).toBeVisible();

  // Patient : la recherche, puis la première option.
  const search = panel.locator('pm-patient-picker input[role="combobox"]');
  await search.fill(LATIN_NAME.slice(0, 4));
  await panel.locator('[role="listbox"] [role="option"]').first().click();
  await expect(panel.locator('pm-patient-picker .patient-card')).toBeVisible();

  // Début à 14:00 : chevauche le rendez-vous du lundi ; répétition toutes les 2 semaines.
  await panel.locator('input.mono[maxlength="5"]').fill('14:00');
  await panel.locator('.repeat select').first().selectOption({ index: 2 });
  await expect(panel.locator('.repeat select')).toHaveCount(2);
  await expect(panel.locator('.warning')).toBeVisible();
  await expectRtlPage();

  const box = await boxOf(panel);
  const viewport = page.viewportSize()!;
  expect(box.x + box.width / 2, 'panneau du côté gauche').toBeLessThan(viewport.width / 2);
  await expectRangeLeftToRight('pm-new-appointment-panel .warning');
  const count = await panel
    .locator('.repeat select')
    .last()
    .evaluate((select) => {
      const option = (select as HTMLSelectElement).selectedOptions[0];
      return option.textContent ?? '';
    });
  expect(count).not.toMatch(EASTERN_DIGITS);
  expect(count).toMatch(/\d/);
  await shoot(page, 'arabe-agenda-nouveau-rendez-vous');
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
});

test('demandes en ligne : panneau à gauche de la grille', async () => {
  await page.goto(url('week'));
  await gridReady();
  await page.locator('.toolbar button.requests').click();
  const requests = page.locator('pm-online-requests');
  await expect(requests.locator('h2')).toBeVisible();
  await expect(requests.locator('pm-state, .req-list').first()).toBeVisible();
  await expectRtlPage();
  const panel = await boxOf(requests);
  const grid = await boxOf(page.locator('.body .view'));
  expect(panel.x + panel.width).toBeLessThanOrEqual(grid.x + 1);
  await shoot(page, 'arabe-agenda-demandes');
});
