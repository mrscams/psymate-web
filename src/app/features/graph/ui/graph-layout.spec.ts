import { edge, graphView, node, superNode } from '../data/graph.fixtures';
import { GraphView } from '../data/graph.model';
import {
  anchorEdges,
  bandKeys,
  CARD_SIZE,
  flowEdges,
  groupEdgeId,
  layoutGraph,
  LEAF_BLOCK_MIN,
  leafBlocks,
  monthKey,
  NO_DATE,
  ROOT_SIZE,
  threadOf,
} from './graph-layout';
import { testEngine } from './graph-layout.fixtures';

/** Une situation et `count` ressentis qui n'ont qu'elle pour lien (aggrave). */
function crowded(count: number): GraphView {
  const feelings = Array.from({ length: count }, (_, i) =>
    node({
      id: `e-f${i}`,
      type: 'feeling',
      title: `Anxiété ${i}`,
      intensity: i % 10,
      occurred: `2026-04-${String(28 - i).padStart(2, '0')}T09:00:00Z`,
    }),
  );
  return graphView({
    nodes: [node(), ...feelings],
    edges: feelings.map((feeling, i) => edge({ id: `l-f${i}`, target: feeling.id })),
  });
}

describe('graph-layout', () => {
  it('flowEdges : le sens de lecture, pas celui du lien', () => {
    const view = graphView({
      edges: [
        ...graphView().edges,
        edge({
          id: 'l-4',
          source: 'e-event',
          target: 'e-feeling',
          linkType: 'co_occurs',
          directed: false,
        }),
      ],
      superNodes: [superNode()],
    });
    expect(flowEdges(view)).toEqual([
      // aggrave : la source avant la cible.
      { id: 'l-1', from: 'e-situation', to: 'e-feeling' },
      { id: 'l-2', from: 'e-event', to: 'e-situation' },
      // traite : le traitement se lit après ce qu'il traite.
      { id: 'l-3', from: 'e-feeling', to: 'e-med' },
      // co-occurrence : hors disposition ; le super-nœud suit son voisin.
      { id: groupEdgeId(superNode()), from: 'e-situation', to: 'sn:e-situation:feeling' },
    ]);
  });

  it('leafBlocks : des entrées sœurs en nombre forment un bloc, rangé par date', () => {
    expect(leafBlocks(crowded(LEAF_BLOCK_MIN - 1), 'e-situation')).toEqual([]);
    const [block] = leafBlocks(crowded(LEAF_BLOCK_MIN), 'e-situation');
    expect(block).toMatchObject({ hub: 'e-situation', linkType: 'worsens', downstream: true });
    expect(block.members).toEqual(['e-f5', 'e-f4', 'e-f3', 'e-f2', 'e-f1', 'e-f0']);
    expect(block.edgeIds).toEqual(['l-f5', 'l-f4', 'l-f3', 'l-f2', 'l-f1', 'l-f0']);
  });

  it('leafBlocks : la racine et une entrée à plusieurs liens restent hors bloc', () => {
    const view = crowded(LEAF_BLOCK_MIN + 3);
    view.edges.push(
      edge({ id: 'l-x', source: 'e-f0', target: 'e-f1', linkType: 'co_occurs', directed: false }),
    );
    const [block] = leafBlocks(view, 'e-f8');
    expect([...block.members].sort()).toEqual(['e-f2', 'e-f3', 'e-f4', 'e-f5', 'e-f6', 'e-f7']);
  });

  it('layoutGraph : de gauche à droite dans le sens de lecture, une boîte par carte, un tracé par lien orienté', async () => {
    const layout = await layoutGraph(testEngine(), graphView(), 'e-situation');
    const { boxes, routes } = layout;
    expect(Object.keys(boxes).sort()).toEqual(['e-event', 'e-feeling', 'e-med', 'e-situation']);
    expect(boxes['e-event'].x).toBeLessThan(boxes['e-situation'].x);
    expect(boxes['e-situation'].x).toBeLessThan(boxes['e-feeling'].x);
    expect(boxes['e-feeling'].x).toBeLessThan(boxes['e-med'].x);
    expect(boxes['e-situation']).toMatchObject(ROOT_SIZE);
    expect(boxes['e-med']).toMatchObject(CARD_SIZE);
    expect(Object.keys(routes).sort()).toEqual(['l-1', 'l-2', 'l-3']);
    // Le tracé de « traite » part de ce qui est traité (lecture), la flèche est posée par la scène.
    expect(routes['l-3'][0].x).toBeLessThan(routes['l-3'].at(-1)!.x);
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.blocks).toEqual([]);
  });

  it('layoutGraph : un bloc range ses entrées en grille, relié au pivot par un seul tracé', async () => {
    const layout = await layoutGraph(testEngine(), crowded(12), 'e-situation');
    expect(layout.blocks).toHaveLength(1);
    const [block] = layout.blocks;
    expect(block.route.length).toBeGreaterThanOrEqual(2);
    expect(Object.keys(layout.routes)).toEqual([]);
    const boxes = block.members.map((id) => layout.boxes[id]);
    for (const box of boxes) {
      expect(box.x).toBeGreaterThanOrEqual(block.box.x);
      expect(box.y).toBeGreaterThanOrEqual(block.box.y);
      expect(box.x + box.width).toBeLessThanOrEqual(block.box.x + block.box.width);
      expect(box.y + box.height).toBeLessThanOrEqual(block.box.y + block.box.height);
    }
    // 12 cartes : 2 colonnes de 6, pas une colonne de 12.
    expect(new Set(boxes.map((box) => box.x)).size).toBe(2);
    expect(block.box.x).toBeGreaterThan(layout.boxes['e-situation'].x);
  });

  it('co-occurrence d’une entrée sans lien orienté : elle est placée à côté de celle qu’elle accompagne', async () => {
    const view = graphView({
      nodes: [...graphView().nodes, node({ id: 'e-note', type: 'note', title: 'Seule' })],
      edges: [
        ...graphView().edges,
        // Les deux entrées ont déjà des liens orientés : la co-occurrence ne pèse pas.
        edge({
          id: 'l-4',
          source: 'e-event',
          target: 'e-feeling',
          linkType: 'co_occurs',
          directed: false,
        }),
        // La note n'a que cette co-occurrence : elle suit le ressenti.
        edge({
          id: 'l-5',
          source: 'e-note',
          target: 'e-feeling',
          linkType: 'co_occurs',
          directed: false,
        }),
      ],
    });
    expect(anchorEdges(view, flowEdges(view))).toEqual([
      { id: 'l-5', from: 'e-feeling', to: 'e-note' },
    ]);
    const layout = await layoutGraph(testEngine(), view, 'e-situation');
    expect(layout.routes['l-4']).toBeUndefined();
    expect(layout.routes['l-5'].length).toBeGreaterThanOrEqual(2);
    expect(layout.boxes['e-note'].x).toBeGreaterThan(layout.boxes['e-feeling'].x);
  });

  it('lecture par type : une colonne par nature d’entrée, toujours dans le même ordre', async () => {
    const view = graphView();
    expect(Object.fromEntries(bandKeys(view, 'type')!)).toEqual({
      'e-situation': 'situations',
      'e-feeling': 'feelings',
      'e-event': 'events',
      'e-med': 'responses',
    });
    expect(bandKeys(view, 'causal')).toBeNull();
    const layout = await layoutGraph(testEngine(), view, 'e-situation', {
      reading: 'type',
      direction: 'right',
    });
    expect(layout.bands.map((band) => band.key)).toEqual([
      'events',
      'situations',
      'feelings',
      'responses',
    ]);
    // Chaque carte est dans sa colonne, les colonnes se suivent sans se chevaucher.
    const column = Object.fromEntries(layout.bands.map((band) => [band.key, band]));
    const inside = (id: string, key: string) => {
      const box = layout.boxes[id];
      expect(box.x).toBeGreaterThanOrEqual(column[key].from);
      expect(box.x + box.width).toBeLessThanOrEqual(column[key].to);
    };
    inside('e-event', 'events');
    inside('e-situation', 'situations');
    inside('e-feeling', 'feelings');
    inside('e-med', 'responses');
    layout.bands.slice(1).forEach((band, i) => expect(band.from).toBe(layout.bands[i].to));
  });

  it('lecture par mois : une colonne par mois, les entrées sans date à la fin, le super-nœud avec son voisin', async () => {
    const view = graphView({
      nodes: [
        node({ occurred: '2026-03-10T09:00:00Z' }),
        node({ id: 'e-feeling', type: 'feeling', occurred: '2026-10-24T09:00:00Z', intensity: 8 }),
        node({ id: 'e-event', type: 'event', occurred: '2026-10-18T09:00:00Z' }),
        node({ id: 'e-med', type: 'medication', occurred: null }),
      ],
      superNodes: [superNode()],
    });
    expect(monthKey('2026-10-24T09:00:00Z')).toBe('2026-10');
    expect(monthKey(null)).toBe(NO_DATE);
    expect(bandKeys(view, 'time')!.get('sn:e-situation:feeling')).toBe('2026-03');
    const layout = await layoutGraph(testEngine(), view, 'e-situation', {
      reading: 'time',
      direction: 'right',
    });
    expect(layout.bands.map((band) => band.key)).toEqual(['2026-03', '2026-10', NO_DATE]);
    // L'événement d'octobre déclenche la situation de mars : le temps place, pas le lien.
    expect(layout.boxes['e-situation'].x).toBeLessThan(layout.boxes['e-event'].x);
    expect(layout.boxes['e-event'].x).toBeLessThan(layout.boxes['e-med'].x);
  });

  it('de haut en bas : même lecture, les couches se suivent verticalement', async () => {
    const layout = await layoutGraph(testEngine(), graphView(), 'e-situation', {
      reading: 'type',
      direction: 'down',
    });
    expect(layout.horizontal).toBe(false);
    expect(layout.boxes['e-event'].y).toBeLessThan(layout.boxes['e-situation'].y);
    expect(layout.boxes['e-situation'].y).toBeLessThan(layout.boxes['e-feeling'].y);
    expect(layout.boxes['e-feeling'].y).toBeLessThan(layout.boxes['e-med'].y);
    // Les colonnes deviennent des rangées : leur étendue est verticale.
    const [events, situations] = layout.bands;
    expect(layout.boxes['e-event'].y).toBeGreaterThanOrEqual(events.from);
    expect(layout.boxes['e-situation'].y).toBeGreaterThanOrEqual(situations.from);
  });

  it('avec des colonnes, un bloc ne réunit que des entrées de la même colonne', () => {
    const view = crowded(12);
    // Six ressentis de mars, six d'avril (dates de crowded : 17 au 28 avril ; on en déplace six).
    view.nodes.slice(1, 7).forEach((feeling) => (feeling.occurred = '2026-03-15T09:00:00Z'));
    expect(leafBlocks(view, 'e-situation')).toHaveLength(1);
    const blocks = leafBlocks(view, 'e-situation', bandKeys(view, 'time'));
    expect(blocks).toHaveLength(2);
    expect(blocks.map((block) => block.members.length)).toEqual([6, 6]);
  });

  it('threadOf : tout ce qui mène à l’entrée, tout ce qui en part, ses co-occurrences', () => {
    const view = graphView({
      nodes: [...graphView().nodes, node({ id: 'e-note', type: 'note' }), node({ id: 'e-other' })],
      edges: [
        ...graphView().edges,
        edge({
          id: 'l-4',
          source: 'e-note',
          target: 'e-feeling',
          linkType: 'co_occurs',
          directed: false,
        }),
        edge({ id: 'l-5', source: 'e-event', target: 'e-other', linkType: 'triggers' }),
      ],
    });
    const thread = threadOf(view, 'e-feeling');
    expect([...thread.nodes].sort()).toEqual([
      'e-event',
      'e-feeling',
      'e-med',
      'e-note',
      'e-situation',
    ]);
    expect([...thread.edges].sort()).toEqual(['l-1', 'l-2', 'l-3', 'l-4']);
  });
});
