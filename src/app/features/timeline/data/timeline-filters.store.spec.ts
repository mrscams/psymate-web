import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { convertToParamMap } from '@angular/router';

import { PreferencesStore } from '../../../core/preferences';
import { NO_FILTERS } from './timeline-filters.model';
import { TimelineFiltersStore } from './timeline-filters.store';

/** PreferencesStore simulé : `set` optimiste, comme le vrai (la valeur change tout de suite). */
function prefsMock(initial: 'session' | 'month' | 'chronological' = 'session') {
  const groupBy = signal(initial);
  return {
    timelineGroupBy: groupBy,
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
  it('sans filtre ni ?mode= : mode de la préférence, URL vide, requête sans filtre', () => {
    const { store } = setup(prefsMock('chronological'));
    expect(store.init(convertToParamMap({}), null)).toBe('none');
    expect(store.mode()).toBe('chronological');
    expect(store.active()).toBe(false);
    expect(Object.values(store.params()).every((value) => value === null)).toBe(true);
    expect(store.query()).toEqual({ ...NO_FILTERS, from: null, to: null });
  });

  it('init : l’URL l’emporte sur la mémoire de l’onglet ; ?mode= l’emporte sur la préférence', () => {
    const { store, prefs } = setup();
    const source = store.init(convertToParamMap({ emotion: 'anxiety', mode: 'chronological' }), {
      filters: { ...NO_FILTERS, types: ['note'] },
      modeOverride: null,
    });
    expect(source).toBe('url');
    expect(store.filters()).toEqual({ ...NO_FILTERS, emotions: ['anxiety'] });
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
});
