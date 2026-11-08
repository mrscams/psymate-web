// Grammaire de la barre de commande (B5, alternative A ; tâche M6-01). Fonction pure : même saisie,
// mêmes options → même résultat, quels que soient l'heure et le fuseau de la machine.
//
// Ordre d'analyse :
// 1. Guillemets « … », "…", “…” : texte littéral, jamais interprété (ni préfixe, ni émotion, ni date,
//    ni `>`). Guillemet non fermé → UNCLOSED_QUOTE, la suite est littérale. Les guillemets restent
//    dans le texte (une citation du patient garde ses guillemets), sauf quand tout le texte est un
//    seul passage cité.
// 2. `>` : tout ce qui suit le dernier `>` hors guillemets est la cible du lien (target.query, sans
//    guillemets) ; `>` vide → EMPTY_TARGET. Les `>` précédents restent dans le texte, de même qu'un
//    `>` suivi d'un nombre seul (« tension > 14 » n'est pas un lien).
// 3. Préfixe de type en tête : /evt, /sit, /med, /note (et leurs formes longues, voir PREFIXES).
//    Préfixe inconnu → UNKNOWN_PREFIX, il est retiré et la saisie est lue comme sans préfixe.
// 4. Sans préfixe, un ressenti a la forme B5 « émotion intensité » (« anx 8 ») : le mot d'émotion
//    (emotion-match.ts) suivi aussitôt d'un nombre, sans unité derrière (« 3 semaines », « 50 mg »,
//    « 3 fois » ne sont jamais des intensités).
//    - émotion reconnue + nombre de 0 à 10 → ressenti ; nombre hors bornes → ressenti sans
//      intensité, INTENSITY_OUT_OF_RANGE ;
//    - préfixe ambigu + nombre de 0 à 10 → ressenti sans émotion, AMBIGUOUS_EMOTION ;
//    - mot inconnu (ni mot vide, ni nombre) + nombre de 0 à 10 → ressenti sans émotion,
//      UNKNOWN_EMOTION (la barre propose de créer l'émotion personnalisée) ;
//    - émotion reconnue ou ambiguë sans intensité valable → note, POSSIBLE_FEELING (informatif) ;
//    - sinon → note.
//    Intensité : bornes du contrat, 0 à 10 (EntryFeelingRequest.intensity), et non 1 à 10 comme le
//    disait la tâche : le contrat l'emporte, et l'éditeur d'entrée accepte déjà 0.
// 5. Date (relative-date.ts), n'importe où hors guillemets et hors cible ; la première reconnue est
//    retenue, les suivantes restent dans le texte (AMBIGUOUS_DATE). Sans date : `now`, précision
//    exact (la plus fine du contrat).
// 6. Texte : le reste, espaces normalisés.

import { civilDay, isValidTimeZone } from './calendar';
import { matchEmotion } from './emotion-match';
import { isQuantityUnit, isStopWord, LEXICONS } from './lexicon';
import { foldDateWord, foldWord, grammarLanguage, stripPunctuation } from './normalize';
import { INTENSITY_MAX, INTENSITY_MIN, parseWarning } from './parse.types';
import type {
  CaptureEntryType,
  ParsedOccurred,
  ParseOptions,
  ParseResult,
  ParseTarget,
  ParseWarning,
} from './parse.types';
import { matchDateAt } from './relative-date';
import type { DateContext, DateWord, ResolvedDate } from './relative-date';
import { render, tokenize } from './tokenize';
import type { Token } from './tokenize';

/** Préfixes reconnus, tels que l'aide les affiche. */
export const CAPTURE_PREFIXES: readonly {
  readonly prefix: string;
  readonly type: CaptureEntryType;
}[] = [
  { prefix: '/evt', type: 'event' },
  { prefix: '/sit', type: 'situation' },
  { prefix: '/med', type: 'medication' },
  { prefix: '/note', type: 'note' },
];

/** Formes acceptées après « / » (comparées sans casse ni accents). */
const PREFIXES = new Map<string, CaptureEntryType>([
  ['evt', 'event'],
  ['event', 'event'],
  ['evenement', 'event'],
  ['sit', 'situation'],
  ['situation', 'situation'],
  ['med', 'medication'],
  ['medicament', 'medication'],
  ['medication', 'medication'],
  ['note', 'note'],
]);

/** Types dont le contrat exige un texte (note : body ; event, situation : title ; medication : molecule). */
const TEXT_REQUIRED: ReadonlySet<CaptureEntryType> = new Set([
  'note',
  'event',
  'situation',
  'medication',
]);

