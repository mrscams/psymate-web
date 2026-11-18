import { TestBed } from '@angular/core/testing';

import { ApiProblem } from '../../../core/http';
import { stateKind } from '../../../shared/util';
import { fullProfile, profileItem } from './profile360.fixtures';
import { ProfileItem, ProfileItemInput } from './profile360.model';
import { Profile360Api } from './profile360.api';
import { Profile360Store } from './profile360.store';

const networkError: ApiProblem = { status: 0, code: 'NETWORK_ERROR', detail: 'Réseau injoignable' };

function setup(profile: (patientId: string) => Promise<ProfileItem[]>) {
  const api = { profile: vi.fn(profile) };
  TestBed.configureTestingModule({
    providers: [Profile360Store, { provide: Profile360Api, useValue: api }],
  });
  return { api, store: TestBed.inject(Profile360Store) };
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

describe('Profile360Store', () => {
  it('groupe par rubrique et compte, dans l’ordre du serveur', async () => {
    const items = fullProfile();
    const { api, store } = setup(() => Promise.resolve(items));
    await store.load('p-1');

    expect(api.profile).toHaveBeenCalledTimes(1);
    expect(api.profile).toHaveBeenCalledWith('p-1');
    expect(store.profile().status).toBe('loaded');
    expect(store.counts()).toEqual({ history: 3, family: 2, health: 1, values_goals: 1 });
    expect(store.groups().history.map((i) => i.title)).toEqual([
      'Enfance à Nantes',
      'Divorce des parents',
      "L'odeur du tilleul",
    ]);
    expect(store.groups().family.map((i) => i.title)).toEqual([
      'Thomas, compagnon',
      '« Hélène », sa mère',
    ]);
    expect(store.items()).toBe(items);
  });

  it('ne retrie jamais : un ordre « désordonné » du serveur est gardé tel quel', async () => {
    // Années décroissantes, sans année au milieu, titres non alphabétiques : rien ne bouge.
    const order = [
      profileItem('history', 'Zèbre', { periodYear: 2020 }),
      profileItem('history', 'Sans année'),
      profileItem('history', 'Abeille', { periodYear: 1990 }),
      profileItem('health', 'Z'),
      profileItem('health', 'A'),
    ];
    const { store } = setup(() => Promise.resolve(order));
    await store.load('p-1');
    expect(store.groups().history.map((i) => i.title)).toEqual(['Zèbre', 'Sans année', 'Abeille']);
    expect(store.groups().health.map((i) => i.title)).toEqual(['Z', 'A']);
  });

  it('chargement : état « loading » tant que la réponse n’est pas arrivée', async () => {
    const pending = deferred<ProfileItem[]>();
    const { store } = setup(() => pending.promise);
    const done = store.load('p-1');
    expect(store.profile().status).toBe('loading');
    expect(stateKind(store.profile())).toBe('loading');
    expect(store.counts()).toEqual({ history: 0, family: 0, health: 0, values_goals: 0 });
    pending.resolve(fullProfile());
    await done;
    expect(stateKind(store.profile())).toBeNull();
  });

  it('profil vide : état « empty », compteurs à zéro', async () => {
    const { store } = setup(() => Promise.resolve([]));
    await store.load('p-1');
    expect(stateKind(store.profile())).toBe('empty');
    expect(store.counts()).toEqual({ history: 0, family: 0, health: 0, values_goals: 0 });
  });

  it('erreur réseau : état « error » avec l’ApiProblem, puis « Réessayer » relit', async () => {
    let fail = true;
    const { api, store } = setup(() =>
      fail ? Promise.reject(networkError) : Promise.resolve(fullProfile()),
    );
    await store.load('p-1');
    expect(store.profile().status).toBe('error');
    expect(store.profile().problem?.code).toBe('NETWORK_ERROR');
    expect(stateKind(store.profile())).toBe('error');

    fail = false;
    await store.refresh();
    expect(api.profile).toHaveBeenCalledTimes(2);
    expect(store.profile().status).toBe('loaded');
    expect(store.counts().history).toBe(3);
  });

  it('même patient déjà lu ou en cours : aucune seconde requête ; autre patient : relu de zéro', async () => {
    const { api, store } = setup((id) =>
      Promise.resolve(id === 'p-1' ? fullProfile() : [profileItem('health', 'Autre')]),
    );
    const first = store.load('p-1');
    await store.load('p-1');
    await first;
    await store.load('p-1');
    expect(api.profile).toHaveBeenCalledTimes(1);

    await store.load('p-2');
    expect(api.profile).toHaveBeenCalledTimes(2);
    expect(store.counts()).toEqual({ history: 0, family: 0, health: 1, values_goals: 0 });
  });

  it('une réponse arrivée après une autre demande est ignorée', async () => {
    const slow = deferred<ProfileItem[]>();
    const { store } = setup((id) =>
      id === 'p-1' ? slow.promise : Promise.resolve([profileItem('family', 'Léa')]),
    );
    const stale = store.load('p-1');
    await store.load('p-2');
    slow.resolve(fullProfile());
    await stale;
    expect(store.patientId()).toBe('p-2');
    expect(store.counts()).toEqual({ history: 0, family: 1, health: 0, values_goals: 0 });
  });

  it('refresh() sans patient : rien', async () => {
    const { api, store } = setup(() => Promise.resolve([]));
    await store.refresh();
    expect(api.profile).not.toHaveBeenCalled();
  });

  describe('écritures (M13-07) : écrire, puis relire, jamais corriger localement', () => {
    const input: ProfileItemInput = {
      category: 'health',
      title: 'Asthme',
      detail: null,
      periodLabel: null,
      periodYear: null,
    };

    function writable(
      api: Partial<Record<'create' | 'update' | 'remove', ReturnType<typeof vi.fn>>>,
    ) {
      let reads = 0;
      const first = fullProfile();
      const second = [...first, profileItem('health', 'Asthme')];
      const mock = {
        profile: vi.fn(() => Promise.resolve(reads++ === 0 ? first : second)),
        create: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
        ...api,
      };
      TestBed.configureTestingModule({
        providers: [Profile360Store, { provide: Profile360Api, useValue: mock }],
      });
      return { api: mock, store: TestBed.inject(Profile360Store), second };
    }

    it('create : POST sans champ vide ni période hors history, puis relecture ; la liste est celle du serveur', async () => {
      const { api, store, second } = writable({});
      await store.load('p-1');
      const pending = store.create({ ...input, periodLabel: 'ignorée', periodYear: 2001 });
      expect(store.saving()).toBe(true);
      await expect(pending).resolves.toEqual({ status: 'done' });
      expect(api.create).toHaveBeenCalledWith('p-1', { category: 'health', title: 'Asthme' });
      expect(api.profile).toHaveBeenCalledTimes(2);
      expect(store.items()).toBe(second);
      expect(store.counts().health).toBe(2);
      expect(store.saving()).toBe(false);
    });

    it('update : seuls les champs modifiés, null pour effacer ; sans changement, aucune requête', async () => {
      const { api, store } = writable({});
      await store.load('p-1');
      const item = profileItem('health', 'Migraines', { detail: 'Depuis 2010' });
      const same = { ...input, title: 'Migraines', detail: 'Depuis 2010' };
      await expect(store.update(item, same)).resolves.toEqual({ status: 'unchanged' });
      expect(api.update).not.toHaveBeenCalled();

      await expect(
        store.update(item, { ...same, title: 'Migraines rares', detail: null }),
      ).resolves.toEqual({
        status: 'done',
      });
      expect(api.update).toHaveBeenCalledWith('p-1', item.id, {
        title: 'Migraines rares',
        detail: null,
      });
      expect(api.profile).toHaveBeenCalledTimes(2);
    });

    it('remove : DELETE puis relecture', async () => {
      const { api, store } = writable({});
      await store.load('p-1');
      const item = store.items()[0];
      await expect(store.remove(item)).resolves.toEqual({ status: 'done' });
      expect(api.remove).toHaveBeenCalledWith('p-1', item.id);
      expect(api.profile).toHaveBeenCalledTimes(2);
    });

    it.each([
      [
        '422 par champ',
        {
          status: 422,
          code: 'VALIDATION_FAILED',
          errors: [{ field: 'title', code: 'REQUIRED', message: 'Obligatoire' }],
        },
        'invalid',
        1,
      ],
      [
        '422 PROFILE_ITEM_LIMIT_REACHED',
        { status: 422, code: 'PROFILE_ITEM_LIMIT_REACHED' },
        'limit',
        1,
      ],
      ['404 PROFILE_ITEM_NOT_FOUND', { status: 404, code: 'PROFILE_ITEM_NOT_FOUND' }, 'gone', 2],
      ['409 PROFILE_ITEM_ARCHIVED', { status: 409, code: 'PROFILE_ITEM_ARCHIVED' }, 'gone', 2],
      ['409 PATIENT_ARCHIVED', { status: 409, code: 'PATIENT_ARCHIVED' }, 'archived', 1],
      ['réseau', networkError, 'failed', 1],
    ])('%s → %s, %d lecture(s)', async (_label, problem, status, reads) => {
      const { api, store } = writable({ remove: vi.fn().mockRejectedValue(problem) });
      await store.load('p-1');
      const outcome = await store.remove(store.items()[0]);
      expect(outcome.status).toBe(status);
      expect(api.profile).toHaveBeenCalledTimes(reads);
      expect(store.archivedOnWrite()).toBe(status === 'archived');
      expect(store.saving()).toBe(false);
    });
  });
});
