import { TestBed } from '@angular/core/testing';

import { ThemeService } from '../../../core/theme';
import { overviewView } from '../data/overview.fixtures';
import { TREND_RENDERER, TrendChart } from './chart-host';
import { FeelingsChartComponent } from './feelings-chart.component';
import { FeelingsChartLabels, FeelingsChartOption } from './feelings-chart.options';

const labels: FeelingsChartLabels = {
  average: 'Moyenne sur 7 jours',
  session: 'Séance',
  medicationStart: 'Début',
  medicationEnd: 'Fin',
  emotion: (code) => code,
  day: (value) => String(value),
  intensity: (value) => String(value),
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function fakeChart() {
  let click: ((params: { seriesType?: string; data?: unknown }) => void) | null = null;
  return {
    setOption: vi.fn<(option: FeelingsChartOption, opts?: { notMerge?: boolean }) => void>(),
    resize: vi.fn(),
    on: vi.fn((_: string, handler: typeof click) => (click = handler)),
    dispose: vi.fn(),
    click: (params: { seriesType?: string; data?: unknown }) => click?.(params),
  };
}

async function render(loader?: () => Promise<(el: HTMLElement) => TrendChart>) {
  const chart = fakeChart();
  const create = vi.fn(() => chart as TrendChart);
  TestBed.configureTestingModule({
    providers: [{ provide: TREND_RENDERER, useValue: loader ?? (() => Promise.resolve(create)) }],
  });
  const fixture = TestBed.createComponent(FeelingsChartComponent);
  const host = fixture.nativeElement as HTMLElement;
  // Couleurs nommées (jamais de valeur hexadécimale) posées sur l'hôte : le graphe lit ses tokens.
  host.style.setProperty('--emotion-fear', 'indigo');
  host.style.setProperty('--entry-session', 'teal');
  host.style.setProperty('--feeling', 'violet');
  fixture.componentRef.setInput('data', {
    trend: overviewView().trend,
    feelings: overviewView().feelings,
  });
  fixture.componentRef.setInput('labels', labels);
  fixture.componentRef.setInput('summary', 'Ressentis notés sur 90 jours');
  const selected: string[] = [];
  fixture.componentInstance.pointSelected.subscribe((id) => selected.push(id));
  fixture.detectChanges();
  await tick();
  await fixture.whenStable();
  return { fixture, host, chart, create, selected };
}

function color(option: FeelingsChartOption, index: number): unknown {
  return (option.series as { itemStyle?: { color?: string } }[])[index].itemStyle?.color;
}

/** Couleur du point d'un ressenti (une couleur par point, celle de sa famille). */
function pointColor(option: FeelingsChartOption, entryId: string): unknown {
  const points = (option.series as { id?: string; data?: unknown[] }[]).find(
    (s) => s.id === 'feelings',
  );
  const datum = points?.data?.find((d) => (d as { entryId?: string }).entryId === entryId);
  return (datum as { itemStyle?: { color?: string } } | undefined)?.itemStyle?.color;
}

describe('FeelingsChartComponent', () => {
  it('crée le graphe dans son conteneur, options tirées des tokens CSS', async () => {
    const { chart, create, host } = await render();
    expect(host.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe(
      'Ressentis notés sur 90 jours',
    );
    expect(create).toHaveBeenCalledTimes(1);
    const [option, opts] = chart.setOption.mock.lastCall!;
    expect(opts).toEqual({ notMerge: true });
    expect(color(option, 0)).toBe('violet');
    expect(color(option, 1)).toBe('teal');
    expect(pointColor(option, 'f-1')).toBe('indigo');
  });

  it('clic sur un point de ressenti : émet son entrée ; clic sur un jour de séance : rien', async () => {
    const { chart, selected } = await render();
    chart.click({ seriesType: 'scatter', data: { value: ['2026-10-20', 8], entryId: 'f-1' } });
    chart.click({ seriesType: 'scatter', data: ['2026-10-17', 0] });
    expect(selected).toEqual(['f-1']);
  });

  it('changement de thème : les tokens sont relus et les options reposées', async () => {
    const { fixture, host, chart } = await render();
    const calls = chart.setOption.mock.calls.length;
    host.style.setProperty('--emotion-fear', 'plum');
    const theme = TestBed.inject(ThemeService);
    theme.set(theme.resolved() === 'dark' ? 'light' : 'dark');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(chart.setOption.mock.calls.length).toBeGreaterThan(calls);
    expect(pointColor(chart.setOption.mock.lastCall![0], 'f-1')).toBe('plum');
  });

  it('ECharts ne se charge pas : « Graphe indisponible », hors de l’image', async () => {
    const { host } = await render(() => Promise.reject(new Error('chunk')));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Graphe indisponible');
    expect(host.querySelector('[role="img"] [role="alert"]')).toBeNull();
    expect(host.querySelector('[role="img"]')?.classList).toContain('hidden');
  });

  it('destruction : le graphe est libéré', async () => {
    const { fixture, chart } = await render();
    fixture.destroy();
    expect(chart.dispose).toHaveBeenCalled();
  });
});
