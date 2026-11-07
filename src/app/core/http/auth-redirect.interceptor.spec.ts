import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { SessionApi } from '../auth/data/session.api';
import { SessionStore } from '../auth/session.store';
import { authRedirectInterceptor } from './auth-redirect.interceptor';
import { credentialsInterceptor } from './credentials.interceptor';
import { SKIP_AUTH_REDIRECT } from './http-context';
import { problemInterceptor } from './problem.interceptor';

async function setup(initialUrl = '/') {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: '**', children: [] }]),
      provideHttpClient(
        withInterceptors([credentialsInterceptor, authRedirectInterceptor, problemInterceptor]),
      ),
      provideHttpClientTesting(),
      { provide: SessionApi, useValue: {} },
    ],
  });
  const router = TestBed.inject(Router);
  await router.navigateByUrl(initialUrl);
  const session = TestBed.inject(SessionStore);
  session.signIn({
    id: '1',
    email: 'claire@example.test',
    displayName: 'Claire',
    profession: 'psychologist',
    verificationStatus: 'approved',
    role: 'practitioner',
    twoFactorEnabled: false,
    passwordChangeRequired: false,
  });
  return {
    http: TestBed.inject(HttpClient),
    backend: TestBed.inject(HttpTestingController),
    router,
    session,
    navigate: vi.spyOn(router, 'navigate').mockResolvedValue(true),
    navigateByUrl: vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true),
  };
}

async function fail(
  ctx: Awaited<ReturnType<typeof setup>>,
  url: string,
  status: number,
  code: string,
  context?: HttpContext,
): Promise<unknown> {
  const result = firstValueFrom(ctx.http.post(url, {}, { context })).catch((e: unknown) => e);
  ctx.backend.expectOne(url).flush({ status, code, detail: code }, { status, statusText: code });
  return result;
}

describe('authRedirectInterceptor', () => {
  it('401 : oublie la session et mène à /connexion?next=<url courante>', async () => {
    const ctx = await setup('/patients/42');
    const error = await fail(ctx, '/api/patients/42/overview', 401, 'UNAUTHENTICATED');

    expect(error).toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
    expect(ctx.session.authenticated()).toBe(false);
    expect(ctx.navigate).toHaveBeenCalledWith(['/connexion'], {
      queryParams: { next: '/patients/42' },
    });
  });

  it('401 de POST /api/auth/login : message de l’écran, pas de redirection', async () => {
    const ctx = await setup();
    await fail(ctx, '/api/auth/login', 401, 'INVALID_CREDENTIALS');
    expect(ctx.navigate).not.toHaveBeenCalled();
    expect(ctx.session.authenticated()).toBe(true);
  });

  it('SKIP_AUTH_REDIRECT (GET /api/auth/me au démarrage) : pas de redirection', async () => {
    const ctx = await setup();
    await fail(
      ctx,
      '/api/auth/me',
      401,
      'UNAUTHENTICATED',
      new HttpContext().set(SKIP_AUTH_REDIRECT, true),
    );
    expect(ctx.navigate).not.toHaveBeenCalled();
  });

  it.each([
    ['EMAIL_NOT_CONFIRMED', '/confirmer-email'],
    ['ACCOUNT_SUSPENDED', '/compte-suspendu'],
    ['PASSWORD_CHANGE_REQUIRED', '/premiere-connexion'],
    ['TWO_FACTOR_REQUIRED', '/premiere-connexion'],
    ['ADMIN_ROLE_REQUIRED', '/patients'],
  ])('403 %s → %s', async (code, target) => {
    const ctx = await setup('/admin');
    const error = await fail(ctx, '/api/admin/journal', 403, code);
    expect(error).toMatchObject({ status: 403, code });
    expect(ctx.navigateByUrl).toHaveBeenLastCalledWith(target);
  });

  it('403 ACCOUNT_SUSPENDED oublie aussi la session (révoquée côté serveur)', async () => {
    const ctx = await setup();
    await fail(ctx, '/api/patients', 403, 'ACCOUNT_SUSPENDED');
    expect(ctx.session.authenticated()).toBe(false);
  });

  it('403 PATIENT_FORBIDDEN : pas de redirection, le store affiche l’erreur', async () => {
    const ctx = await setup();
    ctx.navigateByUrl.mockClear();
    await fail(ctx, '/api/patients/9', 403, 'PATIENT_FORBIDDEN');
    expect(ctx.navigateByUrl).not.toHaveBeenCalled();
  });
});

describe('credentialsInterceptor', () => {
  it('ajoute withCredentials et Accept JSON + problem+json aux appels /api', async () => {
    const ctx = await setup();
    void firstValueFrom(ctx.http.get('/api/auth/me'));
    const req = ctx.backend.expectOne('/api/auth/me');
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.headers.get('Accept')).toBe('application/json, application/problem+json');
    req.flush({});
  });

  it('garde l’Accept d’un téléchargement et ne touche pas aux autres origines', async () => {
    const ctx = await setup();
    void firstValueFrom(ctx.http.get('/api/me/export/1/file', { responseType: 'blob' }));
    void firstValueFrom(ctx.http.get('/assets/x.json'));
    const download = ctx.backend.expectOne('/api/me/export/1/file');
    expect(download.request.headers.has('Accept')).toBe(false);
    const asset = ctx.backend.expectOne('/assets/x.json');
    expect(asset.request.withCredentials).toBe(false);
    download.flush(new Blob());
    asset.flush({});
  });
});
