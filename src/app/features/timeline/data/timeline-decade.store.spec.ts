import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { PreferencesStore } from '../../../core/preferences';
import { DecadeRange, periodMonth, TimelinePeriod } from './timeline-decade.model';
import { TimelineDecadeStore } from './timeline-decade.store';
import { localDay, NO_FILTERS } from './timeline-filters.model';
import { TimelineFiltersStore } from './timeline-filters.store';
import { TimelineApi } from './timeline.api';
import { monthlySummary } from './timeline.fixtures';
import { TimelineStore } from './timeline.store';

const serverError = { status: 500, code: 'INTERNAL_ERROR' };

type Summary = (id: string, range: DecadeRange) => Promise<TimelinePeriod[]>;

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

function never<T>(): Promise<T> {
  return new Promise<T>(() => undefined);
}

function setup(
  summary: Summary,
  groupBy: 'session' | 'month' | 'chronological' = 'chronological',
  followStart: string | null = '2026-11-08',
) {
  const api = { summary: vi.fn(summary) };
  const timelineGroupBy = signal(groupBy);
  TestBed.configureTestingModule({
    providers: [
      TimelineDecadeStore,
      TimelineFiltersStore,
      { provide: TimelineApi, useValue: api },
      // Le début du suivi vient du TimelineStore (une seule source).
      { provide: TimelineStore, useValue: { followStart: signal(followStart) } },
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
    const opening = store.open('p-1');
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
    expect(store.plage()).toEqual(
      expect.objectContaining({ start: periodMonth('2021-11'), end: periodMonth('2026-10') }),
    );
    expect(store.view()).toBe('decade');
  });

  it('3 ans ou moins : le détail', async () => {
    const { store } = setup(() => Promise.resolve(twoYears));
    await store.open('p-1');
    expect(store.view()).toBe('detail');
  });

  it('début du suivi déclaré plus tôt que la première séance : il étire la plage', async () => {
    const { store } = setup(() => Promise.resolve(twoYears), 'chronological', '2021-01-15');
    await store.open('p-1');
    expect(store.plage()?.startDay).toBe('2021-01-15');
    expect(store.view()).toBe('decade');
  });

  it('retour automatique au détail quand la période repasse sous 3 ans, et inversement', async () => {
    const { store, filters, api } = setup((_id, range) =>
      Promise.resolve(range.fromDay ? fiveYears.slice(-12) : fiveYears),
    );
    await store.open('p-1');
    expect(store.view()).toBe('decade');

    filters.set({ ...NO_FILTERS, from: '2025-11-01' });
    await store.syncRange();
    expect(api.summary).toHaveBeenLastCalledWith(
      'p-1',
      expect.objectContaining({ fromDay: '2025-11-01', toDay: null }),
    );
    expect(store.view()).toBe('detail');

    filters.set(NO_FILTERS);
    await store.syncRange();
    expect(store.view()).toBe('decade');
  });

  it('période bornée par les filtres : la vue se décide sans attendre le résumé', async () => {
    const { store, filters, api } = setup(() => Promise.resolve(fiveYears));
    await store.open('p-1');
    api.summary.mockImplementation(() => never());

    filters.set({ ...NO_FILTERS, from: '2020-01-01', to: '2026-10-31' });
    void store.syncRange();
    expect(store.status()).toBe('loading');
    expect(store.settled()).toBe(true);
    expect(store.view()).toBe('decade');

    filters.set({ ...NO_FILTERS, from: '2026-01-01', to: '2026-03-31' });
    void store.syncRange();
    expect(store.settled()).toBe(true);
    expect(store.view()).toBe('detail');

    // Début à moins de 3 ans, sans fin : le détail, sans attendre.
    const recent = new Date();
    recent.setFullYear(recent.getFullYear() - 1);
    filters.set({ ...NO_FILTERS, from: localDay(recent) });
    void store.syncRange();
    expect(store.settled()).toBe(true);
    expect(store.view()).toBe('detail');

    // Début il y a plus de 3 ans, sans fin : la fin vient du résumé, on l'attend.
    filters.set({ ...NO_FILTERS, from: '2019-01-01' });
    void store.syncRange();
    expect(store.settled()).toBe(false);
  });

  it('un filtre autre que la période ne relit pas le résumé', async () => {
    const { store, filters, api } = setup(() => Promise.resolve(fiveYears));
    await store.open('p-1');
    filters.set({ ...NO_FILTERS, types: ['feeling'] });
    await store.syncRange();
    expect(api.summary).toHaveBeenCalledOnce();
    expect(store.view()).toBe('decade');
  });

  it('préférence timeline.groupBy = month : l’agrégat même sur une plage courte, sauf mois ouvert', async () => {
    const { store, filters } = setup(() => Promise.resolve(twoYears), 'month');
    await store.open('p-1');
    expect(filters.mode()).toBe('chronological');
    expect(store.view()).toBe('decade');

    // Double-clic sur un mois : la période d'avant est gardée, le détail l'emporte.
    store.markDrill({ from: null, to: null });
    filters.set({ ...NO_FILTERS, from: '2026-03-01', to: '2026-03-31' });
    await store.syncRange();
    expect(store.drilled()).toBe(true);
    expect(store.view()).toBe('detail');
    // Un second double-clic garde la période d'origine.
    store.markDrill({ from: '2026-03-01', to: '2026-03-31' });
    expect(store.drillBack()).toEqual({ from: null, to: null });

    // Échap : plus de mois ouvert, l'agrégat forcé revient.
    store.forgetDrill();
    filters.set(NO_FILTERS);
    await store.syncRange();
    expect(store.view()).toBe('decade');
    // `?mode=` impose un mode : l'agrégat n'est plus forcé.
    filters.overrideForVisit('chronological');
    expect(store.view()).toBe('detail');
  });

  it('mode par séance : toujours le détail, et le résumé n’est demandé qu’au passage en chronologique', async () => {
    const { store, api, timelineGroupBy } = setup(() => Promise.resolve(fiveYears), 'session');
    await store.open('p-1');
    expect(api.summary).not.toHaveBeenCalled();
    expect(store.status()).toBe('idle');
    expect(store.view()).toBe('detail');
    timelineGroupBy.set('chronological');
    TestBed.tick();
    await flush();
    expect(api.summary).toHaveBeenCalledOnce();
    expect(store.view()).toBe('decade');
  });

  it('zoom : − au-delà du mois → agrégat, + → détail ; oubliés quand la période change', async () => {
    const { store, filters } = setup(() => Promise.resolve(twoYears));
    await store.open('p-1');
    store.showDecade();
    expect(store.view()).toBe('decade');
    store.showDetail();
    expect(store.view()).toBe('detail');
    store.showDecade();
    filters.set({ ...NO_FILTERS, from: '2026-01-01' });
    await store.syncRange();
    expect(store.manual()).toBeNull();
    expect(store.view()).toBe('detail');
  });

  it('erreur : vue décidée sans le résumé (détail), Réessayer relit', async () => {
    const summary = vi
      .fn<Summary>()
      .mockRejectedValueOnce(serverError)
      .mockResolvedValue(fiveYears);
    const { store } = setup(summary);
    await store.open('p-1');
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
      .fn<Summary>()
      .mockResolvedValueOnce(fiveYears)
      .mockRejectedValueOnce(serverError)
      .mockResolvedValue(fiveYears.slice(-40));
    const { store } = setup(summary);
    await store.open('p-1');
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
      .fn<Summary>()
      .mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValue(twoYears);
    const { store, filters } = setup(summary);
    void store.open('p-1');
    filters.set({ ...NO_FILTERS, from: '2025-01-01' });
    await store.syncRange();
    resolveFirst(fiveYears);
    await flush();
    expect(store.periods()).toHaveLength(24);
  });

  it('snapshot puis retour : repris sans attendre (mois ouvert compris), puis relu en arrière-plan', async () => {
    const first = setup(() => Promise.resolve(fiveYears));
    await first.store.open('p-1');
    first.store.showDetail();
    first.store.markDrill({ from: '2020-01-01', to: null });
    const snapshot = first.store.snapshot()!;
    TestBed.resetTestingModule();

    let resolve: (value: TimelinePeriod[]) => void = () => undefined;
    const second = setup(() => new Promise((r) => (resolve = r)));
    const opening = second.store.open('p-1', snapshot);
    expect(second.store.status()).toBe('loaded');
    expect(second.store.view()).toBe('detail');
    expect(second.store.drillBack()).toEqual({ from: '2020-01-01', to: null });
    resolve(fiveYears);
    await opening;
    expect(second.api.summary).toHaveBeenCalledOnce();
  });
});
