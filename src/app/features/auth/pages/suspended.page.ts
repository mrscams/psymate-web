import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  Injector,
  LOCALE_ID,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Router, RouterLink } from '@angular/router';
import { startWith } from 'rxjs';

import { AUTH_PATHS, SessionStore, VerificationStatus } from '../../../core/auth';
import { ApiProblem } from '../../../core/http';
import { formatDateTime, formatDelay } from '../../../core/i18n';
import { applyProblem, fieldId, FieldErrorsComponent } from '../../../shared/forms';
import { StateAction, StateComponent } from '../../../shared/ui';
import { SuspendedCredentials } from '../data/suspended.api';
import { SuspendedStore } from '../data/suspended.store';

/** Interrogation du job d'export : toutes les 3 s jusqu'à done ou failed (fiche 19). */
export const EXPORT_POLL_MS = 3_000;

/** Bornes du message de recours (contrat : 20 à 4000 caractères après suppression des blancs de bord). */
export const APPEAL_MIN = 20;
export const APPEAL_MAX = 4000;

/** Ce que la page sait de la décision : la session, quand elle existe encore, dit le statut. */
type DecisionKind = 'suspended' | 'rejected' | 'closed' | 'unknown';

/**
 * /compte-suspendu (fiche 27, G Q18, Q28). Un compte refusé ou suspendu n'a plus de session (le
 * login répond 403 ACCOUNT_SUSPENDED et les sessions sont révoquées) : l'export du compte et le
 * recours se font avec e-mail + mot de passe (+ code 2FA) dans le corps, sans session. L'export est
 * un job asynchrone suivi toutes les 3 s ; son lien vaut 7 jours (410 ensuite, affiché « expiré »).
 * Un seul recours par décision : le formulaire laisse place à l'état du recours après le 201, et
 * un 409 APPEAL_ALREADY_OPEN le remplace par « un recours est déjà en cours ».
 */
