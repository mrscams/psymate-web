import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { APIRequestContext, expect, Page, Request, TestInfo } from '@playwright/test';

import { uniqueEmail } from '../support/accounts';
import { API, MAILPIT } from '../support/env';

/**
 * Outils des e2e des pages par lien (fiche 32, M14-13), contre l'API réelle et Mailpit : jamais de
 * mock du backend. Les demandes sont créées par l'API directement (corps du contrat), une seule par
 * praticien et par passage (plafond de 5 créations par heure et par IP, partagé par toute la suite).
 */

export interface PublicSlot {
  startsAt: string;
  endsAt: string;
}

export interface CreatedRequest {
  slug: string;
  email: string;
  slot: PublicSlot;
  modality: string;
  durationMin: number;
  displayName: string;
}

/** AAAA-MM-JJ d'un instant dans un fuseau. */
function dayIn(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

function plusDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Crée une demande sur `slug` (POST …/requests, 202) pour un créneau offert vers la fin de la
 * fenêtre : la page publique (page-publique.spec.ts) prend le premier, d'autres tests tournent en
 * même temps sur ces praticiens. Le créneau est lu dans la réponse de …/slots, jamais écrit en dur.
 */
export async function createRequest(
  api: APIRequestContext,
  slug: string,
  prefix: string,
): Promise<CreatedRequest> {
  const settingsResponse = await api.get(`${API}/api/public/booking/practitioners/${slug}`);
  expect(settingsResponse.status(), await settingsResponse.text()).toBe(200);
  const settings = (await settingsResponse.json()) as {
    displayName: string;
    timezone: string;
    horizonDays: number;
    slotDurationMin: number;
    modalities: string[];
  };
  const from = dayIn(new Date(), settings.timezone);
  const to = plusDays(from, Math.min(settings.horizonDays, 30));
  const slotsResponse = await api.get(`${API}/api/public/booking/practitioners/${slug}/slots`, {
    params: { from, to },
  });
  expect(slotsResponse.status()).toBe(200);
  const { slots } = (await slotsResponse.json()) as { slots: PublicSlot[] };
  expect(slots.length, `aucun créneau offert par ${slug}`).toBeGreaterThan(0);
  // Un des cinq derniers créneaux, au hasard : deux passages successifs ne visent pas le même.
  const tail = slots.slice(-5);
  const slot = tail[Math.floor(Math.random() * tail.length)];
  const email = uniqueEmail(prefix);
  const modality = settings.modalities[0];
  const response = await api.post(`${API}/api/public/booking/practitioners/${slug}/requests`, {
    data: {
      startsAt: slot.startsAt,
      modality,
      firstName: 'Lina',
      lastName: `Par-lien${Date.now() % 100000}`,
      email,
      locale: 'fr',
      consent: true,
      website: '',
      // L'API ignore en silence une demande envoyée moins de 3 s après l'affichage du formulaire.
      formShownAt: new Date(Date.now() - 10_000).toISOString(),
    },
  });
  expect(response.status(), await response.text()).toBe(202);
  return {
    slug,
    email,
    slot,
    modality,
    durationMin: settings.slotDurationMin,
    displayName: settings.displayName,
  };
}

/** Jeton du lien `/rendez-vous/<segment>/<jeton>` du premier e-mail reçu par `email` qui en porte un. */
export async function linkToken(
  api: APIRequestContext,
  email: string,
  segment: 'confirmer' | 'gerer',
): Promise<string> {
  const pattern = new RegExp(`/rendez-vous/${segment}/([A-Za-z0-9_-]+)`);
  let token: string | null = null;
  await expect
    .poll(
      async () => {
        const search = await api.get(`${MAILPIT}/api/v1/search`, {
          params: { query: `to:${email}` },
        });
        const messages = ((await search.json()) as { messages?: { ID: string }[] }).messages ?? [];
        for (const message of messages) {
          const full = await api.get(`${MAILPIT}/api/v1/message/${message.ID}`);
          const match = pattern.exec(((await full.json()) as { Text?: string }).Text ?? '');
          if (match) token = match[1];
        }
        return token;
      },
      { timeout: 30_000, message: `aucun lien /rendez-vous/${segment}/ pour ${email}` },
    )
    .not.toBeNull();
  return token!;
}

/**
 * Reprise d'un parcours au second essai de Playwright (retries de la CI), sans nouvelle création :
 * la demande créée au premier essai, ses jetons et l'étape atteinte sont écrits dans un petit
 * fichier du dossier de sortie de Playwright (test-results/, vidé à chaque lancement). Données de
 * test seulement (adresses example.test). Le fichier est supprimé à la fin du parcours.
 */
export interface ParcoursState {
  request: CreatedRequest;
  verifyToken: string | null;
  manageToken: string | null;
  /** Annulation déjà enregistrée par l'API (200 sur manage/cancel). */
  cancelled: boolean;
}

export class Parcours {
  constructor(private readonly key: string) {}

  private file(info: TestInfo): string {
    return join(info.project.outputDir, `par-lien-${this.key}.json`);
  }

  read(info: TestInfo): ParcoursState | null {
    const file = this.file(info);
    return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as ParcoursState) : null;
  }

  save(info: TestInfo, state: ParcoursState): void {
    const file = this.file(info);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(state));
  }

  remove(info: TestInfo): void {
    rmSync(this.file(info), { force: true });
  }

  /**
   * La demande du parcours : relue si un essai précédent l'a créée, sinon créée (une seule
   * création par parcours et par lancement), puis son lien de vérification lu dans Mailpit.
   */
  async start(
    api: APIRequestContext,
    info: TestInfo,
    slug: string,
    prefix: string,
  ): Promise<{ state: ParcoursState; resumed: boolean }> {
    const previous = this.read(info);
    if (previous?.verifyToken) return { state: previous, resumed: true };
    const state: ParcoursState = previous ?? {
      request: await createRequest(api, slug, prefix),
      verifyToken: null,
      manageToken: null,
      cancelled: false,
    };
    this.save(info, state);
    state.verifyToken = await linkToken(api, state.request.email, 'confirmer');
    this.save(info, state);
    return { state, resumed: previous !== null };
  }

  /**
   * Fin d'un parcours (afterAll) : s'il a abouti, ou si c'était le dernier essai, le rendez-vous est
   * annulé (créneau libéré) et le fichier supprimé ; sinon tout est gardé pour l'essai suivant.
   */
  async finish(api: APIRequestContext, info: TestInfo, completed: boolean): Promise<void> {
    const state = this.read(info);
    if (!state) return;
    if (!completed && info.retry < info.project.retries) return;
    if (state.manageToken && !state.cancelled) await cancelByLink(api, state.manageToken);
    this.remove(info);
  }
}

