import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AuthentificationService, PasswordChangeRequest } from '../../../api';

export interface FirstLoginPasswordInput {
  email: string;
  currentPassword: string;
  newPassword: string;
  /** Code TOTP ou de secours, seulement après un 202 otpRequired. */
  otp?: string;
}

/** 204 : remplacé, toutes les sessions révoquées ; 202 : 2FA active, code à envoyer. */
export type FirstLoginPasswordOutcome = 'changed' | 'otp-required';

/**
 * Service de données de la première connexion (fiche 18 C) : avec login.api.ts et register.api.ts,
 * les seuls fichiers de features/auth qui importent le client généré.
 */
@Injectable({ providedIn: 'root' })
export class FirstLoginApi {
  private readonly auth = inject(AuthentificationService);

  /**
   * POST /api/auth/password/change, public : e-mail + mot de passe à usage unique prouvent
   * l'identité (G Q5). Les erreurs (401, 403, 422, 423) arrivent en ApiProblem.
   */
  async changePassword(input: FirstLoginPasswordInput): Promise<FirstLoginPasswordOutcome> {
    const body: PasswordChangeRequest = {
      email: input.email,
      currentPassword: input.currentPassword,
      newPassword: input.newPassword,
      ...(input.otp ? { otp: input.otp } : {}),
    };
    const response = await firstValueFrom(this.auth.changePassword(body, 'response'));
    return response.status === 202 ? 'otp-required' : 'changed';
  }
}
