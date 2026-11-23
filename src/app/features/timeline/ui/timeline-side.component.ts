import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  LOCALE_ID,
  output,
} from '@angular/core';

import { formatLocale } from '../../../core/i18n';
import { EntryIconComponent, EntryType, StateAction, StateComponent } from '../../../shared/ui';
import { EmotionFamily, TimelineFacets } from '../data/timeline.model';
import { typePluralLabel } from './timeline-labels';

/** Ordre des types de la colonne et des puces (maquette 03). */
export const SUMMARY_TYPES: readonly EntryType[] = [
  'feeling',
  'note',
  'event',
  'situation',
  'medication',
];

/**
 * Colonne de résumé de la timeline (proposition 03, `.tl-side`, UX-S9) : « Sur la période ·
 * 90 jours », « 15 entrées · 2 séances », le compte par type ; « Émotions notées » (les émotions
 * de la période, cliquables : une émotion filtre la timeline, côté serveur) ; « Raccourcis ». Tout
 * vient des facettes de la dernière réponse (`facets.types`, `facets.emotions`) : rien n'est calculé
 * ici au-delà de les additionner. Trois états : squelette pendant la lecture, rien de faux après
 * une erreur (l'erreur est dite par le flux), le résumé une fois lu.
 */
@Component({
  selector: 'pm-timeline-side',
  imports: [EntryIconComponent, StateComponent],
  templateUrl: './timeline-side.component.html',
  styleUrl: './timeline-side.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimelineSideComponent {
  readonly status = input.required<'loading' | 'loaded' | 'error'>();
  readonly facets = input.required<TimelineFacets>();
  /** La période en toutes lettres (« 90 jours »). */
  readonly span = input('');
  readonly emotionLabels = input<Record<string, string>>({});
  readonly emotionFamilies = input<Record<string, EmotionFamily>>({});
  /** Émotions du filtre courant (puces pressées). */
  readonly selected = input<readonly string[]>([]);
  readonly retry = input<StateAction | undefined>(undefined);

  readonly emotionToggled = output<string>();

  private readonly locale = formatLocale(inject(LOCALE_ID));
  private readonly number = new Intl.NumberFormat(this.locale);

  protected readonly sessions = computed(() => this.facets().types['session'] ?? 0);
  protected readonly entries = computed(() =>
    Object.entries(this.facets().types).reduce(
      (sum, [type, n]) => (type === 'session' || !Number.isFinite(n) ? sum : sum + n),
      0,
    ),
  );

  protected readonly headline = computed(() => {
    const entries = this.number.format(this.entries());
    const sessions = this.number.format(this.sessions());
    const left =
      this.entries() === 1
        ? $localize`:Nombre d'entrées de la période, colonne de résumé de la timeline@@timeline.side.entry:1 entrée`
        : $localize`:Nombre d'entrées de la période, colonne de résumé de la timeline@@timeline.side.entries:${entries}:count: entrées`;
    const right =
      this.sessions() === 0
        ? $localize`:Aucune séance sur la période, colonne de résumé de la timeline@@timeline.side.noSession:aucune séance`
        : this.sessions() === 1
          ? $localize`:Une séance sur la période, colonne de résumé de la timeline@@timeline.side.session:1 séance`
          : $localize`:Séances de la période, colonne de résumé de la timeline@@timeline.side.sessions:${sessions}:count: séances`;
    return `${left} · ${right}`;
  });

  protected readonly types = computed(() => {
    const counts = this.facets().types;
    return SUMMARY_TYPES.filter((type) => (counts[type] ?? 0) > 0).map((type) => ({
      type,
      label: typePluralLabel(type),
      count: this.number.format(counts[type] ?? 0),
    }));
  });

  /** Les émotions de la période, les plus notées d'abord, plus celles du filtre même à zéro. */
  protected readonly emotions = computed(() => {
    const counts = this.facets().emotions;
    const selected = this.selected();
    const frequent = Object.entries(counts)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([code]) => code);
    const codes = [...selected.filter((code) => !frequent.includes(code)), ...frequent];
    return codes.map((code) => {
      const family = this.emotionFamilies()[code];
      return {
        code,
        label: this.emotionLabels()[code] ?? code,
        count: this.number.format(counts[code] ?? 0),
        dot: family ? `emo family-${family}` : 'emo',
        selected: selected.includes(code),
      };
    });
  });

  protected readonly periodTitle = computed(() =>
    this.span()
      ? $localize`:Titre du résumé de la période de la timeline@@timeline.side.period:Sur la période · ${this.span()}:span:`
      : $localize`:Titre du résumé de la période de la timeline, sans période@@timeline.side.periodNone:Sur la période`,
  );
}
