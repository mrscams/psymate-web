import {
  APIRequestContext,
  expect,
  Page,
  request as playwrightRequest,
  Response,
  test,
} from '@playwright/test';

import { signIn } from '../preferences/accounts';
import { SEED } from '../support/accounts';
import { expectNoAxeViolations } from '../support/axe';
import { shoot } from '../support/captures';
import { keyboardOnly, tabTo } from '../support/clavier';
import { API } from '../support/env';

// Fiche 15, « Rattacher un invité à un patient » (M14-15, K3.2 étape 5), contre l'API réelle et le
// seed small : jamais de mock du backend. Le compte claire et un de ses patients du seed servent de
// cible. Chaque test crée ses propres rendez-vous invités par la session du praticien
// (`POST /api/appointments` avec `guest`, jamais par les routes publiques de prise de rendez-vous),
// sous un nom d'invité unique par passage, sur des créneaux à plus de sept semaines (hors de
// l'horizon des demandes en ligne) ; il ne touche à aucune demande du seed ni des autres fichiers,
// et annule à la fin tout ce qu'il a créé, rattaché ou non.

const ZONE = 'Europe/Paris';

interface Appointment {
  id: string;
  startsAt: string;
  status: string;
  patient: { id: string; displayName: string } | null;
  guest: { firstName: string | null; lastName: string | null; phone: string | null } | null;
}

interface Patient {
  id: string;
  displayName: string;
}

/** `yyyy-MM-dd` à Paris. */
function parisDay(instant: Date | string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(instant));
}

/** Un mardi à 10:00 (UTC, donc 11:00 ou 12:00 à Paris), `weeks` semaines après celle-ci. */
function slot(weeks: number, minutes = 0): Date {
  const date = new Date();
  date.setUTCHours(10, minutes, 0, 0);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 5) % 7) + 7 * weeks);
  return date;
}

/** Nom d'invité unique par passage : les rendez-vous de ce fichier se reconnaissent ainsi. */
function uniqueName(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

async function claireApi(): Promise<APIRequestContext> {
  const api = await playwrightRequest.newContext({ baseURL: API });
  const login = await api.post('/api/auth/login', { data: SEED.claire });
  expect(login.status(), await login.text()).toBe(200);
  return api;
}

/** Patient actif du seed de claire : Sasha V. s'il existe, sinon le premier. */
async function seedPatient(api: APIRequestContext): Promise<Patient> {
  const res = await api.get('/api/patients', {
    params: { archived: 'false', sort: 'name', size: '50' },
  });
  expect(res.status(), await res.text()).toBe(200);
  const items = ((await res.json()) as { items: Patient[] }).items;
  const patient = items.find((item) => item.displayName.includes('Sasha')) ?? items[0];
  expect(patient, 'le seed de claire doit avoir un patient actif').toBeTruthy();
  return patient;
}

async function createGuest(
  api: APIRequestContext,
  guest: { firstName: string; lastName: string; phone: string },
  startsAt: Date,
): Promise<Appointment> {
  const res = await api.post('/api/appointments', {
    data: { guest, startsAt: startsAt.toISOString(), durationMin: 50, modality: 'in_person' },
  });
  expect(res.status(), await res.text()).toBe(201);
  return ((await res.json()) as { appointments: Appointment[] }).appointments[0];
}

async function getAppointment(api: APIRequestContext, id: string): Promise<Appointment> {
  const res = await api.get(`/api/appointments/${id}`);
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()) as Appointment;
}

/** Remise en état : chaque rendez-vous créé est annulé (idempotent). */
async function cancelAll(api: APIRequestContext, ids: readonly string[]): Promise<void> {
  // Chaque annulation est tentée, même si une précédente échoue ; les échecs sont signalés à la fin.
  const failures: string[] = [];
  for (const id of ids) {
    try {
      const res = await api.post(`/api/appointments/${id}/cancel`, { data: {} });
      if (![200, 404].includes(res.status())) {
        failures.push(`${id} → ${res.status()} ${await res.text()}`);
      }
    } catch (error) {
      failures.push(`${id} → ${String(error)}`);
    }
  }
  expect(failures, 'annulations de remise en état en échec').toEqual([]);
}

function isAttach(id: string) {
  return (response: Response) =>
    response.request().method() === 'POST' &&
    new URL(response.url()).pathname === `/api/appointments/${id}/attach-patient`;
}

/** Les lectures et écritures de l'agenda vues par la page, dans l'ordre. */
function recordTraffic(page: Page): string[] {
  const seen: string[] = [];
  page.on('response', (response) => {
    const { pathname } = new URL(response.url());
    const method = response.request().method();
    if (method === 'GET' && pathname === '/api/agenda') seen.push('window');
    else if (method === 'GET' && pathname === '/api/agenda/requests') seen.push('requests');
    else if (method === 'POST' && pathname.endsWith('/attach-patient')) seen.push('attach');
  });
  return seen;
}

