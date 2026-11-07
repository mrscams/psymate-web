import { DOCUMENT, NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  Injector,
  input,
  LOCALE_ID,
  signal,
  untracked,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { Router, RouterLink } from '@angular/router';

import { afterLogin, AUTH_PATHS, SessionStore } from '../../../core/auth';
import { ApiProblem } from '../../../core/http';
import { formatDelay } from '../../../core/i18n';
import { applyProblem, fieldId, FieldErrorsComponent } from '../../../shared/forms';
import { StateAction, StateComponent } from '../../../shared/ui';
import { ConfirmEmailStore } from '../data/confirm-email.store';

/** Les trois états de la fiche 25, portés par la donnée de route. */
export type ConfirmEmailMode = 'pending' | 'token' | 'expired';

/** Polling discret de GET /api/auth/session : toutes les 10 s, 30 min au plus (fiche 25). */
export const SESSION_POLL_MS = 10_000;
export const SESSION_POLL_MAX_MS = 30 * 60_000;

/**
 * /confirmer-email (en attente), /confirmer-email/:token (traitement du lien) et
 * /confirmer-email/expire (fiche 25). Un compte email_pending n'a pas de session : le renvoi et la
 * correction d'adresse se font par les routes publiques (202 quoi qu'il arrive). Le lien ouvre une
 * session dans ce navigateur (204) → SessionStore rechargé → /patients ; 410 → page « expiré ».
 */
@Component({
  selector: 'pm-confirm-email-page',
  imports: [
    NgTemplateOutlet,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    FieldErrorsComponent,
    StateComponent,
  ],
  templateUrl: './confirm-email.page.html',
  styleUrl: './confirm-email.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmEmailPage {
  /** Donnée de route (withComponentInputBinding). */
  readonly mode = input<ConfirmEmailMode>('pending');
  /** Paramètre :token de /confirmer-email/:token. */
  readonly token = input<string | undefined>();

  protected readonly store = inject(ConfirmEmailStore);
  protected readonly session = inject(SessionStore);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);
  private readonly locale = inject(LOCALE_ID);

  protected readonly loginPath = AUTH_PATHS.login;
  protected readonly fieldId = fieldId;

  /** Adresse à saisir quand elle n'est pas connue (arrivée directe, page expirée). */
  protected readonly emailForm = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
  });

  /** Correction de l'adresse : mot de passe + nouvelle adresse (+ l'actuelle si inconnue). */
  protected readonly changeForm = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    password: ['', [Validators.required, Validators.maxLength(200)]],
    newEmail: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
  });

  protected readonly labels = {
    email: $localize`:Champ e-mail du compte à confirmer@@auth.confirm.field.email:E-mail du compte`,
    password: $localize`:Champ mot de passe de la correction d'adresse@@auth.confirm.field.password:Mot de passe`,
    newEmail: $localize`:Champ nouvelle adresse@@auth.confirm.field.newEmail:Nouvelle adresse e-mail`,
  };

  /** Le formulaire « Corriger l'e-mail » est déplié. */
  protected readonly changing = signal(false);

  private readonly now = signal(Date.now());
  /** Secondes avant le prochain renvoi autorisé ; 0 quand le bouton est actif. */
  protected readonly cooldownSeconds = computed(() => {
    const until = this.store.resendAllowedAt();
    return until === null ? 0 : Math.max(0, Math.ceil((until - this.now()) / 1000));
  });
  protected readonly cooldownText = computed(() => formatCountdown(this.cooldownSeconds()));
  protected readonly canResend = computed(
    () => this.cooldownSeconds() === 0 && this.store.resend().status !== 'busy',
  );
  protected readonly resendError = computed(() =>
    errorMessage(this.store.resend().problem, this.locale),
  );
  protected readonly changeError = computed(() =>
    errorMessage(this.store.change().problem, this.locale),
  );

  protected readonly confirmFailed = computed(() => this.store.confirm().status === 'error');
  protected readonly confirmDetails = computed(() => {
    const problem = this.store.confirm().problem;
    return problem ? `${problem.status} ${problem.code}` : undefined;
  });
  protected readonly processingErrorTitle = $localize`:Titre de l'erreur pendant le traitement du lien@@auth.confirm.processing.error.title:Impossible de vérifier ce lien pour le moment`;
  protected readonly processingErrorMessage = $localize`:Texte de l'erreur pendant le traitement du lien@@auth.confirm.processing.error.message:Le serveur n'a pas répondu. Le lien reste valable : réessayez dans un instant.`;
  protected readonly retryAction: StateAction = {
    label: $localize`:Bouton de l'état erreur@@state.error.retry:Réessayer`,
    handler: () => {
      const token = this.token();
      if (token) void this.process(token);
    },
  };

  private processedToken: string | null = null;

  constructor() {
    this.rememberKnownEmail();

    // Un compte déjà confirmé n'a rien à faire sur « en attente » : triage habituel. La page
    // « expiré » reste visible avec une session (lien réutilisé après confirmation, fiche 25).
    // Dans un effet, pas dans le constructeur : la donnée de route `mode` n'est liée qu'ensuite.
    effect(() => {
      const me = this.session.me();
      if (!me || this.mode() !== 'pending' || me.verificationStatus === 'email_pending') return;
      untracked(() => void this.router.navigateByUrl(afterLogin(me)));
    });

    // Traitement du lien, une fois par jeton.
    effect(() => {
      const token = this.token();
      if (this.mode() !== 'token' || !token || this.processedToken === token) return;
      this.processedToken = token;
      untracked(() => void this.process(token));
    });

    // Compte à rebours du renvoi : une seconde à la fois, arrêté à zéro (fiche 25).
    effect((onCleanup) => {
      if (this.store.resendAllowedAt() === null) return;
      this.now.set(Date.now());
      const timer = setInterval(() => {
        this.now.set(Date.now());
        if (this.cooldownSeconds() === 0) this.store.clearCooldown();
      }, 1000);
      onCleanup(() => clearInterval(timer));
    });

    // Polling discret : si l'adresse est confirmée dans un autre onglet, cette page part d'elle-même.
    effect((onCleanup) => {
      if (this.mode() !== 'pending') return;
      const startedAt = Date.now();
      const timer = setInterval(() => {
        if (Date.now() - startedAt > SESSION_POLL_MAX_MS) {
          clearInterval(timer);
          return;
        }
        void this.pollSession();
      }, SESSION_POLL_MS);
      onCleanup(() => clearInterval(timer));
    });

    // Quand l'adresse est connue, le champ caché de la correction la porte.
    effect(() => {
      const email = this.store.email();
      if (email) this.changeForm.controls.email.setValue(email);
    });
  }

  /** Adresse connue : navigation depuis l'inscription (state), ou session déjà ouverte. */
  private rememberKnownEmail(): void {
    const me = this.session.me();
    if (me) {
      this.store.remember(me.email);
      return;
    }
    const state =
      this.router.getCurrentNavigation()?.extras.state ??
      (this.document.defaultView?.history.state as Record<string, unknown> | null);
    const email = state?.['email'];
    if (typeof email === 'string') this.store.remember(email);
  }

  private async process(token: string): Promise<void> {
    const status = await this.store.confirmToken(token);
    if (status === 'confirmed') {
      await this.session.load();
      const me = this.session.me();
      await this.router.navigateByUrl(me ? afterLogin(me) : AUTH_PATHS.home, { replaceUrl: true });
    } else if (status === 'expired') {
      await this.router.navigateByUrl(`${AUTH_PATHS.confirmEmail}/expire`, { replaceUrl: true });
    }
  }

  /** Adresse confirmée ailleurs : SessionStore rechargé, l'effet de triage quitte la page. */
  private async pollSession(): Promise<void> {
    const check = await this.store.checkSession();
    if (check?.emailConfirmed) await this.session.load();
  }

  /** « Renvoyer l'e-mail » / « Recevoir un nouveau lien » : l'adresse connue, sinon celle saisie. */
  protected async resend(): Promise<void> {
    if (!this.canResend()) return;
    let email = this.store.email();
    if (!email) {
      if (this.emailForm.invalid) {
        this.emailForm.markAllAsTouched();
        return;
      }
      email = this.emailForm.getRawValue().email.trim();
    }
    await this.store.resendEmail(email);
  }

  protected toggleChange(): void {
    this.changing.set(!this.changing());
    this.store.resetChange();
    if (this.changing()) {
      const target = this.store.email() ? fieldId('password') : fieldId('email');
      afterNextRender(() => this.document.getElementById(target)?.focus(), {
        injector: this.injector,
      });
    }
  }

  protected async submitChange(): Promise<void> {
    if (this.store.change().status === 'busy') return;
    if (this.changeForm.invalid) {
      this.changeForm.markAllAsTouched();
      return;
    }
    const { email, password, newEmail } = this.changeForm.getRawValue();
    const sent = await this.store.changeEmail(password, newEmail, email);
    if (sent) {
      this.changing.set(false);
      this.changeForm.controls.password.reset();
      this.changeForm.controls.newEmail.reset();
      return;
    }
    applyProblem(this.changeForm, this.store.change().problem);
  }

  protected async logout(): Promise<void> {
    await this.session.logout();
    await this.router.navigateByUrl(AUTH_PATHS.login);
  }
}

/** « 0:42 » : compte à rebours en minutes:secondes (maquette 25). */
export function formatCountdown(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

/** Message d'écran d'un renvoi ou d'une correction refusés ; null sans erreur ou pour un 422 relié aux champs. */
export function errorMessage(problem: ApiProblem | null, locale: string): string | null {
  if (!problem) return null;
  switch (problem.status) {
    case 422:
      return problem.errors?.length
        ? null
        : $localize`:Demande refusée, champ mal formé@@auth.confirm.error.invalid:Vérifiez l'adresse e-mail saisie.`;
    case 423: {
      const delay = formatDelay(problem.retryAfterSeconds ?? 15 * 60, locale);
      return $localize`:Verrou après trop d'essais@@auth.confirm.error.locked:Trop d'essais : réessayez dans ${delay}:delay:.`;
    }
    default:
      return $localize`:Envoi impossible, serveur ou réseau@@auth.confirm.error.unavailable:Envoi impossible pour le moment. Réessayez dans un instant.`;
  }
}
