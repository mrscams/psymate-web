// Disposition du graphe (fiche 04) : le seul fichier qui parle à elkjs. Lecture de gauche à droite,
// en couches : ce qui déclenche ou précède, puis ce qui en découle, puis ce qui y répond. Fonctions
// pures, sauf le chargement du moteur ; la géométrie des tracés est dans graph-paths.ts, la mise en
// forme pour le gabarit dans graph-scene.ts.
import { InjectionToken } from '@angular/core';
import type { ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk-api';

import { EntryType } from '../../../shared/ui';
import {
  GraphDirection,
  GraphEdge,
  GraphNode,
  GraphReading,
  GraphSuperNode,
  GraphView,
  Point,
} from '../data/graph.model';
import { LinkTypeCode } from '../data/link.model';

/** Ce que le canevas attend du moteur de disposition (elkjs en vrai, le même en test). */
export interface LayoutEngine {
  layout(graph: ElkNode): Promise<ElkNode>;
}

/** Import dynamique d'elkjs : il vit dans son propre morceau, chargé quand le canevas s'affiche. */
export async function loadElk(): Promise<LayoutEngine> {
  const module = await import('elkjs/lib/elk.bundled.js');
  return new module.default();
}

export const GRAPH_LAYOUT_ENGINE = new InjectionToken<() => Promise<LayoutEngine>>(
  'GRAPH_LAYOUT_ENGINE',
  { providedIn: 'root', factory: () => loadElk },
);

/**
 * Sens de lecture d'un type de lien. 1 : la source se lit avant la cible (déclenche, aggrave, fait
 * partie de). -1 : la cible se lit avant la source (causé par, suit : la cause, l'antécédent
 * d'abord ; traite, soulage : ce qui répond vient après ce à quoi il répond). 0 : sans sens
 * (co-occurrence), le lien ne pèse pas sur la disposition. La flèche, elle, garde le sens du lien.
 */
export const LINK_FLOW: Record<LinkTypeCode, 1 | -1 | 0> = {
  triggers: 1,
  worsens: 1,
  part_of: 1,
  caused_by: -1,
  follows: -1,
  treats: -1,
  relieves: -1,
  co_occurs: 0,
};

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Un lien dans le sens de lecture : `from` se lit avant `to`. */
export interface FlowEdge {
  id: string;
  from: string;
  to: string;
}

/**
 * Des entrées reliées à une seule autre (le pivot) par le même type de lien, du même côté : au lieu
 * d'une colonne de N cartes et de N traits, elles sont rangées en grille dans un bloc relié au pivot
 * par un seul trait.
 */
export interface LeafBlock {
  id: string;
  hub: string;
  linkType: LinkTypeCode;
  /** true : les entrées du bloc se lisent après le pivot. */
  downstream: boolean;
  members: string[];
  edgeIds: string[];
}

export interface PlacedBlock extends LeafBlock {
  box: Box;
  /** Tracé du trait entre le pivot et le bloc, dans le sens de lecture. */
  route: Point[];
}

export interface GraphLayout {
  width: number;
  height: number;
  /** Boîte de chaque carte (entrée ou super-nœud), par identifiant. */
  boxes: Record<string, Box>;
  /**
   * Tracé de chaque lien dessiné seul, dans le sens de lecture, par identifiant de lien : les liens
   * orientés, et les co-occurrences qui tiennent une entrée dans la disposition (anchorEdges).
   */
  routes: Record<string, Point[]>;
  blocks: PlacedBlock[];
  reading: GraphReading;
  /** true : lecture de gauche à droite ; false : de haut en bas. */
  horizontal: boolean;
  /** Colonnes (rangées, de haut en bas) des lectures par type et par mois ; vide en chaîne causale. */
  bands: LayoutBand[];
}

/** Une colonne de la lecture par type ou par mois : sa clé et son étendue dans le sens de lecture. */
export interface LayoutBand {
  /** Colonne de type (TypeColumn), ou mois « 2026-10 », ou NO_DATE. */
  key: string;
  from: number;
  to: number;
}

export interface LayoutOptions {
  reading: GraphReading;
  direction: GraphDirection;
}

export const DEFAULT_LAYOUT: LayoutOptions = { reading: 'causal', direction: 'right' };

/** Colonnes de la lecture par type, dans l'ordre : toujours le même, quel que soit le dossier. */
export type TypeColumn = 'events' | 'situations' | 'feelings' | 'responses';
export const TYPE_COLUMNS: readonly TypeColumn[] = [
  'events',
  'situations',
  'feelings',
  'responses',
];
const COLUMN_OF: Record<EntryType, TypeColumn> = {
  event: 'events',
  situation: 'situations',
  feeling: 'feelings',
  note: 'feelings',
  medication: 'responses',
  session: 'responses',
};

/** Colonne des entrées sans date, en lecture chronologique : la dernière. */
export const NO_DATE = 'none';

/** Mois d'une entrée, « 2026-10 », en heure locale comme sa date affichée ; NO_DATE sans date. */
export function monthKey(occurred: string | null): string {
  const date = occurred ? new Date(occurred) : null;
  if (!date || Number.isNaN(date.getTime())) return NO_DATE;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export const CARD_SIZE = { width: 212, height: 58 };
export const ROOT_SIZE = { width: 236, height: 64 };
export const GROUP_SIZE = { width: 228, height: 54 };

/** À partir de ce nombre, des entrées sœurs sont rangées en bloc. */
export const LEAF_BLOCK_MIN = 6;
const BLOCK_GAP = 12;
const BLOCK_PADDING = 14;

const LAYOUT_OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.layered.spacing.nodeNodeBetweenLayers': '78',
  'elk.spacing.nodeNode': '22',
  'elk.spacing.edgeNode': '20',
  'elk.spacing.edgeEdge': '12',
  'elk.layered.spacing.edgeNodeBetweenLayers': '24',
  'elk.layered.spacing.edgeEdgeBetweenLayers': '12',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  // L'ordre du modèle est respecté : la carte bouge peu quand un lien s'ajoute (fiche 04).
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  // Les parties du graphe sans lien entre elles sont rangées en largeur, comme la zone du graphe.
  'elk.aspectRatio': '2',
};

/** Arête qui rattache un super-nœud à son voisin (pas un lien du dossier). */
export function groupEdgeId(group: Pick<GraphSuperNode, 'id'>): string {
  return `${group.id}:edge`;
}

/** Les super-nœuds dessinés : ceux dont le voisin est dans le graphe. */
export function shownGroups(view: GraphView): GraphSuperNode[] {
  const ids = new Set(view.nodes.map((node) => node.id));
  return view.superNodes.filter((group) => ids.has(group.neighborId));
}

/** Sens de lecture d'un lien du graphe : LINK_FLOW de son type, 0 s'il n'est pas orienté. */
export function flowOf(edge: Pick<GraphEdge, 'directed' | 'linkType'>): 1 | -1 | 0 {
  return edge.directed ? (LINK_FLOW[edge.linkType] ?? 1) : 0;
}

/** Les liens orientés (et le rattachement des super-nœuds), dans le sens de lecture. */
export function flowEdges(view: GraphView): FlowEdge[] {
  const ids = new Set(view.nodes.map((node) => node.id));
  const edges: FlowEdge[] = [];
  for (const edge of view.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target) || edge.source === edge.target) continue;
    const flow = flowOf(edge);
    if (flow > 0) edges.push({ id: edge.id, from: edge.source, to: edge.target });
    if (flow < 0) edges.push({ id: edge.id, from: edge.target, to: edge.source });
  }
  for (const group of shownGroups(view)) {
    edges.push({ id: groupEdgeId(group), from: group.neighborId, to: group.id });
  }
  return edges;
}

