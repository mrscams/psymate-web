import { TestBed } from '@angular/core/testing';

import { suggestedEmotion, TagsApi } from './tags.api';
import { TagsStore } from './tags.store';
import { BOULOT, SANTE, TAG_IS_EMOTION, TAGS, TRAVAIL } from './vocabulary.fixtures';

function setup(api: Partial<TagsApi>) {
  TestBed.configureTestingModule({ providers: [TagsStore, { provide: TagsApi, useValue: api }] });
  return TestBed.inject(TagsStore);
}

describe('TagsStore', () => {
  it('load : chargement puis liste ; erreur avec donnée précédente conservée', async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce(TAGS)
      .mockRejectedValueOnce({ status: 500, code: 'INTERNAL_ERROR' });
    const store = setup({ list });
    const pending = store.load();
    expect(store.tags().status).toBe('loading');
    await pending;
    expect(store.list().map((t) => t.label)).toEqual(['boulot', 'santé', 'travail']);
    await store.load();
    expect(store.tags().status).toBe('error');
    expect(store.list()).toHaveLength(3);
  });

  it.each([
    ['201', null, 2],
    ['409 TAG_EXISTS', { status: 409, code: 'TAG_EXISTS' }, 1],
    ['422 TAG_IS_EMOTION', TAG_IS_EMOTION, 1],
  ])('createTag %s', async (_, error, lists) => {
    const create = error
      ? vi.fn().mockRejectedValue(error)
      : vi.fn().mockResolvedValue({ ...SANTE, id: 't-new', label: 'famille' });
    const list = vi.fn().mockResolvedValue(TAGS);
    const store = setup({ list, create });
    await store.load();
    const created = await store.createTag(' famille ');
    expect(create).toHaveBeenCalledWith('famille');
    expect(created === null).toBe(error !== null);
    expect(store.createProblem()?.code ?? null).toBe(error?.code ?? null);
    expect(list).toHaveBeenCalledTimes(lists);
  });

  it('renameTag : PATCH puis relecture ; TAG_IS_EMOTION gardé', async () => {
    const rename = vi
      .fn()
      .mockResolvedValueOnce({ ...BOULOT, label: 'Boulot' })
      .mockRejectedValueOnce(TAG_IS_EMOTION);
    const list = vi.fn().mockResolvedValue(TAGS);
    const store = setup({ list, rename });
    await store.load();
    await expect(store.renameTag(BOULOT.id, 'Boulot')).resolves.toBe(true);
    await expect(store.renameTag(BOULOT.id, 'anxiété')).resolves.toBe(false);
    expect(suggestedEmotion(store.rowProblem())?.labelFr).toBe('Anxiété');
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('mergeTag : cible renvoyée, source absente après relecture ; 404 gardé', async () => {
    const merged = { ...TRAVAIL, usageCount: 6 };
    const list = vi.fn().mockResolvedValueOnce(TAGS).mockResolvedValue([SANTE, merged]);
    const merge = vi
      .fn()
      .mockResolvedValueOnce(merged)
      .mockRejectedValueOnce({ status: 404, code: 'TAG_NOT_FOUND' });
    const store = setup({ list, merge });
    await store.load();
    const target = await store.mergeTag(BOULOT.id, TRAVAIL.id);
    expect(merge).toHaveBeenCalledWith(BOULOT.id, TRAVAIL.id);
    expect(target?.usageCount).toBe(6);
    expect(store.list().map((t) => t.label)).toEqual(['santé', 'travail']);
    expect(await store.mergeTag(BOULOT.id, TRAVAIL.id)).toBeNull();
    expect(store.rowProblem()?.code).toBe('TAG_NOT_FOUND');
    expect(store.busyId()).toBeNull();
  });

  it.each([
    ['TAG_IS_EMOTION avec suggestion', TAG_IS_EMOTION, { code: 'anxiety', labelFr: 'Anxiété' }],
    ['TAG_IS_EMOTION sans suggestion', { status: 422, code: 'TAG_IS_EMOTION' }, null],
    ['autre code', { status: 409, code: 'TAG_EXISTS', extra: TAG_IS_EMOTION.extra }, null],
    ['aucun problème', null, null],
  ])('suggestedEmotion : %s', (_, problem, expected) => {
    expect(suggestedEmotion(problem)).toEqual(expected);
  });
});
