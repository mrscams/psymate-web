import { AbstractControl, FormGroup } from '@angular/forms';

import { ApiProblem, FieldProblem } from '../../core/http';

/** Clé d'erreur posée sur un contrôle par applyProblem ; sa valeur est le message de l'API. */
export const SERVER_ERROR = 'server';

export interface AppliedProblem {
  /** Erreurs reliées à un contrôle du formulaire, dans l'ordre du serveur. */
  applied: FieldProblem[];
  /** Erreurs dont le champ n'existe pas dans le formulaire (ou sans champ) : à montrer dans le résumé. */
  unmatched: FieldProblem[];
}

/**
 * Relie les errors[] d'un 422 (ou d'un 400 de paramètre) aux contrôles du formulaire (handbook §9,
 * planche 29) : chaque champ fautif reçoit l'erreur `server` avec le message de l'API, déjà dans la
 * langue d'Accept-Language (le client ne traduit rien), et passe en touched pour que le message
 * s'affiche ; les champs valides gardent leur saisie. Les erreurs déjà posées par le serveur sont
 * effacées d'abord. Un problème sans errors[] ne touche à rien.
 */
export function applyProblem(form: FormGroup, problem: ApiProblem | null): AppliedProblem {
  clearServerErrors(form);
  const result: AppliedProblem = { applied: [], unmatched: [] };
  for (const error of problem?.errors ?? []) {
    const control = error.field ? form.get(toControlPath(error.field)) : null;
    if (!control) {
      result.unmatched.push(error);
      continue;
    }
    control.setErrors({ ...(control.errors ?? {}), [SERVER_ERROR]: error.message });
    control.markAsTouched();
    result.applied.push(error);
  }
  return result;
}

/** Retire les erreurs `server` de tout le formulaire (à la prochaine soumission ou saisie). */
export function clearServerErrors(control: AbstractControl): void {
  if (control.errors && SERVER_ERROR in control.errors) {
    const rest = Object.fromEntries(
      Object.entries(control.errors).filter(([key]) => key !== SERVER_ERROR),
    );
    control.setErrors(Object.keys(rest).length > 0 ? rest : null);
  }
  const children = controlsOf(control);
  for (const child of children) clearServerErrors(child);
}

/** Champ du contrat → chemin de contrôle : `occurred.from` inchangé, `tags[2]` → `tags.2`. */
export function toControlPath(field: string): string {
  return field.replace(/\[(\d+)\]/g, '.$1');
}

/** Identifiant DOM d'un champ, pour les liens du résumé et aria-describedby : `field-occurred-from`. */
export function fieldId(field: string): string {
  return `field-${toControlPath(field).replace(/\./g, '-')}`;
}

/** Premier champ fautif dans l'ordre du formulaire (le résumé lui donne le focus). */
export function firstInvalidField(form: FormGroup, prefix = ''): string | null {
  for (const [name, control] of Object.entries(form.controls)) {
    const path = prefix ? `${prefix}.${name}` : name;
    if (control instanceof FormGroup) {
      const nested = firstInvalidField(control, path);
      if (nested) return nested;
    } else if (control.invalid) {
      return path;
    }
  }
  return null;
}

function controlsOf(control: AbstractControl): AbstractControl[] {
  const group = (control as Partial<FormGroup>).controls;
  if (!group) return [];
  return Array.isArray(group) ? group : Object.values(group);
}
