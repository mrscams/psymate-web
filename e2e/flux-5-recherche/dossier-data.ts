import { APIRequestContext, expect } from '@playwright/test';

import { createAccount } from '../preferences/accounts';
import { TestAccount } from '../support/accounts';

// Dossier « Marie D. » de la fiche 07 (recherche), écrit par l'API réelle dans un compte jetable :
// partagé par les e2e du flux 5 (recherche.spec.ts, clavier.spec.ts).

export const API = 'http://localhost:8080';

export interface Dossier {
  account: TestAccount;
  patientId: string;
  ids: {
    event: string;
    feeling: string;
    feeling2: string;
    feeling3: string;
    noteJune: string;
    untagged: string;
  };
}

export async function post<T>(api: APIRequestContext, path: string, data: unknown): Promise<T> {
  const response = await api.post(`${API}${path}`, { data });
  expect(response.status(), `${path} : ${await response.text()}`).toBe(201);
  return (await response.json()) as T;
}

/** La séance d'accueil est créée de façon asynchrone après le patient : on l'attend. */
export async function waitIntake(api: APIRequestContext, patientId: string): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const response = await api.get(`${API}/api/patients/${patientId}/sessions/current`);
    if (response.status() === 200) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`pas de séance d'accueil pour ${patientId}`);
}

/** Dossier « Marie D. » de la fiche 07, en petit : compte jetable, séance, six entrées. */
export async function createDossier(api: APIRequestContext, prefix: string): Promise<Dossier> {
  const account = await createAccount(api, prefix, 'psychologist');
  const tag = await api.post(`${API}/api/tags`, { data: { label: 'travail' } });
  expect([201, 409], await tag.text()).toContain(tag.status());
  const { id: patientId } = await post<{ id: string }>(api, '/api/patients', {
    displayName: 'Marie D.',
  });
  await waitIntake(api, patientId);
  const session = await post<{ id: string }>(api, `/api/patients/${patientId}/sessions/start`, {
    modality: 'in_person',
  });
  const entry = async (body: Record<string, unknown>) =>
    (
      await post<{ id: string }>(api, `/api/patients/${patientId}/entries`, {
        visibility: 'clinical',
        status: 'final',
        sessionId: session.id,
        ...body,
      })
    ).id;
  const ids = {
    event: await entry({
      type: 'event',
      title: "Entretien d'évaluation avec le manager",
      body: "Marie craint qu'on lui reproche les retards du projet. Trois phrases préparées pour l'entretien.",
      occurred: { from: '2026-10-18T00:00:00Z', precision: 'day' },
      tags: ['travail'],
    }),
    feeling: await entry({
      type: 'feeling',
      feeling: { emotionCode: 'anxiety', intensity: 6 },
      body: "Je tourne en boucle sur ce que je vais dire au manager avant l'entretien.",
      occurred: { from: '2026-10-17T17:40:00Z', precision: 'exact' },
      tags: ['travail'],
    }),
    feeling2: await entry({
      type: 'feeling',
      feeling: { emotionCode: 'apprehension', intensity: 4 },
      body: "Appréhension la veille de l'entretien.",
      occurred: { from: '2026-10-17T20:00:00Z', precision: 'exact' },
    }),
    feeling3: await entry({
      type: 'feeling',
      feeling: { emotionCode: 'calm', intensity: 3 },
      body: "Calme retrouvé après l'entretien avec le manager.",
      occurred: { from: '2026-10-18T18:00:00Z', precision: 'exact' },
    }),
    noteJune: await entry({
      type: 'note',
      title: 'Le manager a changé en juin',
      body: 'Nouveau manager depuis le 1er juin, plus exigeant, moins disponible.',
      occurred: { from: '2026-06-14T00:00:00Z', precision: 'day' },
      tags: ['travail'],
    }),
    untagged: await entry({
      type: 'note',
      body: "Prépare un entretien d'embauche ailleurs, sans en parler au manager.",
      occurred: { from: '2026-09-02T00:00:00Z', precision: 'day' },
    }),
  };
  return { account, patientId, ids };
}
