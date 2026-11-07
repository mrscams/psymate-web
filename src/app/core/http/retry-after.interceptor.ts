import { HttpEvent, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, Observable, switchMap, throwError, timer } from 'rxjs';

import { isApiProblem } from './api-problem';
import { REPLAYED_AFTER_429 } from './http-context';
import { HttpNotices } from './http-notices';

/** Au-delà, on ne retient pas la requête : l'écran affiche le délai et l'utilisateur relance. */
export const MAX_AUTO_REPLAY_SECONDS = 120;

/**
 * 429 RATE_LIMITED (handbook §6.4, planche 29) : avis « réessayez dans N s » avec le Retry-After,
 * saisie conservée (l'erreur remonte au store qui ne vide rien) ; un GET idempotent est rejoué une
 * seule fois à la fin du délai, sans action de l'utilisateur. Placé avant problem.interceptor :
 * il reçoit des ApiProblem.
 */
export const retryAfterInterceptor: HttpInterceptorFn = (req, next) => {
  const notices = inject(HttpNotices);

  const attempt = (request: HttpRequest<unknown>): Observable<HttpEvent<unknown>> =>
    next(request).pipe(
      catchError((error: unknown) => {
        if (!isApiProblem(error) || error.status !== 429) return throwError(() => error);
        const seconds = error.retryAfterSeconds ?? null;
        const replay =
          request.method === 'GET' &&
          !request.context.get(REPLAYED_AFTER_429) &&
          seconds !== null &&
          seconds <= MAX_AUTO_REPLAY_SECONDS;
        notices.rateLimited(seconds, replay);
        if (!replay) return throwError(() => error);
        return timer(seconds * 1000).pipe(
          switchMap(() =>
            attempt(request.clone({ context: request.context.set(REPLAYED_AFTER_429, true) })),
          ),
        );
      }),
    );

  return attempt(req);
};
