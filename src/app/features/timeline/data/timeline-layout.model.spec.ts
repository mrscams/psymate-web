import { timelineItem } from './timeline.fixtures';
import {
  anchorKey,
  indexAtOffset,
  indexOfSlot,
  LAYOUT,
  layoutTimeline,
  monthIndex,
  sessionsFirst,
} from './timeline-layout.model';
import {
  buildRows,
  layoutBands,
  SituationBand,
  TimelineItem,
  TimelineWindow,
  TimelineZoom,
} from './timeline.model';

/** Un élément exact à midi UTC (même jour dans tous les fuseaux d'Europe et d'Amérique). */
const at = (id: string, day: string, hour = 12, overrides: Partial<TimelineItem> = {}) =>
  timelineItem({
    id,
    title: id,
    occurred: {
      from: `${day}T${String(hour).padStart(2, '0')}:00:00Z`,
      to: null,
      precision: 'exact',
      label: null,
    },
    ...overrides,
  });

function rowsOf(
  list: TimelineItem[],
  options: {
    zoom?: TimelineZoom;
    followStart?: string | null;
    total?: number;
    bands?: SituationBand[];
    sessions?: Record<string, string>;
  } = {},
) {
  const windows: TimelineWindow[] = [{ index: 0, status: 'loaded', items: list, problem: null }];
  return buildRows({
    total: options.total ?? list.length,
    sizes: [list.length],
    windows,
    zoom: options.zoom ?? 'day',
    sessions: options.sessions ?? {},
    followStart: options.followStart ?? null,
    bands: options.bands ?? [],
  });
}

function layout(
  list: TimelineItem[],
  options: Parameters<typeof rowsOf>[1] & {
    narrow?: boolean;
    summaries?: Record<string, boolean>;
  } = {},
) {
  return layoutTimeline({
    rows: rowsOf(list, options),
    zoom: options.zoom ?? 'day',
    narrow: options.narrow ?? false,
    summaries: options.summaries ?? {},
  });
}