const INTENSITY = /^(\d{1,3})(?:\/10)?$/;
const LETTER = /\p{L}/u;
/** Une cible faite seulement de chiffres (« > 14 », « > 14/9 ») est une comparaison, pas un lien. */
const NUMERIC_TARGET = /^[\d\s.,/%+-]+$/;

/** Longueur maximale d'un libellé d'émotion reconnu en tête (« tristesse profonde »). */
const EMOTION_WORDS = 4;

/** Nombre posé juste après le mot d'émotion, sans unité derrière lui. */
function readIntensity(tokens: readonly Token[], at: number): number | undefined {
  const token = tokens[at];
  if (!token || token.kind !== 'word') return undefined;
  const match = INTENSITY.exec(stripPunctuation(token.raw));
  if (!match) return undefined;
  const next = tokens[at + 1];
  if (next && next.kind === 'word' && isQuantityUnit(foldWord(next.raw))) return undefined;
  return Number(match[1]);
}

/** Mots consécutifs à partir de `start`, sous forme de comparaison (pour l'émotion en tête). */
function leadingWords(tokens: readonly Token[], start: number): string[] {
  const words: string[] = [];
  for (let i = start; i < tokens.length && words.length < EMOTION_WORDS; i++) {
    if (tokens[i].kind !== 'word') break;
    words.push(foldWord(tokens[i].raw));
  }
  return words;
}

/** Suites de mots non consommés, coupées par un passage cité, un `>` ou un jeton consommé. */
function wordRuns(
  tokens: readonly Token[],
  consumed: ReadonlySet<number>,
): (DateWord & { index: number })[][] {
  const runs: (DateWord & { index: number })[][] = [];
  let run: (DateWord & { index: number })[] = [];
  tokens.forEach((token, index) => {
    if (token.kind === 'word' && !consumed.has(index)) {
      run.push({ raw: token.raw, word: foldDateWord(token.raw), index });
      return;
    }
    if (run.length) runs.push(run);
    run = [];
  });
  if (run.length) runs.push(run);
  return runs;
}

interface FoundDate {
  readonly date: ResolvedDate;
  readonly expression: string;
  readonly indices: readonly number[];
}

function expressionOf(words: readonly DateWord[]): string {
  return words.map((word) => stripPunctuation(word.raw)).join(' ');
}

function findDates(
  tokens: readonly Token[],
  consumed: ReadonlySet<number>,
  context: DateContext,
  warnings: ParseWarning[],
): FoundDate[] {
  const found: FoundDate[] = [];
  for (const run of wordRuns(tokens, consumed)) {
    let start = 0;
    while (start < run.length) {
      const match = matchDateAt(run, start, context);
      if (!match) {
        start++;
        continue;
      }
      const words = run.slice(start, start + match.length);
      const expression = expressionOf(words);
      if (match.kind === 'invalid') warnings.push(parseWarning('INVALID_DATE', { expression }));
      else found.push({ date: match, expression, indices: words.map((word) => word.index) });
      start += match.length;
    }
  }
  return found;
}

interface Typed {
  readonly type: CaptureEntryType;
  readonly emotionCode?: string;
  readonly intensity?: number;
}

const NOTE: Typed = { type: 'note' };

/** Étape 4 : émotion et intensité en tête d'une saisie sans préfixe. */
function readFeeling(
  tokens: readonly Token[],
  start: number,
  options: ParseOptions,
  consumed: Set<number>,
  warnings: ParseWarning[],
): Typed {
  const words = leadingWords(tokens, start);
  if (!words.length) return NOTE;
  const match = matchEmotion(words, options.emotions);
  const length = match.kind === 'match' ? match.words : 1;
  const at = start + length;
  const value = readIntensity(tokens, at);
  const inRange = value !== undefined && value <= INTENSITY_MAX;
  const word = tokens
    .slice(start, at)
    .map((token) => stripPunctuation(token.raw))
    .join(' ');
  const take = (): void => {
    for (let i = start; i <= at; i++) consumed.add(i);
  };

  if (match.kind === 'none') {
    if (!inRange || !LETTER.test(word) || isStopWord(words[0])) return NOTE;
    take();
    warnings.push(parseWarning('UNKNOWN_EMOTION', { word }));
    return { type: 'feeling', intensity: value };
  }
  const candidates = match.kind === 'match' ? [match.code] : match.candidates;
  if (match.kind === 'ambiguous' ? !inRange : value === undefined) {
    warnings.push(parseWarning('POSSIBLE_FEELING', { word, candidates }));
    return NOTE;
  }
  take();
  if (match.kind === 'ambiguous') {
    warnings.push(parseWarning('AMBIGUOUS_EMOTION', { word, candidates }));
    return { type: 'feeling', intensity: value };
  }
  if (!inRange) {
    const range = { value: value as number, min: INTENSITY_MIN, max: INTENSITY_MAX };
    warnings.push(parseWarning('INTENSITY_OUT_OF_RANGE', range));
    return { type: 'feeling', emotionCode: match.code };
  }
  return { type: 'feeling', emotionCode: match.code, intensity: value };
}

