import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { PreferencesStore } from '../../../core/preferences';
import { EntryPrefill, LinkChoice } from '../../entries';
import { CaptureApi } from './capture.api';
import { candidate, CANDIDATES, EMOTIONS, LINK_TYPES } from './capture.fixtures';
import { EMPTY_DRAFT, ParsedSnapshot } from './capture.model';
import { CaptureStore } from './capture.store';

type Api = Partial<Record<keyof CaptureApi, ReturnType<typeof vi.fn>>>;

function setup(api: Api = {}, visibility = 'clinical') {
  const mock: Api = {
    emotions: vi.fn().mockResolvedValue(EMOTIONS),
    linkTypes: vi.fn().mockResolvedValue(LINK_TYPES),
    railCandidates: vi.fn().mockResolvedValue(CANDIDATES),
    create: vi.fn().mockImplementation(async (_p: string, body: { type: string }) => ({
      id: 'e-new',
      type: body.type,
      status: 'final',
      sessionId: 's-open',
    })),
    createEmotion: vi.fn(),
    searchEntries: vi.fn().mockResolvedValue([]),
    ...api,
  };
  TestBed.configureTestingModule({
    providers: [
      CaptureStore,
      { provide: CaptureApi, useValue: mock },
      { provide: PreferencesStore, useValue: { defaultVisibility: signal(visibility) } },
    ],
  });
  return { store: TestBed.inject(CaptureStore), api: mock };
}

const FEELING: EntryPrefill = {
  type: 'feeling',
  feeling: { emotionCode: 'anxiety', intensity: 8 },
  body: "n'a pas dormi",
  occurred: null,
  links: [{ targetId: 'e-event', linkType: 'triggers', direction: 'incoming' }],
};

