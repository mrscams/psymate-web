import { A11yModule } from '@angular/cdk/a11y';
import { CdkConnectedOverlay, CdkOverlayOrigin, ConnectedPosition } from '@angular/cdk/overlay';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  LOCALE_ID,
  output,
  signal,
  viewChild,
} from '@angular/core';

import { EntryIconComponent, EntryType } from '../../../shared/ui';
import {
  TimelineFilters,
  toggleEmotion,
  toggleTag,
  toggleType,
} from '../data/timeline-filters.model';
import { EmotionFamily, TimelineFacets } from '../data/timeline.model';
import { typePluralLabel } from './timeline-labels';
import { SUMMARY_TYPES } from './timeline-side.component';

interface ValueChip {
  value: string;
  label: string;
  count: string;
  selected: boolean;
}

/**
 * Puces et filtres de la barre d'outils (proposition 03, `.tl-toolbar`, UX-S9) : « Tout n » et une
 * puce par type (forme et compteur de `facets.types`, au pluriel : Ressentis, Notes, Événements,
 * Situations, Médicaments), puis un seul bouton « Filtres » qui dit ce qu'il propose (« · émotion,
 * tag, brouillons ») ou combien sont actifs (« · 2 ») et ouvre un panneau : émotions
 * (`facets.emotions`, pastille de famille), tags (`facets.tags`), « Brouillons seulement ». Sur
 * téléphone, la page y range aussi la période, le mode et le zoom (contenu projeté `[filtersExtra]`).
 * Les compteurs viennent tels quels des facettes ; chaque geste émet les filtres complets suivants
 * (filtrage serveur, jamais client).
 */
@Component({
  selector: 'pm-timeline-filters',
  imports: [A11yModule, CdkConnectedOverlay, CdkOverlayOrigin, EntryIconComponent],
  templateUrl: './timeline-filters.component.html',
  styleUrl: './timeline-filters.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimelineFiltersComponent {
  readonly filters = input.required<TimelineFilters>();
  readonly facets = input.required<TimelineFacets>();
  /** Compteurs affichés seulement quand les facettes viennent d'une lecture réussie. */
  readonly counted = input.required<boolean>();
  readonly emotionLabels = input<Record<string, string>>({});
  readonly emotionFamilies = input<Record<string, EmotionFamily>>({});
  /** Préférence `entryTypes.medicationVisible` : sans elle, la puce Médicaments n'est montrée que choisie. */
  readonly medicationVisible = input(true);

  readonly filtersChange = output<TimelineFilters>();

  private readonly locale = inject(LOCALE_ID);
  private readonly number = new Intl.NumberFormat(this.locale);
  private readonly button = viewChild.required<ElementRef<HTMLButtonElement>>('filtersButton');

  /** Panneau des filtres ouvert (état d'écran). */
  protected readonly open = signal(false);
  protected readonly positions: ConnectedPosition[] = [
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 6 },
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 6 },
  ];

  protected readonly allTypes = computed(() => this.filters().types.length === 0);

  /** Puces de type : l'ordre de la maquette ; Séances seulement quand le filtre la porte. */
  protected readonly typeChips = computed(() => {
    const { types } = this.filters();
    const counts = this.facets().types;
    const shown: EntryType[] = SUMMARY_TYPES.filter(
      (type) => type !== 'medication' || this.medicationVisible() || types.includes(type),
    );
    if (types.includes('session')) shown.push('session');
    return shown.map((type) => ({
      type,
      label: typePluralLabel(type),
      count: this.number.format(counts[type] ?? 0),
      selected: types.includes(type),
    }));
  });

  /** Total de la plage filtrée (somme des types), à côté de « Tout ». */
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

  /** Émotions, tags et « Brouillons seulement » actifs : le chiffre du bouton « Filtres · n ». */
  protected readonly activeCount = computed(() => {
    const { emotions, tags, draftsOnly } = this.filters();
    return emotions.length + tags.length + (draftsOnly ? 1 : 0);
  });

  protected readonly buttonName = computed(() => {
    const count = this.activeCount();
    return count
      ? $localize`:Nom du bouton des filtres de la timeline, avec le nombre de filtres actifs@@timeline.filters.buttonActive:Filtres · ${count}:count: actifs`
      : $localize`:Nom du bouton des filtres de la timeline@@timeline.filters.button:Filtres · émotion, tag, brouillons`;
  });

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

  protected toggle(): void {
    this.open.update((open) => !open);
  }

  /** Échap ou clic ailleurs : le panneau se ferme, le focus revient au bouton (Échap). */
  protected close(restore: boolean): void {
    if (!this.open()) return;
    this.open.set(false);
    if (restore) this.button().nativeElement.focus();
  }

  protected onOverlayKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close(true);
    }
  }

  protected onOutsideClick(event: MouseEvent): void {
    // Le bouton lui-même bascule le panneau (sinon il se fermerait puis se rouvrirait).
    if (this.button().nativeElement.contains(event.target as Node)) return;
    this.close(false);
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
