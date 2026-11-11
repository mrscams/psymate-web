import type { LineSeriesOption, ScatterSeriesOption } from 'echarts/charts';
import type { MarkLineComponentOption } from 'echarts/components';

import { overviewView } from '../data/overview.fixtures';
import { OverviewFeelings } from '../data/overview.model';
import {
  DOMINANT_EMOTIONS,
  dominantGroups,
  FEELINGS_TOKEN_NAMES,
  FeelingDatum,
  FeelingsChartLabels,
  feelingsChartOptions,
  groupByEmotion,
  readFeelingsTokens,
  seriesSymbol,
} from './feelings-chart.options';

/** Chaque token vaut « tok(--nom) » : on voit d'où vient chaque couleur. */
const tokens = readFeelingsTokens((name) => ` tok(${name}) `);

const labels: FeelingsChartLabels = {
  session: 'Séance',
  others: 'Autres émotions',
  medicationStart: 'Début de traitement',
  medicationEnd: 'Fin de traitement',
  day: (value) => String(value),
};

function options(feelings: OverviewFeelings = overviewView().feelings) {
  return feelingsChartOptions({ feelings, from: '2026-08-11', to: '2026-11-08' }, tokens, labels);
}

function series(option: ReturnType<typeof options>) {
  return option.series as (LineSeriesOption | ScatterSeriesOption)[];
}

