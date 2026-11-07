import { ParamMap, Params } from '@angular/router';

import {
  DIRECTORY_SORTS,
  DIRECTORY_TEXT_MAX,
  DirectoryQuery,
  DirectoryVocabulary,
  EMPTY_QUERY,
  ListFilter,
  MODALITIES,
  PROFESSIONS,
} from './directory.models';

/**
 * Paramètres d'URL de l'annuaire (fiche 08 : /annuaire?ville=&profession=&specialite=&public=
 * &modalite=&langue=&page=), en français comme les routes. Les listes sont séparées par des
 * virgules (un paramètre répété est aussi lu).
 */
export const DIRECTORY_PARAMS = {
  q: 'q',
  city: 'ville',
  professions: 'profession',
  specialties: 'specialite',
  audiences: 'public',
  modalities: 'modalite',
  languages: 'langue',
  accepting: 'accepte',
  sort: 'tri',
  page: 'page',
} as const satisfies Record<keyof DirectoryQuery, string>;

const SORT_PARAM: Record<DirectoryQuery['sort'], string | null> = { relevance: null, name: 'nom' };
const ACCEPTING_VALUE = 'oui';
const LANGUAGE_CODE = /^[a-z]{2}$/;
const VOCABULARY_CODE = /^[a-z0-9_]{1,64}$/;

/** Lit la recherche dans l'URL. Les valeurs hors liste fermée sont filtrées par sanitizeQuery. */
export function queryFromParams(params: ParamMap): DirectoryQuery {
  const text = (name: string) => (params.get(name) ?? '').trim().slice(0, DIRECTORY_TEXT_MAX);
  const list = (name: string) =>
    unique(
      params
        .getAll(name)
        .flatMap((value) => value.split(','))
        .map((value) => value.trim())
        .filter(Boolean),
    );
  const sortParam = params.get(DIRECTORY_PARAMS.sort);
  const sort =
    DIRECTORY_SORTS.find((candidate) => SORT_PARAM[candidate] === sortParam) ?? 'relevance';
  const page = Number.parseInt(params.get(DIRECTORY_PARAMS.page) ?? '', 10);
  return {
    q: text(DIRECTORY_PARAMS.q),
    city: text(DIRECTORY_PARAMS.city),
    professions: list(DIRECTORY_PARAMS.professions),
    specialties: list(DIRECTORY_PARAMS.specialties),
    audiences: list(DIRECTORY_PARAMS.audiences),
    modalities: list(DIRECTORY_PARAMS.modalities),
    languages: list(DIRECTORY_PARAMS.languages),
    accepting: params.get(DIRECTORY_PARAMS.accepting) === ACCEPTING_VALUE,
    sort,
    page: Number.isFinite(page) && page >= 1 ? page : 1,
  };
}

/** Paramètres d'URL d'une recherche ; les valeurs par défaut sont omises (URL courte). */
export function paramsFromQuery(query: DirectoryQuery): Params {
  const params: Params = {};
  if (query.q.trim()) params[DIRECTORY_PARAMS.q] = query.q.trim();
  if (query.city.trim()) params[DIRECTORY_PARAMS.city] = query.city.trim();
  for (const filter of LIST_FILTERS) {
    if (query[filter].length) params[DIRECTORY_PARAMS[filter]] = query[filter].join(',');
  }
  if (query.accepting) params[DIRECTORY_PARAMS.accepting] = ACCEPTING_VALUE;
  const sort = SORT_PARAM[query.sort];
  if (sort) params[DIRECTORY_PARAMS.sort] = sort;
  if (query.page > 1) params[DIRECTORY_PARAMS.page] = String(query.page);
  return params;
}

export const LIST_FILTERS: readonly ListFilter[] = [
  'professions',
  'specialties',
  'audiences',
  'modalities',
  'languages',
];

/**
 * Ne garde que les codes connus (fiche 08 : « un code inconnu dans l'URL est ignoré », G Q15) :
 * professions et modalités dans leur liste fixe, spécialités et publics dans la liste fermée du
 * vocabulaire. Sans vocabulaire (indisponible), les spécialités sont retirées (un code inconnu
 * vaudrait un 422) et les publics gardent la forme d'un code.
 */
export function sanitizeQuery(
  query: DirectoryQuery,
  vocabulary: DirectoryVocabulary | null,
): DirectoryQuery {
  const known = (codes: readonly string[]) => (value: string) => codes.includes(value);
  const inVocabulary = (items: { code: string }[] | undefined, fallback: RegExp | null) =>
    items
      ? known(items.map((item) => item.code))
      : (value: string) => fallback !== null && fallback.test(value);
  return {
    ...query,
    professions: query.professions.filter(known(PROFESSIONS)),
    modalities: query.modalities.filter(known(MODALITIES)),
    specialties: query.specialties.filter(inVocabulary(vocabulary?.specialties, null)),
    audiences: query.audiences.filter(inVocabulary(vocabulary?.audiences, VOCABULARY_CODE)),
    languages: query.languages.filter((value) => LANGUAGE_CODE.test(value)),
  };
}

/** Deux recherches identiques (même URL) : inutile de relancer. */
export function sameQuery(a: DirectoryQuery, b: DirectoryQuery): boolean {
  return JSON.stringify(paramsFromQuery(a)) === JSON.stringify(paramsFromQuery(b));
}

/** Nombre de filtres actifs (bouton « Filtres (n) » à 390 px), texte et ville exclus. */
export function activeFilterCount(query: DirectoryQuery): number {
  return (
    LIST_FILTERS.reduce((sum, filter) => sum + query[filter].length, 0) + (query.accepting ? 1 : 0)
  );
}

export function isEmptyQuery(query: DirectoryQuery): boolean {
  return sameQuery({ ...query, sort: 'relevance', page: 1 }, EMPTY_QUERY);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
