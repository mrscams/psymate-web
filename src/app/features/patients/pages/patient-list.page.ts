import { DOCUMENT } from '@angular/common';
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
import { PatientExportStore } from '../data/patient-export.store';
import { PatientView } from '../data/patient.model';
import { PatientListStore } from '../data/patient-list.store';
import { exportErrorText } from '../ui/export-menu.component';
import { OnboardingComponent } from '../ui/onboarding.component';
import {
  archivedMessage,
  quickFilterLabel,
  RESTORE_LABEL,
  restoredMessage,
} from '../ui/patient-labels';
import { PatientFiltersComponent } from '../ui/patient-filters.component';
import { PatientTableComponent, RowExport } from '../ui/patient-table.component';
import { PatientTodayComponent } from '../ui/patient-today.component';
import { saveFile } from '../ui/save-file';

/** Attente avant d'envoyer le filtre (fiche 01 : debounce 250 ms). */
export const FILTER_DEBOUNCE_MS = 250;

/** Rafraîchissement des minutes « en séance · n min ». */
export const CLOCK_TICK_MS = 30_000;

/**
 * /patients (fiche 01, proposition 01, UX-S7, décisions du 14 novembre 2026), en pleine largeur :
 * en-tête « Mes patients » sans sous-titre chiffré, « Afficher les archivés » (« Revenir aux
 * actifs ») et « Nouveau patient » ; bande « Aujourd'hui » quand la page compte une séance ouverte
 * ou clôturée aujourd'hui ; rangée filtre · filtres rapides sans compte · tri ; tableau de dix
 * patients et pied « n patients affichés · ‹ Précédent · Suivant › ». Raccourcis : N ouvre la
 * création, / focalise le filtre, ↓ descend du filtre au tableau. Trois états par pm-state ; une
 * erreur de rechargement laisse la page précédente affichée avec un bandeau ; un résumé en échec
 * laisse sa ligne et propose « Réessayer ».
 * Première connexion (B3 flux 1, planche 29, M7-03) : tant que la liste sans filtre ne compte que
 * des patients de démonstration (ou aucun), « Créez votre premier patient » et l'accueil en trois
 * étapes s'affichent ; le patient « DEMO · … » se supprime en un clic et une confirmation simple.
 */
