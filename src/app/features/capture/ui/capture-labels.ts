// Textes du bloc de saisie (M6-02, UX-S1) : avertissements du parseur (M6-01 donne des codes et des
// paramètres, jamais de texte), problèmes de cible, précisions, problèmes d'enregistrement.

import { ApiProblem, FieldProblem } from '../../../core/http';
import { EntryType, entryTypeLabel } from '../../../shared/ui';
import { OccurredPrecision } from '../../../shared/util';
import {
  CaptureEmotion,
  CapturePreview,
  CaptureSlot,
  ComposedEntry,
  slotOfField,
  TargetIssue,
} from '../data/capture.model';
import { CaptureEntryType, ParseWarning } from '../parser/parse.types';

/** Une liste lisible (« a, b et c ») dans la langue de l'interface. */
function list(items: readonly string[], locale: string): string {
  return new Intl.ListFormat(locale, { type: 'conjunction' }).format(items);
}

/** Texte d'un avertissement du parseur (un message d'aide par code, PARSE_HINTS). */
export function warningText(
  warning: ParseWarning,
  type: CaptureEntryType,
  emotions: readonly CaptureEmotion[],
  locale: string,
): string {
  switch (warning.code) {
    case 'UNKNOWN_PREFIX': {
      const prefix = warning.params.prefix;
      const known = list(warning.params.known, locale);
      return $localize`:Avertissement de la barre de commande@@capture.warning.unknownPrefix:Préfixe « ${prefix}:prefix: » inconnu, la saisie reste une note : utilisez ${known}:known:.`;
    }
    case 'AMBIGUOUS_EMOTION': {
      const word = warning.params.word;
      return $localize`:Avertissement de la barre de commande@@capture.warning.ambiguousEmotion:« ${word}:word: » désigne plusieurs émotions : choisissez-en une.`;
    }
    case 'UNKNOWN_EMOTION': {
      const word = warning.params.word;
      return $localize`:Avertissement de la barre de commande@@capture.warning.unknownEmotion:Aucune émotion ne s'appelle « ${word}:word: ».`;
    }
    case 'POSSIBLE_FEELING': {
      const word = warning.params.word;
      const labels = warning.params.candidates.map(
        (code) => emotions.find((emotion) => emotion.code === code)?.label ?? code,
      );
      const names = list(labels, locale);
      return $localize`:Avertissement de la barre de commande@@capture.warning.possibleFeeling:Un ressenti (${names}:names:) ? Ajoutez une intensité de 0 à 10 après « ${word}:word: ».`;
    }
    case 'INTENSITY_OUT_OF_RANGE': {
      const { value, min, max } = warning.params;
      return $localize`:Avertissement de la barre de commande@@capture.warning.intensityRange:Intensité ${value}:value: hors de l'échelle : tapez un nombre de ${min}:min: à ${max}:max:.`;
    }
    case 'EMPTY_TARGET':
      return $localize`:Avertissement de la barre de commande@@capture.warning.emptyTarget:Rien après « > » : tapez le début du titre de l'entrée à lier.`;
    case 'UNCLOSED_QUOTE': {
      const quote = warning.params.quote;
      return $localize`:Avertissement de la barre de commande@@capture.warning.unclosedQuote:Guillemet ${quote}:quote: non fermé : fermez-le.`;
    }
    case 'AMBIGUOUS_DATE': {
      const used = warning.params.used;
      const ignored = list(warning.params.ignored, locale);
      return $localize`:Avertissement de la barre de commande@@capture.warning.ambiguousDate:Plusieurs dates : « ${used}:used: » est retenue, ${ignored}:ignored: reste dans le texte.`;
    }
    case 'INVALID_DATE': {
      const expression = warning.params.expression;
      return $localize`:Avertissement de la barre de commande@@capture.warning.invalidDate:« ${expression}:expression: » n'est pas une date possible : elle reste dans le texte.`;
    }
    case 'FUTURE_DATE': {
      const expression = warning.params.expression;
      return $localize`:Avertissement de la barre de commande@@capture.warning.futureDate:« ${expression}:expression: » est dans le futur : vérifiez la date.`;
    }
    case 'EMPTY_TEXT':
      return emptyTextHint(type);
    case 'INVALID_TIME_ZONE': {
      const zone = warning.params.timeZone;
      return $localize`:Avertissement de la barre de commande@@capture.warning.timeZone:Fuseau « ${zone}:zone: » inconnu : les dates sont lues en UTC.`;
    }
  }
}

