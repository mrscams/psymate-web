import { entry, EMOTIONS, feelingEntry, VERSIONS } from './entry.fixtures';
import {
  draftFromEntry,
  emptyDraft,
  EntryDraft,
  endIso,
  filterEmotions,
  graceInfo,
  hasEmotionLabel,
  occurredDraft,
  startIso,
  toCreateBody,
  toOccurredBody,
  toPatchBody,
  versionDiffs,
} from './entry.model';

function draft(overrides: Partial<EntryDraft>): EntryDraft {
  return { ...emptyDraft(overrides.type ?? 'note', 'clinical', 's-open'), ...overrides };
}

const FORBIDDEN = ['authorType', 'submissionId', 'links'];

describe('entry.model', () => {
  describe('toCreateBody : champs minimaux par type, jamais authorType ni submissionId', () => {
    it.each<[string, Partial<EntryDraft>, Record<string, unknown>]>([
      [
        'note = body',
        { type: 'note', body: '  Dort mal depuis lundi. ', title: '' },
        { type: 'note', body: 'Dort mal depuis lundi.', status: 'final', sessionId: 's-open' },
      ],
      [
        'event = title (+ texte)',
        { type: 'event', title: 'Entretien annuel', body: 'tendu' },
        { type: 'event', title: 'Entretien annuel', body: 'tendu' },
      ],
      [
        'feeling = feeling.emotionCode + feeling.intensity',
        {
          type: 'feeling',
          feeling: { emotionCode: 'anxiety', intensity: 8 },
          body: "n'a pas dormi",
          title: 'ignoré',
        },
        {
          type: 'feeling',
          feeling: { emotionCode: 'anxiety', intensity: 8 },
          body: "n'a pas dormi",
        },
      ],
      [
        'feeling sans intensité : le serveur juge (REQUIRED)',
        { type: 'feeling', feeling: { emotionCode: 'anxiety', intensity: null } },
        { type: 'feeling', feeling: { emotionCode: 'anxiety' } },
      ],
      [
        'medication = medication.molecule (+ dose)',
        { type: 'medication', medication: { molecule: 'Sertraline', dosage: '50 mg' } },
        { type: 'medication', medication: { molecule: 'Sertraline', dosage: '50 mg' } },
      ],
      [
        'session = session.modality, ni titre, ni texte, ni tags, ni sessionId, ni status',
        {
          type: 'session',
          session: { modality: 'video', durationMin: 50 },
          title: 'x',
          body: 'y',
          tags: ['travail'],
        },
        { type: 'session', session: { modality: 'video' }, visibility: 'clinical' },
      ],
    ])('%s', (_label, input, expected) => {
      const body = toCreateBody(draft(input)) as unknown as Record<string, unknown>;
      expect(body).toMatchObject(expected);
      for (const key of FORBIDDEN) expect(key in body).toBe(false);
      if (input.type === 'session') {
        expect(body).toEqual({
          type: 'session',
          session: { modality: 'video' },
          visibility: 'clinical',
        });
      }
      if (input.type === 'feeling') expect('title' in body).toBe(false);
    });

    it('situation : « Maintenant » devient un début exact (obligatoire), en cours sans fin', () => {
      const body = toCreateBody(draft({ type: 'situation', title: 'Arrêt maladie' }));
      expect(body.occurred?.precision).toBe('exact');
      expect(body.occurred?.from).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(body.occurred?.to).toBeUndefined();
    });

    it('Ctrl+S → status draft ; séance vide → pas de sessionId (séance courante du serveur)', () => {
      const body = toCreateBody(draft({ type: 'note', body: 'x', sessionId: '' }), 'draft');
      expect(body.status).toBe('draft');
      expect('sessionId' in body).toBe(false);
    });

    it('tags et visibilité partent tels quels', () => {
      const body = toCreateBody(
        draft({ type: 'note', body: 'x', tags: ['sommeil'], visibility: 'private' }),
      );
      expect(body.tags).toEqual(['sommeil']);
      expect(body.visibility).toBe('private');
    });
  });

  describe('occurred : six précisions en UTC, fin exclusive', () => {
    it.each<[string, Partial<EntryDraft['occurred']>, Record<string, unknown> | undefined]>([
      ['maintenant (non situation) → absent', { now: true }, undefined],
      [
        'jour',
        { now: false, precision: 'day', from: '2026-10-24' },
        { precision: 'day', from: '2026-10-24T00:00:00Z' },
      ],
      [
        'mois',
        { now: false, precision: 'month', from: '2026-10' },
        { precision: 'month', from: '2026-10-01T00:00:00Z' },
      ],
      [
        'année',
        { now: false, precision: 'year', from: '2025' },
        { precision: 'year', from: '2025-01-01T00:00:00Z' },
      ],
      [
        'période : libellé et fin (le lendemain du dernier jour)',
        { now: false, precision: 'period', from: '2025-01-01', to: '2025-02-28', label: 'hiver' },
        {
          precision: 'period',
          from: '2025-01-01T00:00:00Z',
          to: '2025-03-01T00:00:00Z',
          label: 'hiver',
        },
      ],
      [
        'phase de vie : libellé seul',
        { now: false, precision: 'life_phase', label: 'enfance', from: '2001-01-01' },
        { precision: 'life_phase', label: 'enfance' },
      ],
    ])('%s', (_label, occurred, expected) => {
      const base = emptyDraft('event', 'clinical').occurred;
      expect(toOccurredBody({ ...base, ...occurred }, 'event')).toEqual(expected);
    });

    it('exact : heure locale → instant UTC', () => {
      const local = '2026-10-24T15:30';
      expect(startIso('exact', local)).toBe(new Date(local).toISOString());
      expect(startIso('year', '25')).toBeNull();
      expect(endIso('month', '2026-12')).toBe('2027-01-01T00:00:00Z');
    });

    it('situation finie : fin à la précision choisie', () => {
      const base = emptyDraft('situation', 'clinical').occurred;
      expect(
        toOccurredBody(
          {
            ...base,
            now: false,
            precision: 'day',
            from: '2026-10-01',
            ongoing: false,
            to: '2026-10-20',
          },
          'situation',
        ),
      ).toEqual({ precision: 'day', from: '2026-10-01T00:00:00Z', to: '2026-10-21T00:00:00Z' });
    });

    it('occurredDraft relit ce que le serveur renvoie (jour : fin 23:59:59)', () => {
      expect(
        occurredDraft({
          from: '2026-10-24T00:00:00Z',
          to: '2026-10-24T23:59:59Z',
          precision: 'day',
          label: null,
        }),
      ).toMatchObject({ now: false, precision: 'day', from: '2026-10-24', to: '2026-10-24' });
      expect(
        occurredDraft({
          from: '2025-01-01T00:00:00Z',
          to: '2025-03-01T00:00:00Z',
          precision: 'period',
          label: 'hiver',
        }),
      ).toMatchObject({ from: '2025-01-01', to: '2025-02-28', label: 'hiver' });
    });
  });

  describe('toPatchBody : seules les clés modifiées', () => {
    it('rien de changé → null (pas de requête)', () => {
      const e = entry();
      expect(toPatchBody(e, draftFromEntry(e))).toBeNull();
    });

    it('texte et motif ; occurred inchangé absent ; jamais authorType', () => {
      const e = entry();
      const body = toPatchBody(e, { ...draftFromEntry(e), body: 'Corrigé', reason: ' relu ' });
      expect(body).toEqual({ body: 'Corrigé', reason: 'relu' });
      for (const key of FORBIDDEN) expect(key in (body ?? {})).toBe(false);
    });

    it('ressenti : intensité seule fusionnée ; tags remplacés en entier', () => {
      const e = feelingEntry();
      const d = draftFromEntry(e);
      expect(
        toPatchBody(e, {
          ...d,
          feeling: { emotionCode: 'anxiety', intensity: 6 },
          tags: ['sommeil'],
        }),
      ).toEqual({ feeling: { intensity: 6 }, tags: ['sommeil'] });
    });

    it('occurred changé → remplacé en entier', () => {
      const e = entry();
      const d = draftFromEntry(e);
      const body = toPatchBody(e, { ...d, occurred: { ...d.occurred, from: '2026-10-23' } });
      expect(body?.occurred).toEqual({ precision: 'day', from: '2026-10-23T00:00:00Z' });
    });
  });

  describe('graceInfo (G Q31, 1 h 15)', () => {
    const created = '2026-10-24T12:03:00Z';
    const v1 = [{ ...VERSIONS[1], createdAt: created }];

    it('dans la fenêtre : même auteur, sans lien ni autre version → en place', () => {
      const info = graceInfo(entry(), v1, 'u-claire', new Date('2026-10-24T13:00:00Z'));
      expect(info).toMatchObject({
        inGrace: true,
        nextVersion: 1,
        deadline: '2026-10-24T13:18:00.000Z',
      });
    });

    it.each<[string, Parameters<typeof graceInfo>]>([
      ['après 1 h 15', [entry(), v1, 'u-claire', new Date('2026-10-24T13:18:00Z')]],
      ['avec un lien', [entry({ linkCount: 1 }), v1, 'u-claire', new Date('2026-10-24T12:10:00Z')]],
      ['autre auteur', [entry(), v1, 'u-autre', new Date('2026-10-24T12:10:00Z')]],
      [
        'déjà deux versions',
        [entry({ version: 2 }), VERSIONS, 'u-claire', new Date('2026-10-24T12:10:00Z')],
      ],
    ])('hors fenêtre : %s → nouvelle version', (_label, args) => {
      const info = graceInfo(...args);
      expect(info.inGrace).toBe(false);
      expect(info.nextVersion).toBe(args[0].version + 1);
    });
  });

  it('versionDiffs : différences champ par champ, inchangés, la version 1 sans comparaison', () => {
    const [v2, v1] = versionDiffs(VERSIONS);
    expect(v2.changes).toEqual([
      {
        field: 'body',
        before: 'Évaluation tendue avec la responsable.',
        after: 'Évaluation tendue, objectifs revus à la baisse.',
      },
    ]);
    expect(v2.unchanged).toEqual(['title']);
    expect(v1.changes).toEqual([]);
  });

  it('filterEmotions : préfixe sans casse ni accents, par mot ; libellé déjà pris', () => {
    expect(filterEmotions(EMOTIONS, 'anx').map((e) => e.code)).toEqual(['anxiety']);
    expect(filterEmotions(EMOTIONS, 'COLE').map((e) => e.code)).toEqual(['anger']);
    expect(filterEmotions(EMOTIONS, 'inte').map((e) => e.code)).toEqual(['c_1a2b3c4d']);
    expect(filterEmotions(EMOTIONS, '')).toHaveLength(EMOTIONS.length);
    expect(hasEmotionLabel(EMOTIONS, 'anxiete')).toBe(true);
    expect(hasEmotionLabel(EMOTIONS, 'Rumination')).toBe(false);
  });
});
