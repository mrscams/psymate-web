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

/** Le bloc de la vue d'ensemble dont le titre (h3) est `heading`. */
export function block(page: Page, heading: string | RegExp): Locator {
  return page
    .locator('pm-overview-block section')
    .filter({ has: page.getByRole('heading', { level: 3, name: heading }) });
}

/** La bascule « Vue : Simple · Complète » de l'en-tête patient. */
export function viewToggle(page: Page): Locator {
  return page.getByRole('group', { name: "Niveau de détail de la vue d'ensemble" });
}

export function windowSelector(page: Page): Locator {
  return page.getByRole('group', { name: "Période de la vue d'ensemble" });
}
