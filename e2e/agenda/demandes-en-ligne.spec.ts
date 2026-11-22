import {
  APIRequestContext,
  expect,
  Locator,
  Page,
  request as playwrightRequest,
  Response,
  test,
} from '@playwright/test';

import { signIn } from '../preferences/accounts';
import { SEED, uniqueEmail } from '../support/accounts';
import { expectNoAxeViolations } from '../support/axe';
import { shoot } from '../support/captures';
import { keyboardOnly } from '../support/clavier';
import { API, MAILPIT } from '../support/env';

// Fiche 15, « Demandes en ligne » (M14-14, G Q65), contre l'API réelle et le seed small : jamais de
// mock du backend. Le compte claire (fiche claire-martin, mode manuel) a des demandes en ligne en
// attente : les tests agissent sur elles. Une demande n'est créée par le parcours public (POST de
// la demande, lien lu dans Mailpit, vérification) que s'il n'en reste aucune en attente : rejeu
// local, second essai. L'API plafonne ces créations par IP, et la CI n'en a aucune pour ce fichier.
//
// D'autres tests créent des demandes chez claire pendant que ceux-ci tournent : aucun nombre absolu.
// Le compteur est comparé à la réponse de GET /api/agenda/requests captée sur la même page, et une
// baisse se lit sur la demande traitée (présente avant l'action, absente de la relecture).
//
// Le fichier tourne en série : la confirmation et le refus prennent chacun une demande différente.

test.describe.configure({ mode: 'serial', timeout: 120_000 });

const ZONE = 'Europe/Paris';
const SLUG = 'claire-martin';
const DAY_MS = 86_400_000;

interface Guest {
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
}

interface Appointment {
  id: string;
  startsAt: string;
  endsAt: string;
  modality: 'in_person' | 'video' | 'phone';
  status: string;
  origin: 'practitioner' | 'online';
  guest: Guest | null;
  cancelReason?: string | null;
}

const MODALITY: Record<Appointment['modality'], string> = {
  in_person: 'Cabinet',
  video: 'Visio',
  phone: 'Téléphone',
};

// --- Dates (fuseau du navigateur des e2e : Europe/Paris) ----------------------------------------

/** `yyyy-MM-dd` à Paris. */
function parisDay(instant: Date | string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(instant));
}

/** Le lundi (`yyyy-MM-dd`) de la semaine du jour donné, décalé de `weeks` semaines. */
function mondayOf(day: string, weeks = 0): string {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7) + 7 * weeks);
  return date.toISOString().slice(0, 10);
}

function hhmm(instant: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(instant));
}

/** « mer. 25 nov. · 15:00–16:00 » : première ligne d'une demande dans le panneau. */
function whenOf(item: Appointment): string {
  const date = new Intl.DateTimeFormat('fr-FR', {
    timeZone: ZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(item.startsAt));
  return `${date} · ${hhmm(item.startsAt)}–${hhmm(item.endsAt)}`;
}

function guestName(item: Appointment): string {
  return [item.guest?.firstName, item.guest?.lastName].filter(Boolean).join(' ');
}

/** « Sara Benali · Cabinet » : seconde ligne d'une demande dans le panneau. */
function whoOf(item: Appointment): string {
  return `${guestName(item)} · ${MODALITY[item.modality]}`;
}

const weekUrl = (day: string) => `/fr/agenda?view=week&date=${day}`;

// --- API --------------------------------------------------------------------------------------

async function claireApi(): Promise<APIRequestContext> {
  const api = await playwrightRequest.newContext({ baseURL: API });
  const login = await api.post('/api/auth/login', { data: SEED.claire });
  expect(login.status(), await login.text()).toBe(200);
  return api;
}

async function pendingRequests(api: APIRequestContext): Promise<Appointment[]> {
  const res = await api.get('/api/agenda/requests');
  expect(res.status(), await res.text()).toBe(200);
  return ((await res.json()) as { appointments: Appointment[] }).appointments;
}

async function getAppointment(api: APIRequestContext, id: string): Promise<Appointment> {
  const res = await api.get(`/api/appointments/${id}`);
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()) as Appointment;
}

/**
 * Une demande en attente, autre que celles d'`exclude` : celle du seed si elle reste, sinon une
 * demande créée par le parcours public (rejeu local, second essai).
 */