describe('CaptureStore', () => {
  it('prepare : vocabulaire, catalogue et rail lus une fois ; deux appels simultanés partagent la lecture', async () => {
    const { store, api } = setup();
    expect(store.emotions().status).toBe('idle');
    const first = store.prepare('p-marie');
    const second = store.prepare('p-marie');
    expect(store.emotions().status).toBe('loading');
    expect(store.candidates().status).toBe('loading');
    await Promise.all([first, second]);
    expect(api.emotions).toHaveBeenCalledOnce();
    expect(api.linkTypes).toHaveBeenCalledOnce();
    expect(api.railCandidates).toHaveBeenCalledExactlyOnceWith('p-marie');
    expect(store.emotions().data).toEqual(EMOTIONS);
    expect(store.candidates().data).toEqual(CANDIDATES);

    await store.prepare('p-marie');
    expect(api.emotions).toHaveBeenCalledOnce();
    expect(api.railCandidates).toHaveBeenCalledOnce();
  });

  it('markStale : rail et vocabulaire relus à la préparation suivante, pas le catalogue', async () => {
    const { store, api } = setup();
    await store.prepare('p-marie');
    store.markStale();
    await store.prepare('p-marie');
    expect(api.emotions).toHaveBeenCalledTimes(2);
    expect(api.railCandidates).toHaveBeenCalledTimes(2);
    expect(api.linkTypes).toHaveBeenCalledOnce();
    expect(store.stale()).toBe(false);
  });

  it('un autre patient : son rail, pas celui du précédent', async () => {
    const { store, api } = setup();
    await store.prepare('p-marie');
    api.railCandidates?.mockResolvedValueOnce([]);
    await store.prepare('p-omar');
    expect(api.railCandidates).toHaveBeenLastCalledWith('p-omar');
    expect(store.candidates().data).toEqual([]);
  });

  it('erreurs de lecture : rangées par bloc, Réessayer relit', async () => {
    const problem = { status: 500, code: 'INTERNAL_ERROR' };
    const { store, api } = setup({
      emotions: vi.fn().mockRejectedValueOnce(problem).mockResolvedValueOnce(EMOTIONS),
      railCandidates: vi.fn().mockRejectedValueOnce(problem).mockResolvedValueOnce(CANDIDATES),
    });
    await store.prepare('p-marie');
    expect(store.emotions()).toMatchObject({ status: 'error', problem });
    expect(store.candidates()).toMatchObject({ status: 'error', problem });

    await store.retryEmotions();
    await store.retryRail();
    expect(store.emotions().status).toBe('loaded');
    expect(store.candidates().data).toEqual(CANDIDATES);
    expect(api.linkTypes).toHaveBeenCalledOnce();
  });

  it('save : corps de toCreateBody (séance courante, visibilité des préférences), sans authorType ni submissionId', async () => {
    const { store, api } = setup({}, 'private');
    await store.prepare('p-marie');
    const saved = await store.save('p-marie', FEELING);
    expect(saved).toEqual({ id: 'e-new', type: 'feeling', status: 'final', sessionId: 's-open' });
    const [patientId, body] = api.create!.mock.calls[0];
    expect(patientId).toBe('p-marie');
    expect(body).toEqual({
      type: 'feeling',
      visibility: 'private',
      feeling: { emotionCode: 'anxiety', intensity: 8 },
      body: "n'a pas dormi",
      status: 'final',
      links: [{ targetId: 'e-event', linkType: 'triggers', direction: 'incoming' }],
    });
    expect(JSON.stringify(body)).not.toMatch(/authorType|submissionId|sessionId/);
    // Lecture après écriture : le rail se relit (l'entrée créée peut y entrer).
    await vi.waitFor(() => expect(api.railCandidates).toHaveBeenCalledTimes(2));
  });

  it('save : Ctrl+S en brouillon ; date, médicament, liens hors rail retirés', async () => {
    const { store, api } = setup();
    await store.prepare('p-marie');
    await store.save(
      'p-marie',
      {
        type: 'medication',
        medication: { molecule: 'sertraline', dosage: '50 mg matin' },
        occurred: { from: '2026-11-10T00:00:00Z', precision: 'day' },
        links: [{ targetId: 'e-unknown', linkType: 'co_occurs', direction: 'outgoing' }],
      },
      'draft',
    );
    expect(api.create!.mock.calls[0][1]).toEqual({
      type: 'medication',
      visibility: 'clinical',
      medication: { molecule: 'sertraline', dosage: '50 mg matin' },
      occurred: { from: '2026-11-10T00:00:00Z', precision: 'day' },
      status: 'draft',
    });
  });

  it('save en échec (422 SESSION_REQUIRED) : null, problème rangé, effacé par clearProblem', async () => {
    const problem = {
      status: 422,
      code: 'SESSION_REQUIRED',
      errors: [{ field: 'sessionId', code: 'SESSION_REQUIRED', message: 'Aucune séance.' }],
    };
    const { store } = setup({ create: vi.fn().mockRejectedValue(problem) });
    await store.prepare('p-marie');
    expect(await store.save('p-marie', FEELING)).toBeNull();
    expect(store.saving()).toBe(false);
    expect(store.problem()).toEqual(problem);
    store.clearProblem();
    expect(store.problem()).toBeNull();
  });

  it('createEmotion : ajoutée aussitôt au vocabulaire puis relue ; 409 rangé à part', async () => {
    const stress = {
      code: 'c_00aa11bb',
      labelFr: 'Stress',
      labelEn: null,
      label: 'Stress',
      family: 'fear' as const,
      custom: true,
    };
    const { store, api } = setup({
      createEmotion: vi
        .fn()
        .mockResolvedValueOnce(stress)
        .mockRejectedValueOnce({ status: 409, code: 'EMOTION_LABEL_EXISTS' }),
    });
    await store.prepare('p-marie');
    api.emotions?.mockResolvedValue([...EMOTIONS, stress]);

    expect(await store.createEmotion(' Stress ', 'fear')).toEqual(stress);
    expect(api.createEmotion).toHaveBeenCalledWith('Stress', 'fear');
    expect(store.emotions().data?.at(-1)).toEqual(stress);
    await vi.waitFor(() => expect(api.emotions).toHaveBeenCalledTimes(2));

    expect(await store.createEmotion('Stress', 'fear')).toBeNull();
    expect(store.emotionProblem()?.code).toBe('EMOTION_LABEL_EXISTS');
    expect(store.creatingEmotion()).toBe(false);
    store.clearEmotionProblem();
    expect(store.emotionProblem()).toBeNull();
  });
});

