import { TestBed } from '@angular/core/testing';

import { AdminApi } from './admin.api';
import { accountPage, CLAIRE, REMI } from './admin.fixtures';
import { VerificationQueueStore } from './verification-queue.store';

function setup(api: Partial<AdminApi>) {
  TestBed.configureTestingModule({
    providers: [VerificationQueueStore, { provide: AdminApi, useValue: api }],
  });
  return TestBed.inject(VerificationQueueStore);
}

describe('VerificationQueueStore', () => {
  it('setStatus : file du plus ancien au plus récent, total depuis les compteurs des comptes', async () => {
    const queue = vi.fn().mockResolvedValue({ items: [CLAIRE, REMI], nextCursor: null });
    const accounts = vi.fn().mockResolvedValue(accountPage([]));
    const store = setup({ queue, accounts });
    const pending = store.setStatus('under_review');
    expect(store.page().status).toBe('loading');
    await pending;
    expect(queue).toHaveBeenCalledWith('under_review', null);
    expect(accounts).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'practitioner', limit: 1, status: null }),
    );
    expect(store.items().map((i) => i.displayName)).toEqual(['Claire Moreau', 'Rémi Lenoir']);
    expect(store.total()).toBe(2);
  });

  it('compteur indisponible : la file reste utilisable, total inconnu', async () => {
    const store = setup({
      queue: vi.fn().mockResolvedValue({ items: [CLAIRE], nextCursor: null }),
      accounts: vi.fn().mockRejectedValue({ status: 500, code: 'INTERNAL_ERROR' }),
    });
    await store.setStatus('needs_more');
    expect(store.items()).toHaveLength(1);
    expect(store.total()).toBeNull();
  });

  it('erreur : problème conservé, pas de liste', async () => {
    const store = setup({
      queue: vi.fn().mockRejectedValue({ status: 500, code: 'INTERNAL_ERROR' }),
      accounts: vi.fn().mockResolvedValue(accountPage([])),
    });
    await store.setStatus('under_review');
    expect(store.page().status).toBe('error');
    expect(store.page().problem?.code).toBe('INTERNAL_ERROR');
  });

  it('loadMore : page suivante concaténée sans doublon', async () => {
    const queue = vi
      .fn()
      .mockResolvedValueOnce({ items: [CLAIRE], nextCursor: 'c1' })
      .mockResolvedValueOnce({ items: [CLAIRE, REMI], nextCursor: null });
    const store = setup({ queue, accounts: vi.fn().mockResolvedValue(accountPage([])) });
    await store.setStatus('under_review');
    expect(store.hasMore()).toBe(true);
    await store.loadMore();
    expect(queue).toHaveBeenLastCalledWith('under_review', 'c1');
    expect(store.items()).toHaveLength(2);
    expect(store.hasMore()).toBe(false);
  });

  it('neighbourOf : le suivant, sinon le précédent, sinon rien', async () => {
    const store = setup({
      queue: vi.fn().mockResolvedValue({ items: [CLAIRE, REMI], nextCursor: null }),
      accounts: vi.fn().mockResolvedValue(accountPage([])),
    });
    await store.setStatus('under_review');
    expect(store.neighbourOf(CLAIRE.practitionerId)).toBe(REMI.practitionerId);
    expect(store.neighbourOf(REMI.practitionerId)).toBe(CLAIRE.practitionerId);
  });
});
