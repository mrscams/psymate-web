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

import { ThemeService } from '../../../core/theme';
import { StateComponent } from '../../../shared/ui';
import {
  readTrendTokens,
  TrendChartData,
  TrendChartLabels,
  TrendChartOption,
  trendChartOptions,
  TrendPointDatum,
} from './trend-chart.options';

/** Ce que la courbe utilise d'une instance ECharts (une doublure en test). */
export interface TrendChart {
  setOption(option: TrendChartOption, opts?: { notMerge?: boolean }): void;
  resize(): void;
  on(event: 'click', handler: (params: { seriesType?: string; data?: unknown }) => void): void;
  dispose(): void;
}

/** Fabrique d'une courbe dans un élément. */
export type TrendRenderer = (element: HTMLElement) => TrendChart;

/** Import dynamique d'ECharts (en modules) : son propre morceau, chargé quand la courbe s'affiche. */
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
 * Courbe de tendance de la vue d'ensemble (fiche 02) : ECharts, chargé à la demande, options
 * calculées par trendChartOptions à partir des tokens CSS (relus au changement de thème). Un clic
 * sur un point de ressenti émet son entrée. Décorative pour les lecteurs d'écran : le bloc parent
 * porte le résumé (`role="img"`) et le tableau des données.
 */
@Component({
  selector: 'pm-overview-trend-chart',
  imports: [StateComponent],
  template: `
    @if (failed()) {
      <pm-state kind="error" compact [title]="failedTitle" [message]="failedMessage" />
    }
    <div #container class="chart" [class.hidden]="failed()" aria-hidden="true"></div>
  `,
  styles: `
    :host {
      display: block;
    }
    .chart {
      width: 100%;
      height: 200px;
    }
    .hidden {
      display: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrendChartComponent {
  readonly data = input.required<TrendChartData>();
  readonly labels = input.required<TrendChartLabels>();
  /** Clic sur un point de ressenti : l'identifiant de l'entrée. */
  readonly pointSelected = output<string>();

  protected readonly failed = signal(false);
  protected readonly failedTitle = $localize`:La courbe ne s'est pas chargée@@overview.trend.failed:Tendance indisponible`;
  protected readonly failedMessage = $localize`:La courbe ne s'est pas chargée@@overview.trend.failed.message:La courbe n'a pas pu s'afficher ; les données restent lisibles dans « Voir les données ».`;

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
      const data = this.data();
      const labels = this.labels();
      if (!this.ready()) return;
      untracked(() => this.render(data, labels));
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
      const datum = params.data as TrendPointDatum | undefined;
      if (params.seriesType === 'scatter' && datum?.entryId) this.pointSelected.emit(datum.entryId);
    });
    if (typeof ResizeObserver === 'function') {
      this.resizeObserver = new ResizeObserver(() => this.chart?.resize());
      this.resizeObserver.observe(this.container().nativeElement);
    }
    this.ready.set(true);
  }

  private render(data: TrendChartData, labels: TrendChartLabels): void {
    const style = getComputedStyle(this.host.nativeElement);
    const tokens = readTrendTokens((name) => style.getPropertyValue(name));
    this.chart?.setOption(trendChartOptions(data, tokens, labels), { notMerge: true });
  }
}
