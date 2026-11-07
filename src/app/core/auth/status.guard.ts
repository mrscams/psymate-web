import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { statusRedirect } from './after-login';
import { SessionStore } from './session.store';

/**
 * Redirections d'état d'un compte connecté (fiche 00) : passwordChangeRequired → /premiere-connexion,
 * email_pending → /confirmer-email, rejected | suspended | closed → /compte-suspendu. À placer après
 * authGuard ; sans session, laisse passer (authGuard décide).
 */
export const statusGuard: CanActivateFn = () => {
  const me = inject(SessionStore).me();
  const target = me ? statusRedirect(me) : null;
  return target ? inject(Router).parseUrl(target) : true;
};
