import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { HttpNotices } from './http-notices';
import { offlineInterceptor } from './offline.interceptor';
import { problemInterceptor } from './problem.interceptor';

function setup(onLine: boolean) {
  vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(onLine);
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([offlineInterceptor, problemInterceptor])),
      provideHttpClientTesting(),
    ],
  });
  return {
    http: TestBed.inject(HttpClient),
    backend: TestBed.inject(HttpTestingController),
    notices: TestBed.inject(HttpNotices),
  };
}

function networkError(backend: HttpTestingController, url: string): void {
  backend.expectOne(url).error(new ProgressEvent('error'));
}

describe('offlineInterceptor', () => {
  afterEach(() => vi.restoreAllMocks());

  it('navigateur hors ligne : bandeau, requête retenue puis rejouée une fois à l’événement online', async () => {
    const { http, backend, notices } = setup(false);
    let settled = false;
    const result = firstValueFrom(http.post('/api/entries', { body: 'brouillon' })).finally(() => {
      settled = true;
    });

    networkError(backend, '/api/entries');
    await Promise.resolve();
    expect(notices.offline()).toBe(true);
    expect(notices.pendingReplays()).toBe(1);
    expect(settled).toBe(false);
    backend.expectNone('/api/entries');

    window.dispatchEvent(new Event('online'));
    const replay = backend.expectOne('/api/entries');
    expect(replay.request.body).toEqual({ body: 'brouillon' });
    replay.flush({ id: 'e1' }, { status: 201, statusText: 'Created' });

    await expect(result).resolves.toEqual({ id: 'e1' });
    expect(notices.offline()).toBe(false);
    expect(notices.pendingReplays()).toBe(0);
    expect(notices.notice()).toMatchObject({ kind: 'reconnected', replayed: 1 });
    backend.verify();
  });

  it('« Réessayer maintenant » rejoue aussi ; un second échec remonte au store', async () => {
    const { http, backend, notices } = setup(false);
    const result = firstValueFrom(http.get('/api/patients')).catch((e: unknown) => e);

    networkError(backend, '/api/patients');
    await Promise.resolve();
    notices.retryNow();
    networkError(backend, '/api/patients');

    await expect(result).resolves.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
    expect(notices.offline()).toBe(true);
    backend.verify();
  });

  it('serveur injoignable alors que le navigateur est en ligne : erreur immédiate, bandeau allumé', async () => {
    const { http, backend, notices } = setup(true);
    const result = firstValueFrom(http.get('/api/patients')).catch((e: unknown) => e);
    networkError(backend, '/api/patients');
    await expect(result).resolves.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
    expect(notices.offline()).toBe(true);
    expect(notices.pendingReplays()).toBe(0);

    const next = firstValueFrom(http.get('/api/patients'));
    backend.expectOne('/api/patients').flush({ items: [] });
    await next;
    expect(notices.offline()).toBe(false);
    expect(notices.notice()).toMatchObject({ kind: 'reconnected', replayed: 0 });
  });

  it('les autres erreurs ne touchent pas au bandeau', async () => {
    const { http, backend, notices } = setup(false);
    const result = firstValueFrom(http.get('/api/a')).catch((e: unknown) => e);
    backend
      .expectOne('/api/a')
      .flush({ status: 500, code: 'INTERNAL_ERROR' }, { status: 500, statusText: 'Error' });
    await expect(result).resolves.toMatchObject({ status: 500 });
    expect(notices.offline()).toBe(false);
  });
});
