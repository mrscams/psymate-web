import { TestBed } from '@angular/core/testing';

import { GraphApi } from './graph.api';
import { expansion, graphView, superNode } from './graph.fixtures';
import { DEFAULT_QUERY, GraphQuery } from './graph.model';
import { GraphStore } from './graph.store';
import { LinkApi } from './link.api';
import { CATALOG, link, source } from './link.fixtures';

const serverError = { status: 500, code: 'INTERNAL_ERROR' };

async function flush(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

function setup(graph: Partial<Record<keyof GraphApi, unknown>> = {}, links: object = {}) {
  const graphApi = {
    neighbourhood: vi.fn().mockResolvedValue(graphView()),
    expand: vi.fn().mockResolvedValue(expansion()),
    emotionLabels: vi.fn().mockResolvedValue({ anxiety: 'Anxiété' }),
    ...graph,
  };
  const linkApi = {
    linkTypes: vi.fn().mockResolvedValue(CATALOG),
    entry: vi.fn().mockResolvedValue(source({ id: 'e-feeling' })),
    linksOf: vi.fn().mockResolvedValue([link()]),
    ...links,
  };
  TestBed.configureTestingModule({
    providers: [
      GraphStore,
      { provide: GraphApi, useValue: graphApi },
      { provide: LinkApi, useValue: linkApi },
    ],
  });
  return { store: TestBed.inject(GraphStore), graphApi, linkApi };
}

const rooted: GraphQuery = { ...DEFAULT_QUERY, root: 'e-situation', depth: 3 };

describe('GraphStore', () => {
  it('load : le voisinage de la racine, le catalogue et les émotions', async () => {
    const { store, graphApi } = setup();
    await store.load('p-1', { ...rooted, linkTypes: ['worsens'], period: '30d' });
    await flush();
    expect(graphApi.neighbourhood).toHaveBeenCalledWith('p-1', {
      root: 'e-situation',
      depth: 3,
      linkTypes: ['worsens'],
      from: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
    expect(store.graph().status).toBe('loaded');
    expect(store.counts()).toEqual({ nodes: 4, edges: 3 });
    expect(store.rootNode()?.title).toBe('Surcharge au travail');
    expect(store.catalog().data).toHaveLength(8);
    expect(store.lineStyles()['treats']).toBe('double');
    expect(store.emotionLabels()).toEqual({ anxiety: 'Anxiété' });
    expect(store.key()).toBe('e-situation');
  });

  it('filtre des types d’entrées : local, sans nouvelle requête', async () => {
    const { store, graphApi } = setup();
    await store.load('p-1', rooted);
    await store.load('p-1', { ...rooted, types: ['feeling'] });
    expect(graphApi.neighbourhood).toHaveBeenCalledTimes(1);
    expect(store.view()?.nodes.map((n) => n.id)).toEqual(['e-situation', 'e-feeling']);
    expect(store.counts()).toEqual({ nodes: 2, edges: 1 });
    // La profondeur, elle, relit le graphe.
    await store.load('p-1', { ...rooted, depth: 1 });
    expect(graphApi.neighbourhood).toHaveBeenCalledTimes(2);
  });

  it('erreur : le dernier graphe reste, Réessayer relit', async () => {
    const neighbourhood = vi
      .fn()
      .mockResolvedValueOnce(graphView())
      .mockRejectedValueOnce(serverError)
      .mockResolvedValueOnce(graphView({ edges: [] }));
    const { store } = setup({ neighbourhood });
    await store.load('p-1', rooted);
    await store.refresh();
    expect(store.graph().status).toBe('error');
    expect(store.graph().problem?.code).toBe('INTERNAL_ERROR');
    expect(store.graph().data?.edges).toHaveLength(3);
    await store.retry();
    expect(store.graph().status).toBe('loaded');
    expect(store.graph().data?.edges).toEqual([]);
  });

  it('erreur sans graphe précédent : 404 de la racine rangé tel quel', async () => {
    const { store } = setup({
      neighbourhood: vi.fn().mockRejectedValue({ status: 404, code: 'ENTRY_NOT_FOUND' }),
    });
    await store.load('p-1', rooted);
    expect(store.graph()).toMatchObject({ status: 'error', data: null });
    expect(store.graph().problem?.status).toBe(404);
  });

  it('seule la dernière réponse compte', async () => {
    let resolveFirst: (value: unknown) => void = () => undefined;
    const neighbourhood = vi
      .fn()
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce(graphView({ edges: [] }));
    const { store } = setup({ neighbourhood });
    const first = store.load('p-1', rooted);
    await store.load('p-1', { ...rooted, depth: 1 });
    resolveFirst(graphView());
    await first;
    expect(store.graph().data?.edges).toEqual([]);
    expect(store.query().depth).toBe(1);
  });

  it('select : détail de l’entrée (entrée + liens), trois états ; un super-nœud n’a pas de détail', async () => {
    const entry = vi.fn().mockRejectedValueOnce(serverError).mockResolvedValue(source());
    const { store, linkApi } = setup({}, { entry });
    await store.load('p-1', rooted);
    store.select('e-feeling');
    expect(store.detail().status).toBe('loading');
    await flush();
    expect(store.detail().status).toBe('error');
    await store.retryDetail();
    expect(store.detail().data?.links).toEqual([link()]);
    expect(linkApi.linksOf).toHaveBeenCalledWith('e-feeling');
    expect(store.selectedNode()?.id).toBe('e-feeling');

    store.select('sn:e-situation:feeling');
    expect(store.detail().status).toBe('idle');
    store.select(null);
    expect(store.selectedNode()).toBeNull();
  });

  it('expandGroup : les membres remplacent le super-nœud, redéplié après une relecture', async () => {
    const withGroup = graphView({ superNodes: [superNode()], truncated: true });
    const { store, graphApi } = setup({
      neighbourhood: vi.fn().mockResolvedValue(withGroup),
    });
    await store.load('p-1', rooted);
    store.select('sn:e-situation:feeling');
    expect(store.selectedGroup()?.count).toBe(3);
    expect(store.counts()).toEqual({ nodes: 5, edges: 3 });

    expect(await store.expandGroup('sn:e-situation:feeling')).toBe(true);
    expect(graphApi.expand).toHaveBeenCalledWith('p-1', 'sn:e-situation:feeling');
    expect(store.graph().data?.superNodes).toEqual([]);
    expect(store.counts()).toEqual({ nodes: 7, edges: 6 });
    expect(store.selectedId()).toBeNull();
    expect(store.expanded()).toEqual(['sn:e-situation:feeling']);

    await store.refresh();
    expect(graphApi.expand).toHaveBeenCalledTimes(2);
    expect(store.counts()).toEqual({ nodes: 7, edges: 6 });
  });

  it('expandGroup : 404 SUPER_NODE_NOT_FOUND → problème rangé et graphe relu', async () => {
    const { store, graphApi } = setup({
      neighbourhood: vi.fn().mockResolvedValue(graphView({ superNodes: [superNode()] })),
      expand: vi.fn().mockRejectedValue({ status: 404, code: 'SUPER_NODE_NOT_FOUND' }),
    });
    await store.load('p-1', rooted);
    expect(await store.expandGroup('sn:e-situation:feeling')).toBe(false);
    expect(store.expandProblem()?.code).toBe('SUPER_NODE_NOT_FOUND');
    expect(graphApi.neighbourhood).toHaveBeenCalledTimes(2);
  });

  it('refresh : une sélection disparue est oubliée', async () => {
    const neighbourhood = vi
      .fn()
      .mockResolvedValueOnce(graphView())
      .mockResolvedValueOnce(graphView({ nodes: graphView().nodes.slice(0, 1), edges: [] }));
    const { store } = setup({ neighbourhood });
    await store.load('p-1', rooted);
    store.select('e-feeling');
    await store.refresh();
    expect(store.selectedId()).toBeNull();
  });

  it('zoom et positions par racine ; snapshot puis restore sans rien déplacer', async () => {
    const { store, graphApi } = setup();
    await store.load('p-1', rooted);
    store.rememberViewport('e-situation', { zoom: 1.5, pan: { x: 10, y: 20 } });
    store.rememberPositions('e-situation', { 'e-feeling': { x: 1, y: 2 } });
    store.rememberPositions('e-situation', { 'e-event': { x: 3, y: 4 } });
    expect(store.currentViewport()).toEqual({ zoom: 1.5, pan: { x: 10, y: 20 } });
    expect(store.currentPositions()).toEqual({
      'e-feeling': { x: 1, y: 2 },
      'e-event': { x: 3, y: 4 },
    });
    store.select('e-feeling');
    await flush();

    const snapshot = store.snapshot();
    expect(snapshot).toMatchObject({
      patientId: 'p-1',
      query: rooted,
      selectedId: 'e-feeling',
      viewports: { 'e-situation': { zoom: 1.5 } },
    });

    TestBed.resetTestingModule();
    const again = setup();
    await again.store.restore(snapshot!);
    expect(again.store.currentViewport()?.zoom).toBe(1.5);
    expect(again.store.currentPositions()?.['e-event']).toEqual({ x: 3, y: 4 });
    expect(again.store.selectedId()).toBe('e-feeling');
    expect(again.store.graph().data?.nodes).toHaveLength(4);
    // Relu en arrière-plan sans vider.
    expect(again.graphApi.neighbourhood).toHaveBeenCalledTimes(1);
    expect(graphApi.neighbourhood).toHaveBeenCalledTimes(1);

    again.store.forgetLayout('e-situation');
    expect(again.store.currentViewport()).toBeNull();
    expect(again.store.currentPositions()).toBeNull();
  });

  it('autre racine : la clé du canevas suit le graphe reçu, pas la requête en cours', async () => {
    let resolveSecond: (value: unknown) => void = () => undefined;
    const neighbourhood = vi
      .fn()
      .mockResolvedValueOnce(graphView())
      .mockImplementationOnce(() => new Promise((resolve) => (resolveSecond = resolve)));
    const { store } = setup({ neighbourhood });
    await store.load('p-1', rooted);
    store.rememberViewport('e-situation', { zoom: 2, pan: { x: 0, y: 0 } });
    const pending = store.load('p-1', { ...rooted, root: 'e-med' });
    expect(store.key()).toBe('e-situation');
    expect(store.currentViewport()?.zoom).toBe(2);
    resolveSecond(graphView());
    await pending;
    expect(store.key()).toBe('e-med');
    expect(store.currentViewport()).toBeNull();
  });

  it('racine par défaut : la situation en cours la plus liée ; null si la synthèse échoue', async () => {
    const { store, graphApi } = setup({
      defaultRoot: vi.fn().mockResolvedValueOnce('e-situation').mockRejectedValue(serverError),
    });
    await store.load('p-1', rooted);
    expect(await store.resolveDefaultRoot('p-2')).toBe('e-situation');
    expect(graphApi.defaultRoot).toHaveBeenCalledWith('p-2');
    // Un autre dossier : l'état repart de zéro, le bloc graphe attend sa lecture.
    expect(store.patientId()).toBe('p-2');
    expect(store.graph().status).toBe('idle');
    expect(await store.resolveDefaultRoot('p-2')).toBeNull();
    await store.load('p-2', DEFAULT_QUERY);
    expect(graphApi.neighbourhood).toHaveBeenLastCalledWith(
      'p-2',
      expect.objectContaining({ root: null }),
    );
  });

  it('« Centré sur » : recherche dans tout le dossier, trois états, rien sans texte', async () => {
    const found = [{ ...source({ id: 'e-far' }) }];
    const targets = vi
      .fn()
      .mockResolvedValueOnce(found)
      .mockRejectedValueOnce(serverError)
      .mockReturnValueOnce(new Promise(() => undefined));
    const { store } = setup({}, { targets });
    await store.load('p-1', rooted);
    await store.searchRoots('  ');
    expect(targets).not.toHaveBeenCalled();
    expect(store.rootSearch().status).toBe('idle');
    await store.searchRoots('loin');
    expect(targets).toHaveBeenCalledWith('p-1', { q: 'loin', type: null });
    expect(store.rootSearch().data?.map((entry) => entry.id)).toEqual(['e-far']);
    await store.searchRoots('autre');
    expect(store.rootSearch().status).toBe('error');
    void store.searchRoots('encore');
    expect(store.rootSearch().status).toBe('loading');
    await store.searchRoots('');
    expect(store.rootSearch().status).toBe('idle');
  });

  it('un autre dossier repart de zéro', async () => {
    const { store } = setup();
    await store.load('p-1', rooted);
    store.rememberViewport('e-situation', { zoom: 2, pan: { x: 0, y: 0 } });
    store.select('e-feeling');
    await store.load('p-2', DEFAULT_QUERY);
    expect(store.patientId()).toBe('p-2');
    expect(store.viewports()).toEqual({});
    expect(store.selectedId()).toBeNull();
  });
});
