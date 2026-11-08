import { TestBed } from '@angular/core/testing';

import { AdminApi } from './admin.api';
import { account, accountPage, appeal } from './admin.fixtures';
import { AppealsStore } from './appeals.store';
import { DEFAULT_FILTERS, PractitionersStore } from './practitioners.store';

function setup(api: Partial<AdminApi>) {
  TestBed.configureTestingModule({
    providers: [PractitionersStore, AppealsStore, { provide: AdminApi, useValue: api }],
  });
  return { store: TestBed.inject(PractitionersStore), appeals: TestBed.inject(AppealsStore) };
}

describe('PractitionersStore', () => {
  it('setFilters : relit la première page avec les filtres, une seule fois par changement', async () => {
    const accounts = vi.fn().mockResolvedValue(accountPage([account()]));
    const { store } = setup({ accounts });
    await store.setFilters(DEFAULT_FILTERS);
    await store.setFilters({ ...DEFAULT_FILTERS });
    expect(accounts).toHaveBeenCalledTimes(1);
    await store.setFilters({ ...DEFAULT_FILTERS, status: 'suspended', q: 'moreau' });
    expect(accounts).toHaveBeenLastCalledWith({
      q: 'moreau',
      status: 'suspended',
      role: 'practitioner',
      profession: null,
      cursor: null,
    });
    expect(store.counts()?.approved).toBe(3);
  });

  it('loadMore : concatène et garde les compteurs du serveur', async () => {
    const accounts = vi
      .fn()
      .mockResolvedValueOnce(accountPage([account()], 'c1'))
      .mockResolvedValueOnce(accountPage([account(), account({ id: 'acc-2' })]));
    const { store } = setup({ accounts });
    await store.setFilters(DEFAULT_FILTERS);
    await store.loadMore();
    expect(accounts).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'c1' }));
    expect(store.items().map((a) => a.id)).toEqual(['acc-1', 'acc-2']);
  });

  it('suspend : null et liste relue ; problème renvoyé tel quel (422, 409)', async () => {
    const accounts = vi.fn().mockResolvedValue(accountPage([account()]));
    const suspend = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce({ status: 409, code: 'ADMIN_SELF_SUSPEND' });
    const { store } = setup({ accounts, suspend });
    await store.setFilters(DEFAULT_FILTERS);
    expect(await store.suspend('acc-1', 'Motif suffisamment long pour le serveur')).toBeNull();
    expect(accounts).toHaveBeenCalledTimes(2);
    expect((await store.suspend('acc-1', 'Motif suffisamment long'))?.code).toBe(
      'ADMIN_SELF_SUSPEND',
    );
    expect(accounts).toHaveBeenCalledTimes(2);
  });

  it('reactivate : null et liste relue', async () => {
    const accounts = vi.fn().mockResolvedValue(accountPage([account({ status: 'suspended' })]));
    const reactivate = vi.fn().mockResolvedValue('approved');
    const { store } = setup({ accounts, reactivate });
    await store.setFilters(DEFAULT_FILTERS);
    expect(await store.reactivate('acc-1', 'Erreur de saisie, compte rétabli.')).toBeNull();
    expect(reactivate).toHaveBeenCalledWith('acc-1', 'Erreur de saisie, compte rétabli.');
    expect(accounts).toHaveBeenCalledTimes(2);
  });
});

describe('AppealsStore', () => {
  it('load puis decide : recours ouverts relus après la décision', async () => {
    const openAppeals = vi
      .fn()
      .mockResolvedValueOnce({ items: [appeal()], nextCursor: null })
      .mockResolvedValueOnce({ items: [], nextCursor: null });
    const decideAppeal = vi.fn().mockResolvedValue(undefined);
    const { appeals } = setup({ openAppeals, decideAppeal });
    await appeals.load();
    expect(appeals.items()).toHaveLength(1);
    expect(await appeals.decide('appeal-1', 'accepted', 'Recours fondé.')).toBeNull();
    expect(decideAppeal).toHaveBeenCalledWith('appeal-1', 'accepted', 'Recours fondé.');
    expect(appeals.items()).toHaveLength(0);
  });

  it('decide : 409 APPEAL_SELF_REVIEW renvoyé, liste inchangée', async () => {
    const openAppeals = vi.fn().mockResolvedValue({ items: [appeal()], nextCursor: null });
    const { appeals } = setup({
      openAppeals,
      decideAppeal: vi.fn().mockRejectedValue({ status: 409, code: 'APPEAL_SELF_REVIEW' }),
    });
    await appeals.load();
    expect((await appeals.decide('appeal-1', 'dismissed', 'Non.'))?.code).toBe(
      'APPEAL_SELF_REVIEW',
    );
    expect(openAppeals).toHaveBeenCalledTimes(1);
  });
});
