import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { Router, RouterLink } from '@angular/router';
import { startWith } from 'rxjs';

import { afterLogin, AUTH_PATHS, SessionStore, SessionUser } from '../../../core/auth';
import { ApiProblem, FieldProblem } from '../../../core/http';
import { applyProblem, fieldId, FieldErrorsComponent, PmValidators } from '../../../shared/forms';
import { ToastService } from '../../../shared/ui';
import {
  LockNoticeComponent,
  PasswordRulesComponent,
  TwoFactorSetupComponent,
} from '../../account';
import { FirstLoginStore } from '../data/first-login.store';

/** Les deux étapes bloquantes (G Q5) ; `done` : plus rien n'est exigé, on sort de la page. */
export type FirstLoginStep = 'password' | 'twoFactor' | 'done';

/** Étape exigée par l'état du compte ; sans session, le mot de passe (403 au login). */
export function firstLoginStep(me: SessionUser | null): FirstLoginStep {
  if (!me || me.passwordChangeRequired) return 'password';
  if (me.role === 'admin' && !me.twoFactorEnabled) return 'twoFactor';
  return 'done';
}

/**
 * /premiere-connexion (fiche 18 C, G Q5) : écran bloquant du compte créé par `make admin`. Étape 1 :
 * e-mail, mot de passe temporaire, nouveau mot de passe avec les règles cochées, confirmation ;
 * 204 → reconnexion automatique avec le nouveau mot de passe. Étape 2 : activation obligatoire de la
 * 2FA (composant de features/account), puis les codes de secours à confirmer avant d'ouvrir /admin.
 * Déclenché par passwordChangeRequired (statusGuard, afterLogin) et par les 403
 * PASSWORD_CHANGE_REQUIRED / TWO_FACTOR_REQUIRED (core/http) ; /admin reste fermé avant la fin.
 */
