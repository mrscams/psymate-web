import { computed, effect, inject, untracked } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';

import { asProblem } from '../../../core/http';
import { failed, idle, Loadable, loaded, loading } from '../../../shared/util';
import { PatientShellStore } from '../../patient-shell';
import { OverviewApi } from './overview.api';
import { OverviewView, OverviewWindow } from './overview.model';

interface OverviewState {
  patientId: string | null;
  window: OverviewWindow;
  /** La synthèse lue ; gardée pendant une relecture (planche 29 : jamais vidée). */
  overview: Loadable<OverviewView>;
}

const initialState: OverviewState = {
  patientId: null,
  window: '90d',
  overview: idle(),
};

/**
 * La vue d'ensemble d'un patient (fiche 02, B4 écran 2, handbook §6.5) : une projection lue par
 * GET /api/patients/{id}/overview?window=, jamais recalculée ici. Fournie par la page de l'onglet 1.
 * - `load(patientId, window)` : la fenêtre vient de la préférence overview.window ;
 * - après toute écriture faite depuis le dossier (PatientShellStore.revision : entrée enregistrée,
 *   séance démarrée ou clôturée), la synthèse est relue ;
 * - `refresh()` : « Réessayer » d'un bloc en erreur et « Recalculer » d'une synthèse ancienne.
 * Une réponse arrivée après une autre demande (autre patient, autre fenêtre) est ignorée.
 */
export const OverviewStore = signalStore(
  withState(initialState),
  withComputed((store) => ({
    view: computed(() => store.overview().data),
    /** Une relecture est en cours alors que la synthèse précédente reste affichée. */
    refreshing: computed(
      () => store.overview().status === 'loading' && store.overview().data !== null,
    ),
  })),
  withMethods((store, api = inject(OverviewApi)) => {
    let sequence = 0;

    async function fetch(patientId: string, window: OverviewWindow): Promise<void> {
      const seq = ++sequence;
      patchState(store, { overview: loading(store.overview()) });
      try {
        const view = await api.overview(patientId, window);
        if (seq === sequence) patchState(store, { overview: loaded(view) });
      } catch (error) {
        if (seq === sequence) {
          patchState(store, { overview: failed(asProblem(error), store.overview()) });
        }
      }
    }

    return {
      /**
       * Lit la synthèse du patient pour la fenêtre. Même patient et même fenêtre déjà lus ou en
       * cours : rien. Autre patient : l'affichage repart de zéro ; autre fenêtre : la synthèse
       * précédente reste affichée pendant la lecture.
       */
      load(patientId: string, window: OverviewWindow): Promise<void> {
        const same = store.patientId() === patientId && store.window() === window;
        const status = store.overview().status;
        if (same && (status === 'loading' || status === 'loaded')) return Promise.resolve();
        if (store.patientId() !== patientId) {
          patchState(store, { ...initialState, patientId, window });
        } else {
          patchState(store, { window });
        }
        return fetch(patientId, window);
      },

      /** Relit la synthèse courante (après une écriture, « Réessayer », « Recalculer »). */
      refresh(): Promise<void> {
        const patientId = store.patientId();
        if (!patientId) return Promise.resolve();
        return fetch(patientId, store.window());
      },
    };
  }),
  withHooks({
    onInit(store, shell = inject(PatientShellStore)) {
      // Relecture après écriture : le shell compte les écritures faites depuis le dossier.
      let seen = untracked(() => shell.revision());
      effect(() => {
        const revision = shell.revision();
        if (revision === seen) return;
        seen = revision;
        untracked(() => void store.refresh());
      });
    },
  }),
);

export type OverviewStore = InstanceType<typeof OverviewStore>;
