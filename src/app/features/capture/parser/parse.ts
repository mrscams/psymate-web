// Grammaire de la barre de commande (B5, alternative A ; tâche M6-01). Fonction pure : même saisie,
// mêmes options → même résultat, quels que soient l'heure et le fuseau de la machine.
//
// Ordre d'analyse :
// 1. Guillemets « … », "…", “…” : texte littéral, jamais interprété (ni préfixe, ni émotion, ni date,
//    ni `>`). Guillemet non fermé → UNCLOSED_QUOTE, la suite est littérale. Les guillemets restent
//    dans le texte (une citation du patient garde ses guillemets).
// 2. `>` : tout ce qui suit le dernier `>` hors guillemets est la cible du lien (target.query, sans
//    guillemets) ; `>` vide → EMPTY_TARGET. Les `>` précédents restent dans le texte.
// 3. Préfixe de type en tête : /evt, /sit, /med, /note (et leurs formes longues, voir PREFIXES).
//    Préfixe inconnu → UNKNOWN_PREFIX, il est retiré et la saisie est lue comme sans préfixe.
// 4. Sans préfixe, l'émotion en tête (emotion-match.ts) fait un ressenti, suivi de son intensité
//    facultative (« 8 » ou « 8/10 ») ; préfixe d'émotion ambigu → ressenti sans émotion,
//    AMBIGUOUS_EMOTION ; mot inconnu suivi d'une intensité → ressenti sans émotion, UNKNOWN_EMOTION
//    (la barre propose de créer l'émotion personnalisée) ; sinon note.
//    Intensité : bornes du contrat, 0 à 10 (EntryFeelingRequest.intensity), et non 1 à 10 comme le
//    disait la tâche : le contrat l'emporte, et l'éditeur d'entrée accepte déjà 0. Hors bornes →
//    INTENSITY_OUT_OF_RANGE, le nombre est consommé mais pas retenu ; absente → MISSING_INTENSITY.
// 5. Date (relative-date.ts), n'importe où hors guillemets et hors cible ; la première reconnue est
//    retenue, les suivantes restent dans le texte (AMBIGUOUS_DATE). Sans date : `now`, précision
//    exact (la plus fine du contrat).
// 6. Texte : le reste, espaces normalisés.

