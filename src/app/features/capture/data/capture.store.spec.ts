import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { PreferencesStore } from '../../../core/preferences';
import { EntryPrefill } from '../../entries';
import { CaptureApi } from './capture.api';
import { CANDIDATES, EMOTIONS, LINK_TYPES } from './capture.fixtures';
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
