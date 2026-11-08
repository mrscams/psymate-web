import { items, timelineItem } from './timeline.fixtures';
import {
  bandsAt,
  buildRows,
  followUpStart,
  groupKey,
  layoutBands,
  saidInSession,
  TimelineWindow,
  windowCount,
  windowOffset,
  windowOfSlot,
  windowSize,
} from './timeline.model';

const situation = (id: string, from: string, to: string | null) =>
  timelineItem({
    id,
    type: 'situation',
    title: id,
    occurred: { from, to, precision: 'day', label: null },
    ongoing: to === null,
  });

describe('timeline.model', () => {
  describe('créneaux et fenêtres', () => {
    it('fenêtres de 200, tailles connues prises en compte', () => {
      expect(windowOffset(3, [])).toBe(600);
      expect(windowOffset(2, [200, 150])).toBe(350);
      expect(windowOfSlot(0, [])).toBe(0);
      expect(windowOfSlot(199, [])).toBe(0);
      expect(windowOfSlot(200, [])).toBe(1);
      expect(windowOfSlot(360, [200, 150])).toBe(2);
      expect(windowCount(1000, [])).toBe(5);
      expect(windowCount(1001, [])).toBe(6);
      expect(windowCount(0, [])).toBe(0);
      expect(windowSize(4, [], 950)).toBe(150);
    });
  });

  describe('pastille « dit en séance du … »', () => {
    const sessions = { 's-1': '2026-10-17T16:00:00Z' };

    it('jour différent de la séance : la date de la séance', () => {
      const item = timelineItem({
        occurred: { from: '2026-10-18T00:00:00Z', to: null, precision: 'day', label: null },
      });
      expect(saidInSession(item, sessions)).toBe('2026-10-17T16:00:00Z');
    });

    it('même jour, séance elle-même, séance inconnue : pas de pastille', () => {
      const sameDay = timelineItem({
        occurred: { from: '2026-10-17T16:20:00Z', precision: 'exact' },
      });
      expect(saidInSession(sameDay, sessions)).toBeNull();
      expect(
        saidInSession(timelineItem({ type: 'session', sessionId: null }), sessions),
      ).toBeNull();
      expect(saidInSession(timelineItem({ sessionId: 's-x' }), sessions)).toBeNull();
    });
  });

  it('début du suivi : la plus ancienne séance ou le début déclaré s’il est plus ancien', () => {
    expect(followUpStart('2026-11-01', { a: '2025-03-04T09:00:00Z' })).toBe(
      '2025-03-04T09:00:00.000Z',
    );
    expect(followUpStart('2024-01-01', { a: '2025-03-04T09:00:00Z' })).toBe(
      '2024-01-01T00:00:00.000Z',
    );
    expect(followUpStart(null, {})).toBeNull();
  });

  describe('bandes de situations', () => {
    it('deux situations qui se chevauchent n’ont pas la même colonne ; une colonne libérée resert', () => {
      const bands = layoutBands([
        situation('reorg', '2026-04-22T00:00:00Z', null),
        situation('arret', '2026-07-11T00:00:00Z', '2026-08-10T00:00:00Z'),
        situation('etudes', '2008-09-01T00:00:00Z', '2012-07-01T00:00:00Z'),
      ]);
      const lane = (id: string) => bands.find((band) => band.item.id === id)?.lane;
      expect(lane('etudes')).toBe(0);
      expect(lane('reorg')).toBe(0);
      expect(lane('arret')).toBe(1);
      expect(bands.find((band) => band.item.id === 'reorg')?.to).toBe(Number.POSITIVE_INFINITY);
    });

    it('une ligne est traversée par les bandes dont la plage contient sa date', () => {
      const bands = layoutBands([
        situation('reorg', '2026-04-22T00:00:00Z', null),
        situation('arret', '2026-07-11T00:00:00Z', '2026-08-10T00:00:00Z'),
      ]);
      expect(bandsAt(bands, '2026-11-01T00:00:00Z')).toEqual([true, false]);
      expect(bandsAt(bands, '2026-07-20T00:00:00Z')).toEqual([true, true]);
      expect(bandsAt(bands, '2026-01-01T00:00:00Z')).toEqual([false, false]);
    });
  });

  it('groupes de l’axe : jour, semaine du lundi, mois', () => {
    const at = (from: string) => timelineItem({ occurred: { from, precision: 'day' } });
    const monday = at('2026-10-19T00:00:00Z');
    const sunday = at('2026-10-25T00:00:00Z');
    expect(groupKey(monday, 'week')).toBe(groupKey(sunday, 'week'));
    expect(groupKey(monday, 'day')).not.toBe(groupKey(sunday, 'day'));
    expect(groupKey(monday, 'month')).toBe(groupKey(at('2026-10-01T00:00:00Z'), 'month'));
  });

  describe('buildRows', () => {
    const loaded = (index: number, list = items(3)): TimelineWindow => ({
      index,
      status: 'loaded',
      items: list,
      problem: null,
    });

    it('une ligne par créneau ; fenêtres hors mémoire en créneaux vides', () => {
      const rows = buildRows({
        total: 450,
        sizes: [200],
        windows: [loaded(0, items(200))],
        zoom: 'week',
        sessions: {},
        followStart: null,
        bands: [],
      });
      expect(rows).toHaveLength(450);
      expect(rows[0]).toMatchObject({ state: 'item', groupStart: true, firstOfWindow: true });
      expect(rows[200]).toMatchObject({
        item: null,
        state: 'idle',
        window: 1,
        firstOfWindow: true,
      });
      expect(rows[449].window).toBe(2);
    });

    it('zone « Avant le suivi » et tête de bande', () => {
      const list = [
        timelineItem({ id: 'a', occurred: { from: '2026-11-01T09:00:00Z' } }),
        situation('reorg', '2026-04-22T00:00:00Z', null),
        timelineItem({ id: 'b', occurred: { from: '2014-01-01T00:00:00Z', precision: 'year' } }),
        timelineItem({ id: 'c', occurred: { from: '2010-01-01T00:00:00Z', precision: 'year' } }),
      ];
      const bands = layoutBands([list[1]]);
      const rows = buildRows({
        total: 4,
        sizes: [4],
        windows: [loaded(0, list)],
        zoom: 'week',
        sessions: {},
        followStart: '2025-03-04T09:00:00Z',
        bands,
      });
      expect(rows.map((row) => row.before)).toEqual([false, false, true, true]);
      expect(rows.map((row) => row.firstBefore)).toEqual([false, false, true, false]);
      expect(rows.map((row) => row.bands[0])).toEqual([true, true, false, false]);
      expect(rows[0].bandHeads[0]?.item.id).toBe('reorg');
      expect(rows[1].bandHeads[0]).toBeNull();
    });
  });
});
