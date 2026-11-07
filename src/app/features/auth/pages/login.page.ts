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
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Router } from '@angular/router';

import { afterLogin } from '../../../core/auth';
import { ApiProblem } from '../../../core/http/api-problem';
import { LoginStore } from '../data/login.store';

/**
 * /connexion, version minimale de M0-07 (fiche 11) : e-mail, mot de passe, « rester connecté »,
 * bloc code de vérification après un 202, messages 401 / 423. L'écran complet est M1-15.
 */
@Component({
  selector: 'pm-login-page',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  providers: [LoginStore],
  templateUrl: './login.page.html',
  styleUrl: './login.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {
  /** ?next= : la page demandée avant la connexion (liée par withComponentInputBinding). */
  readonly next = input<string | undefined>();

  protected readonly store = inject(LoginStore);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);

  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    password: ['', [Validators.required, Validators.maxLength(200)]],
    otp: ['', [Validators.maxLength(32)]],
    rememberMe: [false],
  });

  private readonly passwordInput = viewChild<ElementRef<HTMLInputElement>>('passwordInput');
  private readonly otpInput = viewChild<ElementRef<HTMLInputElement>>('otpInput');

  private readonly now = signal(Date.now());
  protected readonly lockSeconds = computed(() => {
    const until = this.store.lockedUntil();
    return until === null ? 0 : Math.max(0, Math.ceil((until - this.now()) / 1000));
  });
  protected readonly locked = computed(() => this.lockSeconds() > 0);
  protected readonly lockDelay = computed(() => formatDelay(this.lockSeconds()));
  protected readonly message = computed(() => errorMessage(this.store.problem()));

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

  protected async submit(): Promise<void> {
    if (this.form.invalid || this.locked() || this.store.status() === 'submitting') {
      this.form.markAllAsTouched();
      return;
    }
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
