// Données de test de features/search (Vitest) : modèles de vue prêts à l'emploi.

import { EntryPreview, parseMarked, SearchHit, SearchPage, TypeCount } from './search.model';

export function hit(overrides: Partial<SearchHit> = {}): SearchHit {
  return {
    entryId: 'e-entretien',
    type: 'event',
    title: parseMarked('<mark>Entretien</mark> d&#39;évaluation avec le <mark>manager</mark>'),
    snippet: parseMarked('Préparé trois phrases pour l&#39;<mark>entretien</mark>.'),
    occurredFrom: '2026-10-18T00:00:00Z',
    occurredTo: null,
    precision: 'day',
    sessionId: 's-17oct',
    tags: ['travail'],
    version: 1,
    visibility: 'clinical',
    archived: false,
    approximate: false,
    ...overrides,
  };
}

export const FEELING = hit({
  entryId: 'e-anxiete',
  type: 'feeling',
  title: null,
  snippet: parseMarked('Je tourne en boucle sur ce que je vais dire au <mark>manager</mark>.'),
  occurredFrom: '2026-10-17T17:40:00Z',
  precision: 'exact',
  tags: [],
});

export const NOTE_JUNE = hit({
  entryId: 'e-note-juin',
  type: 'note',
  title: parseMarked('Le <mark>manager</mark> a changé en juin'),
  snippet: null,
  occurredFrom: '2026-06-14T00:00:00Z',
  sessionId: null,
});

export function counts(values: Partial<Record<TypeCount['type'], number>> = {}): TypeCount[] {
  return (['note', 'event', 'situation', 'feeling', 'session', 'medication'] as const).map(
    (type) => ({ type, count: values[type] ?? 0 }),
  );
}

export function searchPage(overrides: Partial<SearchPage> = {}): SearchPage {
  const exact = overrides.exact ?? [hit(), FEELING];
  return {
    total: exact.length,
    page: 1,
    pageSize: 20,
    tookMs: 42,
    exact,
    approximate: [],
    counts: counts({ event: 1, feeling: 1 }),
    query: { text: 'entretien manager', tags: [], emotions: [], before: null, after: null },
    ...overrides,
  };
}

export function entryPreview(overrides: Partial<EntryPreview> = {}): EntryPreview {
  return {
    id: 'e-entretien',
    type: 'event',
    title: "Entretien d'évaluation avec le manager",
    body: 'Annoncé le 17 en séance. On a préparé trois phrases pour l’entretien.',
    occurred: { from: '2026-10-18T00:00:00Z', to: null, precision: 'day', label: null },
    recordedAt: '2026-10-17T08:42:00Z',
    sessionId: 's-17oct',
    version: 1,
    visibility: 'clinical',
    archived: false,
    intensity: null,
    links: [{ id: 'l-1', sentence: 'Entretien déclenche Anxiété' }],
    ...overrides,
  };
}
