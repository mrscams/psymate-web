import { TestBed } from '@angular/core/testing';

import { SessionStore, SessionUser } from '../../../core/auth';
import { SessionApi } from '../../../core/auth/data/session.api';
import { PatientApi } from './patient.api';
import { OMAR, patient } from './patient.fixtures';
import { PatientListQuery } from './patient.model';
import { effectiveQuery, PatientListStore, SORT_STORAGE_KEY } from './patient-list.store';

const user = (id: string): SessionUser => ({
  id,
  email: `${id}@example.test`,
  displayName: id,
  profession: 'psychologist',
  verificationStatus: 'approved',
  role: 'practitioner',
  twoFactorEnabled: false,
  passwordChangeRequired: false,
});

function setup(api: Partial<PatientApi>) {
  TestBed.configureTestingModule({
    providers: [
      { provide: PatientApi, useValue: api },
      { provide: SessionApi, useValue: {} },
    ],
  });
  TestBed.inject(SessionStore).signIn(user('claire'));
  return TestBed.inject(PatientListStore);
}

const page = (items = [patient(), OMAR], nextCursor: string | null = null) => ({
  items,
  nextCursor,
});

describe('PatientListStore', () => {
  beforeEach(() => localStorage.removeItem(SORT_STORAGE_KEY));

  it.each([
    ['', ''],
    ['m', ''],
    [' ma ', 'ma'],
    ['marie   d', 'marie d'],
  ])('effectiveQuery(%j) = %j (2 caractères au moins)', (input, expected) => {
    expect(effectiveQuery(input)).toBe(expected);
  });

  it('load : tri mémorisé, chargement puis page', async () => {
    localStorage.setItem(SORT_STORAGE_KEY, 'updated');
    const list = vi.fn().mockResolvedValue(page());
    const store = setup({ list });
    const pending = store.load();
    expect(store.page().status).toBe('loading');
    await pending;
    expect(list).toHaveBeenCalledWith({
      q: '',
      archived: false,
      tag: null,
      sort: 'updated',
      cursor: null,
    });
    expect(store.items().map((p) => p.displayName)).toEqual(['Marie D.', 'Omar B.']);
    expect(store.filtered()).toBe(false);
  });

  it.each<
    [string, (s: InstanceType<typeof PatientListStore>) => Promise<void>, Partial<PatientListQuery>]
  >([
    ['setQuery « marié »', (s) => s.setQuery('marié'), { q: 'marié' }],
    ['setTag', (s) => s.setTag('travail'), { tag: 'travail' }],
    ['setArchived', (s) => s.setArchived(true), { archived: true }],
    ['setSort', (s) => s.setSort('created'), { sort: 'created' }],
  ])('%s relit la première page avec le filtre', async (_label, act, expected) => {
    const list = vi.fn().mockResolvedValue(page());
    const store = setup({ list });
    await store.load();
    await act(store);
    expect(list).toHaveBeenLastCalledWith({
      q: '',
      archived: false,
      tag: null,
      sort: 'name',
      cursor: null,
      ...expected,
    });
    expect(store.filtered()).toBe(expected.sort === undefined);
  });

  it('setQuery sous 2 caractères : pas de requête ; setSort mémorise le tri', async () => {
    const list = vi.fn().mockResolvedValue(page());
    const store = setup({ list });
    await store.load();
    await store.setQuery('m');
    expect(list).toHaveBeenCalledTimes(1);
    await store.setSort('updated');
    expect(localStorage.getItem(SORT_STORAGE_KEY)).toBe('updated');
  });

  it('une réponse plus ancienne arrivée après une plus récente est ignorée', async () => {
    let resolveSlow: (value: unknown) => void = () => undefined;
    const list = vi
      .fn()
      .mockResolvedValueOnce(page())
      .mockImplementationOnce(() => new Promise((resolve) => (resolveSlow = resolve)))
      .mockResolvedValueOnce(page([OMAR]));
    const store = setup({ list });
    await store.load();
    const slow = store.setQuery('ma');
    await store.setQuery('omar');
    resolveSlow(page([patient()]));
    await slow;
    expect(store.items().map((p) => p.id)).toEqual(['p-omar']);
  });

  it('erreur de rechargement : liste précédente conservée ; clearFilters remet tout à zéro', async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce(page())
      .mockRejectedValueOnce({ status: 500, code: 'INTERNAL_ERROR' })
      .mockResolvedValue(page());
    const store = setup({ list });
    await store.load();
    await store.setTag('travail');
    expect(store.page().status).toBe('error');
    expect(store.items()).toHaveLength(2);
    await store.clearFilters();
    expect(store.tag()).toBeNull();
    expect(store.page().status).toBe('loaded');
  });

  it('loadMore : page suivante sans doublon ; erreur gardée à part', async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce(page([patient()], 'c1'))
      .mockResolvedValueOnce(page([patient(), OMAR], null))
      .mockResolvedValueOnce(page([patient()], 'c1'))
      .mockRejectedValueOnce({ status: 0, code: 'NETWORK_ERROR' });
    const store = setup({ list });
    await store.load();
    expect(store.hasMore()).toBe(true);
    await store.loadMore();
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'c1' }));
    expect(store.items().map((p) => p.id)).toEqual(['p-marie', 'p-omar']);
    expect(store.hasMore()).toBe(false);
    await store.reload();
    await store.loadMore();
    expect(store.moreProblem()?.code).toBe('NETWORK_ERROR');
    expect(store.items()).toHaveLength(1);
  });

  it('restore : POST /restore puis relecture ; erreur gardée', async () => {
    const list = vi.fn().mockResolvedValue(page());
    const restore = vi
      .fn()
      .mockResolvedValueOnce(patient())
      .mockRejectedValueOnce({ status: 404, code: 'PATIENT_NOT_FOUND' });
    const store = setup({ list, restore });
    await expect(store.restore('p-marie')).resolves.toMatchObject({ id: 'p-marie' });
    expect(list).toHaveBeenCalledTimes(1);
    await expect(store.restore('p-x')).resolves.toBeNull();
    expect(store.restoreProblem()?.code).toBe('PATIENT_NOT_FOUND');
  });

  it('autre compte dans le même onglet : ni patients ni filtres du précédent', async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce(page())
      .mockResolvedValueOnce(page())
      .mockResolvedValueOnce(page())
      .mockImplementationOnce(() => new Promise(() => undefined));
    const store = setup({ list });
    await store.load();
    await store.setQuery('marie');
    await store.setTag('travail');
    TestBed.inject(SessionStore).signIn(user('karim'));
    void store.load();
    expect(store.items()).toEqual([]);
    expect(store.page().status).toBe('loading');
    expect(store.query()).toBe('');
    expect(store.tag()).toBeNull();
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ q: '', tag: null }));
  });

  describe('première connexion (M7-03)', () => {
    const DEMO = patient({ id: 'p-demo', displayName: 'DEMO · Camille R.' });

    it.each([
      ['aucun patient', [], null, true],
      ['seulement le patient de démonstration', [DEMO], null, true],
      ['un vrai patient en plus de la démo', [DEMO, patient()], null, false],
      ['un vrai patient', [patient()], null, false],
      ['démo, mais une page suivante (liste incomplète)', [DEMO], 'c-2', false],
    ])('welcome : %s → %s', async (_label, items, cursor, expected) => {
      const store = setup({ list: vi.fn().mockResolvedValue(page(items, cursor)) });
      expect(store.welcome()).toBe(false);
      await store.load();
      expect(store.welcome()).toBe(expected);
    });

    it('welcome : jamais sur une liste filtrée (archivés, texte, tag)', async () => {
      const store = setup({ list: vi.fn().mockResolvedValue(page([])) });
      await store.load();
      expect(store.welcome()).toBe(true);
      await store.setArchived(true);
      expect(store.welcome()).toBe(false);
      await store.clearFilters();
      await store.setQuery('marie');
      expect(store.welcome()).toBe(false);
    });

    it('removeDemo : DELETE (archivage) puis relecture de la liste, sans retrait local', async () => {
      const list = vi
        .fn()
        .mockResolvedValueOnce(page([DEMO]))
        .mockResolvedValueOnce(page([]));
      const archive = vi.fn().mockResolvedValue(undefined);
      const store = setup({ list, archive });
      await store.load();
      await expect(store.removeDemo('p-demo')).resolves.toBe(true);
      expect(archive).toHaveBeenCalledWith('p-demo');
      expect(list).toHaveBeenCalledTimes(2);
      expect(store.items()).toEqual([]);
      expect(store.welcome()).toBe(true);
    });

    it('removeDemo refusé : problème gardé, liste intacte et non relue', async () => {
      const list = vi.fn().mockResolvedValue(page([DEMO]));
      const archive = vi.fn().mockRejectedValue({ status: 403, code: 'PATIENT_FORBIDDEN' });
      const store = setup({ list, archive });
      await store.load();
      await expect(store.removeDemo('p-demo')).resolves.toBe(false);
      expect(store.removeProblem()?.code).toBe('PATIENT_FORBIDDEN');
      expect(list).toHaveBeenCalledTimes(1);
      expect(store.items()).toEqual([DEMO]);
    });
  });
});
