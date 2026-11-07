import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
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
import { startWith } from 'rxjs';

import { ApiProblem, FieldProblem } from '../../../core/http';
import { applyProblem, fieldId, FieldErrorsComponent, PmValidators } from '../../../shared/forms';
import { SidePanelComponent } from '../../../shared/ui';
import { PasswordChangeStore } from '../data/credentials.store';
import { LockNoticeComponent } from '../ui/lock-notice.component';
import { PasswordRulesComponent } from '../ui/password-rules.component';
import { UNAVAILABLE_MESSAGE } from '../ui/security-messages';

export interface PasswordChangePanelData {
  /** E-mail du compte connecté : POST /api/auth/password/change l'exige (route publique). */
  email: string;
}

/** Résultat : `'changed'` sur 204 (toutes les sessions sont révoquées, se reconnecter). */
export type PasswordChangePanelResult = 'changed';

/**
 * Panneau « Modifier le mot de passe » (fiche 18 A) : mot de passe actuel, nouveau avec les règles
 * cochées au fil de la saisie, confirmation, champ code dès que l'API répond 202 otpRequired.
 * 422 PASSWORD_POLICY coche les règles en erreur ; PASSWORD_UNCHANGED et 401 s'affichent sous le
 * formulaire ; 423 affiche le délai et désactive le bouton.
 */
@Component({
  selector: 'pm-password-change-panel',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    SidePanelComponent,
    FieldErrorsComponent,
    LockNoticeComponent,
    PasswordRulesComponent,
  ],
  providers: [PasswordChangeStore],
  templateUrl: './password-change.panel.html',
  styleUrl: './security-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PasswordChangePanel {
  protected readonly store = inject(PasswordChangeStore);
  private readonly data = inject<PasswordChangePanelData>(DIALOG_DATA);
  private readonly ref = inject<DialogRef<PasswordChangePanelResult>>(DialogRef);
  private readonly injector = inject(Injector);

  protected readonly title = $localize`:Titre du panneau mot de passe@@account.security.password.title:Modifier le mot de passe`;
  protected readonly fieldId = (name: string) => fieldId(`password.${name}`);
  protected readonly mismatchMessage = $localize`:Confirmation différente du mot de passe@@account.security.password.mismatch:La confirmation ne correspond pas au nouveau mot de passe.`;

  protected readonly form = inject(NonNullableFormBuilder).group({
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
  protected readonly busy = computed(() => this.store.action().status === 'busy');
  protected readonly locked = computed(() => this.store.action().lockedUntil !== null);
  /** errors[] du 422 PASSWORD_POLICY sur le champ password (contrat) : cochent les règles. */
  protected readonly policyProblems = signal<FieldProblem[]>([]);
  protected readonly message = computed(() => formMessage(this.store.action().problem));

  constructor() {
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
  }

  protected invalid(control: AbstractControl): boolean {
    return control.invalid && (control.touched || control.dirty);
  }

  protected cancel(): void {
    this.ref.close();
  }

  protected async submit(): Promise<void> {
    if (this.busy() || this.locked()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { currentPassword, newPassword, otp } = this.form.getRawValue();
    const changed = await this.store.submit({
      email: this.data.email,
      currentPassword,
      newPassword,
      otp: this.store.otpRequired() ? otp.trim() : undefined,
    });
    if (changed) {
      this.ref.close('changed');
      return;
    }
    const problem = this.store.action().problem;
    if (problem?.status === 422) {
      const errors = problem.errors ?? [];
      this.policyProblems.set(errors.filter((e) => e.field === 'password'));
      // Les autres champs du contrat portent leur nom de requête ; `password` est rendu par les règles.
      applyProblem(this.form, { ...problem, errors: errors.filter((e) => e.field !== 'password') });
    } else {
      this.policyProblems.set([]);
    }
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
      return $localize`:Mot de passe actuel ou code refusé, message unique@@account.security.password.credentials:Mot de passe actuel ou code incorrect.`;
    case 422:
    case 423:
      return null;
    default:
      return UNAVAILABLE_MESSAGE;
  }
}
