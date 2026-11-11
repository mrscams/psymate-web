import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  LOCALE_ID,
  output,
} from '@angular/core';

import {
  PERIOD_PRESETS,
  PeriodPreset,
  presetOf,
  TimelineFilters,
  withPeriod,
} from '../data/timeline-filters.model';
import { dayLabel, periodAccessibleLabel, periodLabel } from './timeline-labels';

/**
 * Période de la timeline (fiche 03, barre d'outils, deuxième rangée ; UX-B2) : groupe segmenté
 * 30 j | 90 j | 1 an | Tout, boutons `aria-pressed`. Une période libre (URL, double-clic sur un
 * mois) s'affiche avec ses bornes à côté, aucun bouton n'étant actif. Chaque choix émet les filtres
 * complets suivants ; la page les confie au TimelineFiltersStore.
 */
@Component({
  selector: 'pm-timeline-period',
  template: `
    <div
      class="segmented"
      role="group"
      aria-label="Période"
      i18n-aria-label="Nom du groupe de période de la timeline@@timeline.filters.period"
    >
      @for (option of presets; track option) {
        <button
          type="button"
          [attr.aria-pressed]="option === preset()"
          [attr.title]="periodName(option)"
          [attr.data-period]="option"
          (click)="choose(option)"
        >
          {{ periodText(option) }}
        </button>
      }
    </div>
    @if (customPeriod(); as period) {
      <span class="custom">{{ period }}</span>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .segmented {
      display: inline-flex;
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      overflow: hidden;
    }

    button {
      min-height: 28px;
      padding: 0 10px;
      border: 0;
      background: var(--surface-raised);
      color: var(--text-secondary);
      font: var(--mat-sys-label-medium);
      cursor: pointer;

      & + button {
        border-left: 1px solid var(--border-subtle);
      }

      &[aria-pressed='true'] {
        background: var(--primary-tint);
        color: var(--primary-hover);
        font-weight: 600;
      }

      &:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: -2px;
      }
    }

    .custom {
      color: var(--text-secondary);
      font-family: var(--font-mono);
      font-size: 12px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimelinePeriodComponent {
  readonly filters = input.required<TimelineFilters>();
  readonly today = input<Date>(new Date());
  readonly filtersChange = output<TimelineFilters>();

  private readonly locale = inject(LOCALE_ID);

  protected readonly presets = PERIOD_PRESETS;
  protected readonly preset = computed(() => presetOf(this.filters(), this.today()));

  /** Période libre (URL, mois ouvert) : ses bornes, aucune puce n'étant active. */
  protected readonly customPeriod = computed(() => {
    if (this.preset() !== null) return null;
    const { from, to } = this.filters();
    const start = from ? dayLabel(from, this.locale) : '…';
    const end = to ? dayLabel(to, this.locale) : '…';
    return $localize`:Période libre des filtres de la timeline@@timeline.period.custom:Du ${start}:start: au ${end}:end:`;
  });

  protected periodText(preset: PeriodPreset): string {
    return periodLabel(preset);
  }

  /**
   * Forme longue d'une période (« 30 derniers jours » pour « 30 j »), en description (title) : le
   * nom accessible reste le texte visible (WCAG 2.5.3, commande vocale).
   */
  protected periodName(preset: PeriodPreset): string {
    return periodAccessibleLabel(preset);
  }

  protected choose(preset: PeriodPreset): void {
    if (preset === this.preset()) return;
    this.filtersChange.emit(withPeriod(this.filters(), preset, this.today()));
  }
}
