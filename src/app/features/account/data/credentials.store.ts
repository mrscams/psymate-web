import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

import { asProblem } from '../../../core/http';
import { GUARDED_BUSY, GUARDED_IDLE, GuardedAction, guardedFailure } from './lock';
import { PasswordChangeInput, SecurityApi } from './security.api';

interface PasswordChangeState {
  action: GuardedAction;
  /** Vrai après un 202 : le champ code s'affiche, le formulaire est renvoyé avec otp. */
  otpRequired: boolean;
}

/**
 * Changement de mot de passe depuis le panneau (fiche 18 A). Sur 204 le serveur a révoqué toutes
 * les sessions : la page oublie la session locale et renvoie vers /connexion.
 */
export const PasswordChangeStore = signalStore(
  withState<PasswordChangeState>({ action: GUARDED_IDLE, otpRequired: false }),
  withMethods((store, api = inject(SecurityApi)) => ({
    /** Vrai sur 204 ; faux après un 202 (code demandé) ou une erreur gardée dans `action`. */
    async submit(input: PasswordChangeInput): Promise<boolean> {
      patchState(store, { action: GUARDED_BUSY });
      try {
        const outcome = await api.changePassword(input);
        if (outcome === 'otp-required') {
          patchState(store, { action: GUARDED_IDLE, otpRequired: true });
          return false;
        }
        patchState(store, { action: GUARDED_IDLE });
        return true;
      } catch (error) {
        patchState(store, { action: guardedFailure(asProblem(error)) });
        return false;
      }
    },

    unlock(): void {
      patchState(store, { action: GUARDED_IDLE });
    },
  })),
);

interface EmailChangeState {
  action: GuardedAction;
  /** Nouvelle adresse acceptée (202) : le lien de confirmation lui a été envoyé. */
  sentTo: string | null;
}

/** Changement d'e-mail d'un compte confirmé (fiche 18 A, contrat v0.10.0, G Q49). */
export const EmailChangeStore = signalStore(
  withState<EmailChangeState>({ action: GUARDED_IDLE, sentTo: null }),
  withMethods((store, api = inject(SecurityApi)) => ({
    /** 202 → vrai (sentTo) ; 422 INVALID_PASSWORD, 423 → faux, erreur dans `action`. */
    async submit(newEmail: string, password: string): Promise<boolean> {
      patchState(store, { action: GUARDED_BUSY, sentTo: null });
      try {
        await api.changeEmail(newEmail, password);
        patchState(store, { action: GUARDED_IDLE, sentTo: newEmail });
        return true;
      } catch (error) {
        patchState(store, { action: guardedFailure(asProblem(error)) });
        return false;
      }
    },

    unlock(): void {
      patchState(store, { action: GUARDED_IDLE });
    },
  })),
);
