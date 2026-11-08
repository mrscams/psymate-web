import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { PreferencesStore } from '../../../core/preferences';
import { TimelineFiltersStore } from './timeline-filters.store';

import { TimelineApi } from './timeline.api';
import { items, pagedTimeline, timelineItem, timelinePage } from './timeline.fixtures';
import { MAX_WINDOWS, TimelinePage, TimelineQuery } from './timeline.model';
import { TimelineStore } from './timeline.store';

const serverError = { status: 500, code: 'INTERNAL_ERROR' };

/** Laisse passer les requêtes simulées (promesses en chaîne, chargement des voisines). */
async function flush(): Promise<void> {
  for (let i = 0; i < 60; i++) await Promise.resolve();
}

function setup(api: Partial<Record<keyof TimelineApi, unknown>>) {
  const mock = {
    page: vi.fn(),
    sessions: vi.fn().mockResolvedValue({}),
    emotions: vi
      .fn()
      .mockResolvedValue({ labels: { anxiety: 'Anxiété' }, families: { anxiety: 'fear' } }),
    ...api,
  };
  TestBed.configureTestingModule({
    providers: [
      TimelineStore,
      TimelineFiltersStore,
      { provide: TimelineApi, useValue: mock },
      {
        provide: PreferencesStore,
        useValue: { timelineGroupBy: signal('chronological'), set: vi.fn() },
      },
    ],
  });
  return {
    store: TestBed.inject(TimelineStore),
    filters: TestBed.inject(TimelineFiltersStore),
    api: mock,
  };
}

/** API simulée qui sert une chronologie de `total` éléments par pages de 200. */
function paged(total: number) {
  const { all, pages } = pagedTimeline(total);
  const page = vi.fn((_id: string, query: TimelineQuery) => {
    const found = pages.get(query.cursor);
    return found
      ? Promise.resolve(found)
      : Promise.reject({ status: 422, code: 'VALIDATION_FAILED' });
  });
  return { all, page };
}

const cursors = (page: ReturnType<typeof vi.fn>) =>
  page.mock.calls.map(([, query]) => (query as TimelineQuery).cursor);

