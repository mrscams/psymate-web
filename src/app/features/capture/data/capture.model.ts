// Modèles de vue de la barre de commande (B5 alternative A, fiche 05 « barre de capture », M6-02) et
// fonctions pures qui transforment la saisie interprétée par le parseur (M6-01) en aperçu, puis en
// préremplissage de l'éditeur d'entrée ou en corps de POST (features/entries). Aucun DOM, aucun HTTP.

import { EntryType } from '../../../shared/ui';
import {
  candidateName,
  EmotionFamily,
  EntryPrefill,
  LinkCandidate,
  LinkChoice,
  linkChoices,
  RailLink,
} from '../../entries';
import { LinkTypeOption } from '../../graph';
import { CaptureEntryType, ParsedOccurred, ParseResult, ParseWarning } from '../parser/parse.types';

/**
 * Une émotion du vocabulaire (GET /api/vocabulary/emotions) : ce que le parseur compare (code,
 * labelFr, labelEn) et ce que l'aperçu et le rail affichent (label, famille pour la pastille).
 */
export interface CaptureEmotion {
  code: string;
  labelFr: string;
  /** Null pour une émotion personnalisée (saisie en français seulement). */
  labelEn: string | null;
  /** Libellé dans la langue de l'interface. */
  label: string;
  family: EmotionFamily | null;
  custom: boolean;
}

/** L'entrée créée par la barre (réponse du POST), rendue au dossier patient. */
export interface CapturedEntry {
  id: string;
  type: EntryType;
  status: 'draft' | 'final';
  sessionId: string | null;
}

/** La cible du `>` trouvée parmi les entrées du rail, et le type de lien proposé (matrice E5.3). */
export interface CaptureTarget {
  candidate: LinkCandidate;
  name: string;
  /** Premier type permis pour le couple (type de l'entrée, type de la cible) ; null : incompatible. */
  choice: LinkChoice | null;
}

/**
 * Problème vu par la barre, en plus des avertissements du parseur : la cible du `>` n'est pas dans
 * le rail, ou la matrice des liens n'admet aucun type entre les deux entrées. Tous deux bloquent
 * Entrée : un lien demandé ne disparaît jamais en silence (B5 : « l'aperçu supprime le risque
 * d'erreur silencieuse »).
 */
export type TargetIssue =
  | { code: 'TARGET_NOT_FOUND'; query: string }
  | { code: 'TARGET_NOT_ALLOWED'; name: string; targetType: EntryType };

/** L'aperçu interprété (B5) : ce que la barre enregistrera si l'on tape Entrée. */
export interface CapturePreview {
  type: CaptureEntryType;
  /** Émotion reconnue (ressenti). */
  emotion: CaptureEmotion | null;
  intensity: number | null;
  /** Texte restant : corps d'une note ou d'un ressenti, titre d'un événement ou d'une situation. */
  text: string;
  occurred: ParsedOccurred;
  /** Texte de la date saisie ; absent : « maintenant ». */
  dateExpression: string | null;
  target: CaptureTarget | null;
  targetIssue: TargetIssue | null;
  warnings: readonly ParseWarning[];
  /** Mot suivi d'une intensité qui n'est aucune émotion : création d'une émotion personnalisée. */
  unknownEmotion: string | null;
  /** Mot qui désigne plusieurs émotions, et ces émotions (à choisir). */
  ambiguous: { word: string; candidates: CaptureEmotion[] } | null;
  /** Entrée bloquée : un avertissement bloquant du parseur ou un problème de cible. */
  blocking: boolean;
}

