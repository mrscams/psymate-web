import { TestBed } from '@angular/core/testing';

import { AgendaApi } from './agenda.api';
import { PatientOption } from './agenda.model';
import { PatientSearchStore } from './patient-search.store';

const marie: PatientOption = { id: 'p-1', displayName: 'Marie D.', age: 34 };
const marc: PatientOption = { id: 'p-2', displayName: 'Marc A.', age: null };

/** Réponse dont on choisit le moment. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((ok, ko) => {
    resolve = ok;
    reject = ko;
  });
  return { promise, resolve, reject };
}

function setup() {
  const searchPatients = vi.fn();
  TestBed.configureTestingModule({
    providers: [PatientSearchStore, { provide: AgendaApi, useValue: { searchPatients } }],
  });
  return { store: TestBed.inject(PatientSearchStore), searchPatients };
}

describe('PatientSearchStore', () => {
  it('trois états : chargement, résultats (vides compris), erreur ; requête vide → idle sans lecture', async () => {
    const { store, searchPatients } = setup();
    expect(store.results().status).toBe('idle');

    const pending = deferred<PatientOption[]>();
    searchPatients.mockReturnValueOnce(pending.promise);
    const search = store.search('mar');
    expect(store.results().status).toBe('loading');
    pending.resolve([marie]);
    await search;
    expect(store.results()).toMatchObject({ status: 'loaded', data: [marie] });

    searchPatients.mockResolvedValueOnce([]);
    await store.search('zzz');
    expect(store.results()).toMatchObject({ status: 'loaded', data: [] });

    searchPatients.mockRejectedValueOnce({ status: 0, code: 'NETWORK_ERROR' });
    await store.search('mar');
    expect(store.results().status).toBe('error');
    expect(store.results().problem).toMatchObject({ code: 'NETWORK_ERROR' });

    await store.search('   ');
    expect(store.results().status).toBe('idle');
    expect(searchPatients).toHaveBeenCalledTimes(3);
  });

  it('une réponse dépassée par une recherche plus récente est écartée', async () => {
    const { store, searchPatients } = setup();
    const first = deferred<PatientOption[]>();
    const second = deferred<PatientOption[]>();
    searchPatients.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const a = store.search('ma');
    const b = store.search('marc');
    second.resolve([marc]);
    await b;
    first.resolve([marie]);
    await a;
    expect(store.results()).toMatchObject({ status: 'loaded', data: [marc] });

    // Une erreur dépassée est écartée de même.
    const late = deferred<PatientOption[]>();
    searchPatients.mockReturnValueOnce(late.promise).mockResolvedValueOnce([marie]);
    const c = store.search('m');
    await store.search('mar');
    late.reject({ status: 500, code: 'INTERNAL_ERROR' });
    await c;
    expect(store.results()).toMatchObject({ status: 'loaded', data: [marie] });
  });

  it('clear() écarte une réponse encore en vol', async () => {
    const { store, searchPatients } = setup();
    const pending = deferred<PatientOption[]>();
    searchPatients.mockReturnValueOnce(pending.promise);
    const search = store.search('mar');
    store.clear();
    expect(store.results().status).toBe('idle');
    pending.resolve([marie]);
    await search;
    expect(store.results().status).toBe('idle');
  });
});
