import { computed, inject } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';

import { ApiProblem, asProblem } from '../../../core/http';
import { failed, idle, Loadable, loaded, loading } from '../../../shared/util';
import { DirectoryVocabulary, Profile, ProfileApi, ProfileFields } from './profile.api';

/** Délai d'inactivité avant l'enregistrement automatique (fiche 10). */
export const AUTOSAVE_DELAY_MS = 800;

/**
 * État de l'enregistrement automatique : `pending` (modification en attente des 800 ms),
 * `saving` (PUT en vol), `saved` (dernier PUT réussi), `error` (dernier PUT refusé ou perdu).
 */
export type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export interface AutosaveState {
  status: AutosaveStatus;
  /** Horodatage (ms) du dernier enregistrement réussi. */
  savedAt: number | null;
  problem: ApiProblem | null;
}

/** Ce qui manque pour publier (409 PROFILE_INCOMPLETE, missing[] du contrat, dans son ordre). */
export type MissingItem =
  'verification' | 'displayName' | 'profession' | 'city' | 'contact' | 'specialties' | 'audiences';

const MISSING_ITEMS: readonly MissingItem[] = [
  'verification',
  'displayName',
  'profession',
  'city',
  'contact',
  'specialties',
  'audiences',
];

export interface PublicationState {
  status: 'idle' | 'busy' | 'error';
  problem: ApiProblem | null;
  /** Lignes à corriger renvoyées par le serveur au dernier refus (vide sinon). */
  missing: MissingItem[];
}

export interface PhotoState {
  status: 'idle' | 'busy' | 'error';
  problem: ApiProblem | null;
}

interface ProfileState {
  profile: Loadable<Profile>;
  vocabulary: Loadable<DirectoryVocabulary>;
  autosave: AutosaveState;
  publication: PublicationState;
  photo: PhotoState;
}

const initialState: ProfileState = {
  profile: idle(),
  vocabulary: idle(),
  autosave: { status: 'idle', savedAt: null, problem: null },
  publication: { status: 'idle', problem: null, missing: [] },
  photo: { status: 'idle', problem: null },
};

/**
 * État serveur de l'écran « Mon profil public » (fiche 10, fourni par la page) : le profil, la liste
 * fermée de l'annuaire, l'enregistrement automatique (PUT complet 800 ms après la dernière
 * modification, un seul PUT en vol, le plus récent gagne), la publication (409 détaillé) et la photo.
 * Le formulaire reste l'état d'écran du composant : le store ne le réécrit jamais après le chargement.
 */
