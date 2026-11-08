import { timelineItem } from './timeline.fixtures';
import { groupBySession } from './timeline-sessions.model';

const at = (iso: string) => ({ from: iso, to: null, precision: 'exact' as const, label: null });

const recent = timelineItem({
  id: 's-2',
  type: 'session',
  title: null,
  sessionId: null,
  occurred: at('2026-10-30T15:00:00Z'),
});
const older = timelineItem({
  id: 's-1',
  type: 'session',
  title: null,
  sessionId: null,
  occurred: at('2026-09-01T15:00:00Z'),
});

describe('groupBySession', () => {
  it('une carte par séance, de la plus récente à la plus ancienne, entrées dans l’ordre lu', () => {
    const a = timelineItem({ id: 'a', sessionId: 's-2', occurred: at('2026-10-30T15:10:00Z') });
    const b = timelineItem({ id: 'b', sessionId: 's-1', occurred: at('2026-10-20T08:00:00Z') });
    const c = timelineItem({ id: 'c', sessionId: 's-2', occurred: at('2014-01-01T00:00:00Z') });
    const groups = groupBySession([a, recent, b, older, c], {});
    expect(groups.map((g) => g.id)).toEqual(['s-2', 's-1']);
    expect(groups[0].entries.map((item) => item.id)).toEqual(['a', 'c']);
    expect(groups[0].session?.id).toBe('s-2');
    expect(groups[1].entries.map((item) => item.id)).toEqual(['b']);
  });

  it('filtre qui exclut les séances : la séance vient de l’index, seules celles qui ont des entrées', () => {
    const feeling = timelineItem({ id: 'f', type: 'feeling', sessionId: 's-1' });
    const groups = groupBySession([feeling], {
      's-1': '2026-09-01T15:00:00Z',
      's-2': '2026-10-30T15:00:00Z',
    });
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ id: 's-1', session: null, from: '2026-09-01T15:00:00Z' });
  });

  it('séance inconnue (privée, hors index) : groupe « hors séance », en dernier', () => {
    const orphan = timelineItem({ id: 'o', sessionId: 's-privee' });
    const loose = timelineItem({ id: 'l', sessionId: null });
    const groups = groupBySession([orphan, recent, loose], {});
    expect(groups.map((g) => g.id)).toEqual(['s-2', null]);
    expect(groups[1].entries.map((item) => item.id)).toEqual(['o', 'l']);
  });

  it('rien à regrouper : aucune carte', () => {
    expect(groupBySession([], {})).toEqual([]);
  });
});
