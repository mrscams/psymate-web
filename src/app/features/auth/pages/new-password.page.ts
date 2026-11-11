import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  Injector,
  input,
  signal,
  untracked,
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

import { AUTH_PATHS } from '../../../core/auth';
import { applyProblem, FieldErrorsComponent, PmValidators } from '../../../shared/forms';
import { AUTH_FEATURE_PATHS } from '../auth-feature-paths';
import { PasswordResetConfirmStore } from '../data/password-reset-confirm.store';
import {
  CriterionState,
  passwordCriteria,
  passwordStrength,
  strengthText,
} from '../data/password-strength';
import { PASSWORD_CHANGED_STATE } from './login.page';
import { PASSWORD_RESET_LINK_MINUTES } from './password-reset.page';

/** Une ligne de la liste des critères (fiche 26 : chaque item annonce son état). */
interface CriterionLine {
  key: string;
  label: string;
  state: CriterionState;
}

/**
 * Étape 2 sur 2 du mot de passe oublié (fiche 26, UX-D4) : /reinitialiser/:token (route de la
 * fiche) et /reset-password?token= (lien de l'e-mail envoyé par psymate-api). Nouveau mot de passe
 * avec bouton afficher, jauge en 4 segments, critères évalués en direct (le serveur reste juge :
 * 422 PASSWORD_POLICY relié au champ), confirmation vérifiée au blur. Contrat :
 * POST /api/auth/password-reset/confirm { token, password } → 204, toutes les sessions révoquées,
 * aucune session ouverte : retour à /connexion avec un message ; 410 → « lien expiré » et nouvelle
 * demande. Le contrat n'expose ni l'adresse masquée ni l'échéance du jeton (pas de GET), ni le choix
 * de garder les autres sessions : la page l'annonce au lieu de proposer une case.
 */
@Component({
  selector: 'pm-new-password-page',
  imports: [ReactiveFormsModule, RouterLink, MatButtonModule, FieldErrorsComponent],
  providers: [PasswordResetConfirmStore],
  templateUrl: './new-password.page.html',
  styleUrls: ['./password-reset.page.scss', './new-password.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewPasswordPage {
  /** :token (fiche) ou ?token= (lien de l'e-mail), liés par withComponentInputBinding. */
  readonly token = input<string | undefined>();

  protected readonly store = inject(PasswordResetConfirmStore);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);

  protected readonly loginPath = AUTH_PATHS.login;
  protected readonly requestPath = AUTH_FEATURE_PATHS.passwordReset;
  protected readonly minutes = PASSWORD_RESET_LINK_MINUTES;

  protected readonly form = inject(NonNullableFormBuilder).group({
    password: ['', [Validators.required, PmValidators.password, Validators.maxLength(200)]],
    passwordConfirm: ['', [Validators.required, sameAs('password')]],
  });

  protected readonly showPassword = signal(false);
  protected readonly showPasswordLabel = $localize`:Bouton afficher le mot de passe@@auth.login.showPassword:Afficher le mot de passe`;
  protected readonly mismatchMessage = $localize`:Confirmation du mot de passe différente@@auth.register.error.mismatch:Les deux mots de passe ne sont pas identiques.`;

  private readonly passwordValue = toSignal(
    this.form.controls.password.valueChanges.pipe(startWith('')),
    { initialValue: '' },
  );
  protected readonly strength = computed(() => passwordStrength(this.passwordValue()));
  protected readonly strengthBars = [1, 2, 3, 4] as const;
  protected readonly strengthText = computed(() =>
    strengthText(this.strength().level, this.strength().length),
  );

  protected readonly criteria = computed<CriterionLine[]>(() => {
    const c = passwordCriteria(this.passwordValue());
    return [
      {
        key: 'length',
        label: $localize`:Critère du nouveau mot de passe@@auth.newPassword.criterion.length:12 caractères minimum`,
        state: c.length,
      },
      {
        key: 'case',
        label: $localize`:Critère du nouveau mot de passe@@auth.newPassword.criterion.case:Majuscules et minuscules`,
        state: c.mixedCase,
      },
      {
        key: 'compromised',
        label: $localize`:Critère du nouveau mot de passe, vérifié par le serveur@@auth.newPassword.criterion.compromised:Absent des listes de mots de passe compromis`,
        state: c.compromised,
      },
      {
        key: 'digit',
        label: $localize`:Critère conseillé du nouveau mot de passe@@auth.newPassword.criterion.digit:Un chiffre ou un symbole (conseillé)`,
        state: c.digitOrSymbol,
      },
    ];
  });
  protected readonly stateLabels: Record<CriterionState, string> = {
    met: $localize`:État d'un critère, lu par les lecteurs d'écran@@auth.newPassword.criterion.met:validé`,
    pending: $localize`:État d'un critère, lu par les lecteurs d'écran@@auth.newPassword.criterion.pending:à faire`,
    server: $localize`:État d'un critère vérifié par le serveur@@auth.newPassword.criterion.server:vérifié à l'enregistrement`,
  };

  /** Erreur hors champ : 422 sans champ connu, ou serveur injoignable. */
  protected readonly generalError = signal<string | null>(null);
  protected readonly submitting = computed(() => this.store.status() === 'submitting');

  constructor() {
    // La confirmation se revalide quand le mot de passe change (sameAs lit son voisin).
    effect(() => {
      this.passwordValue();
      this.form.controls.passwordConfirm.updateValueAndValidity({ emitEvent: false });
    });
    // Sans jeton, rien à envoyer : la page « lien expiré » propose une nouvelle demande.
    effect(() => {
      if (!this.token()) untracked(() => this.store.markExpired());
    });
  }

  protected togglePassword(): void {
    this.showPassword.set(!this.showPassword());
  }

  protected isInvalid(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  protected async submit(): Promise<void> {
    if (this.submitting()) return;
    const token = this.token();
    if (!token) {
      this.store.markExpired();
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.focusFirstInvalid();
      return;
    }
    this.generalError.set(null);
    const outcome = await this.store.confirmReset(token, this.form.getRawValue().password);
    if (outcome === 'done') {
      await this.router.navigateByUrl(AUTH_PATHS.login, {
        state: { [PASSWORD_CHANGED_STATE]: true },
      });
      return;
    }
    if (outcome === 'expired') {
      afterNextRender(() => this.document.getElementById('new-password-title')?.focus(), {
        injector: this.injector,
      });
      return;
    }
    const problem = this.store.problem();
    const applied = applyProblem(this.form, problem);
    if (applied.applied.length > 0) {
      this.focusFirstInvalid();
      return;
    }
    this.generalError.set(
      problem?.status === 422
        ? $localize`:Nouveau mot de passe refusé sans champ@@auth.newPassword.error.invalid:Ce mot de passe n'a pas été accepté. Vérifiez les critères ci-dessus.`
        : $localize`:Nouveau mot de passe, serveur ou réseau@@auth.newPassword.error.unavailable:Enregistrement impossible pour le moment. Votre mot de passe n'a pas changé ; réessayez dans un instant.`,
    );
  }

  private focusFirstInvalid(): void {
    const id = this.form.controls.password.invalid ? 'new-password' : 'new-password-confirm';
    afterNextRender(() => this.document.getElementById(id)?.focus(), { injector: this.injector });
  }
}

/** Le contrôle doit valoir la même chose que son voisin `other` (confirmation du mot de passe). */
function sameAs(other: string) {
  return (control: AbstractControl): ValidationErrors | null => {
    const sibling = control.parent?.get(other);
    if (!sibling || !control.value) return null;
    return control.value === sibling.value ? null : { mismatch: true };
  };
}
