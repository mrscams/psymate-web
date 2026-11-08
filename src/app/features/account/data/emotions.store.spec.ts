import { TestBed } from '@angular/core/testing';

import { SessionStore } from '../../../core/auth';
import { SessionApi } from '../../../core/auth/data/session.api';
import { EmotionsApi } from './emotions.api';
import { EmotionsStore } from './emotions.store';
import { isUndoable, readJournal, writeJournal } from './merge-journal';
import { CLAIRE, EMOTIONS, LASSITUDE, MERGE, MOROSITE } from './vocabulary.fixtures';

function setup(api: Partial<EmotionsApi>) {
  TestBed.configureTestingModule({
    providers: [
      EmotionsStore,
      { provide: EmotionsApi, useValue: api },
      { provide: SessionApi, useValue: {} },
    ],
  });
  TestBed.inject(SessionStore).signIn(CLAIRE);
  return TestBed.inject(EmotionsStore);
}

describe('EmotionsStore', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('load : chargement, puis globales et personnalisées séparées', async () => {
    const store = setup({ list: vi.fn().mockResolvedValue(EMOTIONS) });
    const pending = store.load();
    expect(store.emotions().status).toBe('loading');
    await pending;
    expect(store.globals().map((e) => e.code)).toEqual([
      'sadness',
      'anxiety',
      'apprehension',
      'joy',
    ]);
    expect(store.customs().map((e) => e.labelFr)).toEqual(['Lassitude', 'Morosité']);
    expect(store.byCode().get('c_0000aaaa')?.labelFr).toBe('Lassitude');
  });

  it('load en erreur : problème gardé, donnée précédente conservée', async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce(EMOTIONS)
      .mockRejectedValueOnce({ status: 500, code: 'INTERNAL_ERROR' });
    const store = setup({ list });
    await store.load();
    await store.reload();
    expect(store.emotions().status).toBe('error');
    expect(store.emotions().problem?.code).toBe('INTERNAL_ERROR');
    expect(store.customs()).toHaveLength(2);
  });

  it.each([
    ['201', null, 2],
    ['409 libellé pris', { status: 409, code: 'EMOTION_LABEL_EXISTS' }, 1],
    ['422 famille', { status: 422, code: 'VALIDATION_FAILED' }, 1],
  ])('createEmotion %s : relecture après succès seulement', async (_, error, lists) => {
    const create = error
      ? vi.fn().mockRejectedValue(error)
      : vi.fn().mockResolvedValue({ ...LASSITUDE, code: 'c_new', labelFr: 'Appréhension sociale' });
    const list = vi.fn().mockResolvedValue(EMOTIONS);
    const store = setup({ list, create });
    await store.load();
    const created = await store.createEmotion('  Appréhension sociale ', 'fear');
    expect(create).toHaveBeenCalledWith('Appréhension sociale', 'fear');
    expect(created === null).toBe(error !== null);
    expect(store.createProblem()?.code ?? null).toBe(error?.code ?? null);
    expect(store.creating()).toBe(false);
    expect(list).toHaveBeenCalledTimes(lists);
  });

  it('renameEmotion : PATCH puis relecture ; refus gardé dans rowProblem', async () => {
    const rename = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce({ status: 409, code: 'EMOTION_INACTIVE' });
    const list = vi.fn().mockResolvedValue(EMOTIONS);
    const store = setup({ list, rename });
    await store.load();
    await expect(store.renameEmotion(LASSITUDE.code, 'Lassitude profonde')).resolves.toBe(true);
    expect(list).toHaveBeenCalledTimes(2);
    await expect(store.renameEmotion(LASSITUDE.code, 'X')).resolves.toBe(false);
    expect(store.rowProblem()?.code).toBe('EMOTION_INACTIVE');
    expect(store.busyCode()).toBeNull();
  });

  it('mergeEmotion : reçu dans le journal (libellés du moment), mémorisé par compte, relecture', async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce(EMOTIONS)
      .mockResolvedValue(EMOTIONS.filter((e) => e.code !== LASSITUDE.code));
    const store = setup({ list, merge: vi.fn().mockResolvedValue(MERGE) });
    await store.load();
    const merge = await store.mergeEmotion(LASSITUDE.code, MOROSITE.code);
    expect(merge?.affectedCount).toBe(3);
    expect(store.customs().map((e) => e.code)).toEqual([MOROSITE.code]);
    expect(store.journal()).toHaveLength(1);
    expect(store.journal()[0]).toMatchObject({
      sourceLabel: 'Lassitude',
      targetLabel: 'Morosité',
    });
    expect(readJournal(CLAIRE.id)).toHaveLength(1);
    expect(readJournal('autre-compte')).toHaveLength(0);
  });

  it('load relit le journal du compte connecté', async () => {
    writeJournal(CLAIRE.id, [{ merge: MERGE, sourceLabel: 'Lassitude', targetLabel: 'Morosité' }]);
    const store = setup({ list: vi.fn().mockResolvedValue(EMOTIONS) });
    await store.load();
    expect(store.journal().map((e) => e.merge.id)).toEqual(['m-1']);
  });

  it.each([
    ['200 : la fusion est annulée', null, { undoneAt: '2026-11-08T10:00:00Z' }, 1],
    ['409 MERGE_UNDO_EXPIRED', { status: 409, code: 'MERGE_UNDO_EXPIRED' }, { expired: true }, 1],
    [
      '409 MERGE_ALREADY_UNDONE',
      { status: 409, code: 'MERGE_ALREADY_UNDONE' },
      { undone: true },
      1,
    ],
    ['404 MERGE_NOT_FOUND', { status: 404, code: 'MERGE_NOT_FOUND' }, null, 0],
  ])('undoMerge %s', async (_, error, expected, remaining) => {
    writeJournal(CLAIRE.id, [{ merge: MERGE, sourceLabel: 'Lassitude', targetLabel: 'Morosité' }]);
    const undo = error
      ? vi.fn().mockRejectedValue(error)
      : vi.fn().mockResolvedValue({ ...MERGE, undoneAt: '2026-11-08T10:00:00Z' });
    const list = vi.fn().mockResolvedValue(EMOTIONS);
    const store = setup({ list, undo });
    await store.load();
    const done = await store.undoMerge('m-1');
    expect(done).toBe(error === null);
    expect(store.undoing()).toBeNull();
    expect(store.undoProblem()?.code ?? null).toBe(error?.code ?? null);
    expect(store.journal()).toHaveLength(remaining);
    expect(list).toHaveBeenCalledTimes(error ? 1 : 2);
    const entry = store.journal()[0];
    if (expected && 'undoneAt' in expected) expect(entry.merge.undoneAt).toBe(expected.undoneAt);
    if (expected && 'expired' in expected) expect(entry.expired).toBe(true);
    if (expected && 'undone' in expected) expect(entry.merge.undoneAt).not.toBeNull();
    if (entry) expect(isUndoable(entry, Date.parse('2026-11-09T00:00:00Z'))).toBe(false);
    expect(readJournal(CLAIRE.id)).toHaveLength(remaining);
  });
});

describe('merge-journal', () => {
  afterEach(() => localStorage.clear());

  it('isUndoable : avant undoUntil seulement, ni annulée ni expirée', () => {
    const entry = {
      merge: MERGE,
      sourceLabel: 'Lassitude',
      targetLabel: 'Morosité',
    };
    expect(isUndoable(entry, Date.parse('2026-11-20T00:00:00Z'))).toBe(true);
    expect(isUndoable(entry, Date.parse('2026-12-09T00:00:00Z'))).toBe(false);
    expect(isUndoable({ ...entry, expired: true }, Date.parse('2026-11-20T00:00:00Z'))).toBe(false);
  });

  it('stockage corrompu ou absent : journal vide ; sans compte : rien', () => {
    localStorage.setItem('vocabulary.emotionMerges.u1', '{pas du json');
    expect(readJournal('u1')).toEqual([]);
    localStorage.setItem('vocabulary.emotionMerges.u1', JSON.stringify([{ nope: 1 }]));
    expect(readJournal('u1')).toEqual([]);
    expect(readJournal(null)).toEqual([]);
    writeJournal(null, []);
    expect(localStorage.length).toBe(1);
  });
});
