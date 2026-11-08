// Modèles de vue de la vue graphe (fiche 04, handbook §2, couche 4 → 3) : préparés depuis les DTO
// par data/graph.api.ts (GET /api/patients/{id}/graph, POST …/graph/expand). Fonctions pures :
// lecture et écriture de la requête dans l'URL, filtre client des types d'entrées, fusion d'un
// super-nœud déplié.

import { ENTRY_TYPES, EntryType } from '../../../shared/ui';
import { LinkTypeCode } from './link.model';

/** Profondeur du voisinage autour de la racine (1 à 3, défaut 2 ; 422 OUT_OF_RANGE sinon). */
export type GraphDepth = 1 | 2 | 3;
export const GRAPH_DEPTHS: readonly GraphDepth[] = [1, 2, 3];
export const DEFAULT_DEPTH: GraphDepth = 2;

/** Période du filtre (borne basse sur la date de début des nœuds) ; `all` : pas de borne. */
export type GraphPeriod = 'all' | '30d' | '90d' | '12m';
export const GRAPH_PERIODS: readonly GraphPeriod[] = ['all', '30d', '90d', '12m'];

export const LINK_TYPE_CODES: readonly LinkTypeCode[] = [
  'triggers',
  'caused_by',
  'worsens',
  'relieves',
  'co_occurs',
  'follows',
  'part_of',
  'treats',
];

/** Paramètres d'URL du graphe (fiche 04 : /patients/:id/graph?root=<entryId>&depth=2). */
export const GRAPH_PARAMS = {
  root: 'root',
  depth: 'depth',
  linkTypes: 'linkTypes',
  types: 'types',
  period: 'period',
} as const;

/** Ce que l'URL porte : la racine, la profondeur et les filtres. */
export interface GraphQuery {
  /** Entrée racine ; null : les entrées les plus liées du dossier. */
  root: string | null;
  depth: GraphDepth;
  /** Types de liens suivis (paramètre linkTypes du contrat) ; vide : tous. */
  linkTypes: LinkTypeCode[];
  /**
   * Types d'entrées montrés ; vide : tous. Le contrat n'a pas de paramètre `types` pour le graphe :
   * le filtre s'applique au graphe reçu (150 nœuds au plus), sans nouvelle requête.
   */
  types: EntryType[];
  period: GraphPeriod;
}

export const DEFAULT_QUERY: GraphQuery = {
  root: null,
  depth: DEFAULT_DEPTH,
  linkTypes: [],
  types: [],
  period: 'all',
};

/** Une entrée non archivée du dossier, nœud du graphe. */
export interface GraphNode {
  id: string;
  type: EntryType;
  title: string | null;
  /** Début de l'occurrence (occurred.from), ISO 8601 UTC ; null sans date. */
  occurred: string | null;
  /** 0 à 10 pour un ressenti, null sinon. */
  intensity: number | null;
  emotion: string | null;
  /** Liens acceptés de l'entrée dans tout le dossier. */
  degree: number;
  /** Sauts depuis la racine (0 : la racine). */
  distance: number;
  /**
   * Auteur de l'entrée (GraphNodeDto.authorType) : practitioner en V1. Lecture seule, place réservée
   * pour le compagnon patient (A11) : jamais dessiné.
   */
  readonly authorType: string;
}

/** Un lien accepté entre deux nœuds rendus. */
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  linkType: LinkTypeCode;
  directed: boolean;
  /** manual en V1 (ai_suggested, ai_confirmed : V2). */
  provenance: string;
  /** accepted dans un graphe en V1 ; proposed (V2) se dessine en pointillé. */
  status: string;
}

/** Nœuds de degré 1 d'un même type reliés au même voisin, regroupés au-delà de 150 nœuds. */
export interface GraphSuperNode {
  /** sn:{neighborId}:{type}, à renvoyer tel quel à POST …/graph/expand. */
  id: string;
  type: EntryType;
  count: number;
  dominantEmotion: string | null;
  memberIds: string[];
  neighborId: string;
}

