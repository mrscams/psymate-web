import { APIRequestContext, expect, request as playwrightRequest } from '@playwright/test';

import { TestAccount } from '../support/accounts';

// Données des e2e de la timeline (M3-02), écrites par l'API réelle (jamais de mock) dans un compte
// jetable : un patient « récit » (situations, séances passées, entrées d'avant le suivi) et un
// patient « volume » (2 000 entrées) pour le défilement et les fenêtres.

const API = 'http://localhost:8080';
const DAY = 86_400_000;

/** Limite de débit de l'API : 600 requêtes par minute et par session (G Q24) ; 450 par session ici. */
const PER_SESSION = 450;

export function daysAgo(days: number, hourUtc = 9): string {
  const date = new Date(Date.now() - days * DAY);
  date.setUTCHours(hourUtc, 0, 0, 0);
  return date.toISOString();
}

export async function createPatient(
  api: APIRequestContext,
  displayName: string,
  birthDate?: string,
): Promise<string> {
  const response = await api.post(`${API}/api/patients`, { data: { displayName, birthDate } });
  expect(response.status(), await response.text()).toBe(201);
  return ((await response.json()) as { id: string }).id;
}

/** La séance d'accueil est créée de façon asynchrone après le patient : on l'attend. */
export async function intakeOf(api: APIRequestContext, patientId: string): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const response = await api.get(`${API}/api/patients/${patientId}/sessions/current`);
    if (response.status() === 200) return ((await response.json()) as { id: string }).id;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`pas de séance d'accueil pour ${patientId}`);
}

/** Crée une entrée ; renvoie son identifiant. */
export async function entry(
  api: APIRequestContext,
  patientId: string,
  body: Record<string, unknown>,
): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const response = await api.post(`${API}/api/patients/${patientId}/entries`, { data: body });
    if (response.status() === 429 && attempt < 5) {
      const retry = Number(response.headers()['retry-after'] ?? '5');
      await new Promise((resolve) => setTimeout(resolve, (retry + 1) * 1000));
      continue;
    }
    expect(response.status(), await response.text()).toBe(201);
    return ((await response.json()) as { id: string }).id;
  }
}

/** Séance passée, démarrée à `from` puis clôturée. */
export async function pastSession(
  api: APIRequestContext,
  patientId: string,
  from: string,
  durationMin = 50,
): Promise<string> {
  const id = await entry(api, patientId, {
    type: 'session',
    session: { modality: 'in_person' },
    occurred: { from },
  });
  const close = await api.post(`${API}/api/sessions/${id}/close`, { data: { durationMin } });
  expect(close.status(), await close.text()).toBe(200);
  return id;
}

/** Une session API de plus pour le compte (chacune a sa propre limite de débit). */
export async function signedInContext(account: TestAccount): Promise<APIRequestContext> {
  const api = await playwrightRequest.newContext();
  const login = await api.post(`${API}/api/auth/login`, {
    data: { email: account.email, password: account.password },
  });
  expect(login.status(), await login.text()).toBe(200);
  return api;
}

export interface StoryPatient {
  id: string;
  /** Titre → identifiant des entrées nommées. */
  ids: Record<string, string>;
  sessionRecent: string;
}

/**
 * Patient « récit » : séance d'accueil (aujourd'hui), deux séances passées (il y a 400 et 30 jours :
 * la plus ancienne marque le début du suivi), une situation en cours commencée il y a 200 jours,
 * une situation terminée (120 → 90 jours), un événement dit en séance il y a 30 jours mais survenu
 * 5 jours plus tôt (pastille), une note du jour même de cette séance (sans pastille), et trois
 * entrées d'avant le suivi (année 2014, phase de vie « enfance », période « Études à Lille »).
 */
export async function storyPatient(api: APIRequestContext): Promise<StoryPatient> {
  const id = await createPatient(api, 'Lina T.', '1990-04-12');
  await intakeOf(api, id);
  const first = await pastSession(api, id, daysAgo(400, 8));
  const recent = await pastSession(api, id, daysAgo(30, 15));
  const ids: Record<string, string> = {};
  ids['Réorganisation du service'] = await entry(api, id, {
    type: 'situation',
    title: 'Réorganisation du service',
    occurred: { from: daysAgo(200), precision: 'day' },
    sessionId: recent,
  });
  ids['Arrêt maladie'] = await entry(api, id, {
    type: 'situation',
    title: 'Arrêt maladie',
    occurred: { from: daysAgo(120), to: daysAgo(90), precision: 'day' },
    sessionId: recent,
  });
  ids['Entretien annuel'] = await entry(api, id, {
    type: 'event',
    title: 'Entretien annuel',
    occurred: { from: daysAgo(35), precision: 'day' },
    sessionId: recent,
  });
  ids['Point sur le sommeil'] = await entry(api, id, {
    type: 'note',
    title: 'Point sur le sommeil',
    body: 'Dort mieux depuis deux semaines.',
    occurred: { from: daysAgo(30, 15) },
    sessionId: recent,
  });
  ids['Déménagement à Lyon'] = await entry(api, id, {
    type: 'event',
    title: 'Déménagement à Lyon',
    occurred: { from: '2014-01-01T00:00:00Z', precision: 'year' },
    sessionId: first,
  });
  ids['Souvenirs d’école'] = await entry(api, id, {
    type: 'event',
    title: 'Souvenirs d’école',
    occurred: { precision: 'life_phase', label: 'enfance' },
    sessionId: first,
  });
  ids['Études à Lille'] = await entry(api, id, {
    type: 'situation',
    title: 'Études à Lille',
    occurred: {
      from: '2008-09-01T00:00:00Z',
      to: '2012-07-01T00:00:00Z',
      precision: 'period',
      label: 'Études à Lille',
    },
    sessionId: first,
  });
  return { id, ids, sessionRecent: recent };
}

/**
 * Patient « volume » : une séance il y a trois ans, puis `count` notes réparties jusqu'à hier,
 * écrites en parallèle sur plusieurs sessions API (limite de débit par session).
 */
export async function volumePatient(
  api: APIRequestContext,
  account: TestAccount,
  count: number,
): Promise<string> {
  const id = await createPatient(api, 'Volume 2000');
  await intakeOf(api, id);
  const span = 3 * 365;
  const session = await pastSession(api, id, daysAgo(span + 1, 8));
  const contexts = await Promise.all(
    Array.from({ length: Math.ceil(count / PER_SESSION) }, () => signedInContext(account)),
  );
  const step = ((span - 1) * DAY) / count;
  const start = Date.now() - span * DAY;
  let next = 0;
  await Promise.all(
    contexts.flatMap((context, c) =>
      Array.from({ length: 8 }, async () => {
        for (;;) {
          const i = next++;
          if (i >= count) return;
          await entry(context, id, {
            type: 'note',
            title: `Note ${String(i + 1).padStart(4, '0')}`,
            body: `Note générée pour le volume (session API ${c}).`,
            occurred: { from: new Date(start + i * step).toISOString() },
            sessionId: session,
          });
        }
      }),
    ),
  );
  await Promise.all(contexts.map((context) => context.dispose()));
  return id;
}
