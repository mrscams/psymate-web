import { APIRequestContext, APIResponse, expect, Page, Response, test } from '@playwright/test';

import { signIn } from '../preferences/accounts';
import { confirmationToken, TestAccount, uniqueEmail } from '../support/accounts';
import { expectNoAxeViolations } from '../support/axe';
import { shoot } from '../support/captures';

// Fiches 15 et 15b contre l'API réelle (module agenda de psymate-api, contrat 0.14.0, M11) :
// jamais de mock du backend. Chaque test crée son compte jetable, ses patients et ses rendez-vous
// par l'API, à des heures connues de la semaine courante, puis vérifie l'écran et relit l'API
// après chaque écriture. Les appels passent par l'application servie (`baseURL`, proxy /api de
// tools/serve-dist.mjs vers API_URL) : la même API que l'écran, quel que soit son port. Les
// instants sont construits en Europe/Paris, le fuseau du navigateur (playwright.config.ts), quel
// que soit celui du processus Node (UTC en CI).

const ZONE = 'Europe/Paris';

interface Appointment {
  id: string;
  seriesId?: string | null;
  startsAt: string;
  durationMin: number;
  status: string;
  cancelReason?: string | null;
}

async function ok<T>(response: Promise<APIResponse>): Promise<T> {
  const res = await response;
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
  return (res.status() === 204 ? undefined : await res.json()) as T;
}

/**
 * Compte jetable confirmé, session ouverte dans `api` (comme e2e/preferences/accounts.ts, mais par
 * l'application servie : l'API joignable n'est pas forcément sur :8080).
 */
async function createAccount(api: APIRequestContext, prefix: string): Promise<TestAccount> {
  const account = { email: uniqueEmail(prefix), password: 'Fil-Rouge-Clinique-2026' };
  await ok(
    api.post('/api/auth/register', {
      data: {
        email: account.email,
        password: account.password,
        firstName: 'Alix',
        lastName: 'Essai',
        profession: 'psychologist',
        phone: '+33600000097',
        remoteOnly: true,
        consents: { terms: true, privacy: true },
      },
    }),
  );
  const token = await confirmationToken(api, account.email);
  await ok(api.post('/api/auth/email/confirm', { data: { token } }));
  return account;
}

/** Date et heure murales à Paris (année, mois 1–12, jour, jour de semaine 0 = lundi). */
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

/** L'instant qui s'affiche `hh:mm` le jour donné à Paris (décalage lu par Intl, heure d'été comprise). */
function paris(year: number, month: number, day: number, hours: number, minutes = 0): Date {
  const wall = Date.UTC(year, month - 1, day, hours, minutes);
  let instant = wall;
  for (let i = 0; i < 2; i++) {
    const p = parisParts(new Date(instant));
    const shown = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    instant += wall - shown;
  }
  return new Date(instant);
}

/** Lundi de la semaine courante à Paris : année, mois, jour. */
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

/** `yyyy-MM-dd` du jour de la semaine courante (0 = lundi), à Paris, pour l'URL de l'agenda. */
function weekDay(weekday: number): string {
  const p = parisParts(at(weekday, 12));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

const WEEK = () => `/fr/agenda?view=week&date=${weekDay(0)}`;

async function createPatient(
  api: APIRequestContext,
  displayName: string,
  followUp?: Record<string, unknown>,
): Promise<string> {
  const data = followUp ? { displayName, followUp } : { displayName };
  return (await ok<{ id: string }>(api.post('/api/patients', { data }))).id;
}

async function createAppointment(
  api: APIRequestContext,
  patientId: string,
  startsAt: Date,
  options: { durationMin?: number; modality?: string; tentative?: boolean } = {},
): Promise<Appointment> {
  const created = await ok<{ appointments: Appointment[] }>(
    api.post('/api/appointments', {
      data: {
        patientId,
        startsAt: startsAt.toISOString(),
        durationMin: options.durationMin ?? 50,
        modality: options.modality ?? 'in_person',
        tentative: options.tentative ?? false,
      },
    }),
  );
  return created.appointments[0];
}

/** Rendez-vous invité (contrat 0.13.0) : `guest` à la place de `patientId`, posé par l'API. */
async function createGuestAppointment(
  api: APIRequestContext,
  guest: { firstName?: string; lastName: string; phone?: string },
  startsAt: Date,
): Promise<Appointment> {
  const created = await ok<{ appointments: Appointment[] }>(
    api.post('/api/appointments', {
      data: { guest, startsAt: startsAt.toISOString(), durationMin: 50, modality: 'in_person' },
    }),
  );
  return created.appointments[0];
}

function getAppointment(api: APIRequestContext, id: string): Promise<Appointment> {
  return ok<Appointment>(api.get(`/api/appointments/${id}`));
}

function isWrite(method: string, path: RegExp) {
  return (response: Response) =>
    response.request().method() === method && path.test(new URL(response.url()).pathname);
}

function agenda(page: Page) {
  const grid = page.locator('pm-agenda-calendar');
  return {
    grid,
    events: grid.locator('a.fc-timegrid-event:not(.fc-event-mirror)'),
    views: page.getByRole('group', { name: 'Vue' }),
    rail: page.getByRole('complementary', { name: "Navigation de l'agenda" }),
    detail: page.getByRole('complementary', { name: 'Détail du rendez-vous' }),
    meta: page.locator('.toolbar .meta'),
    toast: page.locator('pm-toast-outlet .toast'),
  };
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
});

