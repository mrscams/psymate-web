import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, ValidationErrors } from '@angular/forms';
import { startWith, switchMap } from 'rxjs';

import { SERVER_ERROR } from './apply-problem';

/**
 * Messages d'un champ (planche 29, 422) : le message du serveur tel quel, sinon le message de forme
 * du validateur client ; affichés une fois le champ touché ou modifié. L'identifiant sert à
 * aria-describedby sur le champ ; le champ porte aria-invalid de son côté.
 */
@Component({
  selector: 'pm-field-errors',
  template: `
    @if (message(); as text) {
      <p class="field-error" [id]="id()">{{ text }}</p>
    }
  `,
  styles: `
    .field-error {
      margin: 4px 0 0;
      font: var(--mat-sys-body-small);
      color: var(--danger);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FieldErrorsComponent {
  readonly control = input.required<AbstractControl>();
  readonly id = input.required<string>();
  /** Afficher même si le champ n'a pas été touché (après une soumission). */
  readonly force = input(false);

  private readonly events = toSignal(
    toObservable(this.control).pipe(switchMap((control) => control.events.pipe(startWith(null)))),
  );

  protected readonly message = computed(() => {
    this.events();
    const control = this.control();
    if (!control.invalid || !control.errors) return null;
    if (!this.force() && !control.touched && !control.dirty) return null;
    return firstMessage(control.errors);
  });
}

/** Message d'un jeu d'erreurs : celui du serveur d'abord, puis la première règle de forme connue. */
export function firstMessage(errors: ValidationErrors): string {
  const server = errors[SERVER_ERROR];
  if (typeof server === 'string' && server) return server;
  if (errors['required']) {
    return $localize`:Erreur de champ, valeur manquante@@forms.error.required:Ce champ est obligatoire.`;
  }
  if (errors['email']) {
    return $localize`:Erreur de champ, e-mail mal formé@@forms.error.email:Adresse e-mail invalide.`;
  }
  if (errors['minlength']) {
    const n = (errors['minlength'] as { requiredLength: number }).requiredLength;
    return $localize`:Erreur de champ, trop court@@forms.error.minlength:Au moins ${n}:n: caractères.`;
  }
  if (errors['maxlength']) {
    const n = (errors['maxlength'] as { requiredLength: number }).requiredLength;
    return $localize`:Erreur de champ, trop long@@forms.error.maxlength:Au plus ${n}:n: caractères.`;
  }
  if (errors['futureDate']) {
    return $localize`:Erreur de champ, date future@@forms.error.futureDate:La date ne peut pas être dans le futur.`;
  }
  if (errors['date']) {
    return $localize`:Erreur de champ, date illisible@@forms.error.date:Date invalide.`;
  }
  if (errors['pattern']) {
    return $localize`:Erreur de champ, format@@forms.error.pattern:Format invalide.`;
  }
  return $localize`:Erreur de champ, règle inconnue@@forms.error.invalid:Valeur invalide.`;
}
