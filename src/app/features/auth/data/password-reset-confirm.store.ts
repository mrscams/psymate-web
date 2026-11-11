import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

import { ApiProblem, asProblem } from '../../../core/http';
import { RegisterApi } from './register.api';

/** Issue de l'étape 2 : remplacé (204), lien expiré ou consommé (410), autre refus (problem). */
export type PasswordResetOutcome = 'done' | 'expired' | 'error';

interface PasswordResetConfirmState {
  status: 'idle' | 'submitting' | 'done' | 'expired';
  /** 422 (PASSWORD_POLICY, champ password) ou erreur réseau ; null après un 410 (état expired). */
  problem: ApiProblem | null;
}

/** État de l'étape 2 du mot de passe oublié (fiche 26), fourni par la page. */
export const PasswordResetConfirmStore = signalStore(
  withState<PasswordResetConfirmState>({ status: 'idle', problem: null }),
  withMethods((store, api = inject(RegisterApi)) => ({
    /** Envoie le nouveau mot de passe avec le jeton du lien. */
    async confirmReset(token: string, password: string): Promise<PasswordResetOutcome> {
      patchState(store, { status: 'submitting', problem: null });
      try {
        await api.confirmPasswordReset(token, password);
        patchState(store, { status: 'done' });
        return 'done';
      } catch (error) {
        const problem = asProblem(error);
        if (problem.status === 410) {
          patchState(store, { status: 'expired', problem: null });
          return 'expired';
        }
        patchState(store, { status: 'idle', problem });
        return 'error';
      }
    },
    /** Lien sans jeton : même page que le 410, sans appel. */
    markExpired(): void {
      patchState(store, { status: 'expired', problem: null });
    },
  })),
);
