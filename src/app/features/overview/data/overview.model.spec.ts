import { TIMELINE_FOCUS_PARAM } from '../../timeline';
import { emptyOverview, overviewView } from './overview.fixtures';
import {
  isActivityEmpty,
  isAttentionEmpty,
  isEmotionsEmpty,
  isMedicationsEmpty,
  isSessionsEmpty,
  isSituationsEmpty,
  isStale,
  isTrendEmpty,
  latestAverage,
  TIMELINE_PARAMS,
} from './overview.model';

describe('overview.model', () => {
  it('isStale : plus de 5 min depuis computedAt', () => {
    const at = '2026-11-08T10:00:00Z';
    expect(isStale(at, Date.parse('2026-11-08T10:04:59Z'))).toBe(false);
    expect(isStale(at, Date.parse('2026-11-08T10:05:01Z'))).toBe(true);
    expect(isStale(null, Date.now())).toBe(false);
    expect(isStale('pas une date', Date.now())).toBe(false);
  });

  it('latestAverage : la moyenne serveur la plus récente qui existe', () => {
    expect(latestAverage([])).toBeNull();
    expect(
      latestAverage([
        { date: '2026-11-06', average: 4.5 },
        { date: '2026-11-07', average: null },
      ]),
    ).toBe(4.5);
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
