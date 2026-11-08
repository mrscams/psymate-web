// Dates de la barre de commande (B5) : relatives à `now` et au jour civil du praticien, avec leur
// précision du contrat (EntryOccurredRequest.precision).
//
// Règles (grammaire française ; l'anglais suit les mêmes avec son vocabulaire, voir lexicon.ts) :
// - « aujourd'hui », « hier », « avant-hier » → ce jour civil, précision day ;
// - « lundi » (« lundi dernier ») → le dernier lundi strictement passé : saisi un lundi, c'est le
//   lundi d'il y a 7 jours (« aujourd'hui » désigne le jour même), précision day ;
// - « il y a 3 j / 3 jours / 2 semaines », « depuis 3 jours » → jour, précision day ;
//   « il y a 2 h / 10 min » → instant, précision exact ; « il y a 1 mois » → mois, précision month ;
//   « il y a 2 ans » → année, précision year ;
// - « 12 mars [2024] », « le 12/03 », « 12/03/2024 », « 2024-03-12 » → jour, précision day (sans année :
//   la plus récente non future ; JJ/MM sans année exige une amorce, pour ne pas lire « 1/2 cp ») ;
// - « en mars », « depuis mars », « mars 2024 » → mois, précision month (sans année : le plus récent
//   non futur, le mois courant compris) ; un mois seul sans amorce ni année n'est pas une date ;
// - « été 2024 » (« l'été 2024 », « au printemps 2025 ») → précision period, libellé « été 2024 », de
//   juin à août (printemps mars à mai, automne septembre à novembre, hiver décembre à février de
//   l'année suivante) : le contrat n'a pas de précision « saison » ; une saison sans année n'est pas une
//   date (« a été » est trop fréquent) ;
// - « en 2019 », « depuis 2019 » → année, précision year (une année seule exige une amorce).
// Les bornes jour, mois, année et période sont des jours entiers UTC, comme dans l'éditeur d'entrée.

import { addDays, addMonths, civilKey, daysInMonth, isoDay, weekday } from './calendar';
import type { CivilDate } from './calendar';
import type { DateLexicon, TimeUnit } from './lexicon';
import { stripElision, stripPunctuation } from './normalize';
import type { CapturePrecision } from './parse.types';

export interface DateWord {
  /** Mot tel que saisi. */
  readonly raw: string;
  /** Forme de comparaison (foldDateWord). */
  readonly word: string;
}

export interface DateContext {
  readonly now: Date;
  /** Jour civil de `now` dans le fuseau du praticien. */
  readonly today: CivilDate;
  readonly lexicon: DateLexicon;
}

export interface ResolvedDate {
  readonly kind: 'date';
  /** Nombre de mots consommés. */
  readonly length: number;
  readonly from: string;
  readonly precision: CapturePrecision;
  readonly to?: string;
  readonly label?: string;
  /** Début après aujourd'hui. */
  readonly future: boolean;
}

/** Date explicite impossible (« 31 février ») : signalée, laissée dans le texte. */
export interface InvalidDate {
  readonly kind: 'invalid';
  readonly length: number;
}

export type DateMatch = ResolvedDate | InvalidDate;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const SLASH_DATE = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/;
const DAY_NUMBER = /^(\d{1,2})(?:er|st|nd|rd|th)?$/;
const YEAR = /^(?:19|20)\d{2}$/;
const AMOUNT = /^\d+$/;
const AMOUNT_WITH_UNIT = /^(\d+)([a-z]+)$/;

const MS_PER_UNIT: Readonly<Record<'minute' | 'hour', number>> = {
  minute: 60_000,
  hour: 3_600_000,
};

/** Reconnaît une date qui commence au mot `start`, ou rien. */
export function matchDateAt(
  words: readonly DateWord[],
  start: number,
  context: DateContext,
): DateMatch | null {
  const ago = matchAgo(words, start, context);
  if (ago) return ago;
  if (context.lexicon.leads.includes(wordAt(words, start))) {
    const led = matchCore(words, start + 1, true, context);
    if (led) return { ...led, length: led.length + 1 };
  }
  return matchCore(words, start, false, context);
}

function wordAt(words: readonly DateWord[], index: number): string {
  return index < words.length ? words[index].word : '';
}

function startsWith(
  words: readonly DateWord[],
  start: number,
  sequence: readonly string[],
): boolean {
  return sequence.every((word, offset) => wordAt(words, start + offset) === word);
}

interface Amount {
  readonly value: number;
  readonly unit: TimeUnit;
  readonly length: number;
}

/** « 3 jours », « trois jours », « 3j », « a week ». */
function readAmount(
  words: readonly DateWord[],
  start: number,
  lexicon: DateLexicon,
): Amount | null {
  const first = wordAt(words, start);
  const glued = AMOUNT_WITH_UNIT.exec(first);
  if (glued) {
    const unit = lexicon.units.get(glued[2]);
    return unit ? { value: Number(glued[1]), unit, length: 1 } : null;
  }
  const value = AMOUNT.test(first) ? Number(first) : lexicon.numbers.get(first);
  const unit = lexicon.units.get(wordAt(words, start + 1));
  return value !== undefined && unit ? { value, unit, length: 2 } : null;
}

