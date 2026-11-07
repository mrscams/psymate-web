import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

import { ApiProblem, asProblem } from '../../../core/http';
import { failed, idle, Loadable, loaded, loading } from '../../../shared/util';
import { SecurityApi, SecurityOverview } from './security.api';

interface SecurityState {
  overview: Loadable<SecurityOverview>;
  /** Identifiant de la session en cours de révocation, et l'erreur de la dernière révocation. */
  revoking: string | null;
  revokeProblem: ApiProblem | null;
  /** « Déconnecter les autres appareils » : résultat (0 compris) ou erreur. */
  revokeOthersStatus: 'idle' | 'busy' | 'error';
  revokedOthers: number | null;
  revokeOthersProblem: ApiProblem | null;
}

const initialState: SecurityState = {
  overview: idle(),
  revoking: null,
  revokeProblem: null,
  revokeOthersStatus: 'idle',
  revokedOthers: null,
  revokeOthersProblem: null,
};

/**
 * Sessions actives et connexion précédente (fiche 18, écarts M10-06), fournies par la page. Après
 * chaque révocation la liste est relue (GET /api/me/security), jamais recalculée localement.
 */
export const SecurityStore = signalStore(
  withState(initialState),
  withComputed(({ overview }) => ({
    sessions: computed(() => overview().data?.sessions ?? []),
    lastLogin: computed(() => overview().data?.lastLogin ?? null),
    otherSessions: computed(() => overview().data?.sessions.filter((s) => !s.current) ?? []),
  })),
  withMethods((store, api = inject(SecurityApi)) => {
    async function reload(): Promise<void> {
      patchState(store, { overview: loading(store.overview()) });
      try {
        patchState(store, { overview: loaded(await api.loadSecurity()) });
      } catch (error) {
        patchState(store, { overview: failed(asProblem(error), store.overview()) });
      }
    }

    return {
      /** GET /api/me/security ; la donnée précédente reste pendant le rechargement. */
      load: reload,

      /** Révoque une autre session puis relit la liste ; faux sur erreur (404, 409 CURRENT_SESSION). */
      async revokeSession(id: string): Promise<boolean> {
        patchState(store, { revoking: id, revokeProblem: null });
        try {
          await api.revokeSession(id);
          patchState(store, { revoking: null });
          await reload();
          return true;
        } catch (error) {
          patchState(store, { revoking: null, revokeProblem: asProblem(error) });
          return false;
        }
      },

      /** Déconnecte les autres appareils ; renvoie le nombre du serveur (0 compris), null sur erreur. */
      async revokeOthers(): Promise<number | null> {
        patchState(store, {
          revokeOthersStatus: 'busy',
          revokedOthers: null,
          revokeOthersProblem: null,
        });
        try {
          const revoked = await api.revokeOtherSessions();
          patchState(store, { revokeOthersStatus: 'idle', revokedOthers: revoked });
          await reload();
          return revoked;
        } catch (error) {
          patchState(store, { revokeOthersStatus: 'error', revokeOthersProblem: asProblem(error) });
          return null;
        }
      },
    };
  }),
);
