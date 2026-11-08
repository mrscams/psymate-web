import { TestBed } from '@angular/core/testing';
import cytoscape, { Core, CytoscapeOptions, NodeSingular } from 'cytoscape';

import { ThemeService } from '../../../core/theme';
import { expansion, graphView, superNode } from '../data/graph.fixtures';
import {
  GraphPositionsChange,
  GraphView,
  GraphViewportChange,
  LinkDrop,
} from '../data/graph.model';
import { GRAPH_RENDERER, GraphCanvasComponent, GraphProbe } from './graph-canvas.component';
import { GraphElementLabels } from './graph-elements';
import { GRAPH_TOKEN_NAMES } from './graph-style';

const labels: GraphElementLabels = {
  node: (node) => node.title ?? node.id,
  group: (group) => `${group.count} regroupés`,
  proposed: 'suggéré',
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Couleurs nommées (jamais de valeur hexadécimale) posées sur l'hôte pour suivre les tokens. */
function paint(host: HTMLElement, colour: string): void {
  for (const name of Object.values(GRAPH_TOKEN_NAMES)) {
    host.style.setProperty(name, name === '--font-ui' ? 'sans-serif' : colour);
  }
}

async function render(
  options: {
    view?: GraphView;
    positions?: Record<string, { x: number; y: number }> | null;
    viewport?: { zoom: number; pan: { x: number; y: number } } | null;
    reducedMotion?: boolean;
    onCreate?: (cy: Core) => void;
  } = {},
) {
  // Headless : une animation ne progresse pas ; sans prefers-reduced-motion, le layout est animé.
  const reducedMotion = options.reducedMotion ?? true;
  let cy: Core | null = null;
  const create = vi.fn((config: CytoscapeOptions) => {
    // Sans canevas (jsdom) : Cytoscape en mode headless, layout grille.
    cy = cytoscape({ ...config, headless: true, styleEnabled: true });
    options.onCreate?.(cy);
    return cy;
  });
  const matchMedia = vi.fn((query: string) => ({
    matches: query.includes('reduced-motion') && reducedMotion,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  vi.stubGlobal('matchMedia', matchMedia);
  TestBed.configureTestingModule({
    providers: [
      { provide: GRAPH_RENDERER, useValue: () => Promise.resolve({ create, layout: 'grid' }) },
    ],
  });
  const fixture = TestBed.createComponent(GraphCanvasComponent);
  const host = fixture.nativeElement as HTMLElement;
  paint(host, 'red');
  fixture.componentRef.setInput('view', options.view ?? graphView());
  fixture.componentRef.setInput('root', 'e-situation');
  fixture.componentRef.setInput('layoutKey', 'e-situation');
  fixture.componentRef.setInput('labels', labels);
  fixture.componentRef.setInput('positions', options.positions ?? null);
  fixture.componentRef.setInput('viewport', options.viewport ?? null);
  fixture.componentRef.setInput('label', 'Graphe des liens : 4 nœuds, 3 liens.');
  const events = {
    selected: [] as (string | null)[],
    activated: [] as string[],
    drops: [] as LinkDrop[],
    positions: [] as GraphPositionsChange[],
    viewports: [] as GraphViewportChange[],
  };
  const component = fixture.componentInstance;
  component.nodeSelected.subscribe((id) => events.selected.push(id));
  component.nodeActivated.subscribe((id) => events.activated.push(id));
  component.linkDropped.subscribe((drop) => events.drops.push(drop));
  component.positionsChanged.subscribe((p) => events.positions.push(p));
  component.viewportChanged.subscribe((v) => events.viewports.push(v));
  await settle(fixture);
  const probe = (host as unknown as { pmGraphProbe: GraphProbe }).pmGraphProbe;
  return { fixture, host, events, create, probe, matchMedia, cy: () => cy as unknown as Core };
}

async function settle(fixture: { whenStable(): Promise<unknown> }): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await tick();
    TestBed.tick();
    await fixture.whenStable();
  }
}

describe('GraphCanvasComponent', () => {
  // La sonde des e2e n'est posée que sur demande (page.addInitScript dans e2e/flux-6-graphe).
  beforeEach(() => ((globalThis as { pmE2E?: boolean }).pmE2E = true));
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (globalThis as { pmE2E?: boolean }).pmE2E;
  });

  it('sonde des e2e : absente sans pmE2E, retirée à la destruction', async () => {
    const { fixture, host } = await render();
    expect((host as { pmGraphProbe?: GraphProbe }).pmGraphProbe).toBeDefined();
    fixture.destroy();
    expect((host as { pmGraphProbe?: GraphProbe }).pmGraphProbe).toBeUndefined();

    TestBed.resetTestingModule();
    delete (globalThis as { pmE2E?: boolean }).pmE2E;
    const silent = await render();
    expect((silent.host as { pmGraphProbe?: GraphProbe }).pmGraphProbe).toBeUndefined();
  });

  it('charge le moteur, dessine nœuds et liens, sonde des e2e, nom accessible', async () => {
    const { host, create, probe, cy } = await render();
    expect(create).toHaveBeenCalledTimes(1);
    expect(probe.nodeIds()).toEqual(['e-situation', 'e-feeling', 'e-event', 'e-med']);
    expect(cy().edges()).toHaveLength(3);
    expect(cy().$('#e-situation').hasClass('root')).toBe(true);
    expect(probe.point('e-event')).not.toBeNull();
    expect(probe.point('absent')).toBeNull();
    expect(probe.layoutMs()).not.toBeNull();
    expect(probe.busy()).toBe(false);
    const canvas = host.querySelector('.canvas')!;
    expect(canvas.getAttribute('role')).toBe('img');
    expect(canvas.getAttribute('aria-label')).toBe('Graphe des liens : 4 nœuds, 3 liens.');
  });

  it('layout : positions et zoom remontés à la page ; animé sauf prefers-reduced-motion', async () => {
    const { events, cy, matchMedia } = await render({ reducedMotion: true });
    expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    expect(events.positions.at(-1)?.key).toBe('e-situation');
    expect(Object.keys(events.positions.at(-1)?.positions ?? {})).toHaveLength(4);
    expect(events.viewports.at(-1)?.key).toBe('e-situation');
    const reduced = vi.spyOn(cy(), 'layout');
    matchMedia.mockClear();

    TestBed.resetTestingModule();
    const animated = await render({ reducedMotion: false });
    const layout = vi.spyOn(animated.cy(), 'layout');
    animated.fixture.componentRef.setInput('relayout', 1);
    await settle(animated.fixture);
    expect(layout).toHaveBeenCalledWith(
      expect.objectContaining({ animate: 'end', animationDuration: 400 }),
    );
    expect(reduced).not.toHaveBeenCalled();
  });

  it('« Recentrer » (relayout) : layout relancé même avec des positions rangées', async () => {
    const positions = {
      'e-situation': { x: 0, y: 0 },
      'e-feeling': { x: 100, y: 0 },
      'e-event': { x: 0, y: 100 },
      'e-med': { x: 100, y: 100 },
    };
    const { fixture, cy } = await render({ positions });
    const layout = vi.spyOn(cy(), 'layout');
    fixture.componentRef.setInput('relayout', 1);
    await settle(fixture);
    expect(layout).toHaveBeenCalledWith(expect.objectContaining({ animate: false }));
  });

  it('positions rangées pour tous les nœuds : pas de layout, zoom repris tel quel', async () => {
    const positions = {
      'e-situation': { x: 0, y: 0 },
      'e-feeling': { x: 100, y: 0 },
      'e-event': { x: 0, y: 100 },
      'e-med': { x: 100, y: 100 },
    };
    const { cy, events, probe } = await render({
      positions,
      viewport: { zoom: 1.7, pan: { x: 12, y: 34 } },
    });
    expect(cy().$('#e-med').position()).toEqual({ x: 100, y: 100 });
    expect(cy().zoom()).toBeCloseTo(1.7);
    expect(cy().pan()).toEqual({ x: 12, y: 34 });
    expect(events.positions).toEqual([]);
    expect(probe.layoutMs()).toBeNull();
  });

  it('zoom + / − : boutons nommés, zoom rangé tout de suite', async () => {
    const { host, cy, events } = await render();
    const before = cy().zoom();
    const count = events.viewports.length;
    host.querySelector<HTMLButtonElement>('button[aria-label="Zoom avant"]')!.click();
    expect(cy().zoom()).toBeCloseTo(before * 1.25);
    expect(events.viewports.length).toBe(count + 1);
    expect(events.viewports.at(-1)).toMatchObject({
      key: 'e-situation',
      viewport: { zoom: cy().zoom() },
    });
    host.querySelector<HTMLButtonElement>('button[aria-label="Zoom arrière"]')!.click();
    expect(cy().zoom()).toBeCloseTo(before);
  });

  it('clic : sélection ; fond : désélection ; double-clic : activation', async () => {
    const { cy, events } = await render();
    cy().$('#e-event').emit('tap');
    cy().emit('tap');
    cy().$('#e-feeling').emit('dbltap');
    expect(events.selected).toEqual(['e-event', null]);
    expect(events.activated).toEqual(['e-feeling']);
  });

  it('sélection venue de la page : le nœud est sélectionné dans le canevas', async () => {
    const { fixture, cy } = await render();
    fixture.componentRef.setInput('selectedId', 'e-med');
    await settle(fixture);
    expect(
      cy()
        .$(':selected')
        .map((n) => n.id()),
    ).toEqual(['e-med']);
    fixture.componentRef.setInput('selectedId', null);
    await settle(fixture);
    expect(cy().$(':selected')).toHaveLength(0);
  });

  it('glisser un nœud sur un autre : lien demandé, le nœud revient ; ailleurs : il reste', async () => {
    const positions = {
      'e-situation': { x: 0, y: 0 },
      'e-feeling': { x: 300, y: 0 },
      'e-event': { x: 0, y: 300 },
      'e-med': { x: 300, y: 300 },
    };
    const { cy, events } = await render({ positions });
    const event = cy().$('#e-event') as unknown as NodeSingular;
    event.emit('grab');
    event.position({ x: 302, y: 2 });
    event.emit('drag');
    expect(cy().$('#e-feeling').hasClass('link-target')).toBe(true);
    event.emit('dragfree');
    expect(events.drops).toEqual([{ sourceId: 'e-event', targetId: 'e-feeling' }]);
    expect(event.position()).toEqual({ x: 0, y: 300 });
    expect(cy().$('#e-feeling').hasClass('link-target')).toBe(false);

    event.emit('grab');
    event.position({ x: 150, y: 150 });
    event.emit('dragfree');
    expect(events.drops).toHaveLength(1);
    expect(events.positions.at(-1)).toEqual({
      key: 'e-situation',
      positions: { 'e-event': { x: 150, y: 150 } },
    });
  });

  it('mise à jour sans layout : nouveaux nœuds placés près de leurs voisins, les autres immobiles', async () => {
    const positions = {
      'e-situation': { x: 0, y: 0 },
      'e-feeling': { x: 300, y: 0 },
      'e-event': { x: 0, y: 300 },
      'e-med': { x: 300, y: 300 },
      'sn:e-situation:feeling': { x: -100, y: 0 },
    };
    const withGroup = graphView({ superNodes: [superNode()] });
    const { fixture, cy } = await render({ view: withGroup, positions });
    expect(cy().$('#sn\\:e-situation\\:feeling').nonempty()).toBe(true);
    const layout = vi.spyOn(cy(), 'layout');
    const merged = {
      ...withGroup,
      nodes: [...withGroup.nodes, ...expansion().nodes],
      edges: [...withGroup.edges, ...expansion().edges],
      superNodes: [],
    };
    fixture.componentRef.setInput('view', merged);
    await settle(fixture);
    expect(layout).not.toHaveBeenCalled();
    expect(cy().nodes()).toHaveLength(7);
    expect(cy().$('#e-med').position()).toEqual({ x: 300, y: 300 });
    const f1 = cy().$('#e-f1').position();
    expect(Math.hypot(f1.x, f1.y)).toBeLessThan(150);
  });

  it('autre racine pendant un layout : il est arrêté, ses positions ne sont rangées nulle part', async () => {
    // Layout animé (headless : il ne finit jamais seul) puis nouvelle racine.
    const stops: ReturnType<typeof vi.fn>[] = [];
    const { fixture, events, probe } = await render({
      reducedMotion: false,
      onCreate: (cy) => {
        const original = cy.layout.bind(cy);
        cy.layout = ((options: Parameters<Core['layout']>[0]) => {
          const layout = original(options);
          const stop = vi.fn(layout.stop.bind(layout));
          layout.stop = stop as unknown as typeof layout.stop;
          stops.push(stop);
          return layout;
        }) as Core['layout'];
      },
    });
    expect(probe.busy()).toBe(true);
    expect(stops).toHaveLength(1);
    fixture.componentRef.setInput('layoutKey', 'e-med');
    fixture.componentRef.setInput('root', 'e-med');
    await settle(fixture);
    expect(stops[0]).toHaveBeenCalled();
    expect(stops).toHaveLength(2);
    // Aucune position du premier layout n'a été rangée, ni sous l'ancienne clé ni sous la nouvelle.
    expect(events.positions).toEqual([]);
  });

  it('changement de thème : les tokens sont relus', async () => {
    const { host, cy } = await render();
    const before = cy().$('#e-event').style('border-color');
    paint(host, 'blue');
    TestBed.inject(ThemeService).set('dark');
    await settle({ whenStable: () => Promise.resolve() });
    expect(cy().$('#e-event').style('border-color')).not.toBe(before);
  });

  it('moteur introuvable : état erreur à la place du canevas', async () => {
    TestBed.configureTestingModule({
      providers: [{ provide: GRAPH_RENDERER, useValue: () => Promise.reject(new Error('réseau')) }],
    });
    const fixture = TestBed.createComponent(GraphCanvasComponent);
    fixture.componentRef.setInput('view', graphView());
    fixture.componentRef.setInput('layoutKey', '*');
    fixture.componentRef.setInput('labels', labels);
    await settle(fixture);
    const state = (fixture.nativeElement as HTMLElement).querySelector('pm-state [role="alert"]');
    expect(state?.textContent).toContain("Impossible d'afficher le graphe");
  });
});
