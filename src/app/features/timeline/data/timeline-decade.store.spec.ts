import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { PreferencesStore } from '../../../core/preferences';
import { DecadeRange, periodMonth, TimelinePeriod } from './timeline-decade.model';
import { TimelineDecadeStore } from './timeline-decade.store';
import { NO_FILTERS } from './timeline-filters.model';
import { TimelineFiltersStore } from './timeline-filters.store';
import { TimelineApi } from './timeline.api';
import { monthlySummary } from './timeline.fixtures';

const serverError = { status: 500, code: 'INTERNAL_ERROR' };

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

function setup(
  summary: (id: string, range: DecadeRange) => Promise<TimelinePeriod[]>,
  groupBy: 'session' | 'month' | 'chronological' = 'chronological',
) {
  const api = { summary: vi.fn(summary) };
  const timelineGroupBy = signal(groupBy);
  TestBed.configureTestingModule({
    providers: [
      TimelineDecadeStore,
      TimelineFiltersStore,
      { provide: TimelineApi, useValue: api },
      { provide: PreferencesStore, useValue: { timelineGroupBy, set: vi.fn() } },
    ],
  });
  return {
    store: TestBed.inject(TimelineDecadeStore),
    filters: TestBed.inject(TimelineFiltersStore),
    api,
    timelineGroupBy,
  };
}

/** Cinq ans de suivi (60 mois consécutifs, une séance par mois) jusqu'en octobre 2026. */
const fiveYears = monthlySummary(60, '2026-10');
/** Deux ans de suivi. */
const twoYears = monthlySummary(24, '2026-10');

