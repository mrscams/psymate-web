import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  Injector,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';

import { SessionStore } from '../../../core/auth';
import { ApiProblem } from '../../../core/http';
import { subjectLabel, SubjectVocabulary } from '../../../core/i18n';
import {
  AccountNavComponent,
  ConfirmDialogService,
  PUBLIC_PATHS,
  StateAction,
  StateComponent,
} from '../../../shared/ui';
import { StateKind, stateKind } from '../../../shared/util';
import { PatientExportFormat, PatientOption } from '../data/data-export.api';
import { ExportStore } from '../data/export.store';
import { ExportJobRowComponent } from '../ui/data-export/export-job-row.component';
import { PatientComboboxComponent } from '../ui/data-export/patient-combobox.component';
import { saveFile } from '../ui/data-export/save-file';
import { professionLabel } from './preferences.page';

/** Interrogation du job d'export : toutes les 3 s jusqu'à done ou failed (fiche 19). */
export const EXPORT_POLL_MS = 3_000;

/**
 * Après un 409 EXPORT_IN_PROGRESS pour un job inconnu de ce navigateur (lancé ailleurs), délai
 * avant que « Préparer l'export » se réactive : le contrat ne donne pas l'identifiant du job.
 */
export const CONFLICT_RETRY_MS = 30_000;

/** Les deux formats de l'export patient, `md` affiché « Markdown » (fiche 19, écarts). */
const FORMATS: { value: PatientExportFormat; label: string }[] = [
  { value: 'pdf', label: $localize`:Format d'export PDF@@account.data.format.pdf:PDF` },
  { value: 'md', label: $localize`:Format d'export Markdown@@account.data.format.md:Markdown` },
];

/**
 * /mon-compte/donnees (fiche 19, G Q18) : export d'un patient à la volée (PDF ou Markdown, entrées
 * privées jamais exportées) et export du compte en job asynchrone (zip, lien 7 jours, 410 ensuite).
 * Un seul job visible : le dernier, dont l'identifiant est conservé en localStorage ; son état est
 * relu toutes les 3 s tant qu'il est en file ou en cours, et à chaque retour sur la page.
 */
