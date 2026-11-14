import { TIMELINE_FOCUS_PARAM } from '../../timeline';
import { emptyOverview, overviewView } from './overview.fixtures';
import { failed, idle, loaded, loading } from '../../../shared/util';
import {
  averageRange,
  blockState,
  followedSinceOf,
  isEmotionsEmpty,
  isFeelingsEmpty,
  isFrameEmpty,
  isMedicationsEmpty,
  isSessionsEmpty,
  isSinceEmpty,
  isSituationsEmpty,
  isTodoEmpty,
  NOTED_MAX,
  notedEntries,
  sinceFacts,
  TIMELINE_PARAMS,
  trendDirection,
  windowSessionCount,
} from './overview.model';

describe('overview.model', () => {
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
      isFeelingsEmpty,
      isSinceEmpty,
      isSessionsEmpty,
      isFrameEmpty,
      isMedicationsEmpty,
      isSituationsEmpty,
      isEmotionsEmpty,
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

  it('cadre du suivi : un début de suivi ou un drapeau suffit', () => {
    const facts = { ...emptyOverview().facts, followedSince: '2026-11-08' };
    expect(isFrameEmpty(emptyOverview({ facts }))).toBe(false);
    const flagged = { ...emptyOverview().facts, flags: overviewView().facts.flags };
    expect(isFrameEmpty(emptyOverview({ facts: flagged }))).toBe(false);
  });

  it('sinceFacts : ressentis depuis la séance, dernière moyenne 7 j du serveur et son sens, brouillons', () => {
    // Fixture : séance du 17 oct. (moyenne alors inconnue, la plus proche avant est absente :
    // aucune comparaison), dernière moyenne 7 le 8 nov.
    expect(sinceFacts(overviewView())).toEqual({
      feelings: 1,
      intensity: 7,
      direction: null,
      drafts: 2,
    });
    // Séance du 21 oct. : la moyenne du 20 oct. (5,5) sert de point de comparaison → hausse.
    const view = overviewView();
    view.sinceLastSession = { ...view.sinceLastSession, lastSessionAt: '2026-10-21T14:00:00Z' };
    expect(sinceFacts(view).direction).toBe('up');
    // Sans séance passée : la première moyenne de la fenêtre.
    view.sinceLastSession = { ...view.sinceLastSession, lastSessionAt: null, lastSessionId: null };
    expect(sinceFacts(view).direction).toBe('up');
    // Sans moyenne : ni valeur ni sens.
    expect(sinceFacts(emptyOverview())).toEqual({
      feelings: 0,
      intensity: null,
      direction: null,
      drafts: 0,
    });
  });

  it('notedEntries : dix au plus, un ressenti nommé par son émotion et son intensité servies', () => {
    const [feeling, note] = notedEntries(overviewView());
    expect(feeling).toEqual({
      entryId: 'f-2',
      type: 'feeling',
      title: 'Joie après la randonnée',
      draft: true,
      occurredFrom: '2026-11-07T17:00:00Z',
      feeling: { label: 'Joie', family: 'joy', intensity: 4 },
    });
    expect(note.feeling).toBeNull();
    expect(note.draft).toBe(false);
    const many = overviewView();
    many.sinceLastSession = {
      ...many.sinceLastSession,
      entries: Array.from({ length: 14 }, (_, i) => ({
        entryId: `n-${i}`,
        type: 'note' as const,
        title: null,
        status: 'final' as const,
        occurredFrom: null,
      })),
    };
    expect(NOTED_MAX).toBe(10);
    expect(notedEntries(many).map((e) => e.entryId)).toEqual(
      Array.from({ length: 10 }, (_, i) => `n-${i}`),
    );
  });

  it('windowSessionCount : les séances repérées sur la courbe de la fenêtre', () => {
    expect(windowSessionCount(overviewView())).toBe(1);
    expect(windowSessionCount(emptyOverview())).toBe(0);
  });

  it('blockState : squelette puis erreur sans synthèse ; vide ou contenu avec, même en relecture', () => {
    expect(blockState(idle(), isSinceEmpty)).toBe('loading');
    expect(blockState(loading(), isSinceEmpty)).toBe('loading');
    expect(blockState(failed({ status: 500 } as never), isSinceEmpty)).toBe('error');
    expect(blockState(loaded(emptyOverview()), isSinceEmpty)).toBe('empty');
    expect(blockState(loaded(overviewView()), isSinceEmpty)).toBeNull();
    expect(blockState(loading(loaded(emptyOverview())), isSinceEmpty)).toBe('empty');
    expect(
      blockState(failed({ status: 500 } as never, loaded(overviewView())), isSinceEmpty),
    ).toBeNull();
  });

  it('paramètre ?focus= : même valeur que la timeline (redéclaré pour ne pas tirer sa page)', () => {
    expect(TIMELINE_PARAMS.focus).toBe(TIMELINE_FOCUS_PARAM);
  });
});