function emptyTextHint(type: CaptureEntryType): string {
  switch (type) {
    case 'event':
    case 'situation':
      return $localize`:Avertissement de la barre de commande@@capture.warning.emptyTitle:Ajoutez un titre après le préfixe.`;
    case 'medication':
      return $localize`:Avertissement de la barre de commande@@capture.warning.emptyMolecule:Ajoutez la molécule après /med.`;
    default:
      return $localize`:Avertissement de la barre de commande@@capture.warning.emptyNote:Ajoutez le texte de la note.`;
  }
}

/** La cible du `>` introuvable ou incompatible (bloquant). */
export function targetIssueText(issue: TargetIssue, entryType: EntryType): string {
  if (issue.code === 'RAIL_UNAVAILABLE') {
    return $localize`:Problème de cible dans la barre de commande@@capture.target.railUnavailable:Les entrées à lier n'ont pas pu être chargées : réessayez, ou retirez « > ».`;
  }
  if (issue.code === 'TARGET_NOT_FOUND') {
    const query = issue.query;
    return $localize`:Problème de cible dans la barre de commande@@capture.target.notFound:Aucune entrée récente ne commence par « ${query}:query: » : choisissez la cible dans « Lié à… » ou retirez « > ».`;
  }
  const name = issue.name;
  const target = entryTypeLabel(issue.targetType).toLocaleLowerCase();
  const type = entryTypeLabel(entryType).toLocaleLowerCase();
  return $localize`:Problème de cible dans la barre de commande@@capture.target.notAllowed:Aucun type de lien ne relie « ${name}:name: » (${target}:target:) à cette entrée (${type}:type:) : choisissez une autre cible ou retirez « > ».`;
}

export function precisionLabel(precision: OccurredPrecision): string {
  switch (precision) {
    case 'exact':
      return $localize`:Précision d'une date dans l'aperçu@@capture.precision.exact:précision exacte`;
    case 'day':
      return $localize`:Précision d'une date dans l'aperçu@@capture.precision.day:au jour`;
    case 'month':
      return $localize`:Précision d'une date dans l'aperçu@@capture.precision.month:au mois`;
    case 'year':
      return $localize`:Précision d'une date dans l'aperçu@@capture.precision.year:à l'année`;
    case 'period':
      return $localize`:Précision d'une date dans l'aperçu@@capture.precision.period:période`;
    case 'life_phase':
      return $localize`:Précision d'une date dans l'aperçu@@capture.precision.lifePhase:phase de vie`;
  }
}

/** Problème d'un enregistrement depuis la barre (la saisie reste dans le champ). */
export function saveProblemText(problem: ApiProblem): string {
  if (problem.code === 'SESSION_REQUIRED') {
    return $localize`:Erreur de la barre de commande@@capture.error.sessionRequired:Toute entrée appartient à une séance : démarrez la séance, ou ouvrez l'éditeur (Ctrl+Entrée) pour en choisir une.`;
  }
  if (problem.status === 0 || problem.status >= 500) {
    return $localize`:Erreur de la barre de commande@@capture.error.network:Le serveur n'a pas répondu. Votre saisie est conservée : réessayez.`;
  }
  const reasons = [...new Set((problem.errors ?? []).map(fieldProblemText))].filter((r) => !!r);
  const details = reasons.join(' ');
  return details
    ? $localize`:Erreur de la barre de commande@@capture.error.details:L'entrée n'a pas été créée : ${details}:details: Complétez-la dans l'éditeur (Ctrl+Entrée).`
    : $localize`:Erreur de la barre de commande@@capture.error.generic:L'entrée n'a pas été créée. Complétez-la dans l'éditeur (Ctrl+Entrée).`;
}

