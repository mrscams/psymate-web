import { ShellPatient, ShellSession } from './patient-shell.model';

// Données de test de features/patient-shell (specs du store et de la page).

export function shellPatient(overrides: Partial<ShellPatient> = {}): ShellPatient {
  return {
    id: 'p-marie',
    displayName: 'Marie D.',
    birthDate: '1992-05-10',
    followedSince: '2025-03-04',
    flags: ['watch'],
    sessionModality: 'in_person',
    ...overrides,
  };
}

export function openSession(overrides: Partial<ShellSession> = {}): ShellSession {
  return {
    id: 's-open',
    kind: 'session',
    startedAt: '2026-10-24T14:00:00Z',
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
    closedAt: null,
    durationMin: null,
    summary: null,
  };
}