/**
 * Les co-occurrences qui tiennent une entrée dans la disposition. Une entrée sans aucun lien orienté
 * serait posée à l'écart, reliée par une longue courbe à travers le graphe : sa co-occurrence la
 * place à côté de l'entrée qu'elle accompagne (celle que ses liens orientés ont déjà placée d'abord).
 */
export function anchorEdges(view: GraphView, flows: FlowEdge[]): FlowEdge[] {
  const ids = new Set(view.nodes.map((node) => node.id));
  const placed = new Set(flows.flatMap((edge) => [edge.from, edge.to]));
  const edges: FlowEdge[] = [];
  for (const edge of view.edges) {
    if (flowOf(edge) || edge.source === edge.target) continue;
    if (!ids.has(edge.source) || !ids.has(edge.target)) continue;
    if (placed.has(edge.source) && placed.has(edge.target)) continue;
    const targetFirst = placed.has(edge.target) && !placed.has(edge.source);
    edges.push({
      id: edge.id,
      from: targetFirst ? edge.target : edge.source,
      to: targetFirst ? edge.source : edge.target,
    });
  }
  return edges;
}

/**
 * La colonne de chaque carte selon la lecture : null en chaîne causale (les liens seuls placent).
 * Par type : la nature de l'entrée. Par mois : son mois ; un super-nœud, qui n'a pas de date, reste
 * dans la colonne de son voisin.
 */
