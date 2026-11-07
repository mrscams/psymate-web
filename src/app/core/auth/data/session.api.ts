import { HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AuthentificationService, MeResponse } from '../../../api';
import { SKIP_AUTH_REDIRECT } from '../../http/http-context';
import { SessionUser } from '../session.model';

/** Traduit le MeResponse du contrat en modèle de vue (champs absents → valeurs neutres). */
export function toSessionUser(me: MeResponse): SessionUser {
  return {
    id: me.id ?? '',
    email: me.email ?? '',
    displayName: me.displayName ?? '',
    profession: me.profession ?? null,
    verificationStatus: me.verificationStatus ?? null,
    role: me.role === 'admin' ? 'admin' : 'practitioner',
    twoFactorEnabled: me.twoFactorEnabled ?? false,
    passwordChangeRequired: me.passwordChangeRequired ?? false,
  };
}

/** Service de données de la session : seul fichier de core/auth qui parle au client généré. */
@Injectable({ providedIn: 'root' })
export class SessionApi {
  private readonly auth = inject(AuthentificationService);

  /**
   * GET /api/auth/me. Le 401 « pas de session » est attendu (démarrage, pages publiques) : il ne
   * déclenche pas la redirection vers /connexion, l'appelant décide.
   */
  async me(): Promise<SessionUser> {
    const context = new HttpContext().set(SKIP_AUTH_REDIRECT, true);
    return toSessionUser(await firstValueFrom(this.auth.me('body', false, { context })));
  }

  /** POST /api/auth/logout : 204, même sans session valide (idempotent). */
  async logout(): Promise<void> {
    await firstValueFrom(this.auth.logout());
  }
}
