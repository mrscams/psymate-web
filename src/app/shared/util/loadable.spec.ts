import { appendPage, emptyPage, hasMore } from './cursor';
import { failed, idle, isRefreshing, loaded, loading, stateKind } from './loadable';
import { initials } from './text';

describe('Loadable et stateKind', () => {
  const problem = { status: 503, code: 'INTERNAL_ERROR' };

  it('sans donnée : loading → squelette, error → erreur, loaded vide → vide', () => {
    expect(stateKind(idle<string[]>())).toBe('loading');
    expect(stateKind(loading<string[]>())).toBe('loading');
    expect(stateKind(failed<string[]>(problem))).toBe('error');
    expect(stateKind(loaded<string[]>([]))).toBe('empty');
    expect(stateKind(loaded(emptyPage<string>()))).toBe('empty');
  });

  it('avec donnée : le contenu reste affiché pendant un rechargement ou une erreur', () => {
    const list = loaded(['a']);
    expect(stateKind(list)).toBeNull();
    expect(stateKind(loading(list))).toBeNull();
    expect(isRefreshing(loading(list))).toBe(true);
    expect(isRefreshing(loading())).toBe(false);
    expect(stateKind(failed(problem, list))).toBeNull();
    expect(failed(problem, list).data).toEqual(['a']);
  });

  it('isEmpty personnalisé pour un objet', () => {
    const page = loaded({ total: 0 });
    expect(stateKind(page, (data) => data.total === 0)).toBe('empty');
    expect(stateKind(loaded({ total: 3 }), (data) => data.total === 0)).toBeNull();
  });
});

describe('CursorPage', () => {
  it('concatène et dédoublonne par clé', () => {
    const first = { items: [{ id: '1' }, { id: '2' }], nextCursor: 'c1' };
    const next = { items: [{ id: '2' }, { id: '3' }], nextCursor: null };
    expect(hasMore(first)).toBe(true);
    const merged = appendPage(first, next, (item) => item.id);
    expect(merged.items.map((item) => item.id)).toEqual(['1', '2', '3']);
    expect(hasMore(merged)).toBe(false);
    expect(appendPage(first, next).items).toHaveLength(4);
  });
});

describe('initials', () => {
  it.each([
    ['Claire Moreau', 'CM'],
    ['Marie D.', 'MD'],
    ['Jean-Luc', 'JL'],
    ['élodie', 'É'],
    ['', ''],
  ])('%s → %s', (name, expected) => {
    expect(initials(name)).toBe(expected);
  });
});