describe('CaptureStore (bloc de saisie, UX-S1)', () => {
  const snapshot = (over: Partial<ParsedSnapshot> = {}): ParsedSnapshot => ({
    type: 'note',
    emotionCode: null,
    intensity: null,
    dateExpression: null,
    text: 'dort mal',
    targetId: null,
    ...over,
  });
  const triggers: LinkChoice = {
    linkType: 'triggers',
    direction: 'incoming',
    label: 'déclenché par',
  };
  const coOccurs: LinkChoice = {
    linkType: 'co_occurs',
    direction: 'outgoing',
    label: 'survient avec',
  };

  it('type choisi : la puce ; la même que la grammaire revient à suivre la grammaire ; une grammaire nouvelle efface', () => {
    const { store } = setup();
    store.applyParsed(snapshot());
    store.chooseType('feeling');
    expect(store.draft().type).toBe('feeling');
    store.chooseType('note');
    expect(store.draft().type).toBeNull();
    store.chooseType('event');
    store.applyParsed(snapshot({ type: 'feeling', emotionCode: 'anxiety', intensity: 7 }));
    expect(store.draft().type).toBeNull();
  });

  it('champs : posés, effacés, repris par la grammaire quand elle change', () => {
    const { store } = setup();
    store.applyParsed(snapshot({ type: 'feeling', emotionCode: 'anxiety', intensity: 7 }));
    store.setField('emotionCode', 'anger');
    store.setField('intensity', 3);
    store.setField('visibility', 'private');
    expect(store.draft().overrides).toEqual({
      emotionCode: 'anger',
      intensity: 3,
      visibility: 'private',
    });
    store.clearField('intensity');
    expect(store.draft().overrides).toEqual({ emotionCode: 'anger', visibility: 'private' });
    // « tri 5 » tapé à la place : l'émotion lue change, le choix s'efface ; la visibilité reste.
    store.applyParsed(snapshot({ type: 'feeling', emotionCode: 'sadness', intensity: 5 }));
    expect(store.draft().overrides).toEqual({ visibility: 'private' });
    // Saisie vidée et bloc replié : plus rien.
    store.applyParsed(null);
    expect(store.draft()).toBe(EMPTY_DRAFT);
  });

  it('lien : un clic pose, un second retire, une autre puce remplace ; la cible du `>` se retire d’un clic', () => {
    const { store } = setup();
    store.applyParsed(snapshot());
    store.toggleLink('e-situation', triggers, null);
    expect(store.draft().pickedLink).toEqual({
      targetId: 'e-situation',
      linkType: 'triggers',
      direction: 'incoming',
    });
    store.toggleLink('e-note', coOccurs, null);
    expect(store.draft().pickedLink?.targetId).toBe('e-note');
    store.toggleLink('e-note', coOccurs, null);
    expect(store.draft().pickedLink).toBeNull();
    // Cible du `>` (e-event) : un clic la retire, un second la repose.
    store.applyParsed(snapshot({ targetId: 'e-event' }));
    store.toggleLink('e-event', triggers, 'e-event');
    expect(store.draft().pickedLink).toBeNull();
    expect(store.draft().dismissedTarget).toBe('e-event');
    store.toggleLink('e-event', triggers, 'e-event');
    expect(store.draft().pickedLink?.targetId).toBe('e-event');
    expect(store.draft().dismissedTarget).toBeNull();
    // Un `>` vers une nouvelle cible remplace tout.
    store.applyParsed(snapshot({ targetId: 'e-situation' }));
    expect(store.draft().pickedLink).toBeNull();
    expect(store.draft().dismissedTarget).toBeNull();
  });

  it('verbe choisi ; « Autre entrée… » remplace le lien et garde la cible hors rail ; removeLink', () => {
    const { store } = setup();
    store.applyParsed(snapshot({ targetId: 'e-event' }));
    store.chooseVerb('e-event', coOccurs);
    expect(store.draft().pickedLink).toEqual({
      targetId: 'e-event',
      linkType: 'co_occurs',
      direction: 'outgoing',
    });
    const old = candidate({ id: 'e-old', title: "Entretien d'évaluation" });
    store.pickOther(old, triggers);
    expect(store.draft().pickedLink?.targetId).toBe('e-old');
    expect(store.draft().extraCandidate).toBe(old);
    // Une puce du rail cliquée ensuite : la cible hors rail disparaît.
    store.toggleLink('e-note', coOccurs, 'e-event');
    expect(store.draft().extraCandidate).toBeNull();
    store.removeLink('e-event');
    expect(store.draft().pickedLink).toBeNull();
    expect(store.draft().dismissedTarget).toBe('e-event');
  });

  it('searchEntries : à partir de 2 caractères, la dernière réponse compte ; clearSearch', async () => {
    let resolveFirst: (value: unknown) => void = () => undefined;
    const old = [candidate({ id: 'e-old', title: "Entretien d'évaluation" })];
    const { store, api } = setup({
      searchEntries: vi
        .fn()
        .mockImplementationOnce(() => new Promise((done) => (resolveFirst = done)))
        .mockResolvedValueOnce(old),
    });
    await store.prepare('p-marie');
    await store.searchEntries('e');
    expect(api.searchEntries).not.toHaveBeenCalled();
    expect(store.search().status).toBe('idle');
    const first = store.searchEntries('en');
    const second = store.searchEntries('entr');
    expect(store.search().status).toBe('loading');
    await second;
    expect(store.search().data).toEqual(old);
    resolveFirst([]);
    await first;
    // La première réponse, arrivée après la seconde, est ignorée.
    expect(store.search().data).toEqual(old);
    expect(api.searchEntries).toHaveBeenLastCalledWith('p-marie', 'entr');
    store.clearSearch();
    expect(store.search().status).toBe('idle');
    expect(store.searchQuery()).toBe('');

    // Une réponse en vol au moment où la saisie repasse sous 2 caractères, ou où une cible est
    // choisie, ne réapparaît pas.
    let resolveLate: (value: unknown) => void = () => undefined;
    api.searchEntries?.mockImplementationOnce(() => new Promise((done) => (resolveLate = done)));
    const late = store.searchEntries('entr');
    await store.searchEntries('e');
    resolveLate(old);
    await late;
    expect(store.search().status).toBe('idle');
    api.searchEntries?.mockImplementationOnce(() => new Promise((done) => (resolveLate = done)));
    const late2 = store.searchEntries('entr');
    store.pickOther(old[0], {
      linkType: 'triggers',
      direction: 'incoming',
      label: 'déclenché par',
    });
    resolveLate(old);
    await late2;
    expect(store.search().status).toBe('idle');
  });

  it('save : la visibilité choisie l’emporte sur la préférence ; la cible de « Autre entrée… » part', async () => {
    const { store, api } = setup({}, 'private');
    await store.prepare('p-marie');
    store.pickOther(candidate({ id: 'e-old', title: 'Ancien' }), triggers);
    await store.save(
      'p-marie',
      {
        type: 'note',
        body: 'dort mal',
        links: [{ targetId: 'e-old', linkType: 'co_occurs', direction: 'outgoing' }],
      },
      'final',
      'clinical',
    );
    expect(api.create!.mock.calls[0][1]).toEqual({
      type: 'note',
      visibility: 'clinical',
      body: 'dort mal',
      status: 'final',
      links: [{ targetId: 'e-old', linkType: 'co_occurs', direction: 'outgoing' }],
    });
  });

  it('save en échec 422 par champ : le problème est rangé avec ses errors[] ; setField l’efface', async () => {
    const problem = {
      status: 422,
      code: 'VALIDATION_FAILED',
      errors: [{ field: 'feeling.intensity', code: 'REQUIRED', message: 'Intensité obligatoire.' }],
    };
    const { store } = setup({ create: vi.fn().mockRejectedValue(problem) });
    await store.prepare('p-marie');
    expect(await store.save('p-marie', FEELING)).toBeNull();
    expect(store.problem()?.errors?.[0].field).toBe('feeling.intensity');
    store.setField('intensity', 6);
    expect(store.problem()).toBeNull();
  });

  it('un autre patient vide le brouillon et la recherche', async () => {
    const { store } = setup();
    await store.prepare('p-marie');
    store.chooseType('event');
    await store.prepare('p-omar');
    expect(store.draft()).toBe(EMPTY_DRAFT);
  });
});
