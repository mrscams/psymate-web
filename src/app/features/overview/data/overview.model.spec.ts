import { TIMELINE_FOCUS_PARAM } from '../../timeline';
import { emptyOverview, overviewView } from './overview.fixtures';
import { failed, idle, loaded, loading } from '../../../shared/util';
import {
  averageRange,
  blockState,
  followedSinceOf,
  isActivityEmpty,
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
  TIMELINE_PARAMS,
  trendDirection,
  windowAverage,
} from './overview.model';

describe('overview.model', () => {
  it('windowAverage : moyenne des ressentis renvoyés pour la fenêtre, null sans ressenti', () => {
    expect(windowAverage([])).toBeNull();
    // Fixture : anxiété 8 et joie 4 sur 90 jours.
    expect(windowAverage(overviewView().feelings.points)).toBe(6);
  });

  it('averageRange / trendDirection : première et dernière moyenne du serveur, seuil d’un demi-point', () => {
    expect(averageRange([{ date: '2026-11-08', average: null }])).toBeNull();
    const range = averageRange(overviewView().trend.points)!;
    expect(range).toEqual({ first: 5.5, last: 7 });
    expect(trendDirection(range)).toBe('up');
    expect(trendDirection({ first: 7, last: 5 })).toBe('down');
    expect(trendDirection({ first: 5, last: 5.4 })).toBe('flat');
  });

  it('followedSinceOf : la fiche, sauf si une séance connue est plus ancienne (dossier créé après coup)', () => {
    expect(followedSinceOf(emptyOverview())).toBeNull();
    // Fiche du 12 mars 2025, séances d'octobre 2026 : la fiche.
    expect(followedSinceOf(overviewView())).toEqual({ date: '2025-03-12', fromSessions: false });
    // Dossier créé le 7 nov. 2026 (follow_up.since vide), séances depuis le 10 oct. : la séance.
    const created = overviewView();
    created.facts = { ...created.facts, followedSince: '2026-11-07' };
    expect(followedSinceOf(created)).toEqual({ date: '2026-10-10', fromSessions: true });
    // Sans début renseigné : la première séance connue.
    created.facts = { ...created.facts, followedSince: null };
    expect(followedSinceOf(created)).toEqual({ date: '2026-10-10', fromSessions: true });
  });

  it('vides par bloc : un dossier sans données est vide partout', () => {
    const empty = emptyOverview();
    for (const isEmpty of [
      isTrendEmpty,
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

  it('à compléter : une séance ouverte suffit', () => {
    expect(
      isTodoEmpty(
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
