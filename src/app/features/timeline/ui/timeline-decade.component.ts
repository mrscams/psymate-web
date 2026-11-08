import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  LOCALE_ID,
  output,
} from '@angular/core';

import { EntryIconComponent, EntryType, StateAction, StateComponent } from '../../../shared/ui';
import { formatOccurred } from '../../../shared/util';
import { DecadeStatus } from '../data/timeline-decade.store';
import { outsideCount, Plage, plageMonths, TimelinePeriod } from '../data/timeline-decade.model';
import { TimelineItem } from '../data/timeline.model';
import { ChartBand, ChartMonth, decadeChart, intensityTrend } from './timeline-decade.chart';
import { averageLabel, monthLabel, typePluralLabel } from './timeline-labels';

/** Une ligne du tableau des mois (équivalent accessible du graphique). */
interface MonthRow {
  month: number;
  label: string;
  action: string;
  counts: string[];
  average: string | null;
}

/**
 * Vue décennie de la timeline (fiche 03, état C ; M3-04) : SVG maison, sans dépendance, aux couleurs
 * des tokens (classes CSS) ; barres mensuelles empilées par type, courbe d'intensité moyenne des
 * ressentis (axe droit 0–10), repères d'années, marqueur « début du suivi », bandes des situations
 * longues, légende en texte. Double-clic sur un mois : `drill` (la page ouvre le détail du mois).
 * Le graphique est une image nommée (`role="img"`, résumé de la plage, de la tendance et des bandes) ;
 * le tableau des mois en est l'équivalent pour le clavier et les lecteurs d'écran (Entrée sur un mois
 * ouvre son détail). Trois états : chargement, erreur avec « Réessayer », vide.
 */