function screen(page: Page) {
  const detail = page.getByRole('complementary', { name: 'Détail du rendez-vous' });
  const form = detail.locator('form.inline');
  return {
    detail,
    form,
    action: detail.getByRole('button', { name: 'Rattacher à un patient' }),
    search: detail.getByRole('combobox', { name: 'Patient' }),
    sameGuest: detail.getByRole('checkbox', {
      name: 'Rattacher aussi les autres rendez-vous de cette personne',
    }),
    submit: form.getByRole('button', { name: 'Rattacher', exact: true }),
    toast: page.locator('pm-toast-outlet .toast'),
  };
}

const detailUrl = (item: Appointment) =>
  `/fr/agenda/rdv/${item.id}?view=week&date=${parisDay(item.startsAt)}`;

async function darkTheme(page: Page, on: boolean): Promise<void> {
  // Le compte du seed garde sa préférence `theme` (aucune écriture) : le thème sombre est posé sur
  // <html> comme le fait le service de thème, le temps de l'analyse.
  await page.evaluate(
    (dark) => document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light'),
    on,
  );
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
});

test('fiche 15 (M14-15) : rattacher un invité à un patient au clavier → POST attach-patient lu, relecture de la plage et des demandes, toast, le détail montre le patient et son lien ; le rendez-vous est dans ceux du patient', async ({
  page,
}) => {
  const api = await claireApi();
  const created: string[] = [];
  try {
    const patient = await seedPatient(api);
    const lastName = uniqueName('Rattache');
    const guest = await createGuest(
      api,
      { firstName: 'Léon', lastName, phone: '+33 6 55 44 33 22' },
      slot(8 + Math.floor(Math.random() * 3), 5 * Math.floor(Math.random() * 6)),
    );
    created.push(guest.id);

    await signIn(page, SEED.claire);
    const keyboard = await keyboardOnly(page);
    const s = screen(page);
    const traffic = recordTraffic(page);
    await page.goto(detailUrl(guest));
    await expect(s.detail.getByText(`Léon ${lastName}`, { exact: true })).toBeVisible();
    await expect(s.detail.getByRole('button', { name: 'Dupliquer' })).toHaveCount(0);

    // Ouvrir au clavier : le focus va dans la recherche ; Échap referme et rend le focus à l'action.
    // Depuis le haut de la page : barre d’outils, rail, grille, puis le détail.
    await tabTo(page, s.action, { max: 250 });
    await expect(s.action).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('Enter');
    await expect(s.search).toBeFocused();
    await expect(s.action).toHaveAttribute('aria-expanded', 'true');
    await expect(s.sameGuest).not.toBeChecked();
    await page.keyboard.press('Escape');
    await expect(s.form).toHaveCount(0);
    await expect(s.action).toBeFocused();
    await expect(s.detail).toBeVisible();

    // Rouvrir, chercher le patient, le choisir (↓, Entrée) : sa carte apparaît.
    await page.keyboard.press('Enter');
    await expect(s.search).toBeFocused();
    await page.keyboard.type(patient.displayName.replace(/^SEED · /, '').slice(0, 5));
    const option = s.detail.getByRole('option', { name: new RegExp(patient.displayName) });
    await expect(option).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await expect(s.search).toHaveAttribute('aria-activedescendant', /.+/);
    await page.keyboard.press('Enter');
    await expect(s.form.locator('.patient-card')).toContainText(patient.displayName);
    await expect(s.form.getByRole('button', { name: 'Changer' })).toBeVisible();
    // Invité posé par le praticien : aucune phrase sur les e-mails au demandeur.
    await expect(s.form.locator('.hint')).toHaveCount(0);

    await expectNoAxeViolations(page);
    await shoot(page, 'm14-15-1-rattacher');
    await darkTheme(page, true);
    await expectNoAxeViolations(page);
    await shoot(page, 'm14-15-1-rattacher-sombre');
    await darkTheme(page, false);

    // Rattacher, au clavier.
    await tabTo(page, s.submit);
    const posted = page.waitForResponse(isAttach(guest.id));
    await page.keyboard.press('Enter');
    const response = await posted;
    expect(response.status()).toBe(200);
    expect(response.request().postDataJSON()).toEqual({
      patientId: patient.id,
      includeSameGuest: false,
    });
    const attached = ((await response.json()) as { appointments: Appointment[] }).appointments;
    expect(attached.map((item) => item.id)).toEqual([guest.id]);
    expect(attached[0].patient?.id).toBe(patient.id);
    await expect(
      s.toast.filter({ hasText: `Rendez-vous rattaché : ${patient.displayName}` }),
    ).toBeVisible();

    // Relecture : la plage et les demandes sont relues après l'écriture, rien n'est corrigé ici.
    await expect
      .poll(() => traffic.slice(traffic.indexOf('attach')))
      .toEqual(expect.arrayContaining(['attach', 'window', 'requests']));

    // Le détail montre le patient, avec le lien vers son dossier, qui a le focus.
    const link = s.detail.getByRole('link', { name: patient.displayName });
    await expect(link).toHaveAttribute('href', `/fr/patients/${patient.id}`);
    await expect(link).toBeFocused();
    await expect(s.form).toHaveCount(0);
    await expect(s.action).toHaveCount(0);
    await expect(s.detail.getByText(`Léon ${lastName}`)).toHaveCount(0);
    keyboard.expectNoPointer();

    // Côté API : le rendez-vous vise le patient, et il est dans les rendez-vous du patient.
    const reread = await getAppointment(api, guest.id);
    expect(reread.patient?.id).toBe(patient.id);
    expect(reread.guest).toBeNull();
    // Lus à partir du début du rendez-vous : le patient du seed en a d'autres avant lui.
    const ofPatient = await api.get(`/api/patients/${patient.id}/appointments`, {
      params: { from: guest.startsAt, limit: '100' },
    });
    expect(ofPatient.status(), await ofPatient.text()).toBe(200);
    const upcoming = ((await ofPatient.json()) as { appointments: Appointment[] }).appointments;
    expect(upcoming.map((item) => item.id)).toContain(guest.id);

    await expectNoAxeViolations(page);
    await shoot(page, 'm14-15-2-rattache');
  } finally {
    await cancelAll(api, created);
    await api.dispose();
  }
});

