import { APIRequestContext } from '@playwright/test';

import { createPatient, entry, pastSession } from './timeline-data';

const API = 'http://localhost:8080';

// Données des e2e de la vue décennie (M3-04), écrites par l'API réelle (jamais de mock) dans un
// compte jetable : un patient suivi depuis près de cinq ans (entrées antidatées) et un patient
// récent.

/** Le 10 du mois, `months` mois avant le mois courant (UTC), à `hourUtc` heures. */
export function monthsAgo(months: number, hourUtc = 9): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 10, hourUtc),
  ).toISOString();
}

/**
 * La séance d'accueil, créée de façon asynchrone après le patient. Attente plus longue que celle
 * de `intakeOf` : ces données s'écrivent pendant que les 2 000 notes du patient « volume » chargent
 * l'API.
 */
async function intake(api: APIRequestContext, patientId: string): Promise<string> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const response = await api.get(`${API}/api/patients/${patientId}/sessions/current`);
    if (response.status() === 200) return ((await response.json()) as { id: string }).id;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`pas de séance d'accueil pour ${patientId}`);
}

/** AAAA-MM (UTC) d'un instant ISO. */
export function monthKeyOf(iso: string): string {
  return iso.slice(0, 7);
}

/** Dernier jour (AAAA-MM-JJ) du mois AAAA-MM. */
export function lastDayOf(month: string): string {
  const [year, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return `${month}-${String(last).padStart(2, '0')}`;
}

/** Mois ouvert en détail par les e2e : une séance, un ressenti et une note. */
export const DRILL_MONTHS_AGO = 12;

export interface DecadePatient {
  id: string;
  /** Mois AAAA-MM ouvert en détail, et le titre de sa note. */
  drillMonth: string;
  drillNote: string;
}

/**
 * Patient « décennie » : suivi déclaré depuis 50 mois, une séance tous les deux mois depuis 58 mois
 * (29 séances clôturées, chacune avec un ressenti d'anxiété d'intensité variable, et une note tous
 * les quatre mois), une situation en cours depuis 40 mois et une situation close de six mois. La
 * plage (première séance → mois courant) couvre 59 mois : plus de 3 ans.
 */
export async function decadePatient(api: APIRequestContext): Promise<DecadePatient> {
  const id = await createPatient(api, 'Hugo D.', '1979-02-11', {
    since: monthsAgo(50).slice(0, 10),
  });
  await intake(api, id);
  let drillNote = '';
  for (let k = 58; k >= 2; k -= 2) {
    const session = await pastSession(api, id, monthsAgo(k, 8));
    await entry(api, id, {
      type: 'feeling',
      feeling: { emotionCode: 'anxiety', intensity: 3 + (k % 7) },
      occurred: { from: monthsAgo(k, 9) },
      sessionId: session,
    });
    if (k % 4 === 0) {
      const title = `Point d’étape ${k}`;
      await entry(api, id, {
        type: 'note',
        title,
        body: 'Note de suivi antidatée pour la vue décennie.',
        occurred: { from: monthsAgo(k, 10) },
        sessionId: session,
      });
      if (k === DRILL_MONTHS_AGO) drillNote = title;
    }
    if (k === 40) {
      await entry(api, id, {
        type: 'situation',
        title: 'Reconversion professionnelle',
        occurred: { from: monthsAgo(40, 0), precision: 'day' },
        sessionId: session,
      });
    }
    if (k === 30) {
      await entry(api, id, {
        type: 'situation',
        title: 'Arrêt maladie',
        occurred: {
          from: monthsAgo(30, 0),
          to: monthsAgo(24, 0),
          precision: 'period',
          label: 'Arrêt maladie',
        },
        sessionId: session,
      });
    }
  }
  return { id, drillMonth: monthKeyOf(monthsAgo(DRILL_MONTHS_AGO)), drillNote };
}

/** Patient récent : la séance d'accueil et une note du jour. */
export async function recentPatient(api: APIRequestContext): Promise<string> {
  const id = await createPatient(api, 'Inès R.');
  const intakeId = await intake(api, id);
  await entry(api, id, {
    type: 'note',
    title: 'Premier contact',
    body: 'Motif de la consultation.',
    occurred: { from: new Date().toISOString() },
    sessionId: intakeId,
  });
  return id;
}