@Component({
  selector: 'pm-timeline-decade',
  imports: [EntryIconComponent, StateComponent],
  templateUrl: './timeline-decade.component.html',
  styleUrl: './timeline-decade.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimelineDecadeComponent {
  readonly status = input.required<DecadeStatus>();
  /** Code de l'ApiProblem du résumé, en détail de l'erreur. */
  readonly problemCode = input('');
  readonly periods = input.required<TimelinePeriod[]>();
  readonly plage = input.required<Plage | null>();
  /** Types montrés : le filtre de types (le résumé compte tous les types). */
  readonly types = input.required<EntryType[]>();
  /** Situations qui chevauchent la plage (ongoingSituations de la chronologie). */
  readonly situations = input<TimelineItem[]>([]);
  readonly followStart = input<string | null>(null);
  /** Filtres d'émotion, de tag ou de brouillon posés : le résumé ne les connaît pas. */
  readonly partialFilters = input(false);

  /** Rang du mois à ouvrir en détail. */
  readonly drill = output<number>();
  readonly retry = output<void>();

  private readonly locale = inject(LOCALE_ID);
  private readonly number = new Intl.NumberFormat(this.locale);

  protected readonly retryAction: StateAction = {
    label: $localize`:Bouton de l'état erreur de la timeline@@timeline.retry:Réessayer`,
    handler: () => this.retry.emit(),
  };

  protected readonly intensity = computed(() => this.types().includes('feeling'));

  protected readonly chart = computed(() => {
    const plage = this.plage();
    if (!plage) return null;
    return decadeChart({
      plage,
      periods: this.periods(),
      types: this.types(),
      intensity: this.intensity(),
      situations: this.situations(),
      followStart: this.followStart(),
    });
  });

  /** Mois non vides de la plage pour les types montrés. */
  protected readonly filled = computed(
    () =>
      this.chart()?.months.filter(
        (m): m is ChartMonth & { period: TimelinePeriod } => !!m.period && m.total > 0,
      ) ?? [],
  );

  protected readonly state = computed<'loading' | 'error' | 'empty' | null>(() => {
    switch (this.status()) {
      case 'idle':
      case 'loading':
        return 'loading';
      case 'error':
        return 'error';
      case 'loaded':
        return this.filled().length ? null : 'empty';
    }
  });

  protected readonly shownTypes = computed(() =>
    this.chart() ? this.types().map((type) => ({ type, label: typePluralLabel(type) })) : [],
  );

  protected readonly monthCount = computed(() => {
    const plage = this.plage();
    return plage ? plageMonths(plage) : 0;
  });

  protected readonly years = computed(() => Math.floor(this.monthCount() / 12));
  protected readonly extraMonths = computed(() => this.monthCount() % 12);

  protected readonly entryCount = computed(() =>
    this.filled().reduce((sum, m) => sum + m.total, 0),
  );

  protected readonly entryText = computed(() => this.number.format(this.entryCount()));

  protected readonly outside = computed(() => {
    const plage = this.plage();
    return plage ? outsideCount(plage, this.periods()) : 0;
  });

  protected readonly outsideText = computed(() => this.number.format(this.outside()));

  protected readonly startText = computed(() => {
    const plage = this.plage();
    return plage ? monthLabel(plage.start, this.locale) : '';
  });

  protected readonly endText = computed(() => {
    const plage = this.plage();
    return plage ? monthLabel(plage.end, this.locale) : '';
  });

  protected readonly followText = computed(() => {
    const start = this.followStart();
    if (!start) return '';
    const date = new Date(start);
    if (Number.isNaN(date.getTime())) return '';
    const month = new Intl.DateTimeFormat(this.locale, {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(date);
    return $localize`:Marqueur de début du suivi sur l'agrégat par mois@@timeline.decade.followStart:début du suivi · ${month}:month:`;
  });

  /** Nom du graphique : plage, nombre d'entrées, tendance de l'intensité, situations longues. */
  protected readonly ariaLabel = computed(() => {
    const start = monthLabel(this.plage()?.start ?? 0, this.locale, true);
    const end = monthLabel(this.plage()?.end ?? 0, this.locale, true);
    const entries = this.entryText();
    const months = this.number.format(this.filled().length);
    const parts = [
      $localize`:Résumé du graphique de la vue décennie@@timeline.decade.chartLabel:Agrégats par mois de ${start}:start: à ${end}:end: : ${entries}:entries: entrées sur ${months}:months: mois non vides, barres empilées par type.`,
    ];
    const averages = this.filled()
      .map((m) => m.period.averageIntensity)
      .filter((v): v is number => v !== null);
    if (this.intensity() && averages.length) {
      const min = averageLabel(Math.min(...averages), this.locale);
      const max = averageLabel(Math.max(...averages), this.locale);
      const trend = this.trendText();
      parts.push(
        $localize`:Résumé de la courbe d'intensité de la vue décennie@@timeline.decade.chartIntensity:Intensité moyenne des ressentis de ${min}:min: à ${max}:max:${trend}:trend:.`,
      );
    }
    const bands = this.chart()?.bands.length ?? 0;
    if (bands) {
      const count = this.number.format(bands);
      parts.push(
        $localize`:Nombre de bandes de situations longues de la vue décennie@@timeline.decade.chartBands:Situations longues : ${count}:count:.`,
      );
    }
    return parts.join(' ');
  });

  private trendText(): string {
    switch (intensityTrend(this.filled().map((m) => m.period))) {
      case 'up':
        return $localize`:Tendance de l'intensité moyenne, vue décennie@@timeline.decade.trend.up:, en hausse`;
      case 'down':
        return $localize`:Tendance de l'intensité moyenne, vue décennie@@timeline.decade.trend.down:, en baisse`;
      case 'flat':
        return $localize`:Tendance de l'intensité moyenne, vue décennie@@timeline.decade.trend.flat:, stable`;
      default:
        return '';
    }
  }

  /** Lignes du tableau des mois, du plus ancien au plus récent. */
  protected readonly rows = computed<MonthRow[]>(() => {
    const types = this.types();
    return this.filled().map((m) => {
      const label = monthLabel(m.month, this.locale, true);
      const average = m.period.averageIntensity;
      return {
        month: m.month,
        label,
        action: $localize`:Nom du bouton qui ouvre un mois en détail, vue décennie@@timeline.decade.openMonth:${label}:month:, voir le détail`,
        counts: types.map((type) => this.number.format(m.period.counts[type] ?? 0)),
        average: average === null ? null : averageLabel(average, this.locale),
      };
    });
  });

  /** Info-bulle d'un mois (`<title>`) : ses comptes par type et son intensité moyenne. */
  protected monthTitle(m: ChartMonth): string {
    const label = monthLabel(m.month, this.locale);
    if (!m.period || !m.total) {
      return $localize`:Info-bulle d'un mois vide, vue décennie@@timeline.decade.monthEmpty:${label}:month: : aucune entrée`;
    }
    const counts = m.segments
      .map((segment) => `${typePluralLabel(segment.type)} ${this.number.format(segment.count)}`)
      .join(', ');
    const average = m.period.averageIntensity;
    if (average === null || !this.intensity()) {
      return $localize`:Info-bulle d'un mois, vue décennie@@timeline.decade.monthCounts:${label}:month: : ${counts}:counts:`;
    }
    const value = averageLabel(average, this.locale);
    return $localize`:Info-bulle d'un mois avec intensité, vue décennie@@timeline.decade.monthTitle:${label}:month: : ${counts}:counts: · intensité moyenne ${value}:value:`;
  }

  protected countText(value: number): string {
    return this.number.format(value);
  }

  /** Libellé d'une bande : titre et bornes (« depuis juin 2023 · en cours »). */
  protected bandLabel(band: ChartBand): string {
    const title = band.item.title ?? '';
    // Une période (« Arrêt maladie (mai–nov. 2024) ») porte déjà son libellé : pas de doublon.
    const occurred = formatOccurred(band.item.occurred, this.locale);
    const when =
      title && occurred.startsWith(title) ? occurred.slice(title.length).trim() : occurred;
    const name = when ? `${title} · ${when}` : title;
    return band.ongoing
      ? $localize`:Libellé d'une bande de situation en cours, vue décennie@@timeline.decade.bandOngoing:${name}:name: · en cours`
      : name;
  }

  /** Libellé tronqué à la largeur de la bande (caractères de 10 unités : environ 5,6 de large). */
  protected bandText(band: ChartBand): string {
    const label = this.bandLabel(band);
    const room = band.inside ? Math.floor((band.width - 12) / 5.6) : 60;
    return label.length > room ? `${label.slice(0, Math.max(1, room - 1))}…` : label;
  }

  /** Abscisse du libellé d'une bande trop étroite : à gauche si possible, sinon à droite. */
  protected bandTextX(band: ChartBand): number {
    if (band.inside) return band.x + 6;
    return band.x > 400 ? band.x - 6 : band.x + band.width + 6;
  }

  protected bandAnchor(band: ChartBand): 'start' | 'end' {
    return !band.inside && band.x > 400 ? 'end' : 'start';
  }
}
