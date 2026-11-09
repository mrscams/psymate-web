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
import {
  ConfirmDialogService,
  StateAction,
  StateComponent,
  ToastService,
} from '../../../shared/ui';
import { isRefreshing, stateKind } from '../../../shared/util';
import { ShortcutsHelp } from '../../patient-shell';
import { isDemoPatient, PatientView } from '../data/patient.model';
import { PatientListStore } from '../data/patient-list.store';
import { TagStore } from '../data/tag.store';
import { OnboardingComponent } from '../ui/onboarding.component';
import { RESTORE_LABEL } from '../ui/patient-labels';
import { PatientFiltersComponent } from '../ui/patient-filters.component';
import { PatientTableComponent } from '../ui/patient-table.component';

/** Attente avant d'envoyer le filtre (fiche 01 : debounce 250 ms). */
export const FILTER_DEBOUNCE_MS = 250;

/**
 * /patients (fiche 01, B4 écran 1) : filtre, tri, puces de tags, archivés, tableau, « Afficher
 * plus » par curseur. Raccourcis : N ouvre la création, / focalise le filtre. Trois états par
 * pm-state ; une erreur de rechargement laisse la liste précédente affichée avec un bandeau.
 * Première connexion (B3 flux 1, planche 29, M7-03) : tant que la liste sans filtre ne compte que
 * des patients de démonstration (ou aucun), l'accueil en trois étapes s'affiche avec « Voir les
 * raccourcis » ; le patient « DEMO · … » se supprime en un clic et une confirmation simple, sans
 * retaper son nom, puis se restaure depuis le toast ou la liste des archivés.
 */
@Component({
  selector: 'pm-patient-list-page',
  imports: [
    MatButtonModule,
    RouterLink,
    StateComponent,
    OnboardingComponent,
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
  private readonly confirm = inject(ConfirmDialogService);
  private readonly toasts = inject(ToastService);
  private readonly help = inject(ShortcutsHelp);
  private readonly filters = viewChild.required(PatientFiltersComponent);

  /** Texte du filtre affiché tout de suite ; envoyé au store après la pause de frappe. */
  protected readonly query = signal(this.store.query());
  private timer: ReturnType<typeof setTimeout> | undefined;
  private destroyed = false;

  protected readonly title = computed(() => {
    const subjects = subjectLabel(this.vocabulary.label(), 'many');
    return $localize`:Titre de la liste des patients@@patients.list.title:Mes ${subjects}:subjects:`;
  });
  /** Ce que fait `/` ici, pour l'aide des raccourcis (planche 29 §6). */
  protected readonly filterShortcutLabel = computed(() => {
    const subjects = subjectLabel(this.vocabulary.label(), 'many');
    return $localize`:Aide des raccourcis, liste des patients@@patients.shortcut.filter:Filtrer mes ${subjects}:subjects:`;
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
  /** Phrase de l'état vide : seulement à la première connexion (liste sans filtre). */
  protected readonly emptyMessage = computed(() =>
    this.store.filtered()
      ? undefined
      : $localize`:Phrase de l'état vide de la liste@@patients.empty.message:Le dossier, la timeline et le graphe se construisent à partir de la première entrée.`,
  );
  /** Retrait ou restauration refusés : avertissement dans la liste, la liste reste affichée. */
  protected readonly demoProblem = computed(() => {
    if (this.store.removeProblem()) {
      return $localize`:Avertissement, retrait de la démo refusé@@patients.demo.removeFailed:Le patient de démonstration n'a pas pu être retiré. Réessayez.`;
    }
    if (this.store.restoreProblem()) {
      return $localize`:Avertissement, restauration refusée@@patients.demo.restoreFailed:La restauration n'a pas abouti. Réessayez depuis les archivés.`;
    }
    return null;
  });
  /** La liste affichée contient le patient de démonstration (accueil : « explorez-le »). */
  protected readonly hasDemo = computed(() => this.store.items().some(isDemoPatient));
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
        shortcuts.register('/', () => this.filters().focus(), this.filterShortcutLabel()),
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

  /** « Voir les raccourcis » de l'accueil : le panneau d'aide, comme la touche ?. */
  protected showShortcuts(): void {
    this.help.open();
  }

  /**
   * « Supprimer la démo » (planche 29) : confirmation simple, sans nom à retaper ; archivage puis
   * relecture de la liste ; toast « Restaurer » (10 s), sinon restauration depuis les archivés.
   */
  protected async removeDemo(patient: PatientView): Promise<void> {
    const confirmed = await this.confirm.confirm({
      title: $localize`:Titre de la confirmation de retrait de la démo@@patients.demo.confirmTitle:Supprimer le patient de démonstration ?`,
      description: $localize`:Explication du retrait de la démo@@patients.demo.confirmText:${patient.displayName}:name: quitte votre liste. Rien n'est effacé : vous pourrez le restaurer depuis les archivés.`,
      confirmLabel: $localize`:Bouton de confirmation du retrait de la démo@@patients.demo.confirm:Supprimer la démo`,
      destructive: true,
    });
    if (!confirmed) return;
    // Refus de l'API : message dans la liste (removeProblem), jamais de toast d'erreur (planche 29).
    if (!(await this.store.removeDemo(patient.id))) return;
    this.toasts.show({
      level: 'info',
      message: $localize`:Toast après le retrait de la démo@@patients.demo.removed:Patient de démonstration retiré`,
      durationMs: 10_000,
      action: { label: RESTORE_LABEL(), handler: () => void this.restoreDemo(patient) },
    });
  }

  /** « Restaurer » (toast ou ligne archivée) : POST /restore, puis relecture de la liste. */
  protected async restoreDemo(patient: PatientView): Promise<void> {
    if (await this.store.restore(patient.id)) {
      this.toasts.success(
        $localize`:Toast après la restauration de la démo@@patients.demo.restored:Patient de démonstration restauré`,
      );
    }
  }
}
