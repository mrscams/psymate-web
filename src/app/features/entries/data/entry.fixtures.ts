// Données d'essai de features/entries (Vitest) : modèles de vue tels que EntriesApi les rend.

import { LinkTypeOption } from '../../graph';
import {
  Emotion,
  EntryVersion,
  EntryView,
  LinkCandidate,
  PlacedLink,
  SessionOption,
} from './entry.model';

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

/** E5.3 (G Q12) : huit types, matrice source / cible, libellés français, dans l'ordre du catalogue. */
export const LINK_TYPES: LinkTypeOption[] = [
  {
    code: 'triggers',
    directed: true,
    label: 'déclenche',
    inverseLabel: 'déclenché par',
    sources: ['event', 'situation', 'session'],
    targets: ['feeling', 'situation', 'event'],
    lineStyle: 'solid',
  },
  {
    code: 'caused_by',
    directed: true,
    label: 'est causé par',
    inverseLabel: 'cause',
    sources: ['feeling', 'situation', 'event'],
    targets: ['event', 'situation'],
    lineStyle: 'solid',
  },
  {
    code: 'worsens',
    directed: true,
    label: 'aggrave',
    inverseLabel: 'aggravé par',
    sources: ['situation', 'event', 'medication'],
    targets: ['feeling', 'situation'],
    lineStyle: 'long_dash',
  },
  {
    code: 'relieves',
    directed: true,
    label: 'soulage',
    inverseLabel: 'soulagé par',
    sources: ['event', 'situation', 'medication', 'session'],
    targets: ['feeling', 'situation'],
    lineStyle: 'short_dash',
  },
  {
    code: 'co_occurs',
    directed: false,
    label: 'survient avec',
    inverseLabel: null,
    sources: ['note', 'event', 'situation', 'feeling', 'medication'],
    targets: ['note', 'event', 'situation', 'feeling', 'medication'],
    lineStyle: 'dotted',
  },
  {
    code: 'follows',
    directed: true,
    label: 'fait suite à',
    inverseLabel: 'suivi de',
    sources: ['note', 'event', 'situation', 'feeling'],
    targets: ['note', 'event', 'situation', 'feeling'],
    lineStyle: 'thin',
  },
  {
    code: 'part_of',
    directed: true,
    label: 'fait partie de',
    inverseLabel: 'comprend',
    sources: ['event', 'feeling', 'note'],
    targets: ['situation', 'session'],
    lineStyle: 'thin',
  },
  {
    code: 'treats',
    directed: true,
    label: 'traite',
    inverseLabel: 'traité par',
    sources: ['medication'],
    targets: ['situation', 'feeling'],
    lineStyle: 'double',
  },
];

export function candidate(overrides: Partial<LinkCandidate> = {}): LinkCandidate {
  return {
    id: 'c-event',
    type: 'event',
    title: 'Entretien annuel',
    emotionCode: null,
    intensity: null,
    occurred: { from: '2026-10-18T00:00:00Z', to: null, precision: 'day', label: null },
    ongoing: false,
    ...overrides,
  };
}

/** Le rail de la maquette : une situation en cours, l'événement, un ressenti sans titre. */
export const CANDIDATES: LinkCandidate[] = [
  candidate({
    id: 'c-situation',
    type: 'situation',
    title: 'Surcharge au travail',
    occurred: { from: '2026-03-01T00:00:00Z', to: null, precision: 'month', label: null },
    ongoing: true,
  }),
  candidate(),
  candidate({
    id: 'c-feeling',
    type: 'feeling',
    title: null,
    emotionCode: 'anxiety',
    intensity: 6,
    occurred: { from: '2026-10-17T18:00:00Z', to: null, precision: 'exact', label: null },
  }),
];

export const PLACED_LINKS: PlacedLink[] = [
  {
    id: 'l-1',
    linkType: 'triggers',
    label: 'déclenche',
    sentence: 'Entretien annuel déclenche Anxiété 8/10',
  },
];
