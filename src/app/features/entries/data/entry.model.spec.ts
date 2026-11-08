import { EntryType } from '../../../shared/ui';
import { candidate, entry, EMOTIONS, feelingEntry, LINK_TYPES, VERSIONS } from './entry.fixtures';
import {
  draftFromEntry,
  draftFromPrefill,
  emptyDraft,
  EntryDraft,
  endIso,
  filterEmotions,
  graceInfo,
  hasEmotionLabel,
  linkChoices,
  occurredDraft,
  railCandidates,
  reconcileLinks,
  sameLinks,
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

  describe('rail « Lié à… » (M2-05)', () => {
    /** Premier type proposé : code et sens, vus depuis la nouvelle entrée. */
    const first = (entryType: EntryType, targetType: EntryType) => {
      const choice = linkChoices(LINK_TYPES, entryType, targetType)[0];
      return choice ? `${choice.linkType}:${choice.direction}` : null;
    };

    it.each<[EntryType, EntryType, string | null]>([
      // Fiche 05 : cocher « Entretien annuel » depuis un ressenti pose triggers en incoming.
      ['feeling', 'event', 'triggers:incoming'],
      ['feeling', 'situation', 'triggers:incoming'],
      ['feeling', 'medication', 'worsens:incoming'],
      ['feeling', 'feeling', 'co_occurs:outgoing'],
      ['feeling', 'note', 'co_occurs:outgoing'],
      ['event', 'event', 'triggers:incoming'],
      ['event', 'feeling', 'caused_by:incoming'],
      ['situation', 'medication', 'worsens:incoming'],
      ['medication', 'feeling', 'co_occurs:outgoing'],
      ['note', 'situation', 'co_occurs:outgoing'],
      ['note', 'medication', 'co_occurs:outgoing'],
      // Une séance n'est source que de triggers / relieves et cible de part_of.
      ['feeling', 'session', 'triggers:incoming'],
      ['note', 'session', 'part_of:outgoing'],
      ['medication', 'session', null],
    ])('%s → cible %s : %s', (entryType, targetType, expected) => {
      expect(first(entryType, targetType)).toBe(expected);
    });

    it('tous les choix sont dans la matrice E5.3 (aucun type hors matrice proposé)', () => {
      const types: EntryType[] = ['note', 'event', 'situation', 'feeling', 'session', 'medication'];
      for (const entryType of types) {
        for (const targetType of types) {
          for (const choice of linkChoices(LINK_TYPES, entryType, targetType)) {
            const type = LINK_TYPES.find((item) => item.code === choice.linkType)!;
            const [from, to] =
              choice.direction === 'incoming' ? [targetType, entryType] : [entryType, targetType];
            expect(type.sources).toContain(from);
            expect(type.targets).toContain(to);
          }
        }
      }
    });

    it('verbe vu depuis la nouvelle entrée : inverse en incoming, direct en outgoing, symétrique une fois', () => {
      const choices = linkChoices(LINK_TYPES, 'feeling', 'event');
      expect(choices.map((choice) => choice.label)).toEqual([
        'déclenché par',
        'aggravé par',
        'soulagé par',
        'survient avec',
        'suivi de',
        'est causé par',
        'fait suite à',
      ]);
      expect(choices.filter((choice) => choice.linkType === 'co_occurs')).toHaveLength(1);
    });

    it('railCandidates : situations en cours, puis récentes, sans doublon, cinq au plus', () => {
      const list = railCandidates(
        [
          candidate({ id: 's-1', type: 'situation', ongoing: true }),
          candidate({ id: 's-done', type: 'situation', ongoing: false }),
        ],
        [candidate({ id: 's-1', type: 'situation', ongoing: true }), candidate({ id: 'e-1' })],
      );
      expect(list.map((item) => item.id)).toEqual(['s-1', 'e-1']);
      const many = Array.from({ length: 8 }, (_, i) => candidate({ id: `e-${i}` }));
      expect(railCandidates([], many)).toHaveLength(5);
    });

    it('reconcileLinks : type gardé s’il reste permis, reproposé sinon, lien retiré si cible absente', () => {
      const event = candidate({ id: 'c-event', type: 'event' });
      const links = [
        { targetId: 'c-event', linkType: 'triggers', direction: 'incoming' } as const,
        { targetId: 'c-gone', linkType: 'co_occurs', direction: 'outgoing' } as const,
      ];
      expect(reconcileLinks(links, [event], LINK_TYPES, 'feeling')).toEqual([links[0]]);
      // L'entrée devient une note : triggers ne vaut plus pour (événement → note), co_occurs proposé.
      expect(reconcileLinks(links, [event], LINK_TYPES, 'note')).toEqual([
        { targetId: 'c-event', linkType: 'co_occurs', direction: 'outgoing' },
      ]);
      expect(sameLinks(links, [...links])).toBe(true);
      expect(sameLinks(links, [links[0]])).toBe(false);
    });

    it('toCreateBody : links[] {targetId, linkType, direction} ; aucun pour une séance', () => {
      const link = { targetId: 'c-event', linkType: 'triggers', direction: 'incoming' } as const;
      expect(
        toCreateBody(
          draft({
            type: 'feeling',
            feeling: { emotionCode: 'anxiety', intensity: 8 },
            links: [link],
          }),
        ).links,
      ).toEqual([link]);
      expect(
        toCreateBody(
          draft({
            type: 'session',
            session: { modality: 'in_person', durationMin: null },
            links: [link],
          }),
        ),
      ).not.toHaveProperty('links');
    });

    it('draftFromEntry : une correction ne coche aucun lien', () => {
      expect(draftFromEntry(entry({ linkCount: 2 })).links).toEqual([]);
    });
  });
  describe('draftFromPrefill (barre de commande, M6-02)', () => {
    it('saisie interprétée → brouillon du panneau → même corps de POST', () => {
      const link = {
        targetId: 'e-event',
        linkType: 'triggers' as const,
        direction: 'incoming' as const,
      };
      const feeling = draftFromPrefill(
        {
          type: 'feeling',
          feeling: { emotionCode: 'anxiety', intensity: 8 },
          body: "n'a pas dormi",
          occurred: null,
          links: [link],
        },
        'clinical',
      );
      expect(feeling).toMatchObject({
        type: 'feeling',
        body: "n'a pas dormi",
        feeling: { emotionCode: 'anxiety', intensity: 8 },
        occurred: { now: true },
        sessionId: '',
        links: [link],
      });
      expect(toCreateBody(feeling)).toEqual({
        type: 'feeling',
        visibility: 'clinical',
        feeling: { emotionCode: 'anxiety', intensity: 8 },
        body: "n'a pas dormi",
        status: 'final',
        links: [link],
      });
    });

    it('moment du contrat (jour, période) : rendu tel quel par toCreateBody', () => {
      const day = draftFromPrefill(
        {
          type: 'event',
          title: 'Entretien',
          occurred: { from: '2026-11-10T00:00:00Z', precision: 'day' },
        },
        'private',
      );
      expect(day.occurred).toMatchObject({ now: false, precision: 'day', from: '2026-11-10' });
      expect(toCreateBody(day, 'draft')).toEqual({
        type: 'event',
        visibility: 'private',
        title: 'Entretien',
        occurred: { from: '2026-11-10T00:00:00Z', precision: 'day' },
        status: 'draft',
      });
      const summer = draftFromPrefill(
        {
          type: 'situation',
          title: 'burn-out',
          occurred: {
            from: '2024-06-01T00:00:00Z',
            to: '2024-09-01T00:00:00Z',
            precision: 'period',
            label: 'été 2024',
          },
        },
        'clinical',
      );
      expect(toCreateBody(summer).occurred).toEqual({
        from: '2024-06-01T00:00:00Z',
        to: '2024-09-01T00:00:00Z',
        precision: 'period',
        label: 'été 2024',
      });
    });
  });
});
