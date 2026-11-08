// Modèles de vue de features/timeline (handbook §2, couche 4 → 3) : ce que la chronologie dessine,
// préparé depuis les DTO par data/timeline.api.ts, et les calculs purs de l'écran (fenêtres,
// créneaux du défilement virtuel, bandes de situations, pastille « dit en séance du … »).

import { ApiProblem } from '../../../core/http';
import { EntryType } from '../../../shared/ui';
import { Occurred } from '../../../shared/util';

/** Familles d'émotions du catalogue (pastilles, jamais en aplat). */
export type EmotionFamily =
  'joy' | 'trust' | 'fear' | 'surprise' | 'sadness' | 'disgust' | 'anger' | 'anticipation';

export const EMOTION_FAMILIES: readonly EmotionFamily[] = [
  'joy',
  'trust',
  'fear',
  'surprise',
  'sadness',
  'disgust',
  'anger',
  'anticipation',
];

/** Une ligne de la chronologie (TimelineItemDto) : de quoi dessiner une carte sans l'entrée complète. */
export interface TimelineItem {
  id: string;
  type: EntryType;
  title: string | null;
  status: 'draft' | 'final';
  visibility: 'private' | 'clinical';
  /** Provenance, lecture seule (A11) : toujours practitioner en V1, gardée sans être dessinée. */
  authorType: string;
  occurred: Occurred;
  recordedAt: string | null;
  /** Séance de rattachement ; null pour une séance. */
  sessionId: string | null;
  emotion: { code: string; family: EmotionFamily | null } | null;
  intensity: number | null;
  tags: string[];
  linkCount: number;
  /** Situation sans fin, toujours en cours. */
  ongoing: boolean;
}

/** Comptes de toute la fenêtre filtrée (facets du contrat). */
export interface TimelineFacets {
  types: Record<string, number>;
  emotions: Record<string, number>;
  tags: Record<string, number>;
}

/** Une page de GET /api/patients/{id}/timeline. */
export interface TimelinePage {
  items: TimelineItem[];
  facets: TimelineFacets;
  ongoingSituations: TimelineItem[];
  nextCursor: string | null;
}

/** Ce que la chronologie demande (le reste des filtres, M3-03, s'y ajoutera). */
export interface TimelineQuery {
  /** Bornes de la plage, ISO 8601 UTC ; null = sans borne. */
  from: string | null;
  to: string | null;
  cursor: string | null;
  limit: number;
}

/** Granularité d'affichage (fiche 03 : jour, semaine, mois) ; `+` va vers le jour, `-` vers le mois. */
export type TimelineZoom = 'day' | 'week' | 'month';

export const ZOOM_LEVELS: readonly TimelineZoom[] = ['day', 'week', 'month'];

/** Hauteur fixe d'une ligne par granularité (défilement virtuel CDK à taille fixe). */
export const ROW_HEIGHT: Record<TimelineZoom, number> = { day: 128, week: 96, month: 60 };

/** Éléments par fenêtre : une requête = une fenêtre (limit maximal du contrat). */
export const WINDOW_SIZE = 200;

/** Jamais plus de trois fenêtres en mémoire (A6, fiche 03) : la précédente, la courante, la suivante. */
export const MAX_WINDOWS = 3;

/** Une fenêtre chargée (ou en cours, ou en échec) : la k-ième page du curseur keyset. */
export interface TimelineWindow {
  index: number;
  status: 'loading' | 'loaded' | 'error';
  items: TimelineItem[];
  problem: ApiProblem | null;
}

/** Ce que l'onglet range dans le PatientShellStore (rememberTab) pour le retrouver au retour (B2). */
export interface TimelineSnapshot {
  patientId: string;
  total: number;
  facets: TimelineFacets;
  ongoing: TimelineItem[];
  trail: (string | null)[];
  sizes: number[];
  lastIndex: number | null;
  windows: TimelineWindow[];
  zoom: TimelineZoom;
  anchor: number;
  sessions: Record<string, string>;
  emotionLabels: Record<string, string>;
  selectedId: string | null;
  /** Position exacte de défilement (px), rangée par la page ; reprise si le zoom n'a pas changé. */
  offset?: number;
}

// ---------------------------------------------------------------- fenêtres et créneaux

/** Nombre d'éléments de la fenêtre k : connu une fois chargée, WINDOW_SIZE sinon (borné par le total). */
export function windowSize(k: number, sizes: readonly number[], total: number): number {
  const known = sizes[k];
  if (known !== undefined) return known;
  return Math.max(0, Math.min(WINDOW_SIZE, total - windowOffset(k, sizes)));
}

/** Premier créneau (rang dans la liste entière) de la fenêtre k. */
export function windowOffset(k: number, sizes: readonly number[]): number {
  let offset = 0;
  for (let j = 0; j < k; j++) offset += sizes[j] ?? WINDOW_SIZE;
  return offset;
}

