import { TestBed } from '@angular/core/testing';

import { AdminApi } from './admin.api';
import { entry } from './admin.fixtures';
import { VocabularyStore } from './vocabulary.store';

const FIXED = {
  modalities: [{ code: 'video', labelFr: 'En visio', labelEn: 'Video' }],
  languages: [{ code: 'fr', labelFr: 'Français', labelEn: 'French' }],
};

function setup(api: Partial<AdminApi>) {
  TestBed.configureTestingModule({
    providers: [VocabularyStore, { provide: AdminApi, useValue: api }],
  });
  return TestBed.inject(VocabularyStore);
}

describe('VocabularyStore', () => {
  it('load : entrées éditables séparées par type, listes fixes à part', async () => {
    const store = setup({
      vocabulary: vi
        .fn()
        .mockResolvedValue([
          entry(),
          entry({ kind: 'audience', code: 'adults', labelFr: 'Adultes' }),
        ]),
      fixedVocabulary: vi.fn().mockResolvedValue(FIXED),
    });
    await store.load();
    expect(store.specialties().map((e) => e.code)).toEqual(['anxiety']);
    expect(store.audiences().map((e) => e.code)).toEqual(['adults']);
    expect(store.fixed().data?.languages).toHaveLength(1);
  });

  it('create : null et liste relue ; 409 VOCABULARY_EXISTS renvoyé sans relecture', async () => {
    const vocabulary = vi.fn().mockResolvedValue([entry()]);
    const createEntry = vi
      .fn()
      .mockResolvedValueOnce(entry({ code: 'sleep' }))
      .mockRejectedValueOnce({ status: 409, code: 'VOCABULARY_EXISTS' });
    const store = setup({ vocabulary, createEntry });
    await store.reload();
    const input = { kind: 'specialty' as const, code: 'sleep', labelFr: 'Sommeil' };
    expect(await store.create(input)).toBeNull();
    expect(vocabulary).toHaveBeenCalledTimes(2);
    expect((await store.create(input))?.code).toBe('VOCABULARY_EXISTS');
    expect(vocabulary).toHaveBeenCalledTimes(2);
  });

  it('setActive(false) : 409 VOCABULARY_IN_USE avec le compteur, la ligne reste active', async () => {
    const store = setup({
      vocabulary: vi.fn().mockResolvedValue([entry({ usedByPublishedProfiles: 3 })]),
      patchEntry: vi.fn().mockRejectedValue({
        status: 409,
        code: 'VOCABULARY_IN_USE',
        extra: { usedByPublishedProfiles: 3 },
      }),
    });
    await store.reload();
    const problem = await store.setActive('specialty', 'anxiety', false);
    expect(problem?.extra?.['usedByPublishedProfiles']).toBe(3);
    expect(store.specialties()[0].active).toBe(true);
  });

  it('update : PATCH sur le même {kind}/{code}', async () => {
    const patchEntry = vi.fn().mockResolvedValue(entry({ labelFr: 'Anxiété et stress' }));
    const store = setup({ vocabulary: vi.fn().mockResolvedValue([entry()]), patchEntry });
    await store.update('specialty', 'anxiety', { labelFr: 'Anxiété et stress', labelEn: '' });
    expect(patchEntry).toHaveBeenCalledWith('specialty', 'anxiety', {
      labelFr: 'Anxiété et stress',
      labelEn: '',
    });
  });
});