describe('TimelineDecadeStore', () => {
  it('bascule automatique : plus de 3 ans de suivi → agrégat, sans rien demander d’autre', async () => {
    const { store, api } = setup(() => Promise.resolve(fiveYears));
    expect(store.view()).toBe('detail');
    const opening = store.open('p-1', '2026-11-08');
    expect(store.status()).toBe('loading');
    expect(store.settled()).toBe(false);
    await opening;
    expect(api.summary).toHaveBeenCalledExactlyOnceWith('p-1', {
      from: null,
      to: null,
      fromDay: null,
      toDay: null,
    });
    expect(store.settled()).toBe(true);
    expect(store.plage()).toEqual({ start: periodMonth('2021-11'), end: periodMonth('2026-10') });
    expect(store.view()).toBe('decade');
  });

  it('3 ans ou moins : le détail', async () => {
    const { store } = setup(() => Promise.resolve(twoYears));
    await store.open('p-1', null);
    expect(store.view()).toBe('detail');
  });

  it('retour automatique au détail quand la période repasse sous 3 ans, et inversement', async () => {
    const { store, filters, api } = setup((_id, range) =>
      Promise.resolve(range.fromDay ? fiveYears.slice(-12) : fiveYears),
    );
    await store.open('p-1', null);
    expect(store.view()).toBe('decade');

    filters.set({ ...NO_FILTERS, from: '2025-11-01' });
    await store.syncRange(false);
    expect(api.summary).toHaveBeenLastCalledWith(
      'p-1',
      expect.objectContaining({ fromDay: '2025-11-01', toDay: null }),
    );
    expect(store.view()).toBe('detail');

    filters.set(NO_FILTERS);
    await store.syncRange(false);
    expect(store.view()).toBe('decade');
  });

  it('un filtre autre que la période ne relit pas le résumé', async () => {
    const { store, filters, api } = setup(() => Promise.resolve(fiveYears));
    await store.open('p-1', null);
    filters.set({ ...NO_FILTERS, types: ['feeling'] });
    await store.syncRange(false);
    expect(api.summary).toHaveBeenCalledOnce();
    expect(store.view()).toBe('decade');
  });

  it('préférence timeline.groupBy = month : l’agrégat même sur une plage courte, sauf mois ouvert', async () => {
    const { store, filters } = setup(() => Promise.resolve(twoYears), 'month');
    await store.open('p-1', null);
    expect(filters.mode()).toBe('chronological');
    expect(store.view()).toBe('decade');

    // Double-clic sur un mois : la période devient ce mois, le détail l'emporte.
    filters.set({ ...NO_FILTERS, from: '2026-03-01', to: '2026-03-31' });
    await store.syncRange(true);
    expect(store.view()).toBe('detail');

    // `?mode=` impose un mode : l'agrégat n'est plus forcé.
    filters.set(NO_FILTERS);
    await store.syncRange(false);
    expect(store.view()).toBe('decade');
    filters.overrideForVisit('chronological');
    expect(store.view()).toBe('detail');
  });

  it('mode par séance : toujours le détail (l’état C est chronologique)', async () => {
    const { store, timelineGroupBy } = setup(() => Promise.resolve(fiveYears), 'session');
    await store.open('p-1', null);
    expect(store.view()).toBe('detail');
    timelineGroupBy.set('chronological');
    expect(store.view()).toBe('decade');
  });

  it('zoom : − au-delà du mois → agrégat, + → détail ; oubliés quand la période change', async () => {
    const { store, filters } = setup(() => Promise.resolve(twoYears));
    await store.open('p-1', null);
    store.showDecade();
    expect(store.view()).toBe('decade');
    store.showDetail();
    expect(store.view()).toBe('detail');
    store.showDecade();
    filters.set({ ...NO_FILTERS, from: '2026-01-01' });
    await store.syncRange(false);
    expect(store.manual()).toBeNull();
    expect(store.view()).toBe('detail');
  });

  it('erreur : vue décidée sans le résumé (détail), Réessayer relit', async () => {
    const summary = vi
      .fn<(id: string, range: DecadeRange) => Promise<TimelinePeriod[]>>()
      .mockRejectedValueOnce(serverError)
      .mockResolvedValue(fiveYears);
    const { store } = setup(summary);
    await store.open('p-1', null);
    expect(store.status()).toBe('error');
    expect(store.problem()?.code).toBe('INTERNAL_ERROR');
    expect(store.settled()).toBe(true);
    expect(store.view()).toBe('detail');
    await store.retrySummary();
    expect(store.status()).toBe('loaded');
    expect(store.view()).toBe('decade');
  });

  it('relecture après une écriture : sans vider l’écran ni changer de vue, échec ignoré', async () => {
    const summary = vi
      .fn<(id: string, range: DecadeRange) => Promise<TimelinePeriod[]>>()
      .mockResolvedValueOnce(fiveYears)
      .mockRejectedValueOnce(serverError)
      .mockResolvedValue(fiveYears.slice(-40));
    const { store } = setup(summary);
    await store.open('p-1', null);
    store.showDetail();
    const reread = store.rereadSummary();
    expect(store.status()).toBe('loaded');
    await reread;
    expect(store.status()).toBe('loaded');
    expect(store.periods()).toHaveLength(60);
    await store.rereadSummary();
    expect(store.periods()).toHaveLength(40);
    expect(store.view()).toBe('detail');
  });

  it('une réponse d’une demande passée est ignorée', async () => {
    let resolveFirst: (value: TimelinePeriod[]) => void = () => undefined;
    const summary = vi
      .fn<(id: string, range: DecadeRange) => Promise<TimelinePeriod[]>>()
      .mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValue(twoYears);
    const { store, filters } = setup(summary);
    void store.open('p-1', null);
    filters.set({ ...NO_FILTERS, from: '2025-01-01' });
    await store.syncRange(false);
    resolveFirst(fiveYears);
    await flush();
    expect(store.periods()).toHaveLength(24);
  });

  it('snapshot puis retour : repris sans attendre, puis relu en arrière-plan', async () => {
    const first = setup(() => Promise.resolve(fiveYears));
    await first.store.open('p-1', null);
    first.store.showDetail();
    const snapshot = { ...first.store.snapshot()!, drillBack: null };
    TestBed.resetTestingModule();

    let resolve: (value: TimelinePeriod[]) => void = () => undefined;
    const second = setup(() => new Promise((r) => (resolve = r)));
    const opening = second.store.open('p-1', null, snapshot);
    expect(second.store.status()).toBe('loaded');
    expect(second.store.view()).toBe('detail');
    resolve(fiveYears);
    await opening;
    expect(second.api.summary).toHaveBeenCalledOnce();
  });
});
