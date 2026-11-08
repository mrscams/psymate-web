// Géométrie de l'agrégat par mois (fiche 03, état C ; M3-04), en unités du viewBox du SVG : barres
// empilées par type, courbe d'intensité moyenne (axe droit 0–10), repères d'années, marqueur
// « début du suivi », bandes des situations longues, zones de double-clic. Calculs purs, sans
// couleur (classes CSS appuyées sur les tokens) ni texte (le composant les pose).

import { ENTRY_TYPES, EntryType } from '../../../shared/ui';
import {
  DecadeMonth,
  monthIndexOf,
  monthStart,
  Plage,
  plageMonthsOf,
  TimelinePeriod,
  visibleTotal,
} from '../data/timeline-decade.model';
import { layoutBands, TimelineItem } from '../data/timeline.model';

export const CHART_WIDTH = 1120;
const LEFT = 56;
const RIGHT = 1072;
const TOP = 28;
const BASE = 188;
const YEAR_Y = 206;
const BAND_TOP = 220;
const BAND_HEIGHT = 14;
const BAND_GAP = 6;
const MAX_BAR = 18;

/** Une situation est « longue » à partir d'un mois (ou tant qu'elle est en cours). */
export const LONG_SITUATION_DAYS = 30;

const DAY = 86_400_000;

export interface ChartSegment {
  type: EntryType;
  count: number;
  y: number;
  height: number;
}

export interface ChartMonth extends DecadeMonth {
  /** Début de la colonne du mois et sa largeur (zone de double-clic). */
  x: number;
  width: number;
  barX: number;
  barWidth: number;
  segments: ChartSegment[];
  /** Somme des types montrés. */
  total: number;
}

export interface ChartBand {
  item: TimelineItem;
  lane: number;
  x: number;
  width: number;
  y: number;
  /** Encore en cours : flèche à droite. */
  ongoing: boolean;
  /** La bande continue avant le début de la plage. */
  clippedStart: boolean;
  /** Libellé dans la bande (assez large), sinon à côté. */
  inside: boolean;
}

export interface DecadeChart {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  base: number;
  yearY: number;
  months: ChartMonth[];
  /** Graduations de l'axe gauche (nombre d'entrées par mois). */
  countTicks: { value: number; y: number }[];
  /** Graduations de l'axe droit (intensité 0–10), vides sans courbe. */
  intensityTicks: { value: number; y: number }[];
  years: { x: number; year: number }[];
  /** Tronçons de la courbe (mois consécutifs), au format de l'attribut `points`. */
  curve: string[];
  dots: { x: number; y: number; month: number }[];
  follow: { x: number; anchorEnd: boolean } | null;
  bands: ChartBand[];
}

