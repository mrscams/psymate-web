import { TestBed } from '@angular/core/testing';

import { SessionStore, SessionUser } from '../../../core/auth';
import { SessionApi } from '../../../core/auth/data/session.api';
import { PatientApi } from './patient.api';
import { activity, OMAR, patient } from './patient.fixtures';
import { PatientListQuery, PatientView } from './patient.model';
import {
  effectiveQuery,
  PatientListStore,
  queryParams,
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

const page = (items: PatientView[] = [patient(), OMAR], nextCursor: string | null = null) => ({
  items,
  nextCursor,
});

/** Dix patients numérotés à partir de `from` (une page pleine). */
const ten = (from: number) =>
  Array.from({ length: 10 }, (_, i) =>
    patient({ id: `p-${from + i}`, displayName: `Patient ${from + i}` }),
  );

/** API paginée : trois pages (c-2, c-3), la dernière de deux patients. */
function pagedList() {
  return vi.fn((query: PatientListQuery) => {
    switch (query.cursor ?? null) {
      case null:
        return Promise.resolve(page(ten(1), 'c-2'));
      case 'c-2':
        return Promise.resolve(page(ten(11), 'c-3'));
      default:
        return Promise.resolve(page(ten(21).slice(0, 2), null));
    }
  });
}

type Store = InstanceType<typeof PatientListStore>;

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

  it.each([
    ['marie', { q: 'marie', tag: null }],
    ['#sommeil', { q: '', tag: 'sommeil' }],
    ['#', { q: '', tag: null }],
  ])('queryParams(%j) : « #tag » part en paramètre tag', (text, expected) => {
    expect(queryParams(text)).toEqual(expected);
  });

  it('load : tri mémorisé, chargement puis première page', async () => {
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
    expect(store.hasPrevious()).toBe(false);
    expect(store.hasNext()).toBe(false);
  });

  it('tri par défaut : le nom (serveur) ; un ancien tri mémorisé inconnu (« flags ») est ignoré', async () => {
    localStorage.setItem(SORT_STORAGE_KEY, 'flags');
    const list = vi.fn().mockResolvedValue(page());
    const store = setup({ list });
    await store.load();
    expect(store.sort()).toBe('name');
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ sort: 'name' }));
  });

  describe('pagination par pile de curseurs (décision 1)', () => {
    it('Suivant empile, Précédent dépile ; boutons grisés en bout', async () => {
      const list = pagedList();
      const store = setup({ list });
      await store.load();
      expect(store.items()).toHaveLength(10);
      expect([store.hasPrevious(), store.hasNext()]).toEqual([false, true]);

      await store.next();
      expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'c-2' }));
      expect(store.items()[0].id).toBe('p-11');
      expect(store.previous()).toEqual([null]);
      expect([store.hasPrevious(), store.hasNext()]).toEqual([true, true]);

      await store.next();
      expect(store.items().map((p) => p.id)).toEqual(['p-21', 'p-22']);
      expect(store.previous()).toEqual([null, 'c-2']);
      expect([store.hasPrevious(), store.hasNext()]).toEqual([true, false]);

      // En bout : Suivant ne fait rien.
      const calls = list.mock.calls.length;
      await store.next();
      expect(list).toHaveBeenCalledTimes(calls);

      await store.previousPage();
      expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'c-2' }));
      expect(store.items()[0].id).toBe('p-11');
      await store.previousPage();
      expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: null }));
      expect(store.items()[0].id).toBe('p-1');
      expect(store.hasPrevious()).toBe(false);

      // Au début : Précédent ne fait rien.
      await store.previousPage();
      expect(list).toHaveBeenCalledTimes(calls + 2);
    });

    it('page suivante en échec : la page affichée et la pile restent', async () => {
      const list = vi
        .fn()
        .mockResolvedValueOnce(page(ten(1), 'c-2'))
        .mockRejectedValueOnce({ status: 0, code: 'NETWORK' });
      const store = setup({ list });
      await store.load();
      await store.next();
      expect(store.page().status).toBe('error');
      expect(store.items()[0].id).toBe('p-1');
      expect(store.cursor()).toBeNull();
      expect(store.previous()).toEqual([]);
    });

    it.each<[string, (s: Store) => Promise<void>, Partial<PatientListQuery>]>([
      ['recherche', (s) => s.setQuery('marié'), { q: 'marié' }],
      ['recherche par tag', (s) => s.setQuery('#travail'), { q: '', tag: 'travail' }],
      ['tri', (s) => s.setSort('created'), { sort: 'created' }],
      ['mode archivés', (s) => s.setArchived(true), { archived: true }],
      ['filtre rapide', (s) => s.setQuick('watch'), {}],
    ])('%s : retour à la première page, pile vidée', async (_label, act, expected) => {
      const list = pagedList();
      const store = setup({ list });
      await store.load();
      await store.next();
      await store.next();
      await act(store);
      expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ ...expected, cursor: null }));
      expect(store.previous()).toEqual([]);
      expect(store.cursor()).toBeNull();
      expect(store.items()[0].id).toBe('p-1');
    });

    it('filtre rapide sur la première page : aucune requête', async () => {
      const list = pagedList();
      const store = setup({ list });
      await store.load();
      await store.setQuick('drafts');
      expect(list).toHaveBeenCalledTimes(1);
      expect(store.paged()).toBe(true);
    });

    it('le filtre ne relit la liste que si le texte effectif change', async () => {
      const list = vi.fn().mockResolvedValue(page());
      const store = setup({ list });
      await store.load();
      await store.setQuery('m');
      await store.setQuery(' ');
      expect(list).toHaveBeenCalledTimes(1);
      await store.setQuery('ma');
      await store.setQuery(' ma ');
      expect(list).toHaveBeenCalledTimes(2);
      expect(store.filtered()).toBe(true);
    });

    it('réponse arrivée après une requête plus récente : ignorée', async () => {
      let first!: (value: unknown) => void;
      const list = vi
        .fn()
        .mockImplementationOnce(() => new Promise((resolve) => (first = resolve)))
        .mockResolvedValueOnce(page([OMAR]));
      const store = setup({ list });
      const pending = store.load();
      await store.setQuery('omar');
      first(page([patient()]));
      await pending;
      expect(store.items().map((p) => p.id)).toEqual(['p-omar']);
    });
  });

  describe('enrichissement de la page entière (projection)', () => {
    it('les dix patients de la page reçoivent leur résumé, en parallèle', async () => {
      const list = vi.fn().mockResolvedValue(page(ten(1), 'c-2'));
      let inFlight = 0;
      let peak = 0;
      const store = setup({
        list,
        activity: vi.fn(async () => {
          inFlight++;
          peak = Math.max(peak, inFlight);
          await flush();
          inFlight--;
          return activity();
        }),
      });
      await store.load();
      expect(store.allRows().every((row) => row.cell?.status === 'loading')).toBe(true);
      await flush();
      await flush();
      expect(peak).toBe(10);
      expect(store.allRows().every((row) => row.activity !== null)).toBe(true);
    });

    it('cache par patient et version : revenir en arrière ne relit pas les résumés', async () => {
      const list = pagedList();
      const read = vi.fn().mockResolvedValue(activity());
      const store = setup({ list, activity: read });
      await store.load();
      await flush();
      expect(read).toHaveBeenCalledTimes(10);
      await store.next();
      await flush();
      expect(read).toHaveBeenCalledTimes(20);
      await store.previousPage();
      await flush();
      expect(read).toHaveBeenCalledTimes(20);
      expect(store.allRows().every((row) => row.cell?.status === 'loaded')).toBe(true);
    });

    it('une nouvelle version de la fiche n’est pas servie par le cache', async () => {
      const list = vi
        .fn()
        .mockResolvedValueOnce(page([patient()]))
        .mockResolvedValueOnce(page([patient({ currentVersion: 2 })]));
      const read = vi.fn().mockResolvedValue(activity());
      const store = setup({ list, activity: read });
      await store.load();
      await flush();
      await store.setQuery('marie');
      await flush();
      expect(read).toHaveBeenCalledTimes(2);
    });

    it('arrivée sur la liste : cache vidé, les projections sont relues', async () => {
      const read = vi.fn().mockResolvedValue(activity());
      const store = setup({ list: vi.fn().mockResolvedValue(page()), activity: read });
      await store.load();
      await flush();
      await store.load();
      await flush();
      expect(read).toHaveBeenCalledTimes(4);
    });

    it('résumé en échec : compté, « Réessayer » ne relit que lui', async () => {
      const read = vi
        .fn()
        .mockResolvedValueOnce(activity())
        .mockRejectedValueOnce({ status: 500, code: 'INTERNAL' })
        .mockResolvedValueOnce(activity({ drafts: 2 }));
      const store = setup({ list: vi.fn().mockResolvedValue(page()), activity: read });
      await store.load();
      await flush();
      expect(store.activityFailures()).toBe(1);
      await store.retryActivity();
      expect(read).toHaveBeenCalledTimes(3);
      expect(read).toHaveBeenLastCalledWith('p-omar');
      expect(store.activityFailures()).toBe(0);
    });
  });

  describe('filtres rapides, bande du jour, tri client', () => {
    const now = new Date();
    const todayClosed = new Date(now.getTime() - 60_000).toISOString();

    async function loaded(): Promise<Store> {
      const léa = patient({ id: 'p-lea', displayName: 'Léa M.' });
      const store = setup({
        list: vi.fn().mockResolvedValue(page([patient(), OMAR, léa])),
        activity: vi.fn(async (id: string) => {
          if (id === 'p-omar') return activity({ openSessionAt: todayClosed, drafts: 1 });
          if (id === 'p-lea') {
            return activity({
              lastSession: {
                at: todayClosed,
                closedAt: todayClosed,
                modality: 'video',
                entryCount: 0,
                reportMissing: true,
              },
            });
          }
          return activity();
        }),
      });
      await store.load();
      await flush();
      return store;
    }

    it('« Aujourd’hui » : séance ouverte d’abord, puis clôturée aujourd’hui ; vide les jours calmes', async () => {
      const store = await loaded();
      expect(store.today().map((row) => [row.patient.id, row.status])).toEqual([
        ['p-omar', 'open'],
        ['p-lea', 'closed'],
      ]);
    });

    it('jour calme : aucune séance ouverte ni clôturée aujourd’hui, bande vide', async () => {
      const calm = setup({ list: vi.fn().mockResolvedValue(page([patient()])) });
      await calm.load();
      await flush();
      expect(calm.today()).toEqual([]);
    });

    it.each([
      ['all', ['p-marie', 'p-omar', 'p-lea']],
      ['watch', ['p-omar']],
      ['drafts', ['p-omar']],
      ['today', ['p-omar', 'p-lea']],
    ] as const)('filtre %s sur la page affichée', async (quick, ids) => {
      const store = await loaded();
      await store.setQuick(quick);
      expect(store.rows().map((row) => row.patient.id)).toEqual(ids);
    });

    it('tri « Dernière séance » : page réordonnée dans le client, sort=updated au serveur', async () => {
      const store = await loaded();
      await store.setSort('lastSession');
      await flush();
      expect(store.rows().map((row) => row.patient.id)).toEqual(['p-omar', 'p-lea', 'p-marie']);
      expect(localStorage.getItem(SORT_STORAGE_KEY)).toBe('lastSession');
    });
  });

  describe('écritures : relecture de la page affichée', () => {
    it('archive : DELETE puis relecture de la même page (même curseur), projections relues', async () => {
      const list = pagedList();
      const archive = vi.fn().mockResolvedValue(undefined);
      const read = vi.fn().mockResolvedValue(activity());
      const store = setup({ list, archive, activity: read });
      await store.load();
      await store.next();
      await flush();
      const reads = read.mock.calls.length;
      await expect(store.archive('p-12')).resolves.toBe(true);
      expect(archive).toHaveBeenCalledWith('p-12');
      expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'c-2' }));
      expect(store.previous()).toEqual([null]);
      await flush();
      expect(read.mock.calls.length).toBe(reads + 10);
    });

    it('archive du dernier patient d’une page : recul d’une page', async () => {
      const list = vi
        .fn()
        .mockResolvedValueOnce(page(ten(1), 'c-2'))
        .mockResolvedValueOnce(page([patient({ id: 'p-11' })], null))
        .mockResolvedValueOnce(page([], null))
        .mockResolvedValueOnce(page(ten(1), null));
      const store = setup({ list, archive: vi.fn().mockResolvedValue(undefined) });
      await store.load();
      await store.next();
      await store.archive('p-11');
      expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: null }));
      expect(store.items()).toHaveLength(10);
      expect(store.hasPrevious()).toBe(false);
    });

    it('archive refusée : problème gardé, page non relue', async () => {
      const list = vi.fn().mockResolvedValue(page());
      const store = setup({
        list,
        archive: vi.fn().mockRejectedValue({ status: 409, code: 'PATIENT_ARCHIVED' }),
      });
      await store.load();
      await expect(store.archive('p-marie')).resolves.toBe(false);
      expect(store.actionProblem()).toMatchObject({ action: 'archive' });
      expect(list).toHaveBeenCalledTimes(1);
    });

    it('mode archivés puis restore : POST /restore puis relecture ; erreur gardée', async () => {
      const archived = patient({ archivedAt: '2026-11-10T10:00:00Z' });
      const list = vi.fn().mockResolvedValue(page([archived]));
      const restore = vi
        .fn()
        .mockResolvedValueOnce(patient())
        .mockRejectedValueOnce({ status: 404, code: 'PATIENT_NOT_FOUND' });
      const store = setup({ list, restore });
      await store.load();
      await store.setArchived(true);
      expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ archived: true }));
      expect(store.filtered()).toBe(true);
      await expect(store.restore('p-marie')).resolves.toMatchObject({ id: 'p-marie' });
      expect(list).toHaveBeenCalledTimes(3);
      expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ archived: true }));
      await expect(store.restore('p-x')).resolves.toBeNull();
      expect(store.actionProblem()).toMatchObject({
        action: 'restore',
        problem: { code: 'PATIENT_NOT_FOUND' },
      });
    });

    it('effacer les filtres : texte, archivés et filtre rapide remis à zéro', async () => {
      const list = vi.fn().mockResolvedValue(page());
      const store = setup({ list });
      await store.load();
      await store.setQuery('marie');
      await store.setArchived(true);
      await store.clearFilters();
      expect([store.query(), store.archived(), store.quick()]).toEqual(['', false, 'all']);
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({ q: '', archived: false, cursor: null }),
      );
    });
  });

  it('autre compte dans le même onglet : ni patients ni filtres du précédent', async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce(page())
      .mockResolvedValueOnce(page())
      .mockImplementationOnce(() => new Promise(() => undefined));
    const store = setup({ list });
    await store.load();
    await store.setQuery('marie');
    TestBed.inject(SessionStore).signIn(user('karim'));
    void store.load();
    expect(store.items()).toEqual([]);
    expect(store.page().status).toBe('loading');
    expect(store.query()).toBe('');
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ q: '', tag: null }));
  });

  describe('première connexion (M7-03)', () => {
    const DEMO = patient({ id: 'p-demo', displayName: 'DEMO · Camille R.' });

    it.each([
      ['aucun patient', [], null, true],
      ['seulement le patient de démonstration', [DEMO], null, true],
      ['un vrai patient en plus de la démo', [DEMO, patient()], null, false],
      ['démo, mais une page suivante', [DEMO], 'c-2', false],
    ])('welcome : %s → %s', async (_label, items, cursor, expected) => {
      const store = setup({ list: vi.fn().mockResolvedValue(page(items, cursor)) });
      expect(store.welcome()).toBe(false);
      await store.load();
      expect(store.welcome()).toBe(expected);
    });

    it('removeDemo : DELETE puis relecture, sans retrait local ; refus gardé', async () => {
      const list = vi
        .fn()
        .mockResolvedValueOnce(page([DEMO]))
        .mockResolvedValueOnce(page([]));
      const archive = vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce({ status: 403, code: 'PATIENT_FORBIDDEN' });
      const store = setup({ list, archive });
      await store.load();
      await expect(store.removeDemo('p-demo')).resolves.toBe(true);
      expect(list).toHaveBeenCalledTimes(2);
      expect(store.welcome()).toBe(true);
      await expect(store.removeDemo('p-demo')).resolves.toBe(false);
      expect(store.actionProblem()?.action).toBe('removeDemo');
      expect(list).toHaveBeenCalledTimes(2);
    });
  });
});
