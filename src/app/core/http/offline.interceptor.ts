import { DOCUMENT } from '@angular/common';
import { HttpEvent, HttpEventType, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, fromEvent, merge, switchMap, take, tap, throwError } from 'rxjs';

import { isApiProblem } from './api-problem';
import { REPLAYED_AFTER_OFFLINE } from './http-context';
import { HttpNotices } from './http-notices';

/**
 * Aucune réponse du serveur (statut 0 ; handbook §6.4, planche 29) : le bandeau « Connexion perdue ·
 * vos brouillons sont conservés » s'allume. Si le navigateur se sait hors ligne, la requête est
 * retenue et rejouée une fois au retour du réseau (événement online) ou sur « Réessayer
 * maintenant » ; sinon (serveur injoignable), l'erreur remonte tout de suite au store, qui garde la
 * saisie. Toute réponse reçue ensuite éteint le bandeau. Placé avant problem.interceptor.
 */
export const offlineInterceptor: HttpInterceptorFn = (req, next) => {
  const notices = inject(HttpNotices);
  const window = inject(DOCUMENT).defaultView;
  const navigatorOffline = (): boolean => window?.navigator?.onLine === false;

  const online = tap<HttpEvent<unknown>>((event) => {
    if (event.type === HttpEventType.Response) notices.backOnline();
  });
  const isNetworkError = (error: unknown): boolean => isApiProblem(error) && error.status === 0;

  return next(req).pipe(
    online,
    catchError((error: unknown) => {
      if (!isNetworkError(error)) return throwError(() => error);
      notices.wentOffline();
      if (!window || !navigatorOffline() || req.context.get(REPLAYED_AFTER_OFFLINE)) {
        return throwError(() => error);
      }
      notices.hold();
      return merge(fromEvent(window, 'online'), notices.retryRequests).pipe(
        take(1),
        switchMap(() => {
          notices.backOnline();
          notices.release();
          return next(req.clone({ context: req.context.set(REPLAYED_AFTER_OFFLINE, true) })).pipe(
            online,
            catchError((replayError: unknown) => {
              if (isNetworkError(replayError)) notices.wentOffline();
              return throwError(() => replayError);
            }),
          );
        }),
      );
    }),
  );
};