export interface DecadeChartInput {
  plage: Plage;
  periods: readonly TimelinePeriod[];
  /** Types montrés (filtre de types, préférence médicaments). */
  types: readonly EntryType[];
  /** Courbe d'intensité montrée (ressentis parmi les types montrés). */
  intensity: boolean;
  situations: readonly TimelineItem[];
  followStart: string | null;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Plus petit maximum « rond » (1, 2, 4, 6, 8, 10 × 10^k) qui contient `max`. */
export function niceMax(max: number): number {
  if (max <= 1) return 1;
  const power = 10 ** Math.floor(Math.log10(max));
  for (const step of [1, 2, 4, 6, 8, 10]) {
    if (step * power >= max && (step * power) % 2 === 0) return step * power;
  }
  return 10 * power;
}

/** Rang fractionnaire du mois d'un instant (12,5 = milieu du mois de rang 12). */
function monthFloat(ms: number): number {
  const index = monthIndexOf(new Date(ms).toISOString()) ?? 0;
  const start = monthStart(index).getTime();
  const next = monthStart(index + 1).getTime();
  return index + (ms - start) / (next - start);
}

function isLong(item: TimelineItem): boolean {
  if (item.ongoing) return true;
  const from = Date.parse(item.occurred.from ?? '');
  const to = Date.parse(item.occurred.to ?? '');
  if (Number.isNaN(from)) return false;
  if (Number.isNaN(to)) return true;
  return to - from >= LONG_SITUATION_DAYS * DAY;
}

/** La géométrie de l'agrégat sur la plage. */
export function decadeChart(input: DecadeChartInput): DecadeChart {
  const { plage, periods, intensity, followStart } = input;
  const types = ENTRY_TYPES.filter((type) => input.types.includes(type));
  const base = plageMonthsOf(plage, periods);
  const n = base.length;
  const slot = (RIGHT - LEFT) / n;
  const barWidth = round(Math.max(1, Math.min(MAX_BAR, slot * 0.64)));
  const max = niceMax(
    Math.max(0, ...base.map((m) => (m.period ? visibleTotal(m.period, types) : 0))),
  );
  const unit = (BASE - TOP) / max;
  const xOf = (monthPosition: number) => round(LEFT + (monthPosition - plage.start) * slot);

  const months: ChartMonth[] = base.map((m, i) => {
    const x = round(LEFT + i * slot);
    let top = BASE;
    const segments: ChartSegment[] = [];
    for (const type of types) {
      const count = m.period?.counts[type] ?? 0;
      if (!count) continue;
      const height = count * unit;
      top -= height;
      segments.push({ type, count, y: round(top), height: round(height) });
    }
    return {
      ...m,
      x,
      width: round(slot),
      barX: round(x + (slot - barWidth) / 2),
      barWidth,
      segments,
      total: m.period ? visibleTotal(m.period, types) : 0,
    };
  });

  const countTicks = (max === 1 ? [0, 1] : [0, max / 2, max]).map((value) => ({
    value,
    y: round(BASE - value * unit),
  }));
  const yIntensity = (value: number) => round(BASE - (value / 10) * (BASE - TOP));
  const intensityTicks = intensity
    ? [0, 5, 10].map((value) => ({ value, y: yIntensity(value) }))
    : [];

  // Courbe : un tronçon par suite de mois consécutifs qui ont une intensité moyenne.
  const curve: string[] = [];
  const dots: DecadeChart['dots'] = [];
  if (intensity) {
    let run: string[] = [];
    for (const m of months) {
      const average = m.period?.averageIntensity ?? null;
      if (average === null) {
        if (run.length > 1) curve.push(run.join(' '));
        run = [];
        continue;
      }
      const x = round(m.x + m.width / 2);
      const y = yIntensity(Math.max(0, Math.min(10, average)));
      dots.push({ x, y, month: m.month });
      run.push(`${x},${y}`);
    }
    if (run.length > 1) curve.push(run.join(' '));
  }

  const years = months
    .filter((m) => m.month % 12 === 0)
    .map((m) => ({ x: m.x, year: m.month / 12 }));
  if (!years.length && months.length) {
    years.push({ x: months[0].x, year: Math.floor(months[0].month / 12) });
  }

  const followMonth = followStart ? Date.parse(followStart) : Number.NaN;
  let follow: DecadeChart['follow'] = null;
  if (!Number.isNaN(followMonth)) {
    const position = monthFloat(followMonth);
    if (position >= plage.start && position < plage.end + 1) {
      const x = xOf(position);
      follow = { x, anchorEnd: x > RIGHT - 220 };
    }
  }

  // Bandes : situations longues qui chevauchent la plage, rangées en colonnes sans chevauchement.
  const startMs = monthStart(plage.start).getTime();
  const endMs = monthStart(plage.end + 1).getTime();
  const bands: ChartBand[] = layoutBands(input.situations.filter(isLong))
    .filter((band) => band.from < endMs && band.to > startMs)
    .map((band) => {
      const from = Math.max(band.from, startMs);
      const to = Math.min(band.to, endMs);
      const x = xOf(monthFloat(from));
      const right = to >= endMs ? RIGHT : xOf(monthFloat(to));
      const width = round(Math.max(3, right - x));
      return {
        item: band.item,
        lane: band.lane,
        x,
        width,
        y: BAND_TOP + band.lane * (BAND_HEIGHT + BAND_GAP),
        ongoing: band.item.ongoing,
        clippedStart: band.from < startMs,
        inside: width >= 160,
      };
    });
  const lanes = bands.length ? Math.max(...bands.map((band) => band.lane)) + 1 : 0;

  return {
    width: CHART_WIDTH,
    height: lanes ? BAND_TOP + lanes * (BAND_HEIGHT + BAND_GAP) : BAND_TOP - 4,
    left: LEFT,
    right: RIGHT,
    top: TOP,
    base: BASE,
    yearY: YEAR_Y,
    months,
    countTicks,
    intensityTicks,
    years,
    curve,
    dots,
    follow,
    bands,
  };
}

/**
 * Tendance de l'intensité moyenne : le dernier tiers des mois qui en ont une comparé au premier
 * (écart d'au moins 0,5 point) ; null avec moins de deux mois.
 */
export function intensityTrend(periods: readonly TimelinePeriod[]): 'up' | 'down' | 'flat' | null {
  const values = periods.map((p) => p.averageIntensity).filter((v): v is number => v !== null);
  if (values.length < 2) return null;
  const third = Math.max(1, Math.floor(values.length / 3));
  const mean = (list: number[]) => list.reduce((a, b) => a + b, 0) / list.length;
  const delta = mean(values.slice(-third)) - mean(values.slice(0, third));
  if (delta >= 0.5) return 'up';
  if (delta <= -0.5) return 'down';
  return 'flat';
}
