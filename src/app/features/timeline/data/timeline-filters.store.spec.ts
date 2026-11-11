import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { convertToParamMap } from '@angular/router';

import { PreferencesStore } from '../../../core/preferences';
import { NO_FILTERS, withPeriod } from './timeline-filters.model';
import { TimelineFiltersStore } from './timeline-filters.store';

/** PreferencesStore simulé : `set` optimiste, comme le vrai (la valeur change tout de suite). */
function prefsMock(
  initial: 'session' | 'month' | 'chronological' = 'session',
  window: '30d' | '90d' | '12m' = '90d',
) {
  const groupBy = signal(initial);
  return {
    timelineGroupBy: groupBy,
    overviewWindow: signal(window),
    set: vi.fn(async (_key: string, value: 'session' | 'month' | 'chronological') => {
      groupBy.set(value);
      return null;
    }),
  };
}

function setup(prefs = prefsMock()) {
  TestBed.configureTestingModule({
    providers: [TimelineFiltersStore, { provide: PreferencesStore, useValue: prefs }],
  });
  return { store: TestBed.inject(TimelineFiltersStore), prefs };
}

describe('TimelineFiltersStore', () => {
  it('sans filtre ni ?mode= : mode de la préférence, période par défaut 90 j hors de l’URL', () => {
    const { store } = setup(prefsMock('chronological'));
    const today = new Date(2026, 10, 8, 14);
    expect(store.init(convertToParamMap({}), null, today)).toBe('none');
    expect(store.mode()).toBe('chronological');
    expect(store.filters()).toEqual({ ...NO_FILTERS, from: '2026-08-10' });
    expect(store.atDefaults()).toBe(true);
    expect(store.active()).toBe(true);
    expect(store.narrowed()).toBe(false);
    expect(Object.values(store.params()).every((value) => value === null)).toBe(true);
    expect(store.query()).toEqual({
      ...NO_FILTERS,
      from: new Date(2026, 7, 10).toISOString(),
      to: null,
    });
  });

  it('période par défaut : overview.window (30 j, 12 mois), « Tout » sous groupBy = month', () => {
    const today = new Date(2026, 10, 8, 14);
    let { store } = setup(prefsMock('chronological', '30d'));
    store.init(convertToParamMap({}), null, today);
    expect(store.filters().from).toBe('2026-10-09');
    TestBed.resetTestingModule();
    ({ store } = setup(prefsMock('chronological', '12m')));
    store.init(convertToParamMap({}), null, today);
    expect(store.filters().from).toBe('2025-11-08');
    TestBed.resetTestingModule();
    ({ store } = setup(prefsMock('month')));
    store.init(convertToParamMap({}), null, today);
    expect(store.filters()).toEqual(NO_FILTERS);
    expect(store.active()).toBe(false);
  });

  it('« Tout » : ?period=all dans l’URL ; relu tel quel ; une autre période s’écrit en dates', () => {
    const today = new Date(2026, 10, 8, 14);
    const { store } = setup(prefsMock('chronological'));
    store.init(convertToParamMap({}), null, today);
    store.set(NO_FILTERS);
    expect(store.params()).toMatchObject({ period: 'all', from: null, to: null });
    expect(store.init(convertToParamMap({ period: 'all' }), null, today)).toBe('url');
    expect(store.filters()).toEqual(NO_FILTERS);
    store.set(withPeriod(NO_FILTERS, '30d', today));
    expect(store.params()).toMatchObject({ period: null, from: '2026-10-09' });
  });

  it('widenDefaults : la période par défaut passe à « Tout » pour la visite, sans URL', () => {
    const today = new Date(2026, 10, 8, 14);
    const { store } = setup(prefsMock('chronological'));
    store.init(convertToParamMap({}), null, today);
    expect(store.widenDefaults()).toBe(true);
    expect(store.filters()).toEqual(NO_FILTERS);
    expect(store.atDefaults()).toBe(true);
    expect(Object.values(store.params()).every((value) => value === null)).toBe(true);
    // Plus rien à élargir ; des filtres posés à la main ne sont jamais élargis.
    expect(store.widenDefaults()).toBe(false);
    store.init(convertToParamMap({ emotion: 'anxiety' }), null, today);
    expect(store.widenDefaults()).toBe(false);
    expect(store.filters().emotions).toEqual(['anxiety']);
  });

  it('init : l’URL l’emporte sur la mémoire de l’onglet ; ?mode= l’emporte sur la préférence', () => {
    const { store, prefs } = setup();
    const source = store.init(convertToParamMap({ emotion: 'anxiety', mode: 'chronological' }), {
      filters: { ...NO_FILTERS, types: ['note'] },
      modeOverride: null,
    });
    expect(source).toBe('url');
    // Sans from ni to dans l'URL : la période par défaut (90 j).
    expect(store.filters()).toEqual({
      ...NO_FILTERS,
      emotions: ['anxiety'],
      from: store.defaults().from,
    });
    expect(store.filters().from).not.toBeNull();
    expect(store.mode()).toBe('chronological');
    expect(store.params()).toMatchObject({ emotion: ['anxiety'], mode: 'chronological' });
    // La préférence n'est pas écrite par ?mode=.
    expect(prefs.set).not.toHaveBeenCalled();
  });

  it('init : sans paramètre, la mémoire de l’onglet', () => {
    const { store } = setup();
    expect(
      store.init(convertToParamMap({ focus: 'e-1' }), {
        filters: { ...NO_FILTERS, draftsOnly: true },
        modeOverride: 'chronological',
      }),
    ).toBe('memory');
    expect(store.filters().draftsOnly).toBe(true);
    expect(store.mode()).toBe('chronological');
    expect(store.snapshot()).toEqual({
      filters: { ...NO_FILTERS, draftsOnly: true },
      modeOverride: 'chronological',
      defaults: expect.objectContaining({ from: expect.any(String) }),
    });
  });

  it('set et clear : params et requête suivent', () => {
    const { store } = setup();
    store.init(convertToParamMap({}), null);
    store.set({ ...NO_FILTERS, types: ['feeling'], tags: ['sommeil'] });
    expect(store.active()).toBe(true);
    expect(store.params()).toMatchObject({ types: ['feeling'], tag: ['sommeil'], emotion: null });
    expect(store.query()).toMatchObject({ types: ['feeling'], tags: ['sommeil'] });
    store.clear();
    expect(store.active()).toBe(false);
  });

  it('setMode : écrit timeline.groupBy, le ?mode= de l’URL tombe', async () => {
    const { store, prefs } = setup();
    store.init(convertToParamMap({ mode: 'chronological' }), null);
    expect(store.mode()).toBe('chronological');
    expect(await store.setMode('session')).toBeNull();
    expect(prefs.set).toHaveBeenCalledWith('timeline.groupBy', 'session');
    expect(store.modeOverride()).toBeNull();
    expect(store.mode()).toBe('session');
    expect(store.params()['mode']).toBeNull();
    await store.setMode('chronological');
    expect(prefs.timelineGroupBy()).toBe('chronological');
    expect(store.mode()).toBe('chronological');
  });

  it('setMode en échec : le mode choisi reste sur l’écran, le problème est renvoyé', async () => {
    const prefs = prefsMock('session');
    prefs.set.mockResolvedValueOnce({ status: 500, code: 'INTERNAL_ERROR' } as never);
    const { store } = setup(prefs);
    store.init(convertToParamMap({}), null);
    const problem = await store.setMode('chronological');
    expect(problem).toMatchObject({ code: 'INTERNAL_ERROR' });
    expect(store.mode()).toBe('chronological');
  });

  it('la préférence relue : un changement ailleurs (autre patient, Mon compte) suit', () => {
    const prefs = prefsMock('session');
    const { store } = setup(prefs);
    store.init(convertToParamMap({}), null);
    expect(store.mode()).toBe('session');
    prefs.timelineGroupBy.set('chronological');
    expect(store.mode()).toBe('chronological');
  });

  it('mode de la visite (?focus= hors des séances) : ni dans l’URL, ni dans la mémoire, tombe à la bascule', async () => {
    const { store, prefs } = setup(prefsMock('session'));
    store.init(convertToParamMap({ focus: 'e-1' }), null);
    store.overrideForVisit('chronological');
    expect(store.mode()).toBe('chronological');
    expect(store.params()['mode']).toBeNull();
    expect(store.snapshot().modeOverride).toBeNull();
    await store.setMode('session');
    expect(prefs.set).toHaveBeenCalledWith('timeline.groupBy', 'session');
    expect(store.visitMode()).toBeNull();
    expect(store.mode()).toBe('session');
    // Une nouvelle ouverture repart sans lui.
    store.overrideForVisit('chronological');
    store.init(convertToParamMap({}), null);
    expect(store.mode()).toBe('session');
  });
});