async function pendingRequest(
  api: APIRequestContext,
  exclude: readonly string[] = [],
): Promise<Appointment> {
  const left = (await pendingRequests(api)).filter((item) => !exclude.includes(item.id));
  const withPhone = left.find((item) => item.guest?.phone);
  return withPhone ?? left[0] ?? (await createOnlineRequest(api));
}

/** Jeton du lien de vérification reçu par `email` dans Mailpit (attend jusqu'à 15 s). */
async function verificationToken(email: string): Promise<string> {
  const mail = await playwrightRequest.newContext();
  try {
    for (let attempt = 0; attempt < 30; attempt++) {
      const search = await mail.get(`${MAILPIT}/api/v1/search`, {
        params: { query: `to:${email}` },
      });
      const messages = ((await search.json()) as { messages?: { ID: string }[] }).messages ?? [];
      for (const message of messages) {
        const full = await mail.get(`${MAILPIT}/api/v1/message/${message.ID}`);
        const text = ((await full.json()) as { Text?: string }).Text ?? '';
        const match = /rendez-vous\/confirmer\/([A-Za-z0-9_-]+)/.exec(text);
        if (match) return match[1];
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  } finally {
    await mail.dispose();
  }
  throw new Error(`aucun e-mail de vérification pour ${email} dans Mailpit`);
}

/**
 * Parcours public (fiche 31) par l'API : un créneau offert, la demande (3 s après `formShownAt`,
 * comme un visiteur), le lien lu dans Mailpit, la vérification. Mode manuel : la demande arrive « à
 * confirmer » chez claire. Seulement quand le seed n'a plus de demande en attente.
 */
async function createOnlineRequest(api: APIRequestContext): Promise<Appointment> {
  const visitor = await playwrightRequest.newContext({ baseURL: API });
  try {
    const booking = (await (
      await visitor.get(`/api/public/booking/practitioners/${SLUG}`)
    ).json()) as { modalities: string[] };
    const slotsRes = await visitor.get(`/api/public/booking/practitioners/${SLUG}/slots`, {
      params: {
        from: parisDay(new Date()),
        to: parisDay(new Date(Date.now() + 27 * DAY_MS)),
      },
    });
    expect(slotsRes.status(), await slotsRes.text()).toBe(200);
    const slots = ((await slotsRes.json()) as { slots: { startsAt: string }[] }).slots;
    // Un créneau au hasard : deux rejeux simultanés ne visent pas le même.
    const shuffled = [...slots].sort(() => Math.random() - 0.5).slice(0, 3);
    for (const slot of shuffled) {
      const email = uniqueEmail('m14-14.demande');
      const formShownAt = new Date().toISOString();
      await new Promise((resolve) => setTimeout(resolve, 3_100));
      const sent = await visitor.post(`/api/public/booking/practitioners/${SLUG}/requests`, {
        data: {
          startsAt: slot.startsAt,
          modality: booking.modalities[0],
          firstName: 'Lina',
          lastName: 'Rivière',
          email,
          phone: '+33 6 11 22 33 44',
          locale: 'fr',
          consent: true,
          website: '',
          formShownAt,
        },
      });
      if (sent.status() === 409) continue;
      expect(sent.status(), `création de demande : ${await sent.text()}`).toBe(202);
      const token = await verificationToken(email);
      const verified = await visitor.post('/api/public/booking/requests/verify', {
        data: { token },
      });
      if (verified.status() === 409) continue;
      expect(verified.status(), await verified.text()).toBe(200);
      const created = (await pendingRequests(api)).find((item) => item.guest?.email === email);
      expect(created, `la demande de ${email} n'est pas en attente`).toBeTruthy();
      return created!;
    }
    throw new Error('aucun créneau libre pour créer une demande');
  } finally {
    await visitor.dispose();
  }
}

// --- Écran ------------------------------------------------------------------------------------

function isRequests(response: Response): boolean {
  return (
    response.request().method() === 'GET' &&
    new URL(response.url()).pathname === '/api/agenda/requests'
  );
}

function isWindow(response: Response): boolean {
  return (
    response.request().method() === 'GET' && new URL(response.url()).pathname === '/api/agenda'
  );
}

function isPost(path: RegExp) {
  return (response: Response) =>
    response.request().method() === 'POST' && path.test(new URL(response.url()).pathname);
}

async function listOf(response: Response): Promise<Appointment[]> {
  expect(response.status()).toBe(200);
  return ((await response.json()) as { appointments: Appointment[] }).appointments;
}

/** Les réponses de GET /api/agenda/requests reçues par la page, dans l'ordre. */
function recordRequests(page: Page): Promise<Appointment[]>[] {
  const seen: Promise<Appointment[]>[] = [];
  page.on('response', (response) => {
    if (isRequests(response)) seen.push(listOf(response));
  });
  return seen;
}

function screen(page: Page) {
  const grid = page.locator('pm-agenda-calendar');
  return {
    grid,
    requestsButton: page.locator('.toolbar').getByRole('button', { name: /^Demandes en ligne/ }),
    panel: page.getByRole('complementary', { name: 'Demandes en ligne' }),
    detail: page.getByRole('complementary', { name: 'Détail du rendez-vous' }),
    rail: page.getByRole('complementary', { name: "Navigation de l'agenda" }),
    views: page.getByRole('group', { name: 'Vue' }),
    toast: page.locator('pm-toast-outlet .toast'),
    event: (id: string) => grid.locator(`a.fc-timegrid-event[href*="/rdv/${id}"]`),
    row: (item: Appointment) =>
      page
        .getByRole('complementary', { name: 'Demandes en ligne' })
        .getByRole('button')
        .filter({ hasText: whoOf(item) })
        .filter({ hasText: `${hhmm(item.startsAt)}–${hhmm(item.endsAt)}` }),
  };
}

/** Nom accessible de l'entrée « Demandes » pour une liste reçue de l'API. */
function requestsName(list: readonly Appointment[]): string {
  return list.length === 0
    ? 'Demandes en ligne, aucune en attente'
    : `Demandes en ligne, ${list.length} en attente`;
}

/** L'entrée « Demandes » dit le compteur de cette réponse : nom accessible et pastille. */
async function expectCounter(button: Locator, list: readonly Appointment[]): Promise<void> {
  await expect(button).toHaveAccessibleName(requestsName(list));
  if (list.length === 0) await expect(button.locator('.count')).toHaveCount(0);
  else await expect(button.locator('.count')).toHaveText(String(list.length));
}

/** Tab jusqu'à `target` (parcours au clavier, sans souris). */
async function tabTo(page: Page, target: Locator, max = 80): Promise<void> {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) return;
    await page.keyboard.press('Tab');
  }
  await expect(target).toBeFocused();
}

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

