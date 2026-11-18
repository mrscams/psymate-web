import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

import { asProblem } from '../../../core/http';
import { failed, idle, Loadable, loaded, loading } from '../../../shared/util';
import { Profile360Api } from './profile360.api';
import {
  groupByCategory,
  PROFILE_CATEGORIES,
  ProfileCategory,
  ProfileGroups,
  ProfileItem,
} from './profile360.model';

interface Profile360State {
  patientId: string | null;
  /** Le profil lu ; gardé pendant une relecture (planche 29 : jamais vidé). */
  profile: Loadable<ProfileItem[]>;
}

const initialState: Profile360State = {
  patientId: null,
  profile: idle(),
};

const NO_GROUPS: ProfileGroups = groupByCategory([]);

/**
 * Le Profil 360 d'un patient (fiche 30, G Q55) : un seul GET /api/patients/{id}/profile-items charge
 * tout l'onglet. Le store range les informations par rubrique et les compte, sans jamais les
 * retrier : l'ordre est celui du serveur (rubrique, puis année et création dans Histoire et
 * souvenirs, création ailleurs). Fourni par la page de l'onglet 4.
 * - `load(patientId)` : rien si ce patient est déjà lu ou en cours de lecture ;
 * - `refresh()` : « Réessayer » d'un profil en erreur (et, avec M13-07, relecture après écriture).
 * Une réponse arrivée après une autre demande (autre patient, relecture) est ignorée.
 */
export const Profile360Store = signalStore(
  withState(initialState),
  withComputed((store) => {
    const groups = computed<ProfileGroups>(() => {
      const items = store.profile().data;
      return items ? groupByCategory(items) : NO_GROUPS;
    });
    return {
      items: computed(() => store.profile().data ?? []),
      /** Les informations par rubrique, chacune dans l'ordre du serveur. */
      groups,
      /** Nombre d'informations par rubrique (compteurs du menu et de l'en-tête de rubrique). */
      counts: computed(() => {
        const all = groups();
        const counts = {} as Record<ProfileCategory, number>;
        for (const category of PROFILE_CATEGORIES) counts[category] = all[category].length;
        return counts;
      }),
    };
  }),
  withMethods((store, api = inject(Profile360Api)) => {
    let sequence = 0;

    async function fetch(patientId: string): Promise<void> {
      const seq = ++sequence;
      patchState(store, { profile: loading(store.profile()) });
      try {
        const items = await api.profile(patientId);
        if (seq === sequence) patchState(store, { profile: loaded(items) });
      } catch (error) {
        if (seq === sequence) {
          patchState(store, { profile: failed(asProblem(error), store.profile()) });
        }
      }
    }

    return {
      /** Lit le profil du patient ; même patient déjà lu ou en cours : rien. */
      load(patientId: string): Promise<void> {
        const status = store.profile().status;
        if (store.patientId() === patientId && (status === 'loading' || status === 'loaded')) {
          return Promise.resolve();
        }
        if (store.patientId() !== patientId) patchState(store, { ...initialState, patientId });
        return fetch(patientId);
      },

      /** Relit le profil courant (« Réessayer »). */
      refresh(): Promise<void> {
        const patientId = store.patientId();
        if (!patientId) return Promise.resolve();
        return fetch(patientId);
      },
    };
  }),
);

export type Profile360Store = InstanceType<typeof Profile360Store>;
