// Modèles de vue de features/search (handbook §2, couche 4 → 3) : la recherche dans le dossier
// (fiche 07) telle que l'écran la lit, préparée depuis les DTO par data/search.api.ts.

import { ENTRY_TYPES, EntryType } from '../../../shared/ui';
import { OccurredPrecision } from '../../../shared/util';

/** La recherche ne part qu'à partir de 2 caractères (fiche 07). */
export const MIN_QUERY_LENGTH = 2;
/** Délai sans frappe avant de chercher (fiche 07 : 250 ms). */
export const SEARCH_DEBOUNCE_MS = 250;
/** 200 caractères au plus dans q (400 TOO_LONG au-delà). */
export const MAX_QUERY_LENGTH = 200;

/**
 * Paramètre de la timeline qui la positionne sur une entrée (« Ouvrir dans la timeline »).
 * Pas `entry` : sur tout l'onglet du dossier, `?entry=<id>` ouvre l'éditeur en correction (M1-08).
 */
export const TIMELINE_FOCUS_PARAM = 'focus';
/** Paramètre du graphe : l'entrée racine (fiche 04). */
export const GRAPH_ROOT_PARAM = 'root';

/** Périodes proposées par le sélecteur (fiche 07) ; `custom` : from / to venus de l'URL. */
export type PeriodPreset = 'all' | '30d' | '90d' | '12m' | 'custom';
export const PERIOD_PRESETS: readonly Exclude<PeriodPreset, 'custom'>[] = [
  'all',
  '30d',
  '90d',
  '12m',
];

/** Filtres de l'écran, portés par l'URL : ?q=&types=&from=&to=&session=&archived= (fiche 07). */
export interface SearchFilters {
  q: string;
  /** Filtre de type exclusif (fiche 07 : une puce à la fois, « Tous » = null). */
  type: EntryType | null;
  /** AAAA-MM-JJ, inclus. */
  from: string | null;
  /** AAAA-MM-JJ, inclus. */
  to: string | null;
  sessionId: string | null;
  archived: boolean;
}

export const EMPTY_FILTERS: SearchFilters = {
  q: '',
  type: null,
  from: null,
  to: null,
  sessionId: null,
  archived: false,
};

/** Un morceau d'extrait : texte brut, surligné ou non (rendu sans innerHTML). */
export interface MarkedSegment {
  text: string;
  mark: boolean;
}

/** Une entrée trouvée (EntrySearchItemDto). */
export interface SearchHit {
  entryId: string;
  type: EntryType;
  /** Titre découpé (mots trouvés surlignés) ; null sans titre. */
  title: MarkedSegment[] | null;
  /** Extrait du corps découpé ; null sans corps. */
  snippet: MarkedSegment[] | null;
  occurredFrom: string | null;
  occurredTo: string | null;
  precision: OccurredPrecision;
  sessionId: string | null;
  tags: string[];
  version: number;
  visibility: 'private' | 'clinical';
  archived: boolean;
  /** Résultat approché (trigrammes, tolérance aux fautes) plutôt qu'exact. */
  approximate: boolean;
}

export interface TypeCount {
  type: EntryType;
  count: number;
}

/** Ce que le serveur a compris de q (EntrySearchQueryDto). */
export interface InterpretedQuery {
  text: string;
  tags: string[];
  emotions: string[];
  before: string | null;
  after: string | null;
}

/** Une page de résultats (EntrySearchResultDto). */
export interface SearchPage {
  /** Résultats exacts sur toutes les pages (hors approchés). */
  total: number;
  page: number;
  pageSize: number;
  tookMs: number;
  exact: SearchHit[];
  approximate: SearchHit[];
  /** Compteurs par type, calculés sans le filtre de type (les puces gardent leur compteur). */
  counts: TypeCount[];
  query: InterpretedQuery;
}

/** Une séance du patient, pour le sélecteur « Séance » et la ligne de contexte. */
export interface SessionOption {
  id: string;
  startedAt: string;
}

/** Un lien de l'entrée, tel que l'aperçu le montre. */
export interface PreviewLink {
  id: string;
  /** Phrase lisible « entrée verbe autre entrée », vue depuis l'entrée. */
  sentence: string;
}

/** L'entrée sélectionnée, relue en entier pour l'aperçu (GET /api/entries/{id} + ses liens). */
export interface EntryPreview {
  id: string;
  type: EntryType;
  title: string | null;
  body: string | null;
  occurred: {
    from: string | null;
    to: string | null;
    precision: OccurredPrecision;
    label: string | null;
  };
  recordedAt: string | null;
  sessionId: string | null;
  version: number;
  visibility: 'private' | 'clinical';
  archived: boolean;
  intensity: number | null;
  links: PreviewLink[];
}

/** La requête envoyée à GET /api/patients/{id}/search. */
export interface SearchRequest {
  q: string;
  types: EntryType[];
  from: string | null;
  to: string | null;
  sessionId: string | null;
  includeArchived: boolean;
  page: number;
}

/** Le texte réellement cherché : espaces réduits, vide sous 2 caractères. */
export function effectiveQuery(q: string): string {
  const trimmed = q.trim().replace(/\s+/g, ' ');
  return trimmed.length >= MIN_QUERY_LENGTH ? trimmed.slice(0, MAX_QUERY_LENGTH) : '';
}

export function toRequest(filters: SearchFilters, page = 1): SearchRequest {
  return {
    q: effectiveQuery(filters.q),
    types: filters.type ? [filters.type] : [],
    from: filters.from,
    to: filters.to,
    sessionId: filters.sessionId,
    includeArchived: filters.archived,
    page,
  };
}

