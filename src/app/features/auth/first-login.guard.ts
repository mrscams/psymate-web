import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { afterLogin, SessionStore } from '../../core/auth';

/**
 * /premiere-connexion (fiche 18 C) n'a de sens que pour un compte bloqué : sans session (le login a
 * répondu 403 PASSWORD_CHANGE_REQUIRED, étape 1), mot de passe à usage unique à remplacer, ou
 * administrateur sans 2FA (étape 2). Tout autre compte repart où le triage l'aurait mené.
 */
export const firstLoginGuard: CanActivateFn = () => {
  const me = inject(SessionStore).me();
  if (!me || me.passwordChangeRequired) return true;
  if (me.role === 'admin' && !me.twoFactorEnabled) return true;
  return inject(Router).parseUrl(afterLogin(me));
};
