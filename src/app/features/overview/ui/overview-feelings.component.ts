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
import { Loadable, StateKind, uniqueId } from '../../../shared/util';
import { ENTRY_QUERY_PARAM } from '../../entries';
import { blockState, isFeelingsEmpty, OverviewView } from '../data/overview.model';
import { FeelingsChartComponent } from './feelings-chart.component';
import { FeelingsChartData, FeelingsChartLabels } from './feelings-chart.options';
import {
  feelingsSummary,
  formatDay,
  formatIntensity,
  formatShortDay,
  localDay,
  trendSummary,
  windowLongLabel,
} from './overview-labels';
import { OverviewSectionComponent } from './overview-section.component';

/**
 * Section « Comment évoluent les ressentis » (UX-S6, proposition 02) : titre, compteur (« 90 jours
 * · 9 ressentis · chaque point est une entrée ») et « Voir les données » à droite ; puis la seule
 * boîte de la page (`.panel.pad.chart`) : le graphe (ECharts en @defer, hors du bundle initial) et
 * sa légende (« Anxiété 4 · Tristesse 2 … · séance · traitement »). Un clic sur un point ouvre le
 * ressenti. « Voir les données » déplie le tableau des ressentis, alternative accessible au graphe
 * (qui porte aussi `role="img"` et une description).
 */
