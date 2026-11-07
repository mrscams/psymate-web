import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { Router, RouterLink } from '@angular/router';

import { subjectLabel, SubjectVocabulary } from '../../../core/i18n';
import { ShortcutService } from '../../../core/shortcuts';
import { StateAction, StateComponent } from '../../../shared/ui';
import { isRefreshing, stateKind } from '../../../shared/util';
import { PatientListStore } from '../data/patient-list.store';
import { TagStore } from '../data/tag.store';
import { PatientFiltersComponent } from '../ui/patient-filters.component';
import { PatientTableComponent } from '../ui/patient-table.component';

/** Attente avant d'envoyer le filtre (fiche 01 : debounce 250 ms). */
export const FILTER_DEBOUNCE_MS = 250;

/**
 * /patients (fiche 01, B4 écran 1) : filtre, tri, puces de tags, archivés, tableau, « Afficher
 * plus » par curseur. Raccourcis : N ouvre la création, / focalise le filtre. Trois états par
 * pm-state ; une erreur de rechargement laisse la liste précédente affichée avec un bandeau.
 */
@Component({
  selector: 'pm-patient-list-page',
  imports: [
    MatButtonModule,
    RouterLink,
    StateComponent,
    PatientFiltersComponent,
    PatientTableComponent,
  ],
  templateUrl: './patient-list.page.html',
  styleUrl: './patient-list.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatientListPage {
  protected readonly store = inject(PatientListStore);
  protected readonly tags = inject(TagStore);
  private readonly router = inject(Router);
  private readonly vocabulary = inject(SubjectVocabulary);
  private readonly filters = viewChild.required(PatientFiltersComponent);

  /** Texte du filtre affiché tout de suite ; envoyé au store après la pause de frappe. */
  protected readonly query = signal(this.store.query());
  private timer: ReturnType<typeof setTimeout> | undefined;
  private destroyed = false;

  protected readonly title = computed(() => {
    const subjects = subjectLabel(this.vocabulary.label(), 'many');
    return $localize`:Titre de la liste des patients@@patients.list.title:Mes ${subjects}:subjects:`;
  });
  protected readonly newLabel = computed(() => {
    const subject = subjectLabel(this.vocabulary.label(), 'one');
    return $localize`:Bouton de création@@patients.list.new:Nouveau ${subject}:subject:`;
  });

  protected readonly kind = computed(() => stateKind(this.store.page()));
  protected readonly refreshing = computed(() => isRefreshing(this.store.page()));
  /** Erreur de rechargement alors qu'une liste est déjà affichée : bandeau, liste conservée. */
  protected readonly staleError = computed(
    () => this.store.page().status === 'error' && this.kind() === null,
  );

  protected readonly emptyTitle = computed(() => {
    const subject = subjectLabel(this.vocabulary.label(), 'one');
    return this.store.filtered()
      ? $localize`:État vide de la liste filtrée@@patients.empty.filtered:Aucun ${subject}:subject: ne correspond`
      : $localize`:État vide de la liste@@patients.empty.title:Créez votre premier ${subject}:subject:`;
  });
  protected readonly emptyAction = computed<StateAction>(() =>
    this.store.filtered()
      ? {
          label: $localize`:Action de l'état vide filtré@@patients.empty.clear:Effacer les filtres`,
          handler: () => this.clearFilters(),
        }
      : { label: this.newLabel(), shortcut: 'N', handler: () => this.create() },
  );
  protected readonly retry: StateAction = {
    label: $localize`:Bouton de l'état erreur@@state.error.retry:Réessayer`,
    handler: () => void this.store.reload(),
  };
  protected readonly errorTitle = computed(() => {
    const subjects = subjectLabel(this.vocabulary.label(), 'many');
    return $localize`:État erreur de la liste@@patients.error.title:Impossible de charger vos ${subjects}:subjects:`;
  });

  constructor() {
    // load() remet le store à zéro de façon synchrone si le compte a changé : le filtre affiché part
    // de son état une fois cette vérification faite.
    void this.store.load();
    this.query.set(this.store.query());
    void this.tags.load();
    // Après le premier rendu : la barre d'application inscrit sa propre touche / dans un effect
    // (posé en même temps que la page à l'arrivée depuis la connexion) ; la dernière inscription
    // l'emporte, et c'est le filtre de la liste qui doit répondre ici (fiche 01).
    const shortcuts = inject(ShortcutService);
    const releases: (() => void)[] = [];
    afterNextRender(() => {
      if (this.destroyed) return;
      releases.push(
        shortcuts.register('n', () => this.create(), this.newLabel()),
        shortcuts.register('/', () => this.filters().focus()),
      );
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      releases.forEach((release) => release());
      clearTimeout(this.timer);
    });
  }

  protected onQuery(text: string): void {
    this.query.set(text);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.store.setQuery(text), FILTER_DEBOUNCE_MS);
  }

  /** Entrée dans le filtre : le premier résultat, une fois le filtre envoyé. */
  protected async openFirst(): Promise<void> {
    clearTimeout(this.timer);
    await this.store.setQuery(this.query());
    const first = this.store.items()[0];
    if (first) await this.router.navigate(['/patients', first.id, 'overview']);
  }

  protected clearFilters(): void {
    clearTimeout(this.timer);
    this.query.set('');
    void this.store.clearFilters();
  }

  protected create(): void {
    void this.router.navigateByUrl('/patients/nouveau');
  }
}
