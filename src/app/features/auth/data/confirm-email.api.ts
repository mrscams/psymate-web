import { HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AuthentificationService } from '../../../api';
import { VerificationStatus } from '../../../core/auth';
import { SKIP_AUTH_REDIRECT } from '../../../core/http';

/** État de session relu par GET /api/auth/session (fiche 25 : polling discret). */
export interface SessionCheck {
  email: string;
  emailConfirmed: boolean;
  verificationStatus: VerificationStatus | null;
}

/**
 * Service de données de la confirmation d'e-mail (fiche 25) : avec login.api.ts et register.api.ts,
 * l'un des fichiers de features/auth qui importent le client généré.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmEmailApi {
  private readonly auth = inject(AuthentificationService);

  /**
   * POST /api/auth/email/confirm → 204 : adresse confirmée, session ouverte (cookie) pour un jeton
   * d'inscription. 410 TOKEN_INVALID_OR_EXPIRED (inconnu, déjà utilisé, expiré, remplacé) arrive en
   * ApiProblem.
   */
  async confirm(token: string): Promise<void> {
    await firstValueFrom(this.auth.confirmEmail({ token }));
  }

  /** POST /api/auth/email/resend → 202 dans tous les cas (anti-énumération ; 1 / min, 5 / jour). */
  async resend(email: string): Promise<void> {
    await firstValueFrom(this.auth.resendEmail({ email }));
  }

  /**
   * POST /api/auth/email/change, variante publique d'un compte email_pending : { email, password,
   * newEmail } → 202 dans tous les cas (G Q49). Avec une session, l'API ignore `email`.
   */
  async changeEmail(email: string, password: string, newEmail: string): Promise<void> {
    await firstValueFrom(this.auth.changeEmail({ email, password, newEmail }));
  }

  /**
   * GET /api/auth/session : statut à jour. Sans session le 401 est attendu (la confirmation n'a pas
   * encore eu lieu dans ce navigateur) : il ne doit pas renvoyer vers /connexion.
   */
  async session(): Promise<SessionCheck> {
    const context = new HttpContext().set(SKIP_AUTH_REDIRECT, true);
    const response = await firstValueFrom(this.auth.session('body', false, { context }));
    return {
      email: response.email ?? '',
      emailConfirmed: response.emailConfirmed ?? false,
      verificationStatus: response.verificationStatus ?? null,
    };
  }
}
