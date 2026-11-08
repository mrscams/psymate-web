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
import { EmotionFamily, OverviewView, TrendMarker } from '../data/overview.model';
import { FeelingsChartComponent } from './feelings-chart.component';
import {
  FeelingsChartData,
  FeelingsChartLabels,
  groupByEmotion,
  SeriesSymbol,
  seriesSymbol,
} from './feelings-chart.options';
import { feelingsSummary, formatDay } from './overview-labels';
import { localDay } from './overview-trend.component';

/** Paramètre de l'éditeur d'entrée (features/entries, ENTRY_QUERY_PARAM) : le shell l'ouvre. */
const ENTRY_PARAM = 'entry';

/**
 * Corps du bloc « Comment évoluent les ressentis » de la vue simple (B8, M4-07) : le graphe à
 * points réels (ECharts en @defer, hors du bundle initial), sa légende (une entrée par émotion avec
 * son nombre de ressentis, la même forme que sur le graphe ; séance ; chaque repère de médicament
 * en clair), et l'alternative accessible : `role="img"` + description, et le tableau des ressentis
 * (« Voir les données »), dont chaque émotion ouvre l'entrée comme un clic sur un point.
 */
@Component({
  selector: 'pm-overview-feelings',
  imports: [FeelingsChartComponent, RouterLink, StateComponent],
  template: `
    <p class="hint" i18n="Explication du graphe des ressentis réels@@overview.simple.feelings.hint">
      Chaque point est un ressenti noté, avec son intensité sur 10. Pas de moyenne : ce sont les
      valeurs réelles.
    </p>
    <div class="figure">
      @defer (on immediate) {
        <pm-overview-feelings-chart
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
      i18n-aria-label="Légende du graphe des ressentis@@overview.simple.feelings.legend"
    >
      @for (item of legend(); track item.code) {
        <li>
          <svg class="key" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
            @switch (item.symbol) {
              @case ('diamond') {
                <path d="M5 0.5 9.5 5 5 9.5 0.5 5z" [style.fill]="item.color" />
              }
              @case ('triangle') {
                <path d="M5 0.8 9.6 9.2H0.4z" [style.fill]="item.color" />
              }
              @case ('rect') {
                <rect x="1" y="1" width="8" height="8" [style.fill]="item.color" />
              }
              @case ('roundRect') {
                <rect x="1" y="1" width="8" height="8" rx="2.5" [style.fill]="item.color" />
              }
              @default {
                <circle cx="5" cy="5" r="4.5" [style.fill]="item.color" />
              }
            }
          </svg>
          <span
            i18n="
              Émotion dans la légende du graphe des
              ressentis@@overview.simple.feelings.legend.emotion"
            >{{ item.label }} ({item.count, plural, =1 {1 ressenti} other {{{item.count}} ressentis}
            })</span
          >
        </li>
      }
      @if (view().feelings.ticks.length) {
        <li>
          <span class="key session" aria-hidden="true"></span>
          <span i18n="Légende du graphe des ressentis@@overview.simple.feelings.legend.session"
            >Séance</span
          >
        </li>
      }
      @for (marker of view().feelings.markers; track marker.entryId + marker.date) {
        <li>
          <span class="key medication" aria-hidden="true"></span>
          <span>{{ markerText(marker) }}</span>
        </li>
      }
    </ul>
    <details class="data">
      <summary
        i18n="Bouton qui déplie les données du graphe des ressentis@@overview.simple.feelings.data"
      >
        Voir les données
      </summary>
      <table>
        <caption
          i18n="
            Légende du tableau des ressentis de la vue simple@@overview.simple.feelings.data.caption"
        >
          Ressentis notés sur la période
        </caption>
        <thead>
          <tr>
            <th scope="col" i18n="Colonne du tableau des ressentis@@overview.trend.data.date">
              Date
            </th>
            <th scope="col" i18n="Colonne du tableau des ressentis@@overview.trend.data.emotion">
              Émotion
            </th>
            <th scope="col" i18n="Colonne du tableau des ressentis@@overview.trend.data.intensity">
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
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .hint {
      margin: 0;
      font: var(--mat-sys-body-small);
      color: var(--text-secondary);
    }
    .figure,
    .chart-placeholder {
      min-height: 230px;
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
      width: 10px;
      height: 10px;
      flex: 0 0 auto;
    }
    .session {
      width: 3px;
      height: 10px;
      border-radius: 1px;
      background: var(--entry-session);
    }
    .medication {
      width: 0;
      height: 10px;
      border-left: 2px dashed var(--entry-medication);
    }
    .data summary {
      cursor: pointer;
      color: var(--primary);
      font: var(--mat-sys-label-large);
    }
    .data summary:focus-visible,
    a:focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: 2px;
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
export class OverviewFeelingsComponent {
  readonly view = input.required<OverviewView>();
  /** Clic sur un point du graphe : l'entrée du ressenti. */
  readonly pointSelected = output<string>();

  private readonly locale = inject(LOCALE_ID);

  protected readonly failedTitle = $localize`:Le graphe des ressentis ne s'est pas chargé@@overview.simple.feelings.failed:Graphe indisponible`;

  protected readonly summary = computed(() =>
    feelingsSummary(this.view().feelings, this.view().window),
  );

  /** Axe du temps : la fenêtre du serveur (premier et dernier jour de la courbe de tendance). */
  protected readonly chartData = computed<FeelingsChartData>(() => {
    const view = this.view();
    return {
      feelings: view.feelings,
      from: view.trend.points[0]?.date ?? null,
      to: view.trend.points.at(-1)?.date ?? null,
    };
  });

  /** Une entrée par émotion présente, dans l'ordre et avec la forme des séries du graphe. */
  protected readonly legend = computed(() =>
    groupByEmotion(this.view().feelings).map(({ series, points }, index) => ({
      code: series.emotionCode,
      label: series.label,
      count: points.length,
      symbol: seriesSymbol(index) as SeriesSymbol,
      color: familyColor(series.family),
    })),
  );

  private readonly emotionLabels = computed(() => {
    const labels = new Map<string, string>();
    for (const series of this.view().feelings.series) labels.set(series.emotionCode, series.label);
    return labels;
  });

  private readonly medicationStart = $localize`:Repère de début de médicament@@overview.trend.medicationStart:Début de traitement`;
  private readonly medicationEnd = $localize`:Repère de fin de médicament@@overview.trend.medicationEnd:Fin de traitement`;

  protected readonly chartLabels: FeelingsChartLabels = {
    session: $localize`:Repère de séance sur la courbe@@overview.trend.session:Séance`,
    medicationStart: this.medicationStart,
    medicationEnd: this.medicationEnd,
    day: (value) => formatDay(typeof value === 'number' ? localDay(value) : value, this.locale),
  };

  /** Repère de médicament en clair : « Début de traitement · Sertraline 50 mg · 29 sept. 2026 ». */
  protected markerText(marker: TrendMarker): string {
    const change = marker.change === 'end' ? this.medicationEnd : this.medicationStart;
    return [change, marker.label, this.day(marker.date)].filter((part) => !!part).join(' · ');
  }

  protected emotion(code: string): string {
    return this.emotionLabels().get(code) ?? code;
  }

  protected day(date: string): string {
    return formatDay(date, this.locale);
  }

  protected entryParams(entryId: string): Record<string, string> {
    return { [ENTRY_PARAM]: entryId };
  }
}

function familyColor(family: EmotionFamily | null): string {
  return family ? `var(--emotion-${family})` : 'var(--feeling)';
}
