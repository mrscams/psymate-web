// Données de test de la vue graphe (Vitest seulement) : un petit dossier relié autour d'une
// situation, un super-nœud de ressentis, et les tokens du thème sous forme de noms (jamais de
// couleur écrite : les tests vérifient quel token va où).
import { GraphEdge, GraphNode, GraphSuperNode, GraphView } from './graph.model';

export function node(overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id: 'e-situation',
    type: 'situation',
    title: 'Surcharge au travail',
    occurred: '2026-03-01T09:00:00Z',
    intensity: null,
    emotion: null,
    degree: 3,
    distance: 0,
    authorType: 'practitioner',
    ...overrides,
  };
}

export function edge(overrides: Partial<GraphEdge> = {}): GraphEdge {
  return {
    id: 'l-1',
    source: 'e-situation',
    target: 'e-feeling',
    linkType: 'worsens',
    directed: true,
    provenance: 'manual',
    status: 'accepted',
    ...overrides,
  };
}

export function superNode(overrides: Partial<GraphSuperNode> = {}): GraphSuperNode {
  return {
    id: 'sn:e-situation:feeling',
    type: 'feeling',
    count: 3,
    dominantEmotion: 'anxiety',
    memberIds: ['e-f1', 'e-f2', 'e-f3'],
    neighborId: 'e-situation',
    ...overrides,
  };
}

/** Situation (racine) → ressenti (aggrave), événement → situation (déclenche), médicament → ressenti. */
export function graphView(overrides: Partial<GraphView> = {}): GraphView {
  return {
    nodes: [
      node(),
      node({
        id: 'e-feeling',
        type: 'feeling',
        title: null,
        intensity: 8,
        emotion: 'anxiety',
        distance: 1,
      }),
      node({ id: 'e-event', type: 'event', title: "Entretien d'évaluation", distance: 1 }),
      node({ id: 'e-med', type: 'medication', title: 'Sertraline 50 mg', distance: 2 }),
    ],
    edges: [
      edge(),
      edge({ id: 'l-2', source: 'e-event', target: 'e-situation', linkType: 'triggers' }),
      edge({ id: 'l-3', source: 'e-med', target: 'e-feeling', linkType: 'treats' }),
    ],
    superNodes: [],
    truncated: false,
    ...overrides,
  };
}

/** Réponse de POST …/graph/expand pour le super-nœud de graphView({ superNodes: [superNode()] }). */
export function expansion(): GraphView {
  return {
    nodes: ['e-f1', 'e-f2', 'e-f3'].map((id, i) =>
      node({ id, type: 'feeling', title: `Anxiété ${i + 4}`, intensity: i + 4, distance: 1 }),
    ),
    edges: ['e-f1', 'e-f2', 'e-f3'].map((id, i) =>
      edge({ id: `l-f${i + 1}`, source: 'e-situation', target: id, linkType: 'triggers' }),
    ),
    superNodes: [],
    truncated: false,
  };
}

/** Lecteur de tokens de test : chaque token vaut « tok(<nom>) », pour voir lequel est utilisé. */
export const tokenNames = (name: string) => ` tok(${name}) `;