export function sameFilters(a: SearchFilters, b: SearchFilters): boolean {
  return (
    effectiveQuery(a.q) === effectiveQuery(b.q) &&
    a.type === b.type &&
    a.from === b.from &&
    a.to === b.to &&
    a.sessionId === b.sessionId &&
    a.archived === b.archived
  );
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lecture des paramètres de l'URL ; une valeur mal formée est ignorée (jamais de 400 évitable). */
export function filtersFromParams(
  params: Record<string, string | null | undefined>,
): SearchFilters {
  const type = params['types'];
  const from = params['from'];
  const to = params['to'];
  const session = params['session'];
  return {
    q: (params['q'] ?? '').slice(0, MAX_QUERY_LENGTH),
    type: ENTRY_TYPES.find((value) => value === type) ?? null,
    from: from && ISO_DATE.test(from) ? from : null,
    to: to && ISO_DATE.test(to) ? to : null,
    sessionId: session && UUID.test(session) ? session : null,
    archived: params['archived'] === 'true',
  };
}

/** Paramètres d'URL des filtres ; null retire le paramètre (queryParamsHandling: 'merge'). */
export function filtersToParams(filters: SearchFilters): Record<string, string | null> {
  return {
    q: filters.q.trim() ? filters.q : null,
    types: filters.type,
    from: filters.from,
    to: filters.to,
    session: filters.sessionId,
    archived: filters.archived ? 'true' : null,
  };
}

/** AAAA-MM-JJ du jour local, décalé de `days` jours (négatif : dans le passé). */
export function isoDay(today: Date, days = 0): string {
  const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Début de période d'un préréglage (pas de fin : jusqu'à aujourd'hui). */
export function presetFrom(preset: PeriodPreset, today: Date): string | null {
  switch (preset) {
    case '30d':
      return isoDay(today, -30);
    case '90d':
      return isoDay(today, -90);
    case '12m':
      return isoDay(new Date(today.getFullYear() - 1, today.getMonth(), today.getDate()));
    default:
      return null;
  }
}

/** Le préréglage qui correspond à from / to, sinon `custom`. */
export function presetOf(filters: Pick<SearchFilters, 'from' | 'to'>, today: Date): PeriodPreset {
  if (!filters.from && !filters.to) return 'all';
  if (filters.to) return 'custom';
  return PERIOD_PRESETS.find((preset) => presetFrom(preset, today) === filters.from) ?? 'custom';
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Décode les entités d'un fragment HTML échappé par le serveur (texte, jamais du balisage). */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity: string) => {
    if (entity[0] === '#') {
      const code =
        entity[1] === 'x' || entity[1] === 'X'
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : whole;
    }
    return ENTITIES[entity.toLowerCase()] ?? whole;
  });
}

/**
 * Découpe un fragment du serveur (HTML échappé, seule balise ajoutée : <mark>) en morceaux de texte
 * brut, surlignés ou non. Le rendu passe par l'interpolation d'Angular : aucune autre balise ne
 * peut s'injecter, même si le serveur en laissait passer une.
 */
export function parseMarked(fragment: string | null | undefined): MarkedSegment[] | null {
  if (fragment === null || fragment === undefined || fragment === '') return null;
  const segments: MarkedSegment[] = [];
  const parts = fragment.split(/(<mark>|<\/mark>)/i);
  let mark = false;
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === '<mark>') {
      mark = true;
      continue;
    }
    if (lower === '</mark>') {
      mark = false;
      continue;
    }
    if (!part) continue;
    const text = decodeEntities(part);
    const last = segments.at(-1);
    if (last && last.mark === mark) last.text += text;
    else segments.push({ text, mark });
  }
  return segments.length > 0 ? segments : null;
}

/** Fin de phrase ou de citation : l'extrait n'a pas l'air coupé après. */
const CLOSED_END = /[.!?…»"”’)\]]$/u;
/** Début en minuscule : l'extrait commence au milieu d'une phrase. */
const OPEN_START = /^\p{Ll}/u;
/** Séparateur de fragments de ts_headline côté serveur (FragmentDelimiter par défaut). */
const FRAGMENT_DELIMITER = / \.\.\. /g;

/**
 * Points de suspension d'un extrait surligné par le plein texte (audit UX 07 : « Moment de
 * concentration agréable, sans » s'arrêtait net). Le contrat ne dit pas si l'extrait est tronqué
 * (seul l'extrait sans texte de recherche porte déjà son « … ») : on le déduit de la forme.
 * - « … » à la fin si le texte ne se termine pas par une ponctuation de fin ;
 * - « … » au début s'il commence par une minuscule (milieu de phrase) ;
 * - le séparateur « ... » entre deux fragments devient « … ».
 * Faux positif possible : un corps court sans ponctuation finale reçoit un « … » (sans perte).
 */
export function elideSnippet(segments: MarkedSegment[] | null): MarkedSegment[] | null {
  if (!segments || segments.length === 0) return segments;
  const out = segments.map((segment) => ({
    ...segment,
    text: segment.text.replace(FRAGMENT_DELIMITER, ' … '),
  }));
  const first = out[0];
  if (OPEN_START.test(first.text)) {
    if (first.mark) out.unshift({ text: '… ', mark: false });
    else first.text = `… ${first.text}`;
  }
  const last = out[out.length - 1];
  const trimmed = last.text.trimEnd();
  if (trimmed && !CLOSED_END.test(trimmed)) {
    if (last.mark) out.push({ text: ' …', mark: false });
    else last.text = `${trimmed} …`;
  }
  return out;
}

/** Texte brut d'un fragment découpé (aperçu, noms accessibles). */
export function plainText(segments: MarkedSegment[] | null): string {
  return segments?.map((segment) => segment.text).join('') ?? '';
}
