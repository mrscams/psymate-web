// Filtres et mode de la timeline (fiche 03, M3-03) : ce que l'URL porte
// (`?types=&emotion=&tag=&drafts=&from=&to=&mode=`), ce que la requête envoie (types, emotions,
// tags, draftsOnly, from, to) et les calculs purs entre les deux. Aucun texte ici.

import { ENTRY_TYPES, EntryType } from '../../../shared/ui';

/** Mode d'affichage : état A (chronologique) ou état B (par séance). La vue décennie est M3-04. */
export type TimelineMode = 'chronological' | 'session';

/** Valeurs de la préférence `timeline.groupBy` (fiche 14). */
export type TimelineGroupBy = 'session' | 'month' | 'chronological';

/**
 * Mode de la préférence. `month` (état C forcé, vue décennie) n'existe qu'avec M3-04 : d'ici là il
 * s'affiche en chronologique, sans réécrire la préférence.
 */
export function modeOfGroupBy(groupBy: TimelineGroupBy | null | undefined): TimelineMode {
  return groupBy === 'chronological' || groupBy === 'month' ? 'chronological' : 'session';
}

/** Les filtres de la chronologie ; tableaux vides et null = sans filtre. */
export interface TimelineFilters {
  types: EntryType[];
  /** Codes d'émotion (ressentis seulement, côté serveur). */
  emotions: string[];
  /** Libellés de tags. */
  tags: string[];
  draftsOnly: boolean;
  /** Bornes de la période, jours calendaires du praticien (AAAA-MM-JJ), `to` inclus ; null = sans borne. */
  from: string | null;
  to: string | null;
}

/** Ce que l'onglet range avec la chronologie (rememberTab) pour retrouver ses filtres au retour. */
export interface TimelineFiltersSnapshot {
  filters: TimelineFilters;
  modeOverride: TimelineMode | null;
}

export const NO_FILTERS: TimelineFilters = {
  types: [],
  emotions: [],
  tags: [],
  draftsOnly: false,
  from: null,
  to: null,
};

/** Paramètres de requête de la chronologie (contrat : listes en OU, ET entre listes). */
export interface TimelineFilterQuery {
  types: EntryType[];
  emotions: string[];
  tags: string[];
  draftsOnly: boolean;
  /** ISO 8601 UTC ; `to` exclu. */
  from: string | null;
  to: string | null;
}

/** Noms des paramètres d'URL (fiche 03, « Route »). */
export const FILTER_PARAMS = {
  types: 'types',
  emotions: 'emotion',
  tags: 'tag',
  draftsOnly: 'drafts',
  from: 'from',
  to: 'to',
  mode: 'mode',
} as const;

/** Lecture d'une URL : ce qu'Angular donne par ParamMap (getAll). */
export interface ParamSource {
  getAll(name: string): string[];
  get(name: string): string | null;
  has(name: string): boolean;
}

/** Valeur d'URL : liste (paramètre répété), texte, ou null (paramètre retiré). */
export type FilterParamValue = string | string[] | null;

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_VALUE = 120;

function unique(values: Iterable<string>): string[] {
  return [...new Set(values)];
}

/** Valeurs d'un paramètre répété ; `,` sépare aussi les codes (types, émotions), jamais les tags. */
function listOf(source: ParamSource, name: string, split: boolean): string[] {
  const raw = source.getAll(name);
  const values = split ? raw.flatMap((value) => value.split(',')) : raw;
  return unique(
    values.map((value) => value.trim()).filter((v) => v.length > 0 && v.length <= MAX_VALUE),
  );
}