describe('TimelineStore', () => {
  it('load : première fenêtre, total des facettes, la suivante en arrière-plan', async () => {
    const { page } = paged(1000);
    const { store, api } = setup({ page });
    await store.load('p-1', '2025-03-04');
    await flush();

    expect(store.status()).toBe('loaded');
    expect(store.total()).toBe(1000);
    expect(store.rows()).toHaveLength(1000);
    expect(cursors(page)).toEqual([null, 'c1']);
    expect(page.mock.calls[0][1]).toEqual({
      types: [],
      emotions: [],
      tags: [],
      draftsOnly: false,
      from: null,
      to: null,
      cursor: null,
      limit: 200,
    });
    expect(store.inMemory()).toBe(2);
    expect(store.rows()[0].item?.id).toBe('e-0');
    expect(store.rows()[399].item?.id).toBe('e-399');
    // Au-delà des fenêtres en mémoire : des créneaux vides, le nombre de lignes ne bouge pas.
    expect(store.rows()[400]).toMatchObject({ item: null, state: 'idle', window: 2 });
    expect(api.sessions).toHaveBeenCalledWith('p-1');
    expect(store.emotionLabels()).toEqual({ anxiety: 'Anxiété' });
    expect(store.emotionFamilies()).toEqual({ anxiety: 'fear' });
    expect(store.sessionsReady()).toBe(true);
  });

  it('défilement jusqu’au bout : jamais plus de trois fenêtres en mémoire', async () => {
    const { page } = paged(1000);
    const { store } = setup({ page });
    await store.load('p-1', null);
    await flush();

    for (let slot = 0; slot < 1000; slot += 50) {
      store.visible(slot, slot + 8);
      await flush();
      expect(store.windows().length).toBeLessThanOrEqual(MAX_WINDOWS);
    }
    expect(store.windows().map((w) => w.index)).toEqual([3, 4]);
    expect(store.rows()[999].item?.id).toBe('e-999');
    expect(store.rows()[0]).toMatchObject({ item: null, state: 'idle' });
    expect(store.lastIndex()).toBe(4);
    // Chaque page n'est demandée qu'une fois en descendant.
    expect(cursors(page)).toEqual([null, 'c1', 'c2', 'c3', 'c4']);

    // Remonter : la fenêtre quittée est relue par son curseur, sans repartir du début.
    page.mockClear();
    store.visible(650, 658);
    await flush();
    expect(cursors(page)).toEqual(['c2']);
    expect(store.windows().map((w) => w.index)).toEqual([2, 3, 4]);
  });

  it('zoom : aucune requête, la granularité seule change', async () => {
    const { page } = paged(1000);
    const { store } = setup({ page });
    await store.load('p-1', null);
    await flush();
    const before = page.mock.calls.length;

    store.zoomIn();
    expect(store.zoom()).toBe('day');
    expect(store.canZoomIn()).toBe(false);
    store.zoomOut();
    store.zoomOut();
    expect(store.zoom()).toBe('month');
    expect(store.canZoomOut()).toBe(false);
    store.zoomOut();
    expect(store.zoom()).toBe('month');
    // La zone visible (plus de lignes au zoom arrière) reste dans les fenêtres en mémoire.
    store.visible(0, 30);
    await flush();
    expect(page.mock.calls.length).toBe(before);
  });

  it('zone visible hors des fenêtres en mémoire : la fenêtre manquante est demandée par curseur', async () => {
    const { page } = paged(1000);
    const { store } = setup({ page });
    await store.load('p-1', null);
    await flush();
    page.mockClear();

    store.visible(395, 420);
    await flush();
    // La fenêtre 2 devient la courante : elle est lue, puis sa suivante en arrière-plan.
    expect(cursors(page)).toEqual(['c2', 'c3']);
    expect(store.rows()[420].item?.id).toBe('e-420');
  });

  it('saut lointain (barre de défilement) : les curseurs intermédiaires sont lus, seules trois fenêtres restent', async () => {
    const { page } = paged(2000);
    const { store } = setup({ page });
    await store.load('p-1', null);
    await flush();

    store.visible(1500, 1510);
    await flush();
    expect(store.windows().map((w) => w.index)).toEqual([6, 7, 8]);
    expect(store.rows()[1500].item?.id).toBe('e-1500');
    expect(cursors(page)).toEqual([null, 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8']);
    expect(store.inMemory()).toBe(3);
  });

  it('une fenêtre en échec affiche « Réessayer », les autres restent ; Réessayer la relit', async () => {
    const { page } = paged(600);
    const failing = vi.fn((id: string, query: TimelineQuery) =>
      query.cursor === 'c1' ? Promise.reject(serverError) : page(id, query),
    );
    const { store } = setup({ page: failing });
    await store.load('p-1', null);
    await flush();

    expect(store.windows().find((w) => w.index === 1)?.status).toBe('error');
    expect(store.rows()[200]).toMatchObject({ state: 'error', firstOfWindow: true, window: 1 });
    expect(store.rows()[0].item?.id).toBe('e-0');

    failing.mockImplementation(page);
    await store.retryWindow(1);
    expect(store.rows()[200].item?.id).toBe('e-200');
  });

  it('première fenêtre en échec : état erreur, puis Réessayer', async () => {
    const page = vi
      .fn()
      .mockRejectedValueOnce(serverError)
      .mockResolvedValue(timelinePage({ items: items(3) }));
    const { store } = setup({ page });
    await store.load('p-1', null);
    expect(store.status()).toBe('error');
    expect(store.problem()?.status).toBe(500);

    await store.reload();
    expect(store.status()).toBe('loaded');
    expect(store.total()).toBe(3);
  });

  it('patient sans entrée : chargé, total 0', async () => {
    const { store } = setup({
      page: vi
        .fn()
        .mockResolvedValue(timelinePage({ facets: { types: {}, emotions: {}, tags: {} } })),
    });
    await store.load('p-1', null);
    expect(store.status()).toBe('loaded');
    expect(store.total()).toBe(0);
    expect(store.rows()).toEqual([]);
  });

  it('snapshot puis retour : fenêtres, zoom et position repris sans attendre, puis relus', async () => {
    const { page } = paged(1000);
    const first = setup({ page });
    await first.store.load('p-1', null);
    await flush();
    first.store.visible(450, 460);
    first.store.zoomOut();
    first.store.select('e-455');
    await flush();
    const snapshot = first.store.snapshot()!;
    expect(snapshot.anchor).toBe(450);
    expect(snapshot.windows.map((w) => w.index)).toEqual([1, 2, 3]);

    TestBed.resetTestingModule();
    let release: (value: TimelinePage) => void = () => undefined;
    const slow = vi.fn(
      () =>
        new Promise<TimelinePage>((resolve) => {
          release = resolve;
        }),
    );
    const second = setup({ page: slow });
    const loading = second.store.load('p-1', null, snapshot);
    // Avant toute réponse : l'écran est déjà là, à la même position.
    expect(second.store.status()).toBe('loaded');
    expect(second.store.anchor()).toBe(450);
    expect(second.store.zoom()).toBe('month');
    expect(second.store.selectedId()).toBe('e-455');
    expect(second.store.rows()[450].item?.id).toBe('e-450');
    // La relecture commence par la première page (total, facettes, situations).
    expect(slow).toHaveBeenCalledTimes(1);
    expect(slow.mock.calls[0]).toEqual(['p-1', expect.objectContaining({ cursor: null })]);
    release(pagedTimeline(1000).pages.get(null)!);
    void loading;
  });

  it('snapshot d’un autre patient : ignoré, seul le zoom est repris', async () => {
    const { page } = paged(10);
    const { store } = setup({ page });
    await store.load('p-1', null);
    store.zoomIn();
    const snapshot = store.snapshot()!;

    await store.load('p-2', null, snapshot);
    expect(store.patientId()).toBe('p-2');
    expect(store.zoom()).toBe('day');
    expect(page).toHaveBeenLastCalledWith('p-2', expect.objectContaining({ cursor: null }));
  });

  it('refresh après une écriture : relit sans vider l’écran', async () => {
    const { page } = paged(600);
    const { store } = setup({ page });
    await store.load('p-1', null);
    await flush();
    page.mockClear();

    let release: () => void = () => undefined;
    page.mockImplementationOnce(
      (_id: string, query: TimelineQuery) =>
        new Promise((resolve) => {
          release = () => resolve(pagedTimeline(601).pages.get(query.cursor)!);
        }),
    );
    const done = store.refresh();
    expect(store.rows()[0].item?.id).toBe('e-0');
    release();
    await done;
    await flush();
    expect(store.total()).toBe(601);
    expect(cursors(page)[0]).toBeNull();
  });

  it('refresh loin dans la liste : les curseurs connus servent, aucune page n’est reparcourue', async () => {
    const { page } = paged(1000);
    const { store } = setup({ page });
    await store.load('p-1', null);
    await flush();
    store.visible(650, 658);
    await flush();
    expect(store.windows().map((w) => w.index)).toEqual([2, 3, 4]);
    page.mockClear();

    await store.refresh();
    await flush();
    expect(cursors(page)).toEqual([null, 'c2', 'c3', 'c4']);
    expect(store.windows().map((w) => w.index)).toEqual([2, 3, 4]);
  });

  it('facettes en retard sur les pages : le total s’étend, la liste n’est pas coupée', async () => {
    const { pages } = pagedTimeline(400);
    const late = vi.fn((_id: string, query: TimelineQuery) => {
      const found = pages.get(query.cursor)!;
      return Promise.resolve({
        ...found,
        facets: { types: { note: 200 }, emotions: {}, tags: {} },
      });
    });
    const { store } = setup({ page: late });
    await store.load('p-1', null);
    await flush();
    expect(store.total()).toBe(400);
    expect(store.rows()[399].item?.id).toBe('e-399');
  });

  it('index des séances : pastille « dit en séance du … » et début du suivi', async () => {
    const said = timelineItem({
      id: 'e-said',
      occurred: { from: '2026-10-18T00:00:00Z', to: null, precision: 'day', label: null },
      sessionId: 's-1',
    });
    const sameDay = timelineItem({
      id: 'e-same',
      occurred: { from: '2026-10-17T00:00:00Z', to: null, precision: 'day', label: null },
      sessionId: 's-1',
    });
    const old = timelineItem({
      id: 'e-old',
      occurred: { from: '2014-01-01T00:00:00Z', to: null, precision: 'year', label: null },
      sessionId: 's-0',
    });
    const { store } = setup({
      page: vi.fn().mockResolvedValue(timelinePage({ items: [said, sameDay, old] })),
      sessions: vi
        .fn()
        .mockResolvedValue({ 's-1': '2026-10-17T16:00:00Z', 's-0': '2025-03-04T09:00:00Z' }),
    });
    await store.load('p-1', '2025-03-04');

    expect(store.followStart()).toBe('2025-03-04');
    const rows = store.rows();
    expect(rows[0].saidIn).toBe('2026-10-17T16:00:00Z');
    expect(rows[1].saidIn).toBeNull();
    expect(rows[2]).toMatchObject({ before: true, firstBefore: true });
    expect(rows[1].before).toBe(false);
  });

  it('les index annexes en échec ne bloquent pas la chronologie', async () => {
    const { store } = setup({
      page: vi.fn().mockResolvedValue(timelinePage({ items: items(2) })),
      sessions: vi.fn().mockRejectedValue(serverError),
      emotions: vi.fn().mockRejectedValue(serverError),
    });
    await store.load('p-1', null);
    expect(store.status()).toBe('loaded');
    expect(store.sessions()).toEqual({});
  });

  it('locate (?focus=) : lit les fenêtres jusqu’à l’entrée, trois au plus en mémoire', async () => {
    const { page } = paged(1000);
    const { store } = setup({ page });
    await store.load('p-1', null);
    await flush();

    expect(await store.locate('e-650')).toBe(650);
    await flush();
    expect(store.selectedId()).toBe('e-650');
    expect(store.anchor()).toBe(650);
    expect(store.current()).toBe(3);
    expect(store.windows().length).toBeLessThanOrEqual(MAX_WINDOWS);
    expect(store.rows()[650].item?.id).toBe('e-650');
    expect(await store.locate('inconnue')).toBeNull();
    expect(store.windows().length).toBeLessThanOrEqual(MAX_WINDOWS);
  });

  it('applyFilters : la requête porte les filtres, la plage est relue depuis la première page', async () => {
    const { page } = paged(1000);
    const { store, filters } = setup({ page });
    await store.load('p-1', null);
    await flush();
    store.visible(450, 460);
    await flush();
    page.mockClear();

    filters.set({
      types: ['feeling'],
      emotions: ['anxiety'],
      tags: ['sommeil'],
      draftsOnly: true,
      from: null,
      to: null,
    });
    await store.applyFilters();
    await flush();
    expect(page.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        types: ['feeling'],
        emotions: ['anxiety'],
        tags: ['sommeil'],
        draftsOnly: true,
        cursor: null,
      }),
    );
    // Position remise en haut, fenêtres relues depuis la première.
    expect(store.anchor()).toBe(0);
    expect(store.current()).toBe(0);
    expect(cursors(page)).toEqual([null, 'c1']);
  });

  it('applyFilters : une réponse d’avant le changement est ignorée', async () => {
    let release: (value: TimelinePage) => void = () => undefined;
    const page = vi
      .fn()
      .mockImplementationOnce(() => new Promise<TimelinePage>((resolve) => (release = resolve)))
      .mockResolvedValue(timelinePage({ items: items(2, 'f') }));
    const { store, filters } = setup({ page });
    const loading = store.load('p-1', null);
    filters.set({ ...filters.filters(), emotions: ['anxiety'] });
    await store.applyFilters();
    release(timelinePage({ items: items(5) }));
    await loading;
    await flush();
    expect(store.total()).toBe(2);
    expect(store.rows()[0].item?.id).toBe('f-0');
  });

  it('mode par séance (headOnly) : les trois premières fenêtres, le défilement ne les déplace pas', async () => {
    const { page } = paged(1000);
    const { store, filters } = setup({ page });
    filters.overrideForVisit('session');
    await store.load('p-1', null);
    await flush();
    expect(store.windows().map((w) => w.index)).toEqual([0, 1, 2]);
    const head = store.head();
    expect(head.ready).toBe(true);
    expect(head.complete).toBe(false);
    expect(head.items).toHaveLength(600);
    store.visible(900, 910);
    await flush();
    expect(store.windows().map((w) => w.index)).toEqual([0, 1, 2]);

    // Retour au chronologique : le défilement reprend la main.
    filters.overrideForVisit('chronological');
    store.visible(900, 910);
    await flush();
    expect(store.windows().map((w) => w.index)).toEqual([3, 4]);
  });

  it('head : complet quand toute la plage tient dans les fenêtres lues', async () => {
    const { page } = paged(250);
    const { store, filters } = setup({ page });
    filters.overrideForVisit('session');
    await store.load('p-1', null);
    await flush();
    expect(store.head()).toMatchObject({ ready: true, complete: true, failed: null });
    expect(store.head().items).toHaveLength(250);
  });

  it('head : une fenêtre en échec est signalée', async () => {
    const { pages } = pagedTimeline(500);
    const page = vi.fn((_id: string, query: TimelineQuery) =>
      query.cursor === 'c2'
        ? Promise.reject(serverError)
        : Promise.resolve(pages.get(query.cursor)!),
    );
    const { store, filters } = setup({ page });
    filters.overrideForVisit('session');
    await store.load('p-1', null);
    await flush();
    expect(store.head().ready).toBe(false);
    expect(store.head().failed?.index).toBe(2);
  });

  it('passage en mode par séance (préférence, bascule) : recentrage sur les premières fenêtres', async () => {
    const { page } = paged(1000);
    const { store, filters } = setup({ page });
    await store.load('p-1', null);
    await flush();
    store.visible(900, 910);
    await flush();
    expect(store.windows().map((w) => w.index)).toEqual([3, 4]);
    expect(store.headOnly()).toBe(false);
    filters.overrideForVisit('session');
    TestBed.tick();
    await flush();
    expect(store.headOnly()).toBe(true);
    expect(store.windows().map((w) => w.index)).toEqual([0, 1, 2]);
  });

  it('refresh({ side: false }) : l’index des séances n’est pas relu', async () => {
    const { page } = paged(10);
    const sessions = vi.fn().mockResolvedValue({});
    const { store } = setup({ page, sessions });
    await store.load('p-1', null);
    await flush();
    sessions.mockClear();
    await store.refresh({ side: false });
    await flush();
    expect(sessions).not.toHaveBeenCalled();
    await store.refresh();
    await flush();
    expect(sessions).toHaveBeenCalledTimes(1);
  });
});
