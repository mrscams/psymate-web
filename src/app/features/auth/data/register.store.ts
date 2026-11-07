import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

import { ApiProblem, asProblem } from '../../../core/http';
import { RegisterApi, RegisterInput } from './register.api';

interface RegisterState {
  status: 'idle' | 'submitting' | 'sent';
  /** 422 (champs, politique de mot de passe) ou erreur réseau ; la page relie errors[] aux champs. */
  problem: ApiProblem | null;
}

const initialState: RegisterState = { status: 'idle', problem: null };

/** État de l'écran d'inscription (fourni par la page). */
export const RegisterStore = signalStore(
  withState(initialState),
  withMethods((store, api = inject(RegisterApi)) => ({
    /** Envoie l'inscription ; vrai sur 201 (la page va à /confirmer-email), faux sinon (problem). */
    async submit(input: RegisterInput): Promise<boolean> {
      patchState(store, { status: 'submitting', problem: null });
      try {
        await api.register(input);
        patchState(store, { status: 'sent' });
        return true;
      } catch (error) {
        patchState(store, { status: 'idle', problem: asProblem(error) });
        return false;
      }
    },
  })),
);

interface PasswordResetState {
  status: 'idle' | 'submitting' | 'sent';
  problem: ApiProblem | null;
}

/** État de l'écran « mot de passe oublié » (fourni par la page). */
export const PasswordResetStore = signalStore(
  withState<PasswordResetState>({ status: 'idle', problem: null }),
  withMethods((store, api = inject(RegisterApi)) => ({
    /** 202 dans tous les cas : l'écran dit « si un compte existe, un e-mail est parti ». */
    async request(email: string): Promise<boolean> {
      patchState(store, { status: 'submitting', problem: null });
      try {
        await api.requestPasswordReset(email);
        patchState(store, { status: 'sent' });
        return true;
      } catch (error) {
        patchState(store, { status: 'idle', problem: asProblem(error) });
        return false;
      }
    },
  })),
);
