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
 * le rail, le rail n'a pas pu être lu, ou la matrice des liens n'admet aucun type entre les deux
 * entrées. Tous bloquent Entrée : un lien demandé ne disparaît jamais en silence (B5 : « l'aperçu
 * supprime le risque d'erreur silencieuse »).
 */
export type TargetIssue =
  | { code: 'TARGET_NOT_FOUND'; query: string }
  | { code: 'RAIL_UNAVAILABLE'; query: string }
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

/**
 * État du rail pour la cible du `>` : ready (cibles et catalogue lus), pending (lecture en cours :
 * la cible n'est ni trouvée ni manquante), unavailable (lecture échouée, ou toujours absente au
 * moment d'enregistrer : la cible est introuvable, Entrée est bloquée).
 */
export type RailReadiness = 'ready' | 'pending' | 'unavailable';

export interface PreviewContext {
  emotions: readonly CaptureEmotion[];
  candidates: readonly LinkCandidate[];
  linkTypes: readonly LinkTypeOption[];
  /** Par défaut : ready. */
  rail?: RailReadiness;
}

/** Résultat du parseur + vocabulaire + rail → aperçu (pur). */
export function buildPreview(result: ParseResult, context: PreviewContext): CapturePreview {
  const byCode = (code: string): CaptureEmotion | undefined =>
    context.emotions.find((emotion) => emotion.code === code);
  const emotion = result.emotionCode ? (byCode(result.emotionCode) ?? null) : null;

  let target: CaptureTarget | null = null;
  let targetIssue: TargetIssue | null = null;
  const query = result.target?.query.trim() ?? '';
  const rail = context.rail ?? 'ready';
  if (query && rail === 'unavailable') {
    targetIssue = { code: 'RAIL_UNAVAILABLE', query };
  } else if (query && rail === 'ready') {
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

// Bloc de saisie structuré (UX-S1, décision du 12 novembre 2026 : propositions-2026-11/04b et 04c) --
//
// La grammaire reste l'accélérateur ; par-dessus, le praticien choisit à la souris le type (puces),
// les champs du type (émotion, intensité, moment, visibilité, molécule, posologie, fin d'une
// situation) et UN lien (puce de la rangée « Lié à », verbe, « Autre entrée… »). Ces choix sont le
// brouillon (`CaptureDraft`, tenu par le CaptureStore) ; la saisie reste dans le composant. Les
// fonctions ci-dessous sont pures : réconcilier le brouillon avec une nouvelle lecture du parseur
// (la puce suit la grammaire), puis composer l'entrée à enregistrer (la grammaire suit la puce).

/** Visibilité d'une entrée (CreateEntryRequest.visibility). */
export type CaptureVisibility = 'clinical' | 'private';

/** Champs du bloc que le praticien peut poser à la main, par-dessus ce que le parseur a lu. */
export interface CaptureFields {
  emotionCode: string | null;
  intensity: number | null;
  /** Moment choisi ; null : « maintenant » (le serveur prend l'instant de saisie). */
  when: ParsedOccurred | null;
  visibility: CaptureVisibility;
  /** Événement, situation : titre (la première ligne de la saisie, par défaut). */
  title: string;
  molecule: string;
  dosage: string;
  /** Situation : en cours (sans fin). */
  ongoing: boolean;
  /** Situation finie : jour de fin inclus, « AAAA-MM-JJ ». */
  until: string | null;
}

export type CaptureFieldName = keyof CaptureFields;

/** Ce que le store retient d'une lecture du parseur, pour savoir ce qui a changé à la frappe suivante. */
export interface ParsedSnapshot {
  type: CaptureEntryType;
  emotionCode: string | null;
  intensity: number | null;
  dateExpression: string | null;
  text: string;
  /** Cible du `>` trouvée dans le rail. */
  targetId: string | null;
}

/** Le brouillon du bloc : les choix faits à la main. Absent (undefined) : la grammaire décide. */
export interface CaptureDraft {
  /** Puce cliquée ; null : le type lu par le parseur. */
  type: CaptureEntryType | null;
  overrides: Partial<CaptureFields>;
  /** Lien posé d'un clic (rangée « Lié à », « Autre entrée… ») ; null : celui du `>` s'il existe. */
  pickedLink: RailLink | null;
  /** Cible du `>` retirée d'un second clic : elle ne part pas. */
  dismissedTarget: string | null;
  /** Cible venue de « Autre entrée… », hors des cinq du rail. */
  extraCandidate: LinkCandidate | null;
  parsed: ParsedSnapshot | null;
}

export const EMPTY_DRAFT: CaptureDraft = {
  type: null,
  overrides: {},
  pickedLink: null,
  dismissedTarget: null,
  extraCandidate: null,
  parsed: null,
};

/** La lecture du parseur réduite à ce qui gouverne les remises à zéro du brouillon. */
export function snapshotOf(preview: CapturePreview | null): ParsedSnapshot | null {
  if (!preview) return null;
  return {
    type: preview.type,
    emotionCode: preview.emotion?.code ?? null,
    intensity: preview.intensity,
    dateExpression: preview.dateExpression,
    text: preview.text,
    targetId: preview.target?.candidate.id ?? null,
  };
}

/**
 * La puce suit la grammaire : quand le parseur lit autre chose qu'à la frappe précédente, le choix
 * manuel qui portait sur la même information s'efface (un type tapé remplace la puce cliquée, une
 * émotion tapée remplace celle choisie dans la liste, un texte modifié reprend le titre et la
 * molécule qu'on en déduit, un nouveau `>` remplace la puce de lien). Ce qui n'a pas bougé garde le
 * choix du praticien. Une saisie vidée remet tout à zéro.
 */
export function reconcileDraft(draft: CaptureDraft, next: ParsedSnapshot | null): CaptureDraft {
  const previous = draft.parsed;
  if (!next) return EMPTY_DRAFT;
  if (!previous) return { ...draft, parsed: next };
  const overrides = { ...draft.overrides };
  let type = draft.type;
  let pickedLink = draft.pickedLink;
  let dismissedTarget = draft.dismissedTarget;
  if (next.type !== previous.type) type = null;
  if (next.emotionCode !== previous.emotionCode) delete overrides.emotionCode;
  if (next.intensity !== previous.intensity) delete overrides.intensity;
  if (next.dateExpression !== previous.dateExpression) delete overrides.when;
  if (next.text !== previous.text) {
    delete overrides.title;
    delete overrides.molecule;
    delete overrides.dosage;
  }
  if (next.targetId && next.targetId !== previous.targetId) {
    pickedLink = null;
    dismissedTarget = null;
  }
  return { ...draft, type, overrides, pickedLink, dismissedTarget, parsed: next };
}

/** Le lien effectif : celui posé à la main, sinon celui du `>` tant qu'il n'a pas été retiré. */
export function effectiveLink(draft: CaptureDraft, fromTarget: RailLink | null): RailLink | null {
  if (draft.pickedLink) return draft.pickedLink;
  if (fromTarget && draft.dismissedTarget !== fromTarget.targetId) return fromTarget;
  return null;
}

/** Le lien composé : sa cible, son nom, le verbe retenu et les verbes admis pour la paire. */
export interface ComposedLink {
  link: RailLink;
  candidate: LinkCandidate;
  name: string;
  choice: LinkChoice;
  choices: LinkChoice[];
  /** Posé par la grammaire (`> début de nom`) ou d'un clic. */
  from: 'target' | 'picked';
}

/** Où un avertissement du parseur ou une erreur 422 s'affiche dans le bloc. */
export type CaptureSlot =
  | 'text'
  | 'emotion'
  | 'intensity'
  | 'when'
  | 'until'
  | 'title'
  | 'molecule'
  | 'dosage'
  | 'visibility'
  | 'link'
  | 'general';

export interface SlottedWarning {
  slot: CaptureSlot;
  warning: ParseWarning;
}

/** L'entrée telle que le bloc la montre et l'enregistrera. */
export interface ComposedEntry {
  type: CaptureEntryType;
  emotion: CaptureEmotion | null;
  intensity: number | null;
  /** Texte libre : corps d'une note ou d'un ressenti (et les lignes suivantes pour les autres types). */
  body: string;
  title: string;
  molecule: string;
  dosage: string;
  when: ParsedOccurred | null;
  visibility: CaptureVisibility;
  ongoing: boolean;
  until: string | null;
  link: ComposedLink | null;
  /** Champs obligatoires encore vides (le serveur reste juge, le client vérifie la forme). */
  missing: CaptureSlot[];
  warnings: SlottedWarning[];
  targetIssue: TargetIssue | null;
  /** Rien ne peut partir : champ obligatoire vide, avertissement bloquant ou cible introuvable. */
  blocking: boolean;
  prefill: EntryPrefill;
}

export interface ComposeContext {
  emotions: readonly CaptureEmotion[];
  /** Les cinq cibles du rail. */
  candidates: readonly LinkCandidate[];
  linkTypes: readonly LinkTypeOption[];
  defaultVisibility: CaptureVisibility;
  /** Lignes de la saisie après la première (la grammaire ne lit que la première). */
  rest: string;
}

/** Le préfixe `/xxx` ou le couple « émotion intensité » qui a décidé le type, tel que saisi. */
export function detectedGrammar(firstLine: string, type: CaptureEntryType): string | null {
  const input = firstLine.trim();
  const prefix = /^\/\S+/.exec(input);
  if (prefix) return type !== 'note' ? prefix[0] : null;
  if (type === 'feeling') {
    const pair = /^(.+?\s\d{1,3}(?:\/10)?)(?=\s|$)/.exec(input);
    return pair ? pair[1] : null;
  }
  return null;
}

function slotOf(warning: ParseWarning): CaptureSlot {
  switch (warning.code) {
    case 'AMBIGUOUS_EMOTION':
    case 'UNKNOWN_EMOTION':
    case 'POSSIBLE_FEELING':
      return 'emotion';
    case 'INTENSITY_OUT_OF_RANGE':
      return 'intensity';
    case 'EMPTY_TARGET':
      return 'link';
    case 'AMBIGUOUS_DATE':
    case 'INVALID_DATE':
    case 'FUTURE_DATE':
    case 'INVALID_TIME_ZONE':
      return 'when';
    default:
      return 'text';
  }
}

/**
 * La grammaire suit la puce : le résultat du parseur, le brouillon et le vocabulaire → l'entrée
 * composée. Le type choisi l'emporte ; le texte lu va là où le type l'attend (corps, titre,
 * molécule + posologie) ; chaque champ posé à la main remplace la lecture ; un ressenti sans
 * intensité tapée prend l'émotion que le parseur avait reconnue sans intensité (POSSIBLE_FEELING à
 * une seule candidate). Les avertissements qu'un choix manuel a résolus disparaissent (une émotion
 * choisie dans la liste règle « émotion inconnue »). Le lien : celui du `>`, ou celui cliqué, avec le
 * verbe de la matrice (le premier admis, ou celui choisi).
 */
export function composeEntry(
  preview: CapturePreview,
  draft: CaptureDraft,
  context: ComposeContext,
): ComposedEntry {
  const type = draft.type ?? preview.type;
  const o = draft.overrides;
  const byCode = (code: string | null | undefined): CaptureEmotion | null =>
    code ? (context.emotions.find((emotion) => emotion.code === code) ?? null) : null;

  // Texte lu, puis la forme que le type lui donne.
  let text = preview.text.trim();
  let emotion: CaptureEmotion | null = null;
  let intensity: number | null = null;
  const warnings: SlottedWarning[] = [];
  if (type === 'feeling') {
    emotion = o.emotionCode !== undefined ? byCode(o.emotionCode) : preview.emotion;
    intensity = o.intensity !== undefined ? o.intensity : preview.intensity;
    // Puce Ressenti cliquée sur « colère ruminations » : l'émotion du mot de tête, sans intensité.
    if (o.emotionCode === undefined && !preview.emotion && preview.type !== 'feeling') {
      const possible = preview.warnings.find((item) => item.code === 'POSSIBLE_FEELING');
      if (possible?.code === 'POSSIBLE_FEELING' && possible.params.candidates.length === 1) {
        emotion = byCode(possible.params.candidates[0]);
        const word = fold(possible.params.word);
        const words = text.split(/\s+/);
        if (emotion && words.length > 0 && fold(words[0]) === word) {
          text = words.slice(1).join(' ');
        }
      }
    }
  }
  const rest = context.rest.trim();
  const lines = (first: string): string => [first, rest].filter((line) => !!line).join('\n');

  let body = '';
  let title = '';
  let molecule = '';
  let dosage = '';
  switch (type) {
    case 'note':
    case 'feeling':
      body = lines(text);
      break;
    case 'event':
    case 'situation':
      title = o.title !== undefined ? o.title : text;
      body = rest;
      break;
    case 'medication': {
      const [first = '', ...others] = text.split(/\s+/).filter((word) => !!word);
      molecule = o.molecule !== undefined ? o.molecule : first;
      dosage = o.dosage !== undefined ? o.dosage : others.join(' ');
      body = rest;
      break;
    }
  }

  const when = o.when !== undefined ? o.when : preview.dateExpression ? preview.occurred : null;
  const visibility = o.visibility ?? context.defaultVisibility;
  const ongoing = o.ongoing ?? true;
  const until = ongoing ? null : (o.until ?? null);

  // Avertissements du parseur, placés sous leur champ ; ceux qu'un choix manuel a réglés tombent.
  for (const warning of preview.warnings) {
    const slot = slotOf(warning);
    if (slot === 'emotion' && (type !== 'feeling' || o.emotionCode !== undefined)) continue;
    if (warning.code === 'POSSIBLE_FEELING' && emotion) continue;
    if (slot === 'intensity' && (type !== 'feeling' || o.intensity !== undefined)) continue;
    if (slot === 'when' && o.when !== undefined) continue;
    if (warning.code === 'EMPTY_TEXT') continue; // dit par `missing`, selon le type retenu
    if (warning.code === 'UNKNOWN_PREFIX' && draft.type !== null) continue;
    warnings.push({ slot, warning });
  }

  const missing: CaptureSlot[] = [];
  if (type === 'note' && !body.trim()) missing.push('text');
  if ((type === 'event' || type === 'situation') && !title.trim()) missing.push('title');
  if (type === 'feeling' && !emotion) missing.push('emotion');
  if (type === 'medication' && !molecule.trim()) missing.push('molecule');
  if (type === 'situation' && !ongoing && !until) missing.push('until');

  // Le lien : celui du `>` ou celui cliqué ; la cible doit être visible (rail ou « Autre entrée… »).
  const fromTarget = targetLink(preview);
  const link = effectiveLink(draft, fromTarget);
  let composedLink: ComposedLink | null = null;
  // Un lien posé d'un clic vers une autre cible remplace celui du `>` (un seul lien) : le problème
  // que le `>` soulevait (introuvable, incompatible) ne bloque plus.
  const replaced =
    !!draft.pickedLink && draft.pickedLink.targetId !== (preview.target?.candidate.id ?? null);
  let targetIssue = replaced ? null : preview.targetIssue;
  if (link) {
    const pool = draft.extraCandidate
      ? [...context.candidates, draft.extraCandidate]
      : context.candidates;
    const candidate = pool.find((item) => item.id === link.targetId) ?? null;
    const choices = candidate ? linkChoices(context.linkTypes, type, candidate.type) : [];
    const choice =
      choices.find(
        (item) => item.linkType === link.linkType && item.direction === link.direction,
      ) ??
      choices[0] ??
      null;
    if (candidate && choice) {
      composedLink = {
        link: { targetId: candidate.id, linkType: choice.linkType, direction: choice.direction },
        candidate,
        name: candidateName(candidate, context.emotions),
        choice,
        choices,
        from: draft.pickedLink ? 'picked' : 'target',
      };
    } else if (candidate) {
      // Type choisi à la main pour lequel la matrice n'admet rien : dit, jamais tu.
      targetIssue = {
        code: 'TARGET_NOT_ALLOWED',
        name: candidateName(candidate, context.emotions),
        targetType: candidate.type,
      };
    }
  } else if (targetIssue?.code === 'TARGET_NOT_ALLOWED' && draft.type !== null) {
    // La cible du `>` était incompatible avec le type lu ; le type choisi peut l'admettre.
    const found = preview.target?.candidate ?? null;
    const choices = found ? linkChoices(context.linkTypes, type, found.type) : [];
    if (found && choices.length > 0 && draft.dismissedTarget !== found.id) {
      targetIssue = null;
      composedLink = {
        link: {
          targetId: found.id,
          linkType: choices[0].linkType,
          direction: choices[0].direction,
        },
        candidate: found,
        name: candidateName(found, context.emotions),
        choice: choices[0],
        choices,
        from: 'target',
      };
    }
  }
  if (draft.dismissedTarget && preview.target?.candidate.id === draft.dismissedTarget) {
    // Cible du `>` retirée d'un clic : plus de lien demandé par elle, donc plus de problème à son sujet.
    if (targetIssue?.code === 'TARGET_NOT_ALLOWED') targetIssue = null;
  }

  const prefill: EntryPrefill = {
    type,
    occurred: when ? { ...when } : null,
    links: composedLink ? [composedLink.link] : [],
  };
  switch (type) {
    case 'note':
      prefill.body = body;
      break;
    case 'event':
      prefill.title = title;
      if (body) prefill.body = body;
      break;
    case 'situation':
      prefill.title = title;
      if (body) prefill.body = body;
      prefill.occurred = situationOccurred(when, ongoing, until);
      break;
    case 'feeling':
      prefill.feeling = { emotionCode: emotion?.code ?? null, intensity };
      prefill.body = body;
      break;
    case 'medication':
      prefill.medication = { molecule, dosage };
      if (body) prefill.body = body;
      break;
  }

  const blocking =
    missing.length > 0 || !!targetIssue || warnings.some((item) => item.warning.blocking);

  return {
    type,
    emotion,
    intensity,
    body,
    title,
    molecule,
    dosage,
    when,
    visibility,
    ongoing,
    until,
    link: composedLink,
    missing,
    warnings,
    targetIssue,
    blocking,
    prefill,
  };
}

/**
 * Le moment d'une situation : début lu ou choisi (sinon « maintenant », que l'éditeur traduit en
 * instant présent), et une fin incluse « AAAA-MM-JJ » devenue borne exclusive (le jour suivant,
 * minuit UTC), comme l'éditeur d'entrée. En cours : pas de fin.
 */
export function situationOccurred(
  when: ParsedOccurred | null,
  ongoing: boolean,
  until: string | null,
  now: Date = new Date(),
): EntryPrefill['occurred'] {
  if (ongoing || !until) return when ? { ...when } : null;
  const end = dayAfter(until);
  if (!end) return when ? { ...when } : null;
  if (!when) return { from: now.toISOString(), precision: 'exact', to: end };
  if (when.precision === 'period') return { ...when };
  return { from: when.from, precision: when.precision, to: end };
}

/** « AAAA-MM-JJ » (inclus) → le jour suivant à minuit UTC ; null si illisible. */
export function dayAfter(day: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().replace('.000Z', 'Z');
}

/** Le jour civil d'aujourd'hui (ou d'il y a `daysAgo` jours) dans le fuseau donné, « AAAA-MM-JJ ». */
export function civilDay(now: Date, timeZone: string, daysAgo = 0): string {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
  } catch {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
  }
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');
  // Recul en jours civils (calendrier UTC sur la date civile) : un jour de 23 h ne décale rien.
  const day = new Date(Date.UTC(get('year'), get('month') - 1, get('day') - daysAgo));
  return day.toISOString().slice(0, 10);
}

/** Un jour « AAAA-MM-JJ » → moment du contrat à la précision jour (bornes en jours entiers UTC). */
export function dayOccurred(day: string): ParsedOccurred | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return { from: `${day}T00:00:00Z`, precision: 'day' };
}

/** Un mois « AAAA-MM » → précision mois. */
export function monthOccurred(month: string): ParsedOccurred | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  return { from: `${month}-01T00:00:00Z`, precision: 'month' };
}

/** Une année « AAAA » → précision année. */
export function yearOccurred(year: string): ParsedOccurred | null {
  if (!/^\d{4}$/.test(year)) return null;
  return { from: `${year}-01-01T00:00:00Z`, precision: 'year' };
}

/** Champ d'une erreur 422 (`errors[].field`) → emplacement dans le bloc. */
export function slotOfField(field: string): CaptureSlot {
  if (field === 'feeling.emotionCode') return 'emotion';
  if (field === 'feeling.intensity') return 'intensity';
  if (field.startsWith('occurred.to')) return 'until';
  if (field.startsWith('occurred')) return 'when';
  if (field.startsWith('links')) return 'link';
  if (field === 'title') return 'title';
  if (field === 'body') return 'text';
  if (field === 'medication.molecule') return 'molecule';
  if (field === 'medication.dosage') return 'dosage';
  if (field === 'visibility') return 'visibility';
  return 'general';
}
