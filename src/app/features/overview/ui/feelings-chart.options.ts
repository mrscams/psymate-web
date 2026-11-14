// Options ECharts du graphe « Comment évoluent les ressentis » de la vue d'ensemble (UX-S6,
// proposition 02-vue-ensemble) : la moyenne glissante sur 7 jours du serveur (courbe et aire), les
// vrais ressentis (un point par entrée, couleur de sa famille d'émotion), les jours de séance et
// les repères de traitement, tels que le serveur les donne (OverviewDto.trend et .feelings).
// Fonction pure des données et des tokens CSS (lus par getComputedStyle, relus au changement de
// thème) : aucune couleur écrite ici. Types seulement depuis echarts : la bibliothèque reste dans
// son morceau, chargé à la demande.
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

export type FeelingsChartOption = ComposeOption<
  | LineSeriesOption
  | ScatterSeriesOption
  | GridComponentOption
  | TooltipComponentOption
  | MarkLineComponentOption
>;

/** Les tokens lus pour le graphe (noms de variables CSS de l'étude couleurs §8). */
export const FEELINGS_TOKEN_NAMES = {
  surface: '--surface-raised',
  text: '--text-primary',
  textSecondary: '--text-secondary',
  axis: '--border-subtle',
  /** Courbe de la moyenne sur 7 jours, et émotion dont la famille n'est plus au catalogue. */
  feeling: '--feeling',
  /** Aire sous la courbe. */
  feelingTint: '--feeling-tint',
  session: '--entry-session',
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

export type FeelingsTokens = Record<keyof typeof FEELINGS_TOKEN_NAMES, string> & {
  emotions: Record<EmotionFamily, string>;
};

/** Lit les tokens avec `read(nom)` (getComputedStyle(el).getPropertyValue en vrai). */
export function readFeelingsTokens(read: (name: string) => string): FeelingsTokens {
  const base = {} as Record<keyof typeof FEELINGS_TOKEN_NAMES, string>;
  for (const [key, name] of Object.entries(FEELINGS_TOKEN_NAMES)) {
    base[key as keyof typeof FEELINGS_TOKEN_NAMES] = read(name).trim();
  }
  const emotions = {} as Record<EmotionFamily, string>;
  for (const family of EMOTION_FAMILIES) {
    emotions[family] = read(EMOTION_TOKEN_NAMES[family]).trim();
  }
  return { ...base, emotions };
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

/** Textes du graphe, déjà traduits par l'appelant ($localize). */
export interface FeelingsChartLabels {
  /** Nom de la courbe (« Moyenne sur 7 jours »), dans l'infobulle. */
  average: string;
  session: string;
  medicationStart: string;
  medicationEnd: string;
  /** Libellé d'une émotion par son code (séries du serveur). */
  emotion: (code: string) => string;
  /** Jour AAAA-MM-JJ ou horodatage de l'axe → texte court dans la locale (« 15 oct. »). */
  day: (value: string | number) => string;
  /** Valeur sur 10 (« 4,5 »). */
  intensity: (value: number) => string;
}

export interface FeelingsChartData {
  trend: OverviewTrend;
  feelings: OverviewFeelings;
}

/** Point de ressenti tel qu'ECharts le rend au clic et au survol (params.data). */
export interface FeelingDatum {
  value: [string, number];
  entryId: string;
  emotion: string;
  itemStyle: { color: string; borderColor?: string; borderWidth?: number };
  /** Dernier ressenti : sa valeur est écrite, le point un peu plus grand (maquette). */
  label?: { show: boolean };
  symbolSize?: number;
}

export function emotionColor(family: EmotionFamily | null, tokens: FeelingsTokens): string {
  return family ? tokens.emotions[family] : tokens.feeling;
}

/**
 * Libellé d'un repère de traitement, comme la maquette : « Mélatonine 2 mg · 15 oct. » pour un
 * début, « Fin de traitement · Mélatonine 2 mg · 3 nov. » pour une fin.
 */
export function medicationText(marker: TrendMarker, labels: FeelingsChartLabels): string {
  const day = labels.day(marker.date);
  if (marker.change === 'end') {
    return [labels.medicationEnd, marker.label, day].filter((p) => !!p).join(' · ');
  }
  return [marker.label ?? labels.medicationStart, day].join(' · ');
}

/** Index du ressenti le plus récent (dernier jour, puis dernier dans l'ordre du serveur). */
function lastFeelingIndex(feelings: OverviewFeelings): number {
  let index = -1;
  feelings.points.forEach((point, i) => {
    if (index < 0 || point.date >= feelings.points[index].date) index = i;
  });
  return index;
}

/**
 * Graphe de la vue d'ensemble (UX-S6, proposition 02) :
 * - la moyenne glissante sur 7 jours du serveur (trend.points), courbe `--feeling` et aire
 *   `--feeling-tint` ; aucune moyenne calculée ici ;
 * - chaque ressenti de la fenêtre, un point de la couleur de sa famille (`--emotion-<famille>`) ;
 *   le plus récent un peu plus grand, sa valeur écrite ; un clic ouvre le ressenti ;
 * - les jours de séance (feelings.ticks), traits verts `--entry-session` posés sur l'axe ;
 * - les repères de traitement (feelings.markers), pointillés `--entry-medication` nommés en haut.
 * Axe y : intensité 0 à 10 ; axe x : la fenêtre du serveur.
 */
export function feelingsChartOptions(
  data: FeelingsChartData,
  tokens: FeelingsTokens,
  labels: FeelingsChartLabels,
): FeelingsChartOption {
  const { trend, feelings } = data;
  const from = trend.points[0]?.date ?? feelings.points[0]?.date;
  const to = trend.points.at(-1)?.date ?? feelings.points.at(-1)?.date;
  const last = lastFeelingIndex(feelings);
  // Position d'un jour sur l'axe (0 à 1) : le libellé d'un repère proche du bord droit passe à
  // gauche de son trait, pour ne pas sortir du graphe.
  const start = from ? Date.parse(from) : NaN;
  const span = to && from ? Date.parse(to) - start : NaN;
  const nearRight = (day: string) => span > 0 && (Date.parse(day) - start) / span > 0.6;

  const average: LineSeriesOption = {
    id: 'average',
    type: 'line',
    name: labels.average,
    data: trend.points.map((p) => [p.date, p.average]),
    showSymbol: false,
    connectNulls: false,
    smooth: false,
    z: 2,
    lineStyle: { color: tokens.feeling, width: 2.2, join: 'round' },
    itemStyle: { color: tokens.feeling },
    areaStyle: { color: tokens.feelingTint, opacity: 0.7 },
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

  const points: ScatterSeriesOption = {
    id: 'feelings',
    type: 'scatter',
    symbol: 'circle',
    symbolSize: 9,
    z: 4,
    cursor: 'pointer',
    emphasis: { scale: 1.3 },
    label: {
      show: false,
      position: 'right',
      distance: 4,
      color: tokens.text,
      fontSize: 11.5,
      fontWeight: 600,
      formatter: (params: unknown) => {
        const datum = (params as { data?: FeelingDatum }).data;
        return datum ? String(datum.value[1]) : '';
      },
    },
    data: feelings.points.map((point, i): FeelingDatum => {
      const color = emotionColor(point.family, tokens);
      return {
        value: [point.date, point.intensity],
        entryId: point.entryId,
        emotion: labels.emotion(point.emotionCode),
        ...(i === last
          ? {
              itemStyle: { color, borderColor: tokens.surface, borderWidth: 2 },
              label: { show: true },
              symbolSize: 13,
            }
          : { itemStyle: { color } }),
      };
    }),
    tooltip: {
      formatter: (params: unknown) => {
        const datum = (params as { data?: FeelingDatum }).data;
        if (!datum) return '';
        const [day, intensity] = datum.value;
        return `${escapeHtml(labels.day(day))}<br>${escapeHtml(datum.emotion)} · ${intensity}/10`;
      },
    },
  };

  const markLine: MarkLineComponentOption = {
    silent: false,
    symbol: ['none', 'none'],
    emphasis: { disabled: true },
    data: feelings.markers
      .filter((marker) => marker.kind === 'medication')
      .map((marker) => ({
        xAxis: marker.date,
        name: medicationText(marker, labels),
        lineStyle: { color: tokens.medication, type: [4, 3], width: 1.5 },
        label: {
          show: true,
          position: 'insideEndTop',
          rotate: 0,
          align: nearRight(marker.date) ? 'right' : 'left',
          offset: [nearRight(marker.date) ? -6 : 6, 14],
          color: tokens.medication,
          fontSize: 11,
          // Fonction, pas chaîne : le texte du serveur n'est pas lu comme gabarit ECharts ({a}, {b|…}).
          formatter: () => medicationText(marker, labels),
        },
      })),
    tooltip: {
      formatter: (params: unknown) => escapeHtml((params as { name?: string }).name ?? ''),
    },
  };

  // Séances : un trait vertical de 12 px posé sur l'axe du temps (traits verts de la maquette) ;
  // la série porte aussi les repères de traitement.
  const sessions: ScatterSeriesOption = {
    id: 'sessions',
    type: 'scatter',
    name: labels.session,
    symbol: 'rect',
    symbolSize: [2, 12],
    symbolOffset: [0, -6],
    clip: false,
    z: 3,
    itemStyle: { color: tokens.session },
    emphasis: { disabled: true },
    data: feelings.ticks.map((day) => [day, 0]),
    tooltip: {
      formatter: (params: unknown) => {
        const value = (params as { value?: [string, number] }).value;
        const day = value ? labels.day(value[0]) : '';
        return `${escapeHtml(day)}<br>${escapeHtml(labels.session)}`;
      },
    },
    markLine,
  };

  return {
    animation: false,
    backgroundColor: 'transparent',
    textStyle: { fontFamily: tokens.font, color: tokens.textSecondary },
    grid: { left: 30, right: 20, top: 12, bottom: 30 },
    tooltip: {
      trigger: 'item',
      backgroundColor: tokens.surface,
      borderColor: tokens.axis,
      textStyle: { color: tokens.text, fontFamily: tokens.font, fontSize: 12 },
    },
    xAxis: {
      type: 'time',
      min: from,
      max: to,
      axisLine: { onZero: false, lineStyle: { color: tokens.axis } },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: {
        color: tokens.textSecondary,
        fontSize: 11,
        margin: 14,
        hideOverlap: true,
        formatter: (value: number) => labels.day(value),
      },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 10,
      interval: 5,
      axisLine: { show: false },
      axisLabel: { color: tokens.textSecondary, fontSize: 11 },
      splitLine: { lineStyle: { color: tokens.axis, type: [3, 4] } },
    },
    series: [average, sessions, points],
  };
}
