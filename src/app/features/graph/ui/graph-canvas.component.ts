import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  LOCALE_ID,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';

import { textDirection } from '../../../core/i18n';
import { StateComponent } from '../../../shared/ui';
import {
  DEFAULT_DIRECTION,
  DEFAULT_READING,
  GraphDirection,
  GraphReading,
  GraphView,
  GraphViewport,
  GraphViewportChange,
  isSuperNodeId,
  LinkDrop,
  Point,
} from '../data/graph.model';
import { LinkLineStyle, LinkTypeCode } from '../data/link.model';
import { GraphGlyphComponent } from './graph-glyph.component';
import {
  GRAPH_LAYOUT_ENGINE,
  GraphLayout,
  layoutGraph,
  LayoutEngine,
  LayoutOptions,
} from './graph-layout';
import {
  BandView,
  buildScene,
  CardView,
  GraphCanvasLabels,
  GraphScene,
  LinkView,
} from './graph-scene';

/**
 * Sonde des e2e : position à l'écran d'une carte et durée de la dernière disposition. Posée sur
 * l'élément hôte (`pmGraphProbe`) seulement si les e2e l'ont demandée (`globalThis.pmE2E === true`,
 * posé par page.addInitScript), retirée à la destruction ; elle ne donne que ce qui est déjà dessiné
 * à l'écran.
 */
export interface GraphProbe {
  /** Centre de la carte en coordonnées de la fenêtre ; null si elle n'est pas dessinée. */
  point(id: string): Point | null;
  zoom(): number;
  /** Durée de la dernière disposition (ms). */
  layoutMs(): number | null;
  /** Identifiants des cartes dessinées. */
  nodeIds(): string[];
  /** Une disposition est en cours (positions pas encore définitives). */
  busy(): boolean;
}

interface Transform {
  x: number;
  y: number;
  k: number;
}

/** Geste en cours : sur une carte (id) ou sur le fond (null). */
interface Press {
  id: string | null;
  x: number;
  y: number;
  origin: Point;
  moved: boolean;
}

/** Carte glissée : son décalage (dans le repère du graphe) et la carte sous le pointeur. */
interface Drag {
  id: string;
  dx: number;
  dy: number;
  target: string | null;
}

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3;
/** Le graphe ajusté à la zone n'est pas grossi au-delà (cartes à peu près à leur taille). */
const MAX_FIT_ZOOM = 1.15;
const FIT_PADDING = 40;
const DRAG_THRESHOLD = 5;
const ANIMATION_MS = 380;
const VIEWPORT_DEBOUNCE_MS = 150;

const ARROW = 'pm-graph-arrow';
const ARROW_THREAD = 'pm-graph-arrow-thread';
const ARROW_PROPOSED = 'pm-graph-arrow-proposed';

/**
 * Canevas du graphe (fiche 04, B4 écran 4) : une carte par entrée (forme du type, titre, date), un
 * trait par lien (style par type de lien, flèche vers la cible), disposés par elkjs de gauche à
 * droite, vers la gauche en arabe (graph-layout.ts, Q75). Clic : sélection, le fil de l'entrée s'allume et le reste s'efface ;
 * double-clic : activation (timeline, ou dépliage d'un super-nœud) ; glisser une carte sur une
 * autre : lien à poser, la carte revient à sa place. Glisser le fond déplace la vue, la molette
 * zoome ; zoom et position remontent à la page, qui les range par racine. Les cartes se cliquent
 * mais restent hors de l'ordre de tabulation (jusqu'à 150 arrêts sinon) : au clavier et au lecteur
 * d'écran, la page offre la liste équivalente des liens, comme avant.
 */