@Component({
  selector: 'pm-suspended-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatProgressBarModule,
    FieldErrorsComponent,
    StateComponent,
  ],
  templateUrl: './suspended.page.html',
  styleUrl: './suspended.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuspendedPage {
  protected readonly store = inject(SuspendedStore);
  protected readonly session = inject(SessionStore);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);
  private readonly locale = inject(LOCALE_ID);

  protected readonly loginPath = AUTH_PATHS.login;
  protected readonly confirmEmailPath = AUTH_PATHS.confirmEmail;
  protected readonly fieldId = fieldId;
  protected readonly appealMax = APPEAL_MAX;
  protected readonly appealMin = APPEAL_MIN;

  /** Identité du compte sans session : partagée par l'export et le recours. */
  protected readonly credentials = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    password: ['', [Validators.required, Validators.maxLength(200)]],
    otp: ['', [Validators.maxLength(32)]],
  });

  protected readonly appealForm = inject(NonNullableFormBuilder).group({
    message: [
      '',
      [Validators.required, Validators.minLength(APPEAL_MIN), Validators.maxLength(APPEAL_MAX)],
    ],
  });

  protected readonly labels = {
    email: $localize`:Champ e-mail du compte suspendu@@auth.suspended.field.email:Adresse e-mail du compte`,
    password: $localize`:Champ mot de passe du compte suspendu@@auth.suspended.field.password:Mot de passe`,
    otp: $localize`:Champ code 2FA du compte suspendu@@auth.suspended.field.otp:Code de vérification (application ou code de secours)`,
    message: $localize`:Champ texte du recours@@auth.suspended.field.message:Votre explication`,
  };

  private readonly messageValue = toSignal(
    this.appealForm.controls.message.valueChanges.pipe(startWith('')),
    { initialValue: '' },
  );
  protected readonly messageLength = computed(() => this.messageValue().trim().length);

  /** Statut connu par la session quand elle existe encore ; sinon « suspendu ou refusé ». */
  protected readonly kind = computed<DecisionKind>(() => kindOf(this.session.verificationStatus()));
  protected readonly bandText = computed(() => bandText(this.kind()));
  protected readonly title = computed(() => titleText(this.kind()));

  private readonly now = signal(Date.now());
  protected readonly lockSeconds = computed(() => {
    const until = this.store.lockedUntil();
    return until === null ? 0 : Math.max(0, Math.ceil((until - this.now()) / 1000));
  });
  protected readonly locked = computed(() => this.lockSeconds() > 0);
  protected readonly lockText = computed(() => {
    const seconds = this.lockSeconds();
    if (seconds === 0) return null;
    const delay = formatDelay(seconds, this.locale);
    return $localize`:Verrou après trop d'essais@@auth.suspended.error.locked:Trop d'essais : réessayez dans ${delay}:delay:.`;
  });

  protected readonly exportDisabled = computed(() => this.store.exportPending() || this.locked());
  protected readonly exportError = computed(
    () => this.lockText() ?? actionError(this.store.exportRequest().problem, 'export'),
  );
  protected readonly exportNotSuspended = computed(
    () => this.store.exportRequest().problem?.code === 'ACCOUNT_NOT_SUSPENDED',
  );
  protected readonly exportEmailPending = computed(
    () => this.store.exportRequest().problem?.code === 'EMAIL_NOT_CONFIRMED',
  );
  protected readonly downloadError = computed(() =>
    this.store.download().status === 'error'
      ? $localize`:Téléchargement du zip impossible@@auth.suspended.export.downloadError:Téléchargement impossible pour le moment. Le lien reste valable : réessayez dans un instant.`
      : null,
  );
  protected readonly requestedAt = computed(() =>
    this.formatDate(this.store.exportStatus().data?.requestedAt),
  );
  protected readonly expiresAt = computed(() =>
    this.formatDate(this.store.exportStatus().data?.expiresAt),
  );
  protected readonly statusDetails = computed(() => {
    const problem = this.store.exportStatus().problem;
    return problem ? `${problem.status} ${problem.code}` : undefined;
  });
  protected readonly runningLabel = $localize`:Étiquette de la barre de progression de l'export@@auth.suspended.export.progress:Préparation de l'export en cours`;
  protected readonly statusErrorTitle = $localize`:Titre de l'erreur de suivi du job@@auth.suspended.export.statusError:Impossible de lire l'état de l'export`;
  protected readonly refreshAction: StateAction = {
    label: $localize`:Bouton de l'état erreur@@state.error.retry:Réessayer`,
    handler: () => void this.store.refreshExport(),
  };

  protected readonly appealError = computed(
    () => this.lockText() ?? actionError(this.store.appeal().problem, 'appeal'),
  );
  protected readonly appealClosedText = computed(() => closedText(this.store.appeal().problem));
  protected readonly appealSubmittedAt = computed(() =>
    this.formatDate(this.store.appeal().submittedAt),
  );
  /** Un compte clos ne peut plus déposer de recours (contrat) ; l'export reste possible 90 jours. */
  protected readonly appealAllowed = computed(() => this.kind() !== 'closed');

  constructor() {
    const me = this.session.me();
    if (me) this.credentials.controls.email.setValue(me.email);
    void this.store.restore();

    // Suivi du job : toutes les 3 s tant qu'il est en file ou en cours.
    effect((onCleanup) => {
      const kind = this.store.exportKind();
      if (kind !== 'queued' && kind !== 'running') return;
      const timer = setInterval(() => void this.store.refreshExport(), EXPORT_POLL_MS);
      onCleanup(() => clearInterval(timer));
    });

    // Compte à rebours du verrou (423 + Retry-After).
    effect((onCleanup) => {
      if (this.store.lockedUntil() === null) return;
      this.now.set(Date.now());
      const timer = setInterval(() => {
        this.now.set(Date.now());
        if (this.lockSeconds() === 0) this.store.unlock();
      }, 1000);
      onCleanup(() => clearInterval(timer));
    });

    // Le code 2FA vient d'être demandé : le champ apparaît et reçoit le focus.
    effect(() => {
      if (!this.store.otpRequired()) return;
      afterNextRender(() => this.document.getElementById(fieldId('otp'))?.focus(), {
        injector: this.injector,
      });
    });
  }

  private formatDate(value: string | null | undefined): string {
    return value ? formatDateTime(value, this.locale) : '';
  }

  /** Identifiants saisis, ou null (champs marqués, focus sur le premier manquant). */
  private readCredentials(): SuspendedCredentials | null {
    if (this.credentials.invalid) {
      this.credentials.markAllAsTouched();
      const first = Object.entries(this.credentials.controls).find(([, c]) => c.invalid)?.[0];
      if (first) {
        afterNextRender(() => this.document.getElementById(fieldId(first))?.focus(), {
          injector: this.injector,
        });
      }
      return null;
    }
    const { email, password, otp } = this.credentials.getRawValue();
    return {
      email: email.trim(),
      password,
      ...(this.store.otpRequired() && otp.trim() ? { otp: otp.trim() } : {}),
    };
  }

  /** « Exporter mes dossiers » : POST /api/me/export puis suivi du job. */
  protected async requestExport(): Promise<void> {
    if (this.exportDisabled()) return;
    const credentials = this.readCredentials();
    if (!credentials) return;
    await this.store.requestExport(credentials);
    const problem = this.store.exportRequest().problem;
    if (problem?.status === 422) applyProblem(this.credentials, problem);
  }

  /** « Télécharger l'archive » : le zip passe par HttpClient pour qu'un 410 s'affiche proprement. */
  protected async download(): Promise<void> {
    const file = await this.store.downloadExport();
    if (!file) return;
    const view = this.document.defaultView;
    if (!view) return;
    const url = view.URL.createObjectURL(file.blob);
    const anchor = this.document.createElement('a');
    anchor.href = url;
    anchor.download = file.fileName;
    anchor.rel = 'noopener';
    this.document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    view.URL.revokeObjectURL(url);
  }

  /** « Relancer » après un échec ou un lien expiré : la ligne repart, un nouveau POST sera fait. */
  protected relaunch(): void {
    this.store.forgetExport();
    afterNextRender(() => this.document.getElementById('export-button')?.focus(), {
      injector: this.injector,
    });
  }

  /** « Envoyer le recours » : POST /api/me/appeal avec l'identité de la carte principale. */
  protected async submitAppeal(): Promise<void> {
    if (this.store.appeal().status === 'busy' || this.locked()) return;
    if (this.appealForm.invalid) {
      this.appealForm.markAllAsTouched();
      afterNextRender(() => this.document.getElementById(fieldId('message'))?.focus(), {
        injector: this.injector,
      });
      return;
    }
    const credentials = this.readCredentials();
    if (!credentials) return;
    const sent = await this.store.submitAppeal(
      credentials,
      this.appealForm.getRawValue().message.trim(),
    );
    if (sent) return;
    const problem = this.store.appeal().problem;
    if (problem?.status === 422) {
      applyProblem(this.appealForm, problem);
      applyProblem(this.credentials, problem);
    }
  }

  protected async logout(): Promise<void> {
    await this.session.logout();
    await this.router.navigateByUrl(AUTH_PATHS.login);
  }
}

