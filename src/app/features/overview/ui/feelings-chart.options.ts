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
  /** Points des émotions regroupées en « Autres ». */
  others: '--text-disabled',
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

/**
 * Émotions tracées chacune en série (UX-B5, maquette 02b) : les plus notées ; les suivantes sont
 * regroupées en une seule série grise « Autres ». La légende garde ainsi quatre éléments au plus.
 */
export const DOMINANT_EMOTIONS = 3;

/** Textes du graphe, déjà traduits par l'appelant ($localize). */
export interface FeelingsChartLabels {
  session: string;
  /** Nom de la série grise des autres émotions (« Autres émotions »). */
  others: string;
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
  /** Dernier point d'une série : sa valeur est écrite, le point un peu plus grand. */
  label?: { show: boolean };
  symbolSize?: number;
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

/** Groupes d'émotions du graphe : les dominantes, chacune sa série, puis toutes les autres. */
export interface DominantGroups {
  dominant: { series: FeelingSeries; points: FeelingPoint[] }[];
  /** Ressentis des autres émotions (plus anciens d'abord), et le nombre de ces émotions. */
  others: { points: FeelingPoint[]; emotions: number; labels: Map<string, string> };
}

/**
 * Les `max` émotions les plus notées (ordre du serveur : nombre de ressentis décroissant), puis les
 * autres regroupées. Aucun ressenti n'est retiré : chaque point reste sur le graphe.
 */
export function dominantGroups(
  feelings: OverviewFeelings,
  max: number = DOMINANT_EMOTIONS,
): DominantGroups {
  const groups = groupByEmotion(feelings);
  const rest = groups.slice(max);
  return {
    dominant: groups.slice(0, max),
    others: {
      points: rest.flatMap((g) => g.points).sort((a, b) => a.date.localeCompare(b.date)),
      emotions: rest.length,
      labels: new Map(rest.map((g) => [g.series.emotionCode, g.series.label])),
    },
  };
}

export function emotionColor(family: EmotionFamily | null, tokens: FeelingsTokens): string {
  return family ? tokens.emotions[family] : tokens.unknown;
}

function medicationName(marker: TrendMarker, labels: FeelingsChartLabels): string {
  const change = marker.change === 'end' ? labels.medicationEnd : labels.medicationStart;
  return marker.label ? `${change} · ${marker.label}` : change;
}

/**
 * Graphe à points réels (B8 : « vrais ressentis » ; UX-B5, maquette 02b) :
 * - les trois émotions les plus notées, une série chacune : chaque point est un ressenti noté avec
 *   son intensité, reliés dans l'ordre du temps ; couleur `--emotion-<famille>`, forme par série ;
 *   la valeur n'est écrite que sur le dernier point de chaque série ;
 * - les autres émotions, une seule série de points gris (`--text-disabled`), sans ligne ;
 * - les jours de séance (feelings.ticks), traits courts sous l'axe du temps en `--entry-session` ;
 * - les repères de médicament (feelings.markers), lignes verticales en `--entry-medication`.
 * Axe y : intensité 0 à 10 ; axe x : la fenêtre du serveur. Aucune moyenne, aucun calcul.
 */
export function feelingsChartOptions(
  data: FeelingsChartData,
  tokens: FeelingsTokens,
  labels: FeelingsChartLabels,
): FeelingsChartOption {
  const { feelings } = data;
  const { dominant, others } = dominantGroups(feelings);

  const emotions: LineSeriesOption[] = dominant.map(({ series, points }, index) => {
    const color = emotionColor(series.family, tokens);
    const lastIndex = points.length - 1;
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
      // Valeur écrite sur le dernier point seulement (« … → 8/10 ») ; les autres dans l'infobulle.
      label: {
        show: false,
        position: 'top',
        distance: 4,
        color: tokens.text,
        fontSize: 11,
        fontWeight: 600,
        formatter: (params: unknown) => {
          const datum = (params as { data?: FeelingDatum }).data;
          return datum ? String(datum.value[1]) : '';
        },
      },
      data: points.map((point, i): FeelingDatum => ({
        value: [point.date, point.intensity],
        entryId: point.entryId,
        emotion: series.label,
        ...(i === lastIndex ? { label: { show: true }, symbolSize: 11 } : {}),
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
          position: 'end',
          color: tokens.textSecondary,
          fontSize: 11,
          // Fonction, pas chaîne : le texte du serveur n'est pas lu comme gabarit ECharts ({a}, {b|…}).
          formatter: () => medicationName(marker, labels),
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

  // Autres émotions : points gris, sans ligne ni valeur ; l'infobulle nomme l'émotion.
  const rest: ScatterSeriesOption[] = others.points.length
    ? [
        {
          id: 'others',
          type: 'scatter',
          name: labels.others,
          symbol: 'circle',
          symbolSize: 7,
          z: 2,
          cursor: 'pointer',
          itemStyle: { color: tokens.others, borderColor: tokens.surface, borderWidth: 1 },
          emphasis: { disabled: true },
          data: others.points.map((point): FeelingDatum => ({
            value: [point.date, point.intensity],
            entryId: point.entryId,
            emotion: others.labels.get(point.emotionCode) ?? point.emotionCode,
          })),
          tooltip: {
            formatter: (params: unknown) => {
              const datum = (params as { data?: FeelingDatum }).data;
              if (!datum) return '';
              const [day, intensity] = datum.value;
              return `${escapeHtml(labels.day(day))}<br>${escapeHtml(datum.emotion)} · ${intensity}/10`;
            },
          },
        },
      ]
    : [];

  // Séances : un trait court sous l'axe du temps (jamais à travers le graphe) ; porte aussi les
  // repères de médicament.
  const sessions: ScatterSeriesOption = {
    id: 'sessions',
    type: 'scatter',
    name: labels.session,
    symbol: 'rect',
    symbolSize: [3, 8],
    symbolOffset: [0, 8],
    clip: false,
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
    grid: { left: 36, right: 24, top: 30, bottom: 36 },
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
      axisLine: { onZero: false, lineStyle: { color: tokens.axis } },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: {
        color: tokens.textSecondary,
        fontSize: 11,
        margin: 18,
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
    series: [sessions, ...emotions, ...rest],
  };
}
