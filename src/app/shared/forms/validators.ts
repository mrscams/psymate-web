import { AbstractControl, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';

/** Longueur minimale d'un mot de passe (contrat : 12 caractères au moins, handbook §9). */
export const PASSWORD_MIN_LENGTH = 12;

/**
 * Validateurs de forme communs (CLAUDE.md : « le serveur reste juge des règles métier ; le client
 * vérifie la forme »). Ils ne dupliquent aucune règle métier du backend.
 */
export const PmValidators = {
  /** Requis après suppression des blancs de bord. */
  trimmedRequired(control: AbstractControl): ValidationErrors | null {
    const value = control.value;
    return typeof value === 'string' && value.trim().length === 0 ? { required: true } : null;
  },

  /** Longueur maximale mesurée après suppression des blancs de bord. */
  maxLengthTrimmed(max: number): ValidatorFn {
    return (control) => {
      const value = control.value;
      if (typeof value !== 'string') return null;
      const actual = value.trim().length;
      return actual > max ? { maxlength: { requiredLength: max, actualLength: actual } } : null;
    };
  },

  /** Mot de passe : 12 caractères au moins ; les autres règles (casse, mots courants) sont au serveur. */
  password: Validators.minLength(PASSWORD_MIN_LENGTH),

  /** Date (AAAA-MM-JJ ou ISO) qui ne peut pas être dans le futur : naissance, début de suivi. */
  notFutureDate(now: () => Date = () => new Date()): ValidatorFn {
    return (control) => {
      const value = control.value;
      if (typeof value !== 'string' || value === '') return null;
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return { date: true };
      return date.getTime() > now().getTime() ? { futureDate: true } : null;
    };
  },

  /** Date (AAAA-MM-JJ ou ISO) lisible. */
  date(control: AbstractControl): ValidationErrors | null {
    const value = control.value;
    if (typeof value !== 'string' || value === '') return null;
    return Number.isNaN(new Date(value).getTime()) ? { date: true } : null;
  },
};