function matchAgo(
  words: readonly DateWord[],
  start: number,
  context: DateContext,
): DateMatch | null {
  const { lexicon } = context;
  for (const before of lexicon.agoBefore) {
    if (!startsWith(words, start, before)) continue;
    const amount = readAmount(words, start + before.length, lexicon);
    if (amount) return resolveAgo(amount, before.length + amount.length, context);
  }
  const amount = readAmount(words, start, lexicon);
  if (!amount) return null;
  for (const after of lexicon.agoAfter) {
    if (startsWith(words, start + amount.length, after)) {
      return resolveAgo(amount, amount.length + after.length, context);
    }
  }
  return null;
}

function resolveAgo(amount: Amount, length: number, context: DateContext): ResolvedDate {
  const { today } = context;
  switch (amount.unit) {
    case 'minute':
    case 'hour': {
      const instant = new Date(context.now.getTime() - amount.value * MS_PER_UNIT[amount.unit]);
      return {
        kind: 'date',
        length,
        from: instant.toISOString(),
        precision: 'exact',
        future: false,
      };
    }
    case 'day':
      return civil(addDays(today, -amount.value), 'day', length, context);
    case 'week':
      return civil(addDays(today, -7 * amount.value), 'day', length, context);
    case 'month':
      return civil(addMonths(today, -amount.value), 'month', length, context);
    case 'year':
      return civil({ year: today.year - amount.value, month: 1, day: 1 }, 'year', length, context);
  }
}

function civil(
  date: CivilDate,
  precision: CapturePrecision,
  length: number,
  context: DateContext,
): ResolvedDate {
  return {
    kind: 'date',
    length,
    from: isoDay(date),
    precision,
    future: civilKey(date) > civilKey(context.today),
  };
}

/** Jour explicite, validé (« 31 février » → invalide). */
function explicitDay(
  year: number,
  month: number,
  day: number,
  length: number,
  context: DateContext,
): DateMatch {
  const valid = month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
  return valid ? civil({ year, month, day }, 'day', length, context) : { kind: 'invalid', length };
}

/** Jour sans année : le plus récent non futur (cette année, sinon l'an dernier). */
function recentDay(month: number, day: number, length: number, context: DateContext): DateMatch {
  const { today } = context;
  const thisYear = civilKey({ year: today.year, month, day }) <= civilKey(today);
  return explicitDay(thisYear ? today.year : today.year - 1, month, day, length, context);
}

function month(year: number, value: number, length: number, context: DateContext): ResolvedDate {
  return civil({ year, month: value, day: 1 }, 'month', length, context);
}

function matchCore(
  words: readonly DateWord[],
  start: number,
  led: boolean,
  context: DateContext,
): DateMatch | null {
  const { lexicon, today } = context;
  const first = wordAt(words, start);
  const second = wordAt(words, start + 1);
  const third = wordAt(words, start + 2);

  for (const entry of lexicon.days) {
    if (startsWith(words, start, entry.words)) {
      return civil(addDays(today, entry.offset), 'day', entry.words.length, context);
    }
  }

  const weekdayIndex = lexicon.weekdays.indexOf(first);
  if (weekdayIndex >= 0) {
    const back = (weekday(today) - weekdayIndex + 7) % 7;
    const length = lexicon.weekdayAfter.includes(second) ? 2 : 1;
    return civil(addDays(today, -(back === 0 ? 7 : back)), 'day', length, context);
  }

  const iso = ISO_DATE.exec(first);
  if (iso) return explicitDay(Number(iso[1]), Number(iso[2]), Number(iso[3]), 1, context);

  const slash = lexicon.slashDates ? SLASH_DATE.exec(first) : null;
  if (slash) {
    const [, day, monthValue, year] = slash;
    if (year) return explicitDay(Number(year), Number(monthValue), Number(day), 1, context);
    if (led) return recentDay(Number(monthValue), Number(day), 1, context);
  }

  const dayNumber = DAY_NUMBER.exec(first);
  const dayMonth = lexicon.months.indexOf(second) + 1;
  if (dayNumber && dayMonth > 0) {
    const day = Number(dayNumber[1]);
    if (YEAR.test(third)) return explicitDay(Number(third), dayMonth, day, 3, context);
    return recentDay(dayMonth, day, 2, context);
  }

  const monthValue = lexicon.months.indexOf(first) + 1;
  if (monthValue > 0) {
    if (YEAR.test(second)) return month(Number(second), monthValue, 2, context);
    const year = monthValue <= today.month ? today.year : today.year - 1;
    if (led) return month(year, monthValue, 1, context);
  }

  const season = lexicon.seasons.get(first);
  if (season !== undefined && YEAR.test(second)) {
    const begin: CivilDate = { year: Number(second), month: season, day: 1 };
    const label = `${stripElision(stripPunctuation(words[start].raw))} ${second}`;
    return { ...civil(begin, 'period', 2, context), to: isoDay(addMonths(begin, 3)), label };
  }

  if (led && YEAR.test(first)) {
    return civil({ year: Number(first), month: 1, day: 1 }, 'year', 1, context);
  }
  return null;
}
