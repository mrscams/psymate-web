// Données de test de la vue d'ensemble (forme de OverviewView, valeurs fictives).
import { OverviewView } from './overview.model';

/** Un dossier sans aucune donnée : chaque bloc (sauf le résumé) est vide. */
export function emptyOverview(overrides: Partial<OverviewView> = {}): OverviewView {
  return {
    window: '90d',
    computedAt: '2026-11-08T10:00:00Z',
    sourceRev: 1,
    facts: { age: null, followedSince: null, sessionCount: 0, flags: [], medications: [] },
    situations: [],
    trend: { points: [{ date: '2026-11-08', average: null }], markers: [] },
    feelings: { points: [], series: [], markers: [], ticks: [] },
    emotions: [],
    drafts: { count: 0, openSession: null },
    recentSessions: [],
    recentActivity: [],
    narrative: { sentences: [], attention: null },
    sinceLastSession: { lastSessionId: null, lastSessionAt: null, entries: [] },
    ...overrides,
  };
}

/** Marie D. : deux ressentis, une situation, un médicament, deux séances, un drapeau. */
export function overviewView(overrides: Partial<OverviewView> = {}): OverviewView {
  return emptyOverview({
    computedAt: '2026-11-08T10:00:00Z',
    sourceRev: 42,
    facts: {
      age: 34,
      followedSince: '2025-03-12',
      sessionCount: 31,
      flags: [{ kind: 'watch', reason: 'Sommeil', setAt: '2026-10-03T09:00:00Z' }],
      medications: [
        {
          entryId: 'e-med',
          molecule: 'Sertraline',
          dosage: '75 mg',
          frequency: 'matin',
          prescriber: 'Dr Lemaire',
          periodFrom: '2026-09-12',
          since: '2026-09-12T08:00:00Z',
        },
      ],
    },
    situations: [
      {
        entryId: 'e-sit',
        title: 'Surcharge au travail',
        since: '2026-04-01T08:00:00Z',
        linkCount: 7,
        linkedFeelingCount: 5,
        averageIntensity: 7.4,
      },
    ],
    trend: {
      points: [
        { date: '2026-10-20', average: 5.5 },
        { date: '2026-10-21', average: null },
        { date: '2026-11-08', average: 7 },
      ],
      markers: [
        {
          entryId: 's-1',
          date: '2026-10-17',
          kind: 'session',
          change: null,
          label: null,
          sessionKind: 'session',
        },
        {
          entryId: 'e-med',
          date: '2026-09-12',
          kind: 'medication',
          change: 'start',
          label: 'Sertraline 75 mg',
          sessionKind: null,
        },
      ],
    },
    feelings: {
      points: [
        {
          entryId: 'f-1',
          date: '2026-10-20',
          emotionCode: 'anxiety',
          family: 'fear',
          intensity: 8,
          sessionId: 's-1',
        },
        {
          entryId: 'f-2',
          date: '2026-11-07',
          emotionCode: 'joy',
          family: 'joy',
          intensity: 4,
          sessionId: 's-1',
        },
      ],
      series: [
        { emotionCode: 'anxiety', family: 'fear', label: 'Anxiété', count: 1 },
        { emotionCode: 'joy', family: 'joy', label: 'Joie', count: 1 },
      ],
      markers: [],
      ticks: ['2026-10-17'],
    },
    emotions: [
      { code: 'anxiety', label: 'Anxiété', count: 18, previousCount: 12, delta: 6 },
      { code: 'joy', label: 'Joie', count: 2, previousCount: 4, delta: -2 },
    ],
    drafts: { count: 2, openSession: null },
    recentSessions: [
      {
        entryId: 's-1',
        occurredFrom: '2026-10-17T14:00:00Z',
        closedAt: '2026-10-17T14:50:00Z',
        durationMin: 50,
        entryCount: 4,
        kind: 'session',
        modality: 'in_person',
        title: null,
        summary: 'Reprise du thème du travail.\nObjectif : préparer l’entretien.',
        summaryFirstLine: 'Reprise du thème du travail.',
      },
      {
        entryId: 's-0',
        occurredFrom: '2026-10-10T14:00:00Z',
        closedAt: '2026-10-10T14:50:00Z',
        durationMin: 50,
        entryCount: 2,
        kind: 'session',
        modality: 'video',
        title: null,
        summary: null,
        summaryFirstLine: 'Point sur le sommeil.',
      },
    ],
    recentActivity: [
      {
        entryId: 'f-2',
        type: 'feeling',
        title: 'Joie après la randonnée',
        status: 'draft',
        visibility: 'clinical',
        recordedAt: '2026-11-07T18:00:00Z',
        occurredFrom: '2026-11-07T17:00:00Z',
        version: 1,
      },
    ],
    ...overrides,
  });
}