test('fiche 15 : la semaine montre les rendez-vous créés (nom, heures, modalité) ; le rail filtre ; liste vide quand tout est masqué', async ({
  page,
  request,
}) => {
  const account = await createAccount(request, 'agenda.semaine');
  const alma = await createPatient(request, 'Alma R.');
  const basile = await createPatient(request, 'Basile T.');
  const chloe = await createPatient(request, 'Chloé V.');
  await createAppointment(request, alma, at(0, 9));
  await createAppointment(request, basile, at(1, 11), { modality: 'video' });
  await createAppointment(request, chloe, at(2, 14), { modality: 'phone', durationMin: 30 });
  await signIn(page, account);

  await page
    .locator('pm-nav-rail.app-rail')
    .getByRole('link', { name: 'Agenda', exact: true })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Agenda' })).toBeVisible();
  await page.goto(WEEK());
  const a = agenda(page);
  await expect(a.events).toHaveCount(3);
  await expect(a.meta).toContainText('3 séances');
  await expect(a.grid.getByRole('link', { name: /^Alma R\. · cabinet/ })).toContainText(
    '09:00–09:50',
  );
  await expect(a.grid.getByRole('link', { name: /^Basile T\. · visio/ })).toContainText(
    '11:00–11:50',
  );
  await expect(a.grid.getByRole('link', { name: /^Chloé V\. · téléphone/ })).toContainText(
    '14:00–14:30',
  );
  // Plus d'état de synchronisation ; Google « à venir », sans cases.
  await expect(page.getByText('Google Agenda synchronisé')).toHaveCount(0);
  await expect(a.rail.getByRole('checkbox')).toHaveCount(3);
  await expect(a.rail.getByText('à venir')).toBeVisible();
  await expectNoAxeViolations(page);
  await shoot(page, 'agenda-semaine');

  await a.rail.getByRole('checkbox', { name: 'Séances en visio' }).uncheck();
  await expect(a.events).toHaveCount(2);
  await expect(a.meta).toContainText('2 séances');
  await a.rail.getByRole('checkbox', { name: 'Séances en visio' }).check();
  await expect(a.events).toHaveCount(3);

  await a.views.getByRole('button', { name: 'Liste' }).click();
  await expect(page.locator('pm-agenda-calendar .fc-list-event').first()).toBeVisible();
  for (const box of await a.rail.getByRole('checkbox').all()) await box.uncheck();
  await expect(page.getByText('Aucun rendez-vous dans les 30 prochains jours')).toBeVisible();
  await expectNoAxeViolations(page);
});

