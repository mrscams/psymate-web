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
import { EmotionFamily, OverviewView, TrendMarker } from '../data/overview.model';
import { FeelingsChartComponent } from './feelings-chart.component';
import {
  dominantGroups,
  FeelingsChartData,
  FeelingsChartLabels,
  seriesSymbol,
} from './feelings-chart.options';
import {
  feelingsSummary,
  formatDay,
  intensityPath,
  intensitySpan,
  localDay,
} from './overview-labels';

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
    <!-- Phrase-titre (maquette 02b) : l'émotion la plus notée et ses valeurs, puis la suivante. -->
    @if (headline(); as h) {
      <p class="headline">
        <span
          i18n="
            Phrase-titre du graphe, émotion la plus notée@@overview.simple.feelings.headline.top"
          >{{ h.top.label }} domine :</span
        >&ngsp;<span class="mono">{{ h.top.values }}</span
        >.
        @if (h.second; as second) {
          &ngsp;<span
            i18n="
              Phrase-titre du graphe, deuxième émotion@@overview.simple.feelings.headline.second"
            >{{ second.label }} :</span
          >&ngsp;<span class="mono">{{ second.values }}</span
          >.
        }
      </p>
    }
    <p class="hint" i18n="Explication du graphe des ressentis réels@@overview.simple.feelings.hint">
      Chaque point est un ressenti noté, avec son intensité sur 10. Pas de moyenne : ce sont les
      valeurs réelles. Les traits sous l'axe marquent les séances.
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
      @if (others(); as rest) {
        <li>
          <svg class="key" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
            <circle class="others" cx="5" cy="5" r="4.5" />
          </svg>
          <span
            i18n="Autres émotions dans la légende du graphe@@overview.simple.feelings.legend.others"
            >Autres ({rest.emotions, plural, =1 {1 émotion} other {{{rest.emotions}} émotions}},
            {rest.count, plural, =1 {1 ressenti} other {{{rest.count}} ressentis}})</span
          >
        </li>
      }
    </ul>
    @if (medicationMarkers().length) {
      <!-- Repères de médicament : nommés sur le graphe, et ici en clair (hors légende). -->
      <p class="markers">
        <span class="key medication" aria-hidden="true"></span>
        <span>
          @for (
            marker of medicationMarkers();
            track marker.entryId + marker.date;
            let last = $last
          ) {
            {{ markerText(marker) }}{{ last ? '' : ' ; ' }}
          }
        </span>
      </p>
    }
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
    .headline {
      margin: 0;
      font-size: 16px;
      line-height: 1.5;
      font-weight: 500;
      color: var(--text-primary);
    }
    .mono {
      font-family: var(--font-mono);
      font-size: 15px;
    }
    .hint,
    .markers {
      margin: 0;
      font-size: 13px;
      line-height: 1.5;
      color: var(--text-secondary);
    }
    .markers {
      display: flex;
      align-items: baseline;
      gap: 8px;
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
      font-size: 12px;
      line-height: 16px;
      color: var(--text-secondary);
    }
    .others {
      fill: var(--text-disabled);
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
    .medication {
      align-self: center;
      width: 0;
      height: 10px;
      border-left: 2px dashed var(--entry-medication);
    }
    .data summary {
      padding: 4px 0;
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

  private readonly groups = computed(() => dominantGroups(this.view().feelings));

  /**
   * Légende (quatre éléments au plus, UX-B5) : les émotions tracées, dans l'ordre et avec la forme
   * de leurs séries, puis « Autres » s'il en reste.
   */
  protected readonly legend = computed(() =>
    this.groups().dominant.map(({ series, points }, index) => ({
      code: series.emotionCode,
      label: series.label,
      count: points.length,
      symbol: seriesSymbol(index),
      color: familyColor(series.family),
    })),
  );

  protected readonly others = computed(() => {
    const { others } = this.groups();
    return others.points.length ? { emotions: others.emotions, count: others.points.length } : null;
  });

  /**
   * Phrase-titre : l'émotion la plus notée et ses valeurs du premier au dernier ressenti
   * (« 4/10 → 8/10 »), puis la fourchette de la suivante (« 3–5/10 »). Des valeurs du serveur,
   * dans l'ordre du serveur ; aucune tendance n'est inventée.
   */
  protected readonly headline = computed(() => {
    const [top, second] = this.groups().dominant;
    if (!top) return null;
    return {
      top: { label: top.series.label, values: intensityPath(top.points.map((p) => p.intensity)) },
      second: second
        ? {
            label: second.series.label,
            values: intensitySpan(second.points.map((p) => p.intensity)),
          }
        : null,
    };
  });

  /** Repères de médicament, comme sur le graphe (feelingsChartOptions). */
  protected readonly medicationMarkers = computed(() =>
    this.view().feelings.markers.filter((marker) => marker.kind === 'medication'),
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
    others: $localize`:Série grise des autres émotions du graphe@@overview.simple.feelings.others:Autres émotions`,
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
    return { [ENTRY_QUERY_PARAM]: entryId };
  }
}

function familyColor(family: EmotionFamily | null): string {
  return family ? `var(--emotion-${family})` : 'var(--feeling)';
}
