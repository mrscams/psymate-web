import { TIMELINE_FOCUS_PARAM } from '../../timeline';
import { emptyOverview, overviewView } from './overview.fixtures';
import {
  isActivityEmpty,
  isAttentionEmpty,
  isEmotionsEmpty,
  isMedicationsEmpty,
  isSessionsEmpty,
  isSituationsEmpty,
  isTrendEmpty,
  lastWeekAverage,
  TIMELINE_PARAMS,
} from './overview.model';

describe('overview.model', () => {
  it('lastWeekAverage : le dernier point (aujourd’hui) seulement, null s’il n’a pas de moyenne', () => {
    expect(lastWeekAverage([])).toBeNull();
    expect(
      lastWeekAverage([
        { date: '2026-11-06', average: 4.5 },
        { date: '2026-11-07', average: null },
      ]),
    ).toBeNull();
    expect(
      lastWeekAverage([
        { date: '2026-11-06', average: null },
        { date: '2026-11-07', average: 3.25 },
      ]),
    ).toBe(3.25);
  });

  it('vides par bloc : un dossier sans données est vide partout', () => {
    const empty = emptyOverview();
    for (const isEmpty of [
      isTrendEmpty,
      isAttentionEmpty,
      isSituationsEmpty,
      isMedicationsEmpty,
      isSessionsEmpty,
      isEmotionsEmpty,
      isActivityEmpty,
    ]) {
      expect(isEmpty(empty)).toBe(true);
      expect(isEmpty(overviewView())).toBe(false);
    }
  });

  it('points d’attention : une séance ouverte suffit', () => {
    expect(
      isAttentionEmpty(
        emptyOverview({ drafts: { count: 0, openSession: { entryId: 's', startedAt: null } } }),
      ),
    ).toBe(false);
  });

  it('paramètre ?focus= : même valeur que la timeline (redéclaré pour ne pas tirer sa page)', () => {
    expect(TIMELINE_PARAMS.focus).toBe(TIMELINE_FOCUS_PARAM);
  });
});