test('fiche 15 : « Demandes » affiche le compteur de l’API ; le panneau liste les demandes dans son ordre ; une demande hors de la semaine ouvre son détail ; mention en grille, liste, mois et légende', async ({
  page,
}) => {
  const api = await claireApi();
  try {
    const target = await pendingRequest(api);
    await signIn(page, SEED.claire);
    const s = screen(page);

    // Une semaine passée : toutes les demandes (à venir) sont hors de la semaine affichée.
    const shown = page.waitForResponse(isRequests);
    await page.goto(weekUrl(mondayOf(parisDay(new Date()), -1)));
    const list = await listOf(await shown);
    expect(list.map((item) => item.id)).toContain(target.id);
    await expectCounter(s.requestsButton, list);
    await expect(s.requestsButton).toHaveAttribute('aria-expanded', 'false');
    await expect(s.rail.getByRole('list', { name: 'Légende' })).toContainText('Demande en ligne');
    await shoot(page, 'm14-14-1-semaine');

    await s.requestsButton.click();
    await expect(s.panel).toBeVisible();
    await expect(s.requestsButton).toHaveAttribute('aria-expanded', 'true');
    await expect(s.panel.getByRole('heading', { name: 'Demandes en ligne' })).toBeFocused();
    await expect(s.panel.getByRole('status')).toHaveText(
      list.length === 1
        ? '1 demande attend votre réponse.'
        : `${list.length} demandes attendent votre réponse.`,
    );
    const rows = s.panel.getByRole('listitem').getByRole('button');
    await expect(rows).toHaveCount(list.length);
    await expect(rows.locator('.who')).toHaveText(list.map(whoOf));
    await expect(rows.locator('.when')).toHaveText(list.map(whenOf));
    await expectNoAxeViolations(page);
    await shoot(page, 'm14-14-2-panneau');

    // Choisir la demande : la grille va à sa date, son détail remplace le panneau.
    await s.row(target).click();
    await expect(page).toHaveURL(
      new RegExp(`/fr/agenda/rdv/${target.id}\\?view=week&date=${parisDay(target.startsAt)}$`),
    );
    await expect(s.panel).toHaveCount(0);
    await expect(s.detail).toBeFocused();
    await expect(s.detail.locator('.kicker')).toHaveText(/^À confirmer ·/);
    await expect(s.detail.locator('.online')).toHaveText('Demande en ligne');
    await expect(s.detail.getByText(guestName(target), { exact: true })).toBeVisible();
    await expect(s.detail.getByRole('link', { name: target.guest!.email! })).toHaveAttribute(
      'href',
      `mailto:${target.guest!.email}`,
    );
    if (target.guest?.phone) {
      await expect(s.detail.getByRole('link', { name: target.guest.phone })).toHaveAttribute(
        'href',
        /^tel:\+?\d+$/,
      );
    }
    await expect(s.detail.getByRole('button', { name: 'Confirmer le rendez-vous' })).toBeVisible();
    await expect(s.detail.getByRole('button', { name: 'Refuser', exact: true })).toBeVisible();
    await expect(s.detail.getByRole('button', { name: 'Annuler', exact: true })).toHaveCount(0);

    // Grille : pointillé (à confirmer) et mention dans le nom du lien, globe seul en colonne étroite.
    const event = s.event(target.id);
    await expect(event).toHaveClass(/\btentative\b/);
    await expect(event).toHaveAccessibleName(/Demande en ligne/);
    await expect(event.locator('svg.globe')).toBeVisible();
    await expectNoAxeViolations(page);
    await shoot(page, 'm14-14-3-detail');
    await darkTheme(page, true);
    await expectNoAxeViolations(page);
    await shoot(page, 'm14-14-3-detail-sombre');
    await s.requestsButton.click();
    await expect(s.panel).toBeVisible();
    await expectNoAxeViolations(page);
    await shoot(page, 'm14-14-2-panneau-sombre');
    await darkTheme(page, false);

    // Vue Liste : la mention en texte après le statut.
    await s.views.getByRole('button', { name: 'Liste' }).click();
    const line = page
      .locator('.fc-list-event')
      .filter({ hasText: guestName(target) })
      .first();
    await expect(line).toContainText('à confirmer');
    await expect(line.locator('.online-pill')).toHaveText('Demande en ligne');
    await expectNoAxeViolations(page);
    await shoot(page, 'm14-14-15-liste');

    // Vue Mois : le globe, nommé « Demande en ligne ».
    await s.views.getByRole('button', { name: 'Mois' }).click();
    const chip = s.grid.locator('a.fc-daygrid-event.origin-online').first();
    await expect(chip).toBeVisible();
    await expect(chip).toHaveAccessibleName(/Demande en ligne/);
    await expect(chip.locator('svg.globe')).toBeVisible();
    await expectNoAxeViolations(page);
  } finally {
    await api.dispose();
  }
});

