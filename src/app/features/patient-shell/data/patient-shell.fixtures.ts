import {
  NotedEntry,
  PreviousSession,
  SessionContext,
  SessionReminders,
  ShellPatient,
  ShellSession,
} from './patient-shell.model';

// Données de test de features/patient-shell (specs du store, de la page, de l'onglet Séance et du
// panneau de clôture).

export function shellPatient(overrides: Partial<ShellPatient> = {}): ShellPatient {
  return {
    id: 'p-marie',
    displayName: 'Marie D.',
    birthDate: '1992-05-10',
    followedSince: '2025-03-04',
    flags: ['watch'],
    sessionModality: 'in_person',
    plannedDurationMin: null,
    ...overrides,
  };
}

export function openSession(overrides: Partial<ShellSession> = {}): ShellSession {
  return {
    id: 's-open',
    kind: 'session',
    startedAt: '2026-10-24T14:00:00Z',
    modality: 'in_person',
    closedAt: null,
    durationMin: null,
    summary: null,
    ...overrides,
  };
}

export function closedSession(overrides: Partial<ShellSession> = {}): ShellSession {
  return {
    id: 's-closed',
    kind: 'session',
    startedAt: '2026-10-17T09:00:00Z',
    modality: 'video',
    closedAt: '2026-10-17T10:00:00Z',
    durationMin: 60,
    summary: null,
    ...overrides,
  };
}

export function intakeSession(): ShellSession {
  return {
    id: 's-intake',
    kind: 'intake',
    startedAt: '2026-10-01T08:00:00Z',
    modality: 'in_person',
    closedAt: null,
    durationMin: null,
    summary: null,
  };
}

export function notedEntry(overrides: Partial<NotedEntry> = {}): NotedEntry {
  return {
    id: 'e-1',
    type: 'note',
    title: null,
    status: 'final',
    recordedAt: '2026-10-24T14:12:00Z',
    occurredFrom: '2026-10-24T14:12:00Z',
    emotionCode: null,
    intensity: null,
    linkCount: 0,
    ongoing: false,
    ...overrides,
  };
}

export function previousSession(overrides: Partial<PreviousSession> = {}): PreviousSession {
  return {
    id: 's-closed',
    kind: 'session',
    startedAt: '2026-10-17T09:00:00Z',
    durationMin: 50,
    modality: 'in_person',
    summary:
      'Reprise du thème du sommeil ; refus du passage de jour.\n\nProchaine fois :\n– Relire l’agenda du sommeil\n– Demander si le certificat a été fait',
    ...overrides,
  };
}

export function reminders(overrides: Partial<SessionReminders> = {}): SessionReminders {
  return {
    flags: [{ kind: 'watch', reason: 'sommeil très dégradé' }],
    medications: [{ entryId: 'm-1', molecule: 'Mélatonine', dosage: '2 mg le soir', since: null }],
    situations: [{ entryId: 'sit-1', title: 'Réorganisation du service de nuit', since: null }],
    since: {
      lastSessionAt: '2026-10-17T09:00:00Z',
      entries: [
        { entryId: 'f-1', type: 'feeling', title: null, occurredFrom: '2026-10-20T10:00:00Z' },
      ],
    },
    ...overrides,
  };
}

export function sessionContext(overrides: Partial<SessionContext> = {}): SessionContext {
  return {
    previous: previousSession(),
    reminders: reminders(),
    emotionLabels: { anxiety: 'Anxiété', sadness: 'Tristesse' },
    ...overrides,
  };
}
