import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ACCEPT_LANGUAGE, localeInterceptor } from './locale.interceptor';

function setup(localeId: string) {
  TestBed.configureTestingModule({
    providers: [
      { provide: LOCALE_ID, useValue: localeId },
      provideHttpClient(withInterceptors([localeInterceptor])),
      provideHttpClientTesting(),
    ],
  });
  return {
    http: TestBed.inject(HttpClient),
    backend: TestBed.inject(HttpTestingController),
  };
}

describe('localeInterceptor', () => {
  it.each([
    ['fr', 'fr'],
    ['en', 'en'],
    ['en-US', 'en'],
    ['de', 'fr'],
  ])('bundle %s : l’API reçoit Accept-Language %s', (localeId, expected) => {
    const { http, backend } = setup(localeId);
    http.get('/api/patients').subscribe();

    const call = backend.expectOne('/api/patients');
    expect(call.request.headers.get(ACCEPT_LANGUAGE)).toBe(expected);
    call.flush([]);
    backend.verify();
  });

  it.each([
    ['ar', 'ar'],
    ['fr', 'fr'],
    ['en', 'en'],
  ])('trois langues (Q79, M16-08) : depuis /%s/, Accept-Language %s', (localeId, expected) => {
    const { http, backend } = setup(localeId);
    http.post('/api/auth/login', {}).subscribe();

    const call = backend.expectOne('/api/auth/login');
    expect(call.request.headers.get(ACCEPT_LANGUAGE)).toBe(expected);
    call.flush({});
    backend.verify();
  });

  it('garde l’en-tête posé par l’appelant', () => {
    const { http, backend } = setup('fr');
    http.get('/api/patients/p1/export', { headers: { [ACCEPT_LANGUAGE]: 'en' } }).subscribe();

    const call = backend.expectOne('/api/patients/p1/export');
    expect(call.request.headers.get(ACCEPT_LANGUAGE)).toBe('en');
    call.flush({});
    backend.verify();
  });

  it('ne touche pas aux appels hors de l’API', () => {
    const { http, backend } = setup('en');
    http.get('/assets/logo.svg', { responseType: 'text' }).subscribe();

    const call = backend.expectOne('/assets/logo.svg');
    expect(call.request.headers.has(ACCEPT_LANGUAGE)).toBe(false);
    call.flush('');
    backend.verify();
  });
});
