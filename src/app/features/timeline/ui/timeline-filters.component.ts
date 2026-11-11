import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  LOCALE_ID,
  output,
} from '@angular/core';
import { MatMenuModule } from '@angular/material/menu';

import { ENTRY_TYPES, EntryIconComponent, EntryType, entryTypeLabel } from '../../../shared/ui';
import {
  TimelineFilters,
  toggleEmotion,
  toggleTag,
  toggleType,
} from '../data/timeline-filters.model';
import { EmotionFamily, TimelineFacets } from '../data/timeline.model';

interface ValueChip {
  value: string;
  label: string;
  count: string;
  selected: boolean;
}

/**
 * Première rangée de la barre d'outils de la timeline (fiche 03 ; M3-03 ; UX-B2) : « Types F »,
 * puces de type (Tous + une par type, forme et compteur de `facets.types`), puces des émotions et
 * tags actifs (un clic les retire), bouton « Filtres (n) » qui ouvre le menu des émotions
 * (`facets.emotions`, pastille de famille) et des tags (`facets.tags`), « Brouillons seulement ».
 * Les compteurs viennent tels quels des facettes de la dernière réponse ; rien n'est recompté ici.
 * Chaque geste émet les filtres complets suivants ; la page les confie au TimelineFiltersStore.
 */
@Component({
  selector: 'pm-timeline-filters',
  imports: [EntryIconComponent, MatMenuModule],
  templateUrl: './timeline-filters.component.html',
  styleUrl: './timeline-filters.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimelineFiltersComponent {
  readonly filters = input.required<TimelineFilters>();
  readonly facets = input.required<TimelineFacets>();
  /** Compteurs affichés seulement quand les facettes viennent d'une lecture réussie : pas de « 0 »
   * pendant le chargement ni après une erreur (planche 29). */
  readonly counted = input.required<boolean>();
  readonly emotionLabels = input<Record<string, string>>({});
  readonly emotionFamilies = input<Record<string, EmotionFamily>>({});
  /** Préférence `entryTypes.medicationVisible` : sans elle, la puce Médicament n'est montrée que choisie. */
  readonly medicationVisible = input(true);

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

  /** Total de la plage filtrée (somme des types), à côté de « Tous ». */
  protected readonly allCount = computed(() =>
    this.number.format(
      Object.values(this.facets().types).reduce((sum, n) => sum + (Number.isFinite(n) ? n : 0), 0),
    ),
  );

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

  protected readonly activeEmotions = computed(() =>
    this.emotionChips().filter((chip) => chip.selected),
  );
  protected readonly activeTags = computed(() => this.tagChips().filter((chip) => chip.selected));

  /** Émotions et tags actifs : le chiffre du bouton « Filtres (n) ». */
  protected readonly activeCount = computed(
    () => this.filters().emotions.length + this.filters().tags.length,
  );

  /** Le menu a quelque chose à proposer (facettes, ou filtres actifs à retirer). */
  protected readonly hasMenu = computed(
    () => this.emotionChips().length > 0 || this.tagChips().length > 0,
  );

  protected readonly filtersButtonText = computed(() => {
    const count = this.activeCount();
    return count
      ? $localize`:Bouton du menu des filtres d'émotion et de tag, avec le nombre de filtres actifs@@timeline.filters.menuCount:Filtres (${count}:count:)`
      : $localize`:Bouton du menu des filtres d'émotion et de tag@@timeline.filters.menu:Filtres`;
  });

  protected familyClass(code: string): string {
    const family = this.emotionFamilies()[code];
    return family ? `dot family-${family}` : 'dot';
  }

  /** Nom d'une puce active : son texte visible, puis l'action (WCAG 2.5.3). */
  protected removeLabel(chip: ValueChip): string {
    const text = this.counted() ? `${chip.label} ${chip.count}` : chip.label;
    return $localize`:Nom d'une puce de filtre active de la timeline@@timeline.filters.remove:${text}:text:, retirer le filtre`;
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

  /** Les plus fréquentes d'abord, plus celles choisies, même à zéro (on peut toujours les retirer). */
  private chips(
    counts: Record<string, number>,
    selected: readonly string[],
    label: (value: string) => string,
  ): ValueChip[] {
    const frequent = Object.entries(counts)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
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
