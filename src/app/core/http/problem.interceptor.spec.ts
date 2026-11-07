import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { ApiProblem, asProblem, isApiProblem } from './api-problem';
import { problemInterceptor } from './problem.interceptor';

function setup(): { http: HttpClient; backend: HttpTestingController } {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([problemInterceptor])),
      provideHttpClientTesting(),
    ],
  });
  return { http: TestBed.inject(HttpClient), backend: TestBed.inject(HttpTestingController) };
}

/** Lance une requête, laisse le test y répondre, renvoie ce que l'appelant reçoit en erreur. */
async function failure(
  respond: (backend: HttpTestingController) => void,
  url = '/api/patients',
): Promise<unknown> {
  const { http, backend } = setup();
  const result = firstValueFrom(http.post(url, {})).then(
    () => {
      throw new Error('la requête aurait dû échouer');
    },
    (error: unknown) => error,
  );
  respond(backend);
  const error = await result;
  backend.verify();
  return error;
}

describe('problemInterceptor', () => {
  it('un 422 problem+json devient un ApiProblem avec errors[]', async () => {
    const error = await failure((backend) =>
      backend.expectOne('/api/patients').flush(
        {
          type: 'about:blank',
          title: 'Unprocessable Entity',
          status: 422,
          detail: 'Certains champs sont invalides.',
          instance: '/api/patients',
          code: 'VALIDATION_FAILED',
          errors: [
            { field: 'displayName', code: 'REQUIRED', message: 'Le nom affiché est obligatoire.' },
            { field: 'birthDate', code: 'INVALID_FIELD', message: 'Date invalide.' },
          ],
        },
        {
          status: 422,
          statusText: 'Unprocessable Entity',
          headers: { 'Content-Type': 'application/problem+json' },
        },
      ),
    );

    expect(isApiProblem(error)).toBe(true);
    expect(error).toEqual<ApiProblem>({
      status: 422,
      code: 'VALIDATION_FAILED',
      detail: 'Certains champs sont invalides.',
      errors: [
        { field: 'displayName', code: 'REQUIRED', message: 'Le nom affiché est obligatoire.' },
        { field: 'birthDate', code: 'INVALID_FIELD', message: 'Date invalide.' },
      ],
    });
  });

  it('423 : retryAfterSeconds du corps', async () => {
    const error = await failure((backend) =>
      backend
        .expectOne('/api/patients')
        .flush(
          { status: 423, code: 'ACCOUNT_LOCKED', detail: 'Verrouillé.', retryAfterSeconds: 840 },
          { status: 423, statusText: 'Locked', headers: { 'Retry-After': '840' } },
        ),
    );
    expect(error).toMatchObject({ status: 423, code: 'ACCOUNT_LOCKED', retryAfterSeconds: 840 });
  });

  it('429 sans champ : Retry-After lu dans l’en-tête', async () => {
    const error = await failure((backend) =>
      backend
        .expectOne('/api/patients')
        .flush(
          { status: 429, code: 'RATE_LIMITED', detail: 'Trop de requêtes.' },
          { status: 429, statusText: 'Too Many Requests', headers: { 'Retry-After': '12' } },
        ),
    );
    expect(error).toMatchObject({ status: 429, code: 'RATE_LIMITED', retryAfterSeconds: 12 });
  });

  it('garde les champs complémentaires dans extra', async () => {
    const error = await failure((backend) =>
      backend.expectOne('/api/patients').flush(
        {
          status: 409,
          code: 'LINK_EXISTS',
          detail: 'Ce lien existe déjà.',
          existingLinkId: 'abc',
        },
        { status: 409, statusText: 'Conflict' },
      ),
    );
    expect(error).toMatchObject({ code: 'LINK_EXISTS', extra: { existingLinkId: 'abc' } });
  });

  it('un corps problem+json reçu en texte est relu', async () => {
    const error = await failure((backend) =>
      backend
        .expectOne('/api/patients')
        .flush('{"status":401,"code":"UNAUTHENTICATED","detail":"Session absente."}', {
          status: 401,
          statusText: 'Unauthorized',
        }),
    );
    expect(error).toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
  });

  it('5xx sans problem+json → INTERNAL_ERROR', async () => {
    const error = await failure((backend) =>
      backend.expectOne('/api/patients').flush('<html>Bad gateway</html>', {
        status: 502,
        statusText: 'Bad Gateway',
      }),
    );
    expect(error).toEqual({ status: 502, code: 'INTERNAL_ERROR' });
  });

  it('pas de réponse (statut 0) → NETWORK_ERROR', async () => {
    const error = await failure((backend) =>
      backend.expectOne('/api/patients').error(new ProgressEvent('error')),
    );
    expect(error).toEqual({ status: 0, code: 'NETWORK_ERROR' });
  });

  it('asProblem() laisse passer un ApiProblem et range le reste en UNKNOWN_ERROR', () => {
    const problem: ApiProblem = { status: 404, code: 'NOT_FOUND' };
    expect(asProblem(problem)).toBe(problem);
    expect(asProblem(new Error('x'))).toEqual({ status: 0, code: 'UNKNOWN_ERROR' });
  });
});
