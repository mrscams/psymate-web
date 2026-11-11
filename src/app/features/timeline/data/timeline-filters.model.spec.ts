import { convertToParamMap } from '@angular/router';

import {
  defaultFilters,
  defaultPreset,
  filterParams,
  filterQuery,
  hasFilterParams,
  hasFilters,
  hasNarrowing,
  modeOfGroupBy,
  NO_FILTERS,
  parseFilters,
  parseMode,
  presetOf,
  presetStart,
  sameParam,
  toggleEmotion,
  toggleType,
  validDay,
  withPeriod,
} from './timeline-filters.model';

const url = (params: Record<string, string | string[]>) => convertToParamMap(params);

describe('timeline-filters.model', () => {
  it('modeOfGroupBy : session par défaut, month affiché en chronologique (agrégat forcé)', () => {
    expect(modeOfGroupBy('session')).toBe('session');
    expect(modeOfGroupBy('chronological')).toBe('chronological');
    expect(modeOfGroupBy('month')).toBe('chronological');
    expect(modeOfGroupBy(null)).toBe('session');
  });

  it('parseFilters : listes répétées ou séparées par des virgules, valeurs illisibles ignorées', () => {
    const filters = parseFilters(
      url({
        types: ['feeling,note', 'inconnu', 'note'],
        emotion: 'anxiety,joy',
        tag: ['sommeil', 'travail, famille'],
        drafts: '1',
        from: '2026-02-30',
        to: '2026-10-31',
      }),
    );
    expect(filters).toEqual({
      types: ['feeling', 'note'],
      emotions: ['anxiety', 'joy'],
      // Un tag peut contenir une virgule : jamais découpé.
      tags: ['sommeil', 'travail, famille'],
      draftsOnly: true,
      from: null,
      to: '2026-10-31',
    });
    expect(parseFilters(url({ from: '2026-10-01', to: '2026-09-01' }))).toMatchObject({
      from: '2026-10-01',
      to: null,
    });
  });

  it('parseMode et hasFilterParams', () => {
    expect(parseMode(url({ mode: 'session' }))).toBe('session');
    expect(parseMode(url({ mode: 'month' }))).toBeNull();
    expect(hasFilterParams(url({ focus: 'e-1' }))).toBe(false);
    expect(hasFilterParams(url({ mode: 'chronological' }))).toBe(true);
    expect(hasFilterParams(url({ emotion: 'anxiety' }))).toBe(true);
  });

  it('filterParams : une valeur par défaut retire le paramètre ; aller-retour par l’URL', () => {
    expect(Object.values(filterParams(NO_FILTERS, null)).every((v) => v === null)).toBe(true);
    const filters = {
      ...NO_FILTERS,
      types: ['feeling' as const],
      emotions: ['anxiety'],
      draftsOnly: true,
      from: '2026-08-10',
    };
    const params = filterParams(filters, 'session');
    expect(params).toEqual({
      types: ['feeling'],
      emotion: ['anxiety'],
      tag: null,
      drafts: '1',
      from: '2026-08-10',
      to: null,
      mode: 'session',
      period: null,
    });
    const back = Object.fromEntries(
      Object.entries(params).filter((entry): entry is [string, string | string[]] => !!entry[1]),
    );
    expect(parseFilters(url(back))).toEqual(filters);
  });

  it('période par défaut (UX-B2) : seule l’URL nue la porte ; « Tout » seul = ?period=all', () => {
    const today = new Date(2026, 10, 8, 14);
    const defaults = defaultFilters('90d', today);
    expect(defaults).toEqual({ ...NO_FILTERS, from: '2026-08-10' });
    expect(filterParams(defaults, null, defaults)).toMatchObject({ from: null, period: null });
    expect(filterParams(NO_FILTERS, null, defaults)).toMatchObject({ from: null, period: 'all' });
    expect(filterParams(NO_FILTERS, null, NO_FILTERS)['period']).toBeNull();
    // Avec un autre filtre, la période par défaut s'écrit en dates (l'URL relue la retrouve)…
    const anxious = { ...defaults, emotions: ['anxiety'] };
    expect(filterParams(anxious, null, defaults)).toMatchObject({
      emotion: ['anxiety'],
      from: '2026-08-10',
      period: null,
    });
    // … et « Tout » n'a pas besoin de ?period=all.
    expect(filterParams({ ...NO_FILTERS, draftsOnly: true }, null, defaults)).toMatchObject({
      drafts: '1',
      from: null,
      period: null,
    });
    expect(parseFilters(url({ period: 'all', from: '2026-01-01' }))).toMatchObject({
      from: null,
      to: null,
    });
    expect(parseFilters(url({ from: '2026-01-01' })).from).toBe('2026-01-01');
    expect(hasFilterParams(url({ period: 'all' }))).toBe(true);
  });

  it('parseFilters : un lien profond avec filtre sans période (?drafts=1, ?mode=session, ?types=) garde « Tout »', () => {
    for (const params of <Record<string, string>[]>[
      { drafts: '1' },
      { mode: 'session' },
      { types: 'note' },
      { emotion: 'anxiety' },
      { tag: 'sommeil' },
    ]) {
      expect(parseFilters(url(params))).toMatchObject({ from: null, to: null });
    }
    expect(parseFilters(url({ drafts: '1' })).draftsOnly).toBe(true);
  });

  it('defaultPreset : overview.window, 90 j à défaut, « Tout » sous groupBy = month', () => {
    expect(defaultPreset('90d', 'chronological')).toBe('90d');
    expect(defaultPreset('30d', 'session')).toBe('30d');
    expect(defaultPreset('12m', 'session')).toBe('1y');
    expect(defaultPreset(null, null)).toBe('90d');
    expect(defaultPreset('30d', 'month')).toBe('all');
  });

  it('hasNarrowing : un filtre autre que la période', () => {
    expect(hasNarrowing({ ...NO_FILTERS, from: '2026-01-01' })).toBe(false);
    expect(hasNarrowing({ ...NO_FILTERS, draftsOnly: true })).toBe(true);
    expect(hasNarrowing({ ...NO_FILTERS, tags: ['sommeil'] })).toBe(true);
  });

  it('sameParam : valeur seule ou liste, absent = null', () => {
    expect(sameParam('a', ['a'])).toBe(true);
    expect(sameParam(null, [])).toBe(true);
    expect(sameParam(['a', 'b'], ['b', 'a'])).toBe(false);
  });

  it('filterQuery : la période devient [minuit du premier jour, minuit du lendemain du dernier[', () => {
    const query = filterQuery({ ...NO_FILTERS, from: '2026-10-01', to: '2026-10-31' });
    expect(query.from).toBe(new Date(2026, 9, 1).toISOString());
    expect(query.to).toBe(new Date(2026, 10, 1).toISOString());
    expect(filterQuery(NO_FILTERS)).toEqual({ ...NO_FILTERS, from: null, to: null });
  });

  it('bascules de puces et filtres actifs', () => {
    const one = toggleType(NO_FILTERS, 'note');
    expect(one.types).toEqual(['note']);
    expect(toggleType(one, 'note').types).toEqual([]);
    expect(hasFilters(toggleEmotion(NO_FILTERS, 'anxiety'))).toBe(true);
    expect(hasFilters(NO_FILTERS)).toBe(false);
  });

  it('périodes : 30 j / 90 j / 1 an / Tout, période libre reconnue', () => {
    const today = new Date(2026, 10, 8, 14);
    expect(presetStart('30d', today)).toBe('2026-10-09');
    expect(presetStart('90d', today)).toBe('2026-08-10');
    expect(presetStart('1y', today)).toBe('2025-11-08');
    expect(presetStart('all', today)).toBeNull();
    const ninety = withPeriod(NO_FILTERS, '90d', today);
    expect(presetOf(ninety, today)).toBe('90d');
    expect(presetOf(NO_FILTERS, today)).toBe('all');
    expect(presetOf({ ...NO_FILTERS, from: '2026-01-01' }, today)).toBeNull();
    expect(presetOf({ ...ninety, to: '2026-10-01' }, today)).toBeNull();
  });

  it('validDay : seulement des jours qui existent', () => {
    expect(validDay('2026-02-28')).toBe('2026-02-28');
    expect(validDay('2026-02-29')).toBeNull();
    expect(validDay('28/02/2026')).toBeNull();
    expect(validDay(null)).toBeNull();
  });
});
