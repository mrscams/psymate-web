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
import { ACTIVITY_LIMIT, PatientView } from '../data/patient.model';
import { PatientListStore } from '../data/patient-list.store';
import { TagStore } from '../data/tag.store';
import { OnboardingComponent } from '../ui/onboarding.component';
import { quickFilterLabel, RESTORE_LABEL } from '../ui/patient-labels';
import { PatientFiltersComponent } from '../ui/patient-filters.component';
import { PatientTableComponent } from '../ui/patient-table.component';

/** Attente avant d'envoyer le filtre (fiche 01 : debounce 250 ms). */
export const FILTER_DEBOUNCE_MS = 250;

/**
 * /patients (fiche 01, maquette 01, B4 écran 1, UX-B1) : titre et compteur (« 3 suivis actifs ·
 * 1 séance aujourd'hui »), « Afficher les archivés », filtre, tri, filtres rapides et menu des tags,
 * tableau avec résumé d'activité, pied « n patients affichés sur N · ↑↓ choisir · Entrée ouvrir ·
 * N nouveau », « Afficher plus » par curseur, légende des pastilles. Raccourcis : N ouvre la
 * création, / focalise le filtre, ↓ descend du filtre au tableau. Trois états par pm-state ; une
 * erreur de rechargement laisse la liste précédente affichée avec un bandeau ; un résumé en échec
 * laisse sa ligne et propose « Réessayer ».
 * Première connexion (B3 flux 1, planche 29, M7-03) : tant que la liste sans filtre ne compte que
 * des patients de démonstration (ou aucun), « Créez votre premier patient » et l'accueil en trois
 * étapes s'affichent ; le patient « DEMO · … » se supprime en un clic et une confirmation simple,
 * sans retaper son nom, puis se restaure depuis le toast ou la liste des archivés.
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
  private readonly table = viewChild(PatientTableComponent);

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
  /**
   * Écriture refusée depuis la liste : avertissement dans la liste (planche 29 : icône et mot du
   * niveau), la liste reste affichée. La restauration couvre aussi le toast « Restaurer » posé par
   * la fiche après un archivage : son message ne parle donc pas de la démo.
   */
  protected readonly actionProblem = computed(() => {
    switch (this.store.actionProblem()?.action) {
      case 'removeDemo':
        return $localize`:Avertissement, retrait de la démo refusé@@patients.demo.removeFailed:Le patient de démonstration n'a pas pu être retiré. Réessayez.`;
      case 'restore':
        return $localize`:Avertissement, restauration refusée@@patients.demo.restoreFailed:La restauration n'a pas abouti. Réessayez depuis les archivés.`;
      default:
        return null;
    }
  });
  protected readonly warningLabel = $localize`:Mot du niveau avertissement@@patients.warning.level:Avertissement`;

  /**
   * Compteur sous le titre (maquette 01) : patients actifs de la liste sans filtre, « plus de » si
   * une page suivante existe, et séances du jour quand le résumé couvre toute la liste. Absent sur
   * une liste filtrée (le pied dit combien de lignes sont affichées).
   */
  protected readonly counter = computed(() => {
    const data = this.store.page().data;
    if (!data || this.store.filtered()) return null;
    const total = data.items.length;
    const more = data.nextCursor !== null;
    const active = more
      ? $localize`:Compteur de la liste, liste incomplète@@patients.counter.more:plus de ${total}:count: suivis actifs`
      : total === 0
        ? $localize`:Compteur de la liste, aucun patient@@patients.counter.none:0 suivi`
        : total === 1
          ? $localize`:Compteur de la liste, un patient@@patients.counter.one:1 suivi actif`
          : $localize`:Compteur de la liste, plusieurs patients@@patients.counter.many:${total}:count: suivis actifs`;
    const today = more ? null : this.store.quickCounts().today;
    if (today === null || total === 0) return active;
    const sessions =
      today === 0
        ? $localize`:Compteur de la liste, aucune séance du jour@@patients.counter.todayNone:aucune séance aujourd'hui`
        : today === 1
          ? $localize`:Compteur de la liste, une séance du jour@@patients.counter.todayOne:1 séance aujourd'hui`
          : $localize`:Compteur de la liste, séances du jour@@patients.counter.todayMany:${today}:count: séances aujourd'hui`;
    return `${active} · ${sessions}`;
  });

  /** Pied du tableau : « 3 patients affichés sur 3 · filtrés par « Tous » ». */
  protected readonly footer = computed(() => {
    const shown = this.store.rows().length;
    const total = this.store.items().length;
    const of = this.store.hasMore() ? `${total}+` : `${total}`;
    const subjects = subjectLabel(this.vocabulary.label(), shown > 1 ? 'many' : 'one');
    const tag = this.store.tag();
    const quick = quickFilterLabel(this.store.effectiveQuick());
    const filter = tag === null ? quick : `${quick} · #${tag}`;
    return shown > 1
      ? $localize`:Pied de la liste, plusieurs lignes@@patients.footer.shownMany:${shown}:shown: ${subjects}:subjects: affichés sur ${of}:total: · filtrés par « ${filter}:filter: »`
      : $localize`:Pied de la liste, une ligne ou aucune@@patients.footer.shownOne:${shown}:shown: ${subjects}:subjects: affiché sur ${of}:total: · filtré par « ${filter}:filter: »`;
  });

  /** Au-delà de 20 lignes (ou avec une page suivante), le résumé n'est lu que pour les premières. */
  protected readonly partialNote = computed(() =>
    this.store.activityCovered()
      ? null
      : $localize`:Pied de la liste, résumé partiel@@patients.footer.partialNote:Résumé d'activité affiché pour les ${ACTIVITY_LIMIT}:limit: premiers patients`,
  );

  /** Résumés en échec : avertissement sous le tableau, avec « Réessayer ». */
  protected readonly activityProblem = computed(() => {
    const failures = this.store.activityFailures();
    if (failures === 0) return null;
    return failures === 1
      ? $localize`:Avertissement, un résumé non chargé@@patients.activity.failedOne:Le résumé d'une ligne n'a pas pu être chargé.`
      : $localize`:Avertissement, résumés non chargés@@patients.activity.failedMany:Le résumé de ${failures}:count: lignes n'a pas pu être chargé.`;
  });

  /** Filtre rapide sans résultat dans la page lue. */
  protected readonly quickEmptyTitle = computed(() => {
    const subject = subjectLabel(this.vocabulary.label(), 'one');
    return $localize`:État vide de la liste filtrée@@patients.empty.filtered:Aucun ${subject}:subject: ne correspond`;
  });
  protected readonly quickEmptyMessage = computed(() => {
    const filter = quickFilterLabel(this.store.effectiveQuick());
    if (this.store.hasMore()) {
      const loaded = this.store.items().length;
      return $localize`:Phrase du filtre rapide sans résultat, liste incomplète@@patients.quick.emptyPartial:Aucune ligne pour le filtre « ${filter}:filter: » parmi les ${loaded}:loaded: patients chargés : seuls ceux-là sont filtrés.`;
    }
    return $localize`:Phrase du filtre rapide sans résultat@@patients.quick.emptyMessage:Aucune ligne pour le filtre « ${filter}:filter: ».`;
  });
  private readonly showAll: StateAction = {
    label: $localize`:Action du filtre rapide sans résultat@@patients.quick.showAll:Afficher tous`,
    handler: () => this.store.setQuick('all'),
  };
  private readonly loadMoreAction: StateAction = {
    label: $localize`:Action du filtre rapide sans résultat, liste incomplète@@patients.quick.loadMore:Charger la suite`,
    handler: () => void this.store.loadMore(),
  };
  /** Liste incomplète : charger la suite ; sinon revenir à « Tous ». */
  protected readonly quickEmptyAction = computed<StateAction>(() =>
    this.store.hasMore() ? this.loadMoreAction : this.showAll,
  );
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

  /** Entrée dans le filtre : le premier résultat affiché, une fois le filtre envoyé. */
  protected async openFirst(): Promise<void> {
    clearTimeout(this.timer);
    await this.store.setQuery(this.query());
    const first = this.store.rows()[0]?.patient;
    if (first) await this.router.navigate(['/patients', first.id, 'overview']);
  }

  /** ↓ dans le filtre : première ligne du tableau (↑ ↓ ensuite, Entrée ouvre). */
  protected focusFirstRow(): void {
    this.table()?.focusFirst();
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
    void this.help.open();
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
    // Refus de l'API : message dans la liste (actionProblem), jamais de toast d'erreur (planche 29).
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
