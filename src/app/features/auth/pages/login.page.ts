import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { Router, RouterLink } from '@angular/router';

import { afterLogin } from '../../../core/auth';
import { ApiProblem } from '../../../core/http';
import { AUTH_FEATURE_PATHS } from '../auth-feature-paths';
import { ConfirmEmailStore } from '../data/confirm-email.store';
import { LoginStore } from '../data/login.store';

/** État de navigation posé par l'étape 2 du mot de passe oublié après un 204 (fiche 26). */
export const PASSWORD_CHANGED_STATE = 'passwordChanged';

/**
 * /connexion (fiche 11, UX-D1) : accroche au-dessus de la carte et mention d'hébergement dessous
 * (layout public à une carte, fiche 00 §4, au lieu des deux panneaux de la maquette), libellés
 * au-dessus des champs, « Mot de passe oublié ? » à droite du libellé, e-mail, mot de passe avec bouton afficher, « rester connecté » (G Q6),
 * bloc code de vérification après un 202 (code de l'application ou code de secours), message unique
 * 401, verrou 423 avec compte à rebours, liens Créer un compte et Mot de passe oublié. Les 403
 * d'état (e-mail non confirmé, compte suspendu, mot de passe à changer) sont redirigés par
 * core/http avant d'arriver ici.
 */
@Component({
  selector: 'pm-login-page',
  imports: [ReactiveFormsModule, RouterLink, MatButtonModule],
  providers: [LoginStore],
  templateUrl: './login.page.html',
  styleUrl: './login.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {
  /** ?next= : la page demandée avant la connexion (liée par withComponentInputBinding). */
  readonly next = input<string | undefined>();

  protected readonly store = inject(LoginStore);
  private readonly confirmEmail = inject(ConfirmEmailStore);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);

  protected readonly paths = AUTH_FEATURE_PATHS;

  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    password: ['', [Validators.required, Validators.maxLength(200)]],
    otp: ['', [Validators.maxLength(32)]],
    rememberMe: [false],
  });

  private readonly passwordInput = viewChild<ElementRef<HTMLInputElement>>('passwordInput');
  private readonly otpInput = viewChild<ElementRef<HTMLInputElement>>('otpInput');

  /** Mot de passe en clair (bouton afficher, aria-pressed). */
  protected readonly showPassword = signal(false);
  protected readonly showPasswordLabel = $localize`:Bouton afficher le mot de passe@@auth.login.showPassword:Afficher le mot de passe`;
  /** Le champ code reçoit un code de secours (texte) plutôt que les 6 chiffres de l'application. */
  protected readonly recoveryCode = signal(false);

  private readonly now = signal(Date.now());
  protected readonly lockSeconds = computed(() => {
    const until = this.store.lockedUntil();
    return until === null ? 0 : Math.max(0, Math.ceil((until - this.now()) / 1000));
  });
  protected readonly locked = computed(() => this.lockSeconds() > 0);
  protected readonly lockDelay = computed(() => formatDelay(this.lockSeconds()));
  protected readonly message = computed(() => errorMessage(this.store.problem()));

  /** Arrivée depuis l'étape 2 du mot de passe oublié : le mot de passe vient d'être remplacé. */
  protected readonly passwordChanged = signal(this.readPasswordChanged());

  /** Le champ a été touché et il est invalide : message sous le champ, aria-invalid. */
  protected invalid(name: 'email' | 'password'): boolean {
    const control = this.form.controls[name];
    return control.invalid && control.touched;
  }

  private readPasswordChanged(): boolean {
    const state =
      this.router.getCurrentNavigation()?.extras.state ??
      (this.document.defaultView?.history.state as Record<string, unknown> | null);
    return state?.[PASSWORD_CHANGED_STATE] === true;
  }

  constructor() {
    // Compte à rebours du verrou (423 + Retry-After) : une seconde à la fois, arrêté à zéro.
    effect((onCleanup) => {
      if (this.store.lockedUntil() === null) return;
      this.now.set(Date.now());
      const timer = setInterval(() => {
        this.now.set(Date.now());
        if (this.lockSeconds() === 0) this.store.unlock();
      }, 1000);
      onCleanup(() => clearInterval(timer));
    });
  }

  /** Afficher / masquer le mot de passe ; le bouton garde le focus (le clic ne remonte pas). */
  protected togglePassword(event: Event): void {
    event.stopPropagation();
    this.showPassword.set(!this.showPassword());
  }

  protected useRecoveryCode(recovery: boolean): void {
    this.recoveryCode.set(recovery);
    this.form.controls.otp.setValue('');
    afterNextRender(() => this.otpInput()?.nativeElement.focus(), { injector: this.injector });
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid || this.locked() || this.store.status() === 'submitting') {
      this.form.markAllAsTouched();
      return;
    }
    this.passwordChanged.set(false);
    const { email, password, otp, rememberMe } = this.form.getRawValue();
    const wasOtpRequired = this.store.otpRequired();
    const user = await this.store.submit({
      email: email.trim(),
      password,
      otp: this.store.otpRequired() ? otp.trim() : undefined,
      rememberMe,
    });
    if (user) {
      await this.router.navigateByUrl(afterLogin(user, this.next()));
      return;
    }
    // 403 EMAIL_NOT_CONFIRMED : l'intercepteur mène à /confirmer-email ; la page y affiche l'adresse (fiche 25).
    if (this.store.problem()?.code === 'EMAIL_NOT_CONFIRMED') this.confirmEmail.remember(email);
    // Focus utile après la réponse : le code s'il vient d'être demandé, sinon le mot de passe (fiche 11).
    const target =
      this.store.otpRequired() && (!wasOtpRequired || this.store.problem() !== null)
        ? this.otpInput
        : this.passwordInput;
    if (this.store.problem()?.status === 401 || this.store.otpRequired()) {
      afterNextRender(() => target()?.nativeElement.focus(), { injector: this.injector });
    }
  }
}

function formatDelay(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

/** Message de l'écran pour une erreur ; les 403 d'état sont redirigés par l'intercepteur. */
function errorMessage(problem: ApiProblem | null): string | null {
  if (!problem) return null;
  switch (problem.status) {
    case 401:
      return $localize`:Connexion refusée, message unique (fiche 11)@@auth.login.error.credentials:E-mail, mot de passe ou code incorrect.`;
    case 403:
    case 423:
      return null;
    case 422:
      return $localize`:Connexion refusée, champ mal formé@@auth.login.error.invalid:Vérifiez l'adresse e-mail et le mot de passe saisis.`;
    default:
      return $localize`:Connexion impossible, serveur ou réseau@@auth.login.error.unavailable:Connexion impossible pour le moment. Réessayez dans un instant.`;
  }
}