describe('timeline-layout.model', () => {
  it('les jours comme ancres : la date est écrite sur la première ligne de chaque jour', () => {
    const result = layout([
      at('a', '2026-11-12', 15),
      at('b', '2026-11-12', 11),
      at('c', '2026-11-08'),
      at('d', '2026-11-05'),
    ]);
    expect(result.rows.map((r) => r.dayStart)).toEqual([true, false, true, true]);
    expect(result.rows.map((r) => r.kind)).toEqual(['card', 'card', 'card', 'card']);
  });

  it('la séance monte en tête de son jour (séparateur avant les entrées notées pendant la séance)', () => {
    const session = at('s', '2026-11-12', 9, { type: 'session', sessionId: null });
    const result = layout([
      at('n2', '2026-11-12', 11, { sessionId: 's' }),
      at('n1', '2026-11-12', 10, { sessionId: 's' }),
      session,
      at('old', '2026-11-08'),
    ]);
    expect(result.rows.map((r) => r.row.item?.id)).toEqual(['s', 'n2', 'n1', 'old']);
    expect(result.rows[0].kind).toBe('session');
    expect(result.rows[0].dayStart).toBe(true);
    expect(result.rows[0].daySession).toBe(true);
    expect(result.rows[1].dayStart).toBe(false);
    // Les créneaux suivent l'élément : la ligne de la séance garde son créneau d'origine.
    expect(result.rows[0].row.slot).toBe(2);
    expect(indexOfSlot(result, 2)).toBe(0);
    expect(indexOfSlot(result, 0)).toBe(1);
    expect(indexOfSlot(result, 3)).toBe(3);
  });

  it('sessionsFirst ne touche ni les jours sans séance ni les créneaux vides', () => {
    const rows = rowsOf([at('a', '2026-11-12', 15), at('b', '2026-11-12', 11)], { total: 3 });
    const out = sessionsFirst(rows);
    expect(out.map((r) => r.slot)).toEqual([0, 1, 2]);
    expect(out[2].item).toBeNull();
  });

  it('intertitres de mois en vue jour et semaine, jamais en vue mois ni sur téléphone', () => {
    const list = [at('a', '2026-11-12'), at('b', '2026-11-02'), at('c', '2026-10-28')];
    const day = layout(list);
    expect(day.rows.map((r) => r.month)).toEqual([2026 * 12 + 10, null, 2026 * 12 + 9]);
    expect(day.rows[0].top).toBe(LAYOUT.month);
    expect(day.rows[1].top).toBe(LAYOUT.dayGap);
    expect(layout(list, { zoom: 'week' }).rows.map((r) => r.month !== null)).toEqual([
      true,
      false,
      true,
    ]);
    expect(layout(list, { zoom: 'month' }).rows.every((r) => r.month === null)).toBe(true);
    const narrow = layout(list, { narrow: true });
    expect(narrow.rows.every((r) => r.month === null)).toBe(true);
    // Téléphone : un en-tête de jour au-dessus de chaque premier élément du jour.
    expect(narrow.rows.map((r) => r.top)).toEqual([LAYOUT.dayHead, LAYOUT.dayHead, LAYOUT.dayHead]);
  });

  it('ancre selon le zoom : jour, semaine du lundi, mois', () => {
    const thursday = at('a', '2026-11-12');
    const monday = at('b', '2026-11-09');
    const sunday = at('c', '2026-11-08');
    expect(anchorKey(thursday, 'day')).not.toBe(anchorKey(monday, 'day'));
    expect(anchorKey(thursday, 'week')).toBe(anchorKey(monday, 'week'));
    expect(anchorKey(sunday, 'week')).not.toBe(anchorKey(monday, 'week'));
    expect(anchorKey(sunday, 'month')).toBe(anchorKey(thursday, 'month'));
  });

  it('précision des dates : jour en UTC, mois, année, période et phase de vie gardent leur ancre', () => {
    const day = timelineItem({
      occurred: { from: '2026-11-05T00:00:00Z', to: null, precision: 'day', label: null },
    });
    const month = timelineItem({
      occurred: { from: '2026-10-01T00:00:00Z', to: null, precision: 'month', label: null },
    });
    const year = timelineItem({
      occurred: { from: '2014-01-01T00:00:00Z', to: null, precision: 'year', label: null },
    });
    const phase = timelineItem({
      occurred: {
        from: '2001-01-01T00:00:00Z',
        to: '2005-12-31T00:00:00Z',
        precision: 'life_phase',
        label: 'Collège',
      },
    });
    expect(anchorKey(day, 'day')).toBe('day:2026-10-5');
    expect(anchorKey(month, 'day')).toBe('month:2026-9');
    expect(anchorKey(year, 'week')).toBe('year:2014');
    expect(anchorKey(phase, 'day')).toContain('life_phase:');
    expect(monthIndex(month)).toBe(2026 * 12 + 9);
    expect(monthIndex(year)).toBeNull();
    expect(monthIndex(phase)).toBeNull();
  });

  it('hauteurs : une ligne, deux lignes (tags, liens, « dit en séance »), séance, compte rendu, pied', () => {
    const session = at('s', '2026-11-12', 9, { type: 'session', sessionId: null });
    const result = layout(
      [
        session,
        at('plain', '2026-11-11'),
        at('tagged', '2026-11-10', 12, { tags: ['sommeil'] }),
        at('linked', '2026-11-09', 12, { linkCount: 2 }),
      ],
      { summaries: { s: true } },
    );
    const [s, plain, tagged, linked] = result.rows;
    expect(s.summary).toBe(true);
    expect(s.height).toBe(LAYOUT.month + LAYOUT.session + LAYOUT.sessionSummary);
    expect(plain.height).toBe(LAYOUT.dayGap + LAYOUT.card + LAYOUT.gap);
    expect(tagged.details).toBe(true);
    expect(tagged.height).toBe(LAYOUT.dayGap + LAYOUT.cardDetails + LAYOUT.gap);
    expect(linked.last).toBe(true);
    expect(linked.height).toBe(LAYOUT.dayGap + LAYOUT.cardDetails + LAYOUT.gap + LAYOUT.footer);
    // Décalages cumulés.
    expect(result.offsets).toHaveLength(5);
    expect(result.offsets[0]).toBe(0);
    expect(result.offsets[4]).toBe(result.rows.reduce((sum, row) => sum + row.height, 0));
    expect(indexAtOffset(result.offsets, 0)).toBe(0);
    expect(indexAtOffset(result.offsets, result.offsets[2] + 1)).toBe(2);
    expect(indexAtOffset(result.offsets, 1e9)).toBe(3);
  });

  it('zoom « Mois » : lignes réduites, pas de compte rendu sous le séparateur', () => {
    const session = at('s', '2026-11-12', 9, { type: 'session', sessionId: null });
    const result = layout([session, at('t', '2026-11-10', 12, { tags: ['x'] })], {
      zoom: 'month',
      summaries: { s: true },
    });
    expect(result.rows[0].summary).toBe(false);
    expect(result.rows[1].details).toBe(false);
    expect(result.rows[1].height).toBe(LAYOUT.cardCompact + LAYOUT.gap + LAYOUT.footer);
  });

  it('« Avant le suivi » : marqueur au-dessus du premier élément antérieur, lignes réduites', () => {
    const result = layout(
      [
        at('recent', '2026-10-01'),
        timelineItem({
          id: 'old',
          occurred: { from: '2014-01-01T00:00:00Z', to: null, precision: 'year', label: null },
        }),
      ],
      { followStart: '2026-09-01T00:00:00Z' },
    );
    const [recent, old] = result.rows;
    expect(recent.row.before).toBe(false);
    expect(old.row.firstBefore).toBe(true);
    expect(old.top).toBe(LAYOUT.followStart);
    expect(old.height).toBe(LAYOUT.followStart + LAYOUT.cardCompact + LAYOUT.gap + LAYOUT.footer);
  });

  it("créneaux d'une fenêtre pas encore lue : squelettes, et le jour suivant réécrit sa date", () => {
    const list = [at('a', '2026-11-12'), at('b', '2026-11-12', 10)];
    const windows: TimelineWindow[] = [
      { index: 0, status: 'loaded', items: list, problem: null },
      { index: 2, status: 'loaded', items: [at('c', '2026-11-12', 8)], problem: null },
    ];
    const rows = buildRows({
      total: 5,
      sizes: [2, 2, 1],
      windows,
      zoom: 'day',
      sessions: {},
      followStart: null,
      bands: [],
    });
    const result = layoutTimeline({ rows, zoom: 'day', narrow: false, summaries: {} });
    expect(result.rows.map((r) => r.kind)).toEqual(['card', 'card', 'pending', 'pending', 'card']);
    expect(result.rows[4].dayStart).toBe(true);
    expect(result.rows[2].height).toBe(LAYOUT.card + LAYOUT.gap);
  });

  it('bandes : la hauteur du libellé couvre la suite des lignes de la situation', () => {
    const situation = timelineItem({
      id: 'sit',
      type: 'situation',
      title: 'Réorganisation',
      occurred: { from: '2026-11-01T00:00:00Z', to: null, precision: 'day', label: null },
      ongoing: true,
    });
    const bands = layoutBands([situation]);
    const result = layout([at('a', '2026-11-12'), at('b', '2026-11-08'), at('c', '2026-10-20')], {
      bands,
    });
    expect(result.rows.map((r) => r.row.bands[0])).toEqual([true, true, false]);
    expect(result.rows[0].bandSpans[0]).toBe(result.offsets[2] - result.offsets[0]);
    expect(result.rows[1].bandSpans[0]).toBe(0);
  });
});
