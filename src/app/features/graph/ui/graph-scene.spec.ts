import { edge, graphView, node, superNode } from '../data/graph.fixtures';
import { GraphView, LABELS_MAX_NODES } from '../data/graph.model';
import { layoutGraph } from './graph-layout';
import { testEngine } from './graph-layout.fixtures';
import { buildScene, GraphCanvasLabels, labelsShown, SceneOptions } from './graph-scene';

const labels: GraphCanvasLabels = {
  name: (n) => n.title ?? 'Anxiété 8/10 · 1 mars',
  date: () => '1 mars',
  type: (type) => `type:${type}`,
  group: (group) => `${group.count} regroupés`,
  link: (code) => `lien:${code}`,
  column: (column) => `colonne:${column}`,
  month: (key) => `mois:${key}`,
  proposed: 'suggéré',
};

async function scene(view: GraphView = graphView(), options: Partial<SceneOptions> = {}) {
  const layout = await layoutGraph(testEngine(), view, 'e-situation');
  return buildScene(view, layout, {
    root: 'e-situation',
    selectedId: null,
    linkNames: true,
    lineStyles: {},
    labels,
    ...options,
  });
}

describe('buildScene', () => {
  it('une carte par entrée : titre, type et date, intensité du ressenti, racine', async () => {
    const { cards } = await scene();
    expect(cards.map((card) => card.id)).toEqual(['e-situation', 'e-feeling', 'e-event', 'e-med']);
    expect(cards[0]).toMatchObject({
      kind: 'entry',
      type: 'situation',
      title: 'Surcharge au travail',
      sub: 'type:situation · 1 mars',
      intensity: null,
      root: true,
      selected: false,
      state: null,
    });
    // Sans titre : le nom de repli porte déjà la date.
    expect(cards[1]).toMatchObject({
      title: 'Anxiété 8/10 · 1 mars',
      sub: 'type:feeling',
      intensity: 8,
    });
  });

  it('un trait par lien : style du type, flèche vers la cible du lien, nom du lien', async () => {
    const { links } = await scene(graphView(), { lineStyles: { worsens: 'short_dash' } });
    const byId = Object.fromEntries(links.map((link) => [link.id, link]));
    // Catalogue lu : son style ; sinon le style par défaut.
    expect(byId['l-1']).toMatchObject({ line: 'short_dash', arrow: 'end', proposed: false });
    expect(byId['l-2']).toMatchObject({ line: 'solid', arrow: 'end' });
    // « traite » se lit de ce qui est traité vers le traitement : la flèche est au départ du tracé.
    expect(byId['l-3']).toMatchObject({ line: 'double', arrow: 'start' });
    expect(byId['l-3'].name?.text).toBe('lien:treats');
    expect(byId['l-3'].path).not.toBe(byId['l-3'].arrowPath);
  });

  it('co-occurrence : une courbe sans flèche ; lien proposé : « suggéré »', async () => {
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
        edge({
          id: 'l-5',
          source: 'e-event',
          target: 'e-med',
          linkType: 'triggers',
          status: 'proposed',
        }),
      ],
    });
    const { links } = await scene(view);
    const byId = Object.fromEntries(links.map((link) => [link.id, link]));
    expect(byId['l-4']).toMatchObject({ line: 'dotted', arrow: null });
    expect(byId['l-4'].path).toContain(' C');
    expect(byId['l-5']).toMatchObject({ proposed: true });
    expect(byId['l-5'].name?.text).toBe('suggéré');
  });

  it('super-nœud : une carte de groupe reliée à son voisin par un trait sans flèche ni nom', async () => {
    const { cards, links } = await scene(graphView({ superNodes: [superNode()] }));
    expect(cards.at(-1)).toMatchObject({
      id: 'sn:e-situation:feeling',
      kind: 'group',
      title: '3 regroupés',
      sub: '',
    });
    expect(links.at(-1)).toMatchObject({ line: 'group', arrow: null, name: null });
  });

  it('sélection : le fil de l’entrée s’allume, le reste s’efface et perd son nom de lien', async () => {
    const view = graphView({
      nodes: [...graphView().nodes, node({ id: 'e-other', title: 'Ailleurs' })],
      edges: [
        ...graphView().edges,
        edge({ id: 'l-9', source: 'e-event', target: 'e-other', linkType: 'triggers' }),
      ],
    });
    const { cards, links } = await scene(view, { selectedId: 'e-feeling' });
    const card = Object.fromEntries(cards.map((c) => [c.id, c]));
    expect(card['e-feeling']).toMatchObject({ selected: true, state: 'thread' });
    expect(card['e-event'].state).toBe('thread');
    expect(card['e-med'].state).toBe('thread');
    expect(card['e-other'].state).toBe('dim');
    const link = Object.fromEntries(links.map((l) => [l.id, l]));
    expect(link['l-1'].state).toBe('thread');
    expect(link['l-9'].state).toBe('dim');
    expect(link['l-9'].name).toBeNull();
  });

  it('au-delà de LABELS_MAX_NODES nœuds : noms des liens masqués, sauf ceux du fil', async () => {
    const extra = Array.from({ length: LABELS_MAX_NODES }, (_, i) =>
      node({ id: `e-x${i}`, title: `X${i}` }),
    );
    const view = graphView({ nodes: [...graphView().nodes, ...extra] });
    expect(labelsShown(view)).toBe(false);
    const quiet = await scene(view);
    expect(quiet.links.every((link) => link.name === null)).toBe(true);
    const focused = await scene(view, { selectedId: 'e-feeling' });
    expect(focused.links.find((link) => link.id === 'l-1')?.name?.text).toBe('lien:worsens');
  });

  it('nom des liens décoché : plus de nom sur les traits, sauf ceux du fil de la sélection', async () => {
    const shown = await scene();
    expect(shown.links.every((link) => link.name !== null)).toBe(true);
    const hidden = await scene(graphView(), { linkNames: false });
    expect(hidden.links.every((link) => link.name === null)).toBe(true);
    const focused = await scene(graphView(), { linkNames: false, selectedId: 'e-feeling' });
    expect(focused.links.find((link) => link.id === 'l-1')?.name?.text).toBe('lien:worsens');
  });

  it('chaîne causale : aucune colonne ; par type : une colonne titrée par nature d’entrée', async () => {
    expect((await scene()).bands).toEqual([]);
    const view = graphView();
    const layout = await layoutGraph(testEngine(), view, 'e-situation', {
      reading: 'type',
      direction: 'right',
    });
    const built = buildScene(view, layout, {
      root: 'e-situation',
      selectedId: null,
      linkNames: true,
      lineStyles: {},
      labels,
    });
    expect(built.horizontal).toBe(true);
    expect(built.bands.map((band) => band.label)).toEqual([
      'colonne:events',
      'colonne:situations',
      'colonne:feelings',
      'colonne:responses',
    ]);
    expect(built.bands.map((band) => band.alt)).toEqual([false, true, false, true]);
    // Le titre est au-dessus de sa colonne, et la vue à ajuster le contient.
    expect(built.bands[0].labelAt.y).toBeLessThan(built.bands[0].box.y);
    expect(built.bounds.y).toBeLessThanOrEqual(built.bands[0].labelAt.y);
    expect(built.bounds.width).toBeGreaterThan(layout.width);
  });

  it('par type, vers la gauche (arabe) : la première colonne à droite, son titre en haut à droite', async () => {
    const view = graphView();
    const layout = await layoutGraph(testEngine(), view, 'e-situation', {
      reading: 'type',
      direction: 'right',
      textDirection: 'rtl',
    });
    const built = buildScene(view, layout, {
      root: 'e-situation',
      selectedId: null,
      linkNames: true,
      lineStyles: {},
      labels,
    });
    expect(built.horizontal).toBe(true);
    const [first, second] = built.bands;
    expect(first.label).toBe('colonne:events');
    expect(first.box.x).toBeGreaterThan(second.box.x);
    expect(built.bands.map((band) => band.alt)).toEqual([false, true, false, true]);
    // Le titre finit au bord droit de sa colonne (10 px avant), au-dessus d'elle.
    expect(first.labelEnds).toBe(true);
    expect(first.labelAt.x).toBe(first.box.x + first.box.width - 10);
    expect(first.labelAt.y).toBeLessThan(first.box.y);
  });

  it('par type, de gauche à droite : le titre part du bord gauche de sa colonne', async () => {
    const view = graphView();
    const layout = await layoutGraph(testEngine(), view, 'e-situation', {
      reading: 'type',
      direction: 'right',
    });
    const built = buildScene(view, layout, {
      root: 'e-situation',
      selectedId: null,
      linkNames: true,
      lineStyles: {},
      labels,
    });
    expect(built.bands[0].labelEnds).toBe(false);
    expect(built.bands[0].labelAt.x).toBe(built.bands[0].box.x + 10);
  });

  it('par mois, de haut en bas : des rangées titrées à gauche', async () => {
    const view = graphView();
    const layout = await layoutGraph(testEngine(), view, 'e-situation', {
      reading: 'time',
      direction: 'down',
    });
    const built = buildScene(view, layout, {
      root: 'e-situation',
      selectedId: null,
      linkNames: true,
      lineStyles: {},
      labels,
    });
    expect(built.horizontal).toBe(false);
    expect(built.bands.map((band) => band.label)).toEqual(['mois:2026-03']);
    expect(built.bands[0].labelAt.x).toBeLessThan(built.bands[0].box.x);
    expect(built.bounds.x).toBeLessThan(built.bands[0].labelAt.x);
  });

  it('bloc d’entrées sœurs : un cadre, un seul trait nommé avec le nombre d’entrées', async () => {
    const feelings = Array.from({ length: 8 }, (_, i) =>
      node({ id: `e-f${i}`, type: 'feeling', title: `A${i}`, intensity: i }),
    );
    const view = graphView({
      nodes: [node(), ...feelings],
      edges: feelings.map((feeling, i) => edge({ id: `l-f${i}`, target: feeling.id })),
    });
    const built = await scene(view);
    expect(built.cards).toHaveLength(9);
    expect(built.frames).toHaveLength(1);
    expect(built.links).toHaveLength(1);
    expect(built.links[0]).toMatchObject({ line: 'long_dash', arrow: 'end' });
    expect(built.links[0].name?.text).toBe('lien:worsens · 8');
    // Une entrée du bloc sélectionnée : le trait du bloc est dans son fil, ses sœurs non.
    const focused = await scene(view, { selectedId: 'e-f3' });
    expect(focused.links[0].state).toBe('thread');
    expect(focused.cards.find((card) => card.id === 'e-f4')?.state).toBe('dim');
    expect(focused.cards.find((card) => card.id === 'e-situation')?.state).toBe('thread');
  });
});
