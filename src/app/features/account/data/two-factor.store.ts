import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

import { SessionStore } from '../../../core/auth';
import { asProblem } from '../../../core/http';
import { failed, idle, Loadable, loaded, loading } from '../../../shared/util';
import { GUARDED_BUSY, GUARDED_IDLE, GuardedAction, guardedFailure } from './lock';
import { SecurityApi, TwoFactorEnrollment } from './security.api';

/** Les trois étapes du panneau d'activation (fiche 18 B). */
export type TwoFactorStep = 'scan' | 'code' | 'codes';

interface TwoFactorState {
  /** Secret en attente (POST enable) : chargé à l'ouverture, abandonné à la fermeture. */
  enrollment: Loadable<TwoFactorEnrollment>;
  step: TwoFactorStep;
  verification: GuardedAction;
  /** Codes de secours reçus de verify ou de regenerate : montrés une seule fois. */
  recoveryCodes: Loadable<string[]>;
  disabling: GuardedAction;
}

const initialState: TwoFactorState = {
  enrollment: idle(),
  step: 'scan',
  verification: GUARDED_IDLE,
  recoveryCodes: idle(),
  disabling: GUARDED_IDLE,
};

/**
 * Activation, régénération et désactivation de la double authentification (fiche 18), fournie par
 * le composant qui l'affiche : le secret et les codes ne vivent que le temps du panneau. Après
 * verify ou disable, la session (GET /api/auth/me) est relue pour que twoFactorEnabled suive.
 */
export const TwoFactorStore = signalStore(
  withState(initialState),
  withComputed(({ enrollment, recoveryCodes }) => ({
    secret: computed(() => enrollment().data?.secret ?? ''),
    otpauthUri: computed(() => enrollment().data?.otpauthUri ?? ''),
    codes: computed(() => recoveryCodes().data ?? []),
  })),
  withMethods((store, api = inject(SecurityApi), session = inject(SessionStore)) => ({
    /** Étape 1 : POST /api/me/2fa/enable (rappeler remplace le secret en attente). */
    async start(): Promise<void> {
      patchState(store, { enrollment: loading(), step: 'scan', verification: GUARDED_IDLE });
      try {
        patchState(store, { enrollment: loaded(await api.enableTwoFactor()) });
      } catch (error) {
        patchState(store, { enrollment: failed(asProblem(error)) });
      }
    },

    goTo(step: TwoFactorStep): void {
      patchState(store, { step });
    },

    /** Étape 2 : POST verify ; vrai si la 2FA est active (codes à l'étape 3), faux sinon. */
    async verify(code: string): Promise<boolean> {
      patchState(store, { verification: GUARDED_BUSY });
      try {
        const codes = await api.verifyTwoFactor(code);
        patchState(store, {
          verification: GUARDED_IDLE,
          recoveryCodes: loaded(codes),
          step: 'codes',
          // Le secret n'est plus affiché une fois vérifié.
          enrollment: idle(),
        });
        await session.load();
        return true;
      } catch (error) {
        patchState(store, { verification: guardedFailure(asProblem(error)) });
        return false;
      }
    },

    /** Régénère les codes (les anciens cessent de fonctionner, le serveur le dit : 200). */
    async regenerate(): Promise<void> {
      patchState(store, { recoveryCodes: loading(), step: 'codes' });
      try {
        patchState(store, { recoveryCodes: loaded(await api.regenerateRecoveryCodes()) });
      } catch (error) {
        patchState(store, { recoveryCodes: failed(asProblem(error)) });
      }
    },

    /** POST disable (mot de passe + code) ; vrai sur 204, la session est alors relue. */
    async disable(password: string, code: string): Promise<boolean> {
      patchState(store, { disabling: GUARDED_BUSY });
      try {
        await api.disableTwoFactor(password, code);
        patchState(store, { disabling: GUARDED_IDLE });
        await session.load();
        return true;
      } catch (error) {
        patchState(store, { disabling: guardedFailure(asProblem(error)) });
        return false;
      }
    },

    /** Fin du compte à rebours d'un 423 : les boutons redeviennent actifs. */
    unlock(): void {
      patchState(store, { verification: GUARDED_IDLE, disabling: GUARDED_IDLE });
    },

    /** Fermeture du panneau : le secret en attente et les codes sont oubliés. */
    reset(): void {
      patchState(store, initialState);
    },
  })),
);
