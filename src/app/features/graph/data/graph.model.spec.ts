import { TIMELINE_FOCUS_PARAM } from '../../timeline';
import { expansion, graphView, node, superNode } from './graph.fixtures';
import {
  DEFAULT_QUERY,
  hasGraphParams,
  isEmptyGraph,
  layoutKey,
  mergeExpansion,
  needsDefaultRoot,
  parseQuery,
  ROOT_ALL,
  periodFrom,
  sameQuery,
  sameServerQuery,
  TIMELINE_FOCUS,
  toQueryParams,
  visibleView,
} from './graph.model';

const params = (search: string) => new URLSearchParams(search);

describe('graph.model', () => {
  it('parseQuery : racine, profondeur 1–3 (défaut 2), filtres connus seulement', () => {
    expect(parseQuery(params(''))).toEqual(DEFAULT_QUERY);
    expect(
      parseQuery(
        params('root=e-1&depth=3&linkTypes=triggers,bogus,triggers&types=feeling,x&period=90d'),
      ),
    ).toEqual({
      root: 'e-1',
      depth: 3,
      linkTypes: ['triggers'],
      types: ['feeling'],
      period: '90d',
    });
    expect(parseQuery(params('depth=7&period=2y')).depth).toBe(2);
    expect(parseQuery(params('depth=7&period=2y')).period).toBe('all');
  });

  it('racine : ?root=all = tout le dossier ; sans root, la racine par défaut est à choisir', () => {
    expect(parseQuery(params(`root=${ROOT_ALL}`)).root).toBeNull();
    expect(needsDefaultRoot(params(''))).toBe(true);
    expect(needsDefaultRoot(params('period=90d&root='))).toBe(true);
    expect(needsDefaultRoot(params(`root=${ROOT_ALL}`))).toBe(false);
    expect(needsDefaultRoot(params('root=e-1'))).toBe(false);
  });

  it('toQueryParams : valeurs par défaut retirées (null), racine toujours écrite, aller-retour', () => {
    expect(toQueryParams(DEFAULT_QUERY)).toEqual({
      root: ROOT_ALL,
      depth: null,
      linkTypes: null,
      types: null,
      period: null,
    });
    const query = {
      root: 'e-1',
      depth: 1 as const,
      linkTypes: ['worsens' as const, 'treats' as const],
      types: ['feeling' as const],
      period: '12m' as const,
    };
    const url = new URLSearchParams(
      Object.entries(toQueryParams(query)).filter((entry): entry is [string, string] => !!entry[1]),
    );
    expect(parseQuery(url)).toEqual(query);
  });

  it('hasGraphParams, sameQuery (ordre des listes indifférent), sameServerQuery (types locaux)', () => {
    expect(hasGraphParams(params('entry=e-1'))).toBe(false);
    expect(hasGraphParams(params('root=e-1'))).toBe(true);
    const a = { ...DEFAULT_QUERY, linkTypes: ['triggers' as const, 'treats' as const] };
    const b = { ...DEFAULT_QUERY, linkTypes: ['treats' as const, 'triggers' as const] };
    expect(sameQuery(a, b)).toBe(true);
    expect(sameQuery(a, { ...b, types: ['note'] })).toBe(false);
    expect(sameServerQuery(a, { ...b, types: ['note'] })).toBe(true);
    expect(sameServerQuery(a, { ...b, depth: 3 })).toBe(false);
  });

  it('periodFrom : borne basse UTC, rien pour toute la période', () => {
    const now = new Date('2026-11-08T10:30:45Z');
    expect(periodFrom('all', now)).toBeNull();
    expect(periodFrom('30d', now)).toBe('2026-10-09T10:30:00.000Z');
    expect(periodFrom('12m', now)).toBe('2025-11-08T10:30:00.000Z');
  });

  it('layoutKey : une clé par racine', () => {
    expect(layoutKey({ root: null })).toBe('*');
    expect(layoutKey({ root: 'e-1' })).toBe('e-1');
  });

  it('visibleView : filtre des types, la racine reste, arêtes et groupes suivent', () => {
    const view = graphView({ superNodes: [superNode()] });
    expect(visibleView(view, [], 'e-situation')).toBe(view);
    const feelings = visibleView(view, ['feeling'], 'e-situation');
    expect(feelings.nodes.map((n) => n.id)).toEqual(['e-situation', 'e-feeling']);
    expect(feelings.edges.map((e) => e.id)).toEqual(['l-1']);
    expect(feelings.superNodes).toHaveLength(1);
    const events = visibleView(view, ['event'], null);
    expect(events.nodes.map((n) => n.id)).toEqual(['e-event']);
    expect(events.edges).toEqual([]);
    expect(events.superNodes).toEqual([]);
  });

  it('mergeExpansion : les membres remplacent le groupe, sans doublon', () => {
    const view = graphView({ superNodes: [superNode()], truncated: true });
    const merged = mergeExpansion(view, 'sn:e-situation:feeling', expansion());
    expect(merged.superNodes).toEqual([]);
    expect(merged.nodes.map((n) => n.id)).toEqual([
      'e-situation',
      'e-feeling',
      'e-event',
      'e-med',
      'e-f1',
      'e-f2',
      'e-f3',
    ]);
    expect(merged.edges).toHaveLength(6);
    expect(merged.truncated).toBe(true);
    // Une seconde fusion n'ajoute rien.
    expect(mergeExpansion(merged, 'sn:e-situation:feeling', expansion())).toEqual(merged);
    // Arête dont une extrémité n'est pas rendue : ignorée.
    const orphan = { ...expansion(), edges: [{ ...expansion().edges[0], source: 'e-absent' }] };
    expect(mergeExpansion(view, 'x', orphan).edges).toHaveLength(3);
  });

  it('isEmptyGraph : une racine seule, sans lien ni groupe, est vide', () => {
    expect(isEmptyGraph({ nodes: [node()], edges: [], superNodes: [], truncated: false })).toBe(
      true,
    );
    expect(isEmptyGraph(graphView())).toBe(false);
    expect(isEmptyGraph(graphView({ edges: [], superNodes: [superNode()] }))).toBe(false);
  });

  it('TIMELINE_FOCUS vaut le paramètre ?focus= de features/timeline', () => {
    expect(TIMELINE_FOCUS).toBe(TIMELINE_FOCUS_PARAM);
  });
});