@Component({
  selector: 'pm-patient-list-page',
  imports: [
    RouterLink,
    StateComponent,
    OnboardingComponent,
    PatientFiltersComponent,
    PatientTableComponent,
    PatientTodayComponent,
  ],
  providers: [PatientExportStore],
  templateUrl: './patient-list.page.html',
  styleUrl: './patient-list.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatientListPage {
  protected readonly store = inject(PatientListStore);
  private readonly exports = inject(PatientExportStore);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly vocabulary = inject(SubjectVocabulary);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly toasts = inject(ToastService);
  private readonly help = inject(ShortcutsHelp);
  private readonly filters = viewChild.required(PatientFiltersComponent);
  private readonly table = viewChild(PatientTableComponent);

  /** Texte du filtre affiché tout de suite ; envoyé au store après la pause de frappe. */
  protected readonly query = signal(this.store.query());
  /** Instant de référence des minutes de séance, avancé toutes les 30 s. */
  protected readonly now = signal(new Date());
  private timer: ReturnType<typeof setTimeout> | undefined;
  private destroyed = false;

  protected readonly title = computed(() => {
    const label = this.vocabulary.label();
    if (this.store.archived()) {
      const subjects = subjectLabel(label, 'Many');
      return $localize`:Titre de la liste des patients archivés@@patients.list.archivedTitle:${subjects}:subjects: archivés`;
    }
    const subjects = subjectLabel(label, 'many');
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
  /** Erreur de rechargement alors qu'une page est déjà affichée : bandeau, page conservée. */
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
   * niveau), la liste reste affichée.
   */
  protected readonly actionProblem = computed(() => {
    switch (this.store.actionProblem()?.action) {
      case 'removeDemo':
        return $localize`:Avertissement, retrait de la démo refusé@@patients.demo.removeFailed:Le patient de démonstration n'a pas pu être retiré. Réessayez.`;
      case 'archive':
        return $localize`:Avertissement, archivage refusé depuis la liste@@patients.list.archiveFailed:L'archivage n'a pas abouti. Réessayez.`;
      case 'restore':
        return $localize`:Avertissement, restauration refusée@@patients.demo.restoreFailed:La restauration n'a pas abouti. Réessayez depuis les archivés.`;
      default:
        return null;
    }
  });
  protected readonly warningLabel = $localize`:Mot du niveau avertissement@@patients.warning.level:Avertissement`;

  /** Pied : « 10 patients affichés » (les lignes de la page affichée, filtre rapide compris). */
  protected readonly shown = computed(() => {
    const count = this.store.rows().length;
    const subjects = subjectLabel(this.vocabulary.label(), count > 1 ? 'many' : 'one');
    return count > 1
      ? $localize`:Pied de la liste, plusieurs lignes@@patients.footer.shownMany:${count}:count: ${subjects}:subjects: affichés`
      : $localize`:Pied de la liste, une ligne ou aucune@@patients.footer.shownOne:${count}:count: ${subjects}:subjects: affiché`;
  });

  /**
   * Filtres rapides et tri « Dernière séance » portent sur la page affichée : le pied le dit quand la
   * liste tient sur plusieurs pages et que l'un d'eux est actif.
   */
  protected readonly pageNote = computed(() =>
    this.store.paged() && (this.store.quick() !== 'all' || this.store.sort() === 'lastSession')
      ? $localize`:Aide du pied, filtre ou tri sur la page@@patients.footer.pageNote:Filtre et tri appliqués à cette page.`
      : null,
  );

  /** Résumés en échec : avertissement sous le tableau, avec « Réessayer ». */
  protected readonly activityProblem = computed(() => {
    const failures = this.store.activityFailures();
    if (failures === 0) return null;
    return failures === 1
      ? $localize`:Avertissement, un résumé non chargé@@patients.activity.failedOne:Le résumé d'une ligne n'a pas pu être chargé.`
      : $localize`:Avertissement, résumés non chargés@@patients.activity.failedMany:Le résumé de ${failures}:count: lignes n'a pas pu être chargé.`;
  });

  /** Filtre rapide sans résultat dans la page affichée. */
  protected readonly quickEmptyMessage = computed(() => {
    const filter = quickFilterLabel(this.store.quick());
    return this.store.paged()
      ? $localize`:Phrase du filtre rapide sans résultat, plusieurs pages@@patients.quick.emptyPaged:Aucune ligne pour le filtre « ${filter}:filter: » sur cette page.`
      : $localize`:Phrase du filtre rapide sans résultat@@patients.quick.emptyMessage:Aucune ligne pour le filtre « ${filter}:filter: ».`;
  });
  protected readonly showAll: StateAction = {
    label: $localize`:Action du filtre rapide sans résultat@@patients.quick.showAll:Afficher tous`,
    handler: () => void this.store.setQuick('all'),
  };
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
    const clock = setInterval(() => this.now.set(new Date()), CLOCK_TICK_MS);
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      releases.forEach((release) => release());
      clearTimeout(this.timer);
      clearInterval(clock);
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
    if (first) await this.router.navigate(['/patients', first.id]);
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
   * « Archiver » (menu d'une ligne) : la confirmation de la fiche (nom à retaper), archivage puis
   * relecture de la page ; toast « Restaurer » (10 s), sinon restauration depuis les archivés.
   */
  protected async archive(patient: PatientView): Promise<void> {
    const subject = subjectLabel(this.vocabulary.label(), 'one');
    const confirmed = await this.confirm.confirm({
      title: $localize`:Titre de la confirmation d'archivage@@patients.archive.confirmTitle:Archiver ${patient.displayName}:name: ?`,
      description: $localize`:Explication de l'archivage@@patients.archive.confirmText:Le dossier disparaît de la liste ; rien n'est supprimé et vous pourrez le restaurer.`,
      confirmLabel: $localize`:Bouton de confirmation d'archivage@@patients.archive.confirm:Archiver ce ${subject}:subject:`,
      destructive: true,
      confirmWord: patient.displayName,
    });
    if (!confirmed || !(await this.store.archive(patient.id))) return;
    this.toasts.show({
      level: 'info',
      message: archivedMessage(patient.displayName, patient.pronoun),
      durationMs: 10_000,
      action: { label: RESTORE_LABEL(), handler: () => void this.restore(patient) },
    });
  }

  /** « Restaurer » (menu d'une ligne archivée, toast) : POST /restore, puis relecture de la page. */
  protected async restore(patient: PatientView): Promise<void> {
    if (await this.store.restore(patient.id)) {
      this.toasts.success(restoredMessage(patient.displayName, patient.pronoun));
    }
  }

  /** « Exporter › PDF / Markdown » (menu d'une ligne) : téléchargement direct, erreur en toast. */
  protected async exportFile({ patient, format }: RowExport): Promise<void> {
    const file = await this.exports.exportFile(patient.id, format);
    if (file) {
      saveFile(this.document, file);
      return;
    }
    const text = exportErrorText(this.exports.problem());
    if (text) this.toasts.show({ level: 'warning', message: text });
  }

  /**
   * « Supprimer la démo » (planche 29) : confirmation simple, sans nom à retaper ; archivage puis
   * relecture de la page ; toast « Restaurer » (10 s), sinon restauration depuis les archivés.
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

  /** « Restaurer » (toast ou ligne archivée de la démo) : POST /restore, puis relecture. */
  protected async restoreDemo(patient: PatientView): Promise<void> {
    if (await this.store.restore(patient.id)) {
      this.toasts.success(
        $localize`:Toast après la restauration de la démo@@patients.demo.restored:Patient de démonstration restauré`,
      );
    }
  }
}