test('fiche 15 : un « à confirmer » posé par le praticien n’a ni la mention, ni « Refuser », ni la phrase sur l’e-mail, et ne compte pas dans « Demandes »', async ({
  page,
}) => {
  const api = await claireApi();
  try {
    const from = new Date();
    const to = new Date(from.getTime() + 28 * DAY_MS);
    const res = await api.get('/api/agenda', {
      params: { from: from.toISOString(), to: to.toISOString() },
    });
    expect(res.status(), await res.text()).toBe(200);
    const own = ((await res.json()) as { appointments: Appointment[] }).appointments.find(
      (item) => item.origin === 'practitioner' && item.status === 'tentative',
    );
    expect(own, 'le seed doit avoir un « à confirmer » du praticien à venir').toBeTruthy();
    expect((await pendingRequests(api)).map((item) => item.id)).not.toContain(own!.id);

    await signIn(page, SEED.claire);
    const s = screen(page);
    await page.goto(`/fr/agenda/rdv/${own!.id}?view=week&date=${parisDay(own!.startsAt)}`);
    await expect(s.detail.locator('.kicker')).toHaveText(/^À confirmer ·/);
    await expect(s.detail.getByText('Demande en ligne')).toHaveCount(0);
    await expect(s.event(own!.id)).toBeVisible();
    await expect(s.event(own!.id)).not.toHaveAccessibleName(/Demande en ligne/);
    await expect(s.detail.getByRole('button', { name: 'Refuser', exact: true })).toHaveCount(0);
    await s.detail.getByRole('button', { name: 'Annuler', exact: true }).click();
    await expect(s.detail.getByRole('heading', { name: 'Annuler ce rendez-vous ?' })).toBeVisible();
    await expect(s.detail.getByText('Le demandeur sera prévenu par e-mail.')).toHaveCount(0);
    await expectNoAxeViolations(page);
    await shoot(page, 'm14-14-10-praticien');
    await s.detail.getByRole('button', { name: 'Garder' }).click();
    await expect(s.detail.locator('form')).toHaveCount(0);
  } finally {
    await api.dispose();
  }
});

