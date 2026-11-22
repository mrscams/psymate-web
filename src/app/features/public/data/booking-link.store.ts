import { DestroyRef, inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

import { ApiProblem, asProblem } from '../../../core/http';
import { failed, idle, Loadable, loaded, loading } from '../../../shared/util';
import { BookingApi } from './booking.api';
import { PublicAppointment } from './booking.models';

/**
 * Issue d'une annulation par le lien de gestion, pour l'écran (l'état du message est de l'état
 * d'écran, fiche 32) : `cancelled` : 200, l'état a été relu ; `too-late` : 409
 * APPOINTMENT_NOT_ACTIVE, l'état a été relu ; `rate-limited` : 429 ; `link-invalid` : 404
 * BOOKING_TOKEN_INVALID ou 422 sur le jeton ; `error` : réseau, 5xx ; `cancelled-page` : la page a
 * été quittée, rien n'est à écrire.
 */
export type CancelOutcome =
  'cancelled' | 'too-late' | 'rate-limited' | 'link-invalid' | 'error' | 'cancelled-page';

export interface CancelResult {
  outcome: CancelOutcome;
  problem: ApiProblem | null;
}

interface BookingLinkState {
  /** Réponse de POST …/requests/verify (page /rendez-vous/confirmer/:token). */
  verification: Loadable<PublicAppointment>;
  /** Réponse de POST …/manage (page /rendez-vous/gerer/:token). */
  managed: Loadable<PublicAppointment>;
}

const initialState: BookingLinkState = {
  verification: idle<PublicAppointment>(),
  managed: idle<PublicAppointment>(),
};

/**
 * Pages par lien de la prise de rendez-vous (fiche 32) : `verification` et `managed`, chacun avec
 * ses trois états. Le jeton n'est jamais gardé ici : la page le lit dans son chemin et le passe à
 * chaque appel, qui l'envoie dans le corps de la requête (G Q62). Après une annulation, l'état est
 * relu par POST …/manage, jamais corrigé localement. Fourni par chaque page, détruit avec elle.
 */
export const BookingLinkStore = signalStore(
  withState(initialState),
  withMethods((store, api = inject(BookingApi)) => {
    let destroyed = false;
    let verifyRequest = 0;
    let manageRequest = 0;
    inject(DestroyRef).onDestroy(() => {
      destroyed = true;
      verifyRequest++;
      manageRequest++;
    });

    /** POST …/manage ; `keep` : l'état affiché reste pendant la relecture (après une annulation). */
    async function readManaged(token: string, keep: boolean): Promise<void> {
      const request = ++manageRequest;
      if (!keep) patchState(store, { managed: loading<PublicAppointment>() });
      try {
        const appointment = await api.manage(token);
        if (request !== manageRequest) return;
        patchState(store, { managed: loaded(appointment) });
      } catch (error) {
        if (request !== manageRequest) return;
        patchState(store, { managed: failed<PublicAppointment>(asProblem(error)) });
      }
    }

    return {
      /** POST …/requests/verify, une fois par affichage (et par « Réessayer »). */
      async verify(token: string): Promise<void> {
        const request = ++verifyRequest;
        patchState(store, { verification: loading<PublicAppointment>() });
        try {
          const appointment = await api.verify(token);
          if (request !== verifyRequest) return;
          patchState(store, { verification: loaded(appointment) });
        } catch (error) {
          if (request !== verifyRequest) return;
          patchState(store, { verification: failed<PublicAppointment>(asProblem(error)) });
        }
      },

      /** POST …/manage : état du rendez-vous (chargement, puis « Réessayer »). */
      loadManaged(token: string): Promise<void> {
        return readManaged(token, false);
      },

      /**
       * POST …/manage/cancel, puis relecture de l'état par POST …/manage (200 et 409). Les autres
       * échecs laissent l'état affiché tel quel ; l'écran dit ce qui s'est passé.
       */
      async cancel(token: string): Promise<CancelResult> {
        try {
          await api.cancel(token);
        } catch (error) {
          const problem = asProblem(error);
          if (destroyed) return { outcome: 'cancelled-page', problem };
          if (problem.status === 409) {
            await readManaged(token, true);
            return { outcome: 'too-late', problem };
          }
          const outcome: CancelOutcome =
            problem.status === 429
              ? 'rate-limited'
              : problem.status === 404 || problem.status === 422
                ? 'link-invalid'
                : 'error';
          return { outcome, problem };
        }
        if (destroyed) return { outcome: 'cancelled-page', problem: null };
        await readManaged(token, true);
        return { outcome: 'cancelled', problem: null };
      },
    };
  }),
);
