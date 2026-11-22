import { TestBed } from '@angular/core/testing';

import { edge, graphView, node, superNode } from '../data/graph.fixtures';
import { GraphView, GraphViewport, GraphViewportChange, LinkDrop } from '../data/graph.model';
import { GraphCanvasComponent, GraphProbe } from './graph-canvas.component';
import { GRAPH_LAYOUT_ENGINE } from './graph-layout';
import { provideTestLayout } from './graph-layout.fixtures';
import { GraphCanvasLabels } from './graph-scene';

const labels: GraphCanvasLabels = {
  name: (n) => n.title ?? n.id,
  date: () => '1 mars',
  type: (type) => type,
  group: (group) => `${group.count} regroupés`,
  link: (code) => code,
  column: (column) => `colonne:${column}`,
  month: (key) => `mois:${key}`,
  proposed: 'suggéré',
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
type Host = HTMLElement & { pmGraphProbe?: GraphProbe };

async function render(options: { view?: GraphView; viewport?: GraphViewport | null } = {}) {
  TestBed.configureTestingModule({ providers: [provideTestLayout()] });
  const fixture = TestBed.createComponent(GraphCanvasComponent);
  const host = fixture.nativeElement as Host;
  fixture.componentRef.setInput('view', options.view ?? graphView());
  fixture.componentRef.setInput('root', 'e-situation');
  fixture.componentRef.setInput('layoutKey', 'e-situation');
  fixture.componentRef.setInput('labels', labels);
  fixture.componentRef.setInput('viewport', options.viewport ?? null);
  fixture.componentRef.setInput('label', 'Graphe des liens : 4 nœuds, 3 liens.');
  const events = {
    selected: [] as (string | null)[],
    activated: [] as string[],
    drops: [] as LinkDrop[],
    viewports: [] as GraphViewportChange[],
  };
  const component = fixture.componentInstance;
  component.nodeSelected.subscribe((id) => events.selected.push(id));
  component.nodeActivated.subscribe((id) => events.activated.push(id));
  component.linkDropped.subscribe((drop) => events.drops.push(drop));
  component.viewportChanged.subscribe((v) => events.viewports.push(v));
  await settle(fixture);
  const card = (id: string) => host.querySelector<HTMLElement>(`[data-node-id="${id}"]`)!;
  const zone = host.querySelector<HTMLElement>('.viewport')!;
  return { fixture, host, events, card, zone };
}

async function settle(fixture: { whenStable(): Promise<unknown> }): Promise<void> {
  for (let i = 0; i < 8; i++) {
    await tick();
    TestBed.tick();
    await fixture.whenStable();
  }
}

/** jsdom ne sait pas ce qui est sous le pointeur : le test le dit. */
function under(element: Element | null): void {
  (document as { elementFromPoint?: unknown }).elementFromPoint = () => element;
}

const pointer = (type: string, x: number, y: number) =>
  new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y });