test('fiche 15 : confirmer une demande au clavier → POST confirm, relecture de la plage et des demandes, compteur relu, toast ; confirmée, elle garde la mention et ses formulaires préviennent le demandeur', async ({
  page,
}) => {
  const api = await claireApi();
  try {
    const target = await pendingRequest(api);
    await signIn(page, SEED.claire);
    const keyboard = await keyboardOnly(page);
    const s = screen(page);
    const seen = recordRequests(page);

    await page.goto(weekUrl(mondayOf(parisDay(new Date()), -1)));
    await expect.poll(() => seen.length).toBeGreaterThan(0);
    await expectCounter(s.requestsButton, await seen.at(-1)!);

    // Ouvrir « Demandes », choisir la demande, confirmer : tout au clavier.
    await tabTo(page, s.requestsButton);
    await page.keyboard.press('Enter');
    await expect(s.panel.getByRole('heading', { name: 'Demandes en ligne' })).toBeFocused();
    await tabTo(page, s.row(target));
    const navigated = page.waitForResponse(isRequests);
    await page.keyboard.press('Enter');
    const before = await listOf(await navigated);
    expect(before.map((item) => item.id)).toContain(target.id);
    await expect(s.detail).toBeFocused();
    await expect(s.event(target.id)).toHaveClass(/\btentative\b/);

    const confirm = s.detail.getByRole('button', { name: 'Confirmer le rendez-vous' });
    await tabTo(page, confirm);
    const posted = page.waitForResponse(
      isPost(new RegExp(`/api/appointments/${target.id}/confirm$`)),
    );
    const windowRead = page.waitForResponse(isWindow);
    const reread = page.waitForResponse(isRequests);
    await page.keyboard.press('Enter');
    expect((await posted).status()).toBe(200);
    expect((await windowRead).status()).toBe(200);
    const after = await listOf(await reread);
    expect(after.map((item) => item.id)).not.toContain(target.id);
    await expectCounter(s.requestsButton, after);
    await expect(
      s.toast.filter({ hasText: 'Rendez-vous confirmé. Le demandeur est prévenu par e-mail.' }),
    ).toBeVisible();
    keyboard.expectNoPointer();

    // Plus de pointillé, la mention reste ; le détail dit « Séance planifiée ».
    await expect(s.event(target.id)).not.toHaveClass(/\btentative\b/);
    await expect(s.event(target.id)).toHaveAccessibleName(/Demande en ligne/);
    await expect(s.detail.locator('.kicker')).toHaveText(/^Séance planifiée ·/);
    await expect(s.detail.locator('.online')).toHaveText('Demande en ligne');
    expect((await getAppointment(api, target.id)).status).toBe('planned');
    await expectNoAxeViolations(page);
    await shoot(page, 'm14-14-5-confirmee');

    // Rendez-vous en ligne confirmé : « Annuler » habituel ; Annuler et Déplacer disent que le
    // demandeur sera prévenu par e-mail. Rien n'est envoyé (Garder, Annuler du formulaire).
    await expect(s.detail.getByRole('button', { name: 'Refuser', exact: true })).toHaveCount(0);
    await s.detail.getByRole('button', { name: 'Annuler', exact: true }).click();
    await expect(
      s.detail.getByText(
        'Le demandeur sera prévenu par e-mail. Le motif ne lui est jamais transmis.',
      ),
    ).toBeVisible();
    await expectNoAxeViolations(page);
    await shoot(page, 'm14-14-8-annuler');
    await s.detail.getByRole('button', { name: 'Garder' }).click();
    await s.detail.getByRole('button', { name: 'Déplacer', exact: true }).click();
    const move = s.detail.locator('form');
    await expect(move.getByText('Le demandeur sera prévenu par e-mail.')).toBeVisible();
    await shoot(page, 'm14-14-9-deplacer');
    await move.getByRole('button', { name: 'Annuler', exact: true }).click();
    await expect(s.detail.locator('form')).toHaveCount(0);
    expect((await getAppointment(api, target.id)).status).toBe('planned');
  } finally {
    await api.dispose();
  }
});

