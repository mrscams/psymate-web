// Données de test de l'éditeur de lien (Vitest seulement) : le catalogue E5.3 tel que le seed V02
// le pose (G Q12), des entrées d'un même dossier et leurs liens.
import { EntryLink, LinkEntry, LinkTypeOption, SourceEntry } from './link.model';

/** E5.3 : huit types, matrice source / cible, libellés français, dans l'ordre du catalogue. */
export const CATALOG: LinkTypeOption[] = [
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

export function source(overrides: Partial<SourceEntry> = {}): SourceEntry {
  return {
    id: 'e-feeling',
    patientId: 'p-marie',
    type: 'feeling',
    title: 'Anxiété 8/10',
    excerpt: "N'a pas dormi avant l'entretien.",
    occurredFrom: '2026-10-24T08:00:00Z',
    occurredTo: null,
    precision: 'day',
    archived: false,
    ...overrides,
  };
}

export const EVENT: LinkEntry = {
  id: 'e-event',
  type: 'event',
  title: "Entretien d'évaluation",
  excerpt: 'Entretien chez le nouvel employeur.',
  occurredFrom: '2026-10-18T09:00:00Z',
  occurredTo: null,
  precision: 'exact',
};

export const SITUATION: LinkEntry = {
  id: 'e-situation',
  type: 'situation',
  title: null,
  excerpt: 'Recherche d’emploi depuis septembre, avec beaucoup de refus.',
  occurredFrom: '2026-09-01T00:00:00Z',
  occurredTo: null,
  precision: 'month',
};

export const MEDICATION: LinkEntry = {
  id: 'e-medication',
  type: 'medication',
  title: 'Sertraline 50 mg',
  excerpt: null,
  occurredFrom: '2026-10-01T00:00:00Z',
  occurredTo: null,
  precision: 'day',
};

/** Lien existant : la situation (source) aggrave le ressenti (entrée ouverte, cible). */
export function link(overrides: Partial<EntryLink> = {}): EntryLink {
  return {
    id: 'l-1',
    linkType: 'worsens',
    sourceId: 'e-situation',
    targetId: 'e-feeling',
    label: 'aggravé par',
    sentence: 'Anxiété 8/10 aggravé par Recherche d’emploi depuis septembre',
    rationale: null,
    createdAt: '2026-10-25T10:00:00Z',
    ...overrides,
  };
}