describe('GraphCanvasComponent', () => {
  // La sonde des e2e n'est posée que sur demande (page.addInitScript dans e2e/flux-6-graphe).
  beforeEach(() => ((globalThis as { pmE2E?: boolean }).pmE2E = true));
  afterEach(() => {
    delete (document as { elementFromPoint?: unknown }).elementFromPoint;
    delete (globalThis as { pmE2E?: boolean }).pmE2E;
  });

  it('sonde des e2e : absente sans pmE2E, retirée à la destruction', async () => {
    const { fixture, host } = await render();
    expect(host.pmGraphProbe).toBeDefined();
    fixture.destroy();
    expect(host.pmGraphProbe).toBeUndefined();

    TestBed.resetTestingModule();
    delete (globalThis as { pmE2E?: boolean }).pmE2E;
    const silent = await render();
    expect(silent.host.pmGraphProbe).toBeUndefined();
  });

  it('dessine une carte par entrée et un trait par lien, sonde des e2e, nom accessible', async () => {
    const { host, card, zone } = await render();
    const probe = host.pmGraphProbe!;
    expect(probe.nodeIds()).toEqual(['e-situation', 'e-feeling', 'e-event', 'e-med']);
    expect(host.querySelectorAll('.link')).toHaveLength(3);
    expect(card('e-situation').classList.contains('root')).toBe(true);
    expect(card('e-event').textContent).toContain("Entretien d'évaluation");
    expect(card('e-event').textContent).toContain('event · 1 mars');
    expect(card('e-feeling').querySelector('pm-graph-glyph .value')?.textContent).toBe('8');
    expect(probe.point('e-event')).not.toBeNull();
    expect(probe.point('absent')).toBeNull();
    expect(probe.layoutMs()).not.toBeNull();
    expect(probe.busy()).toBe(false);
    expect(zone.getAttribute('role')).toBe('group');
    expect(zone.getAttribute('aria-label')).toBe('Graphe des liens : 4 nœuds, 3 liens.');
    // « traite » : la flèche est au départ du tracé, vers ce qui est traité.
    expect(host.querySelectorAll('.arrow[marker-start]')).toHaveLength(1);
    expect(host.querySelectorAll('.arrow[marker-end]')).toHaveLength(2);
  });

  it('clic : sélection ; double-clic : activation ; clic sur le fond : plus de sélection', async () => {
    const { events, card, zone } = await render();
    card('e-event').click();
    card('e-event').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(events.selected).toEqual(['e-event']);
    expect(events.activated).toEqual(['e-event']);
    zone.dispatchEvent(pointer('pointerdown', 5, 5));
    zone.dispatchEvent(pointer('pointerup', 5, 5));
    expect(events.selected).toEqual(['e-event', null]);
  });

  it('sélection venue de la page : le fil s’allume, le reste s’efface', async () => {
    const view = graphView({
      nodes: [...graphView().nodes, node({ id: 'e-other', title: 'Ailleurs' })],
      edges: [
        ...graphView().edges,
        edge({ id: 'l-9', source: 'e-event', target: 'e-other', linkType: 'triggers' }),
      ],
    });
    const { fixture, host, card } = await render({ view });
    fixture.componentRef.setInput('selectedId', 'e-feeling');
    await settle(fixture);
    expect(card('e-feeling').classList.contains('selected')).toBe(true);
    expect(card('e-feeling').getAttribute('aria-pressed')).toBe('true');
    expect(card('e-situation').classList.contains('thread')).toBe(true);
    expect(card('e-other').classList.contains('dim')).toBe(true);
    expect(host.querySelectorAll('.link.thread')).toHaveLength(3);
    expect(host.querySelectorAll('.link.dim')).toHaveLength(1);
  });

  it('glisser une carte sur une autre : lien à poser, la carte revient à sa place', async () => {
    const { fixture, events, card, zone } = await render();
    const start = card('e-event').style.transform;
    under(card('e-med'));
    card('e-event').dispatchEvent(pointer('pointerdown', 10, 10));
    zone.dispatchEvent(pointer('pointermove', 60, 40));
    await settle(fixture);
    expect(card('e-event').classList.contains('dragging')).toBe(true);
    expect(card('e-event').style.transform).not.toBe(start);
    expect(card('e-med').classList.contains('drop-target')).toBe(true);
    zone.dispatchEvent(pointer('pointerup', 60, 40));
    // Le clic qui suit un glisser n'est pas une sélection.
    card('e-event').click();
    await settle(fixture);
    expect(events.drops).toEqual([{ sourceId: 'e-event', targetId: 'e-med' }]);
    expect(events.selected).toEqual([]);
    expect(card('e-event').style.transform).toBe(start);
    expect(card('e-event').classList.contains('dragging')).toBe(false);
  });

  it('glisser : lâché ailleurs, aucun lien ; un super-nœud ne se glisse pas et n’est pas une cible', async () => {
    const { fixture, events, card, zone } = await render({
      view: graphView({ superNodes: [superNode()] }),
    });
    const group = card('sn:e-situation:feeling');
    under(group);
    card('e-event').dispatchEvent(pointer('pointerdown', 10, 10));
    zone.dispatchEvent(pointer('pointermove', 80, 80));
    zone.dispatchEvent(pointer('pointerup', 80, 80));
    group.dispatchEvent(pointer('pointerdown', 10, 10));
    zone.dispatchEvent(pointer('pointermove', 80, 80));
    await settle(fixture);
    expect(group.classList.contains('dragging')).toBe(false);
    zone.dispatchEvent(pointer('pointerup', 80, 80));
    expect(events.drops).toEqual([]);
  });

  it('zoom : les boutons zooment et rangent la vue tout de suite ; glisser le fond la déplace', async () => {
    const { fixture, host, events, zone } = await render();
    const before = host.pmGraphProbe!.zoom();
    events.viewports.length = 0;
    host.querySelector<HTMLButtonElement>('button[aria-label="Zoom avant"]')!.click();
    expect(host.pmGraphProbe!.zoom()).toBeCloseTo(before * 1.25);
    expect(events.viewports).toHaveLength(1);
    expect(events.viewports[0]).toMatchObject({
      key: 'e-situation',
      viewport: { zoom: before * 1.25 },
    });
    const pan = events.viewports[0].viewport.pan;
    zone.dispatchEvent(pointer('pointerdown', 5, 5));
    zone.dispatchEvent(pointer('pointermove', 45, 25));
    zone.dispatchEvent(pointer('pointerup', 45, 25));
    await new Promise((resolve) => setTimeout(resolve, 200));
    await settle(fixture);
    expect(events.viewports.at(-1)?.viewport.pan).toEqual({ x: pan.x + 40, y: pan.y + 20 });
    // Un déplacement de la vue n'est pas un clic sur le fond.
    expect(events.selected).toEqual([]);
  });

  it('vue rangée pour la racine : reprise telle quelle', async () => {
    const { host, events } = await render({ viewport: { zoom: 1.8, pan: { x: -30, y: 12 } } });
    expect(host.pmGraphProbe!.zoom()).toBe(1.8);
    expect(host.querySelector<HTMLElement>('.world')!.style.transform).toBe(
      'translate(-30px, 12px) scale(1.8)',
    );
    expect(events.viewports.at(-1)).toEqual({
      key: 'e-situation',
      viewport: { zoom: 1.8, pan: { x: -30, y: 12 } },
    });
  });

  it('graphe relu : les cartes suivent ; « Recentrer » ajuste la vue', async () => {
    const { fixture, host } = await render({ viewport: { zoom: 1.8, pan: { x: -30, y: 12 } } });
    fixture.componentRef.setInput(
      'view',
      graphView({
        edges: [
          ...graphView().edges,
          edge({ id: 'l-9', source: 'e-event', target: 'e-med', linkType: 'triggers' }),
        ],
      }),
    );
    await settle(fixture);
    expect(host.querySelectorAll('.link')).toHaveLength(4);
    // Mêmes cartes : la vue de l'utilisateur n'a pas bougé.
    expect(host.pmGraphProbe!.zoom()).toBe(1.8);
    fixture.componentRef.setInput('relayout', 1);
    await settle(fixture);
    expect(host.pmGraphProbe!.zoom()).not.toBe(1.8);
  });

  it('lecture par type, puis de haut en bas : colonnes titrées, puis rangées', async () => {
    const { fixture, host, card } = await render();
    expect(host.querySelectorAll('.band')).toHaveLength(0);
    const before = card('e-med').style.transform;
    fixture.componentRef.setInput('reading', 'type');
    await settle(fixture);
    expect([...host.querySelectorAll('.band-label')].map((el) => el.textContent)).toEqual([
      'colonne:events',
      'colonne:situations',
      'colonne:feelings',
      'colonne:responses',
    ]);
    expect(host.querySelectorAll('.band')).toHaveLength(4);
    expect(host.querySelector('.band-label')!.classList.contains('beside')).toBe(false);
    fixture.componentRef.setInput('direction', 'down');
    await settle(fixture);
    expect(host.querySelector('.band-label')!.classList.contains('beside')).toBe(true);
    expect(card('e-med').style.transform).not.toBe(before);
  });

  it('moteur de disposition indisponible : état erreur', async () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: GRAPH_LAYOUT_ENGINE, useValue: () => Promise.reject(new Error('réseau')) },
      ],
    });
    const fixture = TestBed.createComponent(GraphCanvasComponent);
    fixture.componentRef.setInput('view', graphView());
    fixture.componentRef.setInput('layoutKey', 'e-situation');
    fixture.componentRef.setInput('labels', labels);
    await settle(fixture);
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('pm-state')?.textContent).toContain(
      "Impossible d'afficher le graphe",
    );
    expect(host.querySelectorAll('[data-node-id]')).toHaveLength(0);
  });
});
