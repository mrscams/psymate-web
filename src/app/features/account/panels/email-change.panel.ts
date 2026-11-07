import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';

import { ApiProblem } from '../../../core/http';
import { applyProblem, fieldId, FieldErrorsComponent } from '../../../shared/forms';
import { SidePanelComponent } from '../../../shared/ui';
import { EmailChangeStore } from '../data/credentials.store';
import { LockNoticeComponent } from '../ui/lock-notice.component';
import { UNAVAILABLE_MESSAGE } from '../ui/security-messages';

export interface EmailChangePanelData {
  currentEmail: string;
}

/** Résultat : la nouvelle adresse, à laquelle le lien de confirmation est parti (202). */
export type EmailChangePanelResult = string;

/**
 * Panneau « Modifier l'e-mail de connexion » (fiche 18 A, contrat v0.10.0) : nouvelle adresse et
 * mot de passe ; 422 INVALID_PASSWORD sur le mot de passe (G Q49), 423 verrou par compte. Sur 202
 * l'adresse actuelle reste valable jusqu'à l'ouverture du lien (24 h).
 */
@Component({
  selector: 'pm-email-change-panel',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    SidePanelComponent,
    FieldErrorsComponent,
    LockNoticeComponent,
  ],
  providers: [EmailChangeStore],
  template: `
    <pm-side-panel [title]="title">
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <p class="intro" i18n="Explication du changement d'e-mail@@account.security.email.intro">
          Un lien de confirmation sera envoyé à la nouvelle adresse. Votre adresse actuelle ({{
            currentEmail
          }}) reste valable pour vous connecter jusqu'à ce que le lien soit ouvert (valable 24 h).
        </p>
        <div class="field">
          <label
            [for]="fieldId('newEmail')"
            i18n="Champ nouvelle adresse e-mail@@account.security.email.new"
            >Nouvelle adresse e-mail</label
          >
          <input
            [id]="fieldId('newEmail')"
            type="email"
            formControlName="newEmail"
            autocomplete="email"
            required
            [attr.aria-invalid]="invalid(form.controls.newEmail)"
            [attr.aria-describedby]="fieldId('newEmail') + '-error'"
          />
          <pm-field-errors
            [control]="form.controls.newEmail"
            [id]="fieldId('newEmail') + '-error'"
          />
        </div>
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
            [attr.aria-invalid]="invalid(form.controls.password)"
            [attr.aria-describedby]="fieldId('password') + '-error'"
          />
          <pm-field-errors
            [control]="form.controls.password"
            [id]="fieldId('password') + '-error'"
          />
        </div>
        @if (message(); as text) {
          <p class="banner banner--danger" role="alert">{{ text }}</p>
        }
        <pm-lock-notice [until]="store.action().lockedUntil" (expired)="store.unlock()" />
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
            [disabled]="busy() || locked()"
            i18n="Envoyer le lien de confirmation@@account.security.email.submit"
          >
            Envoyer le lien de confirmation
          </button>
        </div>
      </form>
    </pm-side-panel>
  `,
  styleUrl: './security-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmailChangePanel {
  protected readonly store = inject(EmailChangeStore);
  private readonly ref = inject<DialogRef<EmailChangePanelResult>>(DialogRef);

  protected readonly currentEmail = inject<EmailChangePanelData>(DIALOG_DATA).currentEmail;
  protected readonly title = $localize`:Titre du panneau e-mail@@account.security.email.title:Modifier l'e-mail de connexion`;
  protected readonly fieldId = (name: string) => fieldId(`email.${name}`);

  protected readonly form = inject(NonNullableFormBuilder).group({
    newEmail: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    password: ['', [Validators.required, Validators.maxLength(200)]],
  });

  protected readonly busy = computed(() => this.store.action().status === 'busy');
  protected readonly locked = computed(() => this.store.action().lockedUntil !== null);
  protected readonly message = computed(() => formMessage(this.store.action().problem));

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
    const { newEmail, password } = this.form.getRawValue();
    const sent = await this.store.submit(newEmail.trim(), password);
    if (sent) {
      this.ref.close(newEmail.trim());
      return;
    }
    const problem = this.store.action().problem;
    if (problem?.status === 422) applyProblem(this.form, problem);
  }
}

function formMessage(problem: ApiProblem | null): string | null {
  if (!problem || problem.status === 422 || problem.status === 423) return null;
  return UNAVAILABLE_MESSAGE;
}
