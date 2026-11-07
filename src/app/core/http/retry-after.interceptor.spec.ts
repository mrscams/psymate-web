import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { HttpNotices } from './http-notices';
import { problemInterceptor } from './problem.interceptor';
import { retryAfterInterceptor } from './retry-after.interceptor';

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([retryAfterInterceptor, problemInterceptor])),
      provideHttpClientTesting(),
    ],
  });
  return {
    http: TestBed.inject(HttpClient),
    backend: TestBed.inject(HttpTestingController),
    notices: TestBed.inject(HttpNotices),
  };
}

function flush429(backend: HttpTestingController, url: string, retryAfter?: string): void {
  backend.expectOne(url).flush(
    { status: 429, code: 'RATE_LIMITED', detail: 'Trop de requêtes.' },
    {
      status: 429,
      statusText: 'Too Many Requests',
      headers: retryAfter === undefined ? {} : { 'Retry-After': retryAfter },
    },
  );
}

describe('retryAfterInterceptor', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('429 sur un GET : avis avec le délai, puis un rejeu unique à la fin du délai', async () => {
    const { http, backend, notices } = setup();
    const result = firstValueFrom(http.get('/api/patients'));

    flush429(backend, '/api/patients', '12');
    expect(notices.notice()).toMatchObject({
      kind: 'rate-limited',
      retryAfterSeconds: 12,
      replaying: true,
    });
    backend.expectNone('/api/patients');

    await vi.advanceTimersByTimeAsync(12_000);
    backend.expectOne('/api/patients').flush({ items: [] });
    await expect(result).resolves.toEqual({ items: [] });
    backend.verify();
  });

  it('un second 429 sur le rejeu remonte au store sans nouveau rejeu', async () => {
    const { http, backend, notices } = setup();
    const result = firstValueFrom(http.get('/api/patients')).catch((e: unknown) => e);

    flush429(backend, '/api/patients', '1');
    await vi.advanceTimersByTimeAsync(1_000);
    flush429(backend, '/api/patients', '30');

    await expect(result).resolves.toMatchObject({ status: 429, code: 'RATE_LIMITED' });
    expect(notices.notice()).toMatchObject({ retryAfterSeconds: 30, replaying: false });
    backend.verify();
  });

  it('429 sur un POST : avis, aucun rejeu, la saisie reste au store', async () => {
    const { http, backend, notices } = setup();
    const result = firstValueFrom(http.post('/api/entries', { body: 'x' })).catch(
      (e: unknown) => e,
    );

    flush429(backend, '/api/entries', '5');
    await expect(result).resolves.toMatchObject({ status: 429, retryAfterSeconds: 5 });
    expect(notices.notice()).toMatchObject({
      kind: 'rate-limited',
      retryAfterSeconds: 5,
      replaying: false,
    });
    backend.verify();
  });

  it('sans Retry-After ou au-delà de deux minutes : avis sans rejeu', async () => {
    const { http, backend, notices } = setup();
    const noHeader = firstValueFrom(http.get('/api/a')).catch((e: unknown) => e);
    flush429(backend, '/api/a');
    await expect(noHeader).resolves.toMatchObject({ status: 429 });
    expect(notices.notice()).toMatchObject({ retryAfterSeconds: null, replaying: false });

    const tooLong = firstValueFrom(http.get('/api/b')).catch((e: unknown) => e);
    flush429(backend, '/api/b', '600');
    await expect(tooLong).resolves.toMatchObject({ status: 429, retryAfterSeconds: 600 });
    expect(notices.notice()).toMatchObject({ retryAfterSeconds: 600, replaying: false });
    backend.verify();
  });

  it('les autres erreurs passent sans avis', async () => {
    const { http, backend, notices } = setup();
    const result = firstValueFrom(http.get('/api/a')).catch((e: unknown) => e);
    backend
      .expectOne('/api/a')
      .flush({ status: 404, code: 'NOT_FOUND' }, { status: 404, statusText: 'Not Found' });
    await expect(result).resolves.toMatchObject({ status: 404 });
    expect(notices.notice()).toBeNull();
  });
});
