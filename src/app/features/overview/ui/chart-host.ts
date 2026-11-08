import {
  afterNextRender,
  DestroyRef,
  Directive,
  effect,
  ElementRef,
  inject,
  InjectionToken,
  input,
  output,
  Signal,
  signal,
  untracked,
  viewChild,
} from '@angular/core';

import { ThemeService } from '../../../core/theme';
import type { TrendChartOption } from './trend-chart.options';

/** Ce qu'un graphe de la vue d'ensemble utilise d'une instance ECharts (une doublure en test). */
export interface TrendChart {
  setOption(option: TrendChartOption, opts?: { notMerge?: boolean }): void;
  resize(): void;
  on(event: 'click', handler: (params: { seriesType?: string; data?: unknown }) => void): void;
  dispose(): void;
}

/** Fabrique d'un graphe dans un élément. */
export type TrendRenderer = (element: HTMLElement) => TrendChart;

/** Import dynamique d'ECharts (en modules) : son propre morceau, chargé quand un graphe s'affiche. */
export async function loadTrendRenderer(): Promise<TrendRenderer> {
  const { createChart } = await import('./echarts-setup');
  return (element) => createChart(element) as unknown as TrendChart;
}

/** Chargeur du moteur de rendu ; les tests fournissent une doublure (jsdom ne dessine rien). */
export const TREND_RENDERER = new InjectionToken<() => Promise<TrendRenderer>>('TREND_RENDERER', {
  providedIn: 'root',
  factory: () => loadTrendRenderer,
});

/**
 * Socle des graphes ECharts de la vue d'ensemble (courbe de tendance M4-05, ressentis réels M4-07) :
 * moteur chargé à la demande, options recalculées à chaque changement de données, de libellés ou de
 * thème (tokens CSS relus sur l'hôte), redimensionnement, clic sur un point de ressenti (émet son
 * entrée), libération à la destruction. La classe fille fournit `#container` dans son gabarit et
 * `option`, la fabrique des options à partir d'un lecteur de tokens.
 */
@Directive()
export abstract class ChartHost {
  /** Résumé du graphe pour les lecteurs d'écran (`role="img"`), hors de l'état d'erreur. */
  readonly summary = input.required<string>();
  /** Clic sur un point de ressenti : l'identifiant de l'entrée. */
  readonly pointSelected = output<string>();

  protected readonly failed = signal(false);
  /** Les options du graphe, en fonction d'un lecteur de tokens CSS (signal des entrées). */
  protected abstract readonly option: Signal<(read: (name: string) => string) => TrendChartOption>;

  private readonly container = viewChild.required<ElementRef<HTMLElement>>('container');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly theme = inject(ThemeService);
  private readonly loadRenderer = inject(TREND_RENDERER);
  private readonly ready = signal(false);
  private chart: TrendChart | null = null;
  private destroyed = false;
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    afterNextRender(() => void this.start());

    // Données, libellés et thème (data-theme sur <html>) : les options sont recalculées, les
    // tokens relus.
    effect(() => {
      this.theme.resolved();
      const build = this.option();
      if (!this.ready()) return;
      untracked(() => this.render(build));
    });

    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.resizeObserver?.disconnect();
      this.chart?.dispose();
      this.chart = null;
    });
  }

  private async start(): Promise<void> {
    let create: TrendRenderer;
    try {
      create = await this.loadRenderer();
    } catch {
      this.failed.set(true);
      return;
    }
    if (this.destroyed) return;
    const chart = create(this.container().nativeElement);
    this.chart = chart;
    chart.on('click', (params) => {
      const datum = params.data as { entryId?: string } | undefined;
      if (datum && typeof datum === 'object' && datum.entryId) this.pointSelected.emit(datum.entryId);
    });
    if (typeof ResizeObserver === 'function') {
      this.resizeObserver = new ResizeObserver(() => this.chart?.resize());
      this.resizeObserver.observe(this.container().nativeElement);
    }
    this.ready.set(true);
  }

  private render(build: (read: (name: string) => string) => TrendChartOption): void {
    const style = getComputedStyle(this.host.nativeElement);
    this.chart?.setOption(
      build((name) => style.getPropertyValue(name)),
      { notMerge: true },
    );
  }
}
