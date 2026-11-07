import { TestBed } from '@angular/core/testing';

import { DirectoryApi } from './directory.api';
import { CLAIRE_CARD, page } from './directory.fixtures';
import { DirectoryPage, EMPTY_QUERY } from './directory.models';
import { DirectoryStore } from './directory.store';

function setup(api: Partial<DirectoryApi>) {
  TestBed.configureTestingModule({ providers: [{ provide: DirectoryApi, useValue: api }] });
  return TestBed.inject(DirectoryStore);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const paris = { ...EMPTY_QUERY, city: 'Paris' };

describe('DirectoryStore', () => {
  it('recherche : chargement, puis page et facettes de la réponse', async () => {
    const search = vi.fn().mockResolvedValue(page([CLAIRE_CARD]));
    const store = setup({ search });
    const pending = store.search(paris);
    expect(store.result().status).toBe('loading');
    await pending;
    expect(search).toHaveBeenCalledWith(paris);
    expect(store.result().status).toBe('loaded');
    expect(store.page()?.items[0].displayName).toBe('Claire Moreau');
    expect(store.facets()?.professions).toEqual([{ code: 'psychologist', count: 1 }]);
  });

  it('même recherche déjà chargée : aucun nouvel appel, sauf « force » (Réessayer)', async () => {
    const search = vi.fn().mockResolvedValue(page([CLAIRE_CARD]));
    const store = setup({ search });
    await store.search(paris);
    await store.search({ ...paris });
    expect(search).toHaveBeenCalledTimes(1);
    await store.search(paris, { force: true });
    expect(search).toHaveBeenCalledTimes(2);
  });

  it('une réponse plus ancienne que la dernière recherche est ignorée', async () => {
    const first = deferred<DirectoryPage>();
    const second = deferred<DirectoryPage>();
    const search = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const store = setup({ search });
    const a = store.search(paris);
    const b = store.search({ ...paris, city: 'Lyon' });
    second.resolve(page([{ ...CLAIRE_CARD, city: 'Lyon' }]));
    await b;
    first.resolve(page([]));
    await a;
    expect(store.page()?.items[0].city).toBe('Lyon');
    expect(store.query()?.city).toBe('Lyon');
  });

  it('erreur : la liste précédente reste, le problème est gardé', async () => {
    const search = vi
      .fn()
      .mockResolvedValueOnce(page([CLAIRE_CARD]))
      .mockRejectedValueOnce({ status: 503, code: 'INTERNAL_ERROR' });
    const store = setup({ search });
    await store.search(paris);
    await store.search({ ...paris, page: 2 });
    expect(store.result().status).toBe('error');
    expect(store.result().problem?.status).toBe(503);
    expect(store.page()?.items).toHaveLength(1);
  });

  it('429 : délai retryAfterSeconds, recherche retenue pendant le délai, lancée à la fin', async () => {
    const search = vi
      .fn()
      .mockRejectedValueOnce({ status: 429, code: 'RATE_LIMITED', retryAfterSeconds: 30 })
      .mockResolvedValue(page([CLAIRE_CARD]));
    const store = setup({ search });
    const before = Date.now();
    await store.search(paris);
    const until = store.rateLimitedUntil() ?? 0;
    expect(until).toBeGreaterThanOrEqual(before + 30_000);

    // Pendant le délai : rien ne part, la saisie est retenue.
    await store.search({ ...paris, professions: ['coach'] });
    expect(search).toHaveBeenCalledTimes(1);
    expect(store.deferred()?.professions).toEqual(['coach']);
    await store.resume(until - 1000);
    expect(search).toHaveBeenCalledTimes(1);

    // Fin du délai : la recherche retenue part.
    await store.resume(until + 1);
    expect(search).toHaveBeenCalledTimes(2);
    expect(search).toHaveBeenLastCalledWith({ ...paris, professions: ['coach'] });
    expect(store.rateLimitedUntil()).toBeNull();
    expect(store.result().status).toBe('loaded');
  });

  it('429 vu par l’intercepteur (GET rejoué) : le délai bloque aussi les nouvelles recherches', async () => {
    const search = vi.fn().mockResolvedValue(page([]));
    const store = setup({ search });
    store.rateLimited(12);
    await store.search(paris);
    expect(search).not.toHaveBeenCalled();
    expect(store.deferred()).toEqual(paris);
  });
});
