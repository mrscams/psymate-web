import { TestBed } from '@angular/core/testing';

import { SessionStore, SessionUser } from '../../../core/auth';
import { SessionApi } from '../../../core/auth/data/session.api';
import { PatientApi } from './patient.api';
import { activity, OMAR, patient } from './patient.fixtures';
import { PatientListQuery } from './patient.model';
import {
  ACTIVITY_CONCURRENCY,
  effectiveQuery,
  PatientListStore,
  SORT_STORAGE_KEY,
} from './patient-list.store';

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

/** Laisse filer les résumés lancés sans attente après la liste. */
const flush = () => new Promise((resolve) => setTimeout(resolve));

function setup(api: Partial<PatientApi>) {
  TestBed.configureTestingModule({
    providers: [
      {
        provide: PatientApi,
        useValue: { activity: vi.fn().mockResolvedValue(activity()), ...api },
      },
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

  it('tri par défaut : dernière séance, envoyé comme updated (le contrat ne trie pas par séance)', async () => {
    const list = vi.fn().mockResolvedValue(page());
    const store = setup({ list });
    await store.load();
    expect(store.sort()).toBe('lastSession');
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ sort: 'updated' }));
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
      sort: 'updated',
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
    // lastSession et updated envoient le même tri : pas de relecture.
    expect(list).toHaveBeenCalledTimes(1);
    await store.setSort('flags');
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'name' }));
  });

  describe('résumé d’activité (GET /overview par ligne, UX-B1)', () => {
    const many = (n: number) =>
      Array.from({ length: n }, (_, i) => patient({ id: `p-${i}`, displayName: `P${i}` }));

    it('lu après la liste pour les 20 premières lignes seulement, 4 à la fois', async () => {
      let running = 0;
      let peak = 0;
      const activityCall = vi.fn(async () => {
        running += 1;
        peak = Math.max(peak, running);
        await flush();
        running -= 1;
        return activity();
      });
      const store = setup({
        list: vi.fn().mockResolvedValue(page(many(25), null)),
        activity: activityCall,
      });
      await store.load();
      expect(store.allRows()[0].cell?.status).toBe('loading');
      expect(store.activityComplete()).toBe(false);
      for (let i = 0; i < 10; i++) await flush();
      expect(activityCall).toHaveBeenCalledTimes(20);
      expect(activityCall).not.toHaveBeenCalledWith('p-20');
      expect(peak).toBe(ACTIVITY_CONCURRENCY);
      expect(store.allRows().filter((row) => row.cell === null)).toHaveLength(5);
      // Au-delà des 20 premières, le résumé ne couvre pas la page : comptes « séances » inconnus.
      expect(store.activityComplete()).toBe(false);
      expect(store.quickCounts().today).toBeNull();
    });

    it('trois états par ligne : chargement, lu, en échec ; Réessayer ne relit que les échecs', async () => {
      const activityCall = vi
        .fn()
        .mockResolvedValueOnce(activity())
        .mockRejectedValueOnce({ status: 503, code: 'SERVICE_UNAVAILABLE' })
        .mockResolvedValueOnce(activity({ drafts: 1 }));
      const store = setup({ list: vi.fn().mockResolvedValue(page()), activity: activityCall });
      await store.load();
      await flush();
      const cells = Object.fromEntries(
        store.allRows().map((row) => [row.patient.id, row.cell?.status]),
      );
      expect(cells).toEqual({ 'p-marie': 'loaded', 'p-omar': 'error' });
      expect(store.activityFailures()).toBe(1);
      await store.retryActivity();
      expect(activityCall).toHaveBeenCalledTimes(3);
      expect(activityCall).toHaveBeenLastCalledWith('p-omar');
      expect(store.activityFailures()).toBe(0);
      expect(store.quickCounts().drafts).toBe(1);
    });

    it('une relecture de la liste relit les résumés ; une réponse d’avant est ignorée', async () => {
      let resolveOld: (value: unknown) => void = () => undefined;
      const activityCall = vi
        .fn()
        .mockImplementationOnce(() => new Promise((resolve) => (resolveOld = resolve)))
        .mockResolvedValue(activity({ drafts: 3 }));
      const store = setup({
        list: vi.fn().mockResolvedValue(page([patient()])),
        activity: activityCall,
      });
      await store.load();
      await store.reload();
      await flush();
      resolveOld(activity({ drafts: 9 }));
      await flush();
      expect(store.allRows()[0].activity?.drafts).toBe(3);
    });

    it('filtres rapides : appliqués à la page lue sans requête, avec leurs comptes', async () => {
      const now = new Date();
      const list = vi.fn().mockResolvedValue(page([patient(), OMAR]));
      const activityCall = vi.fn((id: string) =>
        Promise.resolve(
          id === 'p-marie'
            ? activity({ lastSession: { at: now.toISOString(), modality: 'video' }, drafts: 2 })
            : activity(),
        ),
      );
      const store = setup({ list, activity: activityCall });
      await store.load();
      await flush();
      expect(store.quickCounts()).toEqual({ all: 2, more: false, flags: 1, today: 1, drafts: 1 });
      store.setQuick('flags');
      expect(store.rows().map((row) => row.patient.id)).toEqual(['p-omar']);
      store.setQuick('today');
      expect(store.rows().map((row) => row.patient.id)).toEqual(['p-marie']);
      store.setQuick('drafts');
      expect(store.rows().map((row) => row.patient.id)).toEqual(['p-marie']);
      expect(list).toHaveBeenCalledTimes(1);
      await store.clearFilters();
      expect(store.quick()).toBe('all');
    });

    it('21 patients sans page suivante : ni tri par séance ni Aujourd’hui / Brouillons', async () => {
      const store = setup({ list: vi.fn().mockResolvedValue(page(many(21), null)) });
      await store.load();
      for (let i = 0; i < 10; i++) await flush();
      expect(store.activityCovered()).toBe(false);
      expect(store.sort()).toBe('lastSession');
      expect(store.effectiveSort()).toBe('updated');
      // Ordre du serveur (sort=updated) conservé, pas de réordonnancement partiel.
      expect(store.rows().map((row) => row.patient.id)).toEqual(many(21).map((p) => p.id));
      store.setQuick('today');
      expect(store.effectiveQuick()).toBe('all');
      expect(store.rows()).toHaveLength(21);
      expect(store.quickCounts()).toEqual({
        all: 21,
        more: false,
        flags: 0,
        today: null,
        drafts: null,
      });
    });

    it('page suivante : comptes « Tous » et « Flags » non présentés comme complets', async () => {
      const list = vi
        .fn()
        .mockResolvedValueOnce(page([patient(), OMAR], 'c-2'))
        .mockResolvedValueOnce(page([patient({ id: 'p-lea' })], null));
      const store = setup({ list });
      await store.load();
      await flush();
      expect(store.activityCovered()).toBe(false);
      expect(store.effectiveSort()).toBe('updated');
      expect(store.quickCounts()).toMatchObject({ all: 2, more: true, flags: null, today: null });
      store.setQuick('drafts');
      expect(store.effectiveQuick()).toBe('all');
      // Liste complète après « Afficher plus » (3 patients ≤ 20) : tout redevient disponible.
      await store.loadMore();
      for (let i = 0; i < 5; i++) await flush();
      expect(store.activityCovered()).toBe(true);
      expect(store.effectiveSort()).toBe('lastSession');
      expect(store.effectiveQuick()).toBe('drafts');
      expect(store.quickCounts()).toMatchObject({ all: 3, more: false, flags: 1, today: 0 });
    });

    it('tri dernière séance : la séance la plus récente d’abord', async () => {
      const activityCall = vi.fn((id: string) =>
        Promise.resolve(
          activity({
            lastSession: {
              at: id === 'p-omar' ? '2026-11-08T10:00:00Z' : '2026-10-01T10:00:00Z',
              modality: null,
            },
          }),
        ),
      );
      const store = setup({ list: vi.fn().mockResolvedValue(page()), activity: activityCall });
      await store.load();
      await flush();
      expect(store.rows().map((row) => row.patient.id)).toEqual(['p-omar', 'p-marie']);
    });
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
    expect(store.actionProblem()).toMatchObject({
      action: 'restore',
      problem: { code: 'PATIENT_NOT_FOUND' },
    });
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
      expect(store.actionProblem()).toMatchObject({
        action: 'removeDemo',
        problem: { code: 'PATIENT_FORBIDDEN' },
      });
      expect(list).toHaveBeenCalledTimes(1);
      expect(store.items()).toEqual([DEMO]);
    });
  });

  describe('écriture refusée (actionProblem)', () => {
    const DEMO = patient({ id: 'p-demo', displayName: 'DEMO · Camille R.' });
    const forbidden = { status: 403, code: 'PATIENT_FORBIDDEN' };

    it('effacée par la relecture suivante (filtre, tag, archivés)', async () => {
      const list = vi.fn().mockResolvedValue(page([DEMO]));
      const store = setup({ list, archive: vi.fn().mockRejectedValue(forbidden) });
      await store.load();
      await store.removeDemo('p-demo');
      expect(store.actionProblem()?.action).toBe('removeDemo');
      await store.setQuery('cam');
      expect(store.actionProblem()).toBeNull();

      await store.removeDemo('p-demo');
      await store.setTag('travail');
      expect(store.actionProblem()).toBeNull();

      await store.removeDemo('p-demo');
      await store.setArchived(true);
      expect(store.actionProblem()).toBeNull();
    });

    it('un retrait refusé est effacé par une restauration réussie', async () => {
      const store = setup({
        list: vi.fn().mockResolvedValue(page([DEMO])),
        archive: vi.fn().mockRejectedValue(forbidden),
        restore: vi.fn().mockResolvedValue(DEMO),
      });
      await store.load();
      await store.removeDemo('p-demo');
      expect(store.actionProblem()?.action).toBe('removeDemo');
      await store.restore('p-demo');
      expect(store.actionProblem()).toBeNull();
    });

    it('restauration refusée (toast de la fiche compris) : action restore, sans lien avec la démo', async () => {
      const list = vi.fn().mockResolvedValue(page([patient()]));
      const store = setup({ list, restore: vi.fn().mockRejectedValue(forbidden) });
      await store.load();
      await expect(store.restore('p-marie')).resolves.toBeNull();
      expect(store.actionProblem()?.action).toBe('restore');
      expect(list).toHaveBeenCalledTimes(1);
      await store.reload();
      expect(store.actionProblem()).toBeNull();
    });
  });
});
