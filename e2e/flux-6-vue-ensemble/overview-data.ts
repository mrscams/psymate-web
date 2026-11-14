import { APIRequestContext, expect, Locator, Page, Response } from '@playwright/test';

import {
  createPatient,
  daysAgo,
  entry,
  intakeOf,
  pastSession,
} from '../flux-5-timeline/timeline-data';

// Données et outils des e2e de la vue d'ensemble (M4-05), écrites par l'API réelle (jamais de
// mock) dans un compte jetable.

const API = 'http://localhost:8080';

export interface OverviewFolder {
  patientId: string;
  situation: string;
  session: string;
}

/**
 * Dossier relu par la vue d'ensemble : une séance passée clôturée (il y a 10 jours), une situation
 * en cours (« Surcharge au travail », depuis 60 jours), deux ressentis liés à la situation (anxiété
 * 8 et 6), un ressenti de joie, un médicament en cours.
 */
export async function overviewFolder(api: APIRequestContext): Promise<OverviewFolder> {
  const patientId = await createPatient(api, 'Marie D.', '1991-05-04');
  await intakeOf(api, patientId);
  const session = await pastSession(api, patientId, daysAgo(10, 14));
  const situation = await entry(api, patientId, {
    type: 'situation',
    title: 'Surcharge au travail',
    occurred: { from: daysAgo(60), precision: 'day' },
    sessionId: session,
  });
  for (const [days, intensity] of [
    [12, 8],
    [10, 6],
  ]) {
    await entry(api, patientId, {
      type: 'feeling',
      title: `Anxiété ${intensity}/10`,
      feeling: { emotionCode: 'anxiety', intensity },
      occurred: { from: daysAgo(days), precision: 'day' },
      sessionId: session,
      links: [{ targetId: situation, linkType: 'worsens', direction: 'incoming' }],
    });
  }
  await entry(api, patientId, {
    type: 'feeling',
    title: 'Joie après la randonnée',
    feeling: { emotionCode: 'joy', intensity: 4 },
    occurred: { from: daysAgo(5), precision: 'day' },
    sessionId: session,
  });
  await entry(api, patientId, {
    type: 'medication',
    title: 'Sertraline 50 mg',
    medication: { molecule: 'Sertraline', dosage: '50 mg' },
    occurred: { from: daysAgo(40), precision: 'day' },
    sessionId: session,
  });
  return { patientId, situation, session };
}

/**
 * Marie D. dont l'intensité monte (M4-07) : le dossier d'overviewFolder, plus un ressenti d'anxiété
 * à 3/10 il y a 45 jours. Moyenne des 30 derniers jours (8, 6, 4) au-dessus de celle des 30 jours
 * d'avant (3) de plus d'un point : le serveur écrit sa phrase « … monte … ».
 */
export async function risingFolder(api: APIRequestContext): Promise<OverviewFolder> {
  const folder = await overviewFolder(api);
  await entry(api, folder.patientId, {
    type: 'feeling',
    title: 'Anxiété 3/10',
    feeling: { emotionCode: 'anxiety', intensity: 3 },
    occurred: { from: daysAgo(45), precision: 'day' },
    sessionId: folder.session,
  });
  return folder;
}

/** GET …/overview lu par l'API réelle (session du compte dans `api`), en français. */
export async function readOverview(
  api: APIRequestContext,
  patientId: string,
): Promise<{ narrative: { sentences: string[]; attention: string | null } }> {
  const response = await api.get(`${API}/api/patients/${patientId}/overview?window=90d`, {
    headers: { 'Accept-Language': 'fr' },
  });
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}

/** Patient sans aucune donnée : la séance d'accueil, créée avec lui, est archivée. */
export async function emptyPatient(api: APIRequestContext): Promise<string> {
  const patientId = await createPatient(api, 'Iris P.');
  const intake = await intakeOf(api, patientId);
  const archived = await api.delete(`${API}/api/entries/${intake}`);
  expect(archived.status(), await archived.text()).toBe(204);
  return patientId;
}

/** PATCH /api/me/preferences (merge) du compte connecté dans `api`. */
export async function setPreferences(
  api: APIRequestContext,
  values: Record<string, string>,
): Promise<void> {
  const response = await api.patch(`${API}/api/me/preferences`, { data: values });
  expect(response.status(), await response.text()).toBe(200);
}

/** Toute lecture GET …/patients/{id}/overview. */
export function isOverview(response: Response, patientId: string): boolean {
  const url = new URL(response.url());
  return (
    response.request().method() === 'GET' && url.pathname === `/api/patients/${patientId}/overview`
  );
}

export function overviewWindow(response: Response): string | null {
  return new URL(response.url()).searchParams.get('window');
}

/**
 * Durée côté serveur d'une réponse relue par le navigateur : de l'envoi de la requête au premier
 * octet de la réponse (Resource Timing de Playwright), en millisecondes.
 */
export function serverMs(response: Response): number {
  const timing = response.request().timing();
  return timing.responseStart - timing.requestStart;
}

/**
 * Une section de la vue d'ensemble (UX-S6) dont le titre (h3) est `heading` : colonne de lecture
 * (« Comment évoluent les ressentis », « Noté depuis la dernière séance », « Dernières séances »)
 * ou colonne latérale (« Cadre du suivi », « Situations en cours · 1 »…).
 */
export function block(page: Page, heading: string | RegExp): Locator {
  return page
    .locator('pm-overview-section section')
    .filter({ has: page.getByRole('heading', { level: 3, name: heading }) });
}

/** La bande « Depuis la séance du … » / « Depuis l'ouverture du dossier » (UX-S6). */
export function since(page: Page): Locator {
  return page.locator('pm-overview-since section');
}

/** Les trois chiffres de la bande « Depuis » (nombre en gras, dans l'ordre). */
export function sinceFacts(page: Page): Locator {
  return since(page).locator('.fact b');
}

/** Le sélecteur « Fenêtre : 30 j · 90 j · 1 an » de l'en-tête patient (UX-S6). */
export function windowSelector(page: Page): Locator {
  return page.getByRole('group', { name: 'Fenêtre', exact: true });
}

/**
 * Entrées notées depuis la dernière séance (UX-S6) : rattachées à la séance d'accueil (lue dans
 * les séances récentes de la synthèse : « sessions/current » renvoie la séance passée), après la
 * séance passée du dossier ; un ressenti d'anxiété 7/10 en brouillon il y a 2 jours et une note
 * titrée il y a 1 jour.
 */
export async function notedSince(api: APIRequestContext, patientId: string): Promise<void> {
  const response = await api.get(`${API}/api/patients/${patientId}/overview?window=90d`);
  expect(response.status(), await response.text()).toBe(200);
  const { recentSessions } = (await response.json()) as {
    recentSessions: { entryId: string; kind: string }[];
  };
  const intake = recentSessions.find((session) => session.kind === 'intake')?.entryId;
  expect(intake, JSON.stringify(recentSessions)).toBeTruthy();
  await entry(api, patientId, {
    type: 'feeling',
    title: 'Réveils vers 3 h',
    status: 'draft',
    feeling: { emotionCode: 'anxiety', intensity: 7 },
    occurred: { from: daysAgo(2, 8), precision: 'day' },
    sessionId: intake,
  });
  await entry(api, patientId, {
    type: 'note',
    title: 'Revoir l’hygiène de sommeil',
    body: 'Proposer un agenda du sommeil.',
    occurred: { from: daysAgo(1, 9) },
    sessionId: intake,
  });
}
