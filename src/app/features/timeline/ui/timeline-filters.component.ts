import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  LOCALE_ID,
  output,
} from '@angular/core';

import { ENTRY_TYPES, EntryIconComponent, EntryType, entryTypeLabel } from '../../../shared/ui';
import {
  PERIOD_PRESETS,
  PeriodPreset,
  presetOf,
  TimelineFilters,
  toggleEmotion,
  toggleTag,
  toggleType,
  withPeriod,
} from '../data/timeline-filters.model';
import { EmotionFamily, TimelineFacets } from '../data/timeline.model';
import { dayLabel, periodAccessibleLabel, periodLabel } from './timeline-labels';

/** Puces d'émotion et de tag montrées (les plus fréquentes, plus celles déjà choisies). */
const MAX_CHIPS = 8;

interface ValueChip {
  value: string;
  label: string;
  count: string;
  selected: boolean;
}

/**
 * Puces de filtre de la timeline (fiche 03, barre d'outils ; M3-03) : Types (Tous + un par type,
 * forme et compteur de `facets.types`), émotions (`facets.emotions`, pastille de famille), tags
 * (`facets.tags`), « Brouillons seulement », période (30 j / 90 j / 1 an / Tout). Les compteurs
 * viennent tels quels des facettes de la dernière réponse ; rien n'est recompté ici. Chaque geste
 * émet les filtres complets suivants ; la page les confie au TimelineFiltersStore.
 */
@Component({
  selector: 'pm-timeline-filters',
  imports: [EntryIconComponent],
  templateUrl: './timeline-filters.component.html',
  styleUrl: './timeline-filters.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimelineFiltersComponent {
  readonly filters = input.required<TimelineFilters>();
  readonly facets = input.required<TimelineFacets>();
  /** Compteurs affichés seulement quand les facettes viennent d'une lecture réussie : pas de « 0 »
   * pendant le chargement ni après une erreur (planche 29). */
  readonly counted = input(true);
  readonly emotionLabels = input<Record<string, string>>({});
  readonly emotionFamilies = input<Record<string, EmotionFamily>>({});
  /** Préférence `entryTypes.medicationVisible` : sans elle, la puce Médicament n'est montrée que choisie. */
  readonly medicationVisible = input(true);
  readonly today = input<Date>(new Date());

  readonly filtersChange = output<TimelineFilters>();

  private readonly locale = inject(LOCALE_ID);
  private readonly number = new Intl.NumberFormat(this.locale);

  protected readonly allTypes = computed(() => this.filters().types.length === 0);

  protected readonly typeChips = computed(() => {
    const { types } = this.filters();
    const counts = this.facets().types;
    return ENTRY_TYPES.filter(
      (type) => type !== 'medication' || this.medicationVisible() || types.includes(type),
    ).map((type) => ({
      type,
      label: entryTypeLabel(type),
      count: this.number.format(counts[type] ?? 0),
      selected: types.includes(type),
    }));
  });

  protected readonly emotionChips = computed(() =>
    this.chips(
      this.facets().emotions,
      this.filters().emotions,
      (code) => this.emotionLabels()[code] ?? code,
    ),
  );

  protected readonly tagChips = computed(() =>
    this.chips(this.facets().tags, this.filters().tags, (tag) => `#${tag}`),
  );

  protected readonly presets = PERIOD_PRESETS;
  protected readonly preset = computed(() => presetOf(this.filters(), this.today()));

  /** Période libre (URL) : ses bornes, affichées à côté des puces, aucune n'étant active. */
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

  protected familyClass(code: string): string {
    const family = this.emotionFamilies()[code];
    return family ? `dot family-${family}` : 'dot';
  }

  protected selectAllTypes(): void {
    if (!this.allTypes()) this.filtersChange.emit({ ...this.filters(), types: [] });
  }

  protected toggleType(type: EntryType): void {
    this.filtersChange.emit(toggleType(this.filters(), type));
  }

  protected toggleEmotion(code: string): void {
    this.filtersChange.emit(toggleEmotion(this.filters(), code));
  }

  protected toggleTag(tag: string): void {
    this.filtersChange.emit(toggleTag(this.filters(), tag));
  }

  protected toggleDrafts(): void {
    this.filtersChange.emit({ ...this.filters(), draftsOnly: !this.filters().draftsOnly });
  }

  protected choosePeriod(preset: PeriodPreset): void {
    if (preset === this.preset()) return;
    this.filtersChange.emit(withPeriod(this.filters(), preset, this.today()));
  }

  /** Les plus fréquentes d'abord, plus celles choisies, même à zéro (on peut toujours les retirer). */
  private chips(
    counts: Record<string, number>,
    selected: readonly string[],
    label: (value: string) => string,
  ): ValueChip[] {
    const frequent = Object.entries(counts)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_CHIPS)
      .map(([value]) => value);
    const values = [...selected, ...frequent.filter((value) => !selected.includes(value))];
    return values.map((value) => ({
      value,
      label: label(value),
      count: this.number.format(counts[value] ?? 0),
      selected: selected.includes(value),
    }));
  }
}
