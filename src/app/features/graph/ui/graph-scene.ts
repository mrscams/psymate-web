// Ce que le gabarit du canevas dessine (fonction pure) : une carte par entrée et par super-nœud, un
// trait par lien, le cadre de chaque bloc d'entrées sœurs. Tout vient du graphe reçu (GraphView), de
// sa disposition (graph-layout.ts) et de la sélection ; aucune règle métier ici.
import { EntryType } from '../../../shared/ui';
import { GraphNode, GraphSuperNode, GraphView, LABELS_MAX_NODES, Point } from '../data/graph.model';
import { LinkLineStyle, LinkTypeCode } from '../data/link.model';
import {
  Box,
  flowOf,
  GraphLayout,
  groupEdgeId,
  LINK_FLOW,
  shownGroups,
  Thread,
  threadOf,
  TypeColumn,
} from './graph-layout';
import { labelSpots, roundedPath, shortened, sideCurve } from './graph-paths';

export interface GraphCanvasLabels {
  /** Nom d'une entrée : son titre, ou son titre de repli. */
  name: (node: GraphNode) => string;
  /** Date courte d'une entrée ; vide sans date. */
  date: (node: GraphNode) => string;
  type: (type: EntryType) => string;
  /** Texte d'un super-nœud : « 12 ressentis regroupés · anxiété majoritaire ». */
  group: (group: GraphSuperNode) => string;
  /** Nom d'un type de lien : « déclenche ». */
  link: (code: LinkTypeCode) => string;
  /** Titre d'une colonne de la lecture par type : « Événements ». */
  column: (column: TypeColumn) => string;
  /** Titre d'une colonne de la lecture par mois : « oct. 2026 », « Sans date ». */
  month: (key: string) => string;
  /** Nom d'un lien proposé (V2) : « suggéré ». */
  proposed: string;
}

/** Style de trait par défaut (étude couleurs §4), quand le catalogue n'est pas encore lu. */
export const DEFAULT_LINE_STYLES: Record<LinkTypeCode, LinkLineStyle> = {
  triggers: 'solid',
  caused_by: 'solid',
  worsens: 'long_dash',
  relieves: 'short_dash',
  co_occurs: 'dotted',
  follows: 'thin',
  part_of: 'thin',
  treats: 'double',
};

/** Les noms des liens se lisent-ils encore (moins de LABELS_MAX_NODES nœuds) ? */
export function labelsShown(view: GraphView): boolean {
  return view.nodes.length + view.superNodes.length < LABELS_MAX_NODES;
}

/** Diamètre du cercle d'un ressenti dans sa carte : il grandit avec l'intensité (0 à 10). */
export function feelingDiameter(intensity: number | null): number {
  const value = Math.min(10, Math.max(0, intensity ?? 0));
  return Math.round(18 + value * 1.6);
}

/** Dans le fil de l'entrée sélectionnée, hors du fil, ou sans sélection (null). */
export type ThreadState = 'thread' | 'dim' | null;

export interface CardView {
  id: string;
  kind: 'entry' | 'group';
  type: EntryType;
  title: string;
  /** « Ressenti · 24 oct. » ; vide pour un super-nœud. */
  sub: string;
  intensity: number | null;
  box: Box;
  root: boolean;
  selected: boolean;
  state: ThreadState;
}

export interface LinkView {
  id: string;
  line: LinkLineStyle | 'group';
  /** Trait visible (arrêté sous la pointe de la flèche). */
  path: string;
  /** Tracé complet, qui porte la flèche. */
  arrowPath: string;
  /** Extrémité de la flèche sur le tracé : elle pointe toujours vers la cible du lien. */
  arrow: 'start' | 'end' | null;
  proposed: boolean;
  state: ThreadState;
  name: { x: number; y: number; text: string } | null;
}

export interface GraphScene {
  width: number;
  height: number;
  cards: CardView[];
  links: LinkView[];
  /** Cadre de chaque bloc d'entrées sœurs. */
  frames: { id: string; box: Box }[];
  /** true : lecture horizontale (de gauche à droite, vers la gauche en arabe) ; false : de haut en bas. */
  horizontal: boolean;
  /** Colonnes (rangées, de haut en bas) des lectures par type et par mois, avec leur titre. */
  bands: BandView[];
  /** Ce qu'il faut montrer pour tout voir : le graphe, les titres des colonnes, les courbes du bord. */
  bounds: Box;
}

