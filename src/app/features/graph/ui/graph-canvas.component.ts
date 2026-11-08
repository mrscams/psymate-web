import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  InjectionToken,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import type { Core, CytoscapeOptions, EventObject, Layouts, NodeSingular } from 'cytoscape';

import { ThemeService } from '../../../core/theme';
import { StateComponent } from '../../../shared/ui';
import {
  GraphPositions,
  GraphPositionsChange,
  GraphView,
  GraphViewport,
  GraphViewportChange,
  isSuperNodeId,
  LinkDrop,
  Point,
} from '../data/graph.model';
import { LinkLineStyle, LinkTypeCode } from '../data/link.model';
import { GraphElement, GraphElementLabels, graphElements } from './graph-elements';
import { graphStylesheet, readGraphTokens } from './graph-style';

/** Le moteur de rendu : Cytoscape et son layout, chargés à la demande (hors du bundle initial). */
export interface GraphRenderer {
  create(options: CytoscapeOptions): Core;
  /** Nom du layout (cose-bilkent ; un layout simple en test). */
  layout: string;
}

let bilkentRegistered = false;

/**
 * Import dynamique de cytoscape et cytoscape-cose-bilkent (handbook §11 : Cytoscape en @defer) : ils
 * vivent dans leur propre morceau, chargé quand le canevas s'affiche.
 */
export async function loadCytoscape(): Promise<GraphRenderer> {
  const [core, bilkent] = await Promise.all([
    import('cytoscape'),
    import('cytoscape-cose-bilkent'),
  ]);
  const cytoscape = core.default;
  if (!bilkentRegistered) {
    cytoscape.use(bilkent.default);
    bilkentRegistered = true;
  }
  return { create: (options) => cytoscape(options), layout: 'cose-bilkent' };
}

/** Chargeur du moteur de rendu ; les tests fournissent Cytoscape sans canevas (headless). */
export const GRAPH_RENDERER = new InjectionToken<() => Promise<GraphRenderer>>('GRAPH_RENDERER', {
  providedIn: 'root',
  factory: () => loadCytoscape,
});

/**
 * Sonde des e2e (Playwright pilote un canevas, pas un DOM) : position à l'écran d'un nœud et durée
 * du dernier layout. Posée sur l'élément hôte (`pmGraphProbe`) seulement si les e2e l'ont demandée
 * (`globalThis.pmE2E === true`, posé par page.addInitScript), retirée à la destruction ; elle ne
 * donne que ce qui est déjà dessiné à l'écran.
 */
export interface GraphProbe {
  /** Centre du nœud en coordonnées de la fenêtre ; null s'il n'est pas dessiné. */
  point(id: string): Point | null;
  zoom(): number;
  /** Durée du dernier layout (ms, de son lancement à layoutstop, animation comprise). */
  layoutMs(): number | null;
  /** Identifiants des nœuds dessinés. */
  nodeIds(): string[];
  /** Un layout est en cours (positions pas encore définitives). */
  busy(): boolean;
}

const ANIMATION_MS = 400;
const VIEWPORT_DEBOUNCE_MS = 150;
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/**
 * Canevas Cytoscape du graphe (fiche 04, B4 écran 4) : formes et couleurs par type depuis les
 * tokens (relus au changement de thème), trait par type de lien. Clic : sélection ; double-clic :
 * activation (timeline, ou dépliage d'un super-nœud) ; glisser un nœud sur un autre : lien à poser,
 * le nœud revient à sa place. Layout cose-bilkent au premier affichage d'une racine (sans animation
 * si prefers-reduced-motion), puis stable : les positions et le zoom remontent à la page, qui les
 * range par racine, et sont repris tels quels. Le canevas n'est pas lisible par un lecteur d'écran :
 * la page offre la liste équivalente des liens.
 */
