import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AuthentificationService, LoginRequest } from '../../../api';
import { SessionUser, toSessionUser } from '../../../core/auth';

export interface LoginCredentials {
  email: string;
  password: string;
  /** Code TOTP à 6 chiffres ou code de secours ; seulement après un 202 otpRequired. */
  otp?: string;
  rememberMe: boolean;
}

/** 200 : session ouverte ; 202 : mot de passe correct, 2FA active, code à envoyer. */
export type LoginOutcome = { kind: 'signed-in'; user: SessionUser } | { kind: 'otp-required' };

/** Service de données de la connexion : seul fichier de features/auth qui importe le client généré. */
@Injectable({ providedIn: 'root' })
export class LoginApi {
  private readonly auth = inject(AuthentificationService);

  /** POST /api/auth/login. Les erreurs (401, 403, 422, 423…) arrivent en ApiProblem. */
  async login(credentials: LoginCredentials): Promise<LoginOutcome> {
    const body: LoginRequest = {
      email: credentials.email,
      password: credentials.password,
      rememberMe: credentials.rememberMe,
      ...(credentials.otp ? { otp: credentials.otp } : {}),
    };
    const response = await firstValueFrom(this.auth.login(body, 'response'));
    if (response.status === 202) return { kind: 'otp-required' };
    return { kind: 'signed-in', user: toSessionUser(response.body ?? {}) };
  }
}
