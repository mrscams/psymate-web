// Filtres et mode de la timeline (fiche 03, M3-03) : ce que l'URL porte
// (`?types=&emotion=&tag=&drafts=&from=&to=&mode=`), ce que la requête envoie (types, emotions,
// tags, draftsOnly, from, to) et les calculs purs entre les deux. Aucun texte ici.

import { ENTRY_TYPES, EntryType } from '../../../shared/ui';

/**
 * Mode d'affichage : état A (chronologique) ou état B (par séance). La vue décennie (état C, M3-04)
 * est le zoom maximal du mode chronologique (TimelineDecadeStore), pas un mode à part.
 */
export type TimelineMode = 'chronological' | 'session';

/** Valeurs de la préférence `timeline.groupBy` (fiche 14). */
export type TimelineGroupBy = 'session' | 'month' | 'chronological';

/**
 * Mode de la préférence. `month` (état C forcé, vue décennie) est le mode chronologique dont
 * l'agrégat est forcé (TimelineFiltersStore.forcedDecade), sans réécrire la préférence.
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
  /** Filtres par défaut de la visite (période de l'arrivée, ou « Tout » une fois élargie). */
  defaults?: TimelineFilters;
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
  /** `?period=all` : « Tout » choisi alors que la période par défaut est bornée (90 j). */
  period: 'period',
} as const;

/** Valeur de `?period=` pour « Tout ». */
export const PERIOD_ALL = 'all';

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

/**
 * Filtres lus dans une URL qui porte au moins un paramètre de filtre ou de mode (lien partagé, lien
 * profond de la vue d'ensemble : `?drafts=1`, `?mode=session`…). Les valeurs illisibles sont
 * ignorées (le serveur juge le reste). Sans `from` ni `to`, la période est « Tout », comme avant
 * UX-B2 : seule l'URL nue prend la période par défaut (TimelineFiltersStore.init).
 */
export function parseFilters(source: ParamSource): TimelineFilters {
  const types = listOf(source, FILTER_PARAMS.types, true).filter((t): t is EntryType =>
    (ENTRY_TYPES as readonly string[]).includes(t),
  );
  const drafts = source.get(FILTER_PARAMS.draftsOnly);
  let from = validDay(source.get(FILTER_PARAMS.from));
  let to = validDay(source.get(FILTER_PARAMS.to));
  if (from && to && to < from) to = null;
  if (source.get(FILTER_PARAMS.period) === PERIOD_ALL) {
    from = null;
    to = null;
  }
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
 * reste `/timeline`). Les listes sont des paramètres répétés. L'URL nue vaut les filtres par défaut
 * (`defaults`, période de l'arrivée) ; une URL avec un autre paramètre et sans période vaut « Tout »
 * (parseFilters) : la période par défaut s'y écrit donc en dates, et « Tout » seul en `?period=all`.
 */
export function filterParams(
  filters: TimelineFilters,
  mode: TimelineMode | null,
  defaults: TimelineFilters = NO_FILTERS,
): Record<string, FilterParamValue> {
  const list = (values: readonly string[]) => (values.length ? [...values] : null);
  const others: Record<string, FilterParamValue> = {
    [FILTER_PARAMS.types]: list(filters.types),
    [FILTER_PARAMS.emotions]: list(filters.emotions),
    [FILTER_PARAMS.tags]: list(filters.tags),
    [FILTER_PARAMS.draftsOnly]: filters.draftsOnly ? '1' : null,
    [FILTER_PARAMS.mode]: mode,
  };
  const alone = Object.values(others).every((value) => value === null);
  const bare = alone && filters.from === defaults.from && filters.to === defaults.to;
  const all = !filters.from && !filters.to;
  return {
    ...others,
    [FILTER_PARAMS.from]: bare ? null : filters.from,
    [FILTER_PARAMS.to]: bare ? null : filters.to,
    [FILTER_PARAMS.period]: !bare && alone && all ? PERIOD_ALL : null,
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

/** Au moins un filtre autre que la période (types, émotions, tags, brouillons). */
export function hasNarrowing(filters: TimelineFilters): boolean {
  return !sameFilters({ ...filters, from: null, to: null }, NO_FILTERS);
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

/**
 * Période par défaut à l'arrivée (UX-B2) : la fenêtre de la vue d'ensemble (`overview.window`,
 * 90 j par défaut), jamais « Tout » ; sauf préférence `timeline.groupBy = month` (agrégat par mois
 * forcé, fiche 03), qui n'a de sens que sur toute la plage.
 */
export function defaultPreset(
  window: string | null | undefined,
  groupBy: TimelineGroupBy | null | undefined,
): PeriodPreset {
  if (groupBy === 'month') return 'all';
  if (window === '30d') return '30d';
  if (window === '12m') return '1y';
  return '90d';
}

/** Filtres de l'arrivée : aucun filtre, la période par défaut qui finit aujourd'hui. */
export function defaultFilters(preset: PeriodPreset, today: Date): TimelineFilters {
  return withPeriod(NO_FILTERS, preset, today);
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
