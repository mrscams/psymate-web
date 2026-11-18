import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

import { ApiProblem, asProblem } from '../../../core/http';
import { failed, idle, Loadable, loaded, loading } from '../../../shared/util';
import { Profile360Api } from './profile360.api';
import {
  createBody,
  groupByCategory,
  PROFILE_CATEGORIES,
  ProfileCategory,
  ProfileGroups,
  ProfileItem,
  ProfileItemInput,
  updateBody,
} from './profile360.model';

/**
 * Issue d'une écriture (fiche 30, Interactions) :
 * - `done` : écrite, puis profil relu ; `unchanged` : rien à envoyer (modification sans changement) ;
 * - `invalid` : 422 avec errors[] (messages sous les champs) ; `limit` : 422
 *   PROFILE_ITEM_LIMIT_REACHED (message dans le panneau) ;
 * - `gone` : 404 PROFILE_ITEM_NOT_FOUND ou 409 PROFILE_ITEM_ARCHIVED, information retirée
 *   entre-temps : profil relu ;
 * - `archived` : 409 PATIENT_ARCHIVED, l'onglet passe en lecture seule ;
 * - `failed` : le reste (réseau, 5xx, 403) ; le panneau garde la saisie.
 */
export type WriteOutcome =
  | { status: 'done' | 'unchanged' | 'gone' | 'archived' }
  | { status: 'invalid' | 'limit' | 'failed'; problem: ApiProblem };

interface Profile360State {
  patientId: string | null;
  /** Le profil lu ; gardé pendant une relecture (planche 29 : jamais vidé). */
  profile: Loadable<ProfileItem[]>;
  /** Une écriture est en cours (bouton principal et « Retirer » inactifs). */
  saving: boolean;
  /**
   * 409 PATIENT_ARCHIVED reçu à l'écriture : le patient a été archivé ailleurs, l'onglet passe en
   * lecture seule (l'archivage connu au chargement vient du dossier, PatientShellStore.archived).
   */
  archivedOnWrite: boolean;
}

const initialState: Profile360State = {
  patientId: null,
  profile: idle(),
  saving: false,
  archivedOnWrite: false,
};

/** Range un refus d'écriture dans les issues de la fiche 30. */
export function writeOutcome(problem: ApiProblem): WriteOutcome {
  if (problem.code === 'PATIENT_ARCHIVED') return { status: 'archived' };
  if (problem.code === 'PROFILE_ITEM_NOT_FOUND' || problem.code === 'PROFILE_ITEM_ARCHIVED') {
    return { status: 'gone' };
  }
  if (problem.status === 422 && problem.code === 'PROFILE_ITEM_LIMIT_REACHED') {
    return { status: 'limit', problem };
  }
  if (problem.status === 422 && (problem.errors?.length ?? 0) > 0) {
    return { status: 'invalid', problem };
  }
  return { status: 'failed', problem };
}

const NO_GROUPS: ProfileGroups = groupByCategory([]);

/**
 * Le Profil 360 d'un patient (fiche 30, G Q55) : un seul GET /api/patients/{id}/profile-items charge
 * tout l'onglet. Le store range les informations par rubrique et les compte, sans jamais les
 * retrier : l'ordre est celui du serveur (rubrique, puis année et création dans Histoire et
 * souvenirs, création ailleurs). Fourni par la page de l'onglet 4.
 * - `load(patientId)` : rien si ce patient est déjà lu ou en cours de lecture ;
 * - `refresh()` : « Réessayer » d'un profil en erreur ;
 * - `create`, `update`, `remove` (M13-07, G Q54) : l'écriture, puis la relecture du profil, jamais
 *   une correction locale de la liste (G Q55) ; elles renvoient une issue (WriteOutcome).
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

    /** Une écriture, puis la relecture du profil (succès, ou information retirée entre-temps). */
    async function write(send: (patientId: string) => Promise<void>): Promise<WriteOutcome> {
      const patientId = store.patientId();
      if (!patientId || store.saving()) return { status: 'unchanged' };
      patchState(store, { saving: true });
      let outcome: WriteOutcome;
      try {
        await send(patientId);
        outcome = { status: 'done' };
      } catch (error) {
        outcome = writeOutcome(asProblem(error));
      }
      if (outcome.status === 'archived') patchState(store, { archivedOnWrite: true });
      if (outcome.status === 'done' || outcome.status === 'gone') await fetch(patientId);
      patchState(store, { saving: false });
      return outcome;
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

      /** POST …/profile-items, puis relecture. */
      create(input: ProfileItemInput): Promise<WriteOutcome> {
        return write((patientId) => api.create(patientId, createBody(input)));
      },

      /** PATCH …/profile-items/{itemId} avec les seuls champs modifiés, puis relecture. */
      update(item: ProfileItem, input: ProfileItemInput): Promise<WriteOutcome> {
        const body = updateBody(item, input);
        if (Object.keys(body).length === 0) return Promise.resolve({ status: 'unchanged' });
        return write((patientId) => api.update(patientId, item.id, body));
      },

      /** DELETE …/profile-items/{itemId} (retrait sans annulation), puis relecture. */
      remove(item: ProfileItem): Promise<WriteOutcome> {
        return write((patientId) => api.remove(patientId, item.id));
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
