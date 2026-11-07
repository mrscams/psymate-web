import { TestBed } from '@angular/core/testing';

import { ApiProblem } from '../../../core/http';
import { Profile, ProfileApi, ProfileFields } from './profile.api';
import { fields, PROFILE, VOCABULARY } from './profile.fixtures';
import { AUTOSAVE_DELAY_MS, missingOf, ProfileStore } from './profile.store';

type Api = { [K in keyof ProfileApi]: ReturnType<typeof vi.fn> };

function fakeApi(overrides: Partial<Api> = {}): Api {
  return {
    load: vi.fn().mockResolvedValue(PROFILE),
    save: vi.fn(async (body: ProfileFields): Promise<Profile> => ({ ...PROFILE, ...body })),
    uploadPhoto: vi.fn().mockResolvedValue({ ...PROFILE, hasPhoto: true }),
    deletePhoto: vi.fn().mockResolvedValue(undefined),
    publish: vi.fn().mockResolvedValue(undefined),
    unpublish: vi.fn().mockResolvedValue(undefined),
    vocabulary: vi.fn().mockResolvedValue(VOCABULARY),
    ...overrides,
  };
}

function setup(api: Api) {
  TestBed.configureTestingModule({
    providers: [ProfileStore, { provide: ProfileApi, useValue: api }],
  });
  return TestBed.inject(ProfileStore);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const INCOMPLETE = (missing: string[]): ApiProblem => ({
  status: 409,
  code: 'PROFILE_INCOMPLETE',
  extra: { missing },
});

describe('ProfileStore', () => {
  afterEach(() => vi.useRealTimers());

  it('load : profil et liste fermée chargés en parallèle', async () => {
    const api = fakeApi();
    const store = setup(api);
    const pending = store.load();
    expect(store.profile().status).toBe('loading');
    expect(store.vocabulary().status).toBe('loading');
    await pending;
    expect(store.data()).toEqual(PROFILE);
    expect(store.vocabulary().data).toEqual(VOCABULARY);
    expect(store.slug()).toBe('claire-martin');
    expect(store.published()).toBe(false);
  });

  it('load en erreur : état erreur pour le bloc fautif seulement', async () => {
    const api = fakeApi({ vocabulary: vi.fn().mockRejectedValue({ status: 500, code: 'X' }) });
    const store = setup(api);
    await store.load();
    expect(store.profile().status).toBe('loaded');
    expect(store.vocabulary().status).toBe('error');
    expect(store.vocabulary().problem?.code).toBe('X');
  });

  it('autosave : un seul PUT complet 800 ms après la dernière modification', async () => {
    vi.useFakeTimers();
    const api = fakeApi();
    const store = setup(api);
    store.edit(fields({ displayName: 'C' }));
    await vi.advanceTimersByTimeAsync(500);
    store.edit(fields({ displayName: 'Cl' }));
    await vi.advanceTimersByTimeAsync(500);
    store.edit(fields({ displayName: 'Claire M.' }));
    expect(store.autosave().status).toBe('pending');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 1);
    expect(api.save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(api.save).toHaveBeenCalledTimes(1);
    expect(api.save).toHaveBeenCalledWith(fields({ displayName: 'Claire M.' }));
    expect(store.autosave().status).toBe('saved');
    expect(store.autosave().savedAt).toBe(Date.now());
    expect(store.data()?.displayName).toBe('Claire M.');
  });

  it('autosave : une modification pendant un PUT part après lui, jamais deux PUT en vol', async () => {
    vi.useFakeTimers();
    const first = deferred<Profile>();
    const save = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockImplementation(async (body: ProfileFields) => ({ ...PROFILE, ...body }));
    const store = setup(fakeApi({ save }));
    store.edit(fields({ city: 'Lyon' }));
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(store.autosave().status).toBe('saving');
    store.edit(fields({ city: 'Lyon 6e' }));
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(save).toHaveBeenCalledTimes(1);
    first.resolve({ ...PROFILE, city: 'Lyon' });
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(fields({ city: 'Lyon 6e' }));
    expect(store.autosave().status).toBe('saved');
    expect(store.data()?.city).toBe('Lyon 6e');
  });

  it('autosave en erreur (422) : état erreur avec le problème, « Réessayer » renvoie la version refusée', async () => {
    vi.useFakeTimers();
    const problem: ApiProblem = {
      status: 422,
      code: 'VALIDATION_FAILED',
      errors: [{ field: 'specialties', code: '', message: 'Valeur hors liste' }],
    };
    const save = vi
      .fn()
      .mockRejectedValueOnce(problem)
      .mockImplementation(async (body: ProfileFields) => ({ ...PROFILE, ...body }));
    const store = setup(fakeApi({ save }));
    store.edit(fields({ specialties: ['astrologie'] }));
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(store.autosave().status).toBe('error');
    expect(store.autosave().problem).toEqual(problem);
    await store.retrySave();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(fields({ specialties: ['astrologie'] }));
    expect(store.autosave().status).toBe('saved');
  });

  it('publier : la saisie en attente part d’abord, puis publish, puis relecture du profil', async () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    const api = fakeApi({
      save: vi.fn(async (body: ProfileFields) => {
        calls.push('save');
        return { ...PROFILE, ...body };
      }),
      publish: vi.fn(async () => void calls.push('publish')),
      load: vi.fn(async () => {
        calls.push('load');
        return { ...PROFILE, published: true };
      }),
    });
    const store = setup(api);
    store.edit(fields({ city: 'Lyon' }));
    const ok = await store.publishProfile();
    expect(ok).toBe(true);
    expect(calls).toEqual(['save', 'publish', 'load']);
    expect(store.published()).toBe(true);
    expect(store.publication()).toEqual({ status: 'idle', problem: null, missing: [] });
    // Le minuteur annulé par la publication n'envoie pas un second PUT.
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(api.save).toHaveBeenCalledTimes(1);
  });

  it('publier refusé (409 PROFILE_INCOMPLETE) : missing[] gardé dans l’ordre du contrat, aucune relecture', async () => {
    const api = fakeApi({ publish: vi.fn().mockRejectedValue(INCOMPLETE(['contact'])) });
    const store = setup(api);
    await store.load();
    api.load.mockClear();
    expect(await store.publishProfile()).toBe(false);
    expect(store.publication().status).toBe('error');
    expect(store.publication().missing).toEqual(['contact']);
    expect(api.load).not.toHaveBeenCalled();
    expect(store.published()).toBe(false);
  });

  it('publier refusé pour dossier non approuvé : verification en tête', async () => {
    const store = setup(
      fakeApi({ publish: vi.fn().mockRejectedValue(INCOMPLETE(['city', 'verification'])) }),
    );
    await store.publishProfile();
    expect(store.publication().missing).toEqual(['verification', 'city']);
  });

  it('publier impossible si le dernier enregistrement a échoué : pas d’appel à publish', async () => {
    const api = fakeApi({ save: vi.fn().mockRejectedValue({ status: 0, code: 'NETWORK_ERROR' }) });
    const store = setup(api);
    store.edit(fields({ city: 'Lyon' }));
    expect(await store.publishProfile()).toBe(false);
    expect(api.publish).not.toHaveBeenCalled();
    expect(store.publication().problem?.code).toBe('NETWORK_ERROR');
  });

  it('dépublier : unpublish puis relecture', async () => {
    const api = fakeApi({ load: vi.fn().mockResolvedValue({ ...PROFILE, published: false }) });
    const store = setup(api);
    expect(await store.unpublishProfile()).toBe(true);
    expect(api.unpublish).toHaveBeenCalledTimes(1);
    expect(api.load).toHaveBeenCalledTimes(1);
    expect(store.published()).toBe(false);
  });

  it('photo : envoi puis profil à jour ; refus gardé pour le champ', async () => {
    const uploadPhoto = vi
      .fn()
      .mockResolvedValueOnce({ ...PROFILE, hasPhoto: true })
      .mockRejectedValueOnce({ status: 413, code: 'PHOTO_TOO_LARGE' });
    const store = setup(fakeApi({ uploadPhoto }));
    const blob = new Blob(['jpeg'], { type: 'image/jpeg' });
    expect(await store.uploadPhoto(blob)).toBe(true);
    expect(uploadPhoto).toHaveBeenCalledWith(blob);
    expect(store.hasPhoto()).toBe(true);
    expect(await store.uploadPhoto(blob)).toBe(false);
    expect(store.photo().problem?.code).toBe('PHOTO_TOO_LARGE');
  });

  it('retirer la photo : DELETE puis relecture', async () => {
    const api = fakeApi();
    const store = setup(api);
    expect(await store.removePhoto()).toBe(true);
    expect(api.deletePhoto).toHaveBeenCalledTimes(1);
    expect(api.load).toHaveBeenCalledTimes(1);
  });

  it('quitter l’écran : la saisie en attente part sans attendre les 800 ms', async () => {
    vi.useFakeTimers();
    const api = fakeApi();
    const store = setup(api);
    store.edit(fields({ bio: 'Bonjour' }));
    TestBed.resetTestingModule();
    await vi.advanceTimersByTimeAsync(0);
    expect(api.save).toHaveBeenCalledWith(fields({ bio: 'Bonjour' }));
    expect(store).toBeTruthy();
  });

  it('missingOf : seulement un 409 PROFILE_INCOMPLETE, éléments inconnus ignorés', () => {
    expect(missingOf(INCOMPLETE(['contact', 'inconnu']))).toEqual(['contact']);
    expect(missingOf({ status: 409, code: 'SLUG_CONFLICT' })).toEqual([]);
    expect(missingOf({ status: 422, code: 'PROFILE_INCOMPLETE' })).toEqual([]);
  });
});
