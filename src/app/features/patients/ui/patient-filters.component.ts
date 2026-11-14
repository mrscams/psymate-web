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

import { subjectLabel, SubjectVocabulary } from '../../../core/i18n';
import { PATIENT_SORTS, PatientSort, QUICK_FILTERS, QuickFilter } from '../data/patient.model';
import { quickFilterLabel, sortLabel } from './patient-labels';

/**
 * Rangée `.quick` de la liste (maquette 01, UX-S7) : champ « Filtrer par nom ou tag… » (`/` affiché,
 * « #tag » filtre par tag), filtres rapides en un seul groupe segmenté Tous · Aujourd'hui · À
 * surveiller · Brouillons, sans compte (décision 4 du 14 novembre 2026, `aria-pressed`), puis « Trier
 * par ». Entrée ouvre le premier résultat, ↓ descend dans le tableau, Échap vide le filtre.
 * Composant bête : la page relaie vers le store.
 */
@Component({
  selector: 'pm-patient-filters',
  templateUrl: './patient-filters.component.html',
  styleUrl: './patient-filters.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatientFiltersComponent {
  readonly query = model('');
  readonly sort = input<PatientSort>('name');
  readonly quick = input<QuickFilter>('all');

  readonly sortChange = output<PatientSort>();
  readonly quickChange = output<QuickFilter>();
  /** Entrée dans le filtre : ouvrir le premier résultat. */
  readonly openFirst = output<void>();
  /** ↓ dans le filtre : passer à la première ligne du tableau. */
  readonly arrowDown = output<void>();

  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('filter');
  private readonly vocabulary = inject(SubjectVocabulary);

  protected readonly sorts = PATIENT_SORTS.map((value) => ({ value, label: sortLabel(value) }));
  protected readonly filterLabel = computed(() => {
    const subjects = subjectLabel(this.vocabulary.label(), 'many');
    return $localize`:Étiquette du filtre de la liste@@patients.filter.label:Filtrer les ${subjects}:subjects: par nom ou par tag`;
  });
  protected readonly placeholder = $localize`:Texte indicatif du filtre de la liste@@patients.filter.placeholder:Filtrer par nom ou tag…`;

  protected readonly chips = computed(() =>
    QUICK_FILTERS.map((value) => ({
      value,
      label: quickFilterLabel(value),
      pressed: this.quick() === value,
    })),
  );

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