describe('feelingsChartOptions (vrais ressentis → options ECharts)', () => {
  it('readFeelingsTokens : chaque token par son nom de variable CSS, sans espaces', () => {
    expect(tokens.session).toBe('tok(--entry-session)');
    expect(tokens.medication).toBe('tok(--entry-medication)');
    expect(tokens.unknown).toBe('tok(--feeling)');
    expect(tokens.emotions.sadness).toBe('tok(--emotion-sadness)');
    expect(Object.keys(FEELINGS_TOKEN_NAMES)).toContain('font');
  });

  it('une série par émotion, dans l’ordre du serveur : valeurs réelles, couleur de la famille, forme propre', () => {
    const [, anxiety, joy] = series(options()) as LineSeriesOption[];
    expect(anxiety).toMatchObject({
      id: 'emotion-anxiety',
      type: 'line',
      name: 'Anxiété',
      symbol: 'circle',
      lineStyle: { color: 'tok(--emotion-fear)' },
      itemStyle: { color: 'tok(--emotion-fear)' },
    });
    expect((anxiety.data as FeelingDatum[]).map((d) => [d.value, d.entryId])).toEqual([
      [['2026-10-20', 8], 'f-1'],
    ]);
    expect(joy).toMatchObject({ id: 'emotion-joy', symbol: 'diamond' });
    expect(joy.itemStyle?.color).toBe('tok(--emotion-joy)');
  });

  it('deux émotions d’une même famille : même couleur, formes différentes ; famille inconnue en --feeling', () => {
    const feelings: OverviewFeelings = {
      points: [
        {
          entryId: 'a',
          date: '2026-10-01',
          emotionCode: 'anxiety',
          family: 'fear',
          intensity: 4,
          sessionId: null,
        },
        {
          entryId: 'b',
          date: '2026-10-02',
          emotionCode: 'panic',
          family: 'fear',
          intensity: 6,
          sessionId: null,
        },
        {
          entryId: 'c',
          date: '2026-10-03',
          emotionCode: 'old',
          family: null,
          intensity: 2,
          sessionId: null,
        },
      ],
      series: [
        { emotionCode: 'anxiety', family: 'fear', label: 'Anxiété', count: 1 },
        { emotionCode: 'panic', family: 'fear', label: 'Panique', count: 1 },
      ],
      markers: [],
      ticks: [],
    };
    const [, first, second, unknown] = series(options(feelings)) as LineSeriesOption[];
    expect(first.itemStyle?.color).toBe(second.itemStyle?.color);
    expect(first.symbol).not.toBe(second.symbol);
    // Un code absent des séries garde sa série, libellé par son code.
    expect(unknown).toMatchObject({ name: 'old', itemStyle: { color: 'tok(--feeling)' } });
    expect(groupByEmotion(feelings).map((g) => g.series.emotionCode)).toEqual([
      'anxiety',
      'panic',
      'old',
    ]);
    expect(seriesSymbol(5)).toBe(seriesSymbol(0));
  });

  it('séances : traits sous l’axe en --entry-session ; médicaments : repères verticaux nommés', () => {
    const [sessions] = series(options()) as ScatterSeriesOption[];
    expect(sessions).toMatchObject({
      id: 'sessions',
      type: 'scatter',
      symbol: 'rect',
      symbolOffset: [0, 8],
      clip: false,
      itemStyle: { color: 'tok(--entry-session)' },
      data: [
        ['2026-10-10', 0],
        ['2026-10-17', 0],
      ],
    });
    const markLine = sessions.markLine as MarkLineComponentOption;
    expect(markLine.data).toEqual([
      expect.objectContaining({
        xAxis: '2026-09-12',
        name: 'Début de traitement · Sertraline 75 mg',
        lineStyle: expect.objectContaining({ color: 'tok(--entry-medication)' }),
      }),
    ]);
  });

  it('axes : intensité 0 à 10, temps sur la fenêtre du serveur ; valeur écrite sur le dernier point seulement', () => {
    const option = options();
    expect(option.yAxis).toMatchObject({ min: 0, max: 10 });
    expect(option.xAxis).toMatchObject({ type: 'time', min: '2026-08-11', max: '2026-11-08' });

    const many: OverviewFeelings = {
      ...overviewView().feelings,
      points: [4, 5, 7, 8].map((intensity, i) => ({
        entryId: `f-${i}`,
        date: `2026-10-0${i + 1}`,
        emotionCode: 'anxiety',
        family: 'fear' as const,
        intensity,
        sessionId: null,
      })),
    };
    const [, anxiety] = series(options(many)) as LineSeriesOption[];
    expect(anxiety.label?.show).toBe(false);
    const data = anxiety.data as FeelingDatum[];
    expect(data.map((d) => d.label?.show ?? false)).toEqual([false, false, false, true]);
    expect(data[3].symbolSize).toBe(11);
  });

  it('trois émotions dominantes en séries, les autres en une série grise « Autres » sans ligne', () => {
    const codes = ['anxiety', 'sadness', 'anger', 'joy', 'trust'];
    const feelings: OverviewFeelings = {
      points: codes.flatMap((code, i) =>
        Array.from({ length: 5 - i }, (_, j) => ({
          entryId: `${code}-${j}`,
          date: `2026-10-${String(10 + j).padStart(2, '0')}`,
          emotionCode: code,
          family: 'fear' as const,
          intensity: 5,
          sessionId: null,
        })),
      ),
      series: codes.map((code, i) => ({
        emotionCode: code,
        family: 'fear' as const,
        label: code,
        count: 5 - i,
      })),
      markers: [],
      ticks: [],
    };
    expect(DOMINANT_EMOTIONS).toBe(3);
    const groups = dominantGroups(feelings);
    expect(groups.dominant.map((g) => g.series.emotionCode)).toEqual([
      'anxiety',
      'sadness',
      'anger',
    ]);
    expect(groups.others.emotions).toBe(2);
    expect(groups.others.points).toHaveLength(3);

    const all = series(options(feelings));
    expect(all.map((s) => s.id)).toEqual([
      'sessions',
      'emotion-anxiety',
      'emotion-sadness',
      'emotion-anger',
      'others',
    ]);
    const others = all.at(-1) as ScatterSeriesOption;
    expect(others).toMatchObject({
      type: 'scatter',
      name: 'Autres émotions',
      itemStyle: { color: 'tok(--text-disabled)' },
    });
    expect((others.data as FeelingDatum[]).map((d) => d.emotion)).toEqual(['joy', 'trust', 'joy']);
  });

  it('infobulle : le texte du serveur est échappé', () => {
    const feelings = overviewView().feelings;
    const option = feelingsChartOptions(
      {
        feelings: { ...feelings, series: [{ ...feelings.series[0], label: 'Anxiété <b>' }] },
        from: null,
        to: null,
      },
      tokens,
      labels,
    );
    const [, anxiety] = series(option) as LineSeriesOption[];
    const formatter = (anxiety.tooltip as { formatter: (p: unknown) => string }).formatter;
    const datum = (anxiety.data as FeelingDatum[])[0];
    expect(formatter({ data: datum })).toBe('2026-10-20<br>Anxiété &lt;b&gt; · 8/10');
    // Sans bornes : celles des points.
    expect(option.xAxis).toMatchObject({ min: '2026-10-20', max: '2026-11-07' });
  });

  it('repère de médicament : le libellé du serveur n’est pas lu comme gabarit ECharts', () => {
    const feelings = overviewView().feelings;
    const marker = { ...feelings.markers[0], label: '{a} {b|gras} {@[1]}' };
    const [sessions] = series(options({ ...feelings, markers: [marker] })) as ScatterSeriesOption[];
    const [item] = (sessions.markLine as MarkLineComponentOption).data as {
      label: { formatter: unknown };
    }[];
    expect(typeof item.label.formatter).toBe('function');
    expect((item.label.formatter as () => string)()).toBe(
      'Début de traitement · {a} {b|gras} {@[1]}',
    );
  });
});