export function bandKeys(view: GraphView, reading: GraphReading): Map<string, string> | null {
  if (reading === 'causal') return null;
  const keys = new Map<string, string>();
  for (const node of view.nodes) {
    keys.set(node.id, reading === 'type' ? COLUMN_OF[node.type] : monthKey(node.occurred));
  }
  for (const group of shownGroups(view)) {
    keys.set(group.id, reading === 'type' ? COLUMN_OF[group.type] : keys.get(group.neighborId)!);
  }
  return keys;
}

/** Les colonnes dans l'ordre de lecture : celui des types, ou celui du temps (sans date à la fin). */
function bandOrder(keys: Map<string, string>, reading: GraphReading): string[] {
  const used = new Set(keys.values());
  if (reading === 'type') return TYPE_COLUMNS.filter((column) => used.has(column));
  return [...used].sort((a, b) => (a === NO_DATE ? 1 : b === NO_DATE ? -1 : a.localeCompare(b)));
}

function byDate(a: GraphNode, b: GraphNode): number {
  return (a.occurred ?? '').localeCompare(b.occurred ?? '') || a.id.localeCompare(b.id);
}

/**
 * Les blocs d'entrées sœurs : des entrées (hors racine) qui n'ont qu'un lien, orienté, vers le même
 * pivot, du même type et du même côté, à partir de LEAF_BLOCK_MIN. Rangées par date. Avec des
 * colonnes (`bandOf`), un bloc ne réunit que des entrées de la même colonne.
 */
export function leafBlocks(
  view: GraphView,
  root: string | null,
  bandOf: Map<string, string> | null = null,
): LeafBlock[] {
  const nodes = new Map(view.nodes.map((node) => [node.id, node]));
  const degree = new Map<string, number>();
  const count = (id: string) => degree.set(id, (degree.get(id) ?? 0) + 1);
  for (const edge of view.edges) {
    if (!nodes.has(edge.source) || !nodes.has(edge.target)) continue;
    count(edge.source);
    count(edge.target);
  }
  for (const group of shownGroups(view)) count(group.neighborId);

  const blocks = new Map<string, LeafBlock>();
  for (const edge of view.edges) {
    const flow = flowOf(edge);
    if (!flow || !nodes.has(edge.source) || !nodes.has(edge.target)) continue;
    const from = flow > 0 ? edge.source : edge.target;
    const to = flow > 0 ? edge.target : edge.source;
    const fromIsLeaf = degree.get(from) === 1 && from !== root;
    const toIsLeaf = degree.get(to) === 1 && to !== root;
    // Deux entrées reliées seulement l'une à l'autre : aucune n'est le pivot de l'autre.
    if (fromIsLeaf === toIsLeaf) continue;
    const leaf = toIsLeaf ? to : from;
    const hub = toIsLeaf ? from : to;
    const band = bandOf?.get(leaf) ?? '';
    const id = `block:${hub}:${edge.linkType}:${toIsLeaf ? 'after' : 'before'}:${band}`;
    const block = blocks.get(id) ?? {
      id,
      hub,
      linkType: edge.linkType,
      downstream: toIsLeaf,
      members: [],
      edgeIds: [],
    };
    block.members.push(leaf);
    block.edgeIds.push(edge.id);
    blocks.set(id, block);
  }
  return [...blocks.values()]
    .filter((block) => block.members.length >= LEAF_BLOCK_MIN)
    .map((block) => {
      const order = block.members
        .map((id, index) => ({ node: nodes.get(id)!, edgeId: block.edgeIds[index] }))
        .sort((a, b) => byDate(a.node, b.node));
      return {
        ...block,
        members: order.map((item) => item.node.id),
        edgeIds: order.map((item) => item.edgeId),
      };
    });
}

