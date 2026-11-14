import type { LineSeriesOption, ScatterSeriesOption } from 'echarts/charts';
import type { MarkLineComponentOption } from 'echarts/components';

import { overviewView } from '../data/overview.fixtures';
import { OverviewView } from '../data/overview.model';
import {
  escapeHtml,
  FEELINGS_TOKEN_NAMES,
  FeelingDatum,
  FeelingsChartLabels,
  feelingsChartOptions,
  medicationText,
  readFeelingsTokens,
} from './feelings-chart.options';

/** Chaque token vaut « tok(--nom) » : on voit d'où vient chaque couleur. */
const tokens = readFeelingsTokens((name) => ` tok(${name}) `);

const labels: FeelingsChartLabels = {
  average: 'Moyenne sur 7 jours',
  session: 'Séance',
  medicationStart: 'Début de traitement',
  medicationEnd: 'Fin de traitement',
  emotion: (code) => ({ anxiety: 'Anxiété', joy: 'Joie' })[code] ?? code,
  day: (value) => String(value),
  intensity: (value) => String(value).replace('.', ','),
};

function options(view: OverviewView = overviewView()) {
  return feelingsChartOptions({ trend: view.trend, feelings: view.feelings }, tokens, labels);
}

function series(option: ReturnType<typeof options>, id: string) {
  const found = (option.series as (LineSeriesOption | ScatterSeriesOption)[]).find(
    (s) => s.id === id,
  );
  if (!found) throw new Error(`série introuvable : ${id}`);
  return found;
}

describe('feelingsChartOptions (moyenne 7 j, ressentis par famille, repères)', () => {
  it('readFeelingsTokens : chaque token par son nom de variable CSS, sans espaces', () => {
    expect(tokens.session).toBe('tok(--entry-session)');
    expect(tokens.medication).toBe('tok(--entry-medication)');
    expect(tokens.feeling).toBe('tok(--feeling)');
    expect(tokens.feelingTint).toBe('tok(--feeling-tint)');
    expect(tokens.emotions.sadness).toBe('tok(--emotion-sadness)');
    expect(Object.keys(FEELINGS_TOKEN_NAMES)).toContain('font');
  });

  it('ordre des séries : moyenne (dessous), séances, ressentis (dessus)', () => {
    expect((options().series as { id: string }[]).map((s) => s.id)).toEqual([
      'average',
      'sessions',
      'feelings',
    ]);
  });

  it('moyenne glissante sur 7 jours du serveur : courbe --feeling, aire --feeling-tint, trous gardés', () => {
    const average = series(options(), 'average') as LineSeriesOption;
    expect(average).toMatchObject({
      type: 'line',
      name: 'Moyenne sur 7 jours',
      showSymbol: false,
      connectNulls: false,
      lineStyle: { color: 'tok(--feeling)' },
      areaStyle: { color: 'tok(--feeling-tint)', opacity: 0.7 },
    });
    expect(average.data).toEqual([
      ['2026-10-20', 5.5],
      ['2026-10-21', null],
      ['2026-11-08', 7],
    ]);
    const tooltip = average.tooltip as { formatter: (p: unknown) => string };
    expect(tooltip.formatter({ value: ['2026-10-20', 5.5] })).toBe(
      '2026-10-20<br>Moyenne sur 7 jours : 5,5/10',
    );
  });

  it('ressentis : un point par entrée, couleur de sa famille ; le plus récent plus grand, valeur écrite', () => {
    const points = series(options(), 'feelings') as ScatterSeriesOption;
    const data = points.data as FeelingDatum[];
    expect(data.map((d) => [d.value, d.entryId, d.emotion])).toEqual([
      [['2026-10-20', 8], 'f-1', 'Anxiété'],
      [['2026-11-07', 4], 'f-2', 'Joie'],
    ]);
    expect(data[0].itemStyle).toEqual({ color: 'tok(--emotion-fear)' });
    expect(data[0].label).toBeUndefined();
    expect(data[1]).toMatchObject({
      itemStyle: {
        color: 'tok(--emotion-joy)',
        borderColor: 'tok(--surface-raised)',
        borderWidth: 2,
      },
      label: { show: true },
      symbolSize: 13,
    });
    expect(points.cursor).toBe('pointer');
  });

  it('émotion hors catalogue : couleur --feeling', () => {
    const view = overviewView();
    view.feelings = {
      ...view.feelings,
      points: [{ ...view.feelings.points[0], family: null }],
    };
    const data = series(options(view), 'feelings').data as FeelingDatum[];
    expect(data[0].itemStyle.color).toBe('tok(--feeling)');
  });

  it('séances : traits verts posés sur l’axe ; traitement : pointillé nommé « molécule · date »', () => {
    const sessions = series(options(), 'sessions') as ScatterSeriesOption;
    expect(sessions.itemStyle?.color).toBe('tok(--entry-session)');
    expect(sessions.data).toEqual([
      ['2026-10-10', 0],
      ['2026-10-17', 0],
    ]);
    const markLine = sessions.markLine as MarkLineComponentOption;
    const [line] = markLine.data as {
      xAxis: string;
      lineStyle: { color: string };
      label: { formatter: () => string; color: string };
    }[];
    expect(line.xAxis).toBe('2026-09-12');
    expect(line.lineStyle.color).toBe('tok(--entry-medication)');
    expect(line.label.color).toBe('tok(--entry-medication)');
    expect(line.label.formatter()).toBe('Sertraline 75 mg · 2026-09-12');
  });

  it('medicationText : début « molécule · date », fin préfixée, sans libellé « Début de traitement »', () => {
    const marker = overviewView().feelings.markers[0];
    expect(medicationText({ ...marker, change: 'end' }, labels)).toBe(
      'Fin de traitement · Sertraline 75 mg · 2026-09-12',
    );
    expect(medicationText({ ...marker, label: null }, labels)).toBe(
      'Début de traitement · 2026-09-12',
    );
  });

  it('axes : la fenêtre du serveur en x, 0 à 10 en y', () => {
    const option = options();
    expect(option.xAxis).toMatchObject({ type: 'time', min: '2026-10-20', max: '2026-11-08' });
    expect(option.yAxis).toMatchObject({ type: 'value', min: 0, max: 10, interval: 5 });
  });

  it('infobulles : le texte du serveur est échappé', () => {
    expect(escapeHtml('<b>"A" & \'B\'</b>')).toBe(
      '&lt;b&gt;&quot;A&quot; &amp; &#39;B&#39;&lt;/b&gt;',
    );
    const points = series(options(), 'feelings') as ScatterSeriesOption;
    const tooltip = points.tooltip as { formatter: (p: unknown) => string };
    expect(
      tooltip.formatter({ data: { value: ['2026-10-20', 8], emotion: '<i>Anxiété</i>' } }),
    ).toBe('2026-10-20<br>&lt;i&gt;Anxiété&lt;/i&gt; · 8/10');
  });
});
