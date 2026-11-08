// Options ECharts du graphe « Comment évoluent les ressentis » de la vue simple (B8, M4-07) : les
// vrais ressentis (une valeur par point, une série par émotion), les repères de médicament et les
// jours de séance, tels que le serveur les donne (OverviewDto.feelings). Fonction pure des données et
// des tokens CSS (lus par getComputedStyle, relus au changement de thème) : aucune couleur écrite ici.
// Types seulement depuis echarts : la bibliothèque reste dans son morceau, chargé à la demande.
import type { LineSeriesOption, ScatterSeriesOption } from 'echarts/charts';
import type { MarkLineComponentOption } from 'echarts/components';

import {
  EMOTION_FAMILIES,
  EmotionFamily,
  FeelingPoint,
  FeelingSeries,
  OverviewFeelings,
  TrendMarker,
} from '../data/overview.model';
import { EMOTION_TOKEN_NAMES, escapeHtml, TrendChartOption } from './trend-chart.options';

/** Mêmes composants ECharts que la courbe de tendance (echarts-setup.ts). */
export type FeelingsChartOption = TrendChartOption;

/** Les tokens lus pour le graphe (noms de variables CSS de l'étude couleurs §8). */
export const FEELINGS_TOKEN_NAMES = {
  surface: '--surface-raised',
  text: '--text-primary',
  textSecondary: '--text-secondary',
  grid: '--surface-sunken',
  axis: '--border-subtle',
  /** Émotion dont la famille n'est plus au catalogue. */
  unknown: '--feeling',
  session: '--entry-session',
  medication: '--entry-medication',
  font: '--font-ui',
} as const;

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

/**
 * Forme des points de chaque série, dans l'ordre des séries : deux émotions de la même famille ont
 * la même couleur, la forme les distingue (jamais la couleur seule). Formes pleines seulement : les
 * formes « vides » d'ECharts se remplissent d'un blanc fixe, faux en thème sombre.
 */
export const SERIES_SYMBOLS = ['circle', 'diamond', 'triangle', 'rect', 'roundRect'] as const;
export type SeriesSymbol = (typeof SERIES_SYMBOLS)[number];

export function seriesSymbol(index: number): SeriesSymbol {
  return SERIES_SYMBOLS[index % SERIES_SYMBOLS.length];
}

/** Au-delà, les valeurs écrites au-dessus des points se chevaucheraient : seule l'infobulle reste. */
export const MAX_VALUE_LABELS = 40;

/** Textes du graphe, déjà traduits par l'appelant ($localize). */
export interface FeelingsChartLabels {
  session: string;
  medicationStart: string;
  medicationEnd: string;
  /** Jour AAAA-MM-JJ ou horodatage de l'axe → texte court dans la locale. */
  day: (value: string | number) => string;
}

export interface FeelingsChartData {
  feelings: OverviewFeelings;
  /** Bornes de l'axe du temps (la fenêtre du serveur), AAAA-MM-JJ ; null : celles des points. */
  from: string | null;
  to: string | null;
}

/** Point de ressenti tel qu'ECharts le rend au clic et au survol (params.data). */
export interface FeelingDatum {
  value: [string, number];
  entryId: string;
  emotion: string;
}

/** Une série par émotion : celles du serveur dans son ordre, puis un code absent des séries. */
export function groupByEmotion(
  feelings: OverviewFeelings,
): { series: FeelingSeries; points: FeelingPoint[] }[] {
  const groups = new Map<string, FeelingPoint[]>();
  for (const point of feelings.points) {
    groups.set(point.emotionCode, [...(groups.get(point.emotionCode) ?? []), point]);
  }
  const ordered: { series: FeelingSeries; points: FeelingPoint[] }[] = [];
  for (const series of feelings.series) {
    const points = groups.get(series.emotionCode);
    if (!points) continue;
    ordered.push({ series, points });
    groups.delete(series.emotionCode);
  }
  for (const [code, points] of groups) {
    const series = {
      emotionCode: code,
      family: points[0].family,
      label: code,
      count: points.length,
    };
    ordered.push({ series, points });
  }
  return ordered;
}

