import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { SessionStore } from '../../../core/auth';
import { PreferencesStore } from '../../../core/preferences';
import { EntriesApi } from './entries.api';
import { EntryEditorStore } from './entry-editor.store';
import {
  CANDIDATES,
  candidate,
  CURRENT_SESSION,
  EMOTIONS,
  entry,
  feelingEntry,
  LINK_TYPES,
  PLACED_LINKS,
  SESSIONS,
  TAGS,
  VERSIONS,
} from './entry.fixtures';
import { emptyDraft, EntryDraft } from './entry.model';

type Api = Partial<Record<keyof EntriesApi, ReturnType<typeof vi.fn>>>;

function setup(
  api: Api = {},
  me = signal<{ id: string } | null>({ id: 'u-claire' }),
  medicationVisible = true,
) {
  const mock: Api = {
    emotions: vi.fn().mockResolvedValue(EMOTIONS),
    tagLabels: vi.fn().mockResolvedValue(TAGS),
    currentSession: vi.fn().mockResolvedValue(CURRENT_SESSION),
    sessionsOf: vi.fn().mockResolvedValue(SESSIONS),
    get: vi.fn().mockResolvedValue(entry()),
    versions: vi.fn().mockResolvedValue([VERSIONS[1]]),
    create: vi
      .fn()
      .mockImplementation(async (_p: string, body: { type: string }) =>
        entry({ id: 'e-new', type: body.type as never }),
      ),
    patch: vi.fn().mockResolvedValue(entry({ version: 2 })),
    createEmotion: vi.fn(),
    linkTypes: vi.fn().mockResolvedValue(LINK_TYPES),
    railSource: vi.fn().mockResolvedValue({ situations: [], recent: CANDIDATES }),
    linksOf: vi.fn().mockResolvedValue(PLACED_LINKS),
    ...api,
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: EntriesApi, useValue: mock },
      { provide: SessionStore, useValue: { me } },
      {
        provide: PreferencesStore,
        useValue: {
          defaultVisibility: signal('clinical'),
          medicationVisible: signal(medicationVisible),
        },
      },
    ],
  });
  return { store: TestBed.inject(EntryEditorStore), api: mock, me };
}

const problem422 = {
  status: 422,
  code: 'VALIDATION_FAILED',
  errors: [
    { field: 'feeling.intensity', code: 'REQUIRED', message: "L'intensité est obligatoire." },
  ],
};

function draft(overrides: Partial<EntryDraft>): EntryDraft {
  return { ...emptyDraft(overrides.type ?? 'note', 'clinical', 's-open'), ...overrides };
}

