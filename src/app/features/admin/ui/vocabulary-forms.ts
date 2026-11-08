import { FormGroup } from '@angular/forms';

import { ApiProblem } from '../../../core/http';
import { applyProblem, SERVER_ERROR } from '../../../shared/forms';

/** Format d'un code (contrat) : minuscule en tête, puis minuscules, chiffres, soulignés ; 2 à 40. */
export const CODE_PATTERN = /^[a-z][a-z0-9_]{1,39}$/;
export const LABEL_MAX = 120;

/**
 * Pose un problème d'écriture du vocabulaire sur un formulaire : 409 VOCABULARY_EXISTS sous le champ
 * code (fiche 28), 422 champ par champ ; renvoie le message à afficher hors des champs, s'il y en a.
 */
export function applyVocabularyProblem(form: FormGroup, problem: ApiProblem): string | null {
  if (problem.code === 'VOCABULARY_EXISTS') {
    const code = form.get('code');
    if (code) {
      code.setErrors({
        ...(code.errors ?? {}),
        [SERVER_ERROR]: $localize`:Code déjà utilisé@@admin.vocabulary.exists:Ce code existe déjà pour ce type.`,
      });
      code.markAsTouched();
      return null;
    }
  }
  const { unmatched } = applyProblem(form, problem);
  if (problem.status === 422 && unmatched.length === 0) return null;
  if (problem.code === 'VOCABULARY_NOT_FOUND') {
    return $localize`:Entrée introuvable@@admin.vocabulary.notFound:Cette entrée n'existe plus. Rechargez la page.`;
  }
  return (
    unmatched[0]?.message ??
    problem.detail ??
    $localize`:Erreur d'écriture du vocabulaire@@admin.vocabulary.error:La modification n'a pas pu être enregistrée.`
  );
}
