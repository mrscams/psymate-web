import { toActivity } from './patient.api';
import { activity, OMAR, patient } from './patient.fixtures';
import {
  apiSort,
  demoDisplayName,
  PatientActivity,
  PatientView,
  sortRows,
  todayStatus,
} from './patient.model';

// UX-S7 : le résumé d'une ligne de la liste vient de la projection vue d'ensemble (30 j), le tri
// « Dernière séance » et les filtres rapides s'appliquent dans le client à la page affichée.

/** Corps de GET /overview (type du client généré, lu au travers de toActivity). */
type OverviewDto = Parameters<typeof toActivity>[0];

const overview: OverviewDto = {
  window: '30d' as NonNullable<OverviewDto['window']>,
  recentSessions: [
    {
      entryId: 's-2',
      occurredFrom: '2026-11-09T08:42:00Z',
      closedAt: '2026-11-09T09:30:00Z',
      modality: 'video' as never,
      entryCount: 3,
      summary: '  ',
    },
    { entryId: 's-1', occurredFrom: '2026-10-15T10:00:00Z', modality: 'in_person' as never },
  ],
  sinceLastSession: {
    lastSessionAt: '2026-11-09T08:42:00Z',
    entries: [
      { entryId: 'f-1', type: 'feeling' as never },
      { entryId: 'n-1', type: 'note' as never },
      { entryId: 'f-2', type: 'feeling' as never },
    ],
  },
  emotions: {
    top: [
      { code: 'anticipation', label: 'Anticipation', count: 3, previousCount: 1, delta: 2 },
      { code: 'serenity', label: 'Sérénité', count: 2, previousCount: 2, delta: 0 },
    ],
  },
  feelings: {
    series: [
      { emotionCode: 'anticipation', label: 'Anticipation', labelEn: 'Anticipation' },
      { emotionCode: 'anxiety', label: 'Anxiété', labelEn: 'Anxiety' },
    ],
    points: [
      { entryId: 'f-1', emotionCode: 'anxiety', intensity: 7 },
      { entryId: 'f-2', emotionCode: 'anticipation', intensity: 4 },
      { entryId: 'f-old', emotionCode: 'anxiety', intensity: 9 },
    ],
  },
  trend: {
    points: [
      { date: '2026-11-12', averageIntensity: 6.5 },
      { date: '2026-11-13' },
      { date: '2026-11-14', averageIntensity: 5 },
    ],
  },
  activeSituations: [
    { entryId: 'e-1', title: 'Deuil de la grand-mère', linkCount: 15 },
    { entryId: 'e-2', title: 'Travail', linkCount: 6 },
  ],
  drafts: { count: 2, openSession: { entryId: 's-3', startedAt: '2026-11-10T08:42:00Z' } },
  facts: { followedSince: '2025-03-01', sessionCount: 21, flags: [] },
};

describe('toActivity (GET /overview?window=30d → ligne de la liste)', () => {
  it('séance la plus récente, séance ouverte, depuis la séance, courbe, émotion dominante', () => {
    const view = toActivity(overview);
    expect(view.lastSession).toEqual({
      at: '2026-11-09T08:42:00Z',
      closedAt: '2026-11-09T09:30:00Z',
      modality: 'video',
      entryCount: 3,
      reportMissing: true,
    });
    expect(view.openSessionAt).toBe('2026-11-10T08:42:00Z');
    // Ressenti le plus fort parmi les entrées depuis la séance (f-old n'en fait pas partie).
    expect(view.since).toEqual({
      entries: 3,
      capped: false,
      strongest: { label: 'Anxiété', intensity: 7 },
    });
    expect(view.intensities).toEqual([6.5, null, 5]);
    expect(view.feelingCount).toBe(3);
    expect(view.dominant).toEqual({ label: 'Anticipation', delta: 2 });
    expect(view.situations).toEqual({ count: 2, first: 'Deuil de la grand-mère' });
    expect(view.drafts).toBe(2);
    expect(view.followedSince).toBe('2025-03-01');
  });

  it('en anglais : libellés anglais des émotions', () => {
    expect(toActivity(overview, true).since.strongest?.label).toBe('Anxiety');
  });

  it('séance clôturée avec un compte rendu : rien à écrire ; séance non clôturée (accueil) non plus', () => {
    const written = toActivity({
      recentSessions: [
        {
          occurredFrom: '2026-11-09T08:42:00Z',
          closedAt: '2026-11-09T09:30:00Z',
          summary: 'Point.',
        },
      ],
    });
    expect(written.lastSession?.reportMissing).toBe(false);
    const intake = toActivity({ recentSessions: [{ occurredFrom: '2026-11-09T08:42:00Z' }] });
    expect(intake.lastSession?.reportMissing).toBe(false);
    expect(intake.lastSession?.closedAt).toBeNull();
  });

  it('20 entrées depuis la séance : plafond du contrat (« 20+ »)', () => {
    const entries = Array.from({ length: 20 }, (_, i) => ({
      entryId: `n-${i}`,
      type: 'note' as never,
    }));
    expect(toActivity({ sinceLastSession: { entries } }).since).toEqual({
      entries: 20,
      capped: true,
      strongest: null,
    });
  });

  it('projection vide : valeurs neutres', () => {
    expect(toActivity({})).toEqual({
      lastSession: null,
      openSessionAt: null,
      since: { entries: 0, capped: false, strongest: null },
      intensities: [],
      feelingCount: 0,
      dominant: null,
      situations: { count: 0, first: null },
      drafts: 0,
      followedSince: null,
    });
  });
});

describe('tri client et bande du jour', () => {
  const row = (p: PatientView, a: PatientActivity | null) => ({ patient: p, activity: a });

  it('apiSort : Dernière séance part en updated, les autres tels quels', () => {
    expect(apiSort('lastSession')).toBe('updated');
    expect(apiSort('name')).toBe('name');
    expect(apiSort('created')).toBe('created');
  });

  it('sortRows « Dernière séance » : la plus récente d’abord, sans résumé ensuite dans l’ordre reçu', () => {
    const rows = [
      row(patient({ id: 'a' }), null),
      row(patient({ id: 'b' }), activity()),
      row(OMAR, activity({ openSessionAt: '2026-11-12T10:00:00Z' })),
      row(patient({ id: 'c' }), activity({ lastSession: null })),
    ];
    expect(sortRows(rows, 'lastSession').map((r) => r.patient.id)).toEqual([
      'p-omar',
      'b',
      'a',
      'c',
    ]);
    expect(sortRows(rows, 'name').map((r) => r.patient.id)).toEqual(['a', 'b', 'p-omar', 'c']);
  });

  it('todayStatus : séance ouverte, clôturée aujourd’hui, sinon rien', () => {
    const now = new Date();
    const today = new Date(now.getTime() - 60_000).toISOString();
    const yesterday = new Date(now.getTime() - 86_400_000 * 2).toISOString();
    const closed = (closedAt: string) =>
      activity({
        lastSession: {
          at: closedAt,
          closedAt,
          modality: null,
          entryCount: 0,
          reportMissing: false,
        },
      });
    expect(todayStatus(activity({ openSessionAt: yesterday }), now)).toBe('open');
    expect(todayStatus(closed(today), now)).toBe('closed');
    expect(todayStatus(closed(yesterday), now)).toBeNull();
    expect(todayStatus(null, now)).toBeNull();
  });

  it('demoDisplayName retire le préfixe « DEMO · »', () => {
    expect(demoDisplayName({ displayName: 'DEMO · Camille R.' })).toBe('Camille R.');
  });
});