/** Une erreur de champ du POST (422) : texte par code connu, message du serveur en repli. */
function fieldProblemText(error: FieldProblem): string {
  switch (error.code) {
    case 'REQUIRED':
      return $localize`:Raison d'un refus de la barre de commande (422)@@capture.error.required:Un champ obligatoire manque.`;
    case 'OUT_OF_RANGE':
      return $localize`:Raison d'un refus de la barre de commande (422)@@capture.error.outOfRange:Une valeur est hors des bornes permises.`;
    case 'INVALID_TIME':
      return $localize`:Raison d'un refus de la barre de commande (422)@@capture.error.invalidTime:Le moment n'est pas valable.`;
    case 'UNKNOWN_EMOTION':
      return $localize`:Raison d'un refus de la barre de commande (422)@@capture.error.unknownEmotion:L'émotion n'existe pas ou plus.`;
    case 'UNKNOWN_TAG':
      return $localize`:Raison d'un refus de la barre de commande (422)@@capture.error.unknownTag:Un tag n'existe pas.`;
    case 'LINK_EXISTS':
      return $localize`:Raison d'un refus de la barre de commande (422)@@capture.error.linkExists:Ce lien existe déjà.`;
    case 'LINK_TYPE_NOT_ALLOWED':
      return $localize`:Raison d'un refus de la barre de commande (422)@@capture.error.linkTypeNotAllowed:Ce type de lien n'est pas permis entre ces deux types d'entrée.`;
    case 'UNKNOWN_LINK_TYPE':
      return $localize`:Raison d'un refus de la barre de commande (422)@@capture.error.unknownLinkType:Ce type de lien n'existe pas.`;
    case 'ENTRY_ARCHIVED':
      return $localize`:Raison d'un refus de la barre de commande (422)@@capture.error.entryArchived:L'entrée liée est archivée.`;
    case 'ENTRY_NOT_FOUND':
      return $localize`:Raison d'un refus de la barre de commande (422)@@capture.error.entryNotFound:L'entrée liée n'existe plus.`;
    case 'SELF_LINK':
      return $localize`:Raison d'un refus de la barre de commande (422)@@capture.error.selfLink:Une entrée ne peut pas être liée à elle-même.`;
    case 'DIFFERENT_PATIENT':
      return $localize`:Raison d'un refus de la barre de commande (422)@@capture.error.differentPatient:L'entrée liée appartient à un autre dossier.`;
    case 'SESSION_INVALID':
      return $localize`:Raison d'un refus de la barre de commande (422)@@capture.error.sessionInvalid:La séance n'appartient pas à ce dossier.`;
    default:
      return error.message;
  }
}

/** 409 EMOTION_LABEL_EXISTS et 422 de la création d'une émotion personnalisée. */
export function emotionProblemText(problem: ApiProblem): string {
  if (problem.code === 'EMOTION_LABEL_EXISTS') {
    return $localize`:Erreur de création d'émotion depuis la barre@@capture.emotion.exists:Une émotion porte déjà ce libellé : tapez son nom ou son début.`;
  }
  const error = problem.errors?.[0];
  if (error?.field === 'labelFr') {
    return $localize`:Erreur de création d'émotion depuis la barre@@capture.emotion.labelInvalid:Le libellé de l'émotion est obligatoire.`;
  }
  if (error?.field === 'family') {
    return $localize`:Erreur de création d'émotion depuis la barre@@capture.emotion.familyInvalid:Choisissez une famille parmi les huit proposées.`;
  }
  return (
    error?.message ||
    $localize`:Erreur de création d'émotion depuis la barre@@capture.emotion.error:L'émotion n'a pas pu être créée.`
  );
}

/** « texte » : guillemets de la langue de l'interface. */
export function quoted(text: string): string {
  return $localize`:Texte cité dans l'aperçu de la barre de commande@@capture.preview.quoted:« ${text}:text: »`;
}

/** 8/10 : intensité sur l'échelle du contrat. */
export function intensityText(value: number): string {
  return $localize`:Intensité dans l'aperçu de la barre de commande@@capture.preview.intensity:${value}:value:/10`;
}

/**
 * Résumé court de l'aperçu pour les lecteurs d'écran (région role="status") : type, émotion et
 * intensité, cible, nombre de points à corriger.
 */
export function previewSummary(preview: CapturePreview): string {
  const parts = [entryTypeLabel(preview.type)];
  if (preview.emotion) {
    const label = preview.emotion.label;
    parts.push(
      preview.intensity !== null
        ? $localize`:Résumé lu de l'aperçu, émotion et intensité@@capture.summary.emotion:${label}:emotion: ${preview.intensity}:intensity: sur 10`
        : label,
    );
  }
  if (preview.target) {
    const name = preview.target.name;
    parts.push(
      $localize`:Résumé lu de l'aperçu, cible du lien@@capture.summary.target:lié à « ${name}:name: »`,
    );
  }
  const blocking =
    preview.warnings.filter((warning) => warning.blocking).length + (preview.targetIssue ? 1 : 0);
  if (blocking > 0) {
    parts.push(
      $localize`:Résumé lu de l'aperçu, points bloquants@@capture.summary.blocking:${blocking}:count: point(s) à corriger avant d'enregistrer`,
    );
  }
  return parts.join(', ');
}

// Bloc de saisie structuré (UX-S1) ---------------------------------------------------------------

