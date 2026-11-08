import { graphView, superNode } from '../data/graph.fixtures';
import { graphElements, GraphElementLabels, groupEdgeId } from './graph-elements';

const labels: GraphElementLabels = {
  node: (node) => `${node.title ?? 'sans titre'}`,
  group: (group) => `${group.count} regroupés`,
  proposed: 'suggéré',
};

describe('graphElements', () => {
  it('un nœud par entrée (type, racine, taille des ressentis), une arête par lien', () => {
    const elements = graphElements(graphView(), 'e-situation', {}, labels);
    const nodes = elements.filter((element) => element.group === 'nodes');
    const edges = elements.filter((element) => element.group === 'edges');
    expect(nodes.map((n) => [n.data.id, n.classes])).toEqual([
      ['e-situation', 'type-situation root'],
      ['e-feeling', 'type-feeling'],
      ['e-event', 'type-event'],
      ['e-med', 'type-medication'],
    ]);
    expect(nodes[1].data).toMatchObject({ size: 63, label: 'sans titre' });
    expect(nodes.every((n) => n.selectable)).toBe(true);
    expect(edges.map((e) => [e.data.id, e.classes])).toEqual([
      ['l-1', 'line-long_dash directed'],
      ['l-2', 'line-solid directed'],
      ['l-3', 'line-double directed'],
    ]);
    expect(edges.every((e) => !e.selectable)).toBe(true);
  });

  it('le style de trait du catalogue l’emporte ; symétrique sans flèche ; proposed étiqueté', () => {
    const view = graphView({
      edges: [
        {
          id: 'l-9',
          source: 'e-event',
          target: 'e-feeling',
          linkType: 'co_occurs',
          directed: false,
          provenance: 'ai_suggested',
          status: 'proposed',
        },
      ],
    });
    const [edge] = graphElements(view, null, { co_occurs: 'thin' }, labels).filter(
      (element) => element.group === 'edges',
    );
    expect(edge.classes).toBe('line-thin proposed');
    expect(edge.data).toMatchObject({ label: 'suggéré' });
  });

  it('super-nœud : un nœud « group » rattaché à son voisin, rien si le voisin est absent', () => {
    const group = superNode();
    const elements = graphElements(graphView({ superNodes: [group] }), null, {}, labels);
    expect(elements.find((e) => e.data.id === group.id)).toMatchObject({
      classes: 'group',
      data: { kind: 'group', label: '3 regroupés' },
    });
    expect(elements.find((e) => e.data.id === groupEdgeId(group))).toMatchObject({
      classes: 'group-edge',
      data: { source: group.id, target: 'e-situation' },
    });
    const orphan = superNode({ neighborId: 'e-absent' });
    expect(
      graphElements(graphView({ superNodes: [orphan] }), null, {}, labels).some(
        (e) => e.data.id === orphan.id,
      ),
    ).toBe(false);
  });
});
