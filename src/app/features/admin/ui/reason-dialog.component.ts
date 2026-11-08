import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

import { ApiProblem } from '../../../core/http';
import { applyProblem, FieldErrorsComponent } from '../../../shared/forms';

/** Boîte « motif obligatoire » : suspension, réactivation (fiche 21), réponse à un recours. */
export interface ReasonDialogData {
  title: string;
  description: string;
  label: string;
  /** Longueur minimale (après blancs de bord), vérifiée côté client ; le serveur reste juge. */
  minLength: number;
  confirmLabel: string;
  destructive?: boolean;
  /** Case cochée et non décochable (« le motif est envoyé au praticien »). */
  lockedNotice?: string;
  /** Envoi au serveur : null si fait (la boîte se ferme), sinon le problème à afficher. */
  submit: (reason: string) => Promise<ApiProblem | null>;
}

/**
 * Boîte de dialogue à motif (fiche 21) : `role="dialog"`, focus sur le champ motif, bouton
 * destructif en dernier ; un 422 s'affiche sous le champ, un 409 d'état en alerte dans la boîte.
 * Ouverte par MatDialog depuis la page ; se ferme sur true quand l'action est faite.
 */
@Component({
  selector: 'pm-reason-dialog',
  imports: [ReactiveFormsModule, MatButtonModule, MatDialogModule, FieldErrorsComponent],
  template: `
    <h2 mat-dialog-title id="reason-dialog-title">{{ data.title }}</h2>
    <form [formGroup]="form" (ngSubmit)="confirm()">
      <mat-dialog-content>
        <p class="description" id="reason-dialog-description">{{ data.description }}</p>
        <div class="field">
          <label for="reason-field">{{ data.label }}</label>
          <textarea
            id="reason-field"
            formControlName="reason"
            maxlength="4000"
            cdkFocusInitial
            [attr.aria-invalid]="
              (form.controls.reason.invalid && form.controls.reason.touched) || null
            "
            aria-describedby="reason-field-error reason-field-hint"
          ></textarea>
          <p class="hint" id="reason-field-hint">{{ hint }}</p>
          <pm-field-errors [control]="form.controls.reason" id="reason-field-error" />
        </div>
        @if (data.lockedNotice) {
          <label class="locked">
            <input type="checkbox" checked disabled />
            <span>{{ data.lockedNotice }}</span>
          </label>
        }
        @if (error(); as text) {
          <p class="error" role="alert">{{ text }}</p>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-stroked-button type="button" (click)="cancel()" [disabled]="sending()">
          {{ cancelLabel }}
        </button>
        <button
          mat-flat-button
          type="submit"
          [class.danger]="data.destructive"
          [disabled]="form.invalid || sending()"
        >
          {{ data.confirmLabel }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styleUrl: './reason-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReasonDialogComponent {
  protected readonly data = inject<ReasonDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<ReasonDialogComponent, boolean>>(MatDialogRef);

  protected readonly form = new FormGroup({
    reason: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        (control) =>
          (control.value as string).trim().length < this.data.minLength
            ? { minlength: { requiredLength: this.data.minLength } }
            : null,
      ],
    }),
  });

  protected readonly sending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly cancelLabel = $localize`:Bouton d'annulation d'une confirmation@@confirm.cancel:Annuler`;
  protected readonly hint =
    this.data.minLength > 1
      ? $localize`:Aide du champ motif@@admin.reason.hint:Au moins ${this.data.minLength}:n: caractères ; enregistré au journal.`
      : $localize`:Aide du champ réponse@@admin.reason.hintShort:Envoyé par e-mail ; enregistré au journal.`;

  protected async confirm(): Promise<void> {
    if (this.form.invalid || this.sending()) return;
    this.sending.set(true);
    this.error.set(null);
    const problem = await this.data.submit(this.form.controls.reason.value.trim());
    this.sending.set(false);
    if (!problem) {
      this.ref.close(true);
      return;
    }
    const { unmatched } = applyProblem(this.form, problem);
    if (problem.status !== 422 || unmatched.length > 0) this.error.set(errorText(problem));
  }

  protected cancel(): void {
    this.ref.close(false);
  }
}

function errorText(problem: ApiProblem): string {
  switch (problem.code) {
    case 'ADMIN_SELF_SUSPEND':
      return $localize`:Suspension de soi-même@@admin.reason.selfSuspend:Vous ne pouvez pas suspendre votre propre compte.`;
    case 'ADMIN_LAST_ADMIN':
      return $localize`:Dernier administrateur@@admin.reason.lastAdmin:C'est le dernier administrateur actif : il ne peut pas être suspendu.`;
    case 'ADMIN_ACCOUNT_NOT_SUSPENDABLE':
      return $localize`:Compte non suspendable@@admin.reason.notSuspendable:Ce compte est déjà suspendu, refusé ou clos.`;
    case 'ADMIN_ACCOUNT_NOT_REACTIVABLE':
    case 'APPEAL_ACCOUNT_NOT_REACTIVABLE':
      return $localize`:Compte non réactivable@@admin.reason.notReactivable:Ce compte n'est ni suspendu ni refusé : il n'y a rien à réactiver.`;
    case 'APPEAL_SELF_REVIEW':
      return $localize`:Recours sur sa propre décision@@admin.reason.selfReview:Vous êtes l'auteur de la décision contestée : un autre administrateur doit examiner ce recours.`;
    case 'APPEAL_ALREADY_DECIDED':
      return $localize`:Recours déjà examiné@@admin.reason.alreadyDecided:Ce recours a déjà été examiné.`;
    default:
      return (
        problem.detail ??
        $localize`:Erreur d'une action à motif@@admin.reason.error:L'action n'a pas pu être enregistrée. Rien n'a été modifié.`
      );
  }
}
