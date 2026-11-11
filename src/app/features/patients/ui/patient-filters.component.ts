import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  model,
  output,
  viewChild,
} from '@angular/core';
import { MatMenuModule } from '@angular/material/menu';

import { subjectLabel, SubjectVocabulary } from '../../../core/i18n';
import {
  PATIENT_SORTS,
  PatientSort,
  PractitionerTag,
  QUICK_FILTERS,
  QuickFilter,
} from '../data/patient.model';
import { QuickCounts } from '../data/patient-list.store';
import { quickFilterLabel, sortLabel } from './patient-labels';

/**
 * Barre d'outils de la liste (fiche 01, maquette 01, UX-B1) : filtre par nom (accents ignorés côté
 * API, `/` affiché dans le champ), tri, filtres rapides Tous · Aujourd'hui · Flags · Brouillons
 * (`aria-pressed`, avec leur compte), et les tags dans un menu « Tags ▾ ». Entrée ouvre le premier
 * résultat, ↓ descend dans le tableau, Échap vide le filtre. Composant bête : la page relaie vers
 * le store.
 */
@Component({
  selector: 'pm-patient-filters',
  imports: [MatMenuModule],
  templateUrl: './patient-filters.component.html',
  styleUrl: './patient-filters.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatientFiltersComponent {
  readonly query = model('');
  readonly sort = input<PatientSort>('lastSession');
  readonly quick = input<QuickFilter>('all');
  readonly counts = input<QuickCounts | null>(null);
  readonly tags = input<PractitionerTag[]>([]);
  readonly activeTag = input<string | null>(null);

  readonly sortChange = output<PatientSort>();
  readonly quickChange = output<QuickFilter>();
  readonly tagChange = output<string | null>();
  /** Entrée dans le filtre : ouvrir le premier résultat. */
  readonly openFirst = output<void>();
  /** ↓ dans le filtre : passer à la première ligne du tableau. */
  readonly arrowDown = output<void>();

  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('filter');
  private readonly vocabulary = inject(SubjectVocabulary);

  protected readonly sorts = PATIENT_SORTS.map((value) => ({ value, label: sortLabel(value) }));
  protected readonly filterLabel = computed(() => {
    const subjects = subjectLabel(this.vocabulary.label(), 'many');
    return $localize`:Étiquette du filtre de la liste@@patients.filter.label:Filtrer les ${subjects}:subjects: par nom`;
  });
  protected readonly placeholder = $localize`:Texte indicatif du filtre de la liste@@patients.filter.placeholder:Filtrer par nom… (accents ignorés)`;

  /** Puces rapides avec leur compte (absent tant que le résumé ne couvre pas toute la liste). */
  protected readonly chips = computed(() => {
    const counts = this.counts();
    return QUICK_FILTERS.map((value) => {
      const count = counts ? counts[value] : null;
      const label = quickFilterLabel(value);
      return {
        value,
        label,
        count,
        text: count === null ? label : `${label} · ${count}`,
        pressed: this.quick() === value,
      };
    });
  });

  protected readonly tagsButton = computed(() => {
    const tag = this.activeTag();
    return tag === null
      ? $localize`:Bouton du menu des tags@@patients.tags.button:Tags`
      : $localize`:Bouton du menu des tags, un tag choisi@@patients.tags.buttonActive:Tag : #${tag}:tag:`;
  });

  /** Touche `/` : focus dans le filtre. */
  focus(): void {
    const element = this.input().nativeElement;
    element.focus();
    element.select();
  }

  protected onInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.openFirst.emit();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.arrowDown.emit();
    } else if (event.key === 'Escape' && this.query() !== '') {
      event.preventDefault();
      event.stopPropagation();
      this.query.set('');
    }
  }

  protected onSort(event: Event): void {
    this.sortChange.emit((event.target as HTMLSelectElement).value as PatientSort);
  }
}