import { civilDay } from './calendar';
import type { CivilDate } from './calendar';
import { matchEmotion } from './emotion-match';
import type { EmotionMatch } from './emotion-match';
import { LEXICONS } from './lexicon';
import { foldDateWord, foldWord, grammarLanguage, stripPunctuation } from './normalize';
import { INTENSITY_MAX, INTENSITY_MIN, PARSE_HINTS } from './parse.types';
import type {
  CaptureEntryType,
  ParsedOccurred,
  ParseOptions,
  ParseResult,
  ParseTarget,
  ParseWarning,
  ParseWarningCode,
  ParseWarningParams,
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

/** Longueur maximale d'un libellé d'émotion reconnu en tête (« tristesse profonde »). */
const EMOTION_WORDS = 4;

function warning<C extends ParseWarningCode>(code: C, params: ParseWarningParams[C]): ParseWarning {
  return { code, hint: PARSE_HINTS[code], params } as ParseWarning;
}

function today(options: ParseOptions, warnings: ParseWarning[]): CivilDate {
  const timeZone = options.timeZone ?? 'UTC';
  try {
    return civilDay(options.now, timeZone);
  } catch {
    warnings.push(warning('INVALID_TIME_ZONE', { timeZone }));
    return civilDay(options.now, 'UTC');
  }
}

function readIntensity(token: Token | undefined): number | undefined {
  if (!token || token.kind !== 'word') return undefined;
  const match = INTENSITY.exec(stripPunctuation(token.raw));
  return match ? Number(match[1]) : undefined;
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
      if (match.kind === 'invalid') warnings.push(warning('INVALID_DATE', { expression }));
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

/** Étape 4 : émotion et intensité en tête d'une saisie sans préfixe. */
function readFeeling(
  tokens: readonly Token[],
  start: number,
  options: ParseOptions,
  consumed: Set<number>,
  warnings: ParseWarning[],
): Typed {
  const words = leadingWords(tokens, start);
  const match: EmotionMatch = matchEmotion(words, options.emotions);
  let length = 1;
  let emotionCode: string | undefined;
  if (match.kind === 'match') {
    emotionCode = match.code;
    length = match.words;
  } else if (match.kind === 'ambiguous') {
    const word = stripPunctuation(tokens[start].raw);
    warnings.push(warning('AMBIGUOUS_EMOTION', { word, candidates: match.candidates }));
  } else {
    const word = words.length ? stripPunctuation(tokens[start].raw) : '';
    if (!LETTER.test(word) || readIntensity(tokens[start + 1]) === undefined)
      return { type: 'note' };
    warnings.push(warning('UNKNOWN_EMOTION', { word }));
  }
  for (let i = start; i < start + length; i++) consumed.add(i);

  const at = start + length;
  const value = readIntensity(tokens[at]);
  if (value === undefined) {
    warnings.push(warning('MISSING_INTENSITY', { min: INTENSITY_MIN, max: INTENSITY_MAX }));
    return { type: 'feeling', emotionCode };
  }
  consumed.add(at);
  if (value > INTENSITY_MAX) {
    warnings.push(
      warning('INTENSITY_OUT_OF_RANGE', { value, min: INTENSITY_MIN, max: INTENSITY_MAX }),
    );
    return { type: 'feeling', emotionCode };
  }
  return { type: 'feeling', emotionCode, intensity: value };
}

export function parse(input: string, options: ParseOptions): ParseResult {
  const warnings: ParseWarning[] = [];
  const { tokens: all, unclosed } = tokenize(input);
  if (unclosed) warnings.push(warning('UNCLOSED_QUOTE', unclosed));

  // 2. Cible du lien : après le dernier `>` hors guillemets.
  let tokens = all;
  let target: ParseTarget | undefined;
  const gt = all.map((token) => token.kind).lastIndexOf('gt');
  if (gt >= 0) {
    tokens = all.slice(0, gt);
    const query = render(all.slice(gt + 1), () => true, true);
    if (query) target = { query };
    else warnings.push(warning('EMPTY_TARGET', {}));
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
      warnings.push(warning('UNKNOWN_PREFIX', { prefix: stripPunctuation(first.raw), known }));
    }
  }

  // 4. Émotion et intensité.
  const typed: Typed = prefixed
    ? { type: prefixed }
    : readFeeling(tokens, start, options, consumed, warnings);

  // 5. Date.
  const context: DateContext = {
    now: options.now,
    today: today(options, warnings),
    lexicon: LEXICONS[grammarLanguage(options.locale)],
  };
  const dates = findDates(tokens, consumed, context, warnings);
  let occurred: ParsedOccurred = { from: options.now.toISOString(), precision: 'exact' };
  if (dates.length) {
    const [used, ...ignored] = dates;
    for (const index of used.indices) consumed.add(index);
    const { from, precision, to, label } = used.date;
    occurred = { from, precision, expression: used.expression };
    if (to !== undefined) occurred = { ...occurred, to, label };
    if (ignored.length) {
      const others = ignored.map((date) => date.expression);
      warnings.push(warning('AMBIGUOUS_DATE', { used: used.expression, ignored: others }));
    }
    if (used.date.future) warnings.push(warning('FUTURE_DATE', { expression: used.expression }));
  }

  // 6. Texte.
  const text = render(tokens, (index) => !consumed.has(index));
  if (!text && TEXT_REQUIRED.has(typed.type)) warnings.push(warning('EMPTY_TEXT', {}));

  return {
    type: typed.type,
    ...(typed.emotionCode !== undefined ? { emotionCode: typed.emotionCode } : {}),
    ...(typed.intensity !== undefined ? { intensity: typed.intensity } : {}),
    text,
    occurred,
    ...(target ? { target } : {}),
    warnings,
  };
}
