import { TestBed } from '@angular/core/testing';

import { ApiProblem } from '../../../core/http';
import { SearchApi } from './search.api';
import { counts, entryPreview, FEELING, hit, NOTE_JUNE, searchPage } from './search.fixtures';
import { EMPTY_FILTERS, SearchFilters, SearchPage } from './search.model';
import { SearchStore } from './search.store';

type Api = Pick<SearchApi, 'find' | 'preview' | 'sessions'>;

function setup(api: Partial<Api> = {}) {
  const mock: Api = {
    find: api.find ?? vi.fn().mockResolvedValue(searchPage()),
    preview: api.preview ?? vi.fn().mockResolvedValue(entryPreview()),
    sessions: api.sessions ?? vi.fn().mockResolvedValue([]),
  };
  TestBed.configureTestingModule({
    providers: [SearchStore, { provide: SearchApi, useValue: mock }],
  });
  const store = TestBed.inject(SearchStore);
  store.open('p-marie');
  return { store, api: mock };
}

const filters = (overrides: Partial<SearchFilters> = {}): SearchFilters => ({
  ...EMPTY_FILTERS,
  q: 'entretien manager',
  ...overrides,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe('SearchStore', () => {
  it('open : séances du patient chargées une fois', async () => {
    const sessions = vi
      .fn()
      .mockResolvedValue([{ id: 's-17oct', startedAt: '2026-10-17T08:00:00Z' }]);
    const { store } = setup({ sessions });
    store.open('p-marie');
    await Promise.resolve();
    expect(sessions).toHaveBeenCalledTimes(1);
    expect(sessions).toHaveBeenCalledWith('p-marie');
    await vi.waitFor(() => expect(store.sessions().status).toBe('loaded'));
  });

  it('moins de 2 caractères : aucune requête, état idle', async () => {
    const { store, api } = setup();
    await store.apply(filters({ q: 'e' }));
    expect(api.find).not.toHaveBeenCalled();
    expect(store.results().status).toBe('idle');
    expect(store.selected()).toBeNull();
  });

  it('cherche, sélectionne le premier résultat et relit son aperçu', async () => {
    const { store, api } = setup();
    const pending = store.apply(filters());
    expect(store.results().status).toBe('loading');
    await pending;
    expect(api.find).toHaveBeenCalledWith('p-marie', {
      q: 'entretien manager',
      types: [],
      from: null,
      to: null,
      sessionId: null,
      includeArchived: false,
      page: 1,
    });
    expect(store.hits().map((h) => h.entryId)).toEqual(['e-entretien', 'e-anxiete']);
    expect(store.selectedId()).toBe('e-entretien');
    expect(api.preview).toHaveBeenCalledWith('e-entretien');
    await vi.waitFor(() => expect(store.preview().data?.title).toContain('Entretien'));
  });

  it('la syntaxe (tag:, émotion:, avant:) part telle quelle dans q : le serveur l’interprète', async () => {
    const { store, api } = setup();
    await store.apply(filters({ q: 'tag:travail émotion:anxiété avant:2026-09' }));
    expect(vi.mocked(api.find).mock.calls[0][1].q).toBe(
      'tag:travail émotion:anxiété avant:2026-09',
    );
  });

  it('filtre de type : envoyé en types[], les compteurs restent ceux du serveur (sans le filtre)', async () => {
    const all = counts({ event: 3, feeling: 3, note: 5 });
    const find = vi
      .fn()
      .mockResolvedValueOnce(searchPage({ counts: all }))
      .mockResolvedValueOnce(searchPage({ exact: [FEELING], total: 3, counts: all }));
    const { store } = setup({ find });
    await store.apply(filters());
    expect(store.allCount()).toBe(11);
    await store.apply(filters({ type: 'feeling' }));
    expect(find.mock.calls[1][1].types).toEqual(['feeling']);
    expect(store.results().data?.counts).toEqual(all);
    expect(store.allCount()).toBe(11);
    expect(store.selectedId()).toBe('e-anxiete');
  });

  it('mêmes filtres (espaces près) : rien ne repart', async () => {
    const { store, api } = setup();
    await store.apply(filters());
    await store.apply(filters({ q: ' entretien   manager ' }));
    expect(api.find).toHaveBeenCalledTimes(1);
  });

  it('une réponse arrivée après une requête plus récente est ignorée', async () => {
    const slow = deferred<SearchPage>();
    const find = vi
      .fn()
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce(searchPage({ exact: [NOTE_JUNE] }));
    const { store } = setup({ find });
    const first = store.apply(filters({ q: 'entretien' }));
    await store.apply(filters({ q: 'manager' }));
    slow.resolve(searchPage({ exact: [hit()] }));
    await first;
    expect(store.hits().map((h) => h.entryId)).toEqual(['e-note-juin']);
  });

  it('garde la sélection (mémoire de l’onglet) si elle est encore dans les résultats', async () => {
    const { store } = setup();
    await store.apply(filters(), 'e-anxiete');
    expect(store.selectedId()).toBe('e-anxiete');
  });

  it('approchés : à la suite des exacts dans la sélection ↑ ↓, sans boucler', async () => {
    const approx = hit({ entryId: 'e-approche', approximate: true });
    const { store } = setup({
      find: vi
        .fn()
        .mockResolvedValue(searchPage({ exact: [hit()], approximate: [approx], total: 1 })),
    });
    await store.apply(filters({ q: 'entretien manger' }));
    expect(store.exact()).toHaveLength(1);
    expect(store.approximate()).toHaveLength(1);
    store.move(1);
    expect(store.selectedId()).toBe('e-approche');
    store.move(1);
    expect(store.selectedId()).toBe('e-approche');
    store.move(-1);
    store.move(-1);
    expect(store.selectedId()).toBe('e-entretien');
  });

  it('erreur : failed avec l’ApiProblem, la liste précédente reste ; refresh réessaie', async () => {
    const problem: ApiProblem = { status: 503, code: 'INTERNAL_ERROR' };
    const find = vi
      .fn()
      .mockResolvedValueOnce(searchPage())
      .mockRejectedValueOnce(problem)
      .mockResolvedValueOnce(searchPage({ exact: [NOTE_JUNE] }));
    const { store } = setup({ find });
    await store.apply(filters());
    await store.apply(filters({ q: 'manager' }));
    expect(store.results().status).toBe('error');
    expect(store.results().problem).toEqual(problem);
    expect(store.hits()).toHaveLength(2);
    await store.refresh();
    expect(store.results().status).toBe('loaded');
    expect(store.hits().map((h) => h.entryId)).toEqual(['e-note-juin']);
  });

  it('more : page suivante ajoutée (sans doublon), remaining décroît', async () => {
    const first = searchPage({ exact: [hit(), FEELING], total: 3 });
    const second = searchPage({ exact: [FEELING, NOTE_JUNE], total: 3, page: 2 });
    const find = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const { store } = setup({ find });
    await store.apply(filters());
    expect(store.remaining()).toBe(1);
    await store.more();
    expect(find.mock.calls[1][1].page).toBe(2);
    expect(store.exact().map((h) => h.entryId)).toEqual([
      'e-entretien',
      'e-anxiete',
      'e-note-juin',
    ]);
    expect(store.remaining()).toBe(0);
    await store.more();
    expect(find).toHaveBeenCalledTimes(2);
  });

  it('more en erreur : la liste reste, moreProblem renseigné', async () => {
    const find = vi
      .fn()
      .mockResolvedValueOnce(searchPage({ total: 5 }))
      .mockRejectedValueOnce({ status: 0, code: 'NETWORK_ERROR' });
    const { store } = setup({ find });
    await store.apply(filters());
    await store.more();
    expect(store.moreProblem()?.code).toBe('NETWORK_ERROR');
    expect(store.hits()).toHaveLength(2);
    expect(store.loadingMore()).toBe(false);
  });

  it('aperçu en erreur puis retryPreview', async () => {
    const preview = vi
      .fn()
      .mockRejectedValueOnce({ status: 404, code: 'ENTRY_NOT_FOUND' })
      .mockResolvedValueOnce(entryPreview());
    const { store } = setup({ preview });
    await store.apply(filters());
    await vi.waitFor(() => expect(store.preview().status).toBe('error'));
    store.retryPreview();
    await vi.waitFor(() => expect(store.preview().status).toBe('loaded'));
  });

  it('retour sous 2 caractères : résultats et sélection effacés', async () => {
    const { store } = setup();
    await store.apply(filters());
    await store.apply(filters({ q: 'e' }));
    expect(store.results().status).toBe('idle');
    expect(store.selectedId()).toBeNull();
    expect(store.preview().status).toBe('idle');
  });
});