export interface GraphView {
  nodes: GraphNode[];
  edges: GraphEdge[];
  superNodes: GraphSuperNode[];
  /** Des nœuds ont été regroupés ou retirés pour tenir en 150 (500 pour un dépliage). */
  truncated: boolean;
}

export interface Point {
  x: number;
  y: number;
}

/** Zoom et position du canevas, rangés dans le shell (B2 : « Onglet Graphe (zoom conservé) »). */
export interface GraphViewport {
  zoom: number;
  pan: Point;
}

/** Glisser un nœud sur un autre : source et cible du lien à poser. */
export interface LinkDrop {
  sourceId: string;
  targetId: string;
}

/** Positions des nœuds par identifiant, pour une racine (layout stable, fiche 04). */
export type GraphPositions = Record<string, Point>;

/** Positions remontées par le canevas, avec la racine (layoutKey) du layout qui les a produites. */
export interface GraphPositionsChange {
  key: string;
  positions: GraphPositions;
}

/** Zoom et position remontés par le canevas, avec la racine du graphe dessiné. */
export interface GraphViewportChange {
  key: string;
  viewport: GraphViewport;
}

/** Lecture d'un paramètre d'URL (ParamMap d'Angular, URLSearchParams). */
export interface ParamReader {
  get(name: string): string | null;
}

function list(value: string | null): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

/** La requête du graphe depuis l'URL ; une valeur inconnue est ignorée (défaut). */
export function parseQuery(params: ParamReader): GraphQuery {
  const root = params.get(GRAPH_PARAMS.root)?.trim() || null;
  const depth = Number(params.get(GRAPH_PARAMS.depth));
  const period = params.get(GRAPH_PARAMS.period) as GraphPeriod | null;
  return {
    root,
    depth: GRAPH_DEPTHS.includes(depth as GraphDepth) ? (depth as GraphDepth) : DEFAULT_DEPTH,
    linkTypes: unique(
      list(params.get(GRAPH_PARAMS.linkTypes)).filter((code): code is LinkTypeCode =>
        LINK_TYPE_CODES.includes(code as LinkTypeCode),
      ),
    ),
    types: unique(
      list(params.get(GRAPH_PARAMS.types)).filter((type): type is EntryType =>
        ENTRY_TYPES.includes(type as EntryType),
      ),
    ),
    period: period && GRAPH_PERIODS.includes(period) ? period : 'all',
  };
}

/**
 * Les paramètres d'URL d'une requête, à fusionner (queryParamsHandling: 'merge') : null retire un
 * paramètre à sa valeur par défaut, pour une URL courte (?root=…&depth=… seulement si utiles).
 */
export function toQueryParams(query: GraphQuery): Record<string, string | null> {
  return {
    [GRAPH_PARAMS.root]: query.root,
    [GRAPH_PARAMS.depth]: query.root && query.depth !== DEFAULT_DEPTH ? String(query.depth) : null,
    [GRAPH_PARAMS.linkTypes]: query.linkTypes.length ? query.linkTypes.join(',') : null,
    [GRAPH_PARAMS.types]: query.types.length ? query.types.join(',') : null,
    [GRAPH_PARAMS.period]: query.period !== 'all' ? query.period : null,
  };
}

/** L'URL porte-t-elle au moins un paramètre du graphe ? (sinon : reprise de l'état rangé) */
export function hasGraphParams(params: ParamReader): boolean {
  return Object.values(GRAPH_PARAMS).some((name) => params.get(name) !== null);
}

export function sameQuery(a: GraphQuery, b: GraphQuery): boolean {
  const sameList = (x: readonly string[], y: readonly string[]) => {
    if (x.length !== y.length) return false;
    const sorted = [...y].sort();
    return [...x].sort().every((value, i) => value === sorted[i]);
  };
  return (
    a.root === b.root &&
    a.depth === b.depth &&
    a.period === b.period &&
    sameList(a.linkTypes, b.linkTypes) &&
    sameList(a.types, b.types)
  );
}