@Component({
  selector: 'pm-first-login-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    FieldErrorsComponent,
    LockNoticeComponent,
    PasswordRulesComponent,
    TwoFactorSetupComponent,
  ],
  providers: [FirstLoginStore],
  templateUrl: './first-login.page.html',
  styleUrl: './first-login.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FirstLoginPage {
  protected readonly store = inject(FirstLoginStore);
  protected readonly session = inject(SessionStore);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);
  private readonly injector = inject(Injector);

  protected readonly loginPath = AUTH_PATHS.login;
  protected readonly fieldId = (name: string) => fieldId(`firstLogin.${name}`);
  protected readonly mismatchMessage = $localize`:Confirmation différente du mot de passe@@auth.firstLogin.password.mismatch:La confirmation ne correspond pas au nouveau mot de passe.`;

  /**
   * Une fois l'étape 2 affichée, elle reste affichée jusqu'à « Ouvrir l'administration » : la session
   * dit twoFactorEnabled dès que verify réussit, mais les codes de secours doivent être confirmés avant
   * tout accès à /admin (fiche 18 C).
   */
  private readonly twoFactorStarted = signal(false);
  protected readonly step = computed<FirstLoginStep>(() =>
    this.twoFactorStarted() ? 'twoFactor' : firstLoginStep(this.session.me()),
  );
  protected readonly isAdmin = computed(() => this.session.me()?.role === 'admin');
  /** E-mail connu par la session (compte déjà connecté) : champ en lecture seule. */
  protected readonly knownEmail = computed(() => this.session.me()?.email ?? '');

  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    currentPassword: ['', [Validators.required, Validators.maxLength(200)]],
    newPassword: ['', [Validators.required, PmValidators.password, Validators.maxLength(200)]],
    confirm: ['', [Validators.required, sameAs('newPassword')]],
    otp: ['', [Validators.maxLength(32)]],
  });

  private readonly otpInput = viewChild<ElementRef<HTMLInputElement>>('otpInput');

  protected readonly newPassword = toSignal(
    this.form.controls.newPassword.valueChanges.pipe(startWith('')),
    { initialValue: '' },
  );
  protected readonly submitting = computed(() => this.store.status() === 'submitting');
  protected readonly locked = computed(() => this.store.lockedUntil() !== null);
  protected readonly policyProblems = signal<FieldProblem[]>([]);
  protected readonly message = computed(() => formMessage(this.store.problem()));

  /** Étape 2 : la case « Je les ai enregistrés » des codes de secours. */
  protected readonly codesSaved = signal(false);

  constructor() {
    effect(() => {
      const email = this.knownEmail();
      untracked(() => {
        if (email) this.form.controls.email.setValue(email);
      });
    });
    effect(() => {
      this.newPassword();
      this.form.controls.confirm.updateValueAndValidity({ emitEvent: false });
    });
    effect(() => {
      if (this.store.otpRequired()) {
        this.form.controls.otp.addValidators(Validators.required);
        afterNextRender(() => this.otpInput()?.nativeElement.focus(), {
          injector: this.injector,
        });
      }
    });
    effect(() => {
      if (firstLoginStep(this.session.me()) === 'twoFactor') {
        untracked(() => this.twoFactorStarted.set(true));
      }
    });
    // Plus rien d'exigé (praticien dont le mot de passe est remplacé, admin déjà équipé) : on sort.
    effect(() => {
      const me = this.session.me();
      if (me && this.step() === 'done') {
        untracked(() => void this.router.navigateByUrl(afterLogin(me)));
      }
    });
  }

  /**
   * Lien d'évitement (UX-A10b) : le focus passe au contenu, après la barre. Sans cela, `#contenu`
   * se résoudrait contre `<base href="/fr/">` et quitterait la page (/fr/#contenu).
   */
  protected skipToContent(event: Event, content: HTMLElement): void {
    event.preventDefault();
    content.focus();
  }

  protected invalid(control: AbstractControl): boolean {
    return control.invalid && (control.touched || control.dirty);
  }

  protected async submitPassword(): Promise<void> {
    if (this.submitting() || this.locked()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { email, currentPassword, newPassword, otp } = this.form.getRawValue();
    const outcome = await this.store.changePassword({
      email: email.trim(),
      currentPassword,
      newPassword,
      otp: this.store.otpRequired() ? otp.trim() : undefined,
    });
    switch (outcome) {
      case 'signed-in':
        // La session est ouverte : `step` passe à twoFactor (admin) ou done (effet de sortie).
        this.policyProblems.set([]);
        return;
      case 'relogin':
        this.toasts.success(
          $localize`:Mot de passe remplacé, reconnexion avec code@@auth.firstLogin.relogin:Mot de passe enregistré. Reconnectez-vous avec votre nouveau mot de passe et votre code.`,
        );
        await this.router.navigateByUrl(AUTH_PATHS.login);
        return;
      case 'otp-required':
        return;
      case 'failed': {
        const problem = this.store.problem();
        if (problem?.status === 422) {
          const errors = problem.errors ?? [];
          this.policyProblems.set(errors.filter((e) => e.field === 'password'));
          applyProblem(this.form, {
            ...problem,
            errors: errors.filter((e) => e.field !== 'password'),
          });
        } else {
          this.policyProblems.set([]);
        }
      }
    }
  }

  /** Étape 2 terminée : les codes sont confirmés, l'administration s'ouvre. */
  protected async openAdmin(): Promise<void> {
    const me = this.session.me();
    if (!this.codesSaved() || !me) return;
    await this.router.navigateByUrl(afterLogin(me));
  }

  protected async logout(): Promise<void> {
    await this.session.logout();
    await this.router.navigateByUrl(AUTH_PATHS.login);
  }
}

/** Le contrôle doit valoir la même chose que son voisin (confirmation du mot de passe). */
function sameAs(other: string) {
  return (control: AbstractControl): ValidationErrors | null => {
    const sibling = control.parent?.get(other);
    if (!sibling || !control.value) return null;
    return control.value === sibling.value ? null : { mismatch: true };
  };
}

/** Message sous le formulaire ; null quand un champ ou le verrou l'affiche déjà. */
function formMessage(problem: ApiProblem | null): string | null {
  if (!problem) return null;
  switch (problem.status) {
    case 401:
      return $localize`:Identifiants refusés à la première connexion, message unique@@auth.firstLogin.error.credentials:E-mail, mot de passe temporaire ou code incorrect.`;
    case 403:
      return $localize`:Compte non autorisé à changer son mot de passe@@auth.firstLogin.error.forbidden:Ce compte ne peut pas changer son mot de passe pour le moment (adresse non confirmée ou compte suspendu).`;
    case 422:
    case 423:
      return null;
    default:
      return $localize`:Première connexion impossible, serveur ou réseau@@auth.firstLogin.error.unavailable:Opération impossible pour le moment. Rien n'a été modifié ; réessayez dans un instant.`;
  }
}