@Component({
  selector: 'pm-graph-canvas',
  imports: [GraphGlyphComponent, StateComponent],
  templateUrl: './graph-canvas.component.html',
  styleUrl: './graph-canvas.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GraphCanvasComponent {
  readonly view = input.required<GraphView>();
  readonly root = input<string | null>(null);
  readonly selectedId = input<string | null>(null);
  /** Racine du graphe dessiné : la vue (zoom, position) est rangée et reprise par racine. */
  readonly layoutKey = input.required<string>();
  /** Zoom et position rangés pour cette racine ; null : le graphe est ajusté à la zone. */
  readonly viewport = input<GraphViewport | null>(null);
  readonly lineStyles = input<Partial<Record<LinkTypeCode, LinkLineStyle>>>({});
  readonly labels = input.required<GraphCanvasLabels>();
  /** Ce qui place les cartes : les liens, la nature des entrées, ou leur mois. */
  readonly reading = input<GraphReading>(DEFAULT_READING);
  /** Nom des liens posé sur les traits (ceux du fil de la sélection restent toujours). */
  readonly linkNames = input(true);
  /** De gauche à droite, ou de haut en bas. */
  readonly direction = input<GraphDirection>(DEFAULT_DIRECTION);
  /** Incrémenté par « Recentrer » : le graphe est ajusté à la zone. */
  readonly relayout = input(0);
  /** Nom accessible du canevas (résumé : nœuds, liens, liste équivalente). */
  readonly label = input('');

  readonly nodeSelected = output<string | null>();
  readonly nodeActivated = output<string>();
  readonly linkDropped = output<LinkDrop>();
  /** Zoom et position, avec la racine du graphe dessiné. */
  readonly viewportChanged = output<GraphViewportChange>();

  protected readonly failed = signal(false);
  protected readonly animated = signal(false);
  /** Une nouvelle disposition vient d'arriver : les cartes glissent vers leur nouvelle place. */
  protected readonly rearranging = signal(false);
  protected readonly panning = signal(false);
  protected readonly drag = signal<Drag | null>(null);
  protected readonly markers = [ARROW, ARROW_THREAD, ARROW_PROPOSED];
  /** Sens de lecture de l'interface (Q74) : le texte des cartes et des titres de colonne le suit. */
  protected readonly textDirection = textDirection(inject(LOCALE_ID));
  protected readonly failedTitle = $localize`:Le moteur du graphe ne s'est pas chargé@@graph.canvas.failed:Impossible d'afficher le graphe`;
  protected readonly zoomGroupLabel = $localize`:Groupe des boutons de zoom du graphe@@graph.zoom.group:Zoom du graphe`;
  protected readonly zoomInLabel = $localize`:Bouton de zoom avant du graphe@@graph.zoom.in:Zoom avant`;
  protected readonly zoomOutLabel = $localize`:Bouton de zoom arrière du graphe@@graph.zoom.out:Zoom arrière`;

  /** Le graphe et sa disposition, toujours ensemble (la disposition est asynchrone). */
  private readonly placed = signal<{ view: GraphView; layout: GraphLayout } | null>(null);
  private readonly transform = signal<Transform>({ x: 0, y: 0, k: 1 });

  protected readonly scene = computed(() => {
    const placed = this.placed();
    if (!placed) return null;
    return buildScene(placed.view, placed.layout, {
      root: this.root(),
      selectedId: this.selectedId(),
      linkNames: this.linkNames(),
      lineStyles: this.lineStyles(),
      labels: this.labels(),
    });
  });

  protected readonly worldTransform = computed(() => {
    const { x, y, k } = this.transform();
    return `translate(${x}px, ${y}px) scale(${k})`;
  });

  private readonly viewportEl = viewChild.required<ElementRef<HTMLElement>>('viewport');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly loadEngine = inject(GRAPH_LAYOUT_ENGINE);

  private engine: Promise<LayoutEngine> | null = null;
  private run = 0;
  private busy = false;
  private builtKey: string | null = null;
  private builtRelayout = 0;
  private builtCount = 0;
  private builtMode = '';
  private lastLayoutMs: number | null = null;
  private press: Press | null = null;
  /** Un glisser vient de finir : le clic qui le suit n'est pas une sélection. */
  private dragJustEnded = false;
  private animationTimer: ReturnType<typeof setTimeout> | null = null;
  private rearrangeTimer: ReturnType<typeof setTimeout> | null = null;
  private viewportTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  constructor() {
    // Données, racine, « Recentrer » : la disposition est recalculée.
    effect(() => {
      const view = this.view();
      const root = this.root();
      const key = this.layoutKey();
      const relayout = this.relayout();
      const reading = this.reading();
      const direction = this.direction();
      const textDirection = this.textDirection;
      untracked(
        () => void this.arrange(view, root, key, relayout, { reading, direction, textDirection }),
      );
    });

    this.exposeProbe();
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => this.keepReadingStart(destroyRef));
    destroyRef.onDestroy(() => {
      this.destroyed = true;
      if (this.animationTimer) clearTimeout(this.animationTimer);
      if (this.rearrangeTimer) clearTimeout(this.rearrangeTimer);
      if (this.viewportTimer) clearTimeout(this.viewportTimer);
      delete (this.host.nativeElement as { pmGraphProbe?: GraphProbe }).pmGraphProbe;
    });
  }

  // ── Disposition ─────────────────────────────────────────────────────────────────────

  private async arrange(
    view: GraphView,
    root: string | null,
    key: string,
    relayout: number,
    options: LayoutOptions,
  ): Promise<void> {
    const run = ++this.run;
    this.busy = true;
    const started = performance.now();
    let layout: GraphLayout;
    try {
      this.engine ??= this.loadEngine();
      layout = await layoutGraph(await this.engine, view, root, options);
    } catch {
      this.engine = null;
      if (run === this.run && !this.destroyed) {
        this.busy = false;
        this.failed.set(true);
      }
      return;
    }
    // Une disposition plus récente est en route, ou le canevas n'est plus là.
    if (run !== this.run || this.destroyed) return;

    const first = this.builtKey === null;
    const otherRoot = this.builtKey !== key;
    const count = view.nodes.length + view.superNodes.length;
    const mode = `${options.reading}:${options.direction}`;
    const refit =
      otherRoot ||
      this.builtRelayout !== relayout ||
      this.builtCount !== count ||
      this.builtMode !== mode;
    const saved = otherRoot && this.builtRelayout === relayout ? this.viewport() : null;
    this.builtKey = key;
    this.builtRelayout = relayout;
    this.builtCount = count;
    this.builtMode = mode;
    this.failed.set(false);
    this.placed.set({ view, layout });
    if (!first) this.animateCards();
    this.lastLayoutMs = Math.round(performance.now() - started);
    this.busy = false;

    // Même racine, mêmes cartes (un lien ajouté ou retiré) : la vue de l'utilisateur ne bouge pas.
    if (saved) this.moveTo({ x: saved.pan.x, y: saved.pan.y, k: saved.zoom }, false);
    else if (refit) this.fit(this.scene(), !first);
    this.emitViewport();
  }

  /** Ajuste à la zone tout ce que la scène montre (graphe, titres des colonnes), centré. */
  private fit(scene: GraphScene | null, animate: boolean): void {
    const zone = this.viewportEl().nativeElement;
    const width = zone.clientWidth;
    const height = zone.clientHeight;
    const bounds = scene?.bounds;
    if (!width || !height || !bounds?.width || !bounds.height) {
      this.moveTo({ x: FIT_PADDING, y: FIT_PADDING, k: 1 }, false);
      return;
    }
    const k = clamp(
      Math.min(
        (width - 2 * FIT_PADDING) / bounds.width,
        (height - 2 * FIT_PADDING) / bounds.height,
        MAX_FIT_ZOOM,
      ),
    );
    this.moveTo(
      {
        x: (width - bounds.width * k) / 2 - bounds.x * k,
        y: (height - bounds.height * k) / 2 - bounds.y * k,
        k,
      },
      animate,
    );
  }

  /**
   * De droite à gauche (Q75), le début de la lecture est au bord droit de la zone : quand la zone
   * change de largeur (panneau de détail ouvert ou fermé à sa gauche), le graphe garde sa place
   * par rapport à ce bord, comme il la garde par rapport au bord gauche de gauche à droite (le
   * repère du dessin part toujours du bord gauche). Sans ResizeObserver, rien ne bouge.
   */
  private keepReadingStart(destroyRef: DestroyRef): void {
    if (this.textDirection !== 'rtl' || typeof ResizeObserver === 'undefined') return;
    const zone = this.viewportEl().nativeElement;
    let width = zone.clientWidth;
    const observer = new ResizeObserver(() => {
      const next = zone.clientWidth;
      const shift = next - width;
      width = next;
      if (!shift || !this.placed() || this.destroyed) return;
      const current = this.transform();
      this.moveTo({ ...current, x: current.x + shift }, false);
      this.viewportMoved();
    });
    observer.observe(zone);
    destroyRef.onDestroy(() => observer.disconnect());
  }

  /** Les cartes ne s'animent que le temps d'une nouvelle disposition (une carte lâchée revient d'un coup). */
  private animateCards(): void {
    if (this.rearrangeTimer) clearTimeout(this.rearrangeTimer);
    this.rearranging.set(true);
    this.rearrangeTimer = setTimeout(() => this.rearranging.set(false), ANIMATION_MS);
  }

  private moveTo(transform: Transform, animate: boolean): void {
    if (this.animationTimer) clearTimeout(this.animationTimer);
    this.animated.set(animate);
    this.transform.set(transform);
    if (animate) this.animationTimer = setTimeout(() => this.animated.set(false), ANIMATION_MS);
  }

  // ── Zoom ────────────────────────────────────────────────────────────────────────────

  /** Zoom +/− autour du centre de la zone. */
  protected zoomBy(factor: number): void {
    const zone = this.viewportEl().nativeElement;
    this.zoomAt(zone.clientWidth / 2, zone.clientHeight / 2, factor);
    // Un bouton est un geste fini : rangé tout de suite (pas d'attente du délai des gestes continus).
    this.emitViewport();
  }

  protected onWheel(event: WheelEvent): void {
    event.preventDefault();
    const rect = this.viewportEl().nativeElement.getBoundingClientRect();
    this.zoomAt(
      event.clientX - rect.left,
      event.clientY - rect.top,
      Math.exp(-event.deltaY * 0.0015),
    );
    this.viewportMoved();
  }

  /** Zoom en gardant fixe le point (x, y) de la zone. */
  private zoomAt(x: number, y: number, factor: number): void {
    const current = this.transform();
    const k = clamp(current.k * factor);
    const ratio = k / current.k;
    this.moveTo({ k, x: x - (x - current.x) * ratio, y: y - (y - current.y) * ratio }, false);
  }

  private viewportMoved(): void {
    if (this.viewportTimer) clearTimeout(this.viewportTimer);
    this.viewportTimer = setTimeout(() => this.emitViewport(), VIEWPORT_DEBOUNCE_MS);
  }

  private emitViewport(): void {
    if (this.viewportTimer) clearTimeout(this.viewportTimer);
    this.viewportTimer = null;
    if (!this.builtKey || this.destroyed) return;
    const { x, y, k } = this.transform();
    this.viewportChanged.emit({ key: this.builtKey, viewport: { zoom: k, pan: { x, y } } });
  }

  // ── Sélection, déplacement de la vue, glisser d'une carte sur une autre ─────────────

  protected select(id: string): void {
    if (this.dragJustEnded) return;
    this.nodeSelected.emit(id);
  }

  protected cardTransform(card: CardView): string {
    const drag = this.drag();
    const dx = drag?.id === card.id ? drag.dx : 0;
    const dy = drag?.id === card.id ? drag.dy : 0;
    return `translate(${card.box.x + dx}px, ${card.box.y + dy}px)`;
  }

  /** Titre d'une colonne à son point d'accroche ; il y finit s'il est à gauche d'une rangée ou lu vers la gauche. */
  protected bandLabelTransform(band: BandView): string {
    const { x, y } = band.labelAt;
    return `translate(${x}px, ${y}px)${band.labelEnds ? ' translateX(-100%)' : ''}`;
  }

  protected markerOf(link: LinkView): string {
    const id = link.state === 'thread' ? ARROW_THREAD : link.proposed ? ARROW_PROPOSED : ARROW;
    return `url(#${id})`;
  }

  protected onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    const card = (event.target as Element).closest<HTMLElement>('[data-node-id]');
    const { x, y } = this.transform();
    this.press = {
      id: card?.dataset['nodeId'] ?? null,
      x: event.clientX,
      y: event.clientY,
      origin: { x, y },
      moved: false,
    };
    // Sur le fond, le geste est suivi tout de suite ; sur une carte, seulement s'il devient un
    // glisser (sinon le clic n'arriverait plus à la carte).
    if (!card) this.capture(event);
  }

  protected onPointerMove(event: PointerEvent): void {
    const press = this.press;
    if (!press) return;
    const dx = event.clientX - press.x;
    const dy = event.clientY - press.y;
    if (!press.moved) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      press.moved = true;
      if (press.id) this.capture(event);
    }
    if (press.id === null) {
      this.panning.set(true);
      this.moveTo({ ...this.transform(), x: press.origin.x + dx, y: press.origin.y + dy }, false);
      return;
    }
    // Un super-nœud ne se lie pas : il ne se glisse pas.
    if (isSuperNodeId(press.id)) return;
    const k = this.transform().k;
    this.drag.set({
      id: press.id,
      dx: dx / k,
      dy: dy / k,
      target: this.entryUnder(event, press.id),
    });
  }

  protected onPointerUp(event: PointerEvent): void {
    const press = this.press;
    this.press = null;
    if (!press) return;
    this.release(event);
    if (press.id === null) {
      this.panning.set(false);
      if (press.moved) this.viewportMoved();
      else this.nodeSelected.emit(null);
      return;
    }
    const drag = this.drag();
    this.drag.set(null);
    if (!press.moved) return;
    // Lâchée sur une autre entrée : lien à poser. Dans tous les cas la carte revient à sa place.
    this.dragJustEnded = true;
    setTimeout(() => (this.dragJustEnded = false));
    if (drag?.target) this.linkDropped.emit({ sourceId: press.id, targetId: drag.target });
  }

  /** L'entrée (pas un super-nœud, pas la carte glissée) sous le pointeur. */
  private entryUnder(event: PointerEvent, draggedId: string): string | null {
    const doc = this.host.nativeElement.ownerDocument;
    const under = doc.elementFromPoint?.(event.clientX, event.clientY);
    const id = under?.closest<HTMLElement>('[data-node-id]')?.dataset['nodeId'];
    return id && id !== draggedId && !isSuperNodeId(id) ? id : null;
  }

  /** Le geste reste suivi hors de la zone ; sans capture possible, il s'arrête simplement au bord. */
  private capture(event: PointerEvent): void {
    try {
      this.viewportEl().nativeElement.setPointerCapture(event.pointerId);
    } catch {
      // Pointeur déjà relâché : rien à suivre.
    }
  }

  private release(event: PointerEvent): void {
    try {
      this.viewportEl().nativeElement.releasePointerCapture(event.pointerId);
    } catch {
      // Aucune capture en cours.
    }
  }

  // ── Sonde des e2e ───────────────────────────────────────────────────────────────────

  private exposeProbe(): void {
    if ((globalThis as { pmE2E?: unknown }).pmE2E !== true) return;
    const host = this.host.nativeElement;
    const cards = () => Array.from(host.querySelectorAll<HTMLElement>('[data-node-id]'));
    const probe: GraphProbe = {
      point: (id) => {
        const card = cards().find((el) => el.dataset['nodeId'] === id);
        if (!card) return null;
        const rect = card.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      },
      zoom: () => this.transform().k,
      layoutMs: () => this.lastLayoutMs,
      nodeIds: () => cards().map((el) => el.dataset['nodeId'] ?? ''),
      busy: () => this.busy,
    };
    Object.defineProperty(host, 'pmGraphProbe', { value: probe, configurable: true });
  }
}

function clamp(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}
