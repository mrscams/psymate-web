import { HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject, Injector } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { AUTH_PATHS } from '../auth/auth-paths';
import { SessionStore } from '../auth/session.store';
import { ApiProblem, isApiProblem } from './api-problem';
import { SKIP_AUTH_REDIRECT } from './http-context';

/** 403 d'état et la route où chacun mène (handbook §6.4, fiches 00, 18, 27). */
const STATE_REDIRECTS: Readonly<Record<string, string>> = {
  EMAIL_NOT_CONFIRMED: AUTH_PATHS.confirmEmail,
  ACCOUNT_SUSPENDED: AUTH_PATHS.suspended,
  PASSWORD_CHANGE_REQUIRED: AUTH_PATHS.firstLogin,
  TWO_FACTOR_REQUIRED: AUTH_PATHS.firstLogin,
  ADMIN_ROLE_REQUIRED: AUTH_PATHS.home,
};

/**
 * Routes qui vérifient des identifiants saisis : leur 401 (INVALID_CREDENTIALS) est un message de
 * l'écran (« identifiants incorrects »), pas une session expirée.
 */
const CREDENTIAL_CHECKS = [
  '/api/auth/login',
  '/api/auth/password/change',
  '/api/auth/email/change',
];

function isCredentialCheck(req: HttpRequest<unknown>): boolean {
  const path = req.url.split('?', 1)[0];
  return CREDENTIAL_CHECKS.includes(path);
}

/**
 * Redirections transverses (handbook §6.4) : 401 → oubli de la session et /connexion?next=… ;
 * 403 d'état → /confirmer-email, /compte-suspendu, /premiere-connexion ou /patients. L'erreur est
 * toujours relancée : le store appelant sort de son état « chargement ».
 * Placé avant problem.interceptor : il reçoit des ApiProblem.
 */
export const authRedirectInterceptor: HttpInterceptorFn = (req, next) => {
  const injector = inject(Injector);
  return next(req).pipe(
    catchError((error: unknown) => {
      if (isApiProblem(error) && !req.context.get(SKIP_AUTH_REDIRECT)) {
        redirectFor(error, req, injector);
      }
      return throwError(() => error);
    }),
  );
};

function redirectFor(problem: ApiProblem, req: HttpRequest<unknown>, injector: Injector): void {
  const router = injector.get(Router);

  if (problem.status === 401) {
    if (isCredentialCheck(req)) return;
    injector.get(SessionStore).clear();
    const current = currentUrl(router);
    if (isUnder(current, AUTH_PATHS.login)) return;
    void router.navigate([AUTH_PATHS.login], { queryParams: { next: current } });
    return;
  }

  if (problem.status === 403) {
    const target = STATE_REDIRECTS[problem.code];
    if (!target) return; // PATIENT_FORBIDDEN… : état d'erreur du bloc, géré par le store.
    if (problem.code === 'ACCOUNT_SUSPENDED') injector.get(SessionStore).clear();
    if (isUnder(currentUrl(router), target)) return;
    void router.navigateByUrl(target);
  }
}

/** URL visée : la navigation en cours si une garde ou un resolver a lancé l'appel, sinon l'URL affichée. */
function currentUrl(router: Router): string {
  const navigation = router.currentNavigation();
  return navigation
    ? router.serializeUrl(navigation.finalUrl ?? navigation.extractedUrl)
    : router.url;
}

function isUnder(url: string, path: string): boolean {
  const bare = url.split(/[?#]/, 1)[0];
  return bare === path || bare.startsWith(`${path}/`);
}
