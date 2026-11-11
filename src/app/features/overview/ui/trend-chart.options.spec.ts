import type { LineSeriesOption, ScatterSeriesOption } from 'echarts/charts';

import { overviewView } from '../data/overview.fixtures';
import {
  EMOTION_TOKEN_NAMES,
  escapeHtml,
  readTrendTokens,
  TREND_TOKEN_NAMES,
  TrendChartLabels,
  trendChartOptions,
  TrendMarkerDatum,
  TrendPointDatum,
} from './trend-chart.options';

/** Chaque token vaut « valeur-de(--nom) » : on voit d'où vient chaque couleur. */
const read = (name: string) => ` tok(${name}) `;
const tokens = readTrendTokens(read);

const labels: TrendChartLabels = {
  average: 'Intensité moyenne (7 jours)',
  feelings: 'Ressentis notés',
  session: 'Séance',
  medication: 'Changement de médicament',
  medicationStart: 'Début de traitement',
  medicationEnd: 'Fin de traitement',
  emotion: (code) => (code === 'anxiety' ? 'Anxiété <b>' : code),
  day: (value) => String(value),
  intensity: (value) => value.toFixed(1).replace('.', ','),
};

function options() {
  const view = overviewView();
  return trendChartOptions({ trend: view.trend, feelings: view.feelings }, tokens, labels);
}

function series(id: string) {
  const found = (options().series as (LineSeriesOption | ScatterSeriesOption)[]).find(
    (s) => s.id === id,
  );
  if (!found) throw new Error(`série introuvable : ${id}`);
  return found;
}

describe('trendChartOptions (tokens → options ECharts, maquette 02, UX-B4)', () => {
  it('readTrendTokens : lit chaque token par son nom de variable CSS, sans espaces', () => {
    expect(tokens.line).toBe('tok(--feeling)');
    expect(tokens.point).toBe('tok(--border-strong)');
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

  it('quatre séries : moyenne, ressentis, séances, médicaments ; une seule ligne tracée', () => {
    const all = options().series as (LineSeriesOption | ScatterSeriesOption)[];
    expect(all.map((s) => s.id)).toEqual(['average', 'feelings', 'sessions', 'medications']);
    expect(all.filter((s) => s.type === 'line')).toHaveLength(1);
  });

  it('moyenne glissante du serveur en --feeling, trous gardés, dernier point en rond creux', () => {
    const line = series('average') as LineSeriesOption;
    expect(line.lineStyle?.color).toBe('tok(--feeling)');
    expect(line.connectNulls).toBe(false);
    expect(line.showSymbol).toBe(false);
    expect(line).not.toHaveProperty('areaStyle');
    expect(line.data).toEqual([
      ['2026-10-20', 5.5],
      ['2026-10-21', null],
      {
        value: ['2026-11-08', 7],
        symbol: 'circle',
        symbolSize: 9,
        itemStyle: {
          color: 'tok(--surface-raised)',
          borderColor: 'tok(--feeling)',
          borderWidth: 2.5,
        },
      },
    ]);
  });

  it('ressentis : petits points gris clair, en --feeling au survol, cliquables (entrée)', () => {
    const points = series('feelings') as ScatterSeriesOption;
    expect(points.itemStyle?.color).toBe('tok(--border-strong)');
    expect(points.emphasis).toMatchObject({ itemStyle: { color: 'tok(--feeling)' } });
    expect(points.symbolSize).toBe(6);
    expect((points.data as TrendPointDatum[])[0]).toEqual({
      value: ['2026-10-20', 8],
      entryId: 'f-1',
      emotion: 'Anxiété <b>',
    });
  });

  it('aucune ligne verticale : ni markLine, séances en traits sous l’axe, médicaments en losanges', () => {
    const all = options().series as (LineSeriesOption | ScatterSeriesOption)[];
    expect(all.some((s) => 'markLine' in s)).toBe(false);

    const sessions = series('sessions') as ScatterSeriesOption;
    expect(sessions).toMatchObject({
      type: 'scatter',
      symbol: 'rect',
      symbolSize: [2, 6],
      symbolOffset: [0, 7],
      clip: false,
      itemStyle: { color: 'tok(--primary)' },
    });
    expect(sessions.data as TrendMarkerDatum[]).toEqual([
      { value: ['2026-10-17', 0], name: 'Séance' },
    ]);

    const medications = series('medications') as ScatterSeriesOption;
    expect(medications).toMatchObject({
      symbol: 'diamond',
      itemStyle: { color: 'tok(--entry-medication)' },
    });
    expect(medications.data as TrendMarkerDatum[]).toEqual([
      { value: ['2026-09-12', 0], name: 'Début de traitement · Sertraline 75 mg' },
    ]);
  });

  it('infobulles : date, émotion, intensité ; repère nommé ; texte du serveur échappé', () => {
    const points = series('feelings') as ScatterSeriesOption;
    const formatter = (points.tooltip as { formatter: (p: unknown) => string }).formatter;
    const datum = (points.data as TrendPointDatum[])[0];
    expect(formatter({ data: datum })).toBe('2026-10-20<br>Anxiété &lt;b&gt; · 8/10');

    const medications = series('medications') as ScatterSeriesOption;
    const marker = (medications.tooltip as { formatter: (p: unknown) => string }).formatter;
    expect(marker({ data: { value: ['2026-09-12', 0], name: '<i>x</i>' } })).toBe(
      '2026-09-12<br>&lt;i&gt;x&lt;/i&gt;',
    );
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