test('fiche 15 : détail à droite ; Confirmer un « à confirmer » ; ↓ ↑ ; Échap ; Annuler avec motif', async ({
  page,
  request,
}) => {
  const account = await createAccount(request, 'agenda.detail');
  const dora = await createPatient(request, 'Dora M.');
  const elio = await createPatient(request, 'Elio P.');
  const tentative = await createAppointment(request, dora, at(3, 10), { tentative: true });
  const planned = await createAppointment(request, elio, at(3, 15));
  await signIn(page, account);
  await page.goto(WEEK());
  const a = agenda(page);

  await a.grid.getByRole('link', { name: /^Dora M\. · à confirmer/ }).click();
  await expect(page).toHaveURL(new RegExp(`/fr/agenda/rdv/${tentative.id}\\?`));
  await expect(a.detail.getByText('À confirmer · cabinet')).toBeVisible();
  await expect(a.detail.getByRole('link', { name: 'Dora M.' })).toBeVisible();
  await expect(a.detail.getByRole('heading', { name: 'Préparer' })).toBeVisible();
  await expect(a.detail.getByRole('link', { name: "Vue d'ensemble" })).toBeVisible();
  await expect(
    a.detail.getByRole('button', { name: 'Démarrer la séance · à venir' }),
  ).toHaveAttribute('aria-disabled', 'true');
  await expectNoAxeViolations(page);
  await shoot(page, 'agenda-detail');

  const confirmed = page.waitForResponse(isWrite('POST', /\/confirm$/));
  await a.detail.getByRole('button', { name: 'Confirmer le rendez-vous' }).click();
  expect((await confirmed).status()).toBe(200);
  await expect(a.detail.getByText('Séance planifiée · cabinet')).toBeVisible();
  await expect(a.detail.getByRole('button', { name: 'Confirmer le rendez-vous' })).toHaveCount(0);
  expect((await getAppointment(request, tentative.id)).status).toBe('planned');

  await page.keyboard.press('ArrowDown');
  await expect(page).toHaveURL(new RegExp(`/rdv/${planned.id}\\?`));
  await expect(a.detail.getByRole('link', { name: 'Elio P.' })).toBeVisible();
  await page.keyboard.press('ArrowUp');
  await expect(a.detail.getByRole('link', { name: 'Dora M.' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(a.detail).toHaveCount(0);
  await expect(a.grid.getByRole('link', { name: /^Dora M\./ })).toBeFocused();

  await a.grid.getByRole('link', { name: /^Elio P\./ }).click();
  await a.detail.getByRole('button', { name: 'Annuler', exact: true }).click();
  await a.detail.getByLabel('Motif (facultatif)').fill('empêchement');
  await expectNoAxeViolations(page);
  const cancelled = page.waitForResponse(isWrite('POST', /\/cancel$/));
  await a.detail.getByRole('button', { name: 'Annuler le rendez-vous' }).click();
  expect((await cancelled).status()).toBe(200);
  await expect(a.detail).toHaveCount(0);
  await expect(page.getByText('Rendez-vous annulé.')).toBeVisible();
  await expect(a.events).toHaveCount(1);
  // Le rendez-vous annulé a quitté la grille : le focus va au voisin du même jour.
  await expect(a.grid.getByRole('link', { name: /^Dora M\./ })).toBeFocused();
  const after = await getAppointment(request, planned.id);
  expect(after.status).toBe('cancelled');
  expect(after.cancelReason).toBe('empêchement');
});

test('fiche 15 : glisser un rendez-vous d’une heure → PATCH startsAt ; tirer son bord → durationMin', async ({
  page,
  request,
}) => {
  const account = await createAccount(request, 'agenda.glisser');
  const felix = await createPatient(request, 'Félix G.');
  const appointment = await createAppointment(request, felix, at(1, 9));
  await signIn(page, account);
  await page.goto(WEEK());
  const a = agenda(page);
  const event = a.events.filter({ hasText: 'Félix G.' });
  await expect(event).toContainText('09:00–09:50');

  // Glisser d'une heure vers le bas (52 px), par petits pas : le plugin interaction suit le pointeur.
  const from = (await event.boundingBox())!;
  const moved = page.waitForResponse(isWrite('PATCH', /\/api\/appointments\/[^/]+$/));
  await page.mouse.move(from.x + from.width / 2, from.y + 10);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, from.y + 10 + 52, { steps: 12 });
  await page.mouse.up();
  expect((await moved).status()).toBe(200);
  await expect(page.locator('.fc-event-mirror')).toHaveCount(0);
  await expect(event).toContainText('10:00–10:50');
  let server = await getAppointment(request, appointment.id);
  expect(new Date(server.startsAt).getTime()).toBe(at(1, 10).getTime());
  expect(server.durationMin).toBe(50);

  // Tirer le bord bas de 26 px (une demi-heure) : 80 minutes.
  const box = (await event.boundingBox())!;
  const resized = page.waitForResponse(isWrite('PATCH', /\/api\/appointments\/[^/]+$/));
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 2 + 26, { steps: 8 });
  await page.mouse.up();
  expect((await resized).status()).toBe(200);
  await expect(event).toContainText('10:00–11:20');
  server = await getAppointment(request, appointment.id);
  expect(server.durationMin).toBe(80);
  expect(new Date(server.startsAt).getTime()).toBe(at(1, 10).getTime());
  await expectNoAxeViolations(page);
});

test('fiche 15b : recherche du patient, défauts, chevauchement, toutes les 2 semaines × 3, « Annuler » du toast', async ({
  page,
  request,
}) => {
  const account = await createAccount(request, 'agenda.nouveau');
  await createPatient(request, 'Gaspard L.', {
    rhythm: 'toutes les 2 semaines',
    modality: 'video',
    durationMin: 45,
  });
  const helene = await createPatient(request, 'Hélène B.');
  await createAppointment(request, helene, at(3, 10, 15), { durationMin: 30 });
  await signIn(page, account);
  // « + Rendez-vous » propose 10:00 le jour d'ancrage : jeudi, qui chevauche Hélène B. (10:15).
  await page.goto(`/fr/agenda?view=week&date=${weekDay(3)}`);
  const a = agenda(page);
  await expect(a.events).toHaveCount(1);

  await page.getByRole('button', { name: '+ Rendez-vous' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nouveau rendez-vous' });
  await expect(dialog).toBeVisible();
  const search = dialog.getByRole('combobox', { name: 'Patient' });
  await expect(search).toBeFocused();
  await search.fill('Gasp');
  await expect(dialog.getByRole('option', { name: /Gaspard L\./ })).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(dialog.locator('.patient-card')).toContainText('Gaspard L.');
  await expect(dialog.locator('.patient-card')).toContainText('rythme toutes les 2 semaines');
  // Défauts du patient : 45 min en visio.
  await expect(dialog.getByLabel('Durée').locator('option:checked')).toHaveText('45 min');
  await expect(dialog.getByRole('button', { name: 'Visio' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(dialog.getByText(/Chevauche le rendez-vous de Hélène B\./)).toBeVisible();

  await dialog.getByLabel('Répéter').selectOption({ label: 'Toutes les 2 semaines' });
  await dialog.getByLabel('Nombre de répétitions').selectOption({ value: '3' });
  await expect(dialog.getByRole('button', { name: 'Planifier 3 rendez-vous' })).toBeVisible();
  await expectNoAxeViolations(page);
  await shoot(page, 'agenda-nouveau-rendez-vous');

  const posted = page.waitForResponse(isWrite('POST', /^\/api\/appointments$/));
  await page.getByRole('button', { name: 'Planifier 3 rendez-vous' }).click();
  const response = await posted;
  expect(response.status()).toBe(201);
  const created = (await response.json()) as { appointments: Appointment[] };
  expect(created.appointments).toHaveLength(3);
  const seriesId = created.appointments[0].seriesId!;
  expect(seriesId).toBeTruthy();
  expect(response.request().postDataJSON()).toMatchObject({
    durationMin: 45,
    modality: 'video',
    recurrence: { everyWeeks: 2, count: 3 },
  });

  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/fr/agenda/rdv/${created.appointments[0].id}\\?`));
  await expect(a.detail.getByRole('link', { name: 'Gaspard L.' })).toBeVisible();
  await expect(a.events).toHaveCount(2);
  const toast = a.toast.filter({ hasText: '3 rendez-vous planifiés, 1 chevauchement' });
  await expect(toast).toBeVisible();

  // « Annuler » du toast d'abord (il ne dure que 10 s), puis la liste des 30 jours (J, J + 14,
  // J + 28) ne montre plus aucune occurrence ; le GET dit les trois annulées.
  const cancelled = page.waitForResponse(isWrite('POST', /\/series\/[^/]+\/cancel$/));
  await toast.getByRole('button', { name: 'Annuler' }).click();
  expect((await cancelled).status()).toBe(200);
  await expect(a.events).toHaveCount(1);
  await a.views.getByRole('button', { name: 'Liste' }).click();
  await expect(page.locator('.fc-list-event').filter({ hasText: 'Hélène B.' })).toHaveCount(1);
  await expect(page.locator('.fc-list-event').filter({ hasText: 'Gaspard L.' })).toHaveCount(0);
  for (const item of created.appointments) {
    expect((await getAppointment(request, item.id)).status).toBe('cancelled');
  }
  await expectNoAxeViolations(page);
});

test('rendez-vous invité (contrat 0.13.0) : nom dans la grille, la liste et le détail, sans dossier ; déplacer puis annuler', async ({
  page,
  request,
}) => {
  const account = await createAccount(request, 'agenda.invite');
  const guest = await createGuestAppointment(
    request,
    { firstName: 'Sara', lastName: 'Benali', phone: '+33 6 12 34 56 78' },
    at(2, 9),
  );
  await signIn(page, account);
  await page.goto(WEEK());
  const a = agenda(page);
  await expect(a.events).toHaveCount(1);
  const event = a.grid.getByRole('link', { name: /^Sara Benali/ });
  await expect(event).toContainText('09:00–09:50');

  await event.click();
  await expect(page).toHaveURL(new RegExp(`/fr/agenda/rdv/${guest.id}\\?`));
  await expect(a.detail.getByText('Sara Benali', { exact: true })).toBeVisible();
  // Téléphone de l'invité tel que l'API le rend, après « invité ».
  await expect(a.detail.locator('.meta')).toHaveText(/^invité · .*12/);
  await expect(a.detail.getByRole('link', { name: 'Sara Benali' })).toHaveCount(0);
  await expect(a.detail.locator('a[href*="/patients/"]')).toHaveCount(0);
  await expect(a.detail.getByRole('heading', { name: 'Préparer' })).toHaveCount(0);
  await expectNoAxeViolations(page);
  await shoot(page, 'agenda-detail-invite');

  // Déplacer par le formulaire du détail : même PATCH que pour un patient.
  await a.detail.getByRole('button', { name: 'Déplacer', exact: true }).click();
  const form = a.detail.locator('form');
  await form.getByLabel('Début').fill('11:00');
  const moved = page.waitForResponse(isWrite('PATCH', /\/api\/appointments\/[^/]+$/));
  await form.getByRole('button', { name: 'Déplacer', exact: true }).click();
  expect((await moved).status()).toBe(200);
  await expect(event).toContainText('11:00–11:50');
  expect(new Date((await getAppointment(request, guest.id)).startsAt).getTime()).toBe(
    at(2, 11).getTime(),
  );

  await a.views.getByRole('button', { name: 'Liste' }).click();
  await expect(page.locator('.fc-list-event').filter({ hasText: 'Sara Benali' })).toHaveCount(1);
  await expectNoAxeViolations(page);

  await a.views.getByRole('button', { name: 'Semaine' }).click();
  await a.grid.getByRole('link', { name: /^Sara Benali/ }).click();
  await a.detail.getByRole('button', { name: 'Annuler', exact: true }).click();
  const cancelled = page.waitForResponse(isWrite('POST', /\/cancel$/));
  await a.detail.getByRole('button', { name: 'Annuler le rendez-vous' }).click();
  expect((await cancelled).status()).toBe(200);
  await expect(a.events).toHaveCount(0);
  expect((await getAppointment(request, guest.id)).status).toBe('cancelled');
});

test('préférences agenda.* : la grille commence à agenda.dayStartHour ; /agenda ouvre agenda.defaultView', async ({
  page,
  request,
}) => {
  const account = await createAccount(request, 'agenda.prefs');
  await ok(
    request.patch('/api/me/preferences', {
      data: { 'agenda.dayStartHour': 10, 'agenda.defaultView': 'list' },
    }),
  );
  await signIn(page, account);

  await page.goto('/fr/agenda');
  const a = agenda(page);
  await expect(a.views.getByRole('button', { name: 'Liste' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(a.meta).toContainText('30 prochains jours');

  await a.views.getByRole('button', { name: 'Semaine' }).click();
  await expect(page).toHaveURL(/view=week/);
  await expect(
    page.locator('pm-agenda-calendar .fc-timegrid-slot-label-cushion').first(),
  ).toHaveText('10:00');
  await expectNoAxeViolations(page);
});