/** Colonnes de la grille d'un bloc : à peu près aussi large que haute. */
function blockColumns(count: number): number {
  const cellWidth = CARD_SIZE.width + BLOCK_GAP;
  const cellHeight = CARD_SIZE.height + BLOCK_GAP;
  return Math.max(1, Math.ceil(Math.sqrt((count * cellHeight) / cellWidth)));
}

function blockSize(count: number): { width: number; height: number } {
  const columns = blockColumns(count);
  const rows = Math.ceil(count / columns);
  return {
    width: 2 * BLOCK_PADDING + columns * CARD_SIZE.width + (columns - 1) * BLOCK_GAP,
    height: 2 * BLOCK_PADDING + rows * CARD_SIZE.height + (rows - 1) * BLOCK_GAP,
  };
}

function boxOf(node: ElkNode): Box {
  return { x: node.x ?? 0, y: node.y ?? 0, width: node.width ?? 0, height: node.height ?? 0 };
}

function routeOf(edge: ElkExtendedEdge): Point[] {
  const section = edge.sections?.[0];
  if (!section) return [];
  return [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map((point) => ({
    x: point.x,
    y: point.y,
  }));
}

/** Étendue de chaque colonne dans le sens de lecture, d'après les cartes placées. */
function placedBands(
  bandOf: Map<string, string>,
  order: string[],
  boxes: Record<string, Box>,
  horizontal: boolean,
): LayoutBand[] {
  const extents = new Map<string, { low: number; high: number }>();
  bandOf.forEach((key, id) => {
    const box = boxes[id];
    if (!box) return;
    const low = horizontal ? box.x : box.y;
    const high = low + (horizontal ? box.width : box.height);
    const extent = extents.get(key);
    extents.set(
      key,
      extent
        ? { low: Math.min(extent.low, low), high: Math.max(extent.high, high) }
        : { low, high },
    );
  });
  const used = order
    .filter((key) => extents.has(key))
    .map((key) => ({ key, ...extents.get(key)! }));
  const margin = 28;
  // Une colonne va du milieu de l'espace qui la sépare de la précédente au milieu du suivant.
  return used.map((band, i) => ({
    key: band.key,
    from: i === 0 ? band.low - margin : (used[i - 1].high + band.low) / 2,
    to: i === used.length - 1 ? band.high + margin : (band.high + used[i + 1].low) / 2,
  }));
}

/** Calcule la place de chaque carte et le tracé de chaque lien orienté. */
export async function layoutGraph(
  engine: LayoutEngine,
  view: GraphView,
  root: string | null,
  options: LayoutOptions = DEFAULT_LAYOUT,
): Promise<GraphLayout> {
  const horizontal = options.direction === 'right';
  const bandOf = bandKeys(view, options.reading);
  const order = bandOf ? bandOrder(bandOf, options.reading) : [];
  // elkjs range les cartes d'une colonne avant celles de la suivante (« partitions »).
  const column = (id: string) =>
    bandOf
      ? { layoutOptions: { 'elk.partitioning.partition': String(order.indexOf(bandOf.get(id)!)) } }
      : {};

  const blocks = leafBlocks(view, root, bandOf);
  const packed = new Set(blocks.flatMap((block) => block.members));
  const bundled = new Set(blocks.flatMap((block) => block.edgeIds));

  const children: ElkNode[] = [
    ...view.nodes
      .filter((node) => !packed.has(node.id))
      .map((node) => ({
        id: node.id,
        ...(node.id === root ? ROOT_SIZE : CARD_SIZE),
        ...column(node.id),
      })),
    ...shownGroups(view).map((group) => ({ id: group.id, ...GROUP_SIZE, ...column(group.id) })),
    ...blocks.map((block) => ({
      id: block.id,
      ...blockSize(block.members.length),
      ...column(block.members[0]),
    })),
  ];
  const flows = flowEdges(view);
  const edges: ElkExtendedEdge[] = [
    ...[...flows.filter((edge) => !bundled.has(edge.id)), ...anchorEdges(view, flows)].map(
      (edge) => ({ id: edge.id, sources: [edge.from], targets: [edge.to] }),
    ),
    ...blocks.map((block) => ({
      id: block.id,
      sources: [block.downstream ? block.hub : block.id],
      targets: [block.downstream ? block.id : block.hub],
    })),
  ];

  const placed = await engine.layout({
    id: 'graph',
    layoutOptions: {
      ...LAYOUT_OPTIONS,
      'elk.direction': horizontal ? 'RIGHT' : 'DOWN',
      'elk.partitioning.activate': String(!!bandOf),
    },
    children,
    edges,
  });

  const placedBoxes = new Map((placed.children ?? []).map((node) => [node.id, boxOf(node)]));
  const placedRoutes = new Map((placed.edges ?? []).map((edge) => [edge.id, routeOf(edge)]));
  const boxes: Record<string, Box> = {};
  const routes: Record<string, Point[]> = {};
  const blockIds = new Set(blocks.map((block) => block.id));
  placedBoxes.forEach((box, id) => {
    if (!blockIds.has(id)) boxes[id] = box;
  });
  placedRoutes.forEach((route, id) => {
    if (!blockIds.has(id) && route.length) routes[id] = route;
  });

  const placedBlocks = blocks.map((block) => {
    const box = placedBoxes.get(block.id) ?? { x: 0, y: 0, ...blockSize(block.members.length) };
    const columns = blockColumns(block.members.length);
    block.members.forEach((id, index) => {
      boxes[id] = {
        x: box.x + BLOCK_PADDING + (index % columns) * (CARD_SIZE.width + BLOCK_GAP),
        y: box.y + BLOCK_PADDING + Math.floor(index / columns) * (CARD_SIZE.height + BLOCK_GAP),
        ...CARD_SIZE,
      };
    });
    return { ...block, box, route: placedRoutes.get(block.id) ?? [] };
  });

  return {
    width: placed.width ?? 0,
    height: placed.height ?? 0,
    boxes,
    routes,
    blocks: placedBlocks,
    reading: options.reading,
    horizontal,
    bands: bandOf ? placedBands(bandOf, order, boxes, horizontal) : [],
  };
}

/** Le fil d'une entrée : elle, tout ce qui mène à elle, tout ce qui en part, et ses co-occurrences. */
export interface Thread {
  nodes: Set<string>;
  edges: Set<string>;
}

export function threadOf(view: GraphView, id: string): Thread {
  const flows = flowEdges(view);
  const nodes = new Set([id]);
  const edges = new Set<string>();
  const walk = (start: 'from' | 'to', end: 'from' | 'to') => {
    const stack = [id];
    const seen = new Set([id]);
    while (stack.length) {
      const current = stack.pop()!;
      for (const edge of flows) {
        if (edge[start] !== current) continue;
        edges.add(edge.id);
        const next = edge[end];
        if (seen.has(next)) continue;
        seen.add(next);
        nodes.add(next);
        stack.push(next);
      }
    }
  };
  walk('to', 'from');
  walk('from', 'to');
  for (const edge of view.edges) {
    if (flowOf(edge)) continue;
    if (edge.source !== id && edge.target !== id) continue;
    edges.add(edge.id);
    nodes.add(edge.source === id ? edge.target : edge.source);
  }
  return { nodes, edges };
}