/** Fenêtre qui contient le créneau `slot`. */
export function windowOfSlot(slot: number, sizes: readonly number[]): number {
  let k = 0;
  let offset = 0;
  for (;;) {
    const size = sizes[k] ?? WINDOW_SIZE;
    if (slot < offset + size || size === 0) return k;
    offset += size;
    k++;
  }
}

/** Nombre de fenêtres d'une liste de `total` éléments. */
export function windowCount(total: number, sizes: readonly number[]): number {
  if (total <= 0) return 0;
  return windowOfSlot(total - 1, sizes) + 1;
}

/** Les fenêtres à garder autour de la courante : k-1, k, k+1 dans les bornes. */
export function neighbourhood(current: number, count: number): number[] {
  const wanted: number[] = [];
  for (let k = current - 1; k <= current + 1; k++) if (k >= 0 && k < count) wanted.push(k);
  return wanted;
}

// ---------------------------------------------------------------- dates

function time(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Jour calendaire d'un instant : dans le fuseau du praticien pour une date-heure exacte, en UTC
 * pour les autres précisions (leurs bornes sont des jours entiers UTC, shared/util/occurred).
 */
export function dayKey(iso: string | null | undefined, local: boolean): string | null {
  const ms = time(iso);
  if (ms === null) return null;
  const d = new Date(ms);
  return local
    ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    : `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
}

/** Clé de regroupement de l'axe selon la granularité (jour, semaine ISO commençant le lundi, mois). */
export function groupKey(item: TimelineItem, zoom: TimelineZoom): string | null {
  const ms = time(item.occurred.from);
  if (ms === null) return null;
  const local = (item.occurred.precision ?? 'exact') === 'exact';
  const d = new Date(ms);
  const year = local ? d.getFullYear() : d.getUTCFullYear();
  const month = local ? d.getMonth() : d.getUTCMonth();
  const date = local ? d.getDate() : d.getUTCDate();
  if (zoom === 'month') return `${year}-${month}`;
  if (zoom === 'day') return `${year}-${month}-${date}`;
  const weekday = ((local ? d.getDay() : d.getUTCDay()) + 6) % 7;
  const monday = new Date(Date.UTC(year, month, date - weekday));
  return `w${monday.getUTCFullYear()}-${monday.getUTCMonth()}-${monday.getUTCDate()}`;
}

/**
 * Pastille « dit en séance du … » (fiche 03) : l'entrée appartient à une séance dont le jour n'est
 * pas celui de son début d'occurrence. Renvoie la date de la séance, ou null (pas de pastille, ou
 * séance encore inconnue).
 */
export function saidInSession(
  item: TimelineItem,
  sessions: Readonly<Record<string, string>>,
): string | null {
  if (!item.sessionId || item.type === 'session') return null;
  const sessionFrom = sessions[item.sessionId];
  if (!sessionFrom) return null;
  const local = (item.occurred.precision ?? 'exact') === 'exact';
  const itemDay = dayKey(item.occurred.from, local);
  const sessionDay = dayKey(sessionFrom, local);
  if (!itemDay || !sessionDay || itemDay === sessionDay) return null;
  return sessionFrom;
}

/** L'élément commence avant le début du suivi : il va dans la zone « Avant le suivi ». */
export function isBeforeFollowUp(item: TimelineItem, followStart: string | null): boolean {
  const start = time(followStart);
  const from = time(item.occurred.from);
  return start !== null && from !== null && from < start;
}

// ---------------------------------------------------------------- bandes de situations

/** Une bande verticale : une situation de ongoingSituations, sur sa colonne. */
export interface SituationBand {
  item: TimelineItem;
  lane: number;
  from: number;
  /** Fin exclue ; +∞ pour une situation en cours. */
  to: number;
}

/** Colonnes de bandes au plus (au-delà, les bandes partagent la dernière). */
export const MAX_LANES = 4;

/**
 * Range les situations en colonnes sans chevauchement (glouton, de la plus ancienne à la plus
 * récente) : deux situations qui se recouvrent ne partagent jamais une colonne tant qu'il en reste.
 */
export function layoutBands(situations: readonly TimelineItem[]): SituationBand[] {
  const sorted = situations
    .map((item) => ({
      item,
      from: time(item.occurred.from) ?? Number.NEGATIVE_INFINITY,
      to: item.ongoing
        ? Number.POSITIVE_INFINITY
        : (time(item.occurred.to) ?? Number.POSITIVE_INFINITY),
    }))
    .sort((a, b) => a.from - b.from || a.item.id.localeCompare(b.item.id));
  const laneEnds: number[] = [];
  return sorted.map((band) => {
    let lane = laneEnds.findIndex((end) => end <= band.from);
    if (lane === -1) lane = laneEnds.length < MAX_LANES ? laneEnds.length : MAX_LANES - 1;
    laneEnds[lane] = Math.max(laneEnds[lane] ?? Number.NEGATIVE_INFINITY, band.to);
    return { ...band, lane };
  });
}

/** Les bandes qui traversent la ligne d'un élément commençant à `from` (couverture par colonne). */
export function bandsAt(
  bands: readonly SituationBand[],
  fromIso: string | null | undefined,
): boolean[] {
  const lanes = bands.length ? Math.max(...bands.map((band) => band.lane)) + 1 : 0;
  const covered = Array.from({ length: lanes }, () => false);
  const at = time(fromIso);
  if (at === null) return covered;
  for (const band of bands) if (at >= band.from && at < band.to) covered[band.lane] = true;
  return covered;
}

// ---------------------------------------------------------------- lignes du défilement

/** Une ligne du défilement virtuel : un créneau de la liste entière. */
export interface TimelineRow {
  slot: number;
  /** Élément du créneau, null tant que sa fenêtre n'est pas en mémoire. */
  item: TimelineItem | null;
  /** État de la fenêtre du créneau : chargée, en cours, en échec, ou pas encore demandée. */
  state: 'item' | 'loading' | 'error' | 'idle';
  window: number;
  /** Premier créneau de sa fenêtre (où s'affiche « Réessayer » en cas d'échec). */
  firstOfWindow: boolean;
  /** Premier élément de son groupe (jour, semaine, mois) : l'axe porte la date. */
  groupStart: boolean;
  /** Dans la zone « Avant le suivi ». */
  before: boolean;
  /** Premier élément de la zone : la ligne porte le marqueur « Début du suivi ». */
  firstBefore: boolean;
  /** Date de la séance quand la pastille « dit en séance du … » s'affiche. */
  saidIn: string | null;
  /** Colonnes de bandes qui traversent la ligne. */
  bands: boolean[];
  /** Colonnes dont la bande commence (côté récent) sur cette ligne : libellé et flèche. */
  bandHeads: (SituationBand | null)[];
}

export interface RowsInput {
  total: number;
  sizes: readonly number[];
  windows: readonly TimelineWindow[];
  zoom: TimelineZoom;
  sessions: Readonly<Record<string, string>>;
  followStart: string | null;
  bands: readonly SituationBand[];
}

/**
 * Les `total` lignes du défilement : une par créneau, remplies pour les fenêtres en mémoire. Le
 * nombre de lignes ne bouge pas quand une fenêtre arrive ou part (le total vient des facettes) :
 * la position de défilement reste stable.
 */
export function buildRows(input: RowsInput): TimelineRow[] {
  const { total, sizes, windows, zoom, sessions, followStart, bands } = input;
  const byIndex = new Map(windows.map((w) => [w.index, w]));
  const lanes = bands.length ? Math.max(...bands.map((band) => band.lane)) + 1 : 0;
  const empty = Array.from({ length: lanes }, () => false);
  const noHeads: (SituationBand | null)[] = Array.from({ length: lanes }, () => null);
  const rows: TimelineRow[] = new Array(total);
  const count = windowCount(total, sizes);
  let slot = 0;
  let previous: TimelineItem | null = null;
  let previousBands: boolean[] = empty;
  for (let k = 0; k < count && slot < total; k++) {
    const size = windowSize(k, sizes, total);
    const win = byIndex.get(k);
    for (let i = 0; i < size && slot < total; i++, slot++) {
      // Une fenêtre relue garde ses éléments affichés pendant la requête (rien ne clignote).
      const item = win ? (win.items[i] ?? null) : null;
      if (!item) {
        rows[slot] = {
          slot,
          item: null,
          state: win ? (win.status === 'loaded' ? 'idle' : win.status) : 'idle',
          window: k,
          firstOfWindow: i === 0,
          groupStart: false,
          before: false,
          firstBefore: false,
          saidIn: null,
          bands: empty,
          bandHeads: noHeads,
        };
        previous = null;
        previousBands = empty;
        continue;
      }
      const before = isBeforeFollowUp(item, followStart);
      const covered = lanes ? bandsAt(bands, item.occurred.from) : empty;
      const heads = lanes
        ? covered.map((on, lane) =>
            on && !previousBands[lane]
              ? (bands.find((band) => band.lane === lane && covers(band, item.occurred.from)) ??
                null)
              : null,
          )
        : noHeads;
      rows[slot] = {
        slot,
        item,
        state: 'item',
        window: k,
        firstOfWindow: i === 0,
        groupStart: !previous || groupKey(previous, zoom) !== groupKey(item, zoom),
        before,
        // Le marqueur ne se pose qu'une fois : au premier créneau, ou après un élément d'avant la
        // zone ; jamais après un créneau vide (fenêtre précédente hors mémoire).
        firstBefore:
          before && (slot === 0 || (previous !== null && !isBeforeFollowUp(previous, followStart))),
        saidIn: saidInSession(item, sessions),
        bands: covered,
        bandHeads: heads,
      };
      previous = item;
      previousBands = covered;
    }
  }
  return rows;
}

function covers(band: SituationBand, fromIso: string | null | undefined): boolean {
  const at = time(fromIso);
  return at !== null && at >= band.from && at < band.to;
}
