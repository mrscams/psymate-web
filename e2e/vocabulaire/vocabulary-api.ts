import { APIRequestContext, expect } from '@playwright/test';

/**
 * Mise en place par l'API réelle pour les e2e du vocabulaire (M1-09) : le `request` de Playwright
 * porte la session du compte jetable ouverte par createAccount (cookie de confirmEmail). Chaque
 * test a son compte : fusionner des tags ou des émotions du seed serait irréversible (la fusion de
 * tags ne s'annule pas) et ferait échouer la suite au passage suivant.
 */
const API = 'http://localhost:8080';

async function ok<T>(response: Promise<import('@playwright/test').APIResponse>, status = 201) {
  const done = await response;
  expect(done.status(), await done.text()).toBe(status);
  return (await done.json()) as T;
}

export async function createTag(api: APIRequestContext, label: string): Promise<{ id: string }> {
  return ok(api.post(`${API}/api/tags`, { data: { label } }));
}

export async function createEmotion(
  api: APIRequestContext,
  labelFr: string,
  family: string,
): Promise<{ code: string }> {
  return ok(api.post(`${API}/api/me/emotions`, { data: { labelFr, family } }));
}

/** Patient avec une séance ouverte : les entrées s'y rattachent (SESSION_REQUIRED sinon). */
export async function createPatientWithSession(
  api: APIRequestContext,
  displayName: string,
): Promise<string> {
  const patient = await ok<{ id: string }>(
    api.post(`${API}/api/patients`, { data: { displayName } }),
  );
  await ok(
    api.post(`${API}/api/patients/${patient.id}/entries`, {
      data: { type: 'session', session: { modality: 'in_person' } },
    }),
  );
  return patient.id;
}

export async function createNote(
  api: APIRequestContext,
  patientId: string,
  body: string,
  tags: string[],
): Promise<string> {
  const entry = await ok<{ id: string }>(
    api.post(`${API}/api/patients/${patientId}/entries`, { data: { type: 'note', body, tags } }),
  );
  return entry.id;
}

export async function createFeeling(
  api: APIRequestContext,
  patientId: string,
  emotionCode: string,
): Promise<string> {
  const entry = await ok<{ id: string }>(
    api.post(`${API}/api/patients/${patientId}/entries`, {
      data: { type: 'feeling', feeling: { emotionCode, intensity: 6 } },
    }),
  );
  return entry.id;
}

/** GET /api/entries/{id} : relecture d'une entrée (tags, émotion du ressenti). */
export async function readEntry(
  api: APIRequestContext,
  id: string,
): Promise<{ tags: string[]; feeling: { emotionCode: string; intensity: number } | null }> {
  return ok(api.get(`${API}/api/entries/${id}`), 200);
}