export const ProfileStore = signalStore(
  withState(initialState),
  withComputed(({ profile, autosave, publication }) => ({
    data: computed(() => profile().data),
    published: computed(() => profile().data?.published ?? false),
    slug: computed(() => profile().data?.slug ?? ''),
    hasPhoto: computed(() => profile().data?.hasPhoto ?? false),
    saving: computed(() => autosave().status === 'saving'),
    publishing: computed(() => publication().status === 'busy'),
  })),
  withMethods((store, api = inject(ProfileApi)) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    /** Dernière version du formulaire pas encore envoyée. */
    let pending: ProfileFields | null = null;
    /** Version refusée par le dernier PUT, renvoyée par « Réessayer ». */
    let failedBody: ProfileFields | null = null;
    /** Les PUT s'enchaînent : jamais deux en vol, l'ordre des modifications est conservé. */
    let chain: Promise<boolean> = Promise.resolve(true);

    function clearTimer(): void {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    }

    async function sendPending(): Promise<boolean> {
      if (pending === null) return store.autosave().status !== 'error';
      const body = pending;
      pending = null;
      patchState(store, { autosave: { ...store.autosave(), status: 'saving', problem: null } });
      try {
        const saved = await api.save(body);
        failedBody = null;
        patchState(store, {
          profile: loaded(saved),
          autosave: {
            // Une modification arrivée pendant le PUT attend son tour : l'état reste « en attente ».
            status: pending !== null ? 'pending' : 'saved',
            savedAt: Date.now(),
            problem: null,
          },
        });
        return true;
      } catch (error) {
        failedBody = body;
        patchState(store, {
          autosave: { ...store.autosave(), status: 'error', problem: asProblem(error) },
        });
        return false;
      }
    }

    /** Envoie tout de suite ce qui attend ; résout à faux si le dernier PUT a échoué. */
    function flush(): Promise<boolean> {
      clearTimer();
      chain = chain.then(sendPending, sendPending);
      return chain;
    }

    async function reloadProfile(): Promise<void> {
      patchState(store, { profile: loading(store.profile()) });
      try {
        patchState(store, { profile: loaded(await api.load()) });
      } catch (error) {
        patchState(store, { profile: failed(asProblem(error), store.profile()) });
      }
    }

    async function loadVocabulary(): Promise<void> {
      patchState(store, { vocabulary: loading(store.vocabulary()) });
      try {
        patchState(store, { vocabulary: loaded(await api.vocabulary()) });
      } catch (error) {
        patchState(store, { vocabulary: failed(asProblem(error), store.vocabulary()) });
      }
    }

    return {
      /** GET /api/me/profile et GET /api/vocabulary/directory, en parallèle. */
      async load(): Promise<void> {
        await Promise.all([reloadProfile(), loadVocabulary()]);
      },

      loadVocabulary,

      /**
       * Une modification du formulaire (déjà valide côté client) : le PUT part 800 ms après la
       * dernière, avec le contenu complet le plus récent.
       */
      edit(fields: ProfileFields): void {
        pending = fields;
        failedBody = null;
        patchState(store, { autosave: { ...store.autosave(), status: 'pending', problem: null } });
        clearTimer();
        timer = setTimeout(() => {
          timer = null;
          void flush();
        }, AUTOSAVE_DELAY_MS);
      },

      flush,

      /** « Erreur, réessayer » : renvoie la dernière version refusée (ou celle en attente). */
      retrySave(): Promise<boolean> {
        if (pending === null && failedBody !== null) pending = failedBody;
        return flush();
      },

      /**
       * POST publish, après avoir envoyé la dernière saisie : le serveur juge la complétude sur ce
       * qu'il a. 409 PROFILE_INCOMPLETE → missing[] gardé pour les lignes à corriger. Succès → le
       * profil est relu (jamais de `published = true` calculé localement).
       */
      async publishProfile(): Promise<boolean> {
        patchState(store, { publication: { status: 'busy', problem: null, missing: [] } });
        if (!(await flush())) {
          patchState(store, {
            publication: { status: 'error', problem: store.autosave().problem, missing: [] },
          });
          return false;
        }
        try {
          await api.publish();
        } catch (error) {
          const problem = asProblem(error);
          patchState(store, {
            publication: { status: 'error', problem, missing: missingOf(problem) },
          });
          return false;
        }
        await reloadProfile();
        patchState(store, { publication: { status: 'idle', problem: null, missing: [] } });
        return true;
      },

      /** POST unpublish puis relecture du profil. */
      async unpublishProfile(): Promise<boolean> {
        patchState(store, { publication: { status: 'busy', problem: null, missing: [] } });
        try {
          await api.unpublish();
        } catch (error) {
          patchState(store, {
            publication: { status: 'error', problem: asProblem(error), missing: [] },
          });
          return false;
        }
        await reloadProfile();
        patchState(store, { publication: { status: 'idle', problem: null, missing: [] } });
        return true;
      },

      /** Oublie le dernier refus de publication (l'utilisateur referme le message). */
      clearPublicationProblem(): void {
        patchState(store, { publication: { status: 'idle', problem: null, missing: [] } });
      },

      /** POST photo (déjà recadrée par l'écran) ; la réponse est le profil à jour. */
      async uploadPhoto(photo: Blob): Promise<boolean> {
        patchState(store, { photo: { status: 'busy', problem: null } });
        try {
          const profile = await api.uploadPhoto(photo);
          patchState(store, { profile: loaded(profile), photo: { status: 'idle', problem: null } });
          return true;
        } catch (error) {
          patchState(store, { photo: { status: 'error', problem: asProblem(error) } });
          return false;
        }
      },

      /** DELETE photo puis relecture du profil. */
      async removePhoto(): Promise<boolean> {
        patchState(store, { photo: { status: 'busy', problem: null } });
        try {
          await api.deletePhoto();
        } catch (error) {
          patchState(store, { photo: { status: 'error', problem: asProblem(error) } });
          return false;
        }
        await reloadProfile();
        patchState(store, { photo: { status: 'idle', problem: null } });
        return true;
      },

      /** Quitter l'écran : la saisie en attente part tout de suite (pas de perte sous 800 ms). */
      _leave(): void {
        if (timer !== null || pending !== null) void flush();
      },
    };
  }),
  withHooks({
    onDestroy(store) {
      store._leave();
    },
  }),
);

/** missing[] d'un 409 PROFILE_INCOMPLETE, limité aux éléments connus du contrat, dans leur ordre. */
export function missingOf(problem: ApiProblem): MissingItem[] {
  if (problem.status !== 409 || problem.code !== 'PROFILE_INCOMPLETE') return [];
  const raw = problem.extra?.['missing'];
  if (!Array.isArray(raw)) return [];
  return MISSING_ITEMS.filter((item) => raw.includes(item));
}
