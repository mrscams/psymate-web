import {
  AbstractControl,
  NonNullableFormBuilder,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';

import { ApiProblem, FieldProblem } from '../../../core/http';
import { PmValidators } from '../../../shared/forms';
import { NAME_MAX_LENGTH, PatientFormValue } from '../data/patient.model';

/** « À surveiller » coché exige une raison (fiche 16, contrat : flags[i].reason REQUIRED). */
/**
 * Longueur maximale vérifiée seulement si le champ a été modifié : un dossier ancien au nom plus
 * long reste modifiable tant que le nom ne change pas (G Q47 : pas de revalidation d'une valeur
 * inchangée).
 */
function maxLengthIfEdited(max: number): ValidatorFn {
  const check = PmValidators.maxLengthTrimmed(max);
  return (control) => (control.pristine ? null : check(control));
}

function watchReasonRequired(control: AbstractControl): ValidationErrors | null {
  const watch = control.parent?.get('watch')?.value === true;
  return watch && String(control.value ?? '').trim() === '' ? { required: true } : null;
}

/**
 * Formulaire réactif de la fiche 16 (shared/forms.applyProblem travaille sur un FormGroup) : les
 * règles de forme seulement (nom requis et ≤ 120, date passée, durée entière ; téléphone et e-mail
 * sont du texte libre au contrat) ; le serveur reste
 * juge (120 ans, pronom, tags).
 */
export function buildPatientForm(fb: NonNullableFormBuilder, initial: PatientFormValue) {
  const name = maxLengthIfEdited(NAME_MAX_LENGTH);
  return fb.group({
    displayName: [initial.displayName, [PmValidators.trimmedRequired, name]],
    firstName: [initial.firstName, [name]],
    lastName: [initial.lastName, [name]],
    birthDate: [initial.birthDate, [PmValidators.date, PmValidators.notFutureDate()]],
    pronoun: [initial.pronoun],
    phone: [initial.phone],
    email: [initial.email],
    context: fb.group({
      situation: [initial.context.situation],
      activity: [initial.context.activity],
      referredBy: [initial.context.referredBy],
      initialReason: [initial.context.initialReason],
      history: [initial.context.history],
    }),
    followUp: fb.group({
      since: [initial.followUp.since],
      rhythm: [initial.followUp.rhythm],
      modality: [initial.followUp.modality],
      durationMin: [initial.followUp.durationMin, [Validators.pattern(/^\d{1,3}$/)]],
      fee: [initial.followUp.fee],
      prescriber: [initial.followUp.prescriber],
    }),
    flags: fb.group({
      watch: [initial.flags.watch],
      watchReason: [initial.flags.watchReason, [watchReasonRequired]],
      risk: [initial.flags.risk],
      sharedCare: [initial.flags.sharedCare],
    }),
  });
}

export type PatientForm = ReturnType<typeof buildPatientForm>;

/**
 * Champs d'un 422 du contrat → chemins du formulaire : flags[i].reason et flag.reason vont sur la
 * raison de « à surveiller » (seul drapeau à raison obligatoire) ; context et followUp restent
 * sur leur groupe. Les autres (tags[i]) restent tels quels et finissent dans le résumé.
 */
export function toFormProblem(problem: ApiProblem): ApiProblem {
  const errors = (problem.errors ?? []).map((error): FieldProblem => ({
    ...error,
    field: /^flags?(\[\d+\])?\.reason$/.test(error.field) ? 'flags.watchReason' : error.field,
  }));
  return { ...problem, errors };
}
