import { TIMELINE_FOCUS_PARAM } from '../../timeline';
import { emptyOverview, overviewView } from './overview.fixtures';
import { failed, idle, loaded, loading } from '../../../shared/util';
import {
  blockState,
  isActivityEmpty,
  isAttentionEmpty,
  isBriefEmpty,
  isEmotionsEmpty,
  isFeelingsEmpty,
  isFrameEmpty,
  isMedicationsEmpty,
  isSessionsEmpty,
  isSinceEmpty,
  isSituationsEmpty,
  isTodoEmpty,
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
      isBriefEmpty,
      isFeelingsEmpty,
      isSinceEmpty,
      isFrameEmpty,
      isTodoEmpty,
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

  it('En bref : un point d’attention seul suffit ; cadre : un début de suivi suffit', () => {
    expect(isBriefEmpty(emptyOverview({ narrative: { sentences: [], attention: 'x' } }))).toBe(
      false,
    );
    const facts = { ...emptyOverview().facts, followedSince: '2026-11-08' };
    expect(isFrameEmpty(emptyOverview({ facts }))).toBe(false);
  });

  it('blockState : squelette puis erreur sans synthèse ; vide ou contenu avec, même en relecture', () => {
    expect(blockState(idle(), isBriefEmpty)).toBe('loading');
    expect(blockState(loading(), isBriefEmpty)).toBe('loading');
    expect(blockState(failed({ status: 500 } as never), isBriefEmpty)).toBe('error');
    expect(blockState(loaded(emptyOverview()), isBriefEmpty)).toBe('empty');
    expect(blockState(loaded(overviewView()), isBriefEmpty)).toBeNull();
    expect(blockState(loading(loaded(emptyOverview())), isBriefEmpty)).toBe('empty');
    expect(
      blockState(failed({ status: 500 } as never, loaded(overviewView())), isBriefEmpty),
    ).toBeNull();
  });

  it('paramètre ?focus= : même valeur que la timeline (redéclaré pour ne pas tirer sa page)', () => {
    expect(TIMELINE_PARAMS.focus).toBe(TIMELINE_FOCUS_PARAM);
  });
});
