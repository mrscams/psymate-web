import { APIRequestContext, expect } from '@playwright/test';

import { createPatient, daysAgo, entry, intakeOf } from './timeline-data';

// Données des e2e des filtres et du mode par séance (M3-03), écrites par l'API réelle (jamais de
// mock) dans un compte jetable.

export const API = 'http://localhost:8080';

/** Préférence `timeline.groupBy` du compte (PATCH /api/me/preferences). */
export async function setGroupBy(
  api: APIRequestContext,
  value: 'session' | 'month' | 'chronological',
): Promise<void> {
  const response = await api.patch(`${API}/api/me/preferences`, {
    data: { 'timeline.groupBy': value },
  });
  expect(response.status(), await response.text()).toBe(200);
}

/** Séance démarrée à `from`, puis clôturée avec durée et compte rendu. */
async function closedSession(
  api: APIRequestContext,
  patientId: string,
  from: string,
  durationMin: number,
  summary: string,
): Promise<string> {
  const id = await entry(api, patientId, {
    type: 'session',
    session: { modality: 'in_person' },
    occurred: { from },
  });
  const close = await api.post(`${API}/api/sessions/${id}/close`, {
    data: { durationMin, summary },
  });
  expect(close.status(), await close.text()).toBe(200);
  return id;
}

export interface FilterPatient {
  id: string;
  /** Séance la plus récente (aujourd'hui, après l'accueil) et la précédente (il y a 20 jours). */
  recent: string;
  older: string;
}

/**
 * Patient « filtres » : séance d'accueil (datée d'il y a 40 jours), une séance il y a 20 jours (anxiété 5,
 * « Dispute au travail »), puis la séance la plus récente, aujourd'hui (anxiété 7, anxiété 6 en
 * brouillon, joie 4, note « Réveils nocturnes » taguée #sommeil). Trois ressentis d'anxiété en
 * tout, dont un brouillon ; neuf éléments avec les trois séances.
 */
export async function filterPatient(api: APIRequestContext): Promise<FilterPatient> {
  const tag = await api.post(`${API}/api/tags`, { data: { label: 'sommeil' } });
  expect([201, 409], await tag.text()).toContain(tag.status());
  const id = await createPatient(api, 'Nora B.', '1987-06-02');
  // L'accueil est créé avec le patient (maintenant) : daté d'il y a 40 jours, il devient la séance
  // la plus ancienne, et la séance du jour la plus récente, sans dépendre de l'horloge.
  const intake = await intakeOf(api, id);
  const dated = await api.patch(`${API}/api/entries/${intake}`, {
    data: { occurred: { from: daysAgo(40, 10) } },
  });
  expect(dated.status(), await dated.text()).toBe(200);
  const older = await closedSession(
    api,
    id,
    daysAgo(20, 8),
    50,
    'Retour sur la semaine ; la dispute reste présente.',
  );
  await entry(api, id, {
    type: 'feeling',
    feeling: { emotionCode: 'anxiety', intensity: 5 },
    occurred: { from: daysAgo(20, 9) },
    sessionId: older,
  });
  await entry(api, id, {
    type: 'event',
    title: 'Dispute au travail',
    occurred: { from: daysAgo(22), precision: 'day' },
    sessionId: older,
  });
  const recent = await closedSession(
    api,
    id,
    daysAgo(0, 6),
    45,
    'Travail sur l’anxiété du matin et les réveils nocturnes.',
  );
  for (const [code, intensity, status] of [
    ['anxiety', 7, 'final'],
    ['anxiety', 6, 'draft'],
    ['joy', 4, 'final'],
  ] as const) {
    await entry(api, id, {
      type: 'feeling',
      status,
      feeling: { emotionCode: code, intensity },
      occurred: { from: daysAgo(1, 7 + intensity) },
      sessionId: recent,
    });
  }
  await entry(api, id, {
    type: 'note',
    title: 'Réveils nocturnes',
    body: 'Se réveille vers 4 h, pense au travail.',
    tags: ['sommeil'],
    occurred: { from: daysAgo(2, 21) },
    sessionId: recent,
  });
  return { id, recent, older };
}
