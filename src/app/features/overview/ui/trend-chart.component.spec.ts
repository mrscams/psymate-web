import { TestBed } from '@angular/core/testing';

import { ThemeService } from '../../../core/theme';
import { overviewView } from '../data/overview.fixtures';
import { TREND_RENDERER, TrendChart, TrendChartComponent } from './trend-chart.component';
import { TrendChartLabels, TrendChartOption } from './trend-chart.options';

const labels: TrendChartLabels = {
  average: 'Intensité moyenne (7 jours)',
  session: 'Séance',
  medicationStart: 'Début',
  medicationEnd: 'Fin',
  family: (family) => family ?? 'Autre',
  emotion: (code) => code,
  day: (value) => String(value),
  intensity: (value) => String(value),
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function fakeChart() {
  let click: ((params: { seriesType?: string; data?: unknown }) => void) | null = null;
  const chart = {
    setOption: vi.fn<(option: TrendChartOption, opts?: { notMerge?: boolean }) => void>(),
    resize: vi.fn(),
    on: vi.fn((_: string, handler: typeof click) => (click = handler)),
    dispose: vi.fn(),
    click: (params: { seriesType?: string; data?: unknown }) => click?.(params),
  };
  return chart;
}

async function render(loader?: () => Promise<(el: HTMLElement) => TrendChart>) {
  const chart = fakeChart();
  const create = vi.fn(() => chart as TrendChart);
  TestBed.configureTestingModule({
    providers: [{ provide: TREND_RENDERER, useValue: loader ?? (() => Promise.resolve(create)) }],
  });
  const fixture = TestBed.createComponent(TrendChartComponent);
  const host = fixture.nativeElement as HTMLElement;
  // Couleurs nommées (jamais de valeur hexadécimale) posées sur l'hôte : la courbe lit ses tokens.
  host.style.setProperty('--feeling', 'purple');
  host.style.setProperty('--emotion-fear', 'indigo');
  const view = overviewView();
  fixture.componentRef.setInput('data', { trend: view.trend, feelings: view.feelings });
  fixture.componentRef.setInput('labels', labels);
  const selected: string[] = [];
  fixture.componentInstance.pointSelected.subscribe((id) => selected.push(id));
  fixture.detectChanges();
  await tick();
  await fixture.whenStable();
  return { fixture, host, chart, create, selected };
}

function lineColor(option: TrendChartOption): unknown {
  return (option.series as { lineStyle?: { color?: string } }[])[0].lineStyle?.color;
}

describe('TrendChartComponent', () => {
  it('crée la courbe dans son conteneur, options tirées des tokens CSS', async () => {
    const { chart, create } = await render();
    expect(create).toHaveBeenCalledTimes(1);
    expect(chart.setOption).toHaveBeenCalled();
    const [option, opts] = chart.setOption.mock.lastCall!;
    expect(opts).toEqual({ notMerge: true });
    expect(lineColor(option)).toBe('purple');
  });

  it('clic sur un point de ressenti : émet son entrée ; clic sur la courbe : rien', async () => {
    const { chart, selected } = await render();
    chart.click({ seriesType: 'scatter', data: { entryId: 'f-1' } });
    chart.click({ seriesType: 'line', data: ['2026-10-20', 5] });
    expect(selected).toEqual(['f-1']);
  });

  it('changement de thème : les tokens sont relus et les options reposées', async () => {
    const { fixture, host, chart } = await render();
    const calls = chart.setOption.mock.calls.length;
    host.style.setProperty('--feeling', 'plum');
    const theme = TestBed.inject(ThemeService);
    theme.set(theme.resolved() === 'dark' ? 'light' : 'dark');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(chart.setOption.mock.calls.length).toBeGreaterThan(calls);
    expect(lineColor(chart.setOption.mock.lastCall![0])).toBe('plum');
  });

  it('ECharts ne se charge pas : « Tendance indisponible »', async () => {
    const { host } = await render(() => Promise.reject(new Error('chunk')));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Tendance indisponible');
  });

  it('destruction : la courbe est libérée', async () => {
    const { fixture, chart } = await render();
    fixture.destroy();
    expect(chart.dispose).toHaveBeenCalled();
  });
});
