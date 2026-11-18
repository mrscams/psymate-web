import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { provideApiClient } from '../../../core/auth';
import { Profile360Api, toItems } from './profile360.api';

describe('Profile360Api', () => {
  it('toItems garde l’ordre du serveur, écarte les informations sans id ou de rubrique inconnue', () => {
    const items = toItems({
      patientId: 'p-1',
      items: [
        { id: 'b', category: 'history', title: 'Plus tard', periodLabel: '2020', periodYear: 2020 },
        { id: 'a', category: 'history', title: 'Avant', periodYear: 1990, detail: '' },
        { category: 'family', title: 'Sans id' },
        { id: 'x', category: 'other', title: 'Rubrique inconnue' },
        { id: 'c', category: 'family', title: 'Thomas', detail: 'Compagnon' },
      ],
    } as never);
    expect(items).toEqual([
      {
        id: 'b',
        category: 'history',
        title: 'Plus tard',
        detail: null,
        periodLabel: '2020',
        periodYear: 2020,
      },
      {
        id: 'a',
        category: 'history',
        title: 'Avant',
        detail: null,
        periodLabel: null,
        periodYear: 1990,
      },
      {
        id: 'c',
        category: 'family',
        title: 'Thomas',
        detail: 'Compagnon',
        periodLabel: null,
        periodYear: null,
      },
    ]);
    expect(toItems({ patientId: 'p-1' })).toEqual([]);
  });

  it('profile() : un seul GET /api/patients/{id}/profile-items', async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideApiClient()],
    });
    const http = TestBed.inject(HttpTestingController);
    const result = TestBed.inject(Profile360Api).profile('p-1');
    const request = http.expectOne('/api/patients/p-1/profile-items');
    expect(request.request.method).toBe('GET');
    request.flush({
      patientId: 'p-1',
      items: [{ id: 'a', category: 'health', title: 'Migraines' }],
    });
    expect((await result).map((item) => item.title)).toEqual(['Migraines']);
    http.verify();
  });

  it('écritures : POST, PATCH (null gardé pour effacer) et DELETE sur …/profile-items', async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideApiClient()],
    });
    const http = TestBed.inject(HttpTestingController);
    const api = TestBed.inject(Profile360Api);

    const created = api.create('p-1', { category: 'health', title: 'Migraines' });
    const post = http.expectOne('/api/patients/p-1/profile-items');
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({ category: 'health', title: 'Migraines' });
    post.flush(
      { id: 'i-1', category: 'health', title: 'Migraines' },
      { status: 201, statusText: 'Created' },
    );
    await created;

    const updated = api.update('p-1', 'i-1', { title: 'Migraines rares', detail: null });
    const patch = http.expectOne('/api/patients/p-1/profile-items/i-1');
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ title: 'Migraines rares', detail: null });
    patch.flush({ id: 'i-1', category: 'health', title: 'Migraines rares' });
    await updated;

    const removed = api.remove('p-1', 'i-1');
    const del = http.expectOne('/api/patients/p-1/profile-items/i-1');
    expect(del.request.method).toBe('DELETE');
    del.flush(null, { status: 204, statusText: 'No Content' });
    await removed;
    http.verify();
  });
});