export interface BandView {
  key: string;
  label: string;
  box: Box;
  /**
   * Point d'accroche du titre : en haut à gauche de la colonne (en haut à droite vers la gauche, en
   * arabe), ou à gauche de la rangée.
   */
  labelAt: Point;
  /** Le titre finit au point d'accroche (à gauche d'une rangée, ou colonne lue vers la gauche). */
  labelEnds: boolean;
  /** Une colonne sur deux est plus claire. */
  alt: boolean;
}

export interface SceneOptions {
  root: string | null;
  selectedId: string | null;
  /** Nom des liens posé sur les traits ; sans lui, seuls ceux du fil de la sélection restent. */
  linkNames: boolean;
  lineStyles: Partial<Record<LinkTypeCode, LinkLineStyle>>;
  labels: GraphCanvasLabels;
}

const NAME_HEIGHT = 20;
/** Ce dont une colonne dépasse du graphe, de part et d'autre. */
const BAND_MARGIN = 20;
/** Hauteur réservée au titre d'une colonne, au-dessus d'elle. */
const BAND_TITLE = 26;
/** Place laissée aux courbes des co-occurrences de la dernière colonne. */
const CURVE_ROOM = 60;

function bandViews(layout: GraphLayout, labels: GraphCanvasLabels): BandView[] {
  return layout.bands.map((band, index) => {
    const label =
      layout.reading === 'type' ? labels.column(band.key as TypeColumn) : labels.month(band.key);
    const length = band.to - band.from;
    const across = (layout.horizontal ? layout.height : layout.width) + 2 * BAND_MARGIN;
    return {
      key: band.key,
      label,
      alt: index % 2 === 1,
      box: layout.horizontal
        ? { x: band.from, y: -BAND_MARGIN, width: length, height: across }
        : { x: -BAND_MARGIN, y: band.from, width: across, height: length },
      labelAt: !layout.horizontal
        ? { x: -BAND_MARGIN - 12, y: band.from + 8 }
        : layout.leftward
          ? { x: band.to - 10, y: -BAND_MARGIN - BAND_TITLE + 4 }
          : { x: band.from + 10, y: -BAND_MARGIN - BAND_TITLE + 4 },
      labelEnds: !layout.horizontal || !!layout.leftward,
    };
  });
}

