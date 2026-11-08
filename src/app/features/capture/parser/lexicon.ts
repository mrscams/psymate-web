// Vocabulaire des dates relatives, par langue de grammaire. Tous les mots sont sous leur forme de
// comparaison (foldDateWord : minuscules, sans accents, sans élision). Ce sont des données d'analyse,
// pas des textes affichés.

import type { GrammarLanguage } from './normalize';

export type TimeUnit = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';

/** Saison → premier mois (saisons météorologiques : printemps = mars à mai, été = juin à août…). */
export type SeasonStart = 3 | 6 | 9 | 12;

export interface DateLexicon {
  /** Jours relatifs à aujourd'hui (0, -1, -2), les suites les plus longues d'abord. */
  readonly days: readonly { readonly words: readonly string[]; readonly offset: number }[];
  /** Dimanche à samedi (index = Date.getUTCDay). */
  readonly weekdays: readonly string[];
  /** Mot facultatif après un jour de semaine (« lundi dernier »). */
  readonly weekdayAfter: readonly string[];
  /** Mot qui désigne le prochain jour de ce nom, avant (« next monday ») ou après (« lundi prochain »). */
  readonly weekdayNextBefore: readonly string[];
  readonly weekdayNextAfter: readonly string[];
  /** Mot qui fait d'un jour de semaine une habitude, pas une date (« chaque lundi »). */
  readonly weekdayRepeat: readonly string[];
  /** Janvier à décembre. */
  readonly months: readonly string[];
  readonly seasons: ReadonlyMap<string, SeasonStart>;
  /** Mot d'amorce consommé avec la date (« en mars », « depuis lundi »). */
  readonly leads: readonly string[];
  /** Suites qui précèdent une durée écoulée (« il y a 3 jours »). */
  readonly agoBefore: readonly (readonly string[])[];
  /** Suites qui suivent une durée écoulée (« 3 days ago »). */
  readonly agoAfter: readonly (readonly string[])[];
  readonly numbers: ReadonlyMap<string, number>;
  readonly units: ReadonlyMap<string, TimeUnit>;
  /** Dates numériques JJ/MM[/AAAA] (ordre français ; ambiguës en anglais, donc absentes). */
  readonly slashDates: boolean;
  /** Mois avant le jour (« march 3 », « march 3rd ») en plus de « 3 march ». */
  readonly monthFirst: boolean;
  /** Unités de mesure : un nombre suivi de l'une d'elles n'est jamais une intensité. */
  readonly measures: readonly string[];
  /**
   * Mots grammaticaux ou courants qui ne sont jamais lus comme préfixe d'émotion (« sur » n'est pas
   * « surprise », « con » n'est pas « confiance ») ; une correspondance exacte reste possible.
   */
  readonly stopWords: readonly string[];
}

function units(entries: Record<TimeUnit, readonly string[]>): ReadonlyMap<string, TimeUnit> {
  const map = new Map<string, TimeUnit>();
  for (const [unit, words] of Object.entries(entries) as [TimeUnit, readonly string[]][]) {
    for (const word of words) map.set(word, unit);
  }
  return map;
}

