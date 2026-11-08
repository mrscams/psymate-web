// Données d'essai de features/entries (Vitest) : modèles de vue tels que EntriesApi les rend.

import { Emotion, EntryVersion, EntryView, SessionOption } from './entry.model';

export const EMOTIONS: Emotion[] = [
  { code: 'anxiety', label: 'Anxiété', family: 'fear', custom: false },
  { code: 'fear', label: 'Peur', family: 'fear', custom: false },
  { code: 'anger', label: 'Colère', family: 'anger', custom: false },
  { code: 'sadness', label: 'Tristesse', family: 'sadness', custom: false },
  { code: 'c_1a2b3c4d', label: 'Vide intérieur', family: 'sadness', custom: true },
];

export const TAGS = ['famille', 'sommeil', 'travail'];

export const CURRENT_SESSION: SessionOption = {
  id: 's-open',
  startedAt: '2026-10-24T13:40:00Z',
  open: true,
};

export const SESSIONS: SessionOption[] = [
  { id: 's-open', startedAt: '2026-10-24T13:40:00Z', open: false },
  { id: 's-old', startedAt: '2026-10-17T13:40:00Z', open: false },
];

export function entry(overrides: Partial<EntryView> = {}): EntryView {
  return {
    id: 'e-1',
    patientId: 'p-marie',
    type: 'event',
    status: 'final',
    visibility: 'clinical',
    title: 'Entretien annuel',
    body: 'Évaluation tendue avec la responsable.',
    occurred: {
      from: '2026-10-24T00:00:00Z',
      to: '2026-10-24T23:59:59Z',
      precision: 'day',
      label: null,
    },
    recordedAt: '2026-10-24T12:03:00Z',
    sessionId: 's-open',
    version: 1,
    tags: ['travail'],
    linkCount: 0,
    feeling: null,
    medication: null,
    session: null,
    archived: false,
    ...overrides,
  };
}

export function feelingEntry(overrides: Partial<EntryView> = {}): EntryView {
  return entry({
    id: 'e-feel',
    type: 'feeling',
    title: null,
    body: "n'a pas dormi",
    occurred: {
      from: '2026-10-24T13:50:00Z',
      to: '2026-10-24T13:50:00Z',
      precision: 'exact',
      label: null,
    },
    tags: [],
    feeling: { emotionCode: 'anxiety', intensity: 8 },
    ...overrides,
  });
}

export const VERSIONS: EntryVersion[] = [
  {
    version: 2,
    title: 'Entretien annuel',
    body: 'Évaluation tendue, objectifs revus à la baisse.',
    reason: 'Précision après la séance',
    authorId: 'u-claire',
    createdAt: '2026-10-24T15:12:00Z',
  },
  {
    version: 1,
    title: 'Entretien annuel',
    body: 'Évaluation tendue avec la responsable.',
    reason: null,
    authorId: 'u-claire',
    createdAt: '2026-10-24T12:03:00Z',
  },
];
