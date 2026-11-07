import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

import { SessionStore, SessionUser } from '../../../core/auth';
import { ApiProblem, asProblem } from '../../../core/http/api-problem';
import { LoginApi, LoginCredentials } from './login.api';

/** Verrou par défaut si le 423 ne dit pas sa durée : 15 minutes (fiche 11). */
const DEFAULT_LOCK_SECONDS = 15 * 60;

interface LoginState {
  status: 'idle' | 'submitting';
  /** Vrai après un 202 otpRequired : le bloc « code de vérification » s'affiche. */
  otpRequired: boolean;
  problem: ApiProblem | null;
  /** Fin du verrou (423 + Retry-After), en millisecondes depuis l'époque ; null sinon. */
  lockedUntil: number | null;
}

const initialState: LoginState = {
  status: 'idle',
  otpRequired: false,
  problem: null,
  lockedUntil: null,
};

/** État de l'écran de connexion (fourni par la page, pas global). */
export const LoginStore = signalStore(
  withState(initialState),
  withMethods((store, api = inject(LoginApi), session = inject(SessionStore)) => ({
    /**
     * Envoie les identifiants. Renvoie le compte connecté (la session est alors ouverte dans
     * SessionStore), ou null : code 2FA demandé, ou erreur gardée dans `problem`.
     */
    async submit(credentials: LoginCredentials): Promise<SessionUser | null> {
      patchState(store, { status: 'submitting', problem: null });
      try {
        const outcome = await api.login(credentials);
        if (outcome.kind === 'otp-required') {
          patchState(store, { status: 'idle', otpRequired: true });
          return null;
        }
        session.signIn(outcome.user);
        patchState(store, { status: 'idle' });
        return outcome.user;
      } catch (error) {
        const problem = asProblem(error);
        const lockedUntil =
          problem.status === 423
            ? Date.now() + (problem.retryAfterSeconds ?? DEFAULT_LOCK_SECONDS) * 1000
            : null;
        patchState(store, { status: 'idle', problem, lockedUntil });
        return null;
      }
    },

    /** Le compte à rebours est fini : le bouton redevient actif. */
    unlock(): void {
      patchState(store, { lockedUntil: null, problem: null });
    },
  })),
);
