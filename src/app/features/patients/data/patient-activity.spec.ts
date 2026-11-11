import { toActivity } from './patient.api';
import { activity, OMAR, patient } from './patient.fixtures';
import {
  apiSort,
  demoDisplayName,
  hasSessionToday,
  PatientActivity,
  PatientView,
  sortRows,
} from './patient.model';

// UX-B1 : le résumé d'une ligne de la liste vient de la projection vue d'ensemble (30 j), le tri et
// les filtres rapides s'appliquent dans le client à la page lue.

/** Corps de GET /overview (type du client généré, lu au travers de toActivity). */
type OverviewDto = Parameters<typeof toActivity>[0];

const overview: OverviewDto = {
  window: '30d' as NonNullable<OverviewDto['window']>,
  recentSessions: [
    { entryId: 's-2', occurredFrom: '2026-11-09T08:42:00Z', modality: 'video' as never },
    { entryId: 's-1', occurredFrom: '2026-10-15T10:00:00Z', modality: 'in_person' as never },
  ],
  emotions: {
    top: [
      { code: 'anticipation', label: 'Anticipation', count: 3, previousCount: 1, delta: 2 },
      { code: 'serenity', label: 'Sérénité', count: 2, previousCount: 2, delta: 0 },
      { code: 'anger', label: 'Colère', count: 1, previousCount: 0, delta: 1 },
      { code: 'fear', label: 'Peur', count: 1, previousCount: 3, delta: -2 },
    ],
  },
  feelings: {
    series: [
      { emotionCode: 'anticipation', family: 'anticipation', label: 'Anticipation' },
      { emotionCode: 'serenity', family: 'joy', label: 'Sérénité', labelEn: 'Serenity' },
      { emotionCode: 'anger', family: 'not-a-family', label: 'Colère' },
    ],
  },
  activeSituations: [
    { entryId: 'e-1', title: 'Deuil de la grand-mère', linkCount: 15 },
    { entryId: 'e-2', title: 'Travail', linkCount: 6 },
  ],
  drafts: { count: 2, openSession: { entryId: 's-2', startedAt: '2026-11-09T08:42:00Z' } },
  facts: { followedSince: '2025-03-01', sessionCount: 21, flags: [] },
};

describe('toActivity (GET /overview?window=30d → ligne de la liste)', () => {
  it('séance la plus récente, 3 émotions avec famille, situations, brouillons, séance ouverte', () => {
    const view = toActivity(overview);
    expect(view.lastSession).toEqual({ at: '2026-11-09T08:42:00Z', modality: 'video' });
    expect(view.openSessionAt).toBe('2026-11-09T08:42:00Z');
    expect(view.emotions.map((e) => [e.code, e.family, e.delta])).toEqual([
      ['anticipation', 'anticipation', 2],
      ['serenity', 'joy', 0],
      ['anger', null, 1],
    ]);
    expect(view.feelingCount).toBe(7);
    expect(view.situations).toEqual({ count: 2, first: 'Deuil de la grand-mère' });
    expect(view.drafts).toBe(2);
    expect(view.followedSince).toBe('2025-03-01');
  });

  it('anglais : libellé labelEn de la série quand il existe', () => {
    const labels = toActivity(overview, true).emotions.map((e) => e.label);
    expect(labels).toEqual(['Anticipation', 'Serenity', 'Colère']);
  });

  it('dossier vide : ni séance, ni émotion, ni situation', () => {
    expect(toActivity({})).toEqual({
      lastSession: null,
      openSessionAt: null,
      emotions: [],
      feelingCount: 0,
      situations: { count: 0, first: null },
      drafts: 0,
      followedSince: null,
    });
  });
});

describe('tri et filtres de la liste', () => {
  const row = (p: PatientView, a: PatientActivity | null) => ({ patient: p, activity: a });
  const KARIM = patient({ id: 'p-karim', displayName: 'Karim O.' });

  it('apiSort : dernière séance → updated, flags d’abord → name, les autres tels quels', () => {
    expect(apiSort('lastSession')).toBe('updated');
    expect(apiSort('flags')).toBe('name');
    expect(apiSort('created')).toBe('created');
    expect(apiSort('name')).toBe('name');
  });

  it('dernière séance : la plus récente d’abord, sans résumé ni séance à la fin dans l’ordre lu', () => {
    const rows = [
      row(patient(), activity({ lastSession: { at: '2026-10-01T10:00:00Z', modality: null } })),
      row(KARIM, null),
      row(OMAR, activity({ lastSession: { at: '2026-11-05T10:00:00Z', modality: null } })),
      row(patient({ id: 'p-lea' }), activity({ lastSession: null })),
    ];
    expect(sortRows(rows, 'lastSession').map((r) => r.patient.id)).toEqual([
      'p-omar',
      'p-marie',
      'p-karim',
      'p-lea',
    ]);
  });

  it('flags d’abord : patients à drapeau en tête, ordre lu conservé ; tri serveur inchangé', () => {
    const rows = [row(patient(), null), row(KARIM, null), row(OMAR, null)];
    expect(sortRows(rows, 'flags').map((r) => r.patient.id)).toEqual([
      'p-omar',
      'p-marie',
      'p-karim',
    ]);
    expect(sortRows(rows, 'name').map((r) => r.patient.id)).toEqual([
      'p-marie',
      'p-karim',
      'p-omar',
    ]);
  });

  it('aujourd’hui : dernière séance ou séance ouverte du jour (fuseau du navigateur)', () => {
    const now = new Date(2026, 10, 9, 15, 0);
    const today = new Date(2026, 10, 9, 9, 30).toISOString();
    const yesterday = new Date(2026, 10, 8, 18, 0).toISOString();
    expect(hasSessionToday(activity({ lastSession: { at: today, modality: null } }), now)).toBe(
      true,
    );
    expect(
      hasSessionToday(
        activity({ lastSession: { at: yesterday, modality: null }, openSessionAt: today }),
        now,
      ),
    ).toBe(true);
    expect(hasSessionToday(activity({ lastSession: { at: yesterday, modality: null } }), now)).toBe(
      false,
    );
    expect(hasSessionToday(null, now)).toBe(false);
  });

  it('demoDisplayName : préfixe « DEMO · » retiré, autres noms intacts', () => {
    expect(demoDisplayName({ displayName: 'DEMO · Camille R.' })).toBe('Camille R.');
    expect(demoDisplayName({ displayName: 'DEMO-Tristan' })).toBe('DEMO-Tristan');
  });
});
