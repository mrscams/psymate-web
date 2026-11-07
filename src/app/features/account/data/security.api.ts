import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import {
  ActiveSessionResponse,
  AuthentificationService,
  DoubleAuthentificationService,
  LastLoginResponse,
  MeSecurityResponse,
  PasswordChangeRequest,
  SecuriteDuCompteService,
} from '../../../api';

/** Une session ouverte du praticien (GET /api/me/security, contrat v0.11.0). */
export interface ActiveSession {
  /** Identifiant opaque, à passer à POST /api/me/sessions/{id}/revoke ; jamais le cookie. */
  id: string;
  /** « Chrome · Windows », ou null pour une session antérieure à la fonction. */
  device: string | null;
  /** Toujours null en V1 (aucune géolocalisation) ; affichée si elle arrive un jour. */
  city: string | null;
  createdAt: string;
  lastAccessAt: string;
  expiresAt: string;
  /** La session qui porte l'appel : une seule par réponse. */
  current: boolean;
}

/** Connexion précédente : la dernière réussie avant l'ouverture de la session courante. */
export interface LastLogin {
  at: string;
  device: string | null;
  city: string | null;
}

export interface SecurityOverview {
  sessions: ActiveSession[];
  /** null à la toute première connexion ou pour une session ouverte avant la fonction. */
  lastLogin: LastLogin | null;
}

/** Secret en attente (POST /api/me/2fa/enable) : montré une seule fois, dans le panneau. */
export interface TwoFactorEnrollment {
  secret: string;
  otpauthUri: string;
}

export interface PasswordChangeInput {
  email: string;
  currentPassword: string;
  newPassword: string;
  /** Code TOTP ou de secours, seulement après un 202 otpRequired. */
  otp?: string;
}

/** 204 : changé, toutes les sessions révoquées ; 202 : 2FA active, code à envoyer. */
export type PasswordChangeOutcome = 'changed' | 'otp-required';

/**
 * Service de données de Compte et sécurité (fiche 18) : avec verification.api.ts, les seuls
 * fichiers de features/account qui importent le client généré. Les erreurs arrivent en ApiProblem.
 */
@Injectable({ providedIn: 'root' })
export class SecurityApi {
  private readonly security = inject(SecuriteDuCompteService);
  private readonly twoFactor = inject(DoubleAuthentificationService);
  private readonly auth = inject(AuthentificationService);

  /** GET /api/me/security : sessions actives (la courante marquée) et connexion précédente. */
  async loadSecurity(): Promise<SecurityOverview> {
    return toOverview(await firstValueFrom(this.security.getMeSecurity()));
  }

  /** POST /api/me/sessions/{id}/revoke → 204 (404 SESSION_NOT_FOUND, 409 CURRENT_SESSION). */
  async revokeSession(id: string): Promise<void> {
    await firstValueFrom(this.security.revokeSession(id));
  }

  /** POST /api/auth/sessions/revoke-others → nombre de sessions fermées (0 compris). */
  async revokeOtherSessions(): Promise<number> {
    const response = await firstValueFrom(this.auth.revokeOtherSessions());
    return response.revoked ?? 0;
  }

  /** POST /api/me/2fa/enable → secret Base32 + URI otpauth:// (409 TWO_FACTOR_ALREADY_ENABLED). */
  async enableTwoFactor(): Promise<TwoFactorEnrollment> {
    const response = await firstValueFrom(this.twoFactor.enableTwoFactor());
    return { secret: response.secret ?? '', otpauthUri: response.otpauthUri ?? '' };
  }

  /** POST /api/me/2fa/verify → les 10 codes de secours (422 INVALID_CODE, 409, 423). */
  async verifyTwoFactor(code: string): Promise<string[]> {
    const response = await firstValueFrom(this.twoFactor.verifyTwoFactor({ code }));
    return response.recoveryCodes ?? [];
  }

  /** POST /api/me/2fa/recovery-codes/regenerate → 10 nouveaux codes, les anciens invalidés. */
  async regenerateRecoveryCodes(): Promise<string[]> {
    const response = await firstValueFrom(this.twoFactor.regenerateRecoveryCodes());
    return response.recoveryCodes ?? [];
  }

  /** POST /api/me/2fa/disable → 204 (422 INVALID_PASSWORD / INVALID_CODE, 409, 423). */
  async disableTwoFactor(password: string, code: string): Promise<void> {
    await firstValueFrom(this.twoFactor.disableTwoFactor({ password, code }));
  }

  /**
   * POST /api/auth/password/change (public : e-mail + mot de passe actuel prouvent l'identité).
   * 204 : changé, toutes les sessions révoquées, aucune ouverte ; 202 : code 2FA à fournir.
   */
  async changePassword(input: PasswordChangeInput): Promise<PasswordChangeOutcome> {
    const body: PasswordChangeRequest = {
      email: input.email,
      currentPassword: input.currentPassword,
      newPassword: input.newPassword,
      ...(input.otp ? { otp: input.otp } : {}),
    };
    const response = await firstValueFrom(this.auth.changePassword(body, 'response'));
    return response.status === 202 ? 'otp-required' : 'changed';
  }

  /**
   * POST /api/auth/email/change, variante avec session : { newEmail, password } → 202 (lien envoyé
   * à la nouvelle adresse) ; 422 INVALID_PASSWORD sur password (G Q49), 423 verrou par compte.
   */
  async changeEmail(newEmail: string, password: string): Promise<void> {
    await firstValueFrom(this.auth.changeEmail({ newEmail, password }));
  }
}

function toOverview(dto: MeSecurityResponse): SecurityOverview {
  return {
    sessions: (dto.sessions ?? []).map(toSession),
    lastLogin: dto.lastLogin ? toLastLogin(dto.lastLogin) : null,
  };
}

function toSession(dto: ActiveSessionResponse): ActiveSession {
  return {
    id: dto.id ?? '',
    device: dto.device ?? null,
    city: dto.city ?? null,
    createdAt: dto.createdAt ?? '',
    lastAccessAt: dto.lastAccessAt ?? '',
    expiresAt: dto.expiresAt ?? '',
    current: dto.current ?? false,
  };
}

function toLastLogin(dto: LastLoginResponse): LastLogin | null {
  if (!dto.at) return null;
  return { at: dto.at, device: dto.device ?? null, city: dto.city ?? null };
}
