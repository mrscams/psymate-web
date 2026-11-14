import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { StateComponent } from '../../../shared/ui';
import { ChartHost } from './chart-host';
import {
  FeelingsChartData,
  FeelingsChartLabels,
  feelingsChartOptions,
  readFeelingsTokens,
} from './feelings-chart.options';

/**
 * Graphe « Comment évoluent les ressentis » de la vue d'ensemble (M4-07, UX-S6) : ECharts chargé à
 * la demande, options calculées par feelingsChartOptions à partir des tokens CSS, relus au
 * changement de thème. Un clic sur un point émet l'entrée du ressenti. Pour les lecteurs d'écran :
 * `role="img"` et le résumé ; le tableau des ressentis est à côté (« Voir les données »).
 */
@Component({
  selector: 'pm-overview-feelings-chart',
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
      height: 210px;
    }
    .hidden {
      display: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeelingsChartComponent extends ChartHost {
  readonly data = input.required<FeelingsChartData>();
  readonly labels = input.required<FeelingsChartLabels>();

  protected readonly failedTitle = $localize`:Le graphe des ressentis ne s'est pas chargé@@overview.simple.feelings.failed:Graphe indisponible`;
  protected readonly failedMessage = $localize`:Le graphe des ressentis ne s'est pas chargé@@overview.simple.feelings.failed.message:Le graphe n'a pas pu s'afficher ; les ressentis restent lisibles dans « Voir les données ».`;

  protected readonly option = computed(() => {
    const data = this.data();
    const labels = this.labels();
    return (read: (name: string) => string) =>
      feelingsChartOptions(data, readFeelingsTokens(read), labels);
  });
}
