import { TestBed } from '@angular/core/testing';

import { SessionStore, SessionUser } from '../../../core/auth';
import { SessionApi } from '../../../core/auth/data/session.api';
import { PatientApi } from './patient.api';
import { TAGS } from './patient.fixtures';
import { TagStore } from './tag.store';

const user = (id: string): SessionUser => ({
  id,
  email: `${id}@example.test`,
  displayName: id,
  profession: 'psychologist',
  verificationStatus: 'approved',
  role: 'practitioner',
  twoFactorEnabled: false,
  passwordChangeRequired: false,
});

function setup(api: Partial<PatientApi>) {
  TestBed.configureTestingModule({
    providers: [
      { provide: PatientApi, useValue: api },
      { provide: SessionApi, useValue: {} },
    ],
  });
  TestBed.inject(SessionStore).signIn(user('claire'));
  return { store: TestBed.inject(TagStore), session: TestBed.inject(SessionStore) };
}

describe('TagStore', () => {
  it.each([
    ['libellé existant (accents et # ignorés) : pas de création', '#Sante', 'santé', 0],
    ['nouveau libellé : POST /api/tags', 'famille', 'famille', 1],
    ['libellé vide : rien', '  # ', null, 0],
  ])('resolve : %s', async (_label, input, expected, creations) => {
    const createTag = vi
      .fn()
      .mockResolvedValue({ id: 't-f', label: 'famille', normalizedLabel: 'famille' });
    const { store } = setup({ listTags: vi.fn().mockResolvedValue(TAGS), createTag });
    await store.load();
    expect((await store.resolve(input))?.label ?? null).toBe(expected);
    expect(createTag).toHaveBeenCalledTimes(creations);
    if (creations) expect(store.tags().data?.map((t) => t.label)).toContain('famille');
  });

  it('TAG_IS_EMOTION : refus gardé avec le message du serveur, effacé par clearProblem', async () => {
    const { store } = setup({
      listTags: vi.fn().mockResolvedValue(TAGS),
      createTag: vi.fn().mockRejectedValue({
        status: 422,
        code: 'TAG_IS_EMOTION',
        errors: [
          { field: 'label', code: 'TAG_IS_EMOTION', message: '« anxiété » est une émotion.' },
        ],
      }),
    });
    await store.load();
    expect(await store.resolve('anxiété')).toBeNull();
    expect(store.status()).toBe('error');
    expect(store.problem()?.code).toBe('TAG_IS_EMOTION');
    store.clearProblem();
    expect(store.problem()).toBeNull();
  });

  it('TAG_EXISTS : relecture des tags et réutilisation', async () => {
    const listTags = vi
      .fn()
      .mockResolvedValueOnce(TAGS)
      .mockResolvedValueOnce([
        ...TAGS,
        { id: 't-f', label: 'Famille', normalizedLabel: 'famille' },
      ]);
    const { store } = setup({
      listTags,
      createTag: vi.fn().mockRejectedValue({ status: 409, code: 'TAG_EXISTS' }),
    });
    await store.load();
    expect((await store.resolve('famille'))?.id).toBe('t-f');
    expect(store.problem()).toBeNull();
  });

  it('autre compte dans le même onglet : les tags du précédent ne sont jamais montrés', async () => {
    const listTags = vi
      .fn()
      .mockResolvedValueOnce(TAGS)
      .mockImplementationOnce(() => new Promise(() => undefined));
    const { store, session } = setup({ listTags });
    await store.load();
    expect(store.tags().data).toHaveLength(2);
    session.signIn(user('karim'));
    void store.load();
    expect(store.tags().data).toBeNull();
    expect(store.tags().status).toBe('loading');
  });
});
