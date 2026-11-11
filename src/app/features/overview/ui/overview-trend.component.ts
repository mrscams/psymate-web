import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  LOCALE_ID,
  output,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { StateComponent } from '../../../shared/ui';
import { ENTRY_QUERY_PARAM } from '../../entries';
import { OverviewView } from '../data/overview.model';
import { formatDay, formatIntensity, localDay, trendSummary } from './overview-labels';
import { TrendChartComponent } from './trend-chart.component';
import { TrendChartData, TrendChartLabels } from './trend-chart.options';

/**
 * Corps du bloc « Tendance » (fiche 02, B4 écran 2) : la courbe ECharts (en @defer, hors du bundle
 * initial), sa légende, et l'alternative accessible : `role="img"` + résumé, et le tableau des
 * ressentis (« Voir les données »), dont chaque émotion ouvre l'entrée comme un clic sur un point.
 */
@Component({
  selector: 'pm-overview-trend',
  imports: [RouterLink, StateComponent, TrendChartComponent],
  template: `
    <!-- Le résumé (role=img) porte sur la courbe seule ; une erreur s'affiche hors de lui. -->
    <div class="figure">
      @defer (on immediate) {
        <pm-overview-trend-chart
          [data]="chartData()"
          [labels]="chartLabels"
          [summary]="summary()"
          (pointSelected)="pointSelected.emit($event)"
        />
      } @placeholder {
        <div class="chart-placeholder" role="img" [attr.aria-label]="summary()"></div>
      } @error {
        <pm-state kind="error" compact [title]="failedTitle" />
      }
    </div>
    <!-- Légende de la maquette 02 : trois éléments ; les points gris sont expliqués à droite. -->
    <div class="legend-row">
      <ul
        class="legend"
        aria-label="Légende"
        i18n-aria-label="Légende de la courbe@@overview.trend.legend"
      >
        <li>
          <span class="key line" aria-hidden="true"></span>
          <span i18n="Légende de la courbe@@overview.trend.legend.average"
            >Intensité des ressentis</span
          >
        </li>
        <li>
          <span class="key session" aria-hidden="true"></span>
          <span i18n="Légende de la courbe@@overview.trend.legend.session">Séance</span>
        </li>
        <li>
          <span class="key medication" aria-hidden="true"></span>
          <span i18n="Légende de la courbe@@overview.trend.legend.medication"
            >Changement de médicament</span
          >
        </li>
      </ul>
      <p class="hint" i18n="Aide sous la courbe@@overview.trend.hint">
        Points gris : les ressentis notés · cliquer un point ouvre le ressenti
      </p>
    </div>
    @if (view().feelings.points.length) {
      <details class="data">
        <summary i18n="Bouton qui déplie les données de la courbe@@overview.trend.data">
          Voir les données
        </summary>
        <table>
          <caption i18n="Légende du tableau des ressentis@@overview.trend.data.caption">
            Ressentis de la période
          </caption>
          <thead>
            <tr>
              <th scope="col" i18n="Colonne du tableau des ressentis@@overview.trend.data.date">
                Date
              </th>
              <th scope="col" i18n="Colonne du tableau des ressentis@@overview.trend.data.emotion">
                Émotion
              </th>
              <th
                scope="col"
                i18n="Colonne du tableau des ressentis@@overview.trend.data.intensity"
              >
                Intensité
              </th>
            </tr>
          </thead>
          <tbody>
            @for (point of view().feelings.points; track point.entryId) {
              <tr>
                <td>{{ day(point.date) }}</td>
                <td>
                  <a
                    [routerLink]="[]"
                    [queryParams]="entryParams(point.entryId)"
                    queryParamsHandling="merge"
                    >{{ emotion(point.emotionCode) }}</a
                  >
                </td>
                <td>{{ point.intensity }}/10</td>
              </tr>
            }
          </tbody>
        </table>
      </details>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .figure,
    .chart-placeholder {
      min-height: 190px;
    }
    .legend-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px 16px;
      font-size: 12px;
      line-height: 16px;
      color: var(--text-secondary);
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 16px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .hint {
      margin: 0 0 0 auto;
    }
    .legend li {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .key {
      display: inline-block;
    }
    .line {
      width: 14px;
      height: 3px;
      border-radius: 2px;
      background: var(--feeling);
    }
    .session {
      width: 2px;
      height: 8px;
      border-radius: 1px;
      background: var(--primary);
    }
    .medication {
      width: 8px;
      height: 8px;
      margin: 0 1px;
      transform: rotate(45deg);
      background: var(--entry-medication);
    }
    .data summary {
      align-self: flex-start;
      padding: 4px 0;
      cursor: pointer;
      color: var(--primary);
      font: var(--mat-sys-label-large);
    }
    table {
      width: 100%;
      margin-top: 8px;
      border-collapse: collapse;
      font-size: 13px;
      line-height: 1.4;
      color: var(--text-primary);
    }
    caption {
      text-align: left;
      color: var(--text-secondary);
      padding-bottom: 4px;
    }
    th,
    td {
      padding: 6px 8px 6px 0;
      text-align: left;
      border-bottom: 1px solid var(--surface-sunken);
    }
    a {
      color: var(--primary);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverviewTrendComponent {
  readonly view = input.required<OverviewView>();
  /** Clic sur un point de la courbe : l'entrée du ressenti. */
  readonly pointSelected = output<string>();

  private readonly locale = inject(LOCALE_ID);

  protected readonly failedTitle = $localize`:La courbe ne s'est pas chargée@@overview.trend.failed:Tendance indisponible`;

  protected readonly summary = computed(() => {
    const view = this.view();
    return trendSummary(view.trend, view.feelings.points.length, view.window, this.locale);
  });

  protected readonly chartData = computed<TrendChartData>(() => ({
    trend: this.view().trend,
    feelings: this.view().feelings,
  }));

  private readonly emotionLabels = computed(() => {
    const labels = new Map<string, string>();
    for (const series of this.view().feelings.series) labels.set(series.emotionCode, series.label);
    return labels;
  });

  protected readonly chartLabels: TrendChartLabels = {
    average: $localize`:Nom de la courbe des moyennes@@overview.trend.average:Intensité moyenne (7 jours)`,
    feelings: $localize`:Nom des points de ressentis de la courbe@@overview.trend.feelings:Ressentis notés`,
    session: $localize`:Repère de séance sur la courbe@@overview.trend.session:Séance`,
    medication: $localize`:Nom des repères de médicament de la courbe@@overview.trend.medication:Changement de médicament`,
    medicationStart: $localize`:Repère de début de médicament@@overview.trend.medicationStart:Début de traitement`,
    medicationEnd: $localize`:Repère de fin de médicament@@overview.trend.medicationEnd:Fin de traitement`,
    emotion: (code) => this.emotion(code),
    day: (value) => formatDay(typeof value === 'number' ? localDay(value) : value, this.locale),
    intensity: (value) => formatIntensity(value, this.locale),
  };

  protected emotion(code: string): string {
    return this.emotionLabels().get(code) ?? code;
  }

  protected day(date: string): string {
    return formatDay(date, this.locale);
  }

  protected entryParams(entryId: string): Record<string, string> {
    return { [ENTRY_QUERY_PARAM]: entryId };
  }
}
