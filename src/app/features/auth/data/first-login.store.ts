import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

import { SessionStore } from '../../../core/auth';
import { ApiProblem, asProblem } from '../../../core/http';
import { FirstLoginApi, FirstLoginPasswordInput } from './first-login.api';
import { LoginApi } from './login.api';

/** Verrou par défaut si le 423 ne dit pas sa durée : 15 minutes (fiche 11). */
const DEFAULT_LOCK_SECONDS = 15 * 60;

/**
 * Issue de l'étape 1 : session ouverte avec le nouveau mot de passe ; code 2FA demandé par
 * password/change (202) ; mot de passe changé mais la reconnexion exige un code (compte praticien
 * avec 2FA : retour à /connexion) ; échec gardé dans `problem`.
 */
export type PasswordStepOutcome = 'signed-in' | 'otp-required' | 'relogin' | 'failed';

interface FirstLoginState {
  status: 'idle' | 'submitting';
  otpRequired: boolean;
  problem: ApiProblem | null;
  /** Fin du verrou (423 + Retry-After), en millisecondes depuis l'époque ; null sinon. */
  lockedUntil: number | null;
}

const initialState: FirstLoginState = {
  status: 'idle',
  otpRequired: false,
  problem: null,
  lockedUntil: null,
};

/**
 * Étape 1 de la première connexion (fiche 18 C, G Q5) : POST /api/auth/password/change puis, sur
 * 204, POST /api/auth/login avec le nouveau mot de passe (décision de la fiche : le contrat n'ouvre
 * aucune session). L'étape 2 (2FA) est portée par features/account (TwoFactorSetupComponent).
 */
export const FirstLoginStore = signalStore(
  withState(initialState),
  withMethods(
    (
      store,
      api = inject(FirstLoginApi),
      login = inject(LoginApi),
      session = inject(SessionStore),
    ) => ({
      async changePassword(input: FirstLoginPasswordInput): Promise<PasswordStepOutcome> {
        patchState(store, { status: 'submitting', problem: null });
        try {
          const outcome = await api.changePassword(input);
          if (outcome === 'otp-required') {
            patchState(store, { status: 'idle', otpRequired: true });
            return 'otp-required';
          }
          // Toutes les sessions sont révoquées : on rouvre la nôtre avec le nouveau mot de passe.
          session.clear();
          const signedIn = await login.login({
            email: input.email,
            password: input.newPassword,
            rememberMe: false,
          });
          if (signedIn.kind === 'otp-required') {
            patchState(store, { status: 'idle' });
            return 'relogin';
          }
          session.signIn(signedIn.user);
          patchState(store, { status: 'idle' });
          return 'signed-in';
        } catch (error) {
          const problem = asProblem(error);
          const lockedUntil =
            problem.status === 423
              ? Date.now() + (problem.retryAfterSeconds ?? DEFAULT_LOCK_SECONDS) * 1000
              : null;
          patchState(store, { status: 'idle', problem, lockedUntil });
          return 'failed';
        }
      },

      /** Le compte à rebours est fini : le bouton redevient actif. */
      unlock(): void {
        patchState(store, { lockedUntil: null, problem: null });
      },
    }),
  ),
);
