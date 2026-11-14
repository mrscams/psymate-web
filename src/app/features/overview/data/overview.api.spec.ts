import { toView } from './overview.api';

/** La réponse du contrat (le client généré ne s'importe que depuis overview.api.ts). */
type OverviewDto = Parameters<typeof toView>[0];
type SessionKind = NonNullable<NonNullable<OverviewDto['recentSessions']>[number]['kind']>;
const kind = (value: string) => value as unknown as SessionKind;

describe('OverviewApi · toView', () => {
  it('réponse vide : listes vides, compteurs à zéro, fenêtre demandée', () => {
    const view = toView({}, '30d');
    expect(view.window).toBe('30d');
    expect(view.facts).toEqual({
      age: null,
      followedSince: null,
      sessionCount: 0,
      flags: [],
      medications: [],
    });
    expect(view.situations).toEqual([]);
    expect(view.trend).toEqual({ points: [], markers: [] });
    expect(view.feelings).toEqual({ points: [], series: [], markers: [], ticks: [] });
    expect(view.drafts).toEqual({ count: 0, openSession: null });
    expect(view.recentSessions).toEqual([]);
    expect(view.recentActivity).toEqual([]);
  });

  it('traduit les blocs du contrat (familles connues seulement, libellé anglais si demandé)', () => {
    // Valeurs du contrat écrites en texte (les énumérations générées sont des enums de chaînes).
    const dto = {
      window: '12m',
      computedAt: '2026-11-08T10:00:00Z',
      facts: {
        sessionCount: 3,
        flags: [{ kind: 'watch', reason: 'Sommeil', setAt: '2026-10-03T09:00:00Z' }],
        activeMedications: [{ entryId: 'm', molecule: 'Sertraline', dosage: '50 mg' }],
      },
      activeSituations: [{ entryId: 's', title: 'Travail', linkCount: 2, linkedFeelingCount: 1 }],
      trend: {
        points: [{ date: '2026-11-08', averageIntensity: 4.25 }, { date: '2026-11-07' }],
        markers: [
          { entryId: 'x', date: '2026-11-01', kind: 'session', sessionKind: 'intake' },
          { entryId: 'm', date: '2026-10-01', kind: 'medication', change: 'start', label: 'S' },
        ],
      },
      feelings: {
        points: [
          { entryId: 'f', date: '2026-11-02', emotionCode: 'calm', family: 'nope', intensity: 3 },
        ],
        series: [{ emotionCode: 'calm', label: 'Calme', labelEn: 'Calm', family: 'trust' }],
      },
      emotions: { top: [{ code: 'calm', label: 'Calme', count: 4, previousCount: 1, delta: 3 }] },
      drafts: { count: 2, openSession: { entryId: 'o', startedAt: '2026-11-08T09:00:00Z' } },
      recentSessions: [{ entryId: 'r', kind: 'contact', modality: 'phone', entryCount: 1 }],
      recentActivity: [{ entryId: 'a', type: 'medication', status: 'draft', version: 2 }],
    };
    const view = toView(dto as unknown as OverviewDto, '90d', true);
    expect(view.window).toBe('12m');
    expect(view.facts.flags).toEqual([
      { kind: 'watch', reason: 'Sommeil', setAt: '2026-10-03T09:00:00Z' },
    ]);
    expect(view.facts.medications[0]).toMatchObject({ molecule: 'Sertraline', dosage: '50 mg' });
    expect(view.situations[0]).toMatchObject({ title: 'Travail', averageIntensity: null });
    expect(view.trend.points).toEqual([
      { date: '2026-11-08', average: 4.25 },
      { date: '2026-11-07', average: null },
    ]);
    expect(view.trend.markers.map((m) => [m.kind, m.change, m.sessionKind])).toEqual([
      ['session', null, 'intake'],
      ['medication', 'start', null],
    ]);
    expect(view.feelings.points[0].family).toBeNull();
    expect(view.feelings.series[0]).toEqual({
      emotionCode: 'calm',
      family: 'trust',
      label: 'Calm',
      count: 0,
    });
    expect(view.emotions[0].delta).toBe(3);
    // TopEmotionDto n'a que le français : en anglais, le libellé vient des séries de ressentis.
    expect(view.emotions[0].label).toBe('Calm');
    expect(view.drafts.openSession).toEqual({ entryId: 'o', startedAt: '2026-11-08T09:00:00Z' });
    expect(view.recentSessions[0]).toMatchObject({ kind: 'contact', modality: 'phone' });
    expect(view.recentActivity[0]).toMatchObject({ type: 'medication', status: 'draft' });
  });

  it('libellé français par défaut', () => {
    const view = toView(
      {
        feelings: { series: [{ emotionCode: 'calm', label: 'Calme', labelEn: 'Calm' }] },
        emotions: { top: [{ code: 'calm', label: 'Calme' }] },
      },
      '90d',
    );
    expect(view.feelings.series[0].label).toBe('Calme');
    expect(view.emotions[0].label).toBe('Calme');
  });

  it('séance d’accueil renvoyée comme séance ouverte : écartée (elle ne compte pas, règle du contrat)', () => {
    const intake: OverviewDto = {
      recentSessions: [
        { entryId: 'i', kind: kind('intake'), occurredFrom: '2026-11-14T09:00:00Z' },
      ],
      drafts: { count: 0, openSession: { entryId: 'i', startedAt: '2026-11-14T09:00:00Z' } },
    };
    expect(toView(intake, '90d').drafts.openSession).toBeNull();
    const ordinary: OverviewDto = {
      recentSessions: [
        { entryId: 's', kind: kind('session'), occurredFrom: '2026-11-14T09:00:00Z' },
      ],
      drafts: { count: 0, openSession: { entryId: 's', startedAt: '2026-11-14T09:00:00Z' } },
    };
    expect(toView(ordinary, '90d').drafts.openSession).toEqual({
      entryId: 's',
      startedAt: '2026-11-14T09:00:00Z',
    });
  });
});