/** Étiquette d'un emplacement du bloc, pour nommer le champ dans un message. */
export function slotLabel(slot: CaptureSlot): string {
  switch (slot) {
    case 'text':
      return $localize`:Champ du bloc de saisie@@capture.slot.text:le texte`;
    case 'emotion':
      return $localize`:Champ du bloc de saisie@@capture.slot.emotion:l'émotion`;
    case 'intensity':
      return $localize`:Champ du bloc de saisie@@capture.slot.intensity:l'intensité`;
    case 'when':
      return $localize`:Champ du bloc de saisie@@capture.slot.when:le moment`;
    case 'until':
      return $localize`:Champ du bloc de saisie@@capture.slot.until:la fin de la situation`;
    case 'title':
      return $localize`:Champ du bloc de saisie@@capture.slot.title:le titre`;
    case 'molecule':
      return $localize`:Champ du bloc de saisie@@capture.slot.molecule:la molécule`;
    case 'dosage':
      return $localize`:Champ du bloc de saisie@@capture.slot.dosage:la posologie`;
    case 'visibility':
      return $localize`:Champ du bloc de saisie@@capture.slot.visibility:la visibilité`;
    case 'link':
      return $localize`:Champ du bloc de saisie@@capture.slot.link:le lien`;
    case 'general':
      return $localize`:Champ du bloc de saisie@@capture.slot.general:l'entrée`;
  }
}

/** Champ obligatoire vide (le type l'exige) : la phrase sous le champ, teinte warning. */
export function missingText(slot: CaptureSlot): string {
  switch (slot) {
    case 'emotion':
      return $localize`:Champ obligatoire du bloc de saisie@@capture.missing.emotion:Choisissez l'émotion du ressenti.`;
    case 'title':
      return $localize`:Champ obligatoire du bloc de saisie@@capture.missing.title:Donnez un titre (la première ligne du texte).`;
    case 'molecule':
      return $localize`:Champ obligatoire du bloc de saisie@@capture.missing.molecule:Indiquez la molécule.`;
    case 'until':
      return $localize`:Champ obligatoire du bloc de saisie@@capture.missing.until:Indiquez la date de fin, ou cochez « En cours ».`;
    default:
      return $localize`:Champ obligatoire du bloc de saisie@@capture.missing.text:Écrivez ce qui s'est passé.`;
  }
}

/**
 * Les erreurs de champ d'un 422, rangées par emplacement du bloc (errors[].field) ; les champs que le
 * bloc ne montre pas vont sous le bloc (« general »).
 */
export function fieldErrorsBySlot(problem: ApiProblem | null): Map<CaptureSlot, string> {
  const map = new Map<CaptureSlot, string>();
  if (!problem || problem.status !== 422) return map;
  for (const error of problem.errors ?? []) {
    const slot = slotOfField(error.field ?? '');
    const text = fieldProblemText(error);
    if (!text) continue;
    const previous = map.get(slot);
    map.set(slot, previous ? `${previous} ${text}` : text);
  }
  return map;
}

/** Problème d'enregistrement quand chaque erreur a déjà trouvé son champ : la phrase sous le bloc. */
export function savedNothingText(): string {
  return $localize`:Erreur du bloc de saisie, erreurs placées sous les champs@@capture.error.fields:L'entrée n'a pas été créée : corrigez les champs signalés.`;
}

/** « détecté depuis « anx 7 » » : le type vient de la grammaire. */
export function detectedFromText(grammar: string): string {
  return $localize`:Mention sous les puces de type du bloc de saisie@@capture.types.detected:détecté depuis « ${grammar}:grammar: »`;
}

/** « trouvé depuis « > réorg » » : le lien vient de la grammaire. */
export function foundFromText(query: string): string {
  return $localize`:Mention de la rangée Lié à du bloc de saisie@@capture.links.found:trouvé depuis « > ${query}:query: »`;
}

/**
 * Résumé court de l'entrée composée pour les lecteurs d'écran (région role="status") : type,
 * émotion et intensité, cible du lien avec son verbe, nombre de points à corriger.
 */
export function composedSummary(composed: ComposedEntry): string {
  const parts = [entryTypeLabel(composed.type)];
  if (composed.emotion) {
    const label = composed.emotion.label;
    parts.push(
      composed.intensity !== null
        ? $localize`:Résumé lu de l'aperçu, émotion et intensité@@capture.summary.emotion:${label}:emotion: ${composed.intensity}:intensity: sur 10`
        : label,
    );
  }
  if (composed.link) {
    const verb = composed.link.choice.label;
    const name = composed.link.name;
    parts.push(
      $localize`:Résumé lu du bloc, lien posé (verbe et cible)@@capture.summary.link:${verb}:verb: « ${name}:name: »`,
    );
  }
  // Les champs obligatoires vides ne comptent pas : une saisie en cours n'est pas « à corriger ».
  const blocking =
    composed.warnings.filter((item) => item.warning.blocking).length +
    (composed.targetIssue ? 1 : 0);
  if (blocking > 0) {
    parts.push(
      $localize`:Résumé lu de l'aperçu, points bloquants@@capture.summary.blocking:${blocking}:count: point(s) à corriger avant d'enregistrer`,
    );
  }
  return parts.join(', ');
}
