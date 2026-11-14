// Mise en page du flux chronologique (proposition 03, UX-S9) : les jours comme ancres, les séances
// comme séparateurs, les mois en petits intertitres. Calcul pur à partir des lignes du défilement
// (TimelineStore.rows) : ordre d'affichage, débuts de jour et de mois, hauteur de chaque ligne et
// décalages cumulés pour le défilement virtuel à hauteurs variables. Aucun texte ici.

import { SituationBand, TimelineItem, TimelineRow, TimelineZoom } from './timeline.model';

/**
 * Hauteurs (px) des blocs du flux, lues aussi par la feuille de style de la page (variables CSS
 * posées depuis ces valeurs) : le défilement virtuel les connaît avant le rendu.
 */
export const LAYOUT = {
  /** Espace sous chaque ligne (marge entre deux cartes, maquette `.card { margin: 8px 0 }`). */
  gap: 8,
  /** Carte d'une ligne (titre seul) : 10 + 22 + 10 + bordures. */
  card: 44,
  /** Carte de deux lignes (titre, puis tags, liens, « dit en séance du … »). */
  cardDetails: 66,
  /** Carte réduite (zoom « Mois », zone « Avant le suivi »). */
  cardCompact: 36,
  /** Séparateur de séance (maquette `.session-head`), marge haute comprise. */
  session: 50,
  /** Première ligne du compte rendu sous le séparateur. */
  sessionSummary: 26,
  /** Espace au-dessus d'un nouveau jour (colonne des dates). */
  dayGap: 12,
  /** En-tête de jour du téléphone (« JEUDI 12 · AUJOURD'HUI »), au-dessus des cartes. */
  dayHead: 32,
  /** Intertitre de mois (« NOVEMBRE 2026 »). */
  month: 34,
  /** Marqueur « Début du suivi » et titre de la zone « Avant le suivi ». */
  followStart: 48,
  /** Pied du flux (« Plus ancien : chargé en défilant · … »). */
  footer: 44,
} as const;

/** Ce que dessine une ligne : une carte, un séparateur de séance, un squelette, une erreur. */
export type LayoutKind = 'card' | 'session' | 'pending' | 'error';

/** Une ligne mise en page : la ligne du store, sa place et ce qui l'entoure. */
export interface LayoutRow {
  /** Ligne du store (créneau, élément, bandes, zone « Avant le suivi »…). */
  row: TimelineRow;
  /** Rang d'affichage (peut différer du créneau : la séance monte en tête de son jour). */
  index: number;
  kind: LayoutKind;
  /** Premier élément de son ancre (jour, semaine ou mois selon le zoom) : la date est écrite. */
  dayStart: boolean;
  /** L'ancre commence par une séance (« séance » sous la date). */
  daySession: boolean;
  /** Intertitre de mois au-dessus de la ligne (rang année × 12 + mois), ou null. */
  month: number | null;
  /** Carte de deux lignes. */
  details: boolean;
  /** Séparateur de séance avec la première ligne de son compte rendu. */
  summary: boolean;
  /** Dernière ligne : le pied du flux est dessous. */
  last: boolean;
  /** Espace au-dessus du contenu (intertitre, écart de jour, marqueur du suivi), en px. */
  top: number;
  /** Hauteur totale de la ligne, en px. */
  height: number;
  /** Colonnes dont la bande commence ici (ordre d'affichage) : hauteur de son libellé, en px. */
  bandSpans: number[];
}

export interface LayoutInput {
  rows: readonly TimelineRow[];
  zoom: TimelineZoom;
  /** Téléphone (sous 600 px) : en-têtes de jour au-dessus des cartes, ni colonne ni intertitres. */
  narrow: boolean;
  /** Séances dont le compte rendu est connu et non vide (TimelineSessionStore). */
  summaries: Readonly<Record<string, boolean>>;
}

export interface TimelineLayout {
  rows: LayoutRow[];
  /** Décalage du haut de chaque ligne ; `offsets[n]` = hauteur totale. */
  offsets: number[];
}

