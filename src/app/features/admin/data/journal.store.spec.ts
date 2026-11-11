import { TestBed } from '@angular/core/testing';

import { AdminApi } from './admin.api';
import { account, accountPage, journalItem } from './admin.fixtures';
import { DEFAULT_JOURNAL_FILTERS, JournalStore, periodRange } from './journal.store';

function setup(api: Partial<AdminApi>) {
  TestBed.configureTestingModule({
    providers: [JournalStore, { provide: AdminApi, useValue: api }],
  });
  return TestBed.inject(JournalStore);
}

describe('periodRange', () => {
  const now = new Date('2026-11-08T12:00:00Z');

  it('7 et 30 jours : instant de début, pas de fin ; tout : aucune borne', () => {
    expect(periodRange(DEFAULT_JOURNAL_FILTERS, now)).toEqual({
      from: '2026-11-01T12:00:00.000Z',
      to: null,
    });
    expect(periodRange({ ...DEFAULT_JOURNAL_FILTERS, period: '30d' }, now).from).toBe(
      '2026-10-09T12:00:00.000Z',
    );
    expect(periodRange({ ...DEFAULT_JOURNAL_FILTERS, period: 'all' }, now)).toEqual({
      from: null,
      to: null,
    });
  });

  it('personnalisée : les jours tels quels (le serveur les lit en UTC)', () => {
    expect(
      periodRange(
        { ...DEFAULT_JOURNAL_FILTERS, period: 'custom', from: '2026-10-01', to: '2026-10-31' },
        now,
      ),
    ).toEqual({ from: '2026-10-01', to: '2026-10-31' });
  });
});

describe('JournalStore', () => {
  it('setFilters : type traduit en kind du contrat, praticien et auteur transmis', async () => {
    const journal = vi.fn().mockResolvedValue({ items: [journalItem()], nextCursor: null });
    const store = setup({ journal });
    await store.setFilters({
      ...DEFAULT_JOURNAL_FILTERS,
      category: 'documents',
      practitionerId: 'acc-1',
      actorId: 'adm-1',
      period: 'all',
    });
    expect(journal).toHaveBeenCalledWith({
      kind: 'admin.document_read',
      practitionerId: 'acc-1',
      actorId: 'adm-1',
      from: null,
      to: null,
      cursor: null,
    });
    expect(store.items()).toHaveLength(1);
  });

  it('loadMore : curseur renvoyé tel quel, nombre de lignes ajoutées', async () => {
    const journal = vi
      .fn()
      .mockResolvedValueOnce({ items: [journalItem()], nextCursor: 'c1' })
      .mockResolvedValueOnce({
        items: [journalItem({ id: 'j-2' }), journalItem({ id: 'j-3' })],
        nextCursor: null,
      });
    const store = setup({ journal });
    await store.setFilters({ ...DEFAULT_JOURNAL_FILTERS, period: 'all' });
    expect(await store.loadMore()).toBe(2);
    expect(journal).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'c1' }));
    expect(store.hasMore()).toBe(false);
  });

  it('loadMore en erreur : liste conservée, problème à part', async () => {
    const journal = vi
      .fn()
      .mockResolvedValueOnce({ items: [journalItem()], nextCursor: 'c1' })
      .mockRejectedValueOnce({ status: 0, code: 'NETWORK_ERROR' });
    const store = setup({ journal });
    await store.setFilters(DEFAULT_JOURNAL_FILTERS);
    expect(await store.loadMore()).toBe(0);
    expect(store.items()).toHaveLength(1);
    expect(store.moreProblem()?.code).toBe('NETWORK_ERROR');
  });

  it('loadAdmins : comptes administrateurs, une seule fois', async () => {
    const accounts = vi.fn().mockResolvedValue(accountPage([account({ role: 'admin' })]));
    const store = setup({ accounts });
    await store.loadAdmins();
    await store.loadAdmins();
    expect(accounts).toHaveBeenCalledTimes(1);
    expect(accounts).toHaveBeenCalledWith(expect.objectContaining({ role: 'admin' }));
    expect(store.admins().data).toHaveLength(1);
  });

  it('loadAdmins en erreur : état error, un nouvel appel relit la liste (UX-G2b)', async () => {
    const accounts = vi
      .fn()
      .mockRejectedValueOnce({ status: 503, code: 'INTERNAL_ERROR' })
      .mockResolvedValueOnce(accountPage([account({ role: 'admin' })]));
    const store = setup({ accounts });
    await store.loadAdmins();
    expect(store.admins().status).toBe('error');
    await store.loadAdmins();
    expect(accounts).toHaveBeenCalledTimes(2);
    expect(store.admins().status).toBe('loaded');
    expect(store.admins().data).toHaveLength(1);
  });
});