const FR: DateLexicon = {
  days: [
    { words: ['avant', 'hier'], offset: -2 },
    { words: ['avant-hier'], offset: -2 },
    { words: ["aujourd'hui"], offset: 0 },
    { words: ['hier'], offset: -1 },
  ],
  weekdays: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'],
  weekdayAfter: ['dernier', 'passe'],
  weekdayNextBefore: [],
  weekdayNextAfter: ['prochain', 'suivant'],
  weekdayRepeat: ['chaque', 'tous', 'les'],
  months: [
    'janvier',
    'fevrier',
    'mars',
    'avril',
    'mai',
    'juin',
    'juillet',
    'aout',
    'septembre',
    'octobre',
    'novembre',
    'decembre',
  ],
  seasons: new Map<string, SeasonStart>([
    ['printemps', 3],
    ['ete', 6],
    ['automne', 9],
    ['hiver', 12],
  ]),
  leads: ['en', 'depuis', 'des', 'le', 'au'],
  agoBefore: [['il', 'y', 'a'], ['depuis'], ['ca', 'fait']],
  agoAfter: [],
  numbers: new Map([
    ['un', 1],
    ['une', 1],
    ['deux', 2],
    ['trois', 3],
    ['quatre', 4],
    ['cinq', 5],
    ['six', 6],
    ['sept', 7],
    ['huit', 8],
    ['neuf', 9],
    ['dix', 10],
  ]),
  units: units({
    minute: ['min', 'mn', 'minute', 'minutes'],
    hour: ['h', 'heure', 'heures'],
    day: ['j', 'jour', 'jours'],
    week: ['sem', 'semaine', 'semaines'],
    month: ['mois'],
    year: ['an', 'ans', 'annee', 'annees'],
  }),
  slashDates: true,
  monthFirst: false,
  measures: [
    'fois',
    'mg',
    'g',
    'kg',
    'ml',
    'cl',
    'l',
    'cp',
    'cps',
    'comprime',
    'comprimes',
    'gelule',
    'gelules',
    'goutte',
    'gouttes',
    'nuit',
    'nuits',
    'km',
    'm',
    'cm',
    'kilos',
    'euros',
    '%',
  ],
  stopWords: [
    'sur',
    'sous',
    'des',
    'les',
    'par',
    'pas',
    'pour',
    'son',
    'ses',
    'mon',
    'mes',
    'ton',
    'tes',
    'nos',
    'vos',
    'aux',
    'une',
    'est',
    'ont',
    'qui',
    'que',
    'mal',
    'con',
    'cul',
    'dis',
    'dit',
    'peu',
    'col',
    'cet',
    'ces',
    'car',
    'avec',
    'dans',
    'sans',
    'plus',
    'tres',
    'tout',
    'elle',
    'mais',
    'puis',
    'comme',
  ],
};

const EN: DateLexicon = {
  days: [
    { words: ['the', 'day', 'before', 'yesterday'], offset: -2 },
    { words: ['day', 'before', 'yesterday'], offset: -2 },
    { words: ['today'], offset: 0 },
    { words: ['yesterday'], offset: -1 },
  ],
  weekdays: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
  weekdayAfter: [],
  weekdayNextBefore: ['next'],
  weekdayNextAfter: [],
  weekdayRepeat: ['every', 'each'],
  months: [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
  ],
  seasons: new Map<string, SeasonStart>([
    ['spring', 3],
    ['summer', 6],
    ['autumn', 9],
    ['fall', 9],
    ['winter', 12],
  ]),
  leads: ['in', 'since', 'on', 'last'],
  agoBefore: [],
  agoAfter: [['ago']],
  numbers: new Map([
    ['a', 1],
    ['an', 1],
    ['one', 1],
    ['two', 2],
    ['three', 3],
    ['four', 4],
    ['five', 5],
    ['six', 6],
    ['seven', 7],
    ['eight', 8],
    ['nine', 9],
    ['ten', 10],
  ]),
  units: units({
    minute: ['min', 'mins', 'minute', 'minutes'],
    hour: ['h', 'hr', 'hrs', 'hour', 'hours'],
    day: ['d', 'day', 'days'],
    week: ['w', 'wk', 'wks', 'week', 'weeks'],
    month: ['mo', 'month', 'months'],
    year: ['y', 'yr', 'yrs', 'year', 'years'],
  }),
  slashDates: false,
  monthFirst: true,
  measures: [
    'times',
    'mg',
    'g',
    'kg',
    'lb',
    'lbs',
    'ml',
    'pill',
    'pills',
    'tablet',
    'tablets',
    'drop',
    'drops',
    'night',
    'nights',
    'km',
    'miles',
    '%',
  ],
  stopWords: [
    'the',
    'and',
    'for',
    'his',
    'her',
    'was',
    'not',
    'per',
    'con',
    'dis',
    'ant',
    'are',
    'but',
    'can',
    'had',
    'has',
    'she',
    'you',
    'all',
    'any',
  ],
};

export const LEXICONS: Readonly<Record<GrammarLanguage, DateLexicon>> = { fr: FR, en: EN };

const ALL = Object.values(LEXICONS);

/** Unités de durée et de mesure des deux langues : « 3 semaines », « 4 heures », « 50 mg », « 3 fois ». */
const QUANTITY_UNITS: ReadonlySet<string> = new Set(
  ALL.flatMap((lexicon) => [...lexicon.units.keys(), ...lexicon.measures]),
);

/** Mots vides des deux langues : le vocabulaire d'émotions est comparé dans les deux langues. */
const STOP_WORDS: ReadonlySet<string> = new Set(ALL.flatMap((lexicon) => lexicon.stopWords));

export function isQuantityUnit(word: string): boolean {
  return QUANTITY_UNITS.has(word);
}

export function isStopWord(word: string): boolean {
  return STOP_WORDS.has(word);
}
