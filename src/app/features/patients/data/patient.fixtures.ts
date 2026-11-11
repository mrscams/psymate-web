import { PatientActivity, PatientVersion, PatientView, PractitionerTag } from './patient.model';

// Données de test de features/patients (fichier à part : un spec n'importe pas un autre spec).

export function patient(overrides: Partial<PatientView> = {}): PatientView {
  return {
    id: 'p-marie',
    displayName: 'Marie D.',
    firstName: 'Marie',
    lastName: 'Dupont',
    birthDate: '1990-04-12',
    pronoun: 'elle',
    phone: null,
    email: null,
    context: {
      situation: null,
      activity: 'Infirmière',
      referredBy: null,
      initialReason: null,
      history: null,
    },
    followUp: {
      since: '2025-03-01',
      rhythm: 'weekly',
      modality: 'in_person',
      durationMin: 50,
      fee: null,
      prescriber: null,
    },
    flags: [],
    tags: [{ id: 't-travail', label: 'travail' }],
    currentVersion: 1,
    archivedAt: null,
    createdAt: '2026-11-01T09:00:00Z',
    updatedAt: '2026-11-01T09:00:00Z',
    ...overrides,
  };
}

export const OMAR = patient({
  id: 'p-omar',
  displayName: 'Omar B.',
  firstName: 'Omar',
  lastName: null,
  birthDate: null,
  pronoun: 'il',
  tags: [],
  flags: [{ kind: 'watch', reason: 'Sommeil', setAt: '2026-11-02T10:00:00Z' }],
});

export const TAGS: PractitionerTag[] = [
  { id: 't-travail', label: 'travail', normalizedLabel: 'travail' },
  { id: 't-sante', label: 'santé', normalizedLabel: 'sante' },
];

export const VERSIONS: PatientVersion[] = [
  {
    version: 2,
    createdAt: '2026-11-03T10:00:00Z',
    reason: null,
    snapshot: {
      displayName: 'Marie D.',
      firstName: 'Marie',
      birthDate: '1990-04-12',
      followUp: { rhythm: 'weekly' },
      context: {},
    },
  },
  {
    version: 3,
    createdAt: '2026-11-04T10:00:00Z',
    reason: 'Nouveau rythme',
    snapshot: {
      displayName: 'Marie D.',
      firstName: 'Marie',
      birthDate: '1990-04-12',
      followUp: { rhythm: 'monthly' },
      context: {},
    },
  },
];

/** Résumé d'activité d'une ligne (projection vue d'ensemble, fenêtre 30 j). */
export function activity(overrides: Partial<PatientActivity> = {}): PatientActivity {
  return {
    lastSession: { at: '2026-11-03T13:00:00Z', modality: 'in_person' },
    openSessionAt: null,
    emotions: [
      { code: 'anxiety', label: 'Anxiété', family: 'fear', count: 4, delta: 2 },
      { code: 'sadness', label: 'Tristesse', family: 'sadness', count: 2, delta: 0 },
    ],
    feelingCount: 6,
    situations: { count: 3, first: 'Surcharge au travail' },
    drafts: 0,
    followedSince: '2025-03-01',
    ...overrides,
  };
}