describe('EntryEditorStore', () => {
  it('ouverture en création : brouillon vide avec le texte de la barre, séance courante, vocabulaire', async () => {
    const { store, api } = setup();
    const pending = store.open({ patientId: 'p-marie', text: "n'a pas dormi" });
    expect(store.mode()).toBe('create');
    expect(store.currentDraft()).toMatchObject({ type: 'note', body: "n'a pas dormi" });
    await pending;
    expect(store.currentSession()).toEqual(CURRENT_SESSION);
    expect(store.sessionOptions()[0]).toEqual({ ...SESSIONS[0], open: true });
    expect(store.emotions().data).toHaveLength(EMOTIONS.length);
    expect(store.tags().data).toEqual(TAGS);
    expect(api.get).not.toHaveBeenCalled();

    // Le vocabulaire est gardé d'une ouverture à l'autre.
    await store.open({ patientId: 'p-marie' });
    expect(api.emotions).toHaveBeenCalledTimes(1);
    expect(api.currentSession).toHaveBeenCalledTimes(2);
  });

  it('nom du patient (sous-titre) : lu une fois par patient, oublié au changement, vide en erreur', async () => {
    const patientName = vi
      .fn()
      .mockImplementation(async (id: string) => (id === 'p-marie' ? 'Marie D.' : 'Paul R.'));
    const { store } = setup({ patientName });
    await store.open({ patientId: 'p-marie' });
    expect(store.patientName()).toBe('Marie D.');
    await store.open({ patientId: 'p-marie', entryId: 'e-1' });
    expect(patientName).toHaveBeenCalledTimes(1);
    await store.open({ patientId: 'p-paul' });
    expect(store.patientName()).toBe('Paul R.');

    TestBed.resetTestingModule();
    const failing = setup({
      patientName: vi.fn().mockRejectedValue({ status: 0, code: 'NETWORK_ERROR' }),
    }).store;
    await failing.open({ patientId: 'p-marie' });
    expect(failing.patientName()).toBe('');
    expect(failing.emotions().status).toBe('loaded');
  });

  it('types proposés : Médicament masqué si entryTypes.medicationVisible = false, sauf en correction d’un médicament', async () => {
    const { store } = setup({}, undefined, false);
    await store.open({ patientId: 'p-marie' });
    expect(store.types()).toEqual(['note', 'event', 'situation', 'feeling', 'session']);

    TestBed.resetTestingModule();
    const edit = setup(
      { get: vi.fn().mockResolvedValue(entry({ type: 'medication' })) },
      undefined,
      false,
    ).store;
    await edit.open({ patientId: 'p-marie', entryId: 'e-1' });
    expect(edit.types()).toContain('medication');
  });

  it('sans séance (404 NO_CURRENT_SESSION) : séance courante null, liste vide', async () => {
    const { store } = setup({
      currentSession: vi.fn().mockResolvedValue(null),
      sessionsOf: vi.fn().mockResolvedValue([]),
    });
    await store.open({ patientId: 'p-new' });
    expect(store.currentSession()).toBeNull();
    expect(store.sessionOptions()).toEqual([]);
  });

  describe('save en création : un POST par type, jamais authorType ni submissionId', () => {
    it.each<[string, Partial<EntryDraft>]>([
      ['note', { type: 'note', body: 'Dort mal' }],
      ['event', { type: 'event', title: 'Entretien annuel' }],
      ['situation', { type: 'situation', title: 'Arrêt maladie' }],
      ['feeling', { type: 'feeling', feeling: { emotionCode: 'anxiety', intensity: 8 } }],
      ['session', { type: 'session', session: { modality: 'in_person', durationMin: null } }],
      ['medication', { type: 'medication', medication: { molecule: 'Sertraline', dosage: '' } }],
    ])('%s', async (type, input) => {
      const { store, api } = setup();
      await store.open({ patientId: 'p-marie', type: input.type });
      const saved = await store.save(draft(input));
      expect(saved?.type).toBe(type);
      const [patientId, body] = api.create!.mock.calls[0] as [string, Record<string, unknown>];
      expect(patientId).toBe('p-marie');
      expect(body['type']).toBe(type);
      expect(JSON.stringify(body)).not.toMatch(/authorType|submissionId/);
      // Succès : le brouillon est effacé.
      expect(store.currentDraft()).toBeNull();
    });
  });

  it('Ctrl+S : status draft', async () => {
    const { store, api } = setup();
    await store.open({ patientId: 'p-marie' });
    await store.save(draft({ type: 'note', body: 'à compléter' }), 'draft');
    expect(api.create!.mock.calls[0][1]).toMatchObject({ status: 'draft' });
  });

  it('422 : problème rangé par champ, brouillon conservé, rien de perdu', async () => {
    const { store } = setup({ create: vi.fn().mockRejectedValue(problem422) });
    await store.open({ patientId: 'p-marie' });
    const input = draft({ type: 'feeling', feeling: { emotionCode: 'anxiety', intensity: null } });
    expect(await store.save(input)).toBeNull();
    expect(store.saving()).toBe(false);
    expect(store.errors()).toEqual({ 'feeling.intensity': "L'intensité est obligatoire." });
    expect(store.currentDraft()).toEqual(input);
  });

  it('SESSION_REQUIRED (code racine, errors[0].field = sessionId) : erreur du champ séance', async () => {
    const { store } = setup({
      create: vi.fn().mockRejectedValue({
        status: 422,
        code: 'SESSION_REQUIRED',
        errors: [
          {
            field: 'sessionId',
            code: 'SESSION_REQUIRED',
            message: 'Toute entrée appartient à une séance',
          },
        ],
      }),
    });
    await store.open({ patientId: 'p-new' });
    await store.save(draft({ type: 'note', body: 'x', sessionId: '' }));
    expect(store.problem()?.code).toBe('SESSION_REQUIRED');
    expect(store.errors()['sessionId']).toBe('Toute entrée appartient à une séance');
  });

  it('brouillon : gardé par patient à la fermeture, rendu à la réouverture, oublié si le compte change', async () => {
    const { store, me } = setup();
    await store.open({ patientId: 'p-marie' });
    const typed = draft({
      type: 'feeling',
      feeling: { emotionCode: 'anxiety', intensity: 8 },
      body: 'x',
    });
    store.keepDraft('create:p-marie', typed);
    store.closed('create:p-marie');
    expect(store.active()).toBe(false);

    await store.open({ patientId: 'p-autre' });
    expect(store.currentDraft()?.type).toBe('note');
    // Le texte de la barre de capture s'ajoute au texte du brouillon : rien ne se perd.
    await store.open({ patientId: 'p-marie', text: 'et fait des cauchemars' });
    expect(store.currentDraft()).toEqual({ ...typed, body: 'x\net fait des cauchemars' });
    expect(store.isOpenOn({ patientId: 'p-marie' })).toBe(true);

    // Déconnexion : les brouillons cliniques sont effacés aussitôt, sans attendre une ouverture.
    me.set(null);
    TestBed.tick();
    expect(store.drafts()).toEqual({});
    me.set({ id: 'u-autre' });
    await store.open({ patientId: 'p-marie' });
    expect(store.currentDraft()?.body).toBe('');
  });

  describe('correction', () => {
    it('ouverture : entrée, versions, brouillon depuis l’entrée ; grâce annoncée', async () => {
      vi.useFakeTimers({ now: new Date('2026-10-24T12:30:00Z'), toFake: ['Date'] });
      const { store, api } = setup();
      await store.open({ patientId: 'p-marie', entryId: 'e-1' });
      vi.useRealTimers();
      expect(api.get).toHaveBeenCalledWith('e-1');
      expect(store.mode()).toBe('edit');
      expect(store.currentDraft()?.title).toBe('Entretien annuel');
      expect(store.grace()).toMatchObject({ inGrace: true, nextVersion: 1 });
      expect(api.currentSession).not.toHaveBeenCalled();
    });

    it('hors grâce : PATCH des seules clés modifiées avec le motif, puis relecture des versions', async () => {
      const { store, api } = setup({
        versions: vi.fn().mockResolvedValueOnce([VERSIONS[1]]).mockResolvedValueOnce(VERSIONS),
      });
      await store.open({ patientId: 'p-marie', entryId: 'e-1' });
      expect(store.grace()).toMatchObject({ inGrace: false, nextVersion: 2 });
      const current = store.currentDraft()!;
      const saved = await store.save({ ...current, body: 'Corrigé', reason: 'relu' });
      expect(api.patch).toHaveBeenCalledWith('e-1', { body: 'Corrigé', reason: 'relu' });
      expect(JSON.stringify(api.patch!.mock.calls[0][1])).not.toMatch(/authorType|submissionId/);
      expect(saved?.version).toBe(2);
      expect(store.versionCount()).toBe(2);
    });

    it('rien de modifié : aucune requête, l’entrée telle quelle', async () => {
      const { store, api } = setup({ get: vi.fn().mockResolvedValue(feelingEntry()) });
      await store.open({ patientId: 'p-marie', entryId: 'e-feel' });
      const saved = await store.save(store.currentDraft()!);
      expect(api.patch).not.toHaveBeenCalled();
      expect(saved?.id).toBe('e-feel');
    });

    it('brouillon corrigé : ⏎ le passe en définitif, Ctrl+S le garde en brouillon', async () => {
      const { store, api } = setup({ get: vi.fn().mockResolvedValue(entry({ status: 'draft' })) });
      await store.open({ patientId: 'p-marie', entryId: 'e-1' });
      const unchanged = store.currentDraft()!;
      await store.save(unchanged, 'draft');
      expect(api.patch).not.toHaveBeenCalled();
      await store.save(unchanged, 'final');
      expect(api.patch).toHaveBeenCalledWith('e-1', { status: 'final' });
    });

    it('409 ENTRY_ARCHIVED : problème rangé', async () => {
      const { store } = setup({
        patch: vi.fn().mockRejectedValue({ status: 409, code: 'ENTRY_ARCHIVED' }),
      });
      await store.open({ patientId: 'p-marie', entryId: 'e-1' });
      await store.save({ ...store.currentDraft()!, title: 'x' });
      expect(store.problem()?.code).toBe('ENTRY_ARCHIVED');
    });

    it('entrée illisible : état erreur', async () => {
      const { store } = setup({
        get: vi.fn().mockRejectedValue({ status: 404, code: 'ENTRY_NOT_FOUND' }),
      });
      await store.open({ patientId: 'p-marie', entryId: 'e-x' });
      expect(store.entry().status).toBe('error');
      expect(store.entry().problem?.code).toBe('ENTRY_NOT_FOUND');
    });
  });

  describe('émotion personnalisée en ligne', () => {
    it('201 : ajoutée à la liste, relue (proposée dans un second ressenti)', async () => {
      const created = { code: 'c_9f8e7d6c', label: 'Rumination', family: 'fear', custom: true };
      const { store, api } = setup({
        createEmotion: vi.fn().mockResolvedValue(created),
        emotions: vi
          .fn()
          .mockResolvedValueOnce(EMOTIONS)
          .mockResolvedValueOnce([...EMOTIONS, created]),
      });
      await store.open({ patientId: 'p-marie' });
      const emotion = await store.createEmotion(' Rumination ', 'fear');
      expect(api.createEmotion).toHaveBeenCalledWith('Rumination', 'fear');
      expect(emotion?.code).toBe('c_9f8e7d6c');
      expect(store.emotions().data?.some((e) => e.code === 'c_9f8e7d6c')).toBe(true);
      await vi.waitFor(() => expect(api.emotions).toHaveBeenCalledTimes(2));
    });

    it('409 EMOTION_LABEL_EXISTS : emotionProblem, liste inchangée', async () => {
      const { store } = setup({
        createEmotion: vi.fn().mockRejectedValue({ status: 409, code: 'EMOTION_LABEL_EXISTS' }),
      });
      await store.open({ patientId: 'p-marie' });
      expect(await store.createEmotion('Anxiété', 'fear')).toBeNull();
      expect(store.emotionProblem()?.code).toBe('EMOTION_LABEL_EXISTS');
      expect(store.emotions().data).toHaveLength(EMOTIONS.length);
    });
  });

  it('vocabulaire en erreur : état erreur, Réessayer relit', async () => {
    const emotions = vi
      .fn()
      .mockRejectedValueOnce({ status: 0, code: 'NETWORK_ERROR' })
      .mockResolvedValueOnce(EMOTIONS);
    const { store } = setup({ emotions });
    await store.open({ patientId: 'p-marie' });
    expect(store.emotions().status).toBe('error');
    await store.retryEmotions();
    expect(store.emotions().status).toBe('loaded');
  });

  describe('rail « Lié à… » (M2-05)', () => {
    const link = { targetId: 'c-event', linkType: 'triggers', direction: 'incoming' } as const;

    it('création : catalogue des types et cinq cibles au plus, situations en cours d’abord', async () => {
      const recent = Array.from({ length: 6 }, (_, i) => candidate({ id: `c-${i}` }));
      const situations = [
        candidate({ id: 'c-sit-done', type: 'situation', ongoing: false }),
        candidate({ id: 'c-sit', type: 'situation', ongoing: true }),
      ];
      const { store, api } = setup({
        railSource: vi.fn().mockResolvedValue({
          situations,
          recent: [candidate({ id: 'c-sit', type: 'situation', ongoing: true }), ...recent],
        }),
      });
      await store.open({ patientId: 'p-marie' });
      expect(api.railSource).toHaveBeenCalledWith('p-marie');
      expect(store.linkTypes().data).toEqual(LINK_TYPES);
      expect(store.linkCandidates().data?.map((item) => item.id)).toEqual([
        'c-sit',
        'c-0',
        'c-1',
        'c-2',
        'c-3',
      ]);
      expect(api.linksOf).not.toHaveBeenCalled();

      // Relues à chaque ouverture (une entrée créée y apparaît) ; le catalogue est gardé.
      await store.open({ patientId: 'p-marie' });
      expect(api.railSource).toHaveBeenCalledTimes(2);
      expect(api.linkTypes).toHaveBeenCalledTimes(1);
    });

    it('links[] cochés partent dans le corps du POST, sans authorType ni submissionId', async () => {
      const { store, api } = setup();
      await store.open({ patientId: 'p-marie', type: 'feeling' });
      await store.save(
        draft({
          type: 'feeling',
          feeling: { emotionCode: 'anxiety', intensity: 8 },
          links: [{ ...link }],
        }),
      );
      const body = api.create!.mock.calls[0][1] as Record<string, unknown>;
      expect(body['links']).toEqual([
        { targetId: 'c-event', linkType: 'triggers', direction: 'incoming' },
      ]);
      expect(JSON.stringify(body)).not.toMatch(/authorType|submissionId/);
    });

    it('liens invisibles jamais envoyés : cible absente du rail, ou rail jamais chargé', async () => {
      const gone = { targetId: 'c-gone', linkType: 'co_occurs', direction: 'outgoing' } as const;
      const input = draft({
        type: 'feeling',
        feeling: { emotionCode: 'anxiety', intensity: 8 },
        links: [{ ...link }, gone],
      });
      const { store, api } = setup();
      await store.open({ patientId: 'p-marie' });
      await store.save(input);
      expect(api.create!.mock.calls[0][1]['links']).toEqual([link]);

      // Brouillon rouvert, chronologie en erreur (aucune cible affichée) : aucun lien ne part,
      // mais le brouillon garde les liens cochés.
      TestBed.resetTestingModule();
      const failing = setup({
        railSource: vi.fn().mockRejectedValue({ status: 503, code: 'SERVICE_UNAVAILABLE' }),
        create: vi.fn().mockRejectedValue({ status: 0, code: 'NETWORK_ERROR' }),
      });
      await failing.store.open({ patientId: 'p-marie' });
      expect(failing.store.linkCandidates().status).toBe('error');
      await failing.store.save(input);
      expect(failing.api.create!.mock.calls[0][1]).not.toHaveProperty('links');
      expect(failing.store.currentDraft()?.links).toEqual(input.links);
    });

    it('aucun lien coché : pas de clé links ; une séance n’en porte jamais', async () => {
      const { store, api } = setup();
      await store.open({ patientId: 'p-marie' });
      await store.save(draft({ type: 'note', body: 'x' }));
      expect(api.create!.mock.calls[0][1]).not.toHaveProperty('links');
      await store.open({ patientId: 'p-marie' });
      await store.save(
        draft({
          type: 'session',
          session: { modality: 'in_person', durationMin: null },
          links: [{ ...link }],
        }),
      );
      expect(api.create!.mock.calls[1][1]).not.toHaveProperty('links');
    });

    it('correction : jamais de links dans le PATCH ; liens posés lus en lecture', async () => {
      const { store, api } = setup({ versions: vi.fn().mockResolvedValue(VERSIONS) });
      await store.open({ patientId: 'p-marie', entryId: 'e-1' });
      expect(api.linksOf).toHaveBeenCalledWith('e-1');
      expect(store.placedLinks().data).toEqual(PLACED_LINKS);
      expect(api.railSource).not.toHaveBeenCalled();
      const current = store.currentDraft()!;
      await store.save({ ...current, title: 'Entretien annuel (bis)', links: [{ ...link }] });
      const [entryId, body] = api.patch!.mock.calls[0] as [string, Record<string, unknown>];
      expect(entryId).toBe('e-1');
      expect(body).toEqual({ title: 'Entretien annuel (bis)' });
      expect(api.create).not.toHaveBeenCalled();
    });

    it('422 sur un lien : aucune entrée rendue, problème rangé, brouillon et liens gardés', async () => {
      const refused = {
        status: 422,
        code: 'VALIDATION_FAILED',
        errors: [
          {
            field: 'links[0].linkType',
            code: 'LINK_TYPE_NOT_ALLOWED',
            message: 'Type de lien non permis.',
          },
        ],
      };
      const { store } = setup({ create: vi.fn().mockRejectedValue(refused) });
      await store.open({ patientId: 'p-marie' });
      const input = draft({
        type: 'feeling',
        feeling: { emotionCode: 'anxiety', intensity: 8 },
        links: [{ targetId: 'c-event', linkType: 'treats', direction: 'incoming' }],
      });
      expect(await store.save(input)).toBeNull();
      expect(store.problem()?.errors?.[0].field).toBe('links[0].linkType');
      expect(store.currentDraft()).toEqual(input);
    });

    it('rail en erreur : Réessayer relit le catalogue et les cibles', async () => {
      const railSource = vi
        .fn()
        .mockRejectedValueOnce({ status: 503, code: 'SERVICE_UNAVAILABLE' })
        .mockResolvedValue({ situations: [], recent: CANDIDATES });
      const linkTypes = vi
        .fn()
        .mockRejectedValueOnce({ status: 0, code: 'NETWORK_ERROR' })
        .mockResolvedValue(LINK_TYPES);
      const { store } = setup({ railSource, linkTypes });
      await store.open({ patientId: 'p-marie' });
      expect(store.linkCandidates().status).toBe('error');
      expect(store.linkTypes().status).toBe('error');
      await store.retryRail();
      expect(store.linkCandidates().data).toHaveLength(CANDIDATES.length);
      expect(store.linkTypes().status).toBe('loaded');
    });

    it('après l’éditeur de lien : liens et entrée relus (linkCount de la grâce)', async () => {
      const { store, api } = setup();
      await store.open({ patientId: 'p-marie', entryId: 'e-1' });
      api.linksOf!.mockResolvedValue([]);
      api.get!.mockResolvedValue(entry({ linkCount: 1 }));
      await store.refreshLinks();
      expect(store.placedLinks().data).toEqual([]);
      expect(store.entry().data?.linkCount).toBe(1);
    });
  });

  describe('préremplissage de la barre de commande (M6-02)', () => {
    const fromBar = {
      type: 'feeling' as const,
      feeling: { emotionCode: 'c_nouvelle', intensity: 7 },
      body: "avant l'examen",
      occurred: null,
      links: [
        { targetId: 'e-event', linkType: 'triggers' as const, direction: 'incoming' as const },
      ],
    };

    it('sans brouillon : le préremplissage devient le brouillon ; émotion inconnue → vocabulaire relu', async () => {
      const { store, api } = setup();
      await store.open({ patientId: 'p-marie' });
      store.discardDraft();
      store.closed('create:p-marie');
      expect(api.emotions).toHaveBeenCalledTimes(1);

      await store.open({ patientId: 'p-marie', type: 'feeling', prefill: fromBar });
      expect(store.currentDraft()).toMatchObject({
        type: 'feeling',
        feeling: { emotionCode: 'c_nouvelle', intensity: 7 },
        body: "avant l'examen",
        occurred: { now: true },
        sessionId: '',
        links: fromBar.links,
      });
      expect(api.emotions).toHaveBeenCalledTimes(2);
    });

    it('brouillon non enregistré : fusionné, rien ne se perd (titre et texte, séance, tags, liens, moment)', async () => {
      const { store } = setup();
      await store.open({ patientId: 'p-marie' });
      const other = {
        targetId: 'e-note',
        linkType: 'co_occurs' as const,
        direction: 'outgoing' as const,
      };
      const typed = draft({
        type: 'event',
        title: 'Dispute',
        body: 'Au téléphone',
        sessionId: 's-old',
        tags: ['famille'],
        occurred: {
          now: false,
          precision: 'day',
          from: '2026-11-10',
          to: '',
          label: '',
          ongoing: true,
        },
        links: [other, { targetId: 'e-event', linkType: 'co_occurs', direction: 'outgoing' }],
      });
      store.keepDraft('create:p-marie', typed);
      store.closed('create:p-marie');

      await store.open({ patientId: 'p-marie', type: 'feeling', prefill: fromBar });
      expect(store.currentDraft()).toMatchObject({
        type: 'feeling',
        title: 'Dispute',
        body: "Au téléphone\navant l'examen",
        feeling: { emotionCode: 'c_nouvelle', intensity: 7 },
        sessionId: 's-old',
        tags: ['famille'],
        // Pas de date dans la barre : le moment du brouillon reste.
        occurred: { now: false, precision: 'day', from: '2026-11-10' },
        // Même cible : le lien de la barre l'emporte ; l'autre lien reste.
        links: [fromBar.links[0], other],
      });

      // Un titre dans la barre remplace l'ancien, qui passe dans le texte ; sa date l'emporte.
      store.closed('create:p-marie');
      await store.open({
        patientId: 'p-marie',
        type: 'event',
        prefill: {
          type: 'event',
          title: 'Entretien',
          occurred: { from: '2026-11-09T00:00:00Z', precision: 'day' },
        },
      });
      expect(store.currentDraft()).toMatchObject({
        type: 'event',
        title: 'Entretien',
        body: "Dispute\nAu téléphone\navant l'examen",
        occurred: { now: false, precision: 'day', from: '2026-11-09' },
        sessionId: 's-old',
        tags: ['famille'],
      });
    });
  });
});