/** Ce qui change la requête au serveur (le filtre des types d'entrées reste local). */
export function sameServerQuery(a: GraphQuery, b: GraphQuery): boolean {
  return sameQuery({ ...a, types: [] }, { ...b, types: [] });
}

const DAY_MS = 86_400_000;

/** Borne basse (from, ISO 8601 UTC) d'une période, à la minute près ; null pour `all`. */
export function periodFrom(period: GraphPeriod, now: Date): string | null {
  const days = { all: 0, '30d': 30, '90d': 90, '12m': 365 }[period];
  if (!days) return null;
  const from = new Date(now.getTime() - days * DAY_MS);
  from.setUTCSeconds(0, 0);
  return from.toISOString();
}

/** Clé des positions et du zoom mémorisés : une par racine (« positions mémorisées par root »). */
export function layoutKey(query: Pick<GraphQuery, 'root'>): string {
  return query.root ?? '*';
}

/**
 * Le graphe montré pour un filtre de types d'entrées (vide : tout) : nœuds des types retenus (la
 * racine reste toujours), arêtes entre nœuds montrés, super-nœuds des types retenus dont le voisin
 * est montré.
 */
export function visibleView(
  view: GraphView,
  types: readonly EntryType[],
  root: string | null,
): GraphView {
  if (!types.length) return view;
  const nodes = view.nodes.filter((node) => node.id === root || types.includes(node.type));
  const ids = new Set(nodes.map((node) => node.id));
  return {
    nodes,
    edges: view.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)),
    superNodes: view.superNodes.filter(
      (group) => types.includes(group.type) && ids.has(group.neighborId),
    ),
    truncated: view.truncated,
  };
}

/**
 * Remplace un super-nœud par ses membres (réponse de POST …/graph/expand) : les membres s'ajoutent
 * (sans doublon), les arêtes incidentes aussi quand leurs deux extrémités sont rendues ; le groupe
 * disparaît. Les nœuds déjà présents gardent leur distance.
 */
export function mergeExpansion(
  view: GraphView,
  superNodeId: string,
  expansion: GraphView,
): GraphView {
  const known = new Set(view.nodes.map((node) => node.id));
  const nodes = [...view.nodes, ...expansion.nodes.filter((node) => !known.has(node.id))];
  const ids = new Set(nodes.map((node) => node.id));
  const edgeIds = new Set(view.edges.map((edge) => edge.id));
  const edges = [
    ...view.edges,
    ...expansion.edges.filter(
      (edge) => !edgeIds.has(edge.id) && ids.has(edge.source) && ids.has(edge.target),
    ),
  ];
  return {
    nodes,
    edges,
    superNodes: view.superNodes.filter((group) => group.id !== superNodeId),
    truncated: view.truncated || expansion.truncated,
  };
}

/** Le graphe est-il vide (aucun lien, aucun groupe) ? Une racine seule ne montre rien de relié. */
export function isEmptyGraph(view: GraphView): boolean {
  return view.edges.length === 0 && view.superNodes.length === 0;
}

/** Identifiant d'un super-nœud (sn:…), par opposition à celui d'une entrée (uuid). */
export function isSuperNodeId(id: string): boolean {
  return id.startsWith('sn:');
}

/**
 * Paramètre de la timeline qui la positionne sur une entrée (double-clic sur un nœud, « Voir dans
 * la timeline »). Même valeur que TIMELINE_FOCUS_PARAM de features/timeline : redéclarée ici parce
 * qu'importer l'index de la timeline tirerait sa page dans le morceau du graphe (vérifié par
 * graph.model.spec.ts).
 */
export const TIMELINE_FOCUS = 'focus';