test('fiche 15 : refuser une demande au clavier → formulaire sur place (phrase sur l’e-mail et le motif), « Garder » n’envoie rien, « Refuser la demande » → POST cancel, la demande quitte la grille et le compteur ; Échap ferme le panneau', async ({
  page,
}) => {
  const api = await claireApi();
  try {
    const target = await pendingRequest(api);
    await signIn(page, SEED.claire);
    const keyboard = await keyboardOnly(page);
    const s = screen(page);
    const cancels: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && /\/cancel$/.test(new URL(request.url()).pathname)) {
        cancels.push(request.url());
      }
    });

    await page.goto(weekUrl(mondayOf(parisDay(new Date()), -1)));
    await tabTo(page, s.requestsButton);
    await page.keyboard.press('Enter');
    await expect(s.panel.getByRole('heading', { name: 'Demandes en ligne' })).toBeFocused();
    // Échap ferme le panneau et rend le focus à l'entrée.
    await page.keyboard.press('Escape');
    await expect(s.panel).toHaveCount(0);
    await expect(s.requestsButton).toBeFocused();
    await page.keyboard.press('Enter');
    await tabTo(page, s.row(target));
    const navigated = page.waitForResponse(isRequests);
    await page.keyboard.press('Enter');
    const before = await listOf(await navigated);
    expect(before.map((item) => item.id)).toContain(target.id);
    await expect(s.detail).toBeFocused();
    await expect(s.event(target.id)).toBeVisible();

    // « Refuser » : bouton neutre ; formulaire sur place, focus au motif.
    const refuse = s.detail.getByRole('button', { name: 'Refuser', exact: true });
    await tabTo(page, refuse);
    await page.keyboard.press('Enter');
    await expect(s.detail.getByRole('heading', { name: 'Refuser cette demande ?' })).toBeVisible();
    const reason = s.detail.getByLabel('Motif (facultatif)');
    await expect(reason).toBeFocused();
    await expect(reason).toHaveAccessibleDescription(
      'Le demandeur sera prévenu par e-mail. Le motif reste dans votre agenda : il ne lui est jamais transmis.',
    );
    await expectNoAxeViolations(page);
    await shoot(page, 'm14-14-4-refuser');

    // « Garder » : rien n'est envoyé, le focus revient à « Refuser ».
    await tabTo(page, s.detail.getByRole('button', { name: 'Garder' }));
    await page.keyboard.press('Enter');
    await expect(s.detail.locator('form')).toHaveCount(0);
    await expect(refuse).toBeFocused();
    expect(cancels).toEqual([]);

    await page.keyboard.press('Enter');
    await expect(reason).toBeFocused();
    await page.keyboard.type('Créneau déjà pris');
    await tabTo(page, s.detail.getByRole('button', { name: 'Refuser la demande' }));
    const posted = page.waitForResponse(
      isPost(new RegExp(`/api/appointments/${target.id}/cancel$`)),
    );
    const reread = page.waitForResponse(isRequests);
    await page.keyboard.press('Enter');
    const response = await posted;
    expect(response.status()).toBe(200);
    expect(response.request().postDataJSON()).toEqual({ reason: 'Créneau déjà pris' });
    const after = await listOf(await reread);
    expect(after.map((item) => item.id)).not.toContain(target.id);
    await expectCounter(s.requestsButton, after);
    await expect(
      s.toast.filter({ hasText: 'Demande refusée. Le demandeur est prévenu par e-mail.' }),
    ).toBeVisible();
    await expect(s.detail).toHaveCount(0);
    // Annulés masqués : la demande refusée quitte la grille.
    await expect(s.event(target.id)).toHaveCount(0);
    keyboard.expectNoPointer();
    const server = await getAppointment(api, target.id);
    expect(server.status).toBe('cancelled');
    expect(server.cancelReason).toBe('Créneau déjà pris');
    await expectNoAxeViolations(page);
    await shoot(page, 'm14-14-6-refusee');
  } finally {
    await api.dispose();
  }
});