function kindOf(status: VerificationStatus | null): DecisionKind {
  switch (status) {
    case 'suspended':
      return 'suspended';
    case 'rejected':
      return 'rejected';
    case 'closed':
      return 'closed';
    default:
      return 'unknown';
  }
}

/** Bande d'état (role="status") : le mot de l'état, jamais la couleur seule. */
export function bandText(kind: DecisionKind): string {
  switch (kind) {
    case 'suspended':
      return $localize`:Bande d'état, compte suspendu@@auth.suspended.band.suspended:Compte suspendu`;
    case 'rejected':
      return $localize`:Bande d'état, dossier refusé@@auth.suspended.band.rejected:Dossier refusé`;
    case 'closed':
      return $localize`:Bande d'état, compte clos@@auth.suspended.band.closed:Compte clos`;
    default:
      return $localize`:Bande d'état, statut inconnu sans session@@auth.suspended.band.unknown:Compte suspendu ou refusé`;
  }
}

/** Titre h1, qui reprend l'information de la bande (fiche 27, accessibilité). */
export function titleText(kind: DecisionKind): string {
  switch (kind) {
    case 'suspended':
      return $localize`:Titre, compte suspendu@@auth.suspended.title.suspended:Votre compte est suspendu`;
    case 'rejected':
      return $localize`:Titre, dossier refusé@@auth.suspended.title.rejected:Votre dossier a été refusé`;
    case 'closed':
      return $localize`:Titre, compte clos@@auth.suspended.title.closed:Votre compte est clos`;
    default:
      return $localize`:Titre, statut inconnu sans session@@auth.suspended.title.unknown:Votre compte est suspendu ou votre dossier a été refusé`;
  }
}