/**
 * Rendez-vous en ligne de `email` dans l'agenda du praticien (GET /api/agenda, session ouverte par
 * POST /api/auth/login). Le cookie de session est marqué Secure : il est renvoyé à la main.
 */
export async function agendaAppointmentsOf(
  api: APIRequestContext,
  account: { email: string; password: string },
  guestEmail: string,
  slot: PublicSlot,
): Promise<{ id: string; status: string }[]> {
  const login = await api.post(`${API}/api/auth/login`, {
    data: { email: account.email, password: account.password, rememberMe: false },
  });
  expect(login.status(), await login.text()).toBe(200);
  const session = /SESSION=([^;]+)/.exec(login.headers()['set-cookie'] ?? '')?.[1];
  expect(session, 'cookie de session').toBeTruthy();
  const from = new Date(Date.parse(slot.startsAt) - 86_400_000).toISOString();
  const to = new Date(Date.parse(slot.endsAt) + 86_400_000).toISOString();
  const agenda = await api.get(`${API}/api/agenda`, {
    params: { from, to, includeCancelled: 'true' },
    headers: { Cookie: `SESSION=${session}` },
  });
  expect(agenda.status(), await agenda.text()).toBe(200);
  const body = (await agenda.json()) as {
    appointments?: { id: string; status: string; guest?: { email?: string | null } | null }[];
  };
  return (body.appointments ?? [])
    .filter((a) => a.guest?.email?.toLowerCase() === guestEmail.toLowerCase())
    .map(({ id, status }) => ({ id, status }));
}

