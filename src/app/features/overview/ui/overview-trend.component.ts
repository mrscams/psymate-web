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
import { EmotionFamily, OverviewView } from '../data/overview.model';
import { familyLabel, formatDay, formatIntensity, trendSummary } from './overview-labels';
import { TrendChartComponent } from './trend-chart.component';
import { TrendChartData, TrendChartLabels } from './trend-chart.options';

/**
 * Horodatage de l'axe du temps d'ECharts (il lit « AAAA-MM-JJ » comme minuit local) → le jour
 * AAAA-MM-JJ qu'il représente.
 */
export function localDay(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Paramètre de l'éditeur d'entrée (features/entries, ENTRY_QUERY_PARAM) : le shell l'ouvre. */
const ENTRY_PARAM = 'entry';

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
    <ul
      class="legend"
      aria-label="Légende"
      i18n-aria-label="Légende de la courbe@@overview.trend.legend"
    >
      <li>
        <span class="key line" aria-hidden="true"></span>
        <span i18n="Légende de la courbe@@overview.trend.legend.average"
          >Intensité moyenne (7 jours)</span
        >
      </li>
      @for (family of families(); track family) {
        <li>
          <span class="key dot" [style.background]="familyColor(family)" aria-hidden="true"></span>
          {{ familyName(family) }}
        </li>
      }
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
      min-height: 200px;
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 16px;
      margin: 0;
      padding: 0;
      list-style: none;
      font: var(--mat-sys-body-small);
      color: var(--text-secondary);
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
    .dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
    }
    .session {
      width: 0;
      height: 10px;
      border-left: 2px dashed var(--primary);
    }
    .medication {
      width: 2px;
      height: 10px;
      background: var(--entry-medication);
    }
    .data summary {
      cursor: pointer;
      color: var(--primary);
      font: var(--mat-sys-label-large);
    }
    table {
      width: 100%;
      margin-top: 8px;
      border-collapse: collapse;
      font: var(--mat-sys-body-small);
      color: var(--text-primary);
    }
    caption {
      text-align: left;
      color: var(--text-secondary);
      padding-bottom: 4px;
    }
    th,
    td {
      padding: 4px 8px 4px 0;
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

  /** Familles présentes dans la fenêtre (une série de points chacune), sans doublon. */
  protected readonly families = computed(() => {
    const seen = new Set<EmotionFamily | null>();
    for (const point of this.view().feelings.points) seen.add(point.family);
    return [...seen];
  });

  private readonly emotionLabels = computed(() => {
    const labels = new Map<string, string>();
    for (const series of this.view().feelings.series) labels.set(series.emotionCode, series.label);
    return labels;
  });

  protected readonly chartLabels: TrendChartLabels = {
    average: $localize`:Nom de la courbe des moyennes@@overview.trend.average:Intensité moyenne (7 jours)`,
    session: $localize`:Repère de séance sur la courbe@@overview.trend.session:Séance`,
    medicationStart: $localize`:Repère de début de médicament@@overview.trend.medicationStart:Début de traitement`,
    medicationEnd: $localize`:Repère de fin de médicament@@overview.trend.medicationEnd:Fin de traitement`,
    family: (family) => familyLabel(family),
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

  protected familyName(family: EmotionFamily | null): string {
    return familyLabel(family);
  }

  protected familyColor(family: EmotionFamily | null): string {
    return family ? `var(--emotion-${family})` : 'var(--feeling)';
  }

  protected entryParams(entryId: string): Record<string, string> {
    return { [ENTRY_PARAM]: entryId };
  }
}
