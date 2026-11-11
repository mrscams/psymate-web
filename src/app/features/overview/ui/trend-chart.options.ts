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
  /** Ressentis individuels : points gris clair, en --feeling au survol. */
  point: '--border-strong',
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
  /** Nom des points de ressentis (« Ressentis notés »). */
  feelings: string;
  session: string;
  /** Nom de la série des repères de médicament (« Changement de médicament »). */
  medication: string;
  medicationStart: string;
  medicationEnd: string;
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

/** Échappe un texte venu du serveur avant de le mettre dans l'infobulle HTML d'ECharts. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function medicationName(marker: TrendMarker, labels: TrendChartLabels): string {
  const change = marker.change === 'end' ? labels.medicationEnd : labels.medicationStart;
  return marker.label ? `${change} · ${marker.label}` : change;
}

/** Dernier point qui porte une moyenne : il est marqué d'un rond creux (maquette 02). */
function lastAverageIndex(points: readonly { average: number | null }[]): number {
  for (let i = points.length - 1; i >= 0; i--) if (points[i].average !== null) return i;
  return -1;
}

/** Repère sous l'axe : jour du repère, à l'ordonnée 0 (le symbole est décalé vers le bas). */
export interface TrendMarkerDatum {
  value: [string, number];
  name: string;
}

/**
 * Courbe de tendance (fiche 02, maquette 02, UX-B4) :
 * - une seule série tracée : la moyenne glissante sur 7 jours du serveur, en `--feeling` (étude §4 :
 *   valence nulle en V1, aucune aire), le dernier point en rond creux ;
 * - les ressentis réels en petits points gris clair (`--border-strong`), en `--feeling` au survol ;
 *   un clic ouvre le ressenti ;
 * - les séances en traits courts `--primary` sous l'axe du temps, les changements de médicament en
 *   losanges `--entry-medication` sur l'axe : aucune ligne verticale à travers le graphe.
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
  const lastIndex = lastAverageIndex(points);

  const markerTooltip = {
    formatter: (params: unknown) => {
      const datum = (params as { data?: TrendMarkerDatum }).data;
      if (!datum) return '';
      return `${escapeHtml(labels.day(datum.value[0]))}<br>${escapeHtml(datum.name)}`;
    },
  };

  const average: LineSeriesOption = {
    id: 'average',
    type: 'line',
    name: labels.average,
    data: points.map((p, index) =>
      index === lastIndex
        ? {
            value: [p.date, p.average],
            symbol: 'circle',
            symbolSize: 9,
            itemStyle: { color: tokens.surface, borderColor: tokens.line, borderWidth: 2.5 },
          }
        : [p.date, p.average],
    ),
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
  };

  const feelings: ScatterSeriesOption = {
    id: 'feelings',
    type: 'scatter',
    name: labels.feelings,
    symbolSize: 6,
    z: 3,
    cursor: 'pointer',
    itemStyle: { color: tokens.point },
    emphasis: { scale: 1.6, itemStyle: { color: tokens.line } },
    data: data.feelings.points.map((point): TrendPointDatum => ({
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

  // Séances : traits de 6 px sous l'axe (décalés vers le bas, jamais rognés par la grille).
  const sessions: ScatterSeriesOption = {
    id: 'sessions',
    type: 'scatter',
    name: labels.session,
    symbol: 'rect',
    symbolSize: [2, 6],
    symbolOffset: [0, 7],
    clip: false,
    z: 4,
    itemStyle: { color: tokens.session },
    emphasis: { disabled: true },
    data: data.trend.markers
      .filter((m) => m.kind === 'session')
      .map((m): TrendMarkerDatum => ({ value: [m.date, 0], name: m.label || labels.session })),
    tooltip: markerTooltip,
  };

  // Médicaments : losanges posés sur l'axe.
  const medications: ScatterSeriesOption = {
    id: 'medications',
    type: 'scatter',
    name: labels.medication,
    symbol: 'diamond',
    symbolSize: 10,
    clip: false,
    z: 5,
    itemStyle: { color: tokens.medication, borderColor: tokens.surface, borderWidth: 1 },
    emphasis: { disabled: true },
    data: data.trend.markers
      .filter((m) => m.kind === 'medication')
      .map((m): TrendMarkerDatum => ({ value: [m.date, 0], name: medicationName(m, labels) })),
    tooltip: markerTooltip,
  };

  return {
    animation: false,
    backgroundColor: 'transparent',
    textStyle: { fontFamily: tokens.font, color: tokens.textSecondary },
    grid: { left: 28, right: 16, top: 12, bottom: 34 },
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
      axisLine: { onZero: false, lineStyle: { color: tokens.axis } },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: {
        color: tokens.textSecondary,
        fontSize: 11,
        margin: 16,
        hideOverlap: true,
        formatter: (value: number) => labels.day(value),
      },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 10,
      interval: 5,
      axisLabel: { color: tokens.textSecondary, fontSize: 11 },
      splitLine: { lineStyle: { color: tokens.grid, type: 'dashed' } },
    },
    series: [average, feelings, sessions, medications],
  };
}