function sceneBounds(layout: GraphLayout, bands: BandView[]): Box {
  let left = 0;
  let top = 0;
  let right = layout.width + (layout.horizontal ? CURVE_ROOM : 0);
  let bottom = layout.height + (layout.horizontal ? 0 : CURVE_ROOM);
  for (const band of bands) {
    left = Math.min(left, band.box.x);
    top = Math.min(top, band.box.y);
    right = Math.max(right, band.box.x + band.box.width);
    bottom = Math.max(bottom, band.box.y + band.box.height);
  }
  if (bands.length && layout.horizontal) top -= BAND_TITLE;
  // De haut en bas, les titres sont à gauche des rangées : leur largeur est estimée au caractère.
  if (bands.length && !layout.horizontal) {
    left -= 12 + Math.max(...bands.map((band) => band.label.length)) * 7.2;
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function buildScene(
  view: GraphView,
  layout: GraphLayout,
  options: SceneOptions,
): GraphScene {
  const { root, selectedId, lineStyles, labels } = options;
  const thread: Thread | null =
    selectedId && layout.boxes[selectedId] ? threadOf(view, selectedId) : null;
  const nodeState = (id: string): ThreadState =>
    !thread ? null : thread.nodes.has(id) ? 'thread' : 'dim';
  const edgeState = (ids: string[]): ThreadState =>
    !thread ? null : ids.some((id) => thread.edges.has(id)) ? 'thread' : 'dim';
  const lineOf = (code: LinkTypeCode) => lineStyles[code] ?? DEFAULT_LINE_STYLES[code] ?? 'solid';

  const cards: CardView[] = [];
  for (const node of view.nodes) {
    const box = layout.boxes[node.id];
    if (!box) continue;
    const type = labels.type(node.type);
    const date = labels.date(node);
    cards.push({
      id: node.id,
      kind: 'entry',
      type: node.type,
      title: labels.name(node),
      // Une entrée sans titre porte déjà sa date dans son nom de repli (« Note · 24 oct. »).
      sub: node.title && date ? `${type} · ${date}` : type,
      intensity: node.type === 'feeling' ? node.intensity : null,
      box,
      root: node.id === root,
      selected: node.id === selectedId,
      state: nodeState(node.id),
    });
  }
  for (const group of shownGroups(view)) {
    const box = layout.boxes[group.id];
    if (!box) continue;
    cards.push({
      id: group.id,
      kind: 'group',
      type: group.type,
      title: labels.group(group),
      sub: '',
      intensity: null,
      box,
      root: false,
      selected: group.id === selectedId,
      state: nodeState(group.id),
    });
  }

  // Un nom de lien ne recouvre ni une carte ni un autre nom : premier emplacement libre.
  const taken: Box[] = [...cards.map((card) => card.box), ...layout.blocks.map((b) => b.box)];
  const named = options.linkNames && labelsShown(view);
  const nameAt = (spots: { x: number; y: number }[], text: string, state: ThreadState) => {
    if (!text || !spots.length || state === 'dim') return null;
    const width = text.length * 6.1 + 18;
    const boxAt = (spot: { x: number; y: number }): Box => ({
      x: spot.x - width / 2,
      y: spot.y - NAME_HEIGHT / 2,
      width,
      height: NAME_HEIGHT,
    });
    const overlaps = (a: Box, b: Box) =>
      a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
    const spot = spots.find((s) => !taken.some((box) => overlaps(boxAt(s), box))) ?? spots[0];
    taken.push(boxAt(spot));
    return { x: spot.x, y: spot.y, text };
  };

  const links: LinkView[] = [];
  const bands = bandViews(layout, labels);
  const bundled = new Set(layout.blocks.flatMap((block) => block.edgeIds));
  for (const edge of view.edges) {
    if (bundled.has(edge.id)) continue;
    const from = layout.boxes[edge.source];
    const to = layout.boxes[edge.target];
    if (!from || !to) continue;
    const state = edgeState([edge.id]);
    const proposed = edge.status === 'proposed';
    const text = proposed
      ? labels.proposed
      : named || state === 'thread'
        ? labels.link(edge.linkType)
        : '';
    const flow = flowOf(edge);
    const route = layout.routes[edge.id];
    // Sans sens (co-occurrence) : une courbe entre les deux cartes, sauf si la disposition a tracé le
    // lien (il tient alors une entrée à côté de celle qu'elle accompagne).
    if (!flow) {
      const curve = route ? null : sideCurve(from, to, layout.horizontal);
      const path = curve ? curve.path : roundedPath(route);
      links.push({
        id: edge.id,
        line: lineOf(edge.linkType),
        path,
        arrowPath: path,
        arrow: null,
        proposed,
        state,
        name: nameAt(curve ? [curve.middle] : labelSpots(route), text, state),
      });
      continue;
    }
    if (!route) continue;
    const arrow = flow > 0 ? 'end' : 'start';
    links.push({
      id: edge.id,
      line: lineOf(edge.linkType),
      path: roundedPath(shortened(route, arrow)),
      arrowPath: roundedPath(route),
      arrow,
      proposed,
      state,
      name: nameAt(labelSpots(route), text, state),
    });
  }
  for (const group of shownGroups(view)) {
    const id = groupEdgeId(group);
    const route = layout.routes[id];
    if (!route) continue;
    const path = roundedPath(route);
    links.push({
      id,
      line: 'group',
      path,
      arrowPath: path,
      arrow: null,
      proposed: false,
      state: edgeState([id]),
      name: null,
    });
  }
  for (const block of layout.blocks) {
    if (block.route.length < 2) continue;
    const state = edgeState(block.edgeIds);
    const arrow = LINK_FLOW[block.linkType] > 0 ? 'end' : 'start';
    const text =
      named || state === 'thread' ? `${labels.link(block.linkType)} · ${block.members.length}` : '';
    links.push({
      id: block.id,
      line: lineOf(block.linkType),
      path: roundedPath(shortened(block.route, arrow)),
      arrowPath: roundedPath(block.route),
      arrow,
      proposed: false,
      state,
      name: nameAt(labelSpots(block.route), text, state),
    });
  }

  return {
    width: layout.width,
    height: layout.height,
    cards,
    links,
    frames: layout.blocks.map((block) => ({ id: block.id, box: block.box })),
    horizontal: layout.horizontal,
    bands,
    bounds: sceneBounds(layout, bands),
  };
}
