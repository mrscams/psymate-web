import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

import { ApiProblem, asProblem } from '../../../core/http';
import { failed, idle, Loadable, loaded, loading } from '../../../shared/util';
import { AdminApi } from './admin.api';
import {
  EditableKind,
  FixedVocabulary,
  VocabularyCreateInput,
  VocabularyEntry,
  VocabularyPatch,
} from './admin.model';

interface VocabularyState {
  entries: Loadable<VocabularyEntry[]>;
  fixed: Loadable<FixedVocabulary>;
}

const initialState: VocabularyState = { entries: idle(), fixed: idle() };

/**
 * Vocabulaire de l'annuaire (fiche 28, G Q15) : spécialités et publics éditables, modalités et
 * langues en lecture seule. Après chaque écriture, la liste est relue depuis le serveur (fiche 28 :
 * « la liste est rechargée depuis GET /api/admin/vocabulary/directory »). Fourni par la page.
 */
export const VocabularyStore = signalStore(
  withState(initialState),
  withComputed((store) => ({
    specialties: computed(() =>
      (store.entries().data ?? []).filter((entry) => entry.kind === 'specialty'),
    ),
    audiences: computed(() =>
      (store.entries().data ?? []).filter((entry) => entry.kind === 'audience'),
    ),
  })),
  withMethods((store, api = inject(AdminApi)) => {
    let request = 0;

    async function reload(): Promise<void> {
      const ticket = ++request;
      patchState(store, { entries: loading(store.entries()) });
      try {
        const entries = await api.vocabulary();
        if (ticket === request) patchState(store, { entries: loaded(entries) });
      } catch (error) {
        if (ticket === request) {
          patchState(store, { entries: failed(asProblem(error), store.entries()) });
        }
      }
    }

    async function loadFixed(): Promise<void> {
      patchState(store, { fixed: loading(store.fixed()) });
      try {
        patchState(store, { fixed: loaded(await api.fixedVocabulary()) });
      } catch (error) {
        patchState(store, { fixed: failed(asProblem(error), store.fixed()) });
      }
    }

    async function write(action: () => Promise<unknown>): Promise<ApiProblem | null> {
      try {
        await action();
      } catch (error) {
        return asProblem(error);
      }
      await reload();
      return null;
    }

    return {
      reload,
      loadFixed,

      async load(): Promise<void> {
        await Promise.all([reload(), loadFixed()]);
      },

      /** POST : null si créée ; sinon 409 VOCABULARY_EXISTS ou 422 pour le formulaire. */
      create(input: VocabularyCreateInput): Promise<ApiProblem | null> {
        return write(() => api.createEntry(input));
      },

      /** PATCH partiel (renommer, ordre) ; null si fait. */
      update(kind: EditableKind, code: string, patch: VocabularyPatch): Promise<ApiProblem | null> {
        return write(() => api.patchEntry(kind, code, patch));
      },

      /** Désactiver ou réactiver ; 409 VOCABULARY_IN_USE (avec le compteur) si l'entrée est publiée. */
      setActive(kind: EditableKind, code: string, active: boolean): Promise<ApiProblem | null> {
        return write(() => api.patchEntry(kind, code, { active }));
      },
    };
  }),
);
