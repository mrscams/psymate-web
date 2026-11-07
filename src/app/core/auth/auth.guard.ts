import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { afterLogin } from './after-login';
import { AUTH_PATHS } from './auth-paths';
import { SessionStore } from './session.store';

/** Route réservée à un compte connecté ; sinon /connexion?next=<route demandée>. */
export const authGuard: CanActivateFn = (_route, state) => {
  if (inject(SessionStore).authenticated()) return true;
  return inject(Router).createUrlTree([AUTH_PATHS.login], { queryParams: { next: state.url } });
};

/** /connexion pour un compte déjà connecté : il va où le triage l'aurait mené (fiche 11). */
export const guestGuard: CanActivateFn = (route) => {
  const me = inject(SessionStore).me();
  if (!me) return true;
  return inject(Router).parseUrl(afterLogin(me, route.queryParamMap.get('next')));
};