/** Comparaison sans casse ni accents (titre de la cible, mot de l'émotion). */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * La cible du `>` (B5 : « l'entrée dont le titre commence par… ») parmi les cibles du rail, dans
 * leur ordre (situations en cours, puis entrées récentes) : d'abord un nom qui commence par la
 * saisie, sinon un mot du nom qui commence par elle. null si aucune ne correspond.
 */
export function findTarget(
  query: string,
  candidates: readonly LinkCandidate[],
  emotions: readonly CaptureEmotion[],
): { candidate: LinkCandidate; name: string } | null {
  const q = fold(query);
  if (!q) return null;
  const named = candidates.map((candidate) => ({
    candidate,
    name: candidateName(candidate, emotions),
  }));
  return (
    named.find((item) => fold(item.name).startsWith(q)) ??
    named.find((item) =>
      fold(item.name)
        .split(/[\s'’-]+/)
        .some((word) => word.startsWith(q)),
    ) ??
    null
  );
}

export interface PreviewContext {
  emotions: readonly CaptureEmotion[];
  candidates: readonly LinkCandidate[];
  linkTypes: readonly LinkTypeOption[];
}

/** Résultat du parseur + vocabulaire + rail → aperçu (pur). */
export function buildPreview(result: ParseResult, context: PreviewContext): CapturePreview {
  const byCode = (code: string): CaptureEmotion | undefined =>
    context.emotions.find((emotion) => emotion.code === code);
  const emotion = result.emotionCode ? (byCode(result.emotionCode) ?? null) : null;

  let target: CaptureTarget | null = null;
  let targetIssue: TargetIssue | null = null;
  const query = result.target?.query.trim() ?? '';
  if (query) {
    const found = findTarget(query, context.candidates, context.emotions);
    if (!found) {
      targetIssue = { code: 'TARGET_NOT_FOUND', query };
    } else {
      const choice = linkChoices(context.linkTypes, result.type, found.candidate.type)[0] ?? null;
      target = { ...found, choice };
      if (!choice) {
        targetIssue = {
          code: 'TARGET_NOT_ALLOWED',
          name: found.name,
          targetType: found.candidate.type,
        };
      }
    }
  }

  let unknownEmotion: string | null = null;
  let ambiguous: CapturePreview['ambiguous'] = null;
  for (const warning of result.warnings) {
    if (warning.code === 'UNKNOWN_EMOTION') unknownEmotion = warning.params.word;
    if (warning.code === 'AMBIGUOUS_EMOTION') {
      ambiguous = {
        word: warning.params.word,
        candidates: warning.params.candidates
          .map(byCode)
          .filter((item): item is CaptureEmotion => !!item),
      };
    }
  }

  return {
    type: result.type,
    emotion,
    intensity: result.intensity ?? null,
    text: result.text,
    occurred: result.occurred,
    dateExpression: result.dateExpression ?? null,
    target,
    targetIssue,
    warnings: result.warnings,
    unknownEmotion,
    ambiguous,
    blocking: !!targetIssue || result.warnings.some((warning) => warning.blocking),
  };
}

/** Le lien que le `>` propose, vu depuis la nouvelle entrée ; null sans cible compatible. */
export function targetLink(preview: CapturePreview | null): RailLink | null {
  const target = preview?.target;
  if (!target?.choice) return null;
  return {
    targetId: target.candidate.id,
    linkType: target.choice.linkType,
    direction: target.choice.direction,
  };
}

/**
 * Les liens envoyés : ceux cochés dans le rail, et celui du `>` en tête sauf si le rail l'a décoché
 * (`dismissed`) ou en a changé le type (le rail l'emporte alors).
 */
export function mergeLinks(
  fromTarget: RailLink | null,
  picked: readonly RailLink[],
  dismissed: string | null,
): RailLink[] {
  const links = [...picked];
  if (
    fromTarget &&
    dismissed !== fromTarget.targetId &&
    !links.some((link) => link.targetId === fromTarget.targetId)
  ) {
    links.unshift(fromTarget);
  }
  return links;
}

/**
 * L'aperçu → préremplissage de l'éditeur (Ctrl+Entrée) et source du corps du POST (Entrée,
 * Ctrl+S, via draftFromPrefill + toCreateBody de features/entries). Le texte va là où le contrat
 * l'attend : corps d'une note ou d'un ressenti, titre d'un événement ou d'une situation ; pour un
 * médicament, le premier mot est la molécule et le reste la posologie (« sertraline 50 mg matin »).
 * Sans date saisie, le moment reste « Maintenant » (le serveur prend l'instant de saisie).
 */
export function toPrefill(preview: CapturePreview, links: readonly RailLink[]): EntryPrefill {
  const text = preview.text.trim();
  const prefill: EntryPrefill = {
    type: preview.type,
    occurred: preview.dateExpression ? { ...preview.occurred } : null,
    links: links.map((link) => ({ ...link })),
  };
  switch (preview.type) {
    case 'note':
      prefill.body = text;
      break;
    case 'event':
    case 'situation':
      prefill.title = text;
      break;
    case 'feeling':
      prefill.feeling = {
        emotionCode: preview.emotion?.code ?? null,
        intensity: preview.intensity,
      };
      prefill.body = text;
      break;
    case 'medication': {
      const [molecule = '', ...dosage] = text.split(/\s+/).filter((word) => !!word);
      prefill.medication = { molecule, dosage: dosage.join(' ') };
      break;
    }
  }
  return prefill;
}

/**
 * Remplace, dans la saisie, le mot ambigu par le libellé de l'émotion choisie (« tri 5 … » →
 * « Tristesse profonde 5 … ») : le parseur reconnaît alors le libellé exact.
 */
export function replaceWord(input: string, word: string, label: string): string {
  const target = fold(word);
  const parts = input.split(/(\s+)/);
  const index = parts.findIndex((part) => fold(part) === target);
  if (index < 0) return input;
  parts[index] = label;
  return parts.join('');
}

/** Libellé proposé pour l'émotion à créer : le mot saisi, première lettre en capitale. */
export function emotionLabelOf(word: string): string {
  const text = word.trim();
  return text ? text.charAt(0).toLocaleUpperCase('fr') + text.slice(1) : '';
}
