// Options ECharts de la courbe de tendance (fiche 02 « Tendance », étude couleurs §4) : une fonction
// pure des données du serveur et des tokens CSS de src/theme/tokens.css, lus par getComputedStyle
// au démarrage et à chaque changement de thème. Aucune couleur écrite ici : seulement des noms de
// tokens. Types seulement depuis echarts : la bibliothèque reste dans son morceau, chargé à la demande.
import type { LineSeriesOption, ScatterSeriesOption } from 'echarts/charts';
import type {
  GridComponentOption,
  MarkLineComponentOption,
  TooltipComponentOption,
} from 'echarts/components';
import type { ComposeOption } from 'echarts/core';

import {
  EMOTION_FAMILIES,
  EmotionFamily,
  FeelingPoint,
  OverviewFeelings,
  OverviewTrend,
  TrendMarker,
} from '../data/overview.model';

export type TrendChartOption = ComposeOption<
  | LineSeriesOption
  | ScatterSeriesOption
  | GridComponentOption
  | TooltipComponentOption
  | MarkLineComponentOption
>;

/** Les tokens lus pour la courbe (noms de variables CSS de l'étude couleurs §8). */
export const TREND_TOKEN_NAMES = {
  surface: '--surface-raised',
  text: '--text-primary',
  textSecondary: '--text-secondary',
  grid: '--surface-sunken',
  axis: '--border-subtle',
  line: '--feeling',
  session: '--primary',
  medication: '--entry-medication',
  font: '--font-ui',
} as const;

/** Une couleur par famille d'émotions (étude couleurs §4) : --emotion-joy, --emotion-fear… */
export const EMOTION_TOKEN_NAMES: Record<EmotionFamily, string> = {
  joy: '--emotion-joy',
  trust: '--emotion-trust',
  fear: '--emotion-fear',
  surprise: '--emotion-surprise',
  sadness: '--emotion-sadness',
  disgust: '--emotion-disgust',
  anger: '--emotion-anger',
  anticipation: '--emotion-anticipation',
};

export type TrendTokens = Record<keyof typeof TREND_TOKEN_NAMES, string> & {
  emotions: Record<EmotionFamily, string>;
};

/** Lit les tokens avec `read(nom)` (getComputedStyle(el).getPropertyValue en vrai). */
export function readTrendTokens(read: (name: string) => string): TrendTokens {
  const base = {} as Record<keyof typeof TREND_TOKEN_NAMES, string>;
  for (const [key, name] of Object.entries(TREND_TOKEN_NAMES)) {
    base[key as keyof typeof TREND_TOKEN_NAMES] = read(name).trim();
  }
  const emotions = {} as Record<EmotionFamily, string>;
  for (const family of EMOTION_FAMILIES)
    emotions[family] = read(EMOTION_TOKEN_NAMES[family]).trim();
  return { ...base, emotions };
}

/** Textes de la courbe, déjà traduits par l'appelant ($localize). */
export interface TrendChartLabels {
  /** Nom de la courbe des moyennes (« Intensité moyenne sur 7 jours »). */
  average: string;
  session: string;
  medicationStart: string;
  medicationEnd: string;
  /** Nom d'une famille d'émotions (série de points). */
  family: (family: EmotionFamily | null) => string;
  /** Libellé d'une émotion par son code (séries du serveur). */
  emotion: (code: string) => string;
  /** Jour AAAA-MM-JJ ou horodatage de l'axe → texte court dans la locale. */
  day: (value: string | number) => string;
  /** Valeur sur 10 (« 4,5 »). */
  intensity: (value: number) => string;
}

export interface TrendChartData {
  trend: OverviewTrend;
  feelings: OverviewFeelings;
}

/** Point de ressenti tel qu'ECharts le rend au clic et au survol (params.data). */
export interface TrendPointDatum {
  value: [string, number];
  entryId: string;
  emotion: string;
}

const UNKNOWN = 'unknown';

/** Échappe un texte venu du serveur avant de le mettre dans l'infobulle HTML d'ECharts. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function markerName(marker: TrendMarker, labels: TrendChartLabels): string {
  if (marker.kind === 'session') return marker.label || labels.session;
  const change = marker.change === 'end' ? labels.medicationEnd : labels.medicationStart;
  return marker.label ? `${change} · ${marker.label}` : change;
}

/** Points groupés par famille, dans l'ordre des familles de l'étude (inconnue en dernier). */
function byFamily(points: readonly FeelingPoint[]): [EmotionFamily | null, FeelingPoint[]][] {
  const groups = new Map<string, FeelingPoint[]>();
  for (const point of points) {
    const key = point.family ?? UNKNOWN;
    groups.set(key, [...(groups.get(key) ?? []), point]);
  }
  const order = [...EMOTION_FAMILIES, UNKNOWN];
  return order
    .filter((key) => groups.has(key))
    .map((key) => [key === UNKNOWN ? null : (key as EmotionFamily), groups.get(key)!]);
}