/** Message d'écran d'un export ou d'un recours refusé ; null sans erreur ou pour un 422 relié aux champs. */
export function actionError(
  problem: ApiProblem | null,
  action: 'export' | 'appeal',
): string | null {
  if (!problem) return null;
  switch (problem.status) {
    case 401:
      return $localize`:Identifiants refusés, message unique@@auth.suspended.error.credentials:E-mail, mot de passe ou code incorrect.`;
    case 403:
      return $localize`:Adresse jamais confirmée@@auth.suspended.error.emailNotConfirmed:Cette adresse e-mail n'a jamais été confirmée : confirmez-la d'abord.`;
    case 409:
      switch (problem.code) {
        case 'EXPORT_IN_PROGRESS':
          return $localize`:Export déjà en cours@@auth.suspended.error.exportInProgress:Un export de votre compte est déjà en préparation. Revenez dans quelques minutes : le lien de téléchargement apparaîtra ici.`;
        case 'ACCOUNT_NOT_SUSPENDED':
          return $localize`:Compte ni suspendu ni refusé@@auth.suspended.error.notSuspended:Votre compte n'est ni suspendu ni refusé : connectez-vous normalement.`;
        default:
          return null; // Codes du recours : fermeture du formulaire, texte dédié (closedText).
      }
    case 422:
      return problem.errors?.length
        ? null
        : $localize`:Champ mal formé@@auth.suspended.error.invalid:Vérifiez les champs saisis.`;
    case 423:
      return null; // Compte à rebours du verrou.
    default:
      return action === 'export'
        ? $localize`:Export impossible, serveur ou réseau@@auth.suspended.error.exportUnavailable:Export impossible pour le moment. Rien n'a été modifié ; réessayez dans un instant.`
        : $localize`:Recours impossible, serveur ou réseau@@auth.suspended.error.appealUnavailable:Envoi impossible pour le moment. Rien n'a été enregistré ; réessayez dans un instant.`;
  }
}

/** Texte qui remplace le formulaire de recours après un 409 (fiche 27 : un seul recours). */
export function closedText(problem: ApiProblem | null): string {
  switch (problem?.code) {
    case 'APPEAL_ALREADY_USED':
      return $localize`:Recours déjà examiné@@auth.suspended.appeal.alreadyUsed:La décision contestée a déjà fait l'objet d'un recours examiné : elle est définitive.`;
    case 'APPEAL_NOT_ALLOWED':
      return $localize`:Aucune décision à contester@@auth.suspended.appeal.notAllowed:Aucune décision de refus ou de suspension n'est à contester pour ce compte.`;
    default:
      return $localize`:Recours déjà ouvert@@auth.suspended.appeal.alreadyOpen:Un recours est déjà en cours d'examen pour votre compte. Vous recevrez la réponse par e-mail.`;
  }
}