@Component({
  selector: 'pm-overview-feelings',
  imports: [FeelingsChartComponent, OverviewSectionComponent, RouterLink, StateComponent],
  template: `
    <pm-overview-section
      heading="Comment évoluent les ressentis"
      i18n-heading="Titre de la section des ressentis@@overview.feelings.heading"
      [state]="state()"
      emptyTitle="Pas encore de ressentis sur cette période"
      i18n-emptyTitle="Bloc des ressentis vide@@overview.simple.feelings.empty.title"
      emptyMessage="Chaque ressenti noté apparaîtra ici, avec son intensité sur 10."
      i18n-emptyMessage="Bloc des ressentis vide@@overview.simple.feelings.empty.message"
      errorTitle="Ressentis indisponibles"
      i18n-errorTitle="Erreur du bloc des ressentis@@overview.simple.feelings.error"
      [refreshing]="refreshing()"
      [lines]="5"
      (retry)="retry.emit()"
    >
      @if (view()) {
        <span sectCount i18n="Compteur de la section des ressentis@@overview.feelings.count"
          >{{ period() }} ·
          {count(), plural, =0 {aucun ressenti} =1 {1 ressenti} other {{{count()}} ressentis}} ·
          chaque point est une entrée</span
        >
      }
      @if (view() && !state()) {
        <button
          sectLink
          type="button"
          class="link"
          [attr.aria-expanded]="showData()"
          [attr.aria-controls]="dataId"
          (click)="showDataChange.emit(!showData())"
        >
          @if (showData()) {
            <ng-container i18n="Bouton qui replie les données du graphe@@overview.feelings.dataHide"
              >Masquer les données</ng-container
            >
          } @else {
            <ng-container
              i18n="
                Bouton qui déplie les données du graphe des ressentis@@overview.simple.feelings.data"
              >Voir les données</ng-container
            >
          }
        </button>
      }
      @if (view(); as v) {
        <div class="panel">
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
                <i class="emo" [style.background]="item.color" aria-hidden="true"></i>
                <span>{{ item.label }} {{ item.count }}</span>
              </li>
            }
            @if (v.feelings.ticks.length) {
              <li class="end">
                <i class="key session" aria-hidden="true"></i>
                <span i18n="Légende du graphe : repère de séance@@overview.feelings.legend.session"
                  >séance</span
                >
              </li>
            }
            @if (hasMedication()) {
              <li [class.end]="!v.feelings.ticks.length">
                <i class="key medication" aria-hidden="true"></i>
                <span
                  i18n="
                    Légende du graphe : repère de traitement@@overview.feelings.legend.medication"
                  >traitement</span
                >
              </li>
            }
          </ul>
          <div class="data" [id]="dataId" [hidden]="!showData()">
            <table>
              <caption
                i18n="
                  Légende du tableau des ressentis de la vue
                  simple@@overview.simple.feelings.data.caption"
              >
                Ressentis notés sur la période
              </caption>
              <thead>
                <tr>
                  <th scope="col" i18n="Colonne du tableau des ressentis@@overview.trend.data.date">
                    Date
                  </th>
                  <th
                    scope="col"
                    i18n="Colonne du tableau des ressentis@@overview.trend.data.emotion"
                  >
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
                @for (point of v.feelings.points; track point.entryId) {
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
          </div>
        </div>
      }
    </pm-overview-section>
  `,
  styles: `
    :host {
      display: block;
    }
    .link {
      padding: 0;
      border: 0;
      background: none;
      color: var(--primary);
      font: inherit;
      cursor: pointer;
    }
    .link:hover {
      text-decoration: underline;
    }
    .panel {
      padding: 16px 18px;
      background: var(--surface-raised);
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
    }
    .figure,
    .chart-placeholder {
      min-height: 210px;
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 16px;
      margin: 8px 0 0;
      padding: 0;
      list-style: none;
      font-size: 12.5px;
      color: var(--text-secondary);
    }
    .legend li {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .legend .end {
      margin-left: auto;
    }
    .emo {
      display: inline-block;
      width: 9px;
      height: 9px;
      border-radius: 50%;
      flex: none;
    }
    .key.session {
      display: inline-block;
      width: 2px;
      height: 12px;
      background: var(--entry-session);
    }
    .key.medication {
      display: inline-block;
      width: 14px;
      height: 0;
      border-top: 1.5px dashed var(--entry-medication);
    }
    .data:not([hidden]) {
      margin-top: 12px;
    }
    table {
      width: 100%;
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
      border-bottom: 1px solid var(--border-subtle);
    }
    a {
      color: var(--primary);
    }
    .link:focus-visible,
    a:focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: 2px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverviewFeelingsComponent {
  /** La synthèse du store (gardée pendant une relecture). */
  readonly overview = input.required<Loadable<OverviewView>>();
  readonly refreshing = input(false);
  readonly retry = output<void>();
  /** Clic sur un point du graphe (ou une ligne du tableau) : l'entrée du ressenti. */
  readonly pointSelected = output<string>();

  private readonly locale = inject(LOCALE_ID);

  protected readonly view = computed(() => this.overview().data);
  protected readonly state = computed<StateKind | null>(() =>
    blockState(this.overview(), isFeelingsEmpty),
  );
  /** Tableau des ressentis déplié (« Voir les données ») : rangé par la page (mémoire du dossier). */
  readonly showData = input(false);
  readonly showDataChange = output<boolean>();
  protected readonly dataId = uniqueId('overview-feelings-data');

  protected readonly period = computed(() => windowLongLabel(this.view()?.window ?? '90d'));
  protected readonly count = computed(() => this.view()?.feelings.points.length ?? 0);

  protected readonly failedTitle = $localize`:Le graphe des ressentis ne s'est pas chargé@@overview.simple.feelings.failed:Graphe indisponible`;

  /** Description pour les lecteurs d'écran : la courbe des moyennes, puis chaque émotion. */
  protected readonly summary = computed(() => {
    const view = this.view();
    if (!view) return '';
    return `${trendSummary(view.trend, view.feelings.points.length, view.window, this.locale)} ${feelingsSummary(view.feelings, view.window)}`;
  });

  protected readonly chartData = computed<FeelingsChartData>(() => {
    const view = this.view();
    return {
      trend: view?.trend ?? { points: [], markers: [] },
      feelings: view?.feelings ?? { points: [], series: [], markers: [], ticks: [] },
    };
  });

  /** Légende : chaque émotion de la fenêtre (ordre du serveur), sa couleur de famille, son nombre. */
  protected readonly legend = computed(() =>
    (this.view()?.feelings.series ?? []).map((series) => ({
      code: series.emotionCode,
      label: series.label,
      count: series.count,
      color: series.family ? `var(--emotion-${series.family})` : 'var(--feeling)',
    })),
  );

  protected readonly hasMedication = computed(
    () => this.view()?.feelings.markers.some((m) => m.kind === 'medication') ?? false,
  );

  private readonly emotionLabels = computed(() => {
    const labels = new Map<string, string>();
    for (const series of this.view()?.feelings.series ?? []) {
      labels.set(series.emotionCode, series.label);
    }
    return labels;
  });

  protected readonly chartLabels: FeelingsChartLabels = {
    average: $localize`:Courbe du graphe des ressentis, dans l'infobulle@@overview.feelings.average:Moyenne sur 7 jours`,
    session: $localize`:Repère de séance sur la courbe@@overview.trend.session:Séance`,
    medicationStart: $localize`:Repère de début de médicament@@overview.trend.medicationStart:Début de traitement`,
    medicationEnd: $localize`:Repère de fin de médicament@@overview.trend.medicationEnd:Fin de traitement`,
    emotion: (code) => this.emotion(code),
    day: (value) =>
      formatShortDay(typeof value === 'number' ? localDay(value) : value, this.locale),
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