@Component({
  selector: 'pm-data-export-page',
  imports: [
    MatButtonModule,
    RouterLink,
    AccountNavComponent,
    StateComponent,
    PatientComboboxComponent,
    ExportJobRowComponent,
  ],
  providers: [ExportStore],
  templateUrl: './data-export.page.html',
  styleUrl: './data-export.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DataExportPage {
  protected readonly store = inject(ExportStore);
  protected readonly session = inject(SessionStore);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);

  protected readonly formats = FORMATS;
  protected readonly howItWorksPath = PUBLIC_PATHS.howItWorks;

  protected readonly displayName = computed(() => this.session.me()?.displayName ?? '');
  protected readonly subtitle = computed(() =>
    professionLabel(this.session.me()?.profession ?? null),
  );

  // État d'écran : le patient choisi et le format.
  protected readonly selected = signal<PatientOption | null>(null);
  protected readonly format = signal<PatientExportFormat>('pdf');

  private readonly vocabulary = inject(SubjectVocabulary);
  /** « Patient » ou « Client » selon le vocabulaire du praticien (fiche 00). */
  protected readonly patientLabel = computed(() => subjectLabel(this.vocabulary.label(), 'One'));

  /**
   * Bloc patient : vide (aucun patient du tout), chargement et erreur du premier chargement
   * seulement. Ensuite le sélecteur reste en place (le focus ne se perd pas en effaçant le champ) ;
   * chargement et erreur d'une recherche se lisent dans le champ.
   */
  protected readonly patientsState = computed<StateKind | null>(() =>
    this.store.patientsReady() ? null : stateKind(this.store.patients()),
  );
  protected readonly patientsLoading = computed(() => this.store.patients().status === 'loading');
  protected readonly retryPatients: StateAction = {
    label: $localize`:Bouton de l'état erreur@@state.error.retry:Réessayer`,
    handler: () => void this.store.searchPatients(this.store.query()),
  };
  protected readonly patientsEmptyTitle = $localize`:Aucun patient à exporter@@account.data.patient.emptyTitle:Aucun dossier à exporter`;
  protected readonly patientsEmptyMessage = $localize`:Explication de l'état vide@@account.data.patient.emptyMessage:Les dossiers que vous créez apparaîtront ici.`;
  protected readonly patientsErrorTitle = $localize`:Liste des patients indisponible@@account.data.patient.errorTitle:Impossible de charger vos dossiers`;
  /** Recherche en erreur après le premier chargement : message sous le champ. */
  protected readonly searchError = computed(
    () => this.store.patientsReady() && this.store.patients().status === 'error',
  );

  protected readonly patientBusy = computed(() => this.store.patientExport().status === 'busy');
  protected readonly patientError = computed(() =>
    patientExportError(this.store.patientExport().problem),
  );

  protected readonly launchError = computed(() =>
    launchErrorText(this.store.launch().problem, this.store.jobPending()),
  );
  protected readonly downloadError = computed(() => {
    const download = this.store.download();
    if (download.status !== 'error') return null;
    return download.problem?.status === 403
      ? $localize`:Lien signé refusé@@account.data.job.downloadInvalid:Le lien de téléchargement n'était plus valide : il vient d'être relu. Réessayez.`
      : $localize`:Téléchargement du zip impossible@@account.data.job.downloadError:Téléchargement impossible pour le moment. Le lien reste valable : réessayez dans un instant.`;
  });

  /** Bloc « Dernier export » : vide sans job connu ; chargement et erreur de la première lecture. */
  protected readonly jobState = computed<StateKind | null>(() => {
    const job = this.store.job();
    if (!this.store.jobId() && !job.data) return 'empty';
    return stateKind(job);
  });
  /** Vide : aucun job connu ; après un 409 pour un job lancé ailleurs, le dire plutôt que « aucun ». */
  protected readonly jobEmptyTitle = computed(() =>
    this.store.conflict()
      ? $localize`:Export lancé ailleurs@@account.data.job.elsewhereTitle:Un export est en préparation ailleurs`
      : $localize`:Aucun export de compte connu@@account.data.job.emptyTitle:Aucun export de compte en cours`,
  );
  protected readonly jobEmptyMessage = computed(() =>
    this.store.conflict()
      ? $localize`:Explication de l'export lancé ailleurs@@account.data.job.elsewhereMessage:Il a été lancé depuis un autre appareil ou une autre session : son état et son lien s'affichent là où il a été lancé.`
      : $localize`:Explication de l'état vide@@account.data.job.emptyMessage:Le dernier export lancé depuis ce navigateur s'affichera ici, avec son lien de téléchargement.`,
  );
  protected readonly jobErrorTitle = $localize`:Lecture de l'état impossible@@account.data.job.errorTitle:Impossible de lire l'état de l'export`;
  protected readonly retryJob: StateAction = {
    label: $localize`:Bouton de l'état erreur@@state.error.retry:Réessayer`,
    handler: () => void this.store.refreshJob(),
  };

  constructor() {
    void this.store.searchPatients('');
    void this.store.restoreJob();

    // Suivi du job : 3 s après chaque réponse, tant qu'il est en file ou en cours (fiche 19) ;
    // jamais deux lectures en vol, arrêt dès done / failed ou à la sortie de la page.
    effect((onCleanup) => {
      if (!this.jobActive()) return;
      let cancelled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const next = (): void => {
        timer = setTimeout(async () => {
          await this.store.refreshJob();
          if (!cancelled && this.jobActive()) next();
        }, EXPORT_POLL_MS);
      };
      next();
      onCleanup(() => {
        cancelled = true;
        clearTimeout(timer);
      });
    });

    // 409 pour un job lancé ailleurs : « Préparer l'export » se réactive après un délai.
    effect((onCleanup) => {
      if (!this.store.conflict()) return;
      const timer = setTimeout(() => this.store.clearConflict(), CONFLICT_RETRY_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }

  private jobActive(): boolean {
    const kind = this.store.jobKind();
    return kind === 'queued' || kind === 'running';
  }

  protected search(query: string): void {
    void this.store.searchPatients(query);
  }

  protected select(option: PatientOption | null): void {
    this.selected.set(option);
  }

  /** « Exporter » : téléchargement direct du fichier du patient choisi. */
  protected async exportPatient(): Promise<void> {
    const patient = this.selected();
    if (!patient || this.patientBusy()) return;
    const file = await this.store.exportPatient(patient.id, this.format());
    if (file) saveFile(this.document, file);
  }

  /** « Préparer l'export » : confirmation (état B), puis POST /api/me/export et suivi du job. */
  protected async prepare(): Promise<void> {
    if (this.store.launchBlocked()) return;
    const confirmed = await this.confirm.confirm({
      title: $localize`:Titre du dialogue de l'export du compte@@account.data.dialog.title:Préparer l'export du compte`,
      description: $localize`:Contenu du dialogue de l'export du compte@@account.data.dialog.body:L'archive zip contient patients.md, la liste de vos dossiers, puis le PDF et le Markdown de chaque dossier ; les entrées privées et archivées n'en font pas partie. Elle est préparée en arrière-plan et son lien de téléchargement est valable 7 jours. Rien n'est modifié ni supprimé dans vos dossiers.`,
      confirmLabel: $localize`:Bouton du dialogue de l'export du compte@@account.data.dialog.confirm:Lancer l'export`,
      cancelLabel: $localize`:Bouton d'annulation du dialogue@@account.data.dialog.cancel:Annuler`,
    });
    if (!confirmed) return;
    await this.launch();
  }

  /** « Relancer » après un échec ou un lien expiré : nouveau POST. */
  protected async relaunch(): Promise<void> {
    if (this.store.launchBlocked()) return;
    await this.launch();
  }

  /** « Télécharger » : le zip passe par HttpClient pour qu'un 410 bascule la ligne en « Expiré ». */
  protected async download(): Promise<void> {
    const file = await this.store.downloadArchive();
    if (file) saveFile(this.document, file);
  }

  private async launch(): Promise<void> {
    await this.store.launchExport();
    // Le bouton déclencheur vient d'être désactivé ou retiré : le focus va au bloc « Dernier export ».
    afterNextRender(() => this.document.getElementById('last-export-title')?.focus(), {
      injector: this.injector,
    });
  }
}

/** Message sous « Exporter » : le corps d'erreur d'un téléchargement est un blob, seul le statut compte. */
export function patientExportError(problem: ApiProblem | null): string | null {
  if (!problem) return null;
  switch (problem.status) {
    case 0:
      return $localize`:Export patient hors ligne@@account.data.patient.error.offline:Connexion perdue : réessayez une fois le réseau revenu.`;
    case 403:
      return $localize`:Export patient refusé@@account.data.patient.error.forbidden:Ce dossier n'est pas accessible depuis votre compte.`;
    case 404:
      return $localize`:Export patient introuvable@@account.data.patient.error.notFound:Ce dossier n'existe pas ou plus.`;
    case 429:
      return $localize`:Export patient limité@@account.data.patient.error.rateLimited:Trop de demandes rapprochées : réessayez dans quelques instants.`;
    default:
      return $localize`:Export patient en échec@@account.data.patient.error.failed:La génération du fichier a échoué. Rien n'a été modifié ; réessayez dans un instant.`;
  }
}

/** Message sous « Préparer l'export » ; 409 EXPORT_IN_PROGRESS affiché, jamais bloquant. */
export function launchErrorText(problem: ApiProblem | null, jobKnown: boolean): string | null {
  if (!problem) return null;
  if (problem.status === 409 && problem.code === 'EXPORT_IN_PROGRESS') {
    return jobKnown
      ? $localize`:Export déjà en cours, job affiché@@account.data.launch.inProgressKnown:Un export est déjà en cours : il est affiché ci-dessous. Le bouton se réactive dès qu'il est terminé.`
      : $localize`:Export déjà en cours, lancé ailleurs@@account.data.launch.inProgress:Un export de votre compte est déjà en préparation, lancé depuis un autre appareil ou une autre session. Vous pourrez relancer un export ici dans un instant.`;
  }
  return $localize`:Export du compte impossible@@account.data.launch.error:Export impossible pour le moment. Rien n'a été modifié ; réessayez dans un instant.`;
}
