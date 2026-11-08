// Éléments Cytoscape du graphe (fonction pure) : un nœud par entrée, un nœud par super-nœud relié
// à son voisin, une arête par lien. Classes lues par graph-style.ts : type-<type>, root, group,
// line-<style>, directed, proposed, group-edge.
import { GraphSuperNode, GraphView } from '../data/graph.model';
import { LinkLineStyle, LinkTypeCode } from '../data/link.model';
import { DEFAULT_LINE_STYLES, feelingDiameter } from './graph-style';

export interface GraphElementLabels {
  /** Étiquette d'un nœud : « titre · date ». */
  node: (node: GraphView['nodes'][number]) => string;
  /** Texte d'un super-nœud : « 12 ressentis · anxiété majoritaire ». */
  group: (group: GraphSuperNode) => string;
  /** Étiquette d'un lien proposé (V2) : « suggéré ». */
  proposed: string;
}

export interface GraphNodeData {
  id: string;
  label: string;
  /** entry : une entrée ; group : un super-nœud. */
  kind: 'entry' | 'group';
  type: string;
  size: number;
}

export interface GraphEdgeData {
  id: string;
  source: string;
  target: string;
  label: string;
  /** Lien réel (entry) ou rattachement d'un super-nœud à son voisin (group). */
  kind: 'entry' | 'group';
}

export interface GraphElement {
  group: 'nodes' | 'edges';
  data: GraphNodeData | GraphEdgeData;
  classes: string;
  /** Seuls les nœuds se sélectionnent (le détail d'un lien passe par la liste équivalente). */
  selectable: boolean;
}

/** Arête qui rattache un super-nœud à son voisin (pas un lien du dossier). */
export function groupEdgeId(group: Pick<GraphSuperNode, 'id'>): string {
  return `${group.id}:edge`;
}

export function graphElements(
  view: GraphView,
  root: string | null,
  lineStyles: Partial<Record<LinkTypeCode, LinkLineStyle>>,
  labels: GraphElementLabels,
): GraphElement[] {
  const ids = new Set(view.nodes.map((node) => node.id));
  const elements: GraphElement[] = view.nodes.map((node) => ({
    group: 'nodes',
    data: {
      id: node.id,
      label: labels.node(node),
      kind: 'entry',
      type: node.type,
      size: node.type === 'feeling' ? feelingDiameter(node.intensity) : 0,
    },
    classes: [`type-${node.type}`, node.id === root ? 'root' : ''].filter(Boolean).join(' '),
    selectable: true,
  }));
  for (const group of view.superNodes) {
    if (!ids.has(group.neighborId)) continue;
    elements.push({
      group: 'nodes',
      data: { id: group.id, label: labels.group(group), kind: 'group', type: group.type, size: 0 },
      classes: 'group',
      selectable: true,
    });
    elements.push({
      group: 'edges',
      data: {
        id: groupEdgeId(group),
        source: group.id,
        target: group.neighborId,
        label: '',
        kind: 'group',
      },
      classes: 'group-edge',
      selectable: false,
    });
  }
  for (const edge of view.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) continue;
    const style = lineStyles[edge.linkType] ?? DEFAULT_LINE_STYLES[edge.linkType] ?? 'solid';
    const proposed = edge.status === 'proposed';
    elements.push({
      group: 'edges',
      data: {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: proposed ? labels.proposed : '',
        kind: 'entry',
      },
      classes: [`line-${style}`, edge.directed ? 'directed' : '', proposed ? 'proposed' : '']
        .filter(Boolean)
        .join(' '),
      selectable: false,
    });
  }
  return elements;
}
