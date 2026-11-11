import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import {
  AuthentificationService,
  RegisterRequest,
  RegisterRequestProfessionEnum,
} from '../../../api';
import { Profession } from '../../../core/auth';

/** Saisie de l'écran d'inscription (fiche 12), déjà nettoyée par la page (blancs de bord retirés). */
export interface RegisterInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  profession: Profession;
  professionalNumber: string;
  phone: string;
  remoteOnly: boolean;
  address: { street: string; postalCode: string; city: string };
  consents: { terms: boolean; privacy: boolean };
}

/**
 * Service de données de l'inscription et du mot de passe oublié : avec login.api.ts, les seuls
 * fichiers de features/auth qui importent le client généré.
 */
@Injectable({ providedIn: 'root' })
export class RegisterApi {
  private readonly auth = inject(AuthentificationService);

  /**
   * POST /api/auth/register → 201 (identique que l'adresse soit connue ou non : anti-énumération).
   * Le 422 (VALIDATION_FAILED, PASSWORD_POLICY) arrive en ApiProblem avec errors[].
   * L'adresse n'est envoyée que si le praticien n'exerce pas uniquement à distance ; le numéro
   * professionnel seulement s'il est renseigné (absent = non renseigné, contrat).
   */
  async register(input: RegisterInput): Promise<void> {
    const body: RegisterRequest = {
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      password: input.password,
      profession: input.profession as RegisterRequestProfessionEnum,
      phone: input.phone,
      remoteOnly: input.remoteOnly,
      consents: { terms: input.consents.terms, privacy: input.consents.privacy },
      ...(input.professionalNumber ? { professionalNumber: input.professionalNumber } : {}),
      ...(input.remoteOnly ? {} : { address: input.address }),
    };
    await firstValueFrom(this.auth.register(body));
  }

  /** POST /api/auth/password-reset/request → 202 dans tous les cas (jamais d'énumération). */
  async requestPasswordReset(email: string): Promise<void> {
    await firstValueFrom(this.auth.requestReset({ email }));
  }

  /**
   * POST /api/auth/password-reset/confirm { token, password } → 204 : mot de passe remplacé, toutes
   * les sessions du compte révoquées, aucune session ouverte (contrat). 410 TOKEN_INVALID_OR_EXPIRED
   * (jeton inconnu, expiré, déjà utilisé ou remplacé) et 422 PASSWORD_POLICY en ApiProblem.
   */
  async confirmPasswordReset(token: string, password: string): Promise<void> {
    await firstValueFrom(this.auth.confirmReset({ token, password }));
  }
}
