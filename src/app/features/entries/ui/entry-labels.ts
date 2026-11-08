// Libellés de features/entries (fiche 05) : précisions, familles d'émotion, modalités, messages
// d'erreur propres à l'éditeur. Le type d'entrée garde le libellé partagé (entryTypeLabel).

import { FieldProblem } from '../../../core/http';
import { OccurredPrecision } from '../../../shared/util';
import { EmotionFamily, RailLink, SessionModality } from '../data/entry.model';

export function precisionLabel(precision: OccurredPrecision): string {
  switch (precision) {
    case 'exact':
      return $localize`:Précision du moment d'une entrée@@entries.precision.exact:Exact`;
    case 'day':
      return $localize`:Précision du moment d'une entrée@@entries.precision.day:Jour`;
    case 'month':
      return $localize`:Précision du moment d'une entrée@@entries.precision.month:Mois`;
    case 'year':
      return $localize`:Précision du moment d'une entrée@@entries.precision.year:Année`;
    case 'period':
      return $localize`:Précision du moment d'une entrée@@entries.precision.period:Période`;
    case 'life_phase':
      return $localize`:Précision du moment d'une entrée@@entries.precision.lifePhase:Phase de vie`;
  }
}

export function familyLabel(family: EmotionFamily): string {
  switch (family) {
    case 'joy':
      return $localize`:Famille d'émotion (E5.2)@@entries.family.joy:Joie`;
    case 'trust':
      return $localize`:Famille d'émotion (E5.2)@@entries.family.trust:Confiance`;
    case 'fear':
      return $localize`:Famille d'émotion (E5.2)@@entries.family.fear:Peur`;
    case 'surprise':
      return $localize`:Famille d'émotion (E5.2)@@entries.family.surprise:Surprise`;
    case 'sadness':
      return $localize`:Famille d'émotion (E5.2)@@entries.family.sadness:Tristesse`;
    case 'disgust':
      return $localize`:Famille d'émotion (E5.2)@@entries.family.disgust:Dégoût`;
    case 'anger':
      return $localize`:Famille d'émotion (E5.2)@@entries.family.anger:Colère`;
    case 'anticipation':
      return $localize`:Famille d'émotion (E5.2)@@entries.family.anticipation:Anticipation`;
  }
}

export function modalityLabel(modality: SessionModality): string {
  switch (modality) {
    case 'in_person':
      return $localize`:Modalité de séance@@entries.modality.inPerson:Présentiel`;
    case 'video':
      return $localize`:Modalité de séance@@entries.modality.video:Visio`;
    case 'phone':
      return $localize`:Modalité de séance@@entries.modality.phone:Téléphone`;
    case 'email':
      return $localize`:Modalité de séance@@entries.modality.email:E-mail`;
  }
}

/** Champ de l'historique des versions. */
export function versionFieldLabel(field: 'title' | 'body'): string {
  return field === 'title'
    ? $localize`:Champ de l'historique d'une entrée@@entries.history.field.title:Titre`
    : $localize`:Champ de l'historique d'une entrée@@entries.history.field.body:Texte`;
}

/** Message d'un problème d'enregistrement sans champ (409, réseau, 5xx), ou null pour un 422 par champ. */
export function saveProblemText(code: string, status: number): string {
  switch (code) {
    case 'SESSION_ALREADY_OPEN':
      return $localize`:Erreur de l'éditeur d'entrée@@entries.error.sessionOpen:Une séance est déjà ouverte pour ce patient : clôturez-la avant d'en créer une autre.`;
    case 'ENTRY_ARCHIVED':
      return $localize`:Erreur de l'éditeur d'entrée@@entries.error.archived:Cette entrée est archivée : restaurez-la avant de la corriger.`;
    case 'ENTRY_NOT_FOUND':
      return $localize`:Erreur de l'éditeur d'entrée@@entries.error.notFound:Cette entrée n'existe plus.`;
    case 'PATIENT_FORBIDDEN':
      return $localize`:Erreur de l'éditeur d'entrée@@entries.error.forbidden:Cette entrée appartient au dossier d'un autre praticien.`;
    default:
      return status === 0 || status >= 500
        ? $localize`:Erreur de l'éditeur d'entrée@@entries.error.network:Le serveur n'a pas répondu. Votre saisie est conservée : réessayez.`
        : $localize`:Erreur de l'éditeur d'entrée@@entries.error.generic:L'entrée n'a pas pu être enregistrée.`;
  }
}

/** 409 EMOTION_LABEL_EXISTS et 422 de la création d'émotion en ligne. */
export function emotionProblemText(code: string, message?: string): string {
  if (code === 'EMOTION_LABEL_EXISTS') {
    return $localize`:Erreur de création d'émotion@@entries.emotion.exists:Une émotion porte déjà ce libellé : choisissez-la dans la liste.`;
  }
  return (
    message ??
    $localize`:Erreur de création d'émotion@@entries.emotion.error:L'émotion n'a pas pu être créée.`
  );
}

/**
 * Message sous le rail « Lié à… » quand le POST refuse un lien (422, errors[].field = links[i].…) :
 * la cible et la raison pour chaque lien refusé, puis le rappel que l'entrée n'a pas été créée (tout
 * ou rien) et que la saisie est gardée. `names` : nom des cibles du rail par identifiant.
 */
export function linkProblemText(
  errors: readonly FieldProblem[],
  links: readonly RailLink[],
  names: ReadonlyMap<string, string>,
): string {
  const reasons = errors.map((error) => {
    const index = Number(/^links\[(\d+)\]/.exec(error.field)?.[1] ?? NaN);
    const link = Number.isNaN(index) ? undefined : links[index];
    const name = link ? (names.get(link.targetId) ?? null) : null;
    const reason = linkReason(error);
    return name
      ? $localize`:Lien refusé vers une cible nommée@@entries.rail.refusedNamed:Lien vers « ${name}:name: » refusé : ${reason}:reason:`
      : $localize`:Lien refusé@@entries.rail.refused:Lien refusé : ${reason}:reason:`;
  });
  const after = $localize`:Après un lien refusé, rien n'est créé@@entries.rail.nothingCreated:L'entrée n'a pas été créée ; votre saisie est conservée.`;
  return [...reasons, after].join(' ');
}

function linkReason(error: FieldProblem): string {
  switch (error.code) {
    case 'LINK_TYPE_NOT_ALLOWED':
      return $localize`:Raison d'un lien refusé (422)@@entries.rail.reason.typeNotAllowed:ce type de lien n'est pas permis entre ces deux types d'entrée.`;
    case 'UNKNOWN_LINK_TYPE':
      return $localize`:Raison d'un lien refusé (422)@@entries.rail.reason.unknownType:ce type de lien n'existe pas.`;
    case 'LINK_EXISTS':
      return $localize`:Raison d'un lien refusé (422)@@entries.rail.reason.exists:ce lien existe déjà.`;
    case 'ENTRY_ARCHIVED':
      return $localize`:Raison d'un lien refusé (422)@@entries.rail.reason.archived:l'entrée liée est archivée.`;
    case 'ENTRY_NOT_FOUND':
      return $localize`:Raison d'un lien refusé (422)@@entries.rail.reason.notFound:l'entrée liée n'existe plus.`;
    case 'DIFFERENT_PATIENT':
      return $localize`:Raison d'un lien refusé (422)@@entries.rail.reason.otherPatient:l'entrée liée appartient à un autre dossier.`;
    default:
      return error.message;
  }
}
