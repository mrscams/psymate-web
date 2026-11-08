import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { StateComponent } from '../../../shared/ui';
import { ChartHost } from './chart-host';
import {
  readTrendTokens,
  TrendChartData,
  TrendChartLabels,
  trendChartOptions,
} from './trend-chart.options';

export type { TrendChart, TrendRenderer } from './chart-host';
export { loadTrendRenderer, TREND_RENDERER } from './chart-host';

/**
 * Courbe de tendance de la vue d'ensemble (fiche 02) : ECharts, chargé à la demande, options
 * calculées par trendChartOptions à partir des tokens CSS (relus au changement de thème). Un clic
 * sur un point de ressenti émet son entrée. Pour les lecteurs d'écran : `role="img"` et le résumé
 * (la courbe elle-même est masquée) ; une erreur de chargement s'affiche hors de cette image.
 */
@Component({
  selector: 'pm-overview-trend-chart',
  imports: [StateComponent],
  template: `
    @if (failed()) {
      <pm-state kind="error" compact [title]="failedTitle" [message]="failedMessage" />
    }
    <div class="figure" role="img" [attr.aria-label]="summary()" [class.hidden]="failed()">
      <div #container class="chart" aria-hidden="true"></div>
    </div>
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
export class TrendChartComponent extends ChartHost {
  readonly data = input.required<TrendChartData>();
  readonly labels = input.required<TrendChartLabels>();

  protected readonly failedTitle = $localize`:La courbe ne s'est pas chargée@@overview.trend.failed:Tendance indisponible`;
  protected readonly failedMessage = $localize`:La courbe ne s'est pas chargée@@overview.trend.failed.message:La courbe n'a pas pu s'afficher ; les données restent lisibles dans « Voir les données ».`;

  protected readonly option = computed(() => {
    const data = this.data();
    const labels = this.labels();
    return (read: (name: string) => string) =>
      trendChartOptions(data, readTrendTokens(read), labels);
  });
}
