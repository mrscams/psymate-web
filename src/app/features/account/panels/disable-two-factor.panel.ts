import { DialogRef } from '@angular/cdk/dialog';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';

import { ApiProblem } from '../../../core/http';
import { applyProblem, fieldId, FieldErrorsComponent } from '../../../shared/forms';
import { SidePanelComponent } from '../../../shared/ui';
import { TwoFactorStore } from '../data/two-factor.store';
import { LockNoticeComponent } from '../ui/lock-notice.component';
import { INVALID_CODE_MESSAGE, UNAVAILABLE_MESSAGE } from '../ui/security-messages';

/**
 * Panneau « Désactiver la double authentification » (fiche 18 A) : mot de passe + code TOTP ou de
 * secours, 422 INVALID_PASSWORD / INVALID_CODE rendus sur le bon champ, 409 et 423 affichés.
 * Absent pour un administrateur (la page ne montre pas le bouton).
 */
@Component({
  selector: 'pm-disable-two-factor-panel',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    SidePanelComponent,
    FieldErrorsComponent,
    LockNoticeComponent,
  ],
  providers: [TwoFactorStore],
  template: `
    <pm-side-panel [title]="title">
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <p class="intro" i18n="Explication de la désactivation@@account.security.disable.intro">
          Vos codes de secours seront retirés et la connexion ne demandera plus de code. Pour
          confirmer, saisissez votre mot de passe et un code de votre application (ou un code de
          secours).
        </p>
        <div class="field">
          <label
            [for]="fieldId('password')"
            i18n="Champ mot de passe actuel@@account.security.field.password"
            >Mot de passe</label
          >
          <input
            [id]="fieldId('password')"
            type="password"
            class="mono"
            formControlName="password"
            autocomplete="current-password"
            required
            [attr.aria-invalid]="invalid('password')"
            [attr.aria-describedby]="fieldId('password') + '-error'"
          />
          <pm-field-errors
            [control]="form.controls.password"
            [id]="fieldId('password') + '-error'"
          />
        </div>
        <div class="field">
          <label
            [for]="fieldId('code')"
            i18n="Champ code TOTP ou de secours@@account.security.field.code"
            >Code de vérification</label
          >
          <input
            [id]="fieldId('code')"
            type="text"
            class="otp"
            formControlName="code"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="32"
            required
            [attr.aria-invalid]="invalid('code')"
            [attr.aria-describedby]="fieldId('code') + '-hint ' + fieldId('code') + '-error'"
          />
          <p
            class="hint"
            [id]="fieldId('code') + '-hint'"
            i18n="Aide du champ code à la désactivation@@account.security.disable.codeHint"
          >
            Les 6 chiffres de l'application, ou l'un de vos codes de secours.
          </p>
          <pm-field-errors [control]="form.controls.code" [id]="fieldId('code') + '-error'" />
        </div>
        @if (message(); as text) {
          <p class="banner banner--danger" role="alert">{{ text }}</p>
        }
        <pm-lock-notice [until]="store.disabling().lockedUntil" (expired)="store.unlock()" />
        <div class="actions">
          <button
            mat-button
            type="button"
            (click)="cancel()"
            i18n="Annuler@@account.security.cancel"
          >
            Annuler
          </button>
          <button
            mat-flat-button
            type="submit"
            class="danger"
            [disabled]="busy() || locked()"
            i18n="Confirmer la désactivation de la 2FA@@account.security.disable.submit"
          >
            Désactiver
          </button>
        </div>
      </form>
    </pm-side-panel>
  `,
  styleUrl: './security-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DisableTwoFactorPanel {
  protected readonly store = inject(TwoFactorStore);
  private readonly ref = inject<DialogRef<true>>(DialogRef);

  protected readonly title = $localize`:Titre du panneau de désactivation 2FA@@account.security.disable.title:Désactiver la double authentification`;
  protected readonly fieldId = (name: string) => fieldId(`disable.${name}`);

  protected readonly form = inject(NonNullableFormBuilder).group({
    password: ['', [Validators.required, Validators.maxLength(200)]],
    code: ['', [Validators.required, Validators.maxLength(32)]],
  });

  protected readonly busy = computed(() => this.store.disabling().status === 'busy');
  protected readonly locked = computed(() => this.store.disabling().lockedUntil !== null);
  /** Erreur hors champ : 409 (admin, 2FA inactive) ou serveur ; les 422 sont sur les champs. */
  protected readonly message = signal<string | null>(null);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.store.reset());
  }

  protected invalid(name: 'password' | 'code'): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || control.dirty);
  }

  protected cancel(): void {
    this.ref.close();
  }

  protected async submit(): Promise<void> {
    if (this.busy() || this.locked()) return;
    this.message.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { password, code } = this.form.getRawValue();
    const ok = await this.store.disable(password, code.trim());
    if (ok) {
      this.ref.close(true);
      return;
    }
    const problem = this.store.disabling().problem;
    if (problem?.status === 422) {
      // Message unique pour le code (fiche 18) ; le message du serveur pour le mot de passe.
      applyProblem(this.form, {
        ...problem,
        errors: (problem.errors ?? []).map((e) =>
          e.code === 'INVALID_CODE' ? { ...e, message: INVALID_CODE_MESSAGE } : e,
        ),
      });
      return;
    }
    this.message.set(disableMessage(problem));
  }
}

function disableMessage(problem: ApiProblem | null): string | null {
  if (!problem || problem.status === 423) return null;
  if (problem.status === 409) {
    return problem.code === 'TWO_FACTOR_REQUIRED_FOR_ADMIN'
      ? $localize`:Désactivation refusée à un admin@@account.security.disable.admin:Un compte administrateur ne peut pas désactiver sa double authentification.`
      : $localize`:Désactivation sans 2FA active@@account.security.disable.notEnabled:La double authentification n'est pas active sur ce compte.`;
  }
  return UNAVAILABLE_MESSAGE;
}