export function emotionColor(family: EmotionFamily | null, tokens: FeelingsTokens): string {
  return family ? tokens.emotions[family] : tokens.unknown;
}

function medicationName(marker: TrendMarker, labels: FeelingsChartLabels): string {
  const change = marker.change === 'end' ? labels.medicationEnd : labels.medicationStart;
  return marker.label ? `${change} · ${marker.label}` : change;
}

/**
 * Graphe à points réels (B8 : « vrais ressentis ») :
 * - une série par émotion (feelings.series), chaque point est un ressenti noté avec son intensité,
 *   reliés dans l'ordre du temps ; couleur `--emotion-<famille>`, forme par série ;
 * - les jours de séance (feelings.ticks), traits courts sur l'axe du temps en `--entry-session` ;
 * - les repères de médicament (feelings.markers), lignes verticales en `--entry-medication`.
 * Axe y : intensité 0 à 10 ; axe x : la fenêtre du serveur. Aucune moyenne, aucun calcul.
 */
export function feelingsChartOptions(
  data: FeelingsChartData,
  tokens: FeelingsTokens,
  labels: FeelingsChartLabels,
): FeelingsChartOption {
  const { feelings } = data;
  const showValues = feelings.points.length <= MAX_VALUE_LABELS;

  const emotions: LineSeriesOption[] = groupByEmotion(feelings).map(({ series, points }, index) => {
    const color = emotionColor(series.family, tokens);
    return {
      id: `emotion-${series.emotionCode}`,
      type: 'line',
      name: series.label,
      symbol: seriesSymbol(index),
      symbolSize: 9,
      showSymbol: true,
      showAllSymbol: true,
      smooth: false,
      z: 3,
      cursor: 'pointer',
      lineStyle: { color, width: 1.5, opacity: 0.6 },
      itemStyle: { color, borderColor: tokens.surface, borderWidth: 1 },
      emphasis: { disabled: true },
      label: {
        show: showValues,
        position: 'top',
        distance: 4,
        color: tokens.text,
        fontSize: 11,
        formatter: (params: unknown) => {
          const datum = (params as { data?: FeelingDatum }).data;
          return datum ? String(datum.value[1]) : '';
        },
      },
      data: points.map((point): FeelingDatum => ({
        value: [point.date, point.intensity],
        entryId: point.entryId,
        emotion: series.label,
      })),
      tooltip: {
        formatter: (params: unknown) => {
          const datum = (params as { data?: FeelingDatum }).data;
          if (!datum) return '';
          const [day, intensity] = datum.value;
          return `${escapeHtml(labels.day(day))}<br>${escapeHtml(datum.emotion)} · ${intensity}/10`;
        },
      },
    };
  });

  const markLine: MarkLineComponentOption = {
    silent: false,
    symbol: ['none', 'none'],
    emphasis: { disabled: true },
    data: feelings.markers
      .filter((marker) => marker.kind === 'medication')
      .map((marker) => ({
        xAxis: marker.date,
        name: medicationName(marker, labels),
        lineStyle: { color: tokens.medication, type: 'dashed', width: 1.5 },
        label: {
          show: true,
          position: 'insideEndTop',
          color: tokens.textSecondary,
          fontSize: 11,
          formatter: medicationName(marker, labels),
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

  // Séances : un trait court posé sur l'axe du temps ; porte aussi les repères de médicament.
  const sessions: ScatterSeriesOption = {
    id: 'sessions',
    type: 'scatter',
    name: labels.session,
    symbol: 'rect',
    symbolSize: [3, 10],
    z: 2,
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
    grid: { left: 36, right: 16, top: 24, bottom: 28 },
    tooltip: {
      trigger: 'item',
      backgroundColor: tokens.surface,
      borderColor: tokens.axis,
      textStyle: { color: tokens.text, fontFamily: tokens.font, fontSize: 12 },
    },
    xAxis: {
      type: 'time',
      min: data.from ?? feelings.points[0]?.date,
      max: data.to ?? feelings.points.at(-1)?.date,
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
    series: [sessions, ...emotions],
  };
}
