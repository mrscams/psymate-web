import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

import { asProblem } from '../../../core/http';
import { failed, idle, Loadable, loaded, loading } from '../../../shared/util';
import { DirectoryApi } from './directory.api';
import { DirectoryVocabulary } from './directory.models';

interface VocabularyState {
  vocabulary: Loadable<DirectoryVocabulary>;
}

/**
 * Listes fermées de l'annuaire (GET /api/public/directory/vocabulary, M10-01, sans session) :
 * codes des filtres et libellés FR/EN des spécialités, publics, modalités et langues. Fourni à la
 * racine : chargé une fois, partagé par l'annuaire et la fiche, gardé d'une page à l'autre.
 */
export const VocabularyStore = signalStore(
  { providedIn: 'root' },
  withState<VocabularyState>({ vocabulary: idle<DirectoryVocabulary>() }),
  withComputed(({ vocabulary }) => ({
    /** Les listes, ou null tant qu'elles ne sont pas arrivées (ou si l'appel a échoué). */
    lists: computed(() => vocabulary().data),
  })),
  withMethods((store, api = inject(DirectoryApi)) => {
    let pending: Promise<void> | null = null;
    return {
      /** Charge les listes si elles ne le sont pas déjà ; un seul appel à la fois. */
      ensureLoaded(): Promise<void> {
        if (store.vocabulary().status === 'loaded') return Promise.resolve();
        pending ??= (async () => {
          patchState(store, { vocabulary: loading(store.vocabulary()) });
          try {
            patchState(store, { vocabulary: loaded(await api.vocabulary()) });
          } catch (error) {
            patchState(store, { vocabulary: failed(asProblem(error), store.vocabulary()) });
          } finally {
            pending = null;
          }
        })();
        return pending;
      },
    };
  }),
);
