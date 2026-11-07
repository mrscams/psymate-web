import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AUTH_PATHS, SessionStore } from '../../core/auth';

/**
 * Un administrateur sans double authentification n'entre pas dans /admin (G Q5, fiche 18 C) : il
 * est renvoyé à l'étape 2 de la première connexion. Placé après roleGuard('admin') ; le serveur
 * reste juge (403 TWO_FACTOR_REQUIRED sur /api/admin/**, redirigé par core/http).
 */
export const adminTwoFactorGuard: CanActivateFn = () => {
  const session = inject(SessionStore);
  if (session.isAdmin() && !session.twoFactorEnabled()) {
    return inject(Router).parseUrl(AUTH_PATHS.firstLogin);
  }
  return true;
};
