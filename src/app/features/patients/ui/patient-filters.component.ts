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
import { PATIENT_SORTS, PatientSort, PractitionerTag } from '../data/patient.model';
import { sortLabel } from './patient-labels';

/**
 * Barre d'outils de la liste (fiche 01) : filtre par nom (accents ignorés côté API), tri, puces
 * rapides par tag (`aria-pressed`), bascule « Afficher les archivés ». Entrée ouvre le premier
 * résultat, Échap vide le filtre. Composant bête : la page relaie vers le store.
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
  readonly tags = input<PractitionerTag[]>([]);
  readonly activeTag = input<string | null>(null);
  readonly archived = input(false);

  readonly sortChange = output<PatientSort>();
  readonly tagChange = output<string | null>();
  readonly archivedChange = output<boolean>();
  /** Entrée dans le filtre : ouvrir le premier résultat. */
  readonly openFirst = output<void>();

  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('filter');
  private readonly vocabulary = inject(SubjectVocabulary);

  protected readonly sorts = PATIENT_SORTS.map((value) => ({ value, label: sortLabel(value) }));
  protected readonly filterLabel = computed(() => {
    const subjects = subjectLabel(this.vocabulary.label(), 'many');
    return $localize`:Étiquette du filtre de la liste@@patients.filter.label:Filtrer les ${subjects}:subjects: par nom`;
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
