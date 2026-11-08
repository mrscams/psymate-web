import { ApiProblem } from '../../../../core/http';
import { suggestedEmotion } from '../../data/tags.store';

/**
 * Messages des refus du serveur sur le vocabulaire (le client ne traduit pas `detail`).
 *
 * Tag (création, renommage, fusion). TAG_IS_EMOTION propose
 * l'émotion renvoyée par l'API (suggestedEmotion) : « utiliser l'émotion Anxiété ? ».
 */
export function tagProblemMessage(problem: ApiProblem): string {
  switch (problem.code) {
    case 'TAG_IS_EMOTION': {
      const emotion = suggestedEmotion(problem);
      return emotion
        ? $localize`:Erreur, le tag est une émotion (422), avec l'émotion proposée@@vocabulary.tags.isEmotion:Ce libellé est déjà une émotion : utiliser l'émotion ${emotion.labelFr}:emotion: ? Les émotions se notent en ressentis dans le dossier, pas en tags.`
        : $localize`:Erreur, le tag est une émotion (422)@@vocabulary.tags.isEmotionPlain:Ce libellé est déjà une émotion : notez-le en ressenti dans le dossier, pas en tag.`;
    }
    case 'TAG_EXISTS':
      return $localize`:Erreur, tag existant (409)@@vocabulary.tags.exists:Un de vos tags porte déjà ce libellé (sans compter la casse, les accents ni « # »).`;
    case 'TAG_NOT_FOUND':
      return $localize`:Erreur, tag introuvable (404)@@vocabulary.tags.notFound:Tag introuvable : il a peut-être été fusionné depuis un autre onglet. La liste a été rechargée.`;
    default:
      return genericProblemMessage(problem);
  }
}

/** Message d'un refus du serveur sur une ligne (le client ne traduit pas `detail`). */
export function emotionProblemMessage(problem: ApiProblem): string {
  switch (problem.code) {
    case 'EMOTION_LABEL_EXISTS':
      return $localize`:Erreur, libellé d'émotion déjà pris (409)@@vocabulary.add.exists:Ce libellé existe déjà dans le vocabulaire global ou dans vos émotions.`;
    case 'EMOTION_INACTIVE':
      return $localize`:Erreur, émotion déjà fusionnée (409)@@vocabulary.row.inactive:Cette émotion a déjà été fusionnée. La liste a été rechargée.`;
    case 'EMOTION_NOT_FOUND':
      return $localize`:Erreur, émotion introuvable (404)@@vocabulary.row.notFound:Émotion introuvable : elle a peut-être été fusionnée depuis un autre onglet.`;
    default:
      return genericProblemMessage(problem);
  }
}

/** 422 sans code propre : premier message du serveur ; sinon (réseau, 500) un message générique. */
function genericProblemMessage(problem: ApiProblem): string {
  if (problem.code === 'VALIDATION_FAILED' && problem.errors?.[0]?.message) {
    return problem.errors[0].message;
  }
  return problem.code === 'VALIDATION_FAILED'
    ? $localize`:Erreur, saisie refusée (422)@@vocabulary.row.invalid:Saisie refusée par le serveur.`
    : $localize`:Erreur, écriture échouée@@vocabulary.row.failed:L'opération a échoué. Vérifiez la connexion puis réessayez.`;
}

/** Refus d'une annulation de fusion (affiché dans le journal, jamais en toast). */
export function undoProblemMessage(problem: ApiProblem): string {
  switch (problem.code) {
    case 'MERGE_UNDO_EXPIRED':
      return $localize`:Erreur, délai d'annulation dépassé (409)@@vocabulary.journal.error.expired:Le délai de 30 jours est dépassé : cette fusion ne s'annule plus.`;
    case 'MERGE_ALREADY_UNDONE':
      return $localize`:Erreur, fusion déjà annulée (409)@@vocabulary.journal.error.undone:Cette fusion a déjà été annulée.`;
    case 'MERGE_NOT_FOUND':
      return $localize`:Erreur, fusion introuvable (404)@@vocabulary.journal.error.notFound:Fusion introuvable : elle a été retirée du journal.`;
    default:
      return genericProblemMessage(problem);
  }
}