test('fiche 15 (M14-15) : avec la case cochée, les autres rendez-vous du même invité sont rattachés, pas celui d’un autre invité ; un rendez-vous de patient n’a pas l’action', async ({
  page,
}) => {
  const api = await claireApi();
  const created: string[] = [];
  try {
    const patient = await seedPatient(api);
    const weeks = 8 + Math.floor(Math.random() * 3);
    const lastName = uniqueName('Meme');
    const same = { firstName: 'Nour', lastName, phone: '+33 6 10 20 30 40' };
    const first = await createGuest(api, same, slot(weeks));
    created.push(first.id);
    const second = await createGuest(api, same, slot(weeks + 1));
    created.push(second.id);
    const other = await createGuest(
      api,
      { firstName: 'Nour', lastName: uniqueName('Autre'), phone: '+33 6 10 20 30 40' },
      slot(weeks + 2),
    );
    created.push(other.id);

    await signIn(page, SEED.claire);
    const s = screen(page);
    await page.goto(detailUrl(first));
    await s.action.click();
    await expect(s.search).toBeFocused();
    await s.search.fill(patient.displayName.replace(/^SEED · /, '').slice(0, 5));
    await s.detail.getByRole('option', { name: new RegExp(patient.displayName) }).click();
    await expect(s.form.locator('.patient-card')).toContainText(patient.displayName);
    await s.sameGuest.check();
    await expect(s.sameGuest).toBeChecked();

    await page.setViewportSize({ width: 390, height: 900 });
    await s.form.scrollIntoViewIfNeeded();
    await expectNoAxeViolations(page);
    await shoot(page, 'm14-15-3-rattacher-390', false);
    await darkTheme(page, true);
    await shoot(page, 'm14-15-3-rattacher-390-sombre', false);
    await darkTheme(page, false);
    await page.setViewportSize({ width: 1440, height: 1000 });

    const posted = page.waitForResponse(isAttach(first.id));
    await s.submit.click();
    const response = await posted;
    expect(response.status()).toBe(200);
    expect(response.request().postDataJSON()).toEqual({
      patientId: patient.id,
      includeSameGuest: true,
    });
    const attached = ((await response.json()) as { appointments: Appointment[] }).appointments;
    expect(attached.map((item) => item.id).sort()).toEqual([first.id, second.id].sort());
    await expect(
      s.toast.filter({ hasText: `2 rendez-vous rattachés : ${patient.displayName}` }),
    ).toBeVisible();
    await expect(s.detail.getByRole('link', { name: patient.displayName })).toBeVisible();

    expect((await getAppointment(api, first.id)).patient?.id).toBe(patient.id);
    expect((await getAppointment(api, second.id)).patient?.id).toBe(patient.id);
    const untouched = await getAppointment(api, other.id);
    expect(untouched.patient).toBeNull();
    expect(untouched.guest?.lastName).toBe(other.guest?.lastName);

    // Le second rendez-vous, désormais d'un patient : plus d'action « Rattacher », « Dupliquer » revient.
    await page.goto(detailUrl(second));
    await expect(s.detail.getByRole('link', { name: patient.displayName })).toBeVisible();
    await expect(s.action).toHaveCount(0);
    await expect(s.detail.getByRole('button', { name: 'Dupliquer' })).toBeVisible();
    // L'autre invité garde l'action.
    await page.goto(detailUrl(other));
    await expect(s.action).toBeVisible();
    await expectNoAxeViolations(page);
  } finally {
    await cancelAll(api, created);
    await api.dispose();
  }
});
