import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { debounceTime } from 'rxjs';

import { initials, uniqueId } from '../../../shared/util';
import { PatientOption } from '../data/agenda.model';
import { PatientSearchStore } from '../data/patient-search.store';

/** Délai des lectures déclenchées par la saisie (recherche, conflits), fiche 15b. */
export const INPUT_DEBOUNCE_MS = 300;

/**
 * Sélecteur de patient de l'agenda (fiche 15b) : carte du patient choisi (initiales, nom, ligne
 * d'information, « Changer »), puis recherche parmi les patients actifs en `combobox` avec sa liste
 * `listbox` (↓ ↑ parcourent, Entrée choisit, Échap ferme la liste). Le libellé et les erreurs du
 * champ restent au formulaire parent : l'erreur se lie par l'identifiant `<inputId>-error`. Servi
 * par le panneau « Nouveau rendez-vous » et par « Rattacher à un patient » du détail (M14-15).
 */
@Component({
  selector: 'pm-patient-picker',
  imports: [ReactiveFormsModule],
  providers: [PatientSearchStore],
  templateUrl: './patient-picker.component.html',
  styleUrl: './patient-picker.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatientPickerComponent {
  /** Identifiant du champ de recherche (cible du `<label for>` du parent). */
  readonly inputId = input.required<string>();
  /** Patient choisi, montré en carte ; null tant qu'aucun ne l'est. */
  readonly chosen = input<PatientOption | null>(null);
  /** Ligne sous le nom dans la carte (âge, rythme…). */
  readonly meta = input('');
  readonly invalid = input(false);
  /**
   * Dans un dialogue CDK : pose `cdkFocusInitial` sur « Changer » (patient prérempli) ou sur la
   * recherche, pour que le piège de focus du panneau les prenne à l'ouverture.
   */
  readonly focusInitial = input(false);
  readonly picked = output<PatientOption>();

  protected readonly store = inject(PatientSearchStore);
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('search');

  protected readonly listboxId = uniqueId('agenda-patients');
  protected readonly searchPlaceholder = $localize`:Champ de recherche d'un patient@@agenda.new.searchPlaceholder:Rechercher un patient…`;
  protected readonly otherPlaceholder = $localize`:Champ de recherche d'un autre patient@@agenda.new.searchOther:Ou rechercher un autre patient…`;
  protected readonly noResults = $localize`:Recherche de patient sans résultat@@agenda.new.noResults:Aucun patient actif ne correspond.`;
  protected readonly searching = $localize`:Recherche de patient en cours@@agenda.new.searching:Recherche…`;
  protected readonly searchFailed = $localize`:Recherche de patient en erreur@@agenda.new.searchFailed:La recherche n'a pas abouti. Réessayez.`;

  protected readonly patientInitials = computed(() => initials(this.chosen()?.displayName ?? ''));

  /** Recherche : seul l'identifiant du patient choisi part au serveur, par le parent. */
  protected readonly searchControl = new FormControl('', { nonNullable: true });
  protected readonly listOpen = signal(false);
  protected readonly activeIndex = signal(-1);

  protected readonly results = computed(() => this.store.results().data ?? []);
  protected readonly activeId = computed(() => {
    const index = this.activeIndex();
    return index >= 0 && this.listOpen() ? `${this.listboxId}-${index}` : null;
  });

  constructor() {
    this.searchControl.valueChanges
      .pipe(debounceTime(INPUT_DEBOUNCE_MS), takeUntilDestroyed())
      .subscribe((query) => {
        this.activeIndex.set(-1);
        void this.store.search(query);
      });
    this.searchControl.valueChanges.pipe(takeUntilDestroyed()).subscribe((query) => {
      this.listOpen.set(query.trim().length > 0);
    });
  }

  /** Donne le focus à la recherche (« Changer », ouverture d'un formulaire). */
  focus(): void {
    this.searchInput()?.nativeElement.focus();
  }

  protected choose(patient: PatientOption): void {
    this.searchControl.setValue('', { emitEvent: false });
    this.listOpen.set(false);
    this.activeIndex.set(-1);
    this.store.clear();
    this.picked.emit(patient);
  }

  /** Clavier de la recherche : ↓ ↑ parcourent la liste, Entrée choisit, Échap la ferme. */
  protected onSearchKey(event: KeyboardEvent): void {
    const count = this.results().length;
    switch (event.key) {
      case 'ArrowDown':
        if (count === 0) return;
        event.preventDefault();
        this.listOpen.set(true);
        this.activeIndex.update((index) => (index + 1) % count);
        return;
      case 'ArrowUp':
        if (count === 0) return;
        event.preventDefault();
        this.activeIndex.update((index) => (index <= 0 ? count - 1 : index - 1));
        return;
      case 'Enter': {
        const option = this.results()[this.activeIndex()];
        if (!this.listOpen() || !option) return;
        event.preventDefault();
        this.choose(option);
        return;
      }
      case 'Escape':
        if (!this.listOpen()) return;
        event.preventDefault();
        event.stopPropagation();
        this.listOpen.set(false);
        return;
    }
  }
}