/**
 * Courbe de tendance (fiche 02, B4 écran 2) :
 * - la moyenne glissante sur 7 jours du serveur, une ligne en `--feeling` (étude §4 : en V1, valence
 *   nulle, aucune aire sous la courbe) ;
 * - les ressentis réels, une série de points par famille présente, couleur `--emotion-<famille>` ;
 * - les repères verticaux : séances en `--primary` (tirets), médicaments en `--entry-medication`.
 * Axe y : intensité 0 à 10 ; axe x : temps, de la première date de la courbe à aujourd'hui.
 */
export function trendChartOptions(
  data: TrendChartData,
  tokens: TrendTokens,
  labels: TrendChartLabels,
): TrendChartOption {
  const points = data.trend.points;
  const first = points[0]?.date ?? data.feelings.points[0]?.date;
  const last = points[points.length - 1]?.date ?? data.feelings.points.at(-1)?.date;

  const markLine: MarkLineComponentOption = {
    silent: false,
    symbol: ['none', 'none'],
    label: { show: false },
    emphasis: { disabled: true },
    data: data.trend.markers.map((marker) => ({
      xAxis: marker.date,
      name: markerName(marker, labels),
      lineStyle: {
        color: marker.kind === 'session' ? tokens.session : tokens.medication,
        type: marker.kind === 'session' ? 'dashed' : 'solid',
        width: marker.kind === 'session' ? 1 : 2,
      },
    })),
    tooltip: {
      formatter: (params: unknown) => {
        const p = params as { name?: string; value?: string | number };
        const day = p.value !== undefined ? labels.day(p.value) : '';
        return `${escapeHtml(day)}<br>${escapeHtml(p.name ?? '')}`;
      },
    },
  };

  const average: LineSeriesOption = {
    id: 'average',
    type: 'line',
    name: labels.average,
    data: points.map((p) => [p.date, p.average]),
    showSymbol: false,
    connectNulls: false,
    smooth: false,
    z: 2,
    lineStyle: { color: tokens.line, width: 2.5 },
    itemStyle: { color: tokens.line },
    emphasis: { disabled: true },
    tooltip: {
      formatter: (params: unknown) => {
        const p = params as { value?: [string, number | null] };
        const [day, value] = p.value ?? ['', null];
        const text = value === null ? '—' : `${labels.intensity(value)}/10`;
        return `${escapeHtml(labels.day(day))}<br>${escapeHtml(labels.average)} : ${text}`;
      },
    },
    markLine,
  };

  const scatter: ScatterSeriesOption[] = byFamily(data.feelings.points).map(([family, list]) => {
    const color = family ? tokens.emotions[family] : tokens.line;
    return {
      id: `family-${family ?? UNKNOWN}`,
      type: 'scatter',
      name: labels.family(family),
      symbolSize: 9,
      z: 3,
      cursor: 'pointer',
      itemStyle: { color, borderColor: tokens.surface, borderWidth: 1 },
      data: list.map((point): TrendPointDatum => ({
        value: [point.date, point.intensity],
        entryId: point.entryId,
        emotion: labels.emotion(point.emotionCode),
      })),
      tooltip: {
        formatter: (params: unknown) => {
          const datum = (params as { data?: TrendPointDatum }).data;
          if (!datum) return '';
          const [day, intensity] = datum.value;
          return `${escapeHtml(labels.day(day))}<br>${escapeHtml(datum.emotion)} · ${intensity}/10`;
        },
      },
    };
  });

  return {
    animation: false,
    backgroundColor: 'transparent',
    textStyle: { fontFamily: tokens.font, color: tokens.textSecondary },
    grid: { left: 36, right: 16, top: 12, bottom: 28 },
    tooltip: {
      trigger: 'item',
      backgroundColor: tokens.surface,
      borderColor: tokens.axis,
      textStyle: { color: tokens.text, fontFamily: tokens.font, fontSize: 12 },
    },
    xAxis: {
      type: 'time',
      min: first,
      max: last,
      axisLine: { lineStyle: { color: tokens.axis } },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: {
        color: tokens.textSecondary,
        hideOverlap: true,
        formatter: (value: number) => labels.day(value),
      },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 10,
      interval: 5,
      axisLabel: { color: tokens.textSecondary },
      splitLine: { lineStyle: { color: tokens.grid, type: 'dashed' } },
    },
    series: [average, ...scatter],
  };
}