/** Un jour AAAA-MM-JJ qui existe au calendrier, sinon null. */
export function validDay(value: string | null | undefined): string | null {
  if (!value || !DAY_PATTERN.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
    ? value
    : null;
}

/** Vrai si l'URL porte au moins un paramètre de filtre ou de mode. */
export function hasFilterParams(source: ParamSource): boolean {
  return Object.values(FILTER_PARAMS).some((name) => source.has(name));
}

/** Filtres lus dans l'URL ; les valeurs illisibles sont ignorées (le serveur juge le reste). */
export function parseFilters(source: ParamSource): TimelineFilters {
  const types = listOf(source, FILTER_PARAMS.types, true).filter((t): t is EntryType =>
    (ENTRY_TYPES as readonly string[]).includes(t),
  );
  const drafts = source.get(FILTER_PARAMS.draftsOnly);
  const from = validDay(source.get(FILTER_PARAMS.from));
  let to = validDay(source.get(FILTER_PARAMS.to));
  if (from && to && to < from) to = null;
  return {
    types,
    emotions: listOf(source, FILTER_PARAMS.emotions, true),
    tags: listOf(source, FILTER_PARAMS.tags, false),
    draftsOnly: drafts === '1' || drafts === 'true',
    from,
    to,
  };
}

/** Mode imposé par l'URL (`?mode=`), ou null. */
export function parseMode(source: ParamSource): TimelineMode | null {
  const mode = source.get(FILTER_PARAMS.mode);
  return mode === 'chronological' || mode === 'session' ? mode : null;
}

/**
 * Paramètres d'URL des filtres : une valeur par défaut retire le paramètre (une URL sans filtre
 * reste `/timeline`). Les listes sont des paramètres répétés.
 */
export function filterParams(
  filters: TimelineFilters,
  mode: TimelineMode | null,
): Record<string, FilterParamValue> {
  const list = (values: readonly string[]) => (values.length ? [...values] : null);
  return {
    [FILTER_PARAMS.types]: list(filters.types),
    [FILTER_PARAMS.emotions]: list(filters.emotions),
    [FILTER_PARAMS.tags]: list(filters.tags),
    [FILTER_PARAMS.draftsOnly]: filters.draftsOnly ? '1' : null,
    [FILTER_PARAMS.from]: filters.from,
    [FILTER_PARAMS.to]: filters.to,
    [FILTER_PARAMS.mode]: mode,
  };
}

/** Même valeur d'URL (listes comparées dans l'ordre). */
export function sameParam(a: FilterParamValue, b: FilterParamValue): boolean {
  const left = a === null ? [] : Array.isArray(a) ? a : [a];
  const right = b === null ? [] : Array.isArray(b) ? b : [b];
  return left.length === right.length && left.every((value, i) => value === right[i]);
}

export function sameFilters(a: TimelineFilters, b: TimelineFilters): boolean {
  return (
    sameParam(a.types, b.types) &&
    sameParam(a.emotions, b.emotions) &&
    sameParam(a.tags, b.tags) &&
    a.draftsOnly === b.draftsOnly &&
    a.from === b.from &&
    a.to === b.to
  );
}

export function hasFilters(filters: TimelineFilters): boolean {
  return !sameFilters(filters, NO_FILTERS);
}

/** Minuit local d'un jour AAAA-MM-JJ décalé de `days`, en ISO UTC (bornes de la requête). */
function localMidnight(day: string, days = 0): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d + days).toISOString();
}

/** Ce que la requête envoie : la période devient [minuit du premier jour, minuit du lendemain du dernier[. */
export function filterQuery(filters: TimelineFilters): TimelineFilterQuery {
  return {
    types: [...filters.types],
    emotions: [...filters.emotions],
    tags: [...filters.tags],
    draftsOnly: filters.draftsOnly,
    from: filters.from ? localMidnight(filters.from) : null,
    to: filters.to ? localMidnight(filters.to, 1) : null,
  };
}

// ---------------------------------------------------------------- bascules

function toggled<T>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}

export function toggleType(filters: TimelineFilters, type: EntryType): TimelineFilters {
  return { ...filters, types: toggled(filters.types, type) };
}

export function toggleEmotion(filters: TimelineFilters, code: string): TimelineFilters {
  return { ...filters, emotions: toggled(filters.emotions, code) };
}

export function toggleTag(filters: TimelineFilters, label: string): TimelineFilters {
  return { ...filters, tags: toggled(filters.tags, label) };
}

// ---------------------------------------------------------------- période

/** Périodes proposées (fiche 03 : 30 j / 90 j / 1 an / Tout). */
export type PeriodPreset = '30d' | '90d' | '1y' | 'all';

export const PERIOD_PRESETS: readonly PeriodPreset[] = ['30d', '90d', '1y', 'all'];

/** Jour calendaire local AAAA-MM-JJ. */
export function localDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Premier jour d'une période qui finit aujourd'hui ; null pour « Tout ». */
export function presetStart(preset: PeriodPreset, today: Date): string | null {
  const y = today.getFullYear();
  const m = today.getMonth();
  const d = today.getDate();
  switch (preset) {
    case '30d':
      return localDay(new Date(y, m, d - 30));
    case '90d':
      return localDay(new Date(y, m, d - 90));
    case '1y':
      return localDay(new Date(y - 1, m, d));
    case 'all':
      return null;
  }
}

export function withPeriod(
  filters: TimelineFilters,
  preset: PeriodPreset,
  today: Date,
): TimelineFilters {
  return { ...filters, from: presetStart(preset, today), to: null };
}

/**
 * La période proposée qui correspond aux filtres, ou null pour une période libre (URL partagée la
 * veille, bornes écrites à la main) : elle s'affiche alors avec ses dates.
 */
export function presetOf(filters: TimelineFilters, today: Date): PeriodPreset | null {
  if (!filters.from && !filters.to) return 'all';
  if (filters.to) return null;
  return PERIOD_PRESETS.find((preset) => presetStart(preset, today) === filters.from) ?? null;
}
