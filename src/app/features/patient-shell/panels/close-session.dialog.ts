import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';

import { applyProblem, fieldId, FieldErrorsComponent } from '../../../shared/forms';
import { PatientShellStore } from '../data/patient-shell.store';
import { sessionProblemText } from '../ui/shell-labels';

/** Bornes du contrat (CloseSessionRequest.durationMin). */
export const CLOSE_DURATION_MIN = 1;
export const CLOSE_DURATION_MAX = 600;

/** Issue du dialogue : clôturée, ou déjà changée ailleurs (409, l'en-tête a été relu). */
export type CloseSessionResult = 'closed' | 'conflict';

function durationRange(control: AbstractControl): ValidationErrors | null {
  const raw = String(control.value ?? '').trim();
  if (!raw) return null;
  const value = Number(raw);
  return /^\d+$/.test(raw) && value >= CLOSE_DURATION_MIN && value <= CLOSE_DURATION_MAX
    ? null
    : { durationRange: true };
}

/**
 * Clôture de la séance (fiche 00 §2, handbook §6.2) : durée proposée depuis la préférence
 * sessions.defaultDurationMin, compte rendu facultatif, POST /api/sessions/{id}/close par le
 * PatientShellStore. 422 → message sous le champ ; 409 → le dialogue se ferme, l'en-tête est relu.
 * Ouvert par la page du shell avec son injecteur (le store du dossier).
 */
@Component({
  selector: 'pm-close-session-dialog',
  imports: [FieldErrorsComponent, MatButtonModule, MatDialogModule, ReactiveFormsModule],
  templateUrl: './close-session.dialog.html',
  styleUrl: './close-session.dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CloseSessionDialog {
  protected readonly store = inject(PatientShellStore);
  private readonly ref = inject<MatDialogRef<CloseSessionDialog, CloseSessionResult>>(MatDialogRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly form = new FormGroup({
    durationMin: new FormControl(String(this.store.defaultDurationMin()), {
      nonNullable: true,
      validators: [Validators.required, durationRange],
    }),
    summary: new FormControl('', { nonNullable: true }),
  });

  protected readonly fid = fieldId;
  protected readonly durationEvents = toSignal(this.form.controls.durationMin.events);
  /** Message de la règle de durée côté client (le serveur reste juge : son 422 passe avant). */
  protected readonly rangeError = computed(() => {
    this.durationEvents();
    const control = this.form.controls.durationMin;
    return control.hasError('durationRange') && (control.touched || control.dirty);
  });
  /** Problème sans champ (5xx, réseau) : affiché en tête du dialogue. */
  protected readonly generalError = signal('');

  protected async submit(): Promise<void> {
    if (this.store.busy()) return;
    this.generalError.set('');
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.focus('durationMin');
      return;
    }
    const { durationMin, summary } = this.form.getRawValue();
    const ok = await this.store.closeSession({ durationMin: Number(durationMin), summary });
    if (ok) {
      this.ref.close('closed');
      return;
    }
    const problem = this.store.actionProblem();
    if (problem?.status === 409) {
      this.ref.close('conflict');
      return;
    }
    const { applied } = applyProblem(this.form, problem);
    if (applied.length > 0) this.focus(applied[0].field);
    else this.generalError.set(sessionProblemText(problem));
  }

  protected cancel(): void {
    this.ref.close();
  }

  protected invalid(control: AbstractControl): boolean {
    return control.invalid && (control.touched || control.dirty);
  }

  private focus(field: string): void {
    this.host.nativeElement.querySelector<HTMLElement>(`#${fieldId(field)}`)?.focus();
  }
}
