import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AUTH_PATHS } from './auth-paths';
import { Role } from './session.model';
import { SessionStore } from './session.store';

/**
 * Route réservée à un rôle (roleGuard('admin') sur /admin/**) : sans session → /connexion?next= ;
 * autre rôle → /patients (fiche 00). Le serveur reste juge (403 ADMIN_ROLE_REQUIRED).
 */
export function roleGuard(role: Role): CanActivateFn {
  return (_route, state) => {
    const session = inject(SessionStore);
    const router = inject(Router);
    if (!session.authenticated()) {
      return router.createUrlTree([AUTH_PATHS.login], { queryParams: { next: state.url } });
    }
    return session.role() === role ? true : router.parseUrl(AUTH_PATHS.home);
  };
}