@Component({
  selector: 'pm-graph-canvas',
  imports: [StateComponent],
  template: `
    <div #container class="canvas" role="img" [attr.aria-label]="label()"></div>
    @if (failed()) {
      <pm-state kind="error" [title]="failedTitle" class="failed" />
    }
    <div class="zoom" role="group" [attr.aria-label]="zoomGroupLabel">
      <button
        type="button"
        class="zoom-button"
        [attr.aria-label]="zoomInLabel"
        (click)="zoomBy(1.25)"
      >
        <span aria-hidden="true">+</span>
      </button>
      <button
        type="button"
        class="zoom-button"
        [attr.aria-label]="zoomOutLabel"
        (click)="zoomBy(0.8)"
      >
        <span aria-hidden="true">−</span>
      </button>
    </div>
  `,
  styleUrl: './graph-canvas.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GraphCanvasComponent {
  readonly view = input.required<GraphView>();
  readonly root = input<string | null>(null);
  readonly selectedId = input<string | null>(null);
  /** Racine des positions : une autre clé repart d'un layout (ou des positions rangées). */
  readonly layoutKey = input.required<string>();
  /** Positions rangées pour cette racine (lues à la construction seulement). */
  readonly positions = input<GraphPositions | null>(null);
  /** Zoom et position rangés pour cette racine (lus à la construction seulement). */
  readonly viewport = input<GraphViewport | null>(null);
  readonly lineStyles = input<Partial<Record<LinkTypeCode, LinkLineStyle>>>({});
  readonly labels = input.required<GraphElementLabels>();
  /** Incrémenté par « Recentrer » : le layout repart. */
  readonly relayout = input(0);
  /** Nom accessible du canevas (résumé : nœuds, liens, liste équivalente). */
  readonly label = input('');

  readonly nodeSelected = output<string | null>();
  readonly nodeActivated = output<string>();
  readonly linkDropped = output<LinkDrop>();
  /** Zoom et position, avec la racine du graphe dessiné. */
  readonly viewportChanged = output<GraphViewportChange>();
  /** Positions, avec la racine du layout qui les a produites (jamais rangées sous une autre). */
  readonly positionsChanged = output<GraphPositionsChange>();

  protected readonly failed = signal(false);
  protected readonly failedTitle = $localize`:Le moteur du graphe ne s'est pas chargé@@graph.canvas.failed:Impossible d'afficher le graphe`;
  protected readonly zoomGroupLabel = $localize`:Groupe des boutons de zoom du graphe@@graph.zoom.group:Zoom du graphe`;
  protected readonly zoomInLabel = $localize`:Bouton de zoom avant du graphe@@graph.zoom.in:Zoom avant`;
  protected readonly zoomOutLabel = $localize`:Bouton de zoom arrière du graphe@@graph.zoom.out:Zoom arrière`;

  private readonly container = viewChild.required<ElementRef<HTMLElement>>('container');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly theme = inject(ThemeService);
  private readonly loadRenderer = inject(GRAPH_RENDERER);

  private readonly ready = signal(false);
  private cy: Core | null = null;
  private renderer: GraphRenderer | null = null;
  private builtKey: string | null = null;
  private builtRelayout = 0;
  private lastLayoutMs: number | null = null;
  private layoutRunning = false;
  private dragStart: Point | null = null;
  private dropTarget: NodeSingular | null = null;
  private viewportTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private resizeObserver: ResizeObserver | null = null;
  /** Layout en cours (arrêté avant une reconstruction et à la destruction). */
  private running: { layout: Layouts; cancelled: boolean } | null = null;

  constructor() {
    afterNextRender(() => void this.start());

    // Données, racine, styles de trait, « Recentrer » : le canevas suit.
    effect(() => {
      if (!this.ready()) return;
      const view = this.view();
      const key = this.layoutKey();
      const relayout = this.relayout();
      const root = this.root();
      const lineStyles = this.lineStyles();
      const labels = this.labels();
      untracked(() => this.sync(view, key, relayout, root, lineStyles, labels));
    });

    // Sélection venue de la page (liste équivalente, panneau).
    effect(() => {
      if (!this.ready()) return;
      const id = this.selectedId();
      untracked(() => this.syncSelection(id));
    });

    // Changement de thème (data-theme sur <html>) : les tokens sont relus.
    effect(() => {
      this.theme.resolved();
      if (!this.ready()) return;
      untracked(() => this.cy?.style(graphStylesheet(this.tokens())));
    });

    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      if (this.viewportTimer) clearTimeout(this.viewportTimer);
      this.resizeObserver?.disconnect();
      this.stopLayout();
      delete (this.host.nativeElement as { pmGraphProbe?: GraphProbe }).pmGraphProbe;
      this.cy?.destroy();
      this.cy = null;
    });
  }

  /** Zoom +/− autour du centre du canevas. */
  protected zoomBy(factor: number): void {
    const cy = this.cy;
    if (!cy) return;
    const level = cy.zoom() * factor;
    cy.zoom({ level, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
    // Un bouton est un geste fini : rangé tout de suite (pas d'attente du délai des gestes continus).
    this.emitViewport(cy);
  }

  private async start(): Promise<void> {
    try {
      this.renderer = await this.loadRenderer();
    } catch {
      this.failed.set(true);
      return;
    }
    if (this.destroyed) return;
    const cy = this.renderer.create({
      container: this.container().nativeElement,
      style: graphStylesheet(this.tokens()),
      elements: [],
      minZoom: 0.15,
      maxZoom: 3,
      boxSelectionEnabled: false,
      selectionType: 'single',
    });
    this.cy = cy;
    this.listen(cy);
    this.exposeProbe(cy);
    this.watchSize(cy);
    this.ready.set(true);
  }

  /** Le panneau de détail réduit la zone du graphe : Cytoscape reprend la taille de son conteneur. */
  private watchSize(cy: Core): void {
    if (typeof ResizeObserver !== 'function') return;
    const observer = new ResizeObserver(() => cy.resize());
    observer.observe(this.container().nativeElement);
    this.resizeObserver = observer;
  }

  private tokens() {
    const style = getComputedStyle(this.host.nativeElement);
    return readGraphTokens((name) => style.getPropertyValue(name));
  }

  private listen(cy: Core): void {
    cy.on('tap', (event: EventObject) => {
      if (event.target === cy) this.nodeSelected.emit(null);
      else if (event.target.isNode?.()) this.nodeSelected.emit(event.target.id());
    });
    cy.on('dbltap', 'node', (event: EventObject) => this.nodeActivated.emit(event.target.id()));
    cy.on('grab', 'node', (event: EventObject) => {
      const position = event.target.position();
      this.dragStart = { x: position.x, y: position.y };
    });
    cy.on('drag', 'node', (event: EventObject) => this.trackDrop(cy, event.target));
    cy.on('dragfree', 'node', (event: EventObject) => this.drop(cy, event.target));
    cy.on('viewport', () => this.viewportMoved(cy));
  }

  /** Pendant le glisser : la cible sous le nœud est mise en évidence. */
  private trackDrop(cy: Core, dragged: NodeSingular): void {
    const target = this.nodeUnder(cy, dragged);
    if (target === this.dropTarget) return;
    this.dropTarget?.removeClass('link-target');
    this.dropTarget = target;
    target?.addClass('link-target');
  }

  /** Lâcher sur un autre nœud : lien à poser, le nœud revient ; ailleurs : il reste où on l'a mis. */
  private drop(cy: Core, dragged: NodeSingular): void {
    const target = this.nodeUnder(cy, dragged);
    this.dropTarget?.removeClass('link-target');
    this.dropTarget = null;
    const start = this.dragStart;
    this.dragStart = null;
    if (target && start) {
      dragged.position(start);
      this.linkDropped.emit({ sourceId: dragged.id(), targetId: target.id() });
      return;
    }
    if (!this.builtKey) return;
    this.positionsChanged.emit({
      key: this.builtKey,
      positions: { [dragged.id()]: { ...dragged.position() } },
    });
  }

  /** L'entrée (pas un super-nœud) dont la boîte contient le centre du nœud glissé. */
  private nodeUnder(cy: Core, dragged: NodeSingular): NodeSingular | null {
    if (isSuperNodeId(dragged.id())) return null;
    const { x, y } = dragged.position();
    const found = cy.nodes().filter((node) => {
      if (node.same(dragged) || isSuperNodeId(node.id())) return false;
      const box = node.boundingBox({ includeLabels: false });
      return x >= box.x1 && x <= box.x2 && y >= box.y1 && y <= box.y2;
    });
    return found.length ? found[0] : null;
  }

  private viewportMoved(cy: Core): void {
    if (this.viewportTimer) clearTimeout(this.viewportTimer);
    this.viewportTimer = setTimeout(() => this.emitViewport(cy), VIEWPORT_DEBOUNCE_MS);
  }

  private emitViewport(cy: Core): void {
    if (this.viewportTimer) clearTimeout(this.viewportTimer);
    this.viewportTimer = null;
    if (!this.cy || !this.builtKey) return;
    this.emitViewportFor(cy, this.builtKey);
  }

  private emitViewportFor(cy: Core, key: string): void {
    const pan = cy.pan();
    this.viewportChanged.emit({ key, viewport: { zoom: cy.zoom(), pan: { x: pan.x, y: pan.y } } });
  }

  /** Arrête le layout en cours : ses positions (partielles) ne seront pas rangées. */
  private stopLayout(): void {
    const running = this.running;
    if (!running) return;
    this.running = null;
    running.cancelled = true;
    running.layout.stop();
    this.layoutRunning = false;
  }

  private sync(
    view: GraphView,
    key: string,
    relayout: number,
    root: string | null,
    lineStyles: Partial<Record<LinkTypeCode, LinkLineStyle>>,
    labels: GraphElementLabels,
  ): void {
    const cy = this.cy;
    if (!cy) return;
    const elements = graphElements(view, root, lineStyles, labels);
    const rebuild = this.builtKey !== key || this.builtRelayout !== relayout;
    const forceLayout = this.builtRelayout !== relayout;
    this.builtKey = key;
    this.builtRelayout = relayout;
    if (rebuild) {
      this.stopLayout();
      cy.elements().remove();
      cy.add(elements);
      this.place(cy, forceLayout ? null : untracked(() => this.positions()), forceLayout);
    } else {
      this.patch(cy, elements);
    }
    this.syncSelection(untracked(() => this.selectedId()));
  }

  /** Mise à jour sans layout : on retire, on ajoute près d'un voisin, on met à jour le reste. */
  private patch(cy: Core, elements: GraphElement[]): void {
    const wanted = new Map(elements.map((element) => [element.data.id, element]));
    cy.batch(() => {
      cy.elements().forEach((element) => {
        if (!wanted.has(element.id())) element.remove();
      });
      const added: string[] = [];
      for (const element of elements) {
        const existing = cy.getElementById(element.data.id);
        if (existing.nonempty()) {
          existing.data(element.data);
          existing.classes(element.classes);
          continue;
        }
        if (element.group === 'nodes') added.push(element.data.id);
      }
      cy.add(elements.filter((element) => cy.getElementById(element.data.id).empty()));
      const remembered = untracked(() => this.positions()) ?? {};
      const pending = new Set(added.filter((id) => !remembered[id]));
      added.forEach((id, index) => {
        const node = cy.getElementById(id) as NodeSingular;
        node.position(remembered[id] ?? this.besideNeighbours(cy, node, index, pending));
        pending.delete(id);
      });
      const key = this.builtKey;
      if (added.length && key) {
        const placed: GraphPositions = {};
        for (const id of added) placed[id] = { ...cy.getElementById(id).position() };
        queueMicrotask(() => {
          if (this.cy) this.positionsChanged.emit({ key, positions: placed });
        });
      }
    });
  }

  /** Position d'un nouveau nœud : près de ses voisins déjà placés, en spirale. */
  private besideNeighbours(
    cy: Core,
    node: NodeSingular,
    index: number,
    pending: ReadonlySet<string>,
  ): Point {
    // Spirale de tournesol : les nœuds ajoutés (un groupe déplié) s'écartent sans se chevaucher.
    const angle = index * 2.39996;
    const radius = 70 + 30 * Math.sqrt(index);
    let x = 0;
    let y = 0;
    let count = 0;
    node
      .neighborhood()
      .nodes()
      .forEach((other: NodeSingular) => {
        if (other.same(node) || pending.has(other.id())) return;
        x += other.position().x;
        y += other.position().y;
        count++;
      });
    if (count) {
      return { x: x / count + radius * Math.cos(angle), y: y / count + radius * Math.sin(angle) };
    }
    const extent = cy.extent();
    return {
      x: (extent.x1 + extent.x2) / 2 + radius * Math.cos(angle),
      y: (extent.y1 + extent.y2) / 2 + radius * Math.sin(angle),
    };
  }

  /**
   * Premier affichage d'une racine : positions rangées s'il y en a pour tous les nœuds (et zoom
   * rangé), sinon layout cose-bilkent, animé seulement sans prefers-reduced-motion.
   */
  private place(cy: Core, positions: GraphPositions | null, forceLayout: boolean): void {
    const nodes = cy.nodes();
    const ids = nodes.map((node: NodeSingular) => node.id());
    if (positions && !forceLayout && ids.every((id) => !!positions[id])) {
      nodes.forEach((node: NodeSingular) => {
        node.position(positions[node.id()]);
      });
      const viewport = untracked(() => this.viewport());
      if (viewport) cy.viewport({ zoom: viewport.zoom, pan: viewport.pan });
      else cy.fit(undefined, 40);
      return;
    }
    if (!nodes.length) return;
    const animate = !this.reducedMotion();
    const started = performance.now();
    // La racine du layout, capturée au lancement : ses positions ne vont qu'à elle.
    const key = this.builtKey ?? '';
    const layout = cy.layout({
      name: this.renderer?.layout ?? 'grid',
      animate: animate ? 'end' : false,
      animationDuration: ANIMATION_MS,
      fit: true,
      padding: 40,
      randomize: true,
      nodeDimensionsIncludeLabels: true,
      idealEdgeLength: 90,
      nodeRepulsion: 6500,
    } as unknown as Parameters<Core['layout']>[0]);
    const running = { layout, cancelled: false };
    this.running = running;
    this.layoutRunning = true;
    layout.one('layoutstop', () => {
      if (running.cancelled || !this.cy) return;
      this.running = null;
      this.layoutRunning = false;
      this.lastLayoutMs = Math.round(performance.now() - started);
      const placed: GraphPositions = {};
      cy.nodes().forEach((node) => {
        placed[node.id()] = { ...node.position() };
      });
      this.positionsChanged.emit({ key, positions: placed });
      this.emitViewportFor(cy, key);
    });
    layout.run();
  }

  private syncSelection(id: string | null): void {
    const cy = this.cy;
    if (!cy) return;
    cy.batch(() => {
      cy.$(':selected').unselect();
      if (id) cy.getElementById(id).select();
    });
  }

  private reducedMotion(): boolean {
    return typeof matchMedia === 'function' && matchMedia(REDUCED_MOTION).matches;
  }

  private exposeProbe(cy: Core): void {
    if ((globalThis as { pmE2E?: unknown }).pmE2E !== true) return;
    const container = this.container().nativeElement;
    const probe: GraphProbe = {
      point: (id) => {
        const node = cy.getElementById(id);
        if (node.empty()) return null;
        const rect = container.getBoundingClientRect();
        const rendered = node.renderedPosition();
        return { x: rect.left + rendered.x, y: rect.top + rendered.y };
      },
      zoom: () => cy.zoom(),
      layoutMs: () => this.lastLayoutMs,
      nodeIds: () => cy.nodes().map((node) => node.id()),
      busy: () => this.layoutRunning,
    };
    Object.defineProperty(this.host.nativeElement, 'pmGraphProbe', {
      value: probe,
      configurable: true,
    });
  }
}