/** Annule par le lien de gestion, hors navigateur : libère le créneau quoi qu'il arrive au test. */
export async function cancelByLink(api: APIRequestContext, manageToken: string): Promise<void> {
  const response = await api.post(`${API}/api/public/booking/manage/cancel`, {
    data: { token: manageToken },
  });
  expect([200, 409]).toContain(response.status());
}

export interface ApiCall {
  url: string;
  method: string;
  referer: string | undefined;
  body: string | null;
}

/** Lectures d'en-têtes en cours (allHeaders est asynchrone) : attendues avant chaque vérification. */
const pending: Promise<unknown>[] = [];

/** Enregistre chaque requête vers /api émise par la page : URL, méthode, en-tête Referer, corps. */
export function recordApiCalls(page: Page): ApiCall[] {
  const calls: ApiCall[] = [];
  page.on('request', (request: Request) => {
    if (!new URL(request.url()).pathname.startsWith('/api/')) return;
    const call: ApiCall = {
      url: request.url(),
      method: request.method(),
      referer: undefined,
      body: request.postData(),
    };
    calls.push(call);
    pending.push(
      request
        .allHeaders()
        .then((headers) => {
          call.referer = headers['referer'];
        })
        .catch(() => undefined),
    );
  });
  return calls;
}

/**
 * Aucun jeton dans l'URL d'une requête /api, ni dans son en-tête Referer, ni dans localStorage ou
 * sessionStorage (G Q62, fiche 32). Toutes les requêtes /api sont contrôlées, y compris le
 * GET /api/auth/me du démarrage : la politique strict-origin de src/index.html, posée avant le
 * démarrage, n'y laisse partir que l'origine.
 */
export async function expectTokensNowhere(
  page: Page,
  calls: ApiCall[],
  tokens: string[],
): Promise<void> {
  await Promise.all(pending);
  expect(calls.length).toBeGreaterThan(0);
  for (const call of calls) {
    for (const token of tokens) {
      expect(call.url, `${call.method} ${call.url}`).not.toContain(token);
      expect(call.referer ?? '', `Referer de ${call.method} ${call.url}`).not.toContain(token);
    }
  }
  // Les requêtes de la page elle-même partent sans Referer (balise no-referrer).
  const own = calls.filter((call) => /\/api\/public\/booking\//.test(call.url));
  expect(own.length).toBeGreaterThan(0);
  for (const call of own) expect(call.referer, `${call.method} ${call.url}`).toBeUndefined();
  const stored = await page.evaluate(() =>
    JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }),
  );
  for (const token of tokens) expect(stored).not.toContain(token);
}

/** « jeudi 26 novembre 2026 » et « 10:00 – 11:00 », à l'heure de Paris (fuseau du navigateur des e2e). */
export function expectedDetail(slot: PublicSlot): { day: string; hours: string } {
  const timeZone = 'Europe/Paris';
  const day = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone,
  })
    .formatToParts(new Date(slot.startsAt))
    .map((part) => (part.type === 'day' && part.value === '1' ? '1er' : part.value))
    .join('');
  const hour = (instant: string) =>
    new Intl.DateTimeFormat('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone,
    }).format(new Date(instant));
  return { day, hours: `${hour(slot.startsAt)} – ${hour(slot.endsAt)}` };
}

export const MODALITY_LABELS: Record<string, string> = {
  in_person: 'Au cabinet',
  video: 'En visio',
  phone: 'Par téléphone',
};
