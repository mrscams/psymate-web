import { periodMonth } from '../data/timeline-decade.model';
import { monthlySummary, timelineItem, timelinePeriod } from '../data/timeline.fixtures';
import { decadeChart, intensityTrend, niceMax } from './timeline-decade.chart';

const m = (period: string) => periodMonth(period)!;

const situation = (id: string, from: string, to: string | null, ongoing = false) =>
  timelineItem({
    id,
    type: 'situation',
    title: id,
    occurred: { from, to, precision: 'day', label: null },
    ongoing,
  });

describe('decadeChart', () => {
  it('niceMax : maximum rond, pair au-delà de 1', () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(1)).toBe(1);
    expect(niceMax(2)).toBe(2);
    expect(niceMax(3)).toBe(4);
    expect(niceMax(7)).toBe(8);
    expect(niceMax(10)).toBe(10);
    expect(niceMax(11)).toBe(20);
    expect(niceMax(130)).toBe(200);
  });

  it('une colonne par mois de la plage, barres empilées par type dans l’ordre des types', () => {
    const periods = [
      timelinePeriod('2026-01', { session: 1, note: 2, feeling: 1 }, 5),
      timelinePeriod('2026-03', { note: 1 }),
    ];
    const chart = decadeChart({
      plage: { start: m('2026-01'), end: m('2026-04') },
      periods,
      types: ['session', 'note', 'feeling', 'event', 'situation', 'medication'],
      intensity: true,
      situations: [],
      followStart: null,
    });
    expect(chart.months.map((month) => month.key)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
    ]);
    const [january, february] = chart.months;
    // note, puis ressenti, puis séance (ordre des types), de bas en haut ; maximum rond 4.
    expect(january.segments.map((s) => [s.type, s.count])).toEqual([
      ['note', 2],
      ['feeling', 1],
      ['session', 1],
    ]);
    expect(january.total).toBe(4);
    expect(january.segments[0].y + january.segments[0].height).toBe(chart.base);
    expect(january.segments[2].y).toBe(chart.top);
    expect(february.segments).toEqual([]);
    expect(chart.countTicks.map((tick) => tick.value)).toEqual([0, 2, 4]);
    expect(chart.intensityTicks.map((tick) => tick.value)).toEqual([0, 5, 10]);
    // Toutes les colonnes se suivent sans trou, de la gauche à la droite du tracé.
    expect(chart.months[0].x).toBe(chart.left);
    expect(chart.months[3].x + chart.months[3].width).toBeCloseTo(chart.right, 1);
  });

  it('types filtrés : seuls les types montrés comptent', () => {
    const chart = decadeChart({
      plage: { start: m('2026-01'), end: m('2026-01') },
      periods: [timelinePeriod('2026-01', { session: 1, note: 8, feeling: 2 }, 6)],
      types: ['feeling'],
      intensity: true,
      situations: [],
      followStart: null,
    });
    expect(chart.months[0].segments.map((s) => s.type)).toEqual(['feeling']);
    expect(chart.months[0].total).toBe(2);
    expect(chart.countTicks.at(-1)?.value).toBe(2);
  });

  it('courbe d’intensité : un tronçon par suite de mois consécutifs, rien sans ressentis', () => {
    const periods = [
      timelinePeriod('2026-01', { feeling: 1 }, 4),
      timelinePeriod('2026-02', { feeling: 1 }, 6),
      timelinePeriod('2026-03', { note: 1 }, null),
      timelinePeriod('2026-04', { feeling: 1 }, 8),
      timelinePeriod('2026-05', { feeling: 1 }, 10),
    ];
    const input = {
      plage: { start: m('2026-01'), end: m('2026-05') },
      periods,
      types: ['note', 'feeling'] as ('note' | 'feeling')[],
      situations: [],
      followStart: null,
    };
    const chart = decadeChart({ ...input, intensity: true });
    expect(chart.curve).toHaveLength(2);
    expect(chart.dots).toHaveLength(4);
    expect(chart.dots[3].y).toBe(chart.top);
    expect(chart.dots[0].y).toBeCloseTo(chart.base - 0.4 * (chart.base - chart.top), 1);
    const flat = decadeChart({ ...input, intensity: false });
    expect(flat.curve).toEqual([]);
    expect(flat.intensityTicks).toEqual([]);
  });

  it('repères d’années aux mois de janvier ; marqueur « début du suivi » dans la plage seulement', () => {
    const plage = { start: m('2023-11'), end: m('2026-10') };
    const periods = monthlySummary(36, '2026-10');
    const base = { plage, periods, types: ['note' as const], intensity: false, situations: [] };
    const chart = decadeChart({ ...base, followStart: '2025-03-04' });
    expect(chart.years.map((year) => year.year)).toEqual([2024, 2025, 2026]);
    const march = chart.months.find((month) => month.key === '2025-03')!;
    expect(chart.follow!.x).toBeGreaterThanOrEqual(march.x);
    expect(chart.follow!.x).toBeLessThan(march.x + march.width);
    expect(decadeChart({ ...base, followStart: '2026-11-08' }).follow).toBeNull();
    expect(decadeChart({ ...base, followStart: '2020-01-01' }).follow).toBeNull();
    // Sans mois de janvier : l'année du premier mois.
    const short = decadeChart({
      ...base,
      followStart: null,
      plage: { start: m('2026-03'), end: m('2026-06') },
    });
    expect(short.years).toEqual([{ x: short.left, year: 2026 }]);
  });

  it('bandes : situations longues seulement, coupées à la plage, en colonnes sans chevauchement', () => {
    const plage = { start: m('2024-01'), end: m('2026-10') };
    const chart = decadeChart({
      plage,
      periods: monthlySummary(34, '2026-10'),
      types: ['note'],
      intensity: false,
      followStart: null,
      situations: [
        situation('conflit', '2023-06-01T00:00:00Z', null, true),
        situation('reconversion', '2025-01-01T00:00:00Z', '2026-05-15T00:00:00Z'),
        situation('grippe', '2025-02-01T00:00:00Z', '2025-02-08T00:00:00Z'),
        situation('ancienne', '2019-01-01T00:00:00Z', '2020-01-01T00:00:00Z'),
        // Chevauche « conflit » mais finit avant la plage : ne lui prend pas sa colonne.
        situation('avant', '2022-01-01T00:00:00Z', '2023-12-01T00:00:00Z'),
      ],
    });
    expect(chart.bands.map((band) => band.item.id)).toEqual(['conflit', 'reconversion']);
    const [conflict, career] = chart.bands;
    expect(conflict.lane).toBe(0);
    expect(conflict.clippedStart).toBe(true);
    expect(conflict.x).toBe(chart.left);
    expect(conflict.x + conflict.width).toBe(chart.right);
    expect(conflict.ongoing).toBe(true);
    expect(career.lane).not.toBe(conflict.lane);
    expect(career.y).toBeGreaterThan(conflict.y);
    expect(chart.height).toBeGreaterThan(career.y + 14);
  });

  it('bandes : une par ligne, même sans chevauchement (deux libellés ne se recouvrent jamais)', () => {
    const chart = decadeChart({
      plage: { start: m('2024-01'), end: m('2026-10') },
      periods: monthlySummary(34, '2026-10'),
      types: ['note'],
      intensity: false,
      followStart: null,
      situations: [
        situation('b', '2025-06-01T00:00:00Z', '2025-09-01T00:00:00Z'),
        situation('a', '2024-02-01T00:00:00Z', '2024-05-01T00:00:00Z'),
        situation('c', '2026-01-01T00:00:00Z', null, true),
      ],
    });
    // De la plus ancienne à la plus récente, une ligne chacune.
    expect(chart.bands.map((band) => [band.item.id, band.lane])).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 2],
    ]);
    expect(new Set(chart.bands.map((band) => band.y)).size).toBe(3);
  });
});

describe('intensityTrend', () => {
  it('compare le dernier tiers au premier', () => {
    const at = (values: (number | null)[]) =>
      values.map((v, i) => timelinePeriod(`2026-${String(i + 1).padStart(2, '0')}`, {}, v));
    expect(intensityTrend(at([3, 3, 4, 5, 7, 8]))).toBe('up');
    expect(intensityTrend(at([8, 7, null, 5, 4, 3]))).toBe('down');
    expect(intensityTrend(at([5, 5.2, 4.9, 5.1]))).toBe('flat');
    expect(intensityTrend(at([5, null]))).toBeNull();
  });
});
