import type { LineSeriesOption, ScatterSeriesOption } from 'echarts/charts';
import type { MarkLineComponentOption } from 'echarts/components';

import { overviewView } from '../data/overview.fixtures';
import {
  EMOTION_TOKEN_NAMES,
  escapeHtml,
  readTrendTokens,
  TREND_TOKEN_NAMES,
  TrendChartLabels,
  trendChartOptions,
  TrendPointDatum,
} from './trend-chart.options';

/** Chaque token vaut « valeur-de(--nom) » : on voit d'où vient chaque couleur. */
const read = (name: string) => ` tok(${name}) `;
const tokens = readTrendTokens(read);

const labels: TrendChartLabels = {
  average: 'Intensité moyenne (7 jours)',
  session: 'Séance',
  medicationStart: 'Début de traitement',
  medicationEnd: 'Fin de traitement',
  family: (family) => family ?? 'Autre',
  emotion: (code) => (code === 'anxiety' ? 'Anxiété <b>' : code),
  day: (value) => String(value),
  intensity: (value) => value.toFixed(1).replace('.', ','),
};

function options() {
  const view = overviewView();
  return trendChartOptions({ trend: view.trend, feelings: view.feelings }, tokens, labels);
}

describe('trendChartOptions (tokens → options ECharts)', () => {
  it('readTrendTokens : lit chaque token par son nom de variable CSS, sans espaces', () => {
    expect(tokens.line).toBe('tok(--feeling)');
    expect(tokens.session).toBe('tok(--primary)');
    expect(tokens.medication).toBe('tok(--entry-medication)');
    expect(tokens.emotions.fear).toBe('tok(--emotion-fear)');
    expect(Object.keys(tokens.emotions)).toHaveLength(8);
    expect(Object.values(TREND_TOKEN_NAMES).every((n) => n.startsWith('--'))).toBe(true);
    expect(Object.values(EMOTION_TOKEN_NAMES).every((n) => n.startsWith('--emotion-'))).toBe(true);
  });

  it('axe y : intensité 0 à 10 ; axe x : temps, de la première date à aujourd’hui', () => {
    const o = options();
    expect(o.yAxis).toMatchObject({ type: 'value', min: 0, max: 10 });
    expect(o.xAxis).toMatchObject({ type: 'time', min: '2026-10-20', max: '2026-11-08' });
    expect(o['animation']).toBe(false);
  });

  it('courbe des moyennes du serveur en --feeling, trous gardés (connectNulls false)', () => {
    const series = o_series();
    const line = series[0] as LineSeriesOption;
    expect(line.type).toBe('line');
    expect(line.lineStyle?.color).toBe('tok(--feeling)');
    expect(line.connectNulls).toBe(false);
    expect(line.data).toEqual([
      ['2026-10-20', 5.5],
      ['2026-10-21', null],
      ['2026-11-08', 7],
    ]);
    expect(line).not.toHaveProperty('areaStyle');
  });

  it('une série de points par famille présente, couleur --emotion-<famille>', () => {
    const scatter = o_series().slice(1) as ScatterSeriesOption[];
    expect(scatter.map((s) => s.id)).toEqual(['family-joy', 'family-fear']);
    expect(scatter.map((s) => s.itemStyle?.color)).toEqual([
      'tok(--emotion-joy)',
      'tok(--emotion-fear)',
    ]);
    const datum = (scatter[1].data as TrendPointDatum[])[0];
    expect(datum).toEqual({ value: ['2026-10-20', 8], entryId: 'f-1', emotion: 'Anxiété <b>' });
  });

  it('famille inconnue : couleur de la courbe', () => {
    const view = overviewView();
    view.feelings.points[0].family = null;
    const o = trendChartOptions({ trend: view.trend, feelings: view.feelings }, tokens, labels);
    const ids = (o.series as ScatterSeriesOption[]).map((s) => s.id);
    expect(ids).toContain('family-unknown');
    const unknown = (o.series as ScatterSeriesOption[]).find((s) => s.id === 'family-unknown');
    expect(unknown?.itemStyle?.color).toBe('tok(--feeling)');
  });

  it('repères : séances en --primary (tirets), médicaments en --entry-medication', () => {
    const markLine = (o_series()[0] as LineSeriesOption).markLine as MarkLineComponentOption;
    const data = markLine.data as { xAxis: string; name: string; lineStyle: object }[];
    expect(data).toEqual([
      {
        xAxis: '2026-10-17',
        name: 'Séance',
        lineStyle: { color: 'tok(--primary)', type: 'dashed', width: 1 },
      },
      {
        xAxis: '2026-09-12',
        name: 'Début de traitement · Sertraline 75 mg',
        lineStyle: { color: 'tok(--entry-medication)', type: 'solid', width: 2 },
      },
    ]);
  });

  it('infobulle d’un point : date, émotion, intensité, texte du serveur échappé', () => {
    const scatter = o_series()[2] as ScatterSeriesOption;
    const formatter = (scatter.tooltip as { formatter: (p: unknown) => string }).formatter;
    const datum = (scatter.data as TrendPointDatum[])[0];
    expect(formatter({ data: datum })).toBe('2026-10-20<br>Anxiété &lt;b&gt; · 8/10');
  });

  it('escapeHtml', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });

  it('tokens d’un autre thème : les options suivent (relues au changement de thème)', () => {
    const dark = readTrendTokens((name) => (name === '--feeling' ? 'dark-feeling' : 'x'));
    const view = overviewView();
    const o = trendChartOptions({ trend: view.trend, feelings: view.feelings }, dark, labels);
    expect(((o.series as LineSeriesOption[])[0].lineStyle as { color: string }).color).toBe(
      'dark-feeling',
    );
  });
});

function o_series() {
  return options().series as (LineSeriesOption | ScatterSeriesOption)[];
}