function time(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

interface DateParts {
  year: number;
  month: number;
  date: number;
  weekday: number;
}

/**
 * Jour calendaire d'un élément : dans le fuseau du praticien pour une date-heure exacte, en UTC
 * pour les autres précisions (leurs bornes sont des jours entiers UTC, shared/util/occurred).
 */
function parts(item: TimelineItem): DateParts | null {
  const ms = time(item.occurred.from);
  if (ms === null) return null;
  const d = new Date(ms);
  const local = (item.occurred.precision ?? 'exact') === 'exact';
  return local
    ? { year: d.getFullYear(), month: d.getMonth(), date: d.getDate(), weekday: d.getDay() }
    : {
        year: d.getUTCFullYear(),
        month: d.getUTCMonth(),
        date: d.getUTCDate(),
        weekday: d.getUTCDay(),
      };
}

/** Clé du jour calendaire d'un élément (null : date illisible). */
export function itemDay(item: TimelineItem): string | null {
  const p = parts(item);
  return p ? `${p.year}-${p.month}-${p.date}` : null;
}

/**
 * Ancre d'un élément selon le zoom : le jour (« Jeudi 12 »), la semaine du lundi, ou le mois. Une
 * date moins précise que le zoom garde sa propre ancre : un mois reste un mois, une année une
 * année, une période ou une phase de vie son libellé et ses bornes.
 */
export function anchorKey(item: TimelineItem, zoom: TimelineZoom): string | null {
  const p = parts(item);
  if (!p) return null;
  const precision = item.occurred.precision ?? 'exact';
  if (precision === 'period' || precision === 'life_phase')
    return `${precision}:${item.occurred.from}|${item.occurred.to ?? ''}|${item.occurred.label ?? ''}`;
  if (precision === 'year') return `year:${p.year}`;
  if (precision === 'month' || zoom === 'month') return `month:${p.year}-${p.month}`;
  if (zoom === 'day') return `day:${p.year}-${p.month}-${p.date}`;
  const monday = new Date(Date.UTC(p.year, p.month, p.date - ((p.weekday + 6) % 7)));
  return `week:${monday.getUTCFullYear()}-${monday.getUTCMonth()}-${monday.getUTCDate()}`;
}

/**
 * Mois d'un élément pour les intertitres (rang année × 12 + mois), null pour une année, une
 * période ou une phase de vie (elles n'appartiennent à aucun mois).
 */
export function monthIndex(item: TimelineItem): number | null {
  const precision = item.occurred.precision ?? 'exact';
  if (precision === 'year' || precision === 'period' || precision === 'life_phase') return null;
  const p = parts(item);
  return p ? p.year * 12 + p.month : null;
}

/**
 * Ordre d'affichage : la séance monte en tête de son jour (maquette 03 : le séparateur précède les
 * entrées notées pendant la séance, plus récentes qu'elle). Seuls des éléments chargés et contigus
 * du même jour sont permutés ; le nombre de lignes et les créneaux vides ne bougent pas.
 */
export function sessionsFirst(rows: readonly TimelineRow[]): TimelineRow[] {
  const out = [...rows];
  let start = 0;
  while (start < out.length) {
    const first = out[start];
    const day = first?.item ? itemDay(first.item) : null;
    let end = start + 1;
    if (day !== null) {
      while (end < out.length) {
        const next = out[end]?.item;
        if (!next || itemDay(next) !== day) break;
        end++;
      }
      if (end - start > 1) {
        const run = out.slice(start, end);
        const sessions = run.filter((row) => row.item?.type === 'session');
        if (sessions.length && run[0].item?.type !== 'session') {
          const others = run.filter((row) => row.item?.type !== 'session');
          out.splice(start, end - start, ...sessions, ...others);
        }
      }
    }
    start = end;
  }
  return out;
}

function kindOf(row: TimelineRow): LayoutKind {
  if (row.item) return row.item.type === 'session' ? 'session' : 'card';
  return row.state === 'error' ? 'error' : 'pending';
}

/** La carte a une seconde ligne : tags, liens, émotion d'un ressenti titré, « dit en séance ». */
export function hasDetails(row: TimelineRow, zoom: TimelineZoom): boolean {
  const item = row.item;
  if (!item || item.type === 'session' || zoom === 'month' || row.before) return false;
  return (
    item.tags.length > 0 ||
    item.linkCount > 0 ||
    row.saidIn !== null ||
    (item.type === 'feeling' && !!item.title && !!item.emotion)
  );
}

/**
 * Met en page les lignes du défilement : ordre (séances en tête de jour), débuts d'ancre et de
 * mois, hauteur de chaque ligne, décalages cumulés, longueur du libellé de chaque bande.
 */
export function layoutTimeline(input: LayoutInput): TimelineLayout {
  const { zoom, narrow, summaries } = input;
  const ordered = sessionsFirst(input.rows);
  const n = ordered.length;
  const rows: LayoutRow[] = new Array(n);
  const offsets: number[] = new Array(n + 1);
  offsets[0] = 0;
  let previous: TimelineItem | null = null;
  let previousMonth: number | null = null;
  for (let i = 0; i < n; i++) {
    const row = ordered[i];
    const kind = kindOf(row);
    const item = row.item;
    const anchor = item ? anchorKey(item, zoom) : null;
    const dayStart = !!item && (!previous || anchorKey(previous, zoom) !== anchor);
    const month = item ? monthIndex(item) : null;
    const monthStart =
      !narrow &&
      zoom !== 'month' &&
      month !== null &&
      (previous === null || month !== previousMonth);
    const details = hasDetails(row, zoom);
    const summary = kind === 'session' && zoom !== 'month' && !!item && summaries[item.id] === true;
    let top = 0;
    if (row.firstBefore) top += LAYOUT.followStart;
    if (monthStart) top += LAYOUT.month;
    if (dayStart) {
      if (narrow) top += LAYOUT.dayHead;
      else if (i > 0 && !monthStart && !row.firstBefore) top += LAYOUT.dayGap;
    }
    let body: number;
    switch (kind) {
      case 'session':
        body = LAYOUT.session + (summary ? LAYOUT.sessionSummary : 0);
        break;
      case 'card':
        body =
          (zoom === 'month' || row.before
            ? LAYOUT.cardCompact
            : details
              ? LAYOUT.cardDetails
              : LAYOUT.card) + LAYOUT.gap;
        break;
      default:
        body = LAYOUT.card + LAYOUT.gap;
    }
    const last = i === n - 1;
    const height = top + body + (last ? LAYOUT.footer : 0);
    rows[i] = {
      row,
      index: i,
      kind,
      dayStart,
      daySession: dayStart && kind === 'session',
      month: monthStart ? month : null,
      details,
      summary,
      last,
      top,
      height,
      bandSpans: [],
    };
    offsets[i + 1] = offsets[i] + height;
    if (item) {
      previous = item;
      if (month !== null) previousMonth = month;
    } else {
      // Un créneau vide (fenêtre hors mémoire) coupe le fil : le jour suivant réécrit sa date.
      previous = null;
      previousMonth = null;
    }
  }
  placeBandHeads(rows, offsets);
  return { rows, offsets };
}

/**
 * Têtes de bande dans l'ordre d'affichage : la colonne commence sur la première ligne couverte
 * après une ligne qui ne l'est pas ; son libellé vertical prend la hauteur de la suite couverte.
 */
function placeBandHeads(rows: LayoutRow[], offsets: readonly number[]): void {
  const lanes = rows.reduce((max, r) => Math.max(max, r.row.bands.length), 0);
  if (!lanes) return;
  const runEnd: number[] = Array.from({ length: lanes }, () => rows.length);
  // De bas en haut : fin (exclue) de la suite couverte qui commence à chaque ligne.
  const ends: number[][] = new Array(rows.length);
  for (let i = rows.length - 1; i >= 0; i--) {
    const bands = rows[i].row.bands;
    ends[i] = [];
    for (let lane = 0; lane < lanes; lane++) {
      if (!bands[lane]) runEnd[lane] = i;
      ends[i][lane] = runEnd[lane];
    }
  }
  for (let i = 0; i < rows.length; i++) {
    const bands = rows[i].row.bands;
    const before = i > 0 ? rows[i - 1].row.bands : [];
    rows[i].bandSpans = Array.from({ length: lanes }, (_, lane) =>
      bands[lane] && !before[lane] ? offsets[ends[i][lane]] - offsets[i] : 0,
    );
  }
}

/** Rang d'affichage d'un créneau (la permutation ne touche que des lignes du même jour). */
export function indexOfSlot(layout: TimelineLayout, slot: number): number {
  const rows = layout.rows;
  const guess = rows[slot];
  if (guess?.row.slot === slot) return slot;
  for (let d = 1; d < rows.length; d++) {
    if (rows[slot - d]?.row.slot === slot) return slot - d;
    if (rows[slot + d]?.row.slot === slot) return slot + d;
  }
  return Math.min(slot, Math.max(0, rows.length - 1));
}

/** Rang de la ligne qui contient le décalage `offset` (recherche dichotomique). */
export function indexAtOffset(offsets: readonly number[], offset: number): number {
  const n = offsets.length - 1;
  if (n <= 0) return 0;
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (offsets[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Bande d'une colonne qui commence sur une ligne (libellé et flèche), dans l'ordre d'affichage. */
export function bandHeadAt(
  bands: readonly SituationBand[],
  row: TimelineRow,
  lane: number,
): SituationBand | null {
  const at = time(row.item?.occurred.from);
  if (at === null) return null;
  return bands.find((band) => band.lane === lane && at >= band.from && at < band.to) ?? null;
}