/**
 * @throws RangeError si `options.now` n'est pas une date valide (erreur de programmation : l'horloge
 * est fournie par l'appelant).
 */
export function parse(input: string, options: ParseOptions): ParseResult {
  if (Number.isNaN(options.now.getTime())) {
    throw new RangeError('parse : options.now doit être une date valide.');
  }
  const warnings: ParseWarning[] = [];
  const { tokens: all, unclosed } = tokenize(input);
  if (unclosed) warnings.push(parseWarning('UNCLOSED_QUOTE', unclosed));

  // 2. Cible du lien : après le dernier `>` hors guillemets.
  let tokens = all;
  let target: ParseTarget | undefined;
  const gt = all.map((token) => token.kind).lastIndexOf('gt');
  if (gt >= 0) {
    const query = render(all.slice(gt + 1), () => true, true);
    if (!NUMERIC_TARGET.test(query)) {
      tokens = all.slice(0, gt);
      if (query) target = { query };
      else warnings.push(parseWarning('EMPTY_TARGET', {}));
    }
  }

  // 3. Préfixe de type.
  const consumed = new Set<number>();
  let start = 0;
  let prefixed: CaptureEntryType | undefined;
  const first = tokens[0];
  if (first && first.kind === 'word' && first.raw.startsWith('/')) {
    consumed.add(0);
    start = 1;
    prefixed = PREFIXES.get(foldWord(first.raw.slice(1)));
    if (!prefixed) {
      const known = CAPTURE_PREFIXES.map((entry) => entry.prefix);
      warnings.push(parseWarning('UNKNOWN_PREFIX', { prefix: stripPunctuation(first.raw), known }));
    }
  }

  // 4. Émotion et intensité.
  const typed: Typed = prefixed
    ? { type: prefixed }
    : readFeeling(tokens, start, options, consumed, warnings);

  // 5. Date, dans le jour civil du fuseau injecté (UTC s'il est inconnu).
  const zoneKnown = isValidTimeZone(options.timeZone);
  if (!zoneKnown) warnings.push(parseWarning('INVALID_TIME_ZONE', { timeZone: options.timeZone }));
  const context: DateContext = {
    now: options.now,
    today: civilDay(options.now, zoneKnown ? options.timeZone : 'UTC'),
    lexicon: LEXICONS[grammarLanguage(options.locale)],
  };
  const dates = findDates(tokens, consumed, context, warnings);
  let occurred: ParsedOccurred = { from: options.now.toISOString(), precision: 'exact' };
  let dateExpression: string | undefined;
  if (dates.length) {
    const [used, ...ignored] = dates;
    for (const index of used.indices) consumed.add(index);
    const { from, precision, to, label } = used.date;
    occurred = to !== undefined ? { from, precision, to, label } : { from, precision };
    dateExpression = used.expression;
    if (ignored.length) {
      const others = ignored.map((date) => date.expression);
      warnings.push(parseWarning('AMBIGUOUS_DATE', { used: used.expression, ignored: others }));
    }
    if (used.date.future) {
      warnings.push(parseWarning('FUTURE_DATE', { expression: used.expression }));
    }
  }

  // 6. Texte ; un passage cité qui forme tout le texte perd ses guillemets.
  const kept = tokens.filter((_, index) => !consumed.has(index));
  const text =
    kept.length === 1 && kept[0].kind === 'quote' && kept[0].closed
      ? kept[0].content.trim()
      : render(tokens, (index) => !consumed.has(index));
  if (!text && TEXT_REQUIRED.has(typed.type)) warnings.push(parseWarning('EMPTY_TEXT', {}));

  return {
    type: typed.type,
    ...(typed.emotionCode !== undefined ? { emotionCode: typed.emotionCode } : {}),
    ...(typed.intensity !== undefined ? { intensity: typed.intensity } : {}),
    text,
    occurred,
    ...(dateExpression !== undefined ? { dateExpression } : {}),
    ...(target ? { target } : {}),
    warnings,
  };
}
