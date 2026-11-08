// Textes de la barre de commande (M6-02) : avertissements du parseur (M6-01 donne des codes et des
// paramètres, jamais de texte), problèmes de cible, précisions, problèmes d'enregistrement.

import { ApiProblem } from '../../../core/http';
import { EntryType, entryTypeLabel } from '../../../shared/ui';
import { OccurredPrecision } from '../../../shared/util';
import { CaptureEmotion, TargetIssue } from '../data/capture.model';
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
  const details = (problem.errors ?? [])
    .map((error) => error.message)
    .filter((message) => !!message)
    .join(' ');
  return details
    ? $localize`:Erreur de la barre de commande@@capture.error.details:L'entrée n'a pas été créée : ${details}:details: Complétez-la dans l'éditeur (Ctrl+Entrée).`
    : $localize`:Erreur de la barre de commande@@capture.error.generic:L'entrée n'a pas été créée. Complétez-la dans l'éditeur (Ctrl+Entrée).`;
}

/** 409 EMOTION_LABEL_EXISTS et 422 de la création d'une émotion personnalisée. */
export function emotionProblemText(problem: ApiProblem): string {
  if (problem.code === 'EMOTION_LABEL_EXISTS') {
    return $localize`:Erreur de création d'émotion depuis la barre@@capture.emotion.exists:Une émotion porte déjà ce libellé : tapez son nom ou son début.`;
  }
  const message = problem.errors?.[0]?.message;
  return (
    message ??
    $localize`:Erreur de création d'émotion depuis la barre@@capture.emotion.error:L'émotion n'a pas pu être créée.`
  );
}
